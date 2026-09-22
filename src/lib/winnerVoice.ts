import { db, type HavenDB } from "./db";
import { announcementText, spokenName } from "./announcements";
import {
  decodeAnnouncement,
  hasLocalVoice,
  isMuted,
  onMute,
  playAnnouncement,
  playLocalAnnouncement,
  stopAnnouncement,
} from "./audio";
export type VoiceState = {
  caption: string;
  speaking: boolean;
  replay: boolean;
};
export const EMPTY_VOICE: VoiceState = {
  caption: "",
  speaking: false,
  replay: false,
};
export type VoiceDiagnostic =
  | "idle"
  | "preparing"
  | "ready"
  | "personalized"
  | "local speech"
  | "caption only"
  | "muted"
  | "offline"
  | "unsafe name"
  | "already attempted"
  | "unavailable"
  | "late"
  | "cancelled";
let diagnostic: { status: VoiceDiagnostic; at?: string } = { status: "idle" };
export function voiceDiagnostic() {
  return diagnostic;
}
function report(status: VoiceDiagnostic) {
  diagnostic = { status, at: new Date().toISOString() };
}
/** Return only the allowed fields; never spread an entrant into a voice request. */
export async function savedVoiceInput(store: HavenDB, spinId: string) {
  return store.transaction("r", [store.spins, store.entries], async () => {
    const spin = await store.spins.get(spinId);
    if (!spin) return;
    const entrant = await store.entries.get(spin.entryId);
    if (!entrant) return;
    return {
      entryId: entrant.id,
      firstName: spokenName(entrant.first),
      prizeId: spin.prizeId,
    };
  });
}
export async function claimVoiceAttempt(store: HavenDB, entryId: string) {
  return store.transaction("rw", store.voiceAttempts, async () => {
    if (await store.voiceAttempts.get(entryId)) return false;
    await store.voiceAttempts.add({
      entryId,
      attemptedAt: new Date().toISOString(),
    });
    return true;
  });
}
const defaults = {
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  decode: decodeAnnouncement,
  play: playAnnouncement,
  local: playLocalAnnouncement,
  localAvailable: hasLocalVoice,
  stop: stopAnnouncement,
  muted: isMuted,
  online: () => navigator.onLine,
  hidden: () => document.hidden,
  auth: async () => (await db.device.get("device"))?.auth,
};
export type VoiceDependencies = typeof defaults;
type Session = {
  spinId?: string;
  remoteAllowed?: boolean;
  text: string;
  buffer?: AudioBuffer;
  landed: boolean;
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  requestTimer?: ReturnType<typeof setTimeout>;
};
export class WinnerVoice {
  private active?: Session;
  private state = { ...EMPTY_VOICE };
  private unsubscribe: () => void;
  constructor(
    private update: (state: VoiceState) => void,
    private deps = defaults,
  ) {
    this.unsubscribe = onMute((value) => {
      if (!value) return;
      this.active?.controller.abort();
      clearTimeout(this.active?.timer);
      this.deps.stop();
      this.publish({ ...this.state, speaking: false });
    });
  }
  private publish(state: VoiceState) {
    this.state = state;
    this.update(state);
  }
  prepare(spinId: string, prizeId: string, store: HavenDB) {
    if (this.active?.spinId === spinId) return;
    this.reset();
    const session: Session = {
      spinId,
      remoteAllowed: !this.deps.muted() && this.deps.online(),
      text:
        announcementText(prizeId) ??
        "Congratulations! Your potential prize is shown above.",
      landed: false,
      controller: new AbortController(),
    };
    this.active = session;
    // This promise is deliberately never awaited by the wheel or prize engine.
    void this.prepareAudio(session, spinId, store).catch(() => {
      if (this.active === session && !session.landed) report("unavailable");
    });
  }
  private async prepareAudio(session: Session, spinId: string, store: HavenDB) {
    const input = await savedVoiceInput(store, spinId);
    if (
      this.active !== session ||
      session.landed ||
      session.controller.signal.aborted ||
      !input
    )
      return;
    session.text =
      announcementText(input.prizeId, input.firstName) ?? session.text;
    if (!session.remoteAllowed) {
      report(this.deps.online() ? "muted" : "offline");
      return;
    }
    if (this.deps.muted()) {
      report("muted");
      return;
    }
    if (!this.deps.online()) {
      report("offline");
      return;
    }
    if (!input.firstName) {
      report("unsafe name");
      return;
    }
    const token = await this.deps.auth();
    if (
      this.active !== session ||
      session.landed ||
      session.controller.signal.aborted
    )
      return;
    if (!token) {
      report("unavailable");
      return;
    }
    if (!(await claimVoiceAttempt(store, input.entryId))) {
      report("already attempted");
      return;
    }
    if (
      this.active !== session ||
      session.landed ||
      this.deps.muted() ||
      session.controller.signal.aborted
    )
      return;
    report("preparing");
    session.requestTimer = setTimeout(() => session.controller.abort(), 6000);
    try {
      const response = await this.deps.fetch("/api/winner-voice", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entryId: input.entryId,
          firstName: input.firstName,
          prizeId: input.prizeId,
        }),
        signal: session.controller.signal,
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        throw 0;
      const raw = await response.text();
      if (raw.length > 700000) throw 0;
      const result = JSON.parse(raw);
      // Caption is exact approved server speech, never arbitrary server/provider error text.
      if (
        result.text !== session.text ||
        result.mimeType !== "audio/mpeg" ||
        typeof result.audioBase64 !== "string" ||
        result.audioBase64.length > 690000
      )
        throw 0;
      const bytes = Uint8Array.from(atob(result.audioBase64), (c) =>
        c.charCodeAt(0),
      );
      const buffer = await this.deps.decode(bytes.buffer);
      if (
        this.active !== session ||
        session.landed ||
        session.controller.signal.aborted
      )
        return;
      session.buffer = buffer;
      report("ready");
    } catch {
      if (this.active === session && !session.landed) report("unavailable");
    } finally {
      clearTimeout(session.requestTimer);
    }
  }
  land(prizeId: string) {
    const session: Session = this.active ?? {
      text:
        announcementText(prizeId) ??
        "Congratulations! Your potential prize is shown above.",
      landed: false,
      controller: new AbortController(),
    };
    if (session.landed) return;
    this.active = session;
    session.landed = true;
    session.controller.abort();
    clearTimeout(session.requestTimer);
    if (!session.buffer && diagnostic.status === "preparing") report("late");
    // Freeze the choice now. Audio arriving after reveal can never interrupt this or the next guest.
    this.publish({
      caption: session.text,
      speaking: false,
      replay: !!session.buffer || this.deps.localAvailable(),
    });
    session.timer = setTimeout(() => {
      if (this.active === session) this.play();
    }, 500);
  }
  replay() {
    if (!this.state.speaking && this.state.replay && this.active?.landed)
      this.play();
  }
  private play() {
    try {
      this.playReady();
    } catch {
      try {
        this.deps.stop();
      } catch {
        /* Silent fallback remains safe. */
      }
      if (this.active)
        this.publish({
          caption: this.active.text,
          speaking: false,
          replay: false,
        });
      report("caption only");
    }
  }
  private playReady() {
    const session = this.active;
    if (!session?.landed || this.deps.muted() || this.deps.hidden()) return;
    clearTimeout(session.timer);
    const ended = () => {
      if (this.active === session)
        this.publish({ ...this.state, speaking: false });
    };
    if (session.buffer && this.deps.play(session.buffer, ended)) {
      this.publish({ caption: session.text, speaking: true, replay: true });
      report("personalized");
      return;
    }
    const failed = () => {
      if (this.active === session) {
        this.publish({ caption: session.text, speaking: false, replay: false });
        report("caption only");
      }
    };
    if (this.deps.local(session.text, ended, failed)) {
      this.publish({ caption: session.text, speaking: true, replay: true });
      report("local speech");
    } else failed();
  }
  reset() {
    const session = this.active;
    this.active = undefined;
    if (session) {
      clearTimeout(session.timer);
      clearTimeout(session.requestTimer);
      session.controller.abort();
      session.text = "";
      session.buffer = undefined;
    }
    this.deps.stop();
    this.publish({ ...EMPTY_VOICE });
  }
  dispose() {
    this.reset();
    this.unsubscribe();
  }
}

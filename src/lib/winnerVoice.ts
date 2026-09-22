import { db, type HavenDB } from "./db";
import { announcementText, spokenName } from "./announcements";
import {
  decodeAnnouncement,
  isMuted,
  onMute,
  playAnnouncement,
  stopAnnouncement,
} from "./audio";
export type VoiceState = {
  speaking: boolean;
};
export const EMPTY_VOICE: VoiceState = {
  speaking: false,
};
export type VoiceDiagnostic =
  | "idle"
  | "preparing"
  | "ready"
  | "personalized"
  | "playback unavailable"
  | "preview only"
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
    private update: (state: VoiceState) => void = () => {},
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
      // Accept only exact approved speech, never arbitrary server/provider error text.
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
    // Never substitute a device voice for the operator's selected ElevenLabs voice.
    if (!session.spinId) report("preview only");
    session.timer = setTimeout(() => {
      if (
        this.active !== session ||
        this.deps.muted() ||
        this.deps.hidden() ||
        !session.buffer
      )
        return;
      try {
        if (
          this.deps.play(session.buffer, () => {
            if (this.active === session) this.publish({ speaking: false });
          })
        ) {
          this.publish({ speaking: true });
          report("personalized");
        } else report("playback unavailable");
      } catch {
        this.deps.stop();
        this.publish({ speaking: false });
        report("playback unavailable");
      }
      // Playback is one-shot; release decoded speech when its source finishes or is stopped.
      session.buffer = undefined;
      session.text = "";
    }, 500);
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

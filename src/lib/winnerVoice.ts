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
  | "authorization required"
  | "rate limited"
  | "service unavailable"
  | "invalid audio response"
  | "audio decode failed"
  | "request timed out"
  | "saved entry unavailable"
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
  playbackDue?: boolean;
  finished?: boolean;
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  requestTimer?: ReturnType<typeof setTimeout>;
  deadlineTimer?: ReturnType<typeof setTimeout>;
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
      if (this.active) {
        this.active.finished = true;
        this.active.controller.abort();
        clearTimeout(this.active.timer);
        clearTimeout(this.active.deadlineTimer);
        this.active.buffer = undefined;
        this.active.text = "";
      }
      report("muted");
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
    report("idle");
    // This promise is deliberately never awaited by the wheel or prize engine.
    void this.prepareAudio(session, spinId, store).catch(() => {
      if (this.active === session && !session.finished) report("unavailable");
    });
  }
  private async prepareAudio(session: Session, spinId: string, store: HavenDB) {
    const input = await savedVoiceInput(store, spinId);
    if (
      this.active !== session ||
      session.finished ||
      session.controller.signal.aborted
    )
      return;
    if (!input) {
      report("saved entry unavailable");
      return;
    }
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
      session.finished ||
      session.controller.signal.aborted
    )
      return;
    if (!token) {
      report("authorization required");
      return;
    }
    if (!(await claimVoiceAttempt(store, input.entryId))) {
      report("already attempted");
      return;
    }
    if (
      this.active !== session ||
      session.finished ||
      this.deps.muted() ||
      session.controller.signal.aborted
    )
      return;
    report("preparing");
    session.requestTimer = setTimeout(() => {
      if (this.active === session && !session.finished)
        report("request timed out");
      session.controller.abort();
    }, 8000);
    let failure: VoiceDiagnostic = "unavailable";
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
        this.active !== session ||
        session.finished ||
        session.controller.signal.aborted
      )
        return;
      if (!response.ok) {
        report(
          response.status === 401 || response.status === 403
            ? "authorization required"
            : response.status === 429
              ? "rate limited"
              : "service unavailable",
        );
        return;
      }
      failure = "invalid audio response";
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw 0;
      const raw = await response.text();
      if (
        this.active !== session ||
        session.finished ||
        session.controller.signal.aborted
      )
        return;
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
      failure = "audio decode failed";
      const buffer = await this.deps.decode(bytes.buffer);
      if (
        this.active !== session ||
        session.finished ||
        session.controller.signal.aborted
      )
        return;
      session.buffer = buffer;
      report("ready");
      this.tryPlay(session);
    } catch {
      if (
        this.active === session &&
        !session.finished &&
        !session.controller.signal.aborted
      )
        report(failure);
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
    // A fast/reduced-motion wheel must not cancel valid speech that is still arriving.
    // The result is already visible; speech can start once within a short, bounded window.
    if (!session.spinId) report("preview only");
    session.timer = setTimeout(() => {
      session.playbackDue = true;
      this.tryPlay(session);
    }, 500);
    session.deadlineTimer = setTimeout(() => {
      if (this.active !== session || session.finished) return;
      session.finished = true;
      session.controller.abort();
      clearTimeout(session.requestTimer);
      session.buffer = undefined;
      session.text = "";
      if (diagnostic.status === "preparing") report("late");
    }, 3000);
  }
  private tryPlay(session: Session) {
    if (
      this.active !== session ||
      session.finished ||
      !session.playbackDue ||
      !session.buffer
    )
      return;
    session.finished = true;
    clearTimeout(session.deadlineTimer);
    clearTimeout(session.requestTimer);
    try {
      if (!this.deps.muted() && !this.deps.hidden()) {
        if (
          this.deps.play(session.buffer, () => {
            if (this.active === session) this.publish({ speaking: false });
          })
        ) {
          this.publish({ speaking: true });
          report("personalized");
        } else report("playback unavailable");
      }
    } catch {
      this.deps.stop();
      this.publish({ speaking: false });
      report("playback unavailable");
    }
    session.buffer = undefined;
    session.text = "";
  }
  reset() {
    const session = this.active;
    this.active = undefined;
    if (session) {
      clearTimeout(session.timer);
      clearTimeout(session.requestTimer);
      clearTimeout(session.deadlineTimer);
      session.finished = true;
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

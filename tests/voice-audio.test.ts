import { afterEach, beforeEach, expect, it, vi } from "vitest";
let gains: any[], sources: any[], constructors: number, utterances: any[];
const param = () => ({
  value: 1,
  setTargetAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});
const node = () => ({
  gain: param(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  onended: null as null | (() => void),
  buffer: null,
});
beforeEach(() => {
  vi.resetModules();
  gains = [];
  sources = [];
  constructors = 0;
  utterances = [];
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      currentTime = 1;
      destination = {};
      constructor() {
        constructors++;
      }
      createGain() {
        const n = node();
        gains.push(n);
        return n;
      }
      createBufferSource() {
        const n = node();
        sources.push(n);
        return n;
      }
      decodeAudioData() {
        return Promise.resolve({ duration: 2 });
      }
      resume() {
        return Promise.resolve();
      }
    },
  );
  vi.stubGlobal("window", {
    speechSynthesis: {
      getVoices: () => [
        { name: "On device", lang: "en-CA", localService: true },
      ],
      speak: vi.fn((u) => utterances.push(u)),
      cancel: vi.fn(),
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("uses one unlocked context, routes voice to master, smoothly ducks only effects and restores them", async () => {
  const audio = await import("../src/lib/audio");
  audio.unlockAudio();
  audio.unlockAudio();
  expect(constructors).toBe(1);
  const buffer = await audio.decodeAnnouncement(new ArrayBuffer(4));
  const ended = vi.fn();
  expect(audio.playAnnouncement(buffer, ended)).toBe(true);
  expect(sources[0].connect).toHaveBeenCalledWith(gains[0]);
  expect(gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.18, 1, 0.08);
  sources[0].onended();
  expect(ended).toHaveBeenCalledOnce();
  expect(gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 1, 0.18);
  audio.playAnnouncement(buffer, ended);
  audio.setMuted(true);
  expect(sources[1].stop).toHaveBeenCalled();
  expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, 0.025);
  expect(audio.playAnnouncement(buffer, ended)).toBe(false);
});
it("never selects remote speech voices and cancels speech that cannot start promptly", async () => {
  vi.useFakeTimers();
  const audio = await import("../src/lib/audio");
  audio.unlockAudio();
  const failed = vi.fn();
  expect(audio.playLocalAnnouncement("Approved fixture", vi.fn(), failed)).toBe(
    true,
  );
  await vi.advanceTimersByTimeAsync(350);
  expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  expect(failed).toHaveBeenCalledOnce();
  window.speechSynthesis.getVoices = () => [
    { localService: false, lang: "en-US" } as SpeechSynthesisVoice,
  ];
  expect(audio.hasLocalVoice()).toBe(false);
  expect(audio.playLocalAnnouncement("Approved fixture", vi.fn(), failed)).toBe(
    false,
  );
});
it("local speech shares mute intent, cannot overlap, and restores the effect mix on cancellation", async () => {
  const audio = await import("../src/lib/audio");
  audio.unlockAudio();
  audio.playLocalAnnouncement("Approved fixture", vi.fn(), vi.fn());
  utterances[0].onstart();
  expect(gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.18, 1, 0.08);
  audio.setMuted(true);
  expect(window.speechSynthesis.cancel).toHaveBeenCalledOnce();
  expect(gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 1, 0.18);
  expect(utterances[0].onstart).toBeNull();
});

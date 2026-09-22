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
it("stopping generated audio releases its source and restores the mix without invoking browser speech", async () => {
  const audio = await import("../src/lib/audio");
  audio.unlockAudio();
  audio.playAnnouncement(
    await audio.decodeAnnouncement(new ArrayBuffer(4)),
    vi.fn(),
  );
  audio.stopAnnouncement();
  expect(sources[0].stop).toHaveBeenCalledOnce();
  expect(sources[0].disconnect).toHaveBeenCalledOnce();
  expect(sources[0].onended).toBeNull();
  expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  expect(gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 1, 0.18);
});

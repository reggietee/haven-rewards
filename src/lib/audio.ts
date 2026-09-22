let context: AudioContext | undefined;
let master: GainNode | undefined;
let effects: GainNode | undefined;
let voiceSource: AudioBufferSourceNode | undefined;
const muteListeners = new Set<(muted: boolean) => void>();
let muted = localStorage.getItem("haven-muted") === "true";
export function setMuted(value: boolean) {
  muted = value;
  if (value) stopAnnouncement();
  muteListeners.forEach((listener) => listener(value));
  localStorage.setItem("haven-muted", String(value));
  if (context) {
    master?.gain.setTargetAtTime(value ? 0 : 1, context.currentTime, 0.025);
    if (!value) void context.resume().catch(() => {});
  }
}
export function isMuted() {
  return muted;
}
export function unlockAudio() {
  try {
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(context.destination);
      effects = context.createGain();
      effects.connect(master);
    }
    if (!muted) void context.resume().catch(() => {});
  } catch {
    /* Visual flow remains available. */
  }
}
function tone(
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  delay = 0,
  end?: number,
) {
  if (!context || muted) return;
  const start = context.currentTime + delay,
    o = context.createOscillator(),
    g = context.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (end) o.frequency.exponentialRampToValueAtTime(end, start + duration);
  g.gain.setValueAtTime(0.001, start);
  g.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, start + duration);
  o.connect(g);
  g.connect(effects!);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
  o.start(start);
  o.stop(start + duration + 0.05);
}
export function tick() {
  tone(1200, 0.035, 0.035, "triangle", 0, 650);
}
export function spinSound() {
  tone(100, 2.5, 0.045, "sawtooth", 0, 460);
}
export function celebrationSound(tier: number) {
  tone(88, 0.7, 0.3, "sine", 0, 35);
  [392, 494, 587, 784, 988]
    .slice(0, tier + 1)
    .forEach((f, i) => tone(f, 0.6, 0.09, "triangle", 0.12 + i * 0.13));
  if (tier >= 4) {
    tone(70, 1.6, 0.22);
    tone(196, 2, 0.07, "sawtooth", 0.4, 392);
  }
  if (tier === 5 && context && !muted) {
    const buffer = context.createBuffer(
      1,
      context.sampleRate * 3,
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] =
        (Math.random() * 2 - 1) * 0.13 * Math.sin((Math.PI * i) / data.length);
    const s = context.createBufferSource(),
      f = context.createBiquadFilter(),
      g = context.createGain();
    s.buffer = buffer;
    f.type = "bandpass";
    f.frequency.value = 1400;
    f.Q.value = 0.3;
    g.gain.value = 0.6;
    s.connect(f);
    f.connect(g);
    g.connect(effects!);
    s.onended = () => {
      s.disconnect();
      f.disconnect();
      g.disconnect();
    };
    s.start();
    for (let i = 0; i < 9; i++)
      tone(392 * ((i % 3) + 1), 1.6, 0.04, "triangle", 0.6 + i * 0.35);
  }
}

export function onMute(listener: (value: boolean) => void) {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}
export function duckEffects(value: boolean) {
  if (!context || !effects) return;
  const gain = effects.gain;
  gain.cancelScheduledValues(context.currentTime);
  gain.setTargetAtTime(
    value ? 0.18 : 1,
    context.currentTime,
    value ? 0.08 : 0.18,
  );
}
export async function decodeAnnouncement(bytes: ArrayBuffer) {
  if (!context) throw new Error("Audio unavailable");
  const buffer = await context.decodeAudioData(bytes);
  if (buffer.duration < 0.1 || buffer.duration > 20)
    throw new Error("Audio unavailable");
  return buffer;
}
export function stopAnnouncement() {
  if (voiceSource) {
    voiceSource.onended = null;
    try {
      voiceSource.stop();
    } catch {
      /* Already finished. */
    }
    try {
      voiceSource.disconnect();
    } catch {
      /* Already disconnected. */
    }
    voiceSource = undefined;
  }
  duckEffects(false);
}
export function playAnnouncement(buffer: AudioBuffer, ended: () => void) {
  stopAnnouncement();
  if (!context || context.state !== "running" || !master || muted) return false;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(master);
  voiceSource = source;
  source.onended = () => {
    if (voiceSource !== source) return;
    source.disconnect();
    voiceSource = undefined;
    duckEffects(false);
    ended();
  };
  duckEffects(true);
  source.start();
  return true;
}

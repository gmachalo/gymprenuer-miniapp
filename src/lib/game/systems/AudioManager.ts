import { EventBus } from "@/lib/game/EventBus";

// Procedural audio using Web Audio API — zero external asset files
// All sounds are generated from oscillators, noise, and envelopes

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxEnabled = true;
let sfxVolume = 0.4;

function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = sfxVolume;
    masterGain.connect(audioCtx.destination);

    // Load saved prefs
    try {
      const saved = localStorage.getItem("gym_audio_prefs");
      if (saved) {
        const prefs = JSON.parse(saved);
        sfxEnabled = prefs.sfxEnabled ?? true;
        sfxVolume = prefs.sfxVolume ?? 0.4;
        masterGain.gain.value = sfxEnabled ? sfxVolume : 0;
      }
    } catch { /* ignore */ }

    return audioCtx;
  } catch {
    return null;
  }
}

// ── Utility: play a short oscillator tone ─────────────────────────────────────
function playTone(
  freq: number,
  type: OscillatorType,
  duration: number,
  volume = 0.3,
  rampDown = true
) {
  const ctx = getCtx();
  if (!ctx || !masterGain || !sfxEnabled) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  if (rampDown) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }
  osc.connect(gain).connect(masterGain);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

// ── Utility: play noise burst (for impacts) ──────────────────────────────────
function playNoise(duration: number, volume = 0.15) {
  const ctx = getCtx();
  if (!ctx || !masterGain || !sfxEnabled) return;

  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buffer;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  // Bandpass for metallic feel
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2000;
  filter.Q.value = 1.5;
  src.connect(filter).connect(gain).connect(masterGain);
  src.start();
}

// ── Sound effects ─────────────────────────────────────────────────────────────
const SFX = {
  repTap() {
    playTone(220, "sine", 0.08, 0.25);
    playNoise(0.04, 0.08);
  },

  combo3() {
    playTone(440, "triangle", 0.12, 0.2);
    setTimeout(() => playTone(550, "triangle", 0.12, 0.2), 60);
    setTimeout(() => playTone(660, "triangle", 0.15, 0.25), 120);
  },

  combo5() {
    [440, 550, 660, 880].forEach((f, i) => {
      setTimeout(() => playTone(f, "triangle", 0.15, 0.2), i * 50);
    });
  },

  workoutComplete() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => playTone(f, "sine", 0.3, 0.2), i * 80);
    });
    setTimeout(() => playNoise(0.1, 0.05), 300);
  },

  xpGain() {
    playTone(880, "sine", 0.15, 0.15);
    setTimeout(() => playTone(1100, "sine", 0.12, 0.12), 60);
  },

  coinCollect() {
    playTone(1320, "square", 0.06, 0.1);
    setTimeout(() => playTone(1760, "square", 0.08, 0.12), 40);
  },

  equipmentActivate() {
    playNoise(0.12, 0.2);
    playTone(150, "sawtooth", 0.15, 0.12);
  },

  npcEnter() {
    playTone(660, "sine", 0.08, 0.08);
    setTimeout(() => playTone(880, "sine", 0.1, 0.06), 60);
  },

  npcPaid() {
    [1320, 1760, 2200].forEach((f, i) => {
      setTimeout(() => playTone(f, "square", 0.04, 0.08), i * 30);
    });
  },

  levelUp() {
    [523, 659, 784, 1047, 1318].forEach((f, i) => {
      setTimeout(() => playTone(f, "sine", 0.4 - i * 0.04, 0.2), i * 100);
    });
  },

  uiClick() {
    playTone(600, "sine", 0.04, 0.1);
  },

  error() {
    playTone(200, "sawtooth", 0.2, 0.15);
    setTimeout(() => playTone(150, "sawtooth", 0.25, 0.12), 100);
  },
};

// ── AudioManager singleton ────────────────────────────────────────────────────
export class AudioManager {
  private static bound = false;

  static init() {
    if (AudioManager.bound) return;
    AudioManager.bound = true;

    // Resume AudioContext on first user interaction (browser policy)
    const resumeCtx = () => {
      const ctx = getCtx();
      if (ctx?.state === "suspended") ctx.resume();
      document.removeEventListener("click", resumeCtx);
      document.removeEventListener("touchstart", resumeCtx);
    };
    document.addEventListener("click", resumeCtx, { once: true });
    document.addEventListener("touchstart", resumeCtx, { once: true });

    // Bind EventBus events to SFX
    EventBus.on("workout:started", () => SFX.equipmentActivate());
    EventBus.on("workout:complete", () => SFX.workoutComplete());
    EventBus.on("income:collected", () => SFX.coinCollect());
    EventBus.on("npc:entered", () => SFX.npcEnter());
    EventBus.on("npc:paid", () => SFX.npcPaid());
    EventBus.on("player:level_up", () => SFX.levelUp());
    EventBus.on("equipment:upgraded", () => SFX.levelUp());
    EventBus.on("player:xp_changed", () => SFX.xpGain());
  }

  static playRepTap()    { SFX.repTap(); }
  static playCombo(n: number) { n >= 5 ? SFX.combo5() : SFX.combo3(); }
  static playUIClick()   { SFX.uiClick(); }
  static playError()     { SFX.error(); }

  static setEnabled(enabled: boolean) {
    sfxEnabled = enabled;
    if (masterGain) masterGain.gain.value = enabled ? sfxVolume : 0;
    AudioManager.savePrefs();
  }

  static setVolume(vol: number) {
    sfxVolume = Math.max(0, Math.min(1, vol));
    if (masterGain && sfxEnabled) masterGain.gain.value = sfxVolume;
    AudioManager.savePrefs();
  }

  static isEnabled() { return sfxEnabled; }
  static getVolume() { return sfxVolume; }

  private static savePrefs() {
    try {
      localStorage.setItem("gym_audio_prefs", JSON.stringify({ sfxEnabled, sfxVolume }));
    } catch { /* ignore */ }
  }
}

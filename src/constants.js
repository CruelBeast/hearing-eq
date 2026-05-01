// constants.js — shared configuration for EARMATCH

/** Tested-band presets */
export const TEST_BAND_PRESETS = {
  standard8: {
    id: "standard8",
    label: "Standard",
    desc: "8 bands · 125 Hz–8 kHz",
    freqs: [125, 250, 500, 1000, 2000, 4000, 6000, 8000],
    startDb: [-70, -75, -82, -95, -100, -105, -100, -100],
  },
  quick6: {
    id: "quick6",
    label: "Quick",
    desc: "6 bands · 125 Hz–4 kHz",
    freqs: [125, 250, 500, 1000, 2000, 4000],
    startDb: [-70, -75, -82, -95, -100, -105],
  },
};

export const DEFAULT_BAND_PRESET = "standard8";
const DEFAULT_BANDS = TEST_BAND_PRESETS[DEFAULT_BAND_PRESET];
const START_DB_ANCHORS = DEFAULT_BANDS.freqs.map((f, i) => ({
  hz: f,
  db: DEFAULT_BANDS.startDb[i],
}));

/** Frequency bands used by default (Hz) */
export const FREQS = DEFAULT_BANDS.freqs;
export const FREQ_START_DB = DEFAULT_BANDS.startDb;

export function freqLabelFromHz(hz) {
  if (hz >= 1000) {
    const k = hz / 1000;
    return Number.isInteger(k) ? `${k} kHz` : `${k.toFixed(1)} kHz`;
  }
  return `${hz} Hz`;
}

export function freqShortFromHz(hz) {
  if (hz >= 1000) {
    const k = hz / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(hz);
}

export const FREQ_LABELS = FREQS.map(freqLabelFromHz);
export const FREQ_SHORT = FREQS.map(freqShortFromHz);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function estimateStartDbForFreq(hz) {
  const f = Number(hz);
  if (!Number.isFinite(f)) return -90;
  const anchors = START_DB_ANCHORS;
  if (f <= anchors[0].hz) return anchors[0].db;
  if (f >= anchors[anchors.length - 1].hz) return anchors[anchors.length - 1].db;

  for (let i = 1; i < anchors.length; i++) {
    const lo = anchors[i - 1];
    const hi = anchors[i];
    if (f <= hi.hz) {
      const t = (Math.log(f) - Math.log(lo.hz)) / (Math.log(hi.hz) - Math.log(lo.hz));
      return Math.round(lerp(lo.db, hi.db, clamp(t, 0, 1)));
    }
  }
  return -90;
}

export function buildStartDbForFreqs(freqs) {
  return freqs.map((f) => estimateStartDbForFreq(f));
}

// ── Threshold ramp ──────────────────────────────────────────────────────────
/**
 * Per-frequency starting gain (indexed parallel to FREQS).
 *
 * Low frequencies (< 1 kHz) are much harder to perceive at low volumes
 * (Fletcher-Munson), so we start higher to avoid a very long ramp.
 * The ear is most sensitive around 2–6 kHz, so those bands start quieter
 * to ensure the threshold is found accurately rather than skipped.
 *
 * If any tone is audible from the very first step, lower your system volume.
 *
 * FREQS: [125,  250,  500, 1000, 2000, 4000, 6000, 8000]
 */
/** Absolute ceiling — never play louder than this during the test */
export const MAX_DB = -12;
/**
 * Gain increment per ramp step.
 * 2 dB keeps the ramp fine enough to detect a 2–3 dB ear difference reliably.
 */
export const STEP_DB = 2;
/** Milliseconds between ramp steps */
export const RAMP_MS = 500;
/** How many times each ear/frequency pair is measured and averaged */
export const REPEATS = 2;

// ── Correction logic ────────────────────────────────────────────────────────
/**
 * Minimum left/right threshold difference (dB) before any correction is applied.
 * Differences smaller than this are treated as "balanced" — measurement noise,
 * not a real asymmetry worth correcting.
 */
export const BALANCE_THRESHOLD_DB = 3;

/** Fraction of the raw measured difference to apply as EQ correction */
export const STRENGTH = {
  mild: { label: "Mild", value: 0.5, desc: "50% correction · safest default" },
  normal: { label: "Normal", value: 0.65, desc: "65% correction · balanced" },
  strong: { label: "Strong", value: 0.8, desc: "80% correction · use carefully" },
};

// ── UI steps ────────────────────────────────────────────────────────────────
export const STEPS = [
  { id: "setup", label: "Setup" },
  { id: "threshold", label: "Ear Test" },
  { id: "profile", label: "Profile" },
];

// dsp.js — signal-processing helpers

import {
  FREQS,
  REPEATS,
  STRENGTH,
  BALANCE_THRESHOLD_DB,
} from '../constants.js';

// ── Utilities ───────────────────────────────────────────────────────────────

export const avg   = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
export const fmtDb = (db, decimals = 1) => (db >= 0 ? '+' : '') + db.toFixed(decimals);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Measurement sequence ────────────────────────────────────────────────────

/**
 * Generates the ordered list of measurements to take.
 * For each frequency: left × REPEATS, then right × REPEATS.
 * Total items: FREQS.length × 2 × REPEATS.
 */
export function buildSequence(freqs = FREQS, repeats = REPEATS) {
  const seq = [];
  for (let f = 0; f < freqs.length; f++) {
    for (let r = 0; r < repeats; r++) seq.push({ freqIdx: f, ear: 'left',  repeatIdx: r });
    for (let r = 0; r < repeats; r++) seq.push({ freqIdx: f, ear: 'right', repeatIdx: r });
  }
  return seq;
}

/** Pre-built measurement sequence (32 items with defaults). */
export const SEQUENCE = buildSequence();

// ── Threshold computation ───────────────────────────────────────────────────

/**
 * Average raw dB measurements into per-frequency threshold objects.
 * @param {number[]} rawDb - Array aligned with SEQUENCE, one entry per measurement.
 * @returns {{ frequencyHz, leftThreshDb, rightThreshDb }[]}
 */
export function computeThresholds(rawDb, freqs = FREQS, repeats = REPEATS) {
  const seq = buildSequence(freqs, repeats);
  return freqs.map((freq, fi) => {
    const lR = [], rR = [];
    seq.forEach(({ freqIdx, ear }, i) => {
      if (freqIdx !== fi) return;
      (ear === 'left' ? lR : rR).push(rawDb[i]);
    });
    return {
      frequencyHz:   freq,
      leftThreshDb:  avg(lR),
      rightThreshDb: avg(rR),
    };
  });
}

// ── Correction ──────────────────────────────────────────────────────────────

/**
 * Compute per-band EQ correction from threshold measurements.
 *
 * Strategy: prefer cuts over boosts — reduce the better-hearing channel.
 *
 * differenceDb = rightThreshDb − leftThreshDb
 *   > +BALANCE_THRESHOLD_DB  → right is less sensitive → cut LEFT channel
 *   < −BALANCE_THRESHOLD_DB  → left  is less sensitive → cut RIGHT channel
 *   within ±BALANCE_THRESHOLD_DB → treated as balanced, no correction
 *
 * @param {{ frequencyHz, leftThreshDb, rightThreshDb }[]} thresholds
 * @param {'mild'|'normal'|'strong'} strengthKey
 */
export function computeCorrection(thresholds, strengthKey) {
  const s = STRENGTH[strengthKey]?.value ?? 0.5;

  return thresholds.map(({ frequencyHz, leftThreshDb, rightThreshDb }) => {
    const diff   = rightThreshDb - leftThreshDb;
    const amount = Math.abs(diff) * s;

    return {
      frequencyHz,
      leftThreshDb,
      rightThreshDb,
      differenceDb: diff,
      leftCorrDb:   diff >  BALANCE_THRESHOLD_DB ? -amount : 0,
      rightCorrDb:  diff < -BALANCE_THRESHOLD_DB ? -amount : 0,
    };
  });
}

// ── Final EQ (correction + fine-tuning) ────────────────────────────────────

/**
 * Combine threshold correction with per-band fine-tuning adjustments.
 *
 * finetuning[i] > 0 → push sound right (tone felt too left-biased)
 *   → subtract ft/2 from left, add ft/2 to right
 *
 * @param {object[]} correction - Output of computeCorrection
 * @param {number[]} finetuning - Per-band balance offsets in dB
 */
export function computeFinalEq(correction, finetuning) {
  return correction.map(({ frequencyHz, leftCorrDb, rightCorrDb }, i) => {
    const ft = finetuning[i] ?? 0;
    return {
      frequencyHz,
      leftDb:  leftCorrDb  - ft / 2,
      rightDb: rightCorrDb + ft / 2,
    };
  });
}

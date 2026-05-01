// audio-engine.js
// Web Audio engine for the hearing-EQ calibration app.

let ctx = null;
function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

export const ISO_FREQS = [
  31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
];
export const ISO_LABELS = [
  "31",
  "63",
  "125",
  "250",
  "500",
  "1k",
  "2k",
  "4k",
  "8k",
  "16k",
];

export const BAND_PRESETS = {
  5: {
    freqs: [250, 1000, 2000, 4000, 8000],
    labels: ["250", "1k", "2k", "4k", "8k"],
  },
  7: {
    freqs: [125, 250, 500, 1000, 2000, 4000, 8000],
    labels: ["125", "250", "500", "1k", "2k", "4k", "8k"],
  },
  10: { freqs: ISO_FREQS, labels: ISO_LABELS },
};

// ── Tone (sine) ────────────────────────────────────────────────────────────
export function playTone({
  freq = 1000,
  ear = "L",
  gainDb = -30,
  attackMs = 25,
}) {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const g = c.createGain();
  g.gain.value = 0;

  const merger = c.createChannelMerger(2);
  const silent = c.createConstantSource();
  silent.offset.value = 0;
  silent.start();

  if (ear === "L") {
    g.connect(merger, 0, 0);
    silent.connect(merger, 0, 1);
  } else if (ear === "R") {
    g.connect(merger, 0, 1);
    silent.connect(merger, 0, 0);
  } else {
    g.connect(merger, 0, 0);
    g.connect(merger, 0, 1);
  }

  merger.connect(c.destination);
  osc.connect(g);

  const target = dbToGain(gainDb);
  g.gain.linearRampToValueAtTime(target, c.currentTime + attackMs / 1000);
  osc.start();

  let stopped = false;
  return {
    setGainDb(db) {
      if (stopped) return;
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.linearRampToValueAtTime(dbToGain(db), t + 0.04);
    },
    setFrequency(hz) {
      if (stopped) return;
      osc.frequency.linearRampToValueAtTime(hz, c.currentTime + 0.04);
    },
    stop(releaseMs = 60) {
      if (stopped) return;
      stopped = true;
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.linearRampToValueAtTime(0, t + releaseMs / 1000);
      osc.stop(t + releaseMs / 1000 + 0.02);
      setTimeout(() => {
        try {
          merger.disconnect();
          silent.stop();
        } catch (e) {}
      }, releaseMs + 100);
    },
  };
}

// ── Balance tone — same frequency in BOTH ears, with relative L/R trim ───
export function playBalanceTone({
  freq = 1000,
  baselineDb = -32,
  balanceDb = 0,
  mode = "alternating",
  pulseMs = 550,
}) {
  const c = getCtx();
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const lG = c.createGain();
  const rG = c.createGain();
  lG.gain.value = 0;
  rG.gain.value = 0;

  const merger = c.createChannelMerger(2);
  osc.connect(lG);
  osc.connect(rG);
  lG.connect(merger, 0, 0);
  rG.connect(merger, 0, 1);
  merger.connect(c.destination);
  osc.start();

  let stopped = false;
  let curMode = mode;
  let curBalance = balanceDb;
  let curBaseline = baselineDb;

  function ears(balance, baseline) {
    const half = balance / 2;
    return { lDb: baseline - half, rDb: baseline + half };
  }

  let pulseTimer = null;
  let pulseSide = "L";

  function applyContinuous() {
    const { lDb, rDb } = ears(curBalance, curBaseline);
    const t = c.currentTime;
    lG.gain.cancelScheduledValues(t);
    rG.gain.cancelScheduledValues(t);
    lG.gain.linearRampToValueAtTime(dbToGain(lDb), t + 0.05);
    rG.gain.linearRampToValueAtTime(dbToGain(rDb), t + 0.05);
  }

  function applyPulse() {
    const { lDb, rDb } = ears(curBalance, curBaseline);
    const t = c.currentTime;
    const ramp = 0.03;
    const hold = pulseMs / 1000 - ramp * 2;
    lG.gain.cancelScheduledValues(t);
    rG.gain.cancelScheduledValues(t);
    if (pulseSide === "L") {
      lG.gain.linearRampToValueAtTime(dbToGain(lDb), t + ramp);
      rG.gain.linearRampToValueAtTime(0.0001, t + ramp);
      lG.gain.setValueAtTime(dbToGain(lDb), t + ramp + hold);
      lG.gain.linearRampToValueAtTime(0.0001, t + ramp + hold + ramp);
    } else {
      rG.gain.linearRampToValueAtTime(dbToGain(rDb), t + ramp);
      lG.gain.linearRampToValueAtTime(0.0001, t + ramp);
      rG.gain.setValueAtTime(dbToGain(rDb), t + ramp + hold);
      rG.gain.linearRampToValueAtTime(0.0001, t + ramp + hold + ramp);
    }
    pulseSide = pulseSide === "L" ? "R" : "L";
  }

  function startMode() {
    if (pulseTimer) {
      clearInterval(pulseTimer);
      pulseTimer = null;
    }
    if (curMode === "continuous") {
      applyContinuous();
    } else {
      pulseSide = "L";
      applyPulse();
      pulseTimer = setInterval(() => {
        if (!stopped) applyPulse();
      }, pulseMs);
    }
  }

  startMode();

  return {
    setBalanceDb(b) {
      if (stopped) return;
      curBalance = b;
      if (curMode === "continuous") applyContinuous();
    },
    setBaselineDb(d) {
      if (stopped) return;
      curBaseline = d;
      if (curMode === "continuous") applyContinuous();
    },
    setFrequency(hz) {
      if (stopped) return;
      osc.frequency.linearRampToValueAtTime(hz, c.currentTime + 0.04);
    },
    setMode(m) {
      if (stopped || m === curMode) return;
      curMode = m;
      startMode();
    },
    getPulseSide() {
      return pulseSide === "L" ? "R" : "L";
    },
    stop(releaseMs = 60) {
      if (stopped) return;
      stopped = true;
      if (pulseTimer) {
        clearInterval(pulseTimer);
        pulseTimer = null;
      }
      const t = c.currentTime;
      lG.gain.cancelScheduledValues(t);
      rG.gain.cancelScheduledValues(t);
      lG.gain.linearRampToValueAtTime(0, t + releaseMs / 1000);
      rG.gain.linearRampToValueAtTime(0, t + releaseMs / 1000);
      try {
        osc.stop(t + releaseMs / 1000 + 0.02);
      } catch (e) {}
      setTimeout(() => {
        try {
          merger.disconnect();
          lG.disconnect();
          rG.disconnect();
        } catch (e) {}
      }, releaseMs + 100);
    },
  };
}

// ── Reference sound (finger-rub / palm-rub) ───────────────────────────────
export function playReference({ kind = "rub", gainDb = -30 }) {
  const c = getCtx();
  const bufSize = c.sampleRate * 2;
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const hp = c.createBiquadFilter();
  const lp = c.createBiquadFilter();
  hp.type = "highpass";
  lp.type = "lowpass";

  const mod = c.createGain();
  mod.gain.value = 1;
  let lfo = null,
    lfoGain = null;

  if (kind === "rub") {
    hp.frequency.value = 1500;
    lp.frequency.value = 6000;
    lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 7;
    lfoGain = c.createGain();
    lfoGain.gain.value = 0.45;
    lfo.connect(lfoGain).connect(mod.gain);
    lfo.start();
  } else if (kind === "palm") {
    hp.frequency.value = 400;
    lp.frequency.value = 3500;
    lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 4;
    lfoGain = c.createGain();
    lfoGain.gain.value = 0.55;
    lfo.connect(lfoGain).connect(mod.gain);
    lfo.start();
  }

  const g = c.createGain();
  g.gain.value = 0;

  src.connect(hp).connect(lp).connect(mod).connect(g).connect(c.destination);
  src.start();
  g.gain.linearRampToValueAtTime(dbToGain(gainDb), c.currentTime + 0.06);

  let stopped = false;
  return {
    setGainDb(db) {
      if (stopped) return;
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.linearRampToValueAtTime(dbToGain(db), t + 0.05);
    },
    stop(releaseMs = 80) {
      if (stopped) return;
      stopped = true;
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.linearRampToValueAtTime(0, t + releaseMs / 1000);
      setTimeout(() => {
        try {
          src.stop();
          if (lfo) lfo.stop();
          src.disconnect();
          hp.disconnect();
          lp.disconnect();
          mod.disconnect();
          g.disconnect();
          if (lfoGain) lfoGain.disconnect();
        } catch (e) {}
      }, releaseMs + 100);
    },
  };
}

// ── Full tone sweep (continuous low->high->low sine) ──────────────────────
//
// Useful for checking center stability: if the corrected profile is balanced,
// the sweep should stay centered rather than drifting left/right by frequency.
//
export function playToneSweep({
  leftBands = null,
  rightBands = null,
  freqs = ISO_FREQS,
  gainDb = -16,
  upSec = 4.6,
  downSec = 4.6,
}) {
  const c = getCtx();
  const fs = freqs || ISO_FREQS;
  const sorted = [...fs].sort((a, b) => a - b);
  const lowHz = Math.max(60, sorted[0] * 0.7);
  const highHz = Math.min(12000, sorted[sorted.length - 1] * 1.25);

  const out = c.createGain();
  out.gain.value = dbToGain(gainDb);
  out.connect(c.destination);

  function eqChain(bandsDb) {
    const filters = fs.map((f, i) => {
      const bf = c.createBiquadFilter();
      bf.type = "peaking";
      bf.frequency.value = f;
      bf.Q.value = 1.0;
      bf.gain.value = bandsDb ? bandsDb[i] : 0;
      return bf;
    });
    for (let i = 0; i < filters.length - 1; i++) {
      filters[i].connect(filters[i + 1]);
    }
    return { input: filters[0], output: filters[filters.length - 1] };
  }

  const merger = c.createChannelMerger(2);
  const lEq = eqChain(leftBands);
  const rEq = eqChain(rightBands);
  lEq.output.connect(merger, 0, 0);
  rEq.output.connect(merger, 0, 1);
  merger.connect(out);

  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.value = lowHz;

  const toneGain = c.createGain();
  toneGain.gain.value = 0.0001;
  osc.connect(toneGain);
  toneGain.connect(lEq.input);
  toneGain.connect(rEq.input);

  const now = c.currentTime;
  toneGain.gain.setValueAtTime(0.0001, now);
  toneGain.gain.linearRampToValueAtTime(1, now + 0.08);
  osc.start();

  const cycleSec = upSec + downSec;
  let stopped = false;

  // Smooth 0->1->0 shape in log-frequency space, so loop boundaries
  // land with zero slope and avoid audible seam beeps.
  const curveLen = 1024;
  const lnLow = Math.log(lowHz);
  const lnHigh = Math.log(highHz);
  const sweepCurve = new Float32Array(curveLen);
  for (let i = 0; i < curveLen; i++) {
    const phase = i / (curveLen - 1);
    const shape = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase); // 0 -> 1 -> 0
    sweepCurve[i] = Math.exp(lnLow + (lnHigh - lnLow) * shape);
  }

  function scheduleCycle(t0) {
    osc.frequency.setValueCurveAtTime(sweepCurve, t0, cycleSec);
  }

  let nextCycleAt = now + 0.1;
  scheduleCycle(nextCycleAt);
  nextCycleAt += cycleSec;

  const loopTimer = setInterval(() => {
    if (stopped) return;
    if (c.currentTime >= nextCycleAt - 0.55) {
      scheduleCycle(nextCycleAt);
      nextCycleAt += cycleSec;
    }
  }, 120);

  return {
    stop(releaseMs = 120) {
      if (stopped) return;
      stopped = true;
      clearInterval(loopTimer);
      const t = c.currentTime;
      toneGain.gain.cancelScheduledValues(t);
      toneGain.gain.linearRampToValueAtTime(0.0001, t + releaseMs / 1000);
      out.gain.linearRampToValueAtTime(0, t + releaseMs / 1000);
      try {
        osc.stop(t + releaseMs / 1000 + 0.03);
      } catch (e) {}
      setTimeout(() => {
        try {
          merger.disconnect();
          out.disconnect();
        } catch (e) {}
      }, releaseMs + 120);
    },
  };
}

// ── Demo player — sequenced melodic sweep with optional stereo EQ ──────────
//
// Plays a C-major-pentatonic arpeggio (C3 → E6 → C3) so the melody moves
// through the full tested frequency range (130 Hz – 1.3 kHz fundamentals).
// Triangle-wave harmonics (3rd, 5th, 7th) push energy up to ~8 kHz,
// and bandpass-filtered noise ensures coverage at 5 kHz and 8 kHz.
// A sub-bass pulse at C2 (65 Hz) anchors the low end.
//
export function playDemo({
  leftBands = null,
  rightBands = null,
  freqs = ISO_FREQS,
  gainDb = -16,
}) {
  const c = getCtx();
  const fs = freqs || ISO_FREQS;

  const out = c.createGain();
  out.gain.value = dbToGain(gainDb);
  out.connect(c.destination);

  function eqChain(bandsDb) {
    const filters = fs.map((f, i) => {
      const bf = c.createBiquadFilter();
      bf.type = "peaking";
      bf.frequency.value = f;
      bf.Q.value = 1.0;
      bf.gain.value = bandsDb ? bandsDb[i] : 0;
      return bf;
    });
    for (let i = 0; i < filters.length - 1; i++)
      filters[i].connect(filters[i + 1]);
    return { input: filters[0], output: filters[filters.length - 1] };
  }

  const merger = c.createChannelMerger(2);
  const lEq = eqChain(leftBands);
  const rEq = eqChain(rightBands);
  lEq.output.connect(merger, 0, 0);
  rEq.output.connect(merger, 0, 1);
  merger.connect(out);

  let stopped = false;

  // ── Arpeggio sequence: C-major pentatonic, ascending then descending ───────
  // Each pair is [frequency_hz, relative_gain]
  const MELODY = [
    [130.81, 0.2], // C3  ascending ——————————
    [196.0, 0.22], // G3
    [261.63, 0.24], // C4
    [329.63, 0.26], // E4
    [392.0, 0.27], // G4
    [523.25, 0.28], // C5
    [659.25, 0.3], // E5
    [783.99, 0.3], // G5
    [1046.5, 0.32], // C6  ← peak
    [1318.5, 0.3], // E6
    [783.99, 0.27], // G5  descending ———————
    [523.25, 0.25], // C5
    [392.0, 0.23], // G4
    [261.63, 0.21], // C4
    [196.0, 0.19], // G3
  ];
  const STEP = 0.18; // seconds per step
  const LOOP_DUR = MELODY.length * STEP; // 15 × 0.18 = 2.7 s

  // Pluck: triangle oscillator with fast attack, natural exponential decay
  function pluck(freq, t, gain, sustain) {
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;

    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.014);
    env.gain.exponentialRampToValueAtTime(0.0001, t + sustain);

    osc.connect(env);
    env.connect(lEq.input);
    env.connect(rEq.input);
    osc.start(t);
    osc.stop(t + sustain + 0.06);
  }

  function scheduleLoop(t0) {
    // Melodic arpeggio
    MELODY.forEach(([freq, gain], i) => {
      pluck(freq, t0 + i * STEP, gain, STEP * 1.9);
    });
    // Sub-bass pulse at C2 (65 Hz) — two hits per loop give a rhythmic anchor
    pluck(65.41, t0, 0.45, STEP * 3.5);
    pluck(65.41, t0 + 7 * STEP, 0.38, STEP * 3.0);
  }

  // ── High-frequency shimmer (looped noise through bandpass filters) ───────
  // Provides consistent energy at 5 kHz and 8 kHz for the top test bands,
  // independent of which register the melody is currently playing.
  const noiseFrames = Math.ceil(c.sampleRate * 4);
  const noiseBuf = c.createBuffer(1, noiseFrames, c.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseFrames; i++) nd[i] = Math.random() * 2 - 1;

  const nSrc = c.createBufferSource();
  nSrc.buffer = noiseBuf;
  nSrc.loop = true;

  const bp5 = c.createBiquadFilter();
  bp5.type = "bandpass";
  bp5.frequency.value = 5000;
  bp5.Q.value = 3;
  const bp8 = c.createBiquadFilter();
  bp8.type = "bandpass";
  bp8.frequency.value = 8000;
  bp8.Q.value = 3;

  // Gentle tremolo LFO on the shimmer keeps it from feeling static
  const shimLFO = c.createOscillator();
  shimLFO.type = "sine";
  shimLFO.frequency.value = 1 / (STEP * 2); // one cycle per two steps

  const shimLFOg = c.createGain();
  shimLFOg.gain.value = 0.016; // modulation depth

  const shimGain = c.createGain();
  shimGain.gain.value = 0.02; // base shimmer level

  nSrc.connect(bp5);
  nSrc.connect(bp8);
  bp5.connect(shimGain);
  bp8.connect(shimGain);
  shimLFO.connect(shimLFOg);
  shimLFOg.connect(shimGain.gain); // LFO modulates the gain param
  shimGain.connect(lEq.input);
  shimGain.connect(rEq.input);

  nSrc.start();
  shimLFO.start();

  // ── Scheduling loop ────────────────────────────────────────────────────────
  // Notes are pre-scheduled in the Web Audio timeline. The interval ensures
  // the next loop is queued before the current one ends (lookahead 0.4 s).
  let nextLoopAt = c.currentTime + 0.05;
  scheduleLoop(nextLoopAt);
  nextLoopAt += LOOP_DUR;

  const loopTimer = setInterval(() => {
    if (stopped) return;
    if (c.currentTime >= nextLoopAt - 0.4) {
      scheduleLoop(nextLoopAt);
      nextLoopAt += LOOP_DUR;
    }
  }, 100);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(loopTimer);
      const t = c.currentTime;
      out.gain.linearRampToValueAtTime(0, t + 0.15);
      setTimeout(() => {
        try {
          nSrc.stop();
          shimLFO.stop();
        } catch (e) {}
        try {
          merger.disconnect();
          out.disconnect();
        } catch (e) {}
      }, 300);
    },
  };
}

export const AudioEngine = {
  playTone,
  playBalanceTone,
  playReference,
  playToneSweep,
  playDemo,
  getCtx,
};

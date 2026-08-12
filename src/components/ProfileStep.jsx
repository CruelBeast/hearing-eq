// ProfileStep.jsx — correction profile, fine-tuning, preview, and export (Step 3)

import { useState, useRef, useEffect, useMemo } from "react";
import { playBalanceTone, playToneSweep } from "../audio-engine.js";
import {
  STRENGTH,
  BALANCE_THRESHOLD_DB,
  freqLabelFromHz,
  freqShortFromHz,
} from "../constants.js";
import { computeCorrection, computeFinalEq, fmtDb, clamp } from "../lib/dsp.js";
import { CurveChart } from "./CurveChart.jsx";
import { Icon } from "./icons.jsx";
import { saveProfile, loadProfiles, deleteProfile } from "../lib/storage.js";

// ── Module-level helpers (pure, no component state) ────────────────────────

function fmtDate(isoStr) {
  return new Date(isoStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Preview sweep: one full low->high->low cycle at 1.0x speed.
const SWEEP_BASE_SEC = 9.2;
const SWEEP_SPEED_MIN = 0.3;
const SWEEP_SPEED_MAX = 3;

// Preview frequency scale (also the range of the single-tone picker)
const SWEEP_MIN_HZ = 80;
const SWEEP_MAX_HZ = 14000;
const TONE_STEPS = 1000; // slider resolution across the log scale

function fmtSweepHz(hz) {
  if (!Number.isFinite(hz)) return "--";
  return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${Math.round(hz)} Hz`;
}

// Fractional position (0-1) of a frequency on the log scale, and back
function hzToPos(hz) {
  const p =
    (Math.log(hz) - Math.log(SWEEP_MIN_HZ)) /
    (Math.log(SWEEP_MAX_HZ) - Math.log(SWEEP_MIN_HZ));
  return clamp(p, 0, 1);
}

function posToHz(pos) {
  const hz = Math.exp(
    Math.log(SWEEP_MIN_HZ) +
      (Math.log(SWEEP_MAX_HZ) - Math.log(SWEEP_MIN_HZ)) * clamp(pos, 0, 1),
  );
  // Round to a resolution that reads cleanly at each end of the scale
  return hz < 1000 ? Math.round(hz) : Math.round(hz / 10) * 10;
}

function formatApoFreq(hz) {
  const value = Number(hz);
  return Number.isInteger(value) ? String(value) : String(value);
}

function formatApoGain(db) {
  const value = Number(db);
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function payloadToPeaceTxt(data) {
  const withPeaceAnchor = (points) => {
    if (points.some((f) => Number(f.frequencyHz) === 0)) return points;
    return [
      {
        frequencyHz: 0,
        leftCorrectionDb: 0,
        rightCorrectionDb: 0,
      },
      ...points,
    ];
  };

  const graphicEq = (side) =>
    withPeaceAnchor(data.frequencies)
      .map((f) => {
        const gain =
          side === "left" ? f.leftCorrectionDb : f.rightCorrectionDb;
        return `${formatApoFreq(f.frequencyHz)} ${formatApoGain(gain)}`;
      })
      .join("; ");

  return [
    "# Peace / Equalizer APO - Stereo Hearing-EQ profile",
    `# Generated ${data.createdAt}`,
    `# Strength: ${data.strengthLabel} (${(data.correctionStrength * 100).toFixed(0)}%)`,
    `# Global preamp: ${formatApoGain(data.globalPreampDb)} dB`,
    "# Drop this file into  C:\\Program Files\\EqualizerAPO\\config\\",
    "# then add  Include: hearing-eq.txt  to your active config.txt",
    "# Peace import note: the leading 0 Hz / 0 dB point is a harmless parser anchor.",
    "#",
    `Preamp: ${formatApoGain(data.globalPreampDb)} dB`,
    "",
    "Channel: L",
    `GraphicEQ: ${graphicEq("left")}`,
    "",
    "Channel: R",
    `GraphicEQ: ${graphicEq("right")}`,
    "",
  ].join("\n");
}

function payloadToApoParametricTxt(data) {
  const q = "1.41";
  const filterRows = (side) =>
    data.frequencies.map((f) => {
      const gain = side === "left" ? f.leftCorrectionDb : f.rightCorrectionDb;
      return `Filter: ON PK Fc ${formatApoFreq(
        f.frequencyHz,
      )} Hz Gain ${formatApoGain(gain)} dB Q ${q}`;
    });

  return [
    "# Equalizer APO - Stereo Hearing-EQ profile",
    `# Generated ${data.createdAt}`,
    `# Strength: ${data.strengthLabel} (${(data.correctionStrength * 100).toFixed(0)}%)`,
    `# Global preamp: ${formatApoGain(data.globalPreampDb)} dB`,
    "# Drop this file into  C:\\Program Files\\EqualizerAPO\\config\\",
    "# then add  Include: hearing-eq-apo.txt  to your active config.txt",
    "#",
    `Preamp: ${formatApoGain(data.globalPreampDb)} dB`,
    "",
    "Channel: L",
    ...filterRows("left"),
    "",
    "Channel: R",
    ...filterRows("right"),
    "",
    "Channel: all",
    "",
  ].join("\n");
}

function triggerDownload(text, mime, filename) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProfileStep({
  thresholds,
  onRestart,
  initialStrengthKey = "mild",
  initialFinetuning = null,
  autoSaveOnMount = true,
}) {
  const [strengthKey, setStrengthKey] = useState(initialStrengthKey);
  const [finetuning, setFinetuning] = useState(() =>
    Array.isArray(initialFinetuning) && initialFinetuning.length === thresholds.length
      ? initialFinetuning
      : new Array(thresholds.length).fill(0),
  );
  const [ftOpen, setFtOpen] = useState(false);
  const [ftBandIdx, setFtBandIdx] = useState(0);
  const [ftPlaying, setFtPlaying] = useState(false);
  const ftRef = useRef(null);

  const [demoPlaying, setDemoPlaying] = useState(false);
  const [demoMode, setDemoMode] = useState("after");
  const [demoTone, setDemoTone] = useState("sweep"); // "sweep" | "fixed"
  const [toneHz, setToneHz] = useState(1000);
  const [sweepSpeed, setSweepSpeed] = useState(1);
  const [sweepHz, setSweepHz] = useState(null);
  const demoRef = useRef(null);
  const [savedProfiles, setSavedProfiles] = useState(() => loadProfiles());

  const freqs = useMemo(
    () => thresholds.map((t) => t.frequencyHz),
    [thresholds],
  );
  const freqLabels = useMemo(() => freqs.map(freqLabelFromHz), [freqs]);
  const freqShort = useMemo(() => freqs.map(freqShortFromHz), [freqs]);

  // Stop all audio when unmounting
  useEffect(() => {
    return () => {
      ftRef.current?.stop();
      demoRef.current?.stop();
    };
  }, []);

  // Auto-save the initial profile the first time this step mounts.
  // buildPayload() is a function declaration below — hoisted into scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoSaveOnMount) return;
    saveProfile(buildPayload());
    setSavedProfiles(loadProfiles());
  }, [autoSaveOnMount]);

  // ── Derived correction values ──────────────────────────────────────────────

  const correction = useMemo(
    () => computeCorrection(thresholds, strengthKey),
    [thresholds, strengthKey],
  );

  const finalEq = useMemo(
    () => computeFinalEq(correction, finetuning),
    [correction, finetuning],
  );

  // Apply a global preamp if any band would boost above 0 dB (prevent clipping)
  const maxBoost = useMemo(
    () => Math.max(0, ...finalEq.flatMap((e) => [e.leftDb, e.rightDb])),
    [finalEq],
  );
  const globalPreamp = -maxBoost;

  // Per-band balance delta: right correction minus left correction.
  // Used to seed the fine-tune preview so the playback already starts at the
  // corrected position — the slider's 0 point represents "correction applied."
  const corrOffset = useMemo(
    () => correction.map((c) => c.rightCorrDb - c.leftCorrDb),
    [correction],
  );
  const ftTotalBalance = useMemo(
    () => corrOffset.map((base, i) => base + finetuning[i]),
    [corrOffset, finetuning],
  );

  const maxImbalance = useMemo(
    () =>
      Math.max(
        ...thresholds.map((t) => Math.abs(t.rightThreshDb - t.leftThreshDb)),
      ),
    [thresholds],
  );

  const RESULT_THRESHOLDS = { balancedMax: 6, mildMax: 15 };
  const largeDiffBands = useMemo(
    () =>
      thresholds.filter(
        (t) => Math.abs(t.rightThreshDb - t.leftThreshDb) > RESULT_THRESHOLDS.mildMax,
      ),
    [thresholds],
  );
  const resultState =
    maxImbalance < RESULT_THRESHOLDS.balancedMax
      ? "balanced"
      : maxImbalance <= RESULT_THRESHOLDS.mildMax
        ? "mild"
        : "large";

  // ── Fine-tune helpers ──────────────────────────────────────────────────────

  // Stop the fine-tune tone whenever the selected band changes
  useEffect(() => {
    ftRef.current?.stop();
    ftRef.current = null;
    setFtPlaying(false);
  }, [ftBandIdx]);

  const setFtBalance = (idx, val) => {
    setFinetuning((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
    // Update the playing tone in real time (correction offset + fine-tune)
    if (ftRef.current) ftRef.current.setBalanceDb(corrOffset[idx] + val);
  };

  const toggleFtPlay = () => {
    if (ftPlaying) {
      ftRef.current?.stop();
      ftRef.current = null;
      setFtPlaying(false);
    } else {
      ftRef.current = playBalanceTone({
        freq: freqs[ftBandIdx],
        baselineDb: -25,
        // Start at the corrected balance; finetuning[ftBandIdx] is the additional offset
        balanceDb: corrOffset[ftBandIdx] + finetuning[ftBandIdx],
        mode: "continuous",
      });
      setFtPlaying(true);
    }
  };

  // ── Demo helpers ───────────────────────────────────────────────────────────

  const leftBands = finalEq.map((e) => e.leftDb + globalPreamp);
  const rightBands = finalEq.map((e) => e.rightDb + globalPreamp);

  function startDemoSource(mode = demoMode, speed = sweepSpeed) {
    const useEq = mode === "after";
    return playToneSweep({
      freqs,
      leftBands: useEq ? leftBands : null,
      rightBands: useEq ? rightBands : null,
      gainDb: -10,
      cycleSec: SWEEP_BASE_SEC / speed,
      holdFreq: demoTone === "fixed" ? toneHz : null,
      minHz: SWEEP_MIN_HZ,
      maxHz: SWEEP_MAX_HZ,
    });
  }

  const toggleDemo = () => {
    if (demoPlaying) {
      demoRef.current?.stop();
      demoRef.current = null;
      setDemoPlaying(false);
      setSweepHz(null);
    } else {
      demoRef.current = startDemoSource();
      setDemoPlaying(true);
    }
  };

  const switchDemo = (mode) => {
    setDemoMode(mode);
    if (demoPlaying) {
      demoRef.current?.stop();
      demoRef.current = startDemoSource(mode, sweepSpeed);
    }
  };

  const changeSweepSpeed = (speed) => {
    setSweepSpeed(speed);
    demoRef.current?.setCycleSec(SWEEP_BASE_SEC / speed);
  };

  // Sweep <-> fixed tone switches on the live source, so the comparison
  // is not interrupted.
  const switchDemoTone = (tone) => {
    setDemoTone(tone);
    demoRef.current?.setHoldFreq(tone === "fixed" ? toneHz : null);
  };

  const pickToneHz = (hz) => {
    setToneHz(hz);
    if (demoTone === "fixed") demoRef.current?.setHoldFreq(hz);
  };

  // In fixed mode the chosen tone is shown even when stopped; while sweeping,
  // the readout follows the audio.
  const displayHz =
    demoTone === "fixed" ? toneHz : demoPlaying ? sweepHz : null;
  // Position of that tone on the log-frequency track, 0-100%
  const sweepPct = Number.isFinite(displayHz) ? hzToPos(displayHz) * 100 : 0;

  // Live frequency readout while the sweep is playing
  useEffect(() => {
    if (!demoPlaying || demoTone !== "sweep") return;
    let raf = 0;
    const tick = () => {
      const hz = demoRef.current?.getFrequency();
      if (Number.isFinite(hz)) setSweepHz(hz);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [demoPlaying, demoTone]);

  // ── Export / save helpers ──────────────────────────────────────────────────

  // function declaration so it is hoisted and available in the auto-save effect above
  function buildPayload() {
    const now = new Date();
    return {
      profileName: "EARMATCH Balance Profile",
      createdAt: now.toISOString(),
      correctionStrength: STRENGTH[strengthKey].value,
      strengthLabel: STRENGTH[strengthKey].label,
      globalPreampDb: +globalPreamp.toFixed(2),
      notes: "Relative left/right balance profile. Not a medical audiogram.",
      frequencies: thresholds.map((t, i) => ({
        frequencyHz: t.frequencyHz,
        leftThresholdDb: +t.leftThreshDb.toFixed(2),
        rightThresholdDb: +t.rightThreshDb.toFixed(2),
        differenceDb: +correction[i].differenceDb.toFixed(2),
        leftCorrectionDb: +finalEq[i].leftDb.toFixed(2),
        rightCorrectionDb: +finalEq[i].rightDb.toFixed(2),
      })),
    };
  }

  function handleSave() {
    saveProfile(buildPayload());
    setSavedProfiles(loadProfiles());
  }

  function handleDelete(id) {
    deleteProfile(id);
    setSavedProfiles(loadProfiles());
  }

  function downloadSaved(entry, fmt) {
    const dateStr = entry.savedAt.split("T")[0];
    if (fmt === "json") {
      triggerDownload(
        JSON.stringify(entry.data, null, 2),
        "application/json",
        `earmatch-balance-${dateStr}.json`,
      );
    } else if (fmt === "apo") {
      triggerDownload(
        payloadToApoParametricTxt(entry.data),
        "text/plain",
        `earmatch-apo-${dateStr}.txt`,
      );
    } else {
      triggerDownload(
        payloadToPeaceTxt(entry.data),
        "text/plain",
        `earmatch-peace-${dateStr}.txt`,
      );
    }
  }

  const exportProfile = (fmt) => {
    const payload = buildPayload();
    const dateStr = new Date().toISOString().split("T")[0];
    if (fmt === "json") {
      triggerDownload(
        JSON.stringify(payload, null, 2),
        "application/json",
        `earmatch-balance-${dateStr}.json`,
      );
    } else if (fmt === "apo") {
      triggerDownload(
        payloadToApoParametricTxt(payload),
        "text/plain",
        `earmatch-apo-${dateStr}.txt`,
      );
    } else {
      triggerDownload(
        payloadToPeaceTxt(payload),
        "text/plain",
        `earmatch-peace-${dateStr}.txt`,
      );
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="screen profile">
      <div className="screen-h">
        <div className="screen-h-top">
          <div className="kicker accent">Step 03 · Profile</div>
          <button className="ghost ghost-sm" onClick={onRestart}>
            <Icon.Restart /> Back to start
          </button>
        </div>
        <h2>Your left/right balance profile.</h2>
        <p className="lede">
          {resultState === "large" ? (
            <>
              <span className="large-diff-warn">
                <Icon.Warn /> Large left/right differences were found at some
                frequencies.
              </span>
              <br />
              Maximum measured difference: {maxImbalance.toFixed(1)}
              &thinsp;dB. Retest the highlighted bands before using strong
              correction. If this matches what you notice in everyday
              listening, consider consulting an audiologist.
            </>
          ) : resultState === "mild" ? (
            "Small left/right differences were found. A mild correction is recommended as a safe starting point."
          ) : (
            "Your results look mostly balanced across the tested frequencies. You can still fine-tune the profile by ear before exporting it."
          )}
        </p>
      </div>

      {/* ── Threshold results table ──────────────────────────────── */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-num">T</div>
          <div className="panel-title">Listening measurements</div>
          <div className="panel-legend">
            <span className="lg lg-l">
              <i /> Left ear
            </span>
            <span className="lg lg-r">
              <i /> Right ear
            </span>
          </div>
        </div>
        <div className="thresh-table">
          <div className="tt-row tt-hd">
            <span>Frequency</span>
            <span>Left level</span>
            <span>Right level</span>
            <span>Difference</span>
            <span>Weaker side</span>
          </div>
          {thresholds.map((t) => {
            const diff = t.rightThreshDb - t.leftThreshDb;
            const isLargeDiff = Math.abs(diff) > RESULT_THRESHOLDS.mildMax;
            const weaker =
              Math.abs(diff) < BALANCE_THRESHOLD_DB
                ? "balanced"
                : diff > 0
                  ? "right"
                  : "left";
            return (
              <div
                key={t.frequencyHz}
                className={`tt-row${isLargeDiff ? " tt-row-large" : ""}`}
              >
                <span className="tt-f">
                  {freqLabelFromHz(t.frequencyHz)}
                </span>
                <span className="tt-v">{fmtDb(t.leftThreshDb)} dBFS</span>
                <span className="tt-v">{fmtDb(t.rightThreshDb)} dBFS</span>
                <span
                  className={`tt-d${Math.abs(diff) >= 6 ? " tt-large" : ""}`}
                >
                  {fmtDb(diff)} dB
                </span>
                <span className={`tt-weaker tt-weaker-${weaker}`}>
                  {weaker}
                </span>
              </div>
            );
          })}
        </div>
        <p className="panel-body" style={{ marginTop: 10 }}>
          Lower dBFS values mean the tone was heard at a quieter level. Large
          differences may be affected by headphone fit, room noise, or test
          timing.
        </p>
        {resultState === "large" && largeDiffBands.length > 0 && (
          <p className="panel-body" style={{ marginTop: 6 }}>
            Retest suggested for:{" "}
            {largeDiffBands
              .map((t) => freqLabelFromHz(t.frequencyHz))
              .join(", ")}
            .
          </p>
        )}
      </div>

      {/* ── Correction profile ───────────────────────────────────── */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-num">EQ</div>
          <div className="panel-title">Correction profile</div>
        </div>

        <div className="strength-selector">
          {Object.entries(STRENGTH).map(([key, s]) => (
            <button
              key={key}
              className={`strength-btn${strengthKey === key ? " is-on" : ""}`}
              onClick={() => setStrengthKey(key)}
            >
              <span className="stn-name">{s.label}</span>
              <span className="stn-desc">{s.desc}</span>
            </button>
          ))}
        </div>

        <CurveChart
          leftData={correction.map((c) => c.leftCorrDb)}
          rightData={correction.map((c) => c.rightCorrDb)}
          labels={freqShort}
        />
        <div
          className="panel-legend"
          style={{ marginTop: 8, justifyContent: "flex-start", gap: 18 }}
        >
          <span className="lg lg-l">
            <i /> Left channel EQ
          </span>
          <span className="lg lg-r">
            <i /> Right channel EQ
          </span>
        </div>
        <p className="panel-body" style={{ margin: "8px 0 0" }}>
          Corrections prefer reducing the louder side instead of boosting the
          quieter side.
        </p>

        <div className="readout-table" style={{ marginTop: 12 }}>
          <div className="rt-hd">
            <span>Hz</span>
            <span>Left EQ</span>
            <span>Right EQ</span>
            <span>Left/right difference after correction</span>
          </div>
          {correction.map((c, i) => (
            <div key={c.frequencyHz} className="rt-row">
              <span className="rt-f">{freqShort[i]}</span>
              <span className={`rt-v${c.leftCorrDb < -0.1 ? " neg" : ""}`}>
                {fmtDb(c.leftCorrDb)} dB
              </span>
              <span className={`rt-v${c.rightCorrDb < -0.1 ? " neg" : ""}`}>
                {fmtDb(c.rightCorrDb)} dB
              </span>
              <span className="rt-d">
                {fmtDb(c.rightCorrDb - c.leftCorrDb)} dB
              </span>
            </div>
          ))}
        </div>

        {globalPreamp < -0.1 && (
          <div className="preamp-note">
            <Icon.Warn /> Global preamp: {fmtDb(globalPreamp)} dB applied to
            prevent clipping.
          </div>
        )}
      </div>

      {/* ── Fine-tuning (collapsible) ────────────────────────────── */}
      <div className="panel">
        <button
          className="finetune-toggle"
          onClick={() => setFtOpen((o) => !o)}
        >
          <div className="panel-num">&plusmn;</div>
          <div className="finetune-toggle-text">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="panel-title" style={{ margin: 0 }}>
                Center-balance fine-tuning
              </span>
              <span className="opt-tag">optional</span>
            </div>
            <div className="finetune-toggle-sub">
              Play each band and nudge the balance until the tone feels equally
              loud in both ears, centered in your head. Fine-tune at a
              comfortable listening volume.
            </div>
          </div>
          <div className="expand-caret">{ftOpen ? "\u25b2" : "\u25bc"}</div>
        </button>

        {ftOpen && (
          <div className="finetune-body">
            <p className="ft-intro">
              Each band plays at your <strong>corrected balance</strong> as a
              starting point. If a tone already feels centered, no change is
              needed. If it feels shifted &mdash; say, more in the left ear than
              the right &mdash; nudge the slider until it sits equally in both,
              as if the sound is coming from the
              <em> middle of your head</em>.
            </p>
            <div className="band-strip-wrap">
              <div className="band-strip">
                {freqs.map((_, i) => (
                  <button
                    key={i}
                    className={`band-cell ${i === ftBandIdx ? "band-active" : "band-idle"}`}
                    onClick={() => setFtBandIdx(i)}
                  >
                    <span className="band-label">{freqShort[i]}</span>
                    <span className="band-unit">Hz</span>
                    <span className="band-val">
                        {Math.abs(ftTotalBalance[i]) < 0.05
                          ? "\u2014"
                        : fmtDb(ftTotalBalance[i], 1)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="ft-play-row">
              <button
                className={`big-play ${ftPlaying ? "is-on" : ""} accent`}
                onClick={toggleFtPlay}
              >
                {ftPlaying ? <Icon.Pause /> : <Icon.Play />}
                <span>
                  {ftPlaying
                    ? "Playing\u2026"
                    : `Play ${freqLabels[ftBandIdx]}`}
                </span>
              </button>
            </div>

            <div className="balance-slider">
              <div className="bs-labels">
                <span>&larr; Tone too right</span>
                <span className="bs-val">
                  {ftTotalBalance[ftBandIdx] > 0 ? "+" : ""}
                  {ftTotalBalance[ftBandIdx].toFixed(1)}
                  <span className="bs-unit"> dB</span>
                </span>
                <span>Tone too left &rarr;</span>
              </div>
              <p className="panel-body" style={{ marginTop: 8 }}>
                Loaded correction: {fmtDb(corrOffset[ftBandIdx], 1)} dB &middot;
                Fine-tune offset: {fmtDb(finetuning[ftBandIdx], 1)} dB
              </p>
              <input
                type="range"
                min={-8}
                max={8}
                step={0.1}
                value={finetuning[ftBandIdx]}
                onChange={(e) =>
                  setFtBalance(ftBandIdx, Number(e.target.value))
                }
                className="bs-input"
              />
              <div className="bs-fine">
                <button
                  onClick={() =>
                    setFtBalance(
                      ftBandIdx,
                      clamp(finetuning[ftBandIdx] - 0.5, -8, 8),
                    )
                  }
                >
                  &minus;0.5
                </button>
                <button
                  onClick={() =>
                    setFtBalance(
                      ftBandIdx,
                      clamp(finetuning[ftBandIdx] - 0.1, -8, 8),
                    )
                  }
                >
                  &minus;0.1
                </button>
                <button
                  onClick={() => setFtBalance(ftBandIdx, 0)}
                  className="bs-zero"
                >
                  Reset to correction
                </button>
                <button
                  onClick={() =>
                    setFtBalance(
                      ftBandIdx,
                      clamp(finetuning[ftBandIdx] + 0.1, -8, 8),
                    )
                  }
                >
                  +0.1
                </button>
                <button
                  onClick={() =>
                    setFtBalance(
                      ftBandIdx,
                      clamp(finetuning[ftBandIdx] + 0.5, -8, 8),
                    )
                  }
                >
                  +0.5
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Before / after preview ───────────────────────────────── */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-num">A/B</div>
          <div className="panel-title">Before / after comparison</div>
        </div>
        <p className="panel-body">
          A tone plays while you toggle between <strong>Flat</strong> and{" "}
          <strong>Corrected</strong>. Listen for the sound staying centered
          instead of drifting left or right. Use the <strong>sweep</strong> to
          cover the whole range, or hold a <strong>single tone</strong> at any
          frequency up to 14 kHz.
        </p>

        <div className="ba-toggle" style={{ marginBottom: 12 }}>
          <button
            className={demoTone === "sweep" ? "is-on" : ""}
            onClick={() => switchDemoTone("sweep")}
          >
            Full sweep
          </button>
          <button
            className={demoTone === "fixed" ? "is-on" : ""}
            onClick={() => switchDemoTone("fixed")}
          >
            Single tone
          </button>
        </div>

        <div className="sweep-readout">
          <div className="sweep-hz">{fmtSweepHz(displayHz)}</div>
          <div className="sweep-track">
            <div
              className="sweep-dot"
              style={{ left: `${sweepPct}%`, opacity: demoPlaying ? 1 : 0.4 }}
            />
          </div>
          <div className="sweep-ends">
            <span>{fmtSweepHz(SWEEP_MIN_HZ)}</span>
            <span>{fmtSweepHz(SWEEP_MAX_HZ)}</span>
          </div>
        </div>

        {demoTone === "sweep" ? (
          <div className="db-slider" style={{ marginBottom: 10 }}>
            <div className="db-labels">
              <span>Sweep speed</span>
              <span className="db-val">
                {sweepSpeed.toFixed(1)}&times;
                <span className="bs-unit">
                  {" "}
                  &middot; {(SWEEP_BASE_SEC / sweepSpeed).toFixed(1)} s / cycle
                </span>
              </span>
            </div>
            <input
              type="range"
              min={SWEEP_SPEED_MIN}
              max={SWEEP_SPEED_MAX}
              step={0.1}
              value={sweepSpeed}
              onChange={(e) => changeSweepSpeed(Number(e.target.value))}
            />
            <div className="db-ticks">
              <span>Slow</span>
              <span>Fast</span>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 10 }}>
            <div className="db-slider">
              <div className="db-labels">
                <span>Tone frequency</span>
                <span className="db-val">{fmtSweepHz(toneHz)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={TONE_STEPS}
                step={1}
                value={Math.round(hzToPos(toneHz) * TONE_STEPS)}
                onChange={(e) =>
                  pickToneHz(posToHz(Number(e.target.value) / TONE_STEPS))
                }
              />
              <div className="db-ticks">
                <span>{fmtSweepHz(SWEEP_MIN_HZ)}</span>
                <span>{fmtSweepHz(SWEEP_MAX_HZ)}</span>
              </div>
            </div>
            <div className="band-strip-wrap" style={{ marginTop: 8 }}>
              <div className="band-strip">
                {freqs.map((f, i) => (
                  <button
                    key={f}
                    className={`band-cell ${f === toneHz ? "band-active" : "band-idle"}`}
                    onClick={() => pickToneHz(f)}
                  >
                    <span className="band-label">{freqShort[i]}</span>
                    <span className="band-unit">Hz</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="ba-toggle">
          <button
            className={demoMode === "before" ? "is-on" : ""}
            onClick={() => switchDemo("before")}
          >
            Flat &middot; no correction
          </button>
          <button
            className={demoMode === "after" ? "is-on" : ""}
            onClick={() => switchDemo("after")}
          >
            Corrected &middot; profile on
          </button>
        </div>
        <button
          className={`big-play ${demoPlaying ? "is-on" : ""} accent`}
          onClick={toggleDemo}
        >
          {demoPlaying ? <Icon.Pause /> : <Icon.Play />}
          <span>{demoPlaying ? "Stop preview" : "Play preview"}</span>
        </button>
      </div>

      {/* ── Save & export ──────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-h">
          <div className="panel-num">&darr;</div>
          <div className="panel-title">Save &amp; export</div>
        </div>

        {/* Browser-storage notice */}
        <div className="storage-notice">
          <Icon.Check />
          <div>
            Your profile is{" "}
            <strong>automatically saved in this browser on this device</strong>
            . It will stay here until you clear this site&apos;s data. No
            account or server is involved.
          </div>
        </div>

        {/* Save current version */}
        <div className="save-row">
          <button className="cta secondary" onClick={handleSave}>
            <Icon.Download /> Save current version
          </button>
        </div>

        {/* File export */}
        <p className="panel-body" style={{ margin: "10px 0 8px" }}>
          Export a Peace-friendly TXT, a plain Equalizer APO TXT, or a JSON
          backup that can be imported back into this app.
        </p>
        <div className="export-row">
          <button
            className="cta secondary"
            onClick={() => exportProfile("peace")}
          >
            <Icon.Download /> Peace .txt
          </button>
          <button
            className="cta secondary"
            onClick={() => exportProfile("apo")}
          >
            <Icon.Download /> APO .txt
          </button>
          <button className="cta" onClick={() => exportProfile("json")}>
            <Icon.Download /> Backup .json
          </button>
        </div>

        {/* Saved profiles history */}
        {savedProfiles.length > 0 && (
          <div className="saved-profiles">
            <div className="saved-profiles-h">
              Saved in this browser &mdash; {savedProfiles.length}{" "}
              {savedProfiles.length === 1 ? "profile" : "profiles"}
            </div>
            {savedProfiles.map((entry) => (
              <div key={entry.id} className="saved-entry">
                <div className="saved-entry-info">
                  <span className="saved-entry-date">
                    {fmtDate(entry.savedAt)}
                  </span>
                  <span className="saved-entry-strength">
                    {entry.strengthLabel}
                  </span>
                </div>
                <div className="saved-entry-actions">
                  <button
                    className="saved-dl-btn"
                    onClick={() => downloadSaved(entry, "peace")}
                    title="Download Peace .txt"
                  >
                    <Icon.Download /> Peace
                  </button>
                  <button
                    className="saved-dl-btn"
                    onClick={() => downloadSaved(entry, "apo")}
                    title="Download Equalizer APO .txt"
                  >
                    <Icon.Download /> APO
                  </button>
                  <button
                    className="saved-dl-btn"
                    onClick={() => downloadSaved(entry, "json")}
                    title="Download backup .json"
                  >
                    <Icon.Download /> .json
                  </button>
                  <button
                    className="saved-del-btn"
                    onClick={() => handleDelete(entry.id)}
                    title="Delete this saved profile"
                  >
                    <Icon.Trash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="disclaimer">
          This is a personal headphone balance profile based on relative
          left/right listening measurements. It is not a medical audiogram or
          clinical hearing test. Consult an audiologist if you have concerns
          about your hearing.
        </p>
      </div>

      <div className="results-footer">
        <button className="ghost" onClick={onRestart}>
          <Icon.Restart /> Start over
        </button>
      </div>
    </div>
  );
}

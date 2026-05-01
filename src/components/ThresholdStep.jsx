// ThresholdStep.jsx — per-ear ascending-method threshold measurement (Step 2)

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { playTone } from "../audio-engine.js";
import {
  FREQS,
  FREQ_START_DB,
  freqLabelFromHz,
  freqShortFromHz,
  MAX_DB,
  STEP_DB,
  RAMP_MS,
  REPEATS,
} from "../constants.js";
import { buildSequence, computeThresholds, fmtDb, clamp } from "../lib/dsp.js";
import { Icon } from "./icons.jsx";

export function ThresholdStep({ onDone, bandPreset }) {
  const freqs = bandPreset?.freqs ?? FREQS;
  const startDbByBand = bandPreset?.startDb ?? FREQ_START_DB;
  const freqLabels = useMemo(() => freqs.map(freqLabelFromHz), [freqs]);
  const freqShort = useMemo(() => freqs.map(freqShortFromHz), [freqs]);
  const sequence = useMemo(() => buildSequence(freqs, REPEATS), [freqs]);
  const perFreqMeasures = 2 * REPEATS;

  const [seqIdx, setSeqIdx] = useState(0);
  const [phase, setPhase] = useState("ready"); // 'ready' | 'playing' | 'recorded'
  // Initial start dB for the first measured band
  const [currentDb, setCurrentDb] = useState(startDbByBand[0]);

  // Use refs for values read inside intervals/timeouts to avoid stale closures
  const rawRef = useRef(new Array(sequence.length).fill(null));
  const toneRef = useRef(null);
  const rampRef = useRef(null);
  const dbRef = useRef(startDbByBand[0]);
  const previewRef = useRef(null);
  const [previewing, setPreviewing] = useState(false);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (rampRef.current) clearInterval(rampRef.current);
      toneRef.current?.stop();
      previewRef.current?.stop();
    };
  }, []);

  const stopAll = useCallback(() => {
    if (rampRef.current) {
      clearInterval(rampRef.current);
      rampRef.current = null;
    }
    if (toneRef.current) {
      toneRef.current.stop();
      toneRef.current = null;
    }
  }, []);

  const cur = sequence[seqIdx];
  const pct = Math.round((seqIdx / sequence.length) * 100);
  const startDb = startDbByBand[cur?.freqIdx ?? 0];
  const volPct = Math.round(((currentDb - startDb) / (MAX_DB - startDb)) * 100);

  // ── Preview (reference tone at a comfortable volume) ───────────────────────

  /** Stop the preview tone if it's running. */
  function stopPreview() {
    if (previewRef.current) {
      previewRef.current.stop();
      previewRef.current = null;
    }
    setPreviewing(false);
  }

  /**
   * Toggle a reference preview of the current tone at a comfortable volume
   * (-18 dBFS) so the user can identify the sound before the ramp starts.
   */
  function togglePreview() {
    if (previewing) {
      stopPreview();
    } else {
      previewRef.current = playTone({
        freq: freqs[cur.freqIdx],
        ear: cur.ear === "left" ? "L" : "R",
        gainDb: -18,
        attackMs: 60,
      });
      setPreviewing(true);
    }
  }

  /** Record a threshold measurement and advance to the next. */
  function recordResult(db, idx) {
    stopAll();
    stopPreview();
    rawRef.current[idx] = db;
    setPhase("recorded");

    setTimeout(() => {
      const next = idx + 1;
      if (next >= sequence.length) {
        // All done — compute thresholds and hand off to parent
        onDone(computeThresholds(rawRef.current, freqs, REPEATS));
      } else {
        const nextStartDb = startDbByBand[sequence[next].freqIdx];
        setSeqIdx(next);
        setPhase("ready");
        dbRef.current = nextStartDb;
        setCurrentDb(nextStartDb);
        // preview is already stopped by recordResult above
      }
    }, 1000);
  }

  /** Start the ascending ramp for the current measurement. */
  function startTest() {
    // Capture idx and startDb at call time — ramp interval must not read stale state
    const idx = seqIdx;
    const curStartDb = startDbByBand[cur.freqIdx];
    stopAll();
    stopPreview(); // dismiss the reference preview when the real test starts
    dbRef.current = curStartDb;
    setCurrentDb(curStartDb);
    setPhase("playing");

    toneRef.current = playTone({
      freq: freqs[cur.freqIdx],
      ear: cur.ear === "left" ? "L" : "R",
      gainDb: curStartDb,
      attackMs: 40,
    });

    rampRef.current = setInterval(() => {
      const next = clamp(dbRef.current + STEP_DB, curStartDb, MAX_DB);
      dbRef.current = next;
      setCurrentDb(next);
      toneRef.current?.setGainDb(next);
      // If we hit the ceiling the user probably cannot hear this tone —
      // auto-record at MAX_DB so the test can continue
      if (next >= MAX_DB) recordResult(MAX_DB, idx);
    }, RAMP_MS);
  }

  // Guard: if sequence is exhausted (shouldn't normally be visible)
  if (!cur) {
    return (
      <div className="screen threshold">
        <p style={{ color: "var(--fg-3)" }}>Processing&hellip;</p>
      </div>
    );
  }

  const freqsDoneCount = Math.min(
    Math.floor(seqIdx / perFreqMeasures) + 1,
    freqs.length,
  );

  return (
    <div className="screen threshold">
      {/* ── Header ── */}
      <div className="thresh-header">
        <div>
          <div className="kicker accent">Step 02 · Ear test</div>
          <h2>Find the quietest tone you can hear.</h2>
        </div>
        <div className="cal-progress">
          <div className="cal-progress-meta">
            <span>
              Frequency {freqsDoneCount}/{freqs.length}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="cal-progress-track">
            <div className="cal-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <p className="lede" style={{ marginTop: -8 }}>
        Each tone plays in <em>one ear only</em>. It starts very quietly and
        slowly gets louder. Press <strong>&ldquo;I can hear it&rdquo;</strong>{" "}
        as soon as you first notice the sound, even if it is barely
        perceptible. Do not wait until it becomes loud.
      </p>

      {/* ── Test card ── */}
      <div className="test-card">
        <div className="test-info-row">
          <div className={`ear-badge ear-${cur.ear}`}>
            {cur.ear === "left" ? "\u2190 Left ear" : "Right ear \u2192"}
          </div>
          <div className="test-freq-num">{freqLabels[cur.freqIdx]}</div>
          <div className="test-meas-meta">
            Measurement {cur.repeatIdx + 1} of {REPEATS}
          </div>
        </div>

        {/* Volume ramp indicator */}
        <div className="vol-indicator">
          <div className="vol-track">
            <div
              className="vol-fill"
              style={{ width: phase === "playing" ? `${volPct}%` : "0%" }}
            />
          </div>
          <div className="vol-row">
            <span className="vol-side">Quiet</span>
            <span className={`vol-center${phase === "playing" ? "" : " is-idle"}`}>
              {phase === "playing"
                ? `${fmtDb(currentDb)} dBFS`
                : phase === "recorded"
                  ? "Recorded"
                  : "Ready"}
            </span>
            <span className="vol-side">Louder</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="test-actions">
          {phase === "ready" && (
            <div className="ready-actions">
              <button className="cta btn-start-tone" onClick={startTest}>
                <Icon.Play /> Start tone
              </button>
              <button
                className={`preview-ref-btn${previewing ? " is-on" : ""}`}
                onClick={togglePreview}
              >
                {previewing ? <Icon.Pause /> : <Icon.Play />}
                {previewing ? "Stop preview" : "Preview tone"}
              </button>
            </div>
          )}
          {phase === "playing" && (
            <button
              className="btn-heard"
              onClick={() => recordResult(dbRef.current, seqIdx)}
            >
              I can hear it &#10003;
            </button>
          )}
          {phase === "recorded" && (
            <div className="recorded-msg">
              <Icon.Check /> Recorded at{" "}
              {fmtDb(rawRef.current[seqIdx] ?? currentDb)} dBFS
            </div>
          )}
        </div>

        {phase === "playing" && (
          <button
            className="skip-link"
            onClick={() => recordResult(MAX_DB, seqIdx)}
          >
            Can&apos;t hear it at maximum volume &mdash; skip
          </button>
        )}
      </div>

      {/* ── Instruction hint ── */}
      <div className="panel hint-panel">
        <p className="panel-body">
          {phase === "ready"
            ? previewing
              ? `This is what ${freqLabels[cur.freqIdx]} sounds like in your ${cur.ear} ear. Listen carefully, then stop the preview and start the tone test.`
              : `Ready to test ${freqLabels[cur.freqIdx]} in your ${cur.ear} ear. You can preview the tone first. When you start the test, the tone begins very quietly and rises slowly.`
            : phase === "playing"
              ? "The tone is getting louder. Press the button the instant you can barely detect it."
              : "Noted. Moving to the next measurement shortly\u2026"}
        </p>
      </div>

      {/* ── Frequency progress dots ── */}
      <div className="band-dots">
        {freqs.map((_, fi) => {
          const seqStart = fi * perFreqMeasures;
          const seqEnd = seqStart + perFreqMeasures;
          const isDone = seqIdx >= seqEnd;
          const isActive = seqIdx >= seqStart && seqIdx < seqEnd;
          return (
            <div
              key={fi}
              className={`bdot-item${isDone ? " done" : isActive ? " active" : ""}`}
              title={freqLabels[fi]}
            >
              <div className="bdot" />
              <span className="bdot-label">{freqShort[fi]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

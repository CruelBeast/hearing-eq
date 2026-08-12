// SetupStep.jsx — headphone selection + quiet-room check (Step 1)

import { useState, useRef, useEffect, useMemo } from "react";
import {
  CUSTOM_FREQ_MAX_HZ,
  CUSTOM_FREQ_MIN_HZ,
  DEFAULT_BAND_PRESET,
  REPEATS,
  TEST_BAND_PRESETS,
  freqLabelFromHz,
} from "../constants.js";
import { playDemo } from "../audio-engine.js";
import { loadProfiles, saveProfile } from "../lib/storage.js";
import { Icon } from "./icons.jsx";

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildFrequencyLinePath(width, height, tSec, phase = 0) {
  const steps = 30;
  const baseY = height * 0.58;
  const ampMain = height * 0.16;
  const ampDetail = height * 0.06;
  const speedA = tSec * 0.9 + phase;
  const speedB = tSec * 1.4 - phase * 0.6;

  let d = "";
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    const x = p * width;
    const y =
      baseY +
      Math.sin(p * Math.PI * 2 * 1.7 + speedA) * ampMain +
      Math.sin(p * Math.PI * 2 * 3.1 + speedB) * ampDetail;
    d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

export function SetupStep({
  onDone,
  onOpenSaved,
  bandPresetId = DEFAULT_BAND_PRESET,
  onBandPresetChange,
  customFreqs = TEST_BAND_PRESETS[DEFAULT_BAND_PRESET].freqs,
  onCustomFreqsChange,
}) {
  const [quietConfirmed, setQuietConfirmed] = useState(false);
  const [volPlaying, setVolPlaying] = useState(false);
  const [savedProfiles, setSavedProfiles] = useState(() => loadProfiles());
  const [importStatus, setImportStatus] = useState("");
  const importInputRef = useRef(null);
  const volRef = useRef(null);
  const heroSvgRef = useRef(null);
  const heroWaveRef = useRef(null);
  const heroWaveRef2 = useRef(null);
  const customMode = bandPresetId === "custom";
  const customFreqList =
    Array.isArray(customFreqs) && customFreqs.length > 0
      ? customFreqs
      : TEST_BAND_PRESETS[DEFAULT_BAND_PRESET].freqs;
  // Indices that repeat a frequency used by an earlier band — highlighted in
  // the grid and reported separately from the range/order problems.
  const duplicateIdx = useMemo(() => {
    const firstSeenAt = new Map();
    const dupes = new Set();
    customFreqList.forEach((value, i) => {
      const hz = Number(value);
      if (!Number.isFinite(hz)) return;
      if (firstSeenAt.has(hz)) {
        dupes.add(firstSeenAt.get(hz));
        dupes.add(i);
      } else {
        firstSeenAt.set(hz, i);
      }
    });
    return dupes;
  }, [customFreqList]);

  const customError = useMemo(() => {
    if (!customMode) return null;
    if (customFreqList.length < 3 || customFreqList.length > 12) {
      return "Custom mode requires 3 to 12 bands.";
    }
    for (let i = 0; i < customFreqList.length; i++) {
      const hz = Number(customFreqList[i]);
      if (!Number.isFinite(hz) || hz < CUSTOM_FREQ_MIN_HZ || hz > CUSTOM_FREQ_MAX_HZ) {
        return `Each frequency must be between ${freqLabelFromHz(
          CUSTOM_FREQ_MIN_HZ,
        )} and ${freqLabelFromHz(CUSTOM_FREQ_MAX_HZ)}.`;
      }
    }
    if (duplicateIdx.size > 0) {
      const bands = [...duplicateIdx].sort((a, b) => a - b).map((i) => i + 1);
      return `Each frequency can only be tested once — bands ${bands.join(
        ", ",
      )} repeat a value.`;
    }
    for (let i = 1; i < customFreqList.length; i++) {
      if (Number(customFreqList[i]) < Number(customFreqList[i - 1])) {
        return "Frequencies must be in increasing order.";
      }
    }
    return null;
  }, [customMode, customFreqList, duplicateIdx]);
  const ready = quietConfirmed && !customError;
  const activePreset =
    customMode
      ? {
          freqs: customFreqList,
          desc: `${customFreqList.length} bands · editable`,
        }
      : TEST_BAND_PRESETS[bandPresetId] ??
        TEST_BAND_PRESETS[DEFAULT_BAND_PRESET];
  const activeFreqs = activePreset.freqs;
  const rangeLabel = `${freqLabelFromHz(activeFreqs[0])} – ${freqLabelFromHz(
    activeFreqs[activeFreqs.length - 1],
  )}`;
  const estMinutes = Math.max(
    3,
    Math.round((activeFreqs.length * 2 * REPEATS * 9) / 60),
  );

  // Stop demo audio if the component unmounts (user navigates away)
  useEffect(() => {
    return () => {
      volRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const svg = heroSvgRef.current;
    const lineA = heroWaveRef.current;
    const lineB = heroWaveRef2.current;
    if (!svg || !lineA || !lineB) return;

    let width = 0;
    let height = 0;
    let rafId = null;

    const updateSize = () => {
      const rect = svg.getBoundingClientRect();
      width = Math.max(320, rect.width);
      height = Math.max(160, rect.height);
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    };

    const ro = new ResizeObserver(updateSize);
    ro.observe(svg);
    updateSize();

    const animate = (ts) => {
      const tSec = ts / 1000;
      lineA.setAttribute("d", buildFrequencyLinePath(width, height, tSec, 0));
      lineB.setAttribute("d", buildFrequencyLinePath(width, height, tSec, 0.9));
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  function toggleVolCheck() {
    if (volPlaying) {
      volRef.current?.stop();
      volRef.current = null;
      setVolPlaying(false);
    } else {
      // -6 dBFS: close to normal-music level so the user calibrates against
      // a realistic volume, not an artificially quiet reference.
      volRef.current = playDemo({ gainDb: -6 });
      setVolPlaying(true);
    }
  }

  function openSavedProfile(entry) {
    if (!entry || !onOpenSaved) return;
    volRef.current?.stop();
    volRef.current = null;
    setVolPlaying(false);
    onOpenSaved(entry);
  }

  function normalizeImportedProfile(payload) {
    const rows = payload?.frequencies;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("That JSON does not contain profile frequencies.");
    }

    const frequencies = rows.map((row) => {
      const frequencyHz = Number(row.frequencyHz);
      const leftThresholdDb = Number(row.leftThresholdDb);
      const rightThresholdDb = Number(row.rightThresholdDb);
      const differenceDb = Number(row.differenceDb);
      const leftCorrectionDb = Number(row.leftCorrectionDb);
      const rightCorrectionDb = Number(row.rightCorrectionDb);

      if (
        !Number.isFinite(frequencyHz) ||
        !Number.isFinite(leftThresholdDb) ||
        !Number.isFinite(rightThresholdDb)
      ) {
        throw new Error("That JSON is missing required threshold values.");
      }

      return {
        frequencyHz,
        leftThresholdDb,
        rightThresholdDb,
        differenceDb: Number.isFinite(differenceDb)
          ? differenceDb
          : rightThresholdDb - leftThresholdDb,
        leftCorrectionDb: Number.isFinite(leftCorrectionDb)
          ? leftCorrectionDb
          : 0,
        rightCorrectionDb: Number.isFinite(rightCorrectionDb)
          ? rightCorrectionDb
          : 0,
      };
    });

    return {
      profileName: payload.profileName || "Imported EARMATCH Balance Profile",
      createdAt: payload.createdAt || new Date().toISOString(),
      correctionStrength: Number(payload.correctionStrength) || 0.65,
      strengthLabel: payload.strengthLabel || "Normal",
      globalPreampDb: Number(payload.globalPreampDb) || 0,
      notes:
        payload.notes ||
        "Relative left/right balance profile. Not a medical audiogram.",
      frequencies,
    };
  }

  async function handleImportJson(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const payload = normalizeImportedProfile(JSON.parse(await file.text()));
      const id = saveProfile(payload);
      const nextProfiles = loadProfiles();
      setSavedProfiles(nextProfiles);
      setImportStatus("Imported JSON backup.");
      const imported = nextProfiles.find((entry) => entry.id === id);
      if (imported) openSavedProfile(imported);
    } catch (error) {
      setImportStatus(error.message || "Could not import that JSON file.");
    }
  }

  function clampCount(n) {
    return Math.max(3, Math.min(12, n));
  }

  // A new band must not land on a frequency that is already tested: continue
  // the series above the top band when there is room, otherwise fill the
  // widest remaining gap, and in either case step to the nearest free value.
  function suggestNextFreq(freqs) {
    const used = new Set(
      freqs.map((f) => Math.round(Number(f))).filter(Number.isFinite),
    );
    if (used.size === 0) return 125;

    const isFree = (hz) =>
      hz >= CUSTOM_FREQ_MIN_HZ && hz <= CUSTOM_FREQ_MAX_HZ && !used.has(hz);
    const freeFrom = (hz) => {
      for (let v = Math.round(hz); v <= CUSTOM_FREQ_MAX_HZ; v++) {
        if (isFree(v)) return v;
      }
      return null;
    };
    const nearestFree = (hz) => {
      const start = Math.round(hz);
      for (let d = 0; d <= CUSTOM_FREQ_MAX_HZ - CUSTOM_FREQ_MIN_HZ; d++) {
        if (isFree(start + d)) return start + d;
        if (isFree(start - d)) return start - d;
      }
      return null;
    };

    const sorted = [...used].sort((a, b) => a - b);
    const last = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : last / 2;
    const ratio = Math.max(1.2, Math.min(last / Math.max(prev, 1), 2));
    const above = Math.round(last * ratio);
    // Continue the series above the top band, or split what is left up to the
    // ceiling once that would overshoot.
    const target =
      above <= CUSTOM_FREQ_MAX_HZ
        ? above
        : Math.round(Math.sqrt(last * CUSTOM_FREQ_MAX_HZ));
    const higher = freeFrom(target);
    if (higher !== null) return higher;

    // Top of the range is full — split the widest gap on the log scale instead
    let gapHz = null;
    let widest = 1;
    for (let i = 1; i < sorted.length; i++) {
      const r = sorted[i] / sorted[i - 1];
      if (r > widest) {
        widest = r;
        gapHz = Math.round(Math.sqrt(sorted[i] * sorted[i - 1]));
      }
    }
    return nearestFree(gapHz ?? CUSTOM_FREQ_MIN_HZ) ?? last;
  }

  function handleCustomCountChange(value) {
    if (!onCustomFreqsChange) return;
    const count = clampCount(Math.round(Number(value) || customFreqList.length));
    let next = [...customFreqList];
    if (count > next.length) {
      while (next.length < count) {
        const hz = suggestNextFreq(next);
        // Insert in place so an ordered list stays ordered
        const at = next.findIndex((f) => Number(f) > hz);
        if (at === -1) next.push(hz);
        else next.splice(at, 0, hz);
      }
    } else {
      next = next.slice(0, count);
    }
    onCustomFreqsChange(next);
  }

  function incrementBandCount() {
    handleCustomCountChange(customFreqList.length + 1);
  }

  function decrementBandCount() {
    handleCustomCountChange(customFreqList.length - 1);
  }

  function handleCustomFreqChange(idx, value) {
    if (!onCustomFreqsChange) return;
    const next = [...customFreqList];
    next[idx] = Number(value);
    onCustomFreqsChange(next);
  }

  function sortCustomFrequencies() {
    if (!onCustomFreqsChange) return;
    onCustomFreqsChange([...customFreqList].sort((a, b) => a - b));
  }

  return (
    <div className="screen setup">
      <div className="hero setup-hero">
        <svg className="hero-wave" ref={heroSvgRef} aria-hidden="true">
          <path className="hero-wave-line hero-wave-line-soft" ref={heroWaveRef2} />
          <path className="hero-wave-line" ref={heroWaveRef} />
        </svg>
        <div className="hero-overlay">
          <div className="kicker accent">Step 01 · Setup</div>
          <h1 className="setup-hero-title">
            Build a left/right EQ profile
            <br />
            for your headphones.
          </h1>
          <p className="setup-hero-text">
            This tool checks each ear separately and creates a personal stereo
            balance profile. It takes about ~{estMinutes} minutes. Use wired
            headphones if possible and sit in a quiet room.
          </p>
        </div>
      </div>

      <div className="warn-box">
        <span className="warn-icon">
          <Icon.Warn />
        </span>
        <div className="warn-body">
          <strong>Safety notice —</strong> use this in a quiet room at a normal,
          comfortable system volume. Stop immediately if any tone feels
          painful or uncomfortable. If you notice sudden hearing changes,
          tinnitus, dizziness, or one-sided hearing loss, consult an audiologist
          or ENT specialist.
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <div className="panel-num">00</div>
          <div className="panel-title">Tested bands</div>
        </div>
        <p className="panel-body">
          Choose how many frequency bands to test. More bands give a more
          detailed profile but take longer.
        </p>
        <div className="strength-selector">
          {[
            ...Object.values(TEST_BAND_PRESETS),
            {
              id: "custom",
              label: "Custom",
              desc: `${customFreqList.length} bands · editable`,
            },
          ].map((preset) => (
            <button
              key={preset.id}
              className={`strength-btn${bandPresetId === preset.id ? " is-on" : ""}`}
              onClick={() => onBandPresetChange?.(preset.id)}
            >
              <span className="stn-name">{preset.label}</span>
              <span className="stn-desc">{preset.desc}</span>
            </button>
          ))}
        </div>
        {customMode && (
          <div className="panel-body custom-panel-body">
            <div className="custom-controls-row">
              <label className="custom-count-wrap">
                <span className="custom-count-label">Bands</span>
                <div className="custom-stepper">
                  <button
                    type="button"
                    className="custom-stepper-btn"
                    onClick={decrementBandCount}
                    aria-label="Decrease band count"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={3}
                    max={12}
                    step={1}
                    value={customFreqList.length}
                    onChange={(e) => handleCustomCountChange(e.target.value)}
                    className="custom-stepper-input"
                  />
                  <button
                    type="button"
                    className="custom-stepper-btn"
                    onClick={incrementBandCount}
                    aria-label="Increase band count"
                  >
                    +
                  </button>
                </div>
              </label>
              <button
                className="ghost"
                type="button"
                onClick={sortCustomFrequencies}
              >
                Sort ascending
              </button>
            </div>
            <div className="custom-freq-grid">
              {customFreqList.map((hz, idx) => (
                <label key={idx} className="custom-freq-field">
                  <span className="custom-freq-label">Band {idx + 1}</span>
                  <input
                    type="number"
                    min={CUSTOM_FREQ_MIN_HZ}
                    max={CUSTOM_FREQ_MAX_HZ}
                    step={1}
                    value={Number.isFinite(hz) ? hz : ""}
                    onChange={(e) => handleCustomFreqChange(idx, e.target.value)}
                    className={`custom-freq-input${
                      duplicateIdx.has(idx) ? " is-duplicate" : ""
                    }`}
                  />
                </label>
              ))}
            </div>
            <p className="custom-freq-hint">
              Enter frequencies in Hz from low to high, each one only once.
              Valid range: {freqLabelFromHz(CUSTOM_FREQ_MIN_HZ)} to{" "}
              {freqLabelFromHz(CUSTOM_FREQ_MAX_HZ)}.
            </p>
            {customError && (
              <p className="custom-freq-hint custom-freq-error">{customError}</p>
            )}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-h">
          <div className="panel-num">01</div>
          <div className="panel-title">Quiet-room check</div>
        </div>
        <p className="panel-body">
          Background noise can hide quiet tones, especially at low frequencies.
          This test relies on very quiet sounds, so a noisy room can make the
          result inaccurate.
        </p>
        <ul className="check-list">
          <li>
            <span className="dot" />
            <span>Find a quiet room with no distracting sounds.</span>
          </li>
          <li>
            <span className="dot" />
            <span>Sit still and wear your headphones comfortably.</span>
          </li>
          <li>
            <span className="dot" />
            <span>Do not continue if any tone feels uncomfortable.</span>
          </li>
        </ul>
        <label
          className={`confirm-check ${quietConfirmed ? "is-on" : ""}`}
          style={{ marginTop: 8 }}
        >
          <input
            type="checkbox"
            checked={quietConfirmed}
            onChange={(e) => setQuietConfirmed(e.target.checked)}
          />
          <span className="cc-box">
            <Icon.Check />
          </span>
          I am in a quiet room and ready to begin.
        </label>
      </div>

      <div className="panel">
        <div className="panel-h">
          <div className="panel-num">02</div>
          <div className="panel-title">Volume check</div>
        </div>
        <p className="panel-body">
          Play this sample and set your system volume to the level you would
          normally use for music. The ear-test tones will start much quieter
          than this and rise slowly. If you hear a test tone the instant it
          starts, lower your system volume before continuing.
        </p>
        <button
          className={`big-play ${volPlaying ? "is-on" : ""} accent`}
          onClick={toggleVolCheck}
        >
          {volPlaying ? <Icon.Pause /> : <Icon.Play />}
          <span>{volPlaying ? "Stop sample" : "Play sample"}</span>
        </button>
        {volPlaying && (
          <p className="vol-ok-hint">
            Sounds comfortable at your current volume? Stop the sample, then
            confirm the quiet-room check below.
          </p>
        )}
      </div>

      <div className="panel">
        <div className="panel-h">
          <div className="panel-num">i</div>
          <div className="panel-title">What to expect</div>
        </div>
        <div className="setup-stats">
          <div className="sstat">
            <div className="sstat-v">{activeFreqs.length}</div>
            <div className="sstat-k">Frequencies</div>
            <div className="sstat-d">{rangeLabel}</div>
          </div>
          <div className="sstat">
            <div className="sstat-v">2</div>
            <div className="sstat-k">Ears</div>
            <div className="sstat-d">Tested separately</div>
          </div>
          <div className="sstat">
            <div className="sstat-v">{activeFreqs.length * 2 * REPEATS}</div>
            <div className="sstat-k">Measurements</div>
            <div className="sstat-d">{REPEATS}× per ear per band</div>
          </div>
          <div className="sstat">
            <div className="sstat-v">~{estMinutes} min</div>
            <div className="sstat-k">Est. time</div>
            <div className="sstat-d">Including fine-tuning</div>
          </div>
        </div>
        <p
          className="panel-body"
          style={{
            marginTop: 14,
            borderTop: "1px solid var(--line-soft)",
            paddingTop: 14,
          }}
        >
          For each tone, the volume starts very quietly and increases until you
          press &ldquo;I Can Hear It.&rdquo; Each ear is tested twice at each
          frequency. The results are averaged to create a relative left/right
          correction profile.
        </p>
      </div>

      {onOpenSaved && (
        <div className="panel">
          <div className="panel-h">
            <div className="panel-num">03</div>
            <div className="panel-title">Open or import profile</div>
          </div>
          <p className="panel-body">
            Already ran the test? Open a saved browser profile or import a JSON
            backup to fine-tune and export without repeating the ear test.
          </p>
          <div className="import-row">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportJson}
              className="sr-only-file"
              aria-label="Import a JSON profile backup"
            />
            <button
              type="button"
              className="cta secondary"
              onClick={() => importInputRef.current?.click()}
            >
              <Icon.Download /> Import JSON backup
            </button>
            {importStatus && <span className="hint">{importStatus}</span>}
          </div>
          {savedProfiles.length > 0 && (
            <div className="saved-profiles" style={{ marginTop: 10 }}>
              <div className="saved-profiles-h">
                Saved in this browser &mdash; {savedProfiles.length}{" "}
                {savedProfiles.length === 1 ? "profile" : "profiles"}
              </div>
              {savedProfiles.map((entry) => (
                <div key={entry.id} className="saved-entry">
                  <div className="saved-entry-info">
                    <span className="saved-entry-date">
                      {fmtDateTime(entry.savedAt)}
                    </span>
                    <span className="saved-entry-strength">
                      {entry.strengthLabel}
                    </span>
                  </div>
                  <div className="saved-entry-actions">
                    <button
                      className="saved-dl-btn"
                      onClick={() => openSavedProfile(entry)}
                      title="Open this saved profile"
                    >
                      Open <Icon.ArrowR />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="footer-row">
        <div className="hint">
          {!quietConfirmed ? (
            "Confirm you're in a quiet room to continue"
          ) : customError ? (
            customError
          ) : (
            <em>Ready &mdash; tap Begin to start the ear test</em>
          )}
        </div>
        <button className="cta" disabled={!ready} onClick={() => onDone()}>
          Begin ear test <Icon.ArrowR />
        </button>
      </div>
    </div>
  );
}

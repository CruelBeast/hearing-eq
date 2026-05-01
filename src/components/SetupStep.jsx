// SetupStep.jsx — headphone selection + quiet-room check (Step 1)

import { useState, useRef, useEffect, useMemo } from "react";
import {
  DEFAULT_BAND_PRESET,
  REPEATS,
  TEST_BAND_PRESETS,
  freqLabelFromHz,
} from "../constants.js";
import { playDemo } from "../audio-engine.js";
import { loadProfiles } from "../lib/storage.js";
import { Icon } from "./icons.jsx";

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const savedProfiles = useMemo(() => loadProfiles(), []);
  const volRef = useRef(null);
  const customMode = bandPresetId === "custom";
  const customFreqList =
    Array.isArray(customFreqs) && customFreqs.length > 0
      ? customFreqs
      : TEST_BAND_PRESETS[DEFAULT_BAND_PRESET].freqs;
  const customError = useMemo(() => {
    if (!customMode) return null;
    if (customFreqList.length < 3 || customFreqList.length > 12) {
      return "Custom mode requires 3 to 12 bands.";
    }
    for (let i = 0; i < customFreqList.length; i++) {
      const hz = Number(customFreqList[i]);
      if (!Number.isFinite(hz) || hz < 60 || hz > 12000) {
        return "Each frequency must be between 60 Hz and 12 kHz.";
      }
      if (i > 0 && hz <= Number(customFreqList[i - 1])) {
        return "Frequencies must be in strictly increasing order.";
      }
    }
    return null;
  }, [customMode, customFreqList]);
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

  function clampCount(n) {
    return Math.max(3, Math.min(12, n));
  }

  function suggestNextFreq(freqs) {
    if (freqs.length === 0) return 125;
    if (freqs.length === 1) return Math.min(12000, Math.max(60, freqs[0] * 2));
    const last = Number(freqs[freqs.length - 1]);
    const prev = Number(freqs[freqs.length - 2]);
    const ratio = last / Math.max(prev, 1);
    let next = Math.round(last * Math.max(1.2, Math.min(ratio, 2)));
    if (next <= last) next = last + 100;
    return Math.min(12000, Math.max(60, next));
  }

  function handleCustomCountChange(value) {
    if (!onCustomFreqsChange) return;
    const count = clampCount(Math.round(Number(value) || customFreqList.length));
    let next = [...customFreqList];
    if (count > next.length) {
      while (next.length < count) next.push(suggestNextFreq(next));
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
      <div className="screen-h">
        <div className="kicker accent">Step 01 · Setup</div>
        <h2>Set up your test session.</h2>
        <p className="lede">
          This tool measures the minimum audible volume for each ear at{" "}
          {activeFreqs.length} frequencies and generates a relative left/right
          balance correction for your headphones. It is <em>not</em> a medical
          hearing test.
        </p>
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
                    min={60}
                    max={12000}
                    step={1}
                    value={Number.isFinite(hz) ? hz : ""}
                    onChange={(e) => handleCustomFreqChange(idx, e.target.value)}
                    className="custom-freq-input"
                  />
                </label>
              ))}
            </div>
            <p className="custom-freq-hint">
              Enter frequencies in Hz from low to high. Valid range: 60 Hz to
              12 kHz.
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

      {savedProfiles.length > 0 && onOpenSaved && (
        <div className="panel">
          <div className="panel-h">
            <div className="panel-num">03</div>
            <div className="panel-title">Open saved profile</div>
          </div>
          <p className="panel-body">
            Already ran the test on this device? Open any saved profile to
            fine-tune and export without repeating the ear test.
          </p>
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

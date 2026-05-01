// App.jsx — root shell; wires steps together and owns top-level state

import { useState, useEffect } from "react";
import {
  buildStartDbForFreqs,
  DEFAULT_BAND_PRESET,
  STRENGTH,
  TEST_BAND_PRESETS,
} from "./constants.js";
import { StepBar } from "./components/StepBar.jsx";
import { SetupStep } from "./components/SetupStep.jsx";
import { ThresholdStep } from "./components/ThresholdStep.jsx";
import { ProfileStep } from "./components/ProfileStep.jsx";

function thresholdsFromSavedPayload(payload) {
  const rows = payload?.frequencies ?? [];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const mapped = rows
    .map((row) => {
      const frequencyHz = Number(row.frequencyHz);
      const left = Number(row.leftThresholdDb);
      const right = Number(row.rightThresholdDb);
      if (!Number.isFinite(frequencyHz)) return null;
      if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
      return { frequencyHz, leftThreshDb: left, rightThreshDb: right };
    })
    .filter(Boolean)
    .sort((a, b) => a.frequencyHz - b.frequencyHz);

  return mapped.length > 0 ? mapped : null;
}

function strengthKeyFromSavedPayload(payload) {
  const value = Number(payload?.correctionStrength);
  const matchValue = Object.entries(STRENGTH).find(
    ([, s]) => Math.abs(s.value - value) < 0.001,
  );
  if (matchValue) return matchValue[0];

  const label = String(payload?.strengthLabel ?? "").toLowerCase();
  const matchLabel = Object.entries(STRENGTH).find(
    ([, s]) => s.label.toLowerCase() === label,
  );
  return matchLabel ? matchLabel[0] : "mild";
}

function normalizeCustomFreqs(freqs) {
  return freqs
    .map((v) => Math.round(Number(v)))
    .filter((v) => Number.isFinite(v))
    .filter((v) => v >= 60 && v <= 12000);
}

function buildCustomPreset(freqs) {
  const cleaned = normalizeCustomFreqs(freqs).sort((a, b) => a - b);
  return {
    id: "custom",
    label: "Custom",
    desc: `${cleaned.length} bands · editable`,
    freqs: cleaned,
    startDb: buildStartDbForFreqs(cleaned),
  };
}

export default function App() {
  const [stepIdx, setStepIdx] = useState(0);
  const [thresholds, setThresholds] = useState(null);
  const [profileSeed, setProfileSeed] = useState(null);
  const [bandPresetId, setBandPresetId] = useState(DEFAULT_BAND_PRESET);
  const [customFreqs, setCustomFreqs] = useState(() => [
    ...TEST_BAND_PRESETS[DEFAULT_BAND_PRESET].freqs,
  ]);
  const [theme, setTheme] = useState("dark");

  const activeBandPreset =
    bandPresetId === "custom"
      ? buildCustomPreset(customFreqs)
      : TEST_BAND_PRESETS[bandPresetId] ??
        TEST_BAND_PRESETS[DEFAULT_BAND_PRESET];

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  const handleSetupDone = () => {
    setStepIdx(1);
  };
  const handleThresholdDone = (t) => {
    setThresholds(t);
    setProfileSeed(null);
    setStepIdx(2);
  };
  const handleOpenSavedProfile = (entry) => {
    const mappedThresholds = thresholdsFromSavedPayload(entry?.data);
    if (!mappedThresholds) return;

    setThresholds(mappedThresholds);
    setProfileSeed({
      id: entry.id,
      strengthKey: strengthKeyFromSavedPayload(entry.data),
      fromSaved: true,
    });
    setStepIdx(2);
  };
  const handleRestart = () => {
    setStepIdx(0);
    setThresholds(null);
    setProfileSeed(null);
  };

  return (
    <div className="app">
      <header className="topbar">
        {/* Brand */}
        <div className="brand">
          <div className="brand-mark">
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path d="M3 12c0-5 4-9 9-9s9 4 9 9" />
              <path d="M5 13a2 2 0 0 1 2-2h1v8H7a2 2 0 0 1-2-2v-4z" />
              <path d="M19 13a2 2 0 0 0-2-2h-1v8h1a2 2 0 0 0 2-2v-4z" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
            </svg>
          </div>
          <div className="brand-txt">
            <div className="brand-name">
              EARMATCH<span className="brand-dot">.</span>
            </div>
            <div className="brand-tag">hearing balance profile</div>
          </div>
        </div>

        {/* Step progress */}
        <StepBar stepIdx={stepIdx} />

        {/* Theme toggle */}
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? (
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </header>

      <main className="main">
        {stepIdx === 0 && (
          <SetupStep
            onDone={handleSetupDone}
            onOpenSaved={handleOpenSavedProfile}
            bandPresetId={bandPresetId}
            onBandPresetChange={setBandPresetId}
            customFreqs={customFreqs}
            onCustomFreqsChange={setCustomFreqs}
          />
        )}
        {stepIdx === 1 && (
          <ThresholdStep
            onDone={handleThresholdDone}
            bandPreset={activeBandPreset}
          />
        )}
        {stepIdx === 2 && thresholds && (
          <ProfileStep
            key={profileSeed?.id ?? "measured-profile"}
            thresholds={thresholds}
            initialStrengthKey={profileSeed?.strengthKey ?? "mild"}
            autoSaveOnMount={!profileSeed?.fromSaved}
            onRestart={handleRestart}
          />
        )}
      </main>
    </div>
  );
}

# Equalizer Profile for Left/Right Hearing Balance

## Goal

Create an equalizer/profile generator that helps a user balance perceived sound between the left and right ear.

The goal is **not** to diagnose hearing loss or create a medical audiogram. The app should produce a **relative left/right balance profile** for a specific headphone/device setup.

---

## Main Decision

### Skip the palm-rub baseline

The palm-rub idea sounds intuitive, but it is not reliable enough for calibration.

Reasons:

- Palm rubbing is inconsistent from person to person.
- The sound is broadband, not frequency-specific.
- The recording depends on microphone, distance, room acoustics, compression, and playback device.
- Real-life palm rubbing reaches both ears differently because of head shape and position.
- It gives one rough loudness reference, but not useful per-frequency information.

So the app should **not** ask users to match a prerecorded palm-rub sound to real life.

---

## Better Baseline

Use a **relative per-frequency baseline**:

> For each frequency band, compare the minimum audible volume of the left ear against the minimum audible volume of the right ear.

The better-hearing ear at each frequency becomes the local reference.

Example:

| Frequency | Left threshold | Right threshold | Interpretation |
|---:|---:|---:|---|
| 1000 Hz | -52 dBFS | -46 dBFS | Right ear needs about 6 dB more |
| 4000 Hz | -48 dBFS | -55 dBFS | Left ear needs about 7 dB more |

This should be treated as **relative digital level**, not real-world hearing level.

Use labels like:

- Good: `Relative left/right balance`
- Good: `Personal headphone balance profile`
- Avoid: `Medical hearing test`
- Avoid: `Audiogram`

---

## Recommended App Flow

### 1. Headphone/device selection

Ask the user to select or name the headphone setup.

Why:

- Headphones have different frequency responses.
- Fit and seal change the result.
- A profile made for one headphone may sound wrong on another.

TODO:

- [ ] Let the user create/select a headphone profile.
- [ ] Store results per headphone/device.
- [ ] Warn that changing headphones requires recalibration.

---

### 2. Quiet-room check

Before testing, ask the user to be in a quiet room.

Why:

- Background noise can hide quiet tones.
- Low-frequency bands are especially affected by room noise.
- The test is based on minimum audible volume, so noise pollution corrupts the result.

TODO:

- [ ] Show a short quiet-environment instruction.
- [ ] Recommend removing distractions and sitting still.
- [ ] Optionally include a “room is quiet enough” confirmation step.

Suggested text:

> Use this in a quiet room with comfortable headphone volume. Do not continue if any tone feels painful or uncomfortable.

---

### 3. Per-ear threshold test

Test each frequency separately for each ear.

Suggested frequencies:

```txt
125 Hz
250 Hz
500 Hz
1000 Hz
2000 Hz
4000 Hz
6000 Hz
8000 Hz
```

For each frequency:

1. Play tone only in the left ear.
2. Start very quiet.
3. Increase volume gradually.
4. User confirms when the sound is barely audible.
5. Repeat to reduce random mistakes.
6. Do the same for the right ear.

TODO:

- [ ] Generate test tones or narrow-band noise for each frequency.
- [ ] Mute the opposite ear/channel during each test.
- [ ] Start from a very low level.
- [ ] Increase in small steps.
- [ ] Record the threshold for each ear and frequency.
- [ ] Repeat each measurement 2-3 times.
- [ ] Average or median the repeated results.

Implementation note:

- Pure sine tones are simple, but can be fatiguing.
- Warble tones or narrow-band noise may feel more natural and reduce false results.
- Keep the UI calm and slow. This is not a reflex game.

---

### 4. Calculate relative difference

For each frequency:

```ts
differenceDb = rightThresholdDb - leftThresholdDb
```

Interpretation:

- If `differenceDb > 0`, the right ear needed more volume, so the right ear is less sensitive at that frequency.
- If `differenceDb < 0`, the left ear needed more volume, so the left ear is less sensitive at that frequency.
- If the value is close to `0`, no correction is needed.

TODO:

- [ ] Calculate threshold difference per frequency.
- [ ] Smooth extreme jumps between neighboring bands.
- [ ] Ignore or retest suspicious outliers.
- [ ] Store raw measurements separately from the generated correction.

Example:

```ts
type EarThresholds = {
  frequencyHz: number;
  leftThresholdDb: number;
  rightThresholdDb: number;
  differenceDb: number;
};
```

---

### 5. Generate initial correction

Do not blindly apply the full measured difference.

Better:

```ts
correctionStrength = 0.5; // mild
correctionDb = differenceDb * correctionStrength;
```

Suggested correction strengths:

| Mode | Strength |
|---|---:|
| Mild | 40-50% |
| Normal | 60-70% |
| Strong | 80% max |

TODO:

- [ ] Add correction strength modes: Mild, Normal, Strong.
- [ ] Default to Mild or Normal.
- [ ] Avoid applying 100% correction automatically.
- [ ] Cap boost values.

---

### 6. Prefer reducing the louder side

The safest correction strategy is usually to reduce the better/louder side rather than heavily boosting the weaker side.

Example:

If the right ear is 6 dB less sensitive at 4000 Hz:

Safer approach:

```txt
Left: -6 dB
Right: 0 dB
```

More natural but riskier approach:

```txt
Left: -3 dB
Right: +3 dB
Global preamp: -3 dB
```

TODO:

- [ ] Prefer cuts over boosts.
- [ ] If boosting, add global preamp reduction.
- [ ] Prevent clipping.
- [ ] Add a maximum boost cap, for example +3 dB to +6 dB by default.
- [ ] Add a warning if the generated correction requires large boosts.

---

### 7. Comfortable-volume center-balance check

Minimum audible volume is useful, but it does not always equal perceived balance at normal listening volume.

After generating the initial profile, test each band again at a comfortable level.

For each band:

1. Play mono tone/noise to both ears.
2. Ask the user where the sound appears:
   - left
   - center
   - right
3. Let the user nudge the balance until the sound feels centered.

TODO:

- [ ] Add a center-balance fine-tuning step.
- [ ] Use comfortable, not barely audible, volume.
- [ ] Use mono signal sent to both ears.
- [ ] Let the user adjust left/right balance per band.
- [ ] Save fine-tuning adjustments separately from threshold measurements.

This is important because threshold balance and loudness balance are not always the same.

---

### 8. Preview with real content

After the technical test, let the user preview with normal audio.

Suggested previews:

- speech
- pink noise
- music sample
- user-provided audio, if applicable

TODO:

- [ ] Add before/after toggle.
- [ ] Add music/speech preview.
- [ ] Add global correction strength slider.
- [ ] Add reset button.
- [ ] Let the user compare “raw”, “mild”, “normal”, and “strong”.

---

### 9. Save and export profile

Depending on your app goal, export the profile as:

- JSON
- Equalizer APO config
- AutoEq-style parameters
- Web Audio API filter chain
- custom app format

TODO:

- [ ] Save raw test data.
- [ ] Save generated EQ correction.
- [ ] Save manual fine-tuning changes.
- [ ] Include headphone/device name.
- [ ] Include date of calibration.
- [ ] Include warning that this is not a medical test.

Example JSON shape:

```json
{
  "profileName": "My Headphones - Relative Balance",
  "device": "Example Headphones",
  "createdAt": "2026-05-01",
  "frequencies": [
    {
      "frequencyHz": 1000,
      "leftThresholdDb": -52,
      "rightThresholdDb": -46,
      "differenceDb": 6,
      "leftCorrectionDb": -3,
      "rightCorrectionDb": 3
    }
  ],
  "correctionStrength": 0.5,
  "globalPreampDb": -3,
  "notes": "Relative left/right balance profile. Not a medical audiogram."
}
```

---

## Safety Notes

The app should be conservative.

TODO:

- [ ] Never start tones loudly.
- [ ] Add “stop immediately if uncomfortable” warning.
- [ ] Avoid large automatic boosts.
- [ ] Add global preamp reduction when boosting.
- [ ] Add limiter or clipping prevention.
- [ ] Recommend professional testing if the user detects large asymmetry.
- [ ] Recommend professional help for sudden hearing change, tinnitus, dizziness, pain, or one-sided hearing loss.

Suggested warning:

> This tool creates a relative balance profile for your headphones. It is not a medical hearing test. If you notice sudden hearing changes, strong left/right differences, tinnitus, dizziness, pain, or one-sided hearing loss, consult an audiologist or ENT doctor.

---

## Final Recommended Algorithm

```ts
for each frequencyBand:
  leftThreshold = measureMinimumAudibleVolume(leftEar, frequencyBand)
  rightThreshold = measureMinimumAudibleVolume(rightEar, frequencyBand)

  difference = rightThreshold - leftThreshold

  correction = difference * correctionStrength

  if correction > 0:
    // Right ear needs help, or left ear should be reduced
    leftCorrection = -correction / 2
    rightCorrection = correction / 2
  else:
    // Left ear needs help, or right ear should be reduced
    leftCorrection = -correction / 2
    rightCorrection = correction / 2

applyBoostCaps()
applyGlobalPreampIfNeeded()
runComfortableVolumeCenterBalanceCheck()
saveProfile()
```

A safer variant:

```ts
for each frequencyBand:
  if rightEarIsLessSensitive:
    reduceLeftEarBy(correction)
    keepRightEarAtZero()
  else if leftEarIsLessSensitive:
    reduceRightEarBy(correction)
    keepLeftEarAtZero()
```

---

## Product Recommendation

The best UX is:

```txt
1. Select headphones
2. Quiet-room confirmation
3. Threshold test per ear and frequency
4. Generate conservative correction
5. Fine-tune center image at comfortable volume
6. Preview with real audio
7. Save/export profile
```

The app should be framed as a **personal listening balance tool**, not as medical diagnosis.

---

## Summary

Use **minimum audible volume per ear and per frequency** as the baseline.

Skip the palm-rub baseline.

Then fine-tune using a **comfortable-volume center-balance test**, because audibility and perceived loudness are related but not identical.

The final profile should be conservative, headphone-specific, and transparent about its limits.

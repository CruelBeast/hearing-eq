# EARMATCH — Stereo Hearing Balance Profile

A browser app that builds a per-ear relative balance correction profile so each frequency band sounds equally loud in both of your ears. Useful if one ear hears a little differently from the other across part of the spectrum.

## How it works

The app walks you through three steps:

1. **Setup** — name your headphone or device and confirm you are in a quiet room. Results are device-specific; changing headphones requires recalibration.

2. **Ear Test** — for each of 8 ISO-ish frequency bands (125 Hz – 8 kHz), a pure tone plays in one ear at a time. The volume starts very quietly and rises gradually. You press "I Can Hear It" the moment you notice the tone. Each ear is measured twice per frequency (16 measurements per ear, 32 total). The two readings are averaged.

3. **Profile** — the app computes `differenceDb = rightThreshold − leftThreshold` for each band. Correction is applied by reducing the better-hearing channel (cuts over boosts). Three correction strengths are available: Mild (50%), Normal (65%), and Strong (80%). An optional centre-balance fine-tuning step lets you nudge each band further at comfortable listening volume. Before/after preview, then export for Peace, plain Equalizer APO, or JSON backup.

All audio is real Web Audio — per-ear isolation via `ChannelMerger`, peaking biquads for the EQ chain.

> **This is not a medical hearing test.** If you notice sudden hearing changes, tinnitus, dizziness, or one-sided hearing loss, consult an audiologist or ENT doctor.

## Run it

Requires Node 18+.

```bash
npm install
npm run dev
```

Opens http://localhost:5173 automatically.

Other scripts:

- `npm run build` — production build into `dist/`
- `npm run preview` — serve the production build

## Tips

- Use **wired headphones** in a quiet room. Bluetooth adds latency and per-side gain quirks that throw off calibration.
- Do not continue if any tone feels painful or uncomfortable. Volume starts at −65 dBFS and ramps up 3 dB every 400 ms.
- The profile is headphone-specific. Re-run the test whenever you change devices or ear-tip fit.
- Start with **Mild** correction (50%) — it is the safest default. Only increase strength if the mild correction feels insufficient after living with it for a few days.

## Exported profile format

The app can export:

- **Peace .txt** — `GraphicEQ` format intended for Peter's Equalizer APO Configuration Extension.
- **APO .txt** — plain Equalizer APO parametric `Filter: ON PK ...` commands.
- **Backup .json** — app backup that can be imported again from the setup screen.

```json
{
  "profileName": "My Headphones — Relative Balance",
  "device": "My Headphones",
  "createdAt": "2025-01-01",
  "correctionStrength": 0.5,
  "globalPreampDb": 0,
  "notes": "Relative left/right balance profile. Not a medical audiogram.",
  "frequencies": [
    {
      "frequencyHz": 1000,
      "leftThresholdDb": -52,
      "rightThresholdDb": -46,
      "differenceDb": 6,
      "leftCorrectionDb": -3,
      "rightCorrectionDb": 0
    }
  ]
}
```

## Contact Form

The `/contact` page can post directly to Formspree. Configure this Cloudflare
Pages build environment variable before deploying:

- `VITE_FORMSPREE_ENDPOINT` — your Formspree form endpoint, for example `https://formspree.io/f/xxxxabcd`

The Formspree form ID will be visible in the frontend, which is normal for
Formspree forms. Your destination email address is still configured inside
Formspree and is not included in the frontend bundle.

## Stack

Vite + React 18, plain CSS, Web Audio API.

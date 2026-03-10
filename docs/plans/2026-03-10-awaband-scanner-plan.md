# AWABAND Scanner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Создать веб-приложение «AWABAND Scanner», которое через камеру и микрофон телефона анализирует физиологические показатели и визуализирует их как 7 параметров биополя из вселенной Awaterra 2225.

**Architecture:** Клиентское SPA, размещённое как отдельная страница `/scanner` в существующем Express-сервере. Вся обработка (rPPG, аудиоанализ) выполняется в браузере. Три экрана: заставка → сканирование (реальное время) → результат.

**Tech Stack:** TypeScript, Canvas 2D / WebGL для ауры, Web Audio API, getUserMedia. Без внешних ML-библиотек — CHROM-алгоритм и аудиоанализ реализуются вручную.

**Design doc:** `docs/plans/2026-03-10-awaband-scanner-design.md`

---

## Task 1: Структура файлов и точка входа

**Files:**
- Create: `dashboard/public/scanner/index.html`
- Create: `dashboard/public/scanner/scanner.css`
- Create: `dashboard/public/scanner/main.ts`
- Modify: `dashboard/server.ts` — добавить роут `/scanner`

**Step 1: Создать HTML-каркас сканера**

```html
<!-- dashboard/public/scanner/index.html -->
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>AWABAND Scanner</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="scanner.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="main.js"></script>
</body>
</html>
```

**Step 2: Создать базовый CSS**

Стилизация в духе существующего дашборда (--bg: #080b14, bioluminescent aesthetic). Три состояния: `#splash`, `#scanning`, `#result`. Мобиль-first.

**Step 3: Создать main.ts с переключением экранов**

```typescript
// dashboard/public/scanner/main.ts
type Screen = 'splash' | 'scanning' | 'result';

function showScreen(screen: Screen) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById(screen)?.classList.add('active');
}

function initSplash() {
  const splash = document.createElement('div');
  splash.id = 'splash';
  splash.className = 'screen active';
  splash.innerHTML = `
    <div class="splash-content">
      <div class="awaband-logo"></div>
      <h1>AWABAND</h1>
      <p class="splash-sub">Biofield Scanner v2225.7</p>
      <button id="start-scan" class="scan-btn">Начать сканирование</button>
    </div>
  `;
  document.getElementById('app')!.appendChild(splash);
  document.getElementById('start-scan')!.addEventListener('click', () => {
    showScreen('scanning');
    startScanning();
  });
}

function startScanning() { /* Task 5 */ }

initSplash();
```

**Step 4: Добавить роут в server.ts**

Сканер — статическая страница, уже обслуживается через `express.static`. Проверить доступ по `/scanner/index.html`. Если SPA fallback перехватывает — добавить исключение.

**Step 5: Собрать и проверить**

```bash
cd /c/Users/Professional/Projects/awaterra-world
npx tsc --noEmit dashboard/public/scanner/main.ts 2>&1 || true
npm run dev
# Открыть http://localhost:3000/scanner/ — должен показаться splash-экран
```

**Step 6: Commit**

```bash
git add dashboard/public/scanner/
git commit -m "feat(scanner): add AWABAND Scanner page scaffold with splash screen"
```

---

## Task 2: Камера — захват видео и детекция лица (ROI)

**Files:**
- Create: `dashboard/public/scanner/camera.ts`

**Step 1: Реализовать захват камеры**

```typescript
// dashboard/public/scanner/camera.ts
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream) {
  stream.getTracks().forEach(t => t.stop());
}
```

**Step 2: Реализовать детекцию лица (ROI) без ML**

Простой подход: фиксированный ROI в центре кадра (лоб: верхние 30% центральной трети). Этого достаточно для rPPG если пользователь смотрит в камеру.

```typescript
export interface ROI {
  x: number; y: number; w: number; h: number;
}

export function getForeheadROI(videoWidth: number, videoHeight: number): ROI {
  // Центральная треть по ширине, верхние 30% по высоте = область лба
  const w = Math.round(videoWidth / 3);
  const h = Math.round(videoHeight * 0.15);
  const x = Math.round(videoWidth / 3);
  const y = Math.round(videoHeight * 0.15);
  return { x, y, w, h };
}

export function extractROIPixels(
  ctx: CanvasRenderingContext2D, roi: ROI
): { r: number; g: number; b: number } {
  const imageData = ctx.getImageData(roi.x, roi.y, roi.w, roi.h);
  const data = imageData.data;
  let rSum = 0, gSum = 0, bSum = 0;
  const pixelCount = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }
  return {
    r: rSum / pixelCount,
    g: gSum / pixelCount,
    b: bSum / pixelCount
  };
}
```

**Step 3: Проверить — камера открывается, ROI рисуется поверх видео**

```bash
npm run dev
# Открыть /scanner/, нажать «Начать» — должно появиться видео с камеры
# и прямоугольник ROI на лбу
```

**Step 4: Commit**

```bash
git add dashboard/public/scanner/camera.ts
git commit -m "feat(scanner): camera capture and forehead ROI extraction"
```

---

## Task 3: rPPG — CHROM-алгоритм для извлечения пульса

**Files:**
- Create: `dashboard/public/scanner/rppg.ts`

**Step 1: Реализовать CHROM-алгоритм**

CHROM (Chrominance-based) — разделяет пульсовой сигнал от шума через проекцию RGB в хроматическое пространство.

```typescript
// dashboard/public/scanner/rppg.ts
const BUFFER_SIZE = 256; // ~8.5 сек при 30fps
const FPS = 30;

export class RPPGProcessor {
  private rBuffer: number[] = [];
  private gBuffer: number[] = [];
  private bBuffer: number[] = [];

  addFrame(r: number, g: number, b: number) {
    this.rBuffer.push(r);
    this.gBuffer.push(g);
    this.bBuffer.push(b);
    if (this.rBuffer.length > BUFFER_SIZE) {
      this.rBuffer.shift();
      this.gBuffer.shift();
      this.bBuffer.shift();
    }
  }

  /**
   * CHROM method: De Haan & Jeanne (2013)
   * S1 = R/mean(R) - G/mean(G)
   * S2 = R/mean(R) + G/mean(G) - 2*B/mean(B)
   * H = S1 + α*S2 where α = std(S1)/std(S2)
   */
  getPulseSignal(): number[] | null {
    if (this.rBuffer.length < 64) return null;

    const n = this.rBuffer.length;
    const meanR = this.rBuffer.reduce((a, b) => a + b) / n;
    const meanG = this.gBuffer.reduce((a, b) => a + b) / n;
    const meanB = this.bBuffer.reduce((a, b) => a + b) / n;

    if (meanR === 0 || meanG === 0 || meanB === 0) return null;

    const s1: number[] = [];
    const s2: number[] = [];
    for (let i = 0; i < n; i++) {
      const rn = this.rBuffer[i] / meanR;
      const gn = this.gBuffer[i] / meanG;
      const bn = this.bBuffer[i] / meanB;
      s1.push(rn - gn);
      s2.push(rn + gn - 2 * bn);
    }

    const stdS1 = std(s1);
    const stdS2 = std(s2);
    const alpha = stdS2 > 0 ? stdS1 / stdS2 : 0;

    return s1.map((v, i) => v + alpha * s2[i]);
  }

  /** Estimate HR in BPM from pulse signal via peak-finding in FFT */
  getHeartRate(): number | null {
    const signal = this.getPulseSignal();
    if (!signal) return null;

    const spectrum = fft(signal);
    // HR range: 40-180 BPM → 0.67-3.0 Hz
    const minBin = Math.floor(0.67 * signal.length / FPS);
    const maxBin = Math.ceil(3.0 * signal.length / FPS);

    let maxPower = 0;
    let maxIdx = minBin;
    for (let i = minBin; i <= maxBin && i < spectrum.length; i++) {
      if (spectrum[i] > maxPower) {
        maxPower = spectrum[i];
        maxIdx = i;
      }
    }

    const freqHz = maxIdx * FPS / signal.length;
    return Math.round(freqHz * 60);
  }

  get bufferFullness(): number {
    return this.rBuffer.length / BUFFER_SIZE;
  }
}

function std(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b) / arr.length;
  const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/** Simple DFT (magnitude spectrum). For production — replace with FFT. */
function fft(signal: number[]): number[] {
  const N = signal.length;
  const spectrum: number[] = [];
  for (let k = 0; k < N / 2; k++) {
    let real = 0, imag = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      real += signal[n] * Math.cos(angle);
      imag -= signal[n] * Math.sin(angle);
    }
    spectrum.push(Math.sqrt(real * real + imag * imag));
  }
  return spectrum;
}
```

**Step 2: Проверить — HR показывается через 5-8 секунд смотрения в камеру**

Добавить временный вывод HR на экран сканирования. Ожидаемый результат: 55-100 BPM.

**Step 3: Commit**

```bash
git add dashboard/public/scanner/rppg.ts
git commit -m "feat(scanner): CHROM rPPG algorithm for heart rate extraction"
```

---

## Task 4: HRV, частота дыхания и когерентность из rPPG

**Files:**
- Create: `dashboard/public/scanner/vitals.ts`

**Step 1: Реализовать расчёт HRV и когерентности**

```typescript
// dashboard/public/scanner/vitals.ts

export interface Vitals {
  hr: number | null;           // BPM
  hrv: number | null;          // RMSSD в мс
  breathingRate: number | null; // вдохов/мин
  coherence: number | null;    // 0-100
  hrSmoothed: number | null;   // сглаженный HR для плавности потока
}

/**
 * Detect peaks in pulse signal → inter-beat intervals → HRV
 */
export function calculateHRV(pulseSignal: number[], fps: number): {
  rmssd: number; ibis: number[]
} | null {
  // Найти пики (простой поиск локальных максимумов)
  const peaks: number[] = [];
  for (let i = 2; i < pulseSignal.length - 2; i++) {
    if (pulseSignal[i] > pulseSignal[i-1] &&
        pulseSignal[i] > pulseSignal[i+1] &&
        pulseSignal[i] > pulseSignal[i-2] &&
        pulseSignal[i] > pulseSignal[i+2]) {
      peaks.push(i);
    }
  }

  if (peaks.length < 3) return null;

  // Inter-beat intervals в мс
  const ibis: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const ibi = ((peaks[i] - peaks[i-1]) / fps) * 1000;
    // Фильтр: IBI должен быть 333-1500 мс (40-180 BPM)
    if (ibi >= 333 && ibi <= 1500) {
      ibis.push(ibi);
    }
  }

  if (ibis.length < 2) return null;

  // RMSSD — стандартная метрика HRV
  let sumSquaredDiffs = 0;
  for (let i = 1; i < ibis.length; i++) {
    sumSquaredDiffs += (ibis[i] - ibis[i-1]) ** 2;
  }
  const rmssd = Math.sqrt(sumSquaredDiffs / (ibis.length - 1));

  return { rmssd, ibis };
}

/**
 * Breathing rate from HRV signal (respiratory sinus arrhythmia).
 * Looks for 0.15-0.5 Hz peak in IBI spectrum.
 */
export function calculateBreathingRate(ibis: number[]): number | null {
  if (ibis.length < 8) return null;

  // Resample IBIs to uniform timeline, then find dominant frequency
  const meanIBI = ibis.reduce((a, b) => a + b) / ibis.length;
  const sampleRate = 1000 / meanIBI; // approx samples/sec

  // Simple peak counting in IBI series (low-pass filtered)
  // Count oscillations in IBI values
  let crossings = 0;
  for (let i = 1; i < ibis.length; i++) {
    if ((ibis[i] > meanIBI) !== (ibis[i-1] > meanIBI)) {
      crossings++;
    }
  }

  const durationSec = ibis.reduce((a, b) => a + b) / 1000;
  // Each breath cycle = 2 crossings
  const breathsPerSec = (crossings / 2) / durationSec;
  const breathsPerMin = breathsPerSec * 60;

  // Sanity: 8-25 breaths/min
  if (breathsPerMin < 8 || breathsPerMin > 25) return null;
  return Math.round(breathsPerMin);
}

/**
 * Heart coherence: ratio of peak power around 0.1Hz to total power in HRV spectrum.
 * High coherence = dominant ~0.1 Hz rhythm. Based on HeartMath methodology.
 */
export function calculateCoherence(ibis: number[]): number | null {
  if (ibis.length < 10) return null;

  const N = ibis.length;
  const mean = ibis.reduce((a, b) => a + b) / N;
  const centered = ibis.map(v => v - mean);

  // DFT
  const sampleRate = 1000 / mean;
  let totalPower = 0;
  let peakPower = 0;

  for (let k = 1; k < N / 2; k++) {
    let real = 0, imag = 0;
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N;
      real += centered[n] * Math.cos(angle);
      imag -= centered[n] * Math.sin(angle);
    }
    const power = real * real + imag * imag;
    const freq = k * sampleRate / N;

    totalPower += power;
    // Coherence band: 0.04 - 0.26 Hz (LF range where coherence lives)
    if (freq >= 0.04 && freq <= 0.26) {
      peakPower = Math.max(peakPower, power);
    }
  }

  if (totalPower === 0) return null;
  // Normalize to 0-100
  return Math.min(100, Math.round((peakPower / totalPower) * 300));
}
```

**Step 2: Проверить — отображаются HR, HRV, дыхание, когерентность**

**Step 3: Commit**

```bash
git add dashboard/public/scanner/vitals.ts
git commit -m "feat(scanner): HRV, breathing rate and heart coherence from rPPG"
```

---

## Task 5: Голосовой анализ — pitch, jitter, shimmer, HNR

**Files:**
- Create: `dashboard/public/scanner/voice.ts`

**Step 1: Реализовать захват и анализ аудио**

```typescript
// dashboard/public/scanner/voice.ts

export interface VoiceMetrics {
  pitch: number | null;          // F0 в Hz
  jitter: number | null;         // % вариации периода
  shimmer: number | null;        // % вариации амплитуды
  hnr: number | null;            // Harmonics-to-Noise ratio в dB
  rms: number | null;            // громкость (0-1)
  spectralCentroid: number | null; // центроид спектра в Hz
}

export class VoiceAnalyzer {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    this.audioCtx = new AudioContext();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.source = this.audioCtx.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);
  }

  stop() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.audioCtx?.close();
  }

  getMetrics(): VoiceMetrics {
    if (!this.analyser || !this.audioCtx) {
      return { pitch: null, jitter: null, shimmer: null, hnr: null, rms: null, spectralCentroid: null };
    }

    const bufferLength = this.analyser.fftSize;
    const timeData = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(timeData);

    const freqData = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(freqData);

    const sampleRate = this.audioCtx.sampleRate;

    const rms = Math.sqrt(timeData.reduce((s, v) => s + v * v, 0) / bufferLength);
    const pitch = rms > 0.01 ? this.detectPitch(timeData, sampleRate) : null;
    const jitter = pitch ? this.calculateJitter(timeData, sampleRate, pitch) : null;
    const shimmer = rms > 0.01 ? this.calculateShimmer(timeData, sampleRate, pitch) : null;
    const hnr = rms > 0.01 ? this.calculateHNR(timeData, pitch, sampleRate) : null;
    const spectralCentroid = this.calculateSpectralCentroid(freqData, sampleRate);

    return { pitch, jitter, shimmer, hnr, rms, spectralCentroid };
  }

  /** Autocorrelation pitch detection */
  private detectPitch(buffer: Float32Array, sampleRate: number): number | null {
    // Autocorrelation method
    const minPeriod = Math.floor(sampleRate / 500); // max 500 Hz
    const maxPeriod = Math.floor(sampleRate / 60);  // min 60 Hz

    let bestCorrelation = 0;
    let bestPeriod = 0;

    for (let period = minPeriod; period < maxPeriod && period < buffer.length / 2; period++) {
      let correlation = 0;
      for (let i = 0; i < buffer.length - period; i++) {
        correlation += buffer[i] * buffer[i + period];
      }
      correlation /= (buffer.length - period);

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestPeriod = period;
      }
    }

    if (bestCorrelation < 0.01) return null;
    return Math.round(sampleRate / bestPeriod);
  }

  /** Jitter: cycle-to-cycle variation of pitch period (%) */
  private calculateJitter(
    buffer: Float32Array, sampleRate: number, pitch: number
  ): number | null {
    const period = Math.round(sampleRate / pitch);
    const periods: number[] = [];

    // Find zero crossings to measure actual periods
    let lastCross = -1;
    for (let i = 1; i < buffer.length; i++) {
      if (buffer[i-1] <= 0 && buffer[i] > 0) {
        if (lastCross >= 0) {
          const p = i - lastCross;
          if (p > period * 0.5 && p < period * 2) periods.push(p);
        }
        lastCross = i;
      }
    }

    if (periods.length < 3) return null;

    const meanP = periods.reduce((a, b) => a + b) / periods.length;
    let jitterSum = 0;
    for (let i = 1; i < periods.length; i++) {
      jitterSum += Math.abs(periods[i] - periods[i-1]);
    }
    return (jitterSum / (periods.length - 1)) / meanP * 100;
  }

  /** Shimmer: cycle-to-cycle variation of amplitude (%) */
  private calculateShimmer(
    buffer: Float32Array, sampleRate: number, pitch: number | null
  ): number | null {
    if (!pitch) return null;
    const period = Math.round(sampleRate / pitch);
    const amplitudes: number[] = [];

    for (let start = 0; start + period < buffer.length; start += period) {
      let max = 0;
      for (let i = start; i < start + period; i++) {
        max = Math.max(max, Math.abs(buffer[i]));
      }
      amplitudes.push(max);
    }

    if (amplitudes.length < 3) return null;

    const meanAmp = amplitudes.reduce((a, b) => a + b) / amplitudes.length;
    if (meanAmp === 0) return null;

    let shimmerSum = 0;
    for (let i = 1; i < amplitudes.length; i++) {
      shimmerSum += Math.abs(amplitudes[i] - amplitudes[i-1]);
    }
    return (shimmerSum / (amplitudes.length - 1)) / meanAmp * 100;
  }

  /** HNR: ratio of harmonic to noise energy (simplified) */
  private calculateHNR(
    buffer: Float32Array, pitch: number | null, sampleRate: number
  ): number | null {
    if (!pitch) return null;
    const period = Math.round(sampleRate / pitch);
    const numPeriods = Math.floor(buffer.length / period);
    if (numPeriods < 2) return null;

    // Average waveform (harmonic component)
    const avgWave = new Float32Array(period);
    for (let p = 0; p < numPeriods; p++) {
      for (let i = 0; i < period; i++) {
        avgWave[i] += buffer[p * period + i] / numPeriods;
      }
    }

    // Noise = original - harmonic
    let harmonicEnergy = 0, noiseEnergy = 0;
    for (let p = 0; p < numPeriods; p++) {
      for (let i = 0; i < period; i++) {
        const idx = p * period + i;
        harmonicEnergy += avgWave[i] ** 2;
        noiseEnergy += (buffer[idx] - avgWave[i]) ** 2;
      }
    }

    if (noiseEnergy === 0) return 30; // perfectly clean
    return Math.round(10 * Math.log10(harmonicEnergy / noiseEnergy));
  }

  /** Spectral centroid — "brightness" of sound */
  private calculateSpectralCentroid(
    freqData: Float32Array, sampleRate: number
  ): number | null {
    let weightedSum = 0, totalMag = 0;
    const binWidth = sampleRate / (freqData.length * 2);

    for (let i = 0; i < freqData.length; i++) {
      const mag = Math.pow(10, freqData[i] / 20); // dB → linear
      const freq = i * binWidth;
      weightedSum += freq * mag;
      totalMag += mag;
    }

    if (totalMag === 0) return null;
    return Math.round(weightedSum / totalMag);
  }
}
```

**Step 2: Проверить — метрики голоса отображаются при разговоре**

**Step 3: Commit**

```bash
git add dashboard/public/scanner/voice.ts
git commit -m "feat(scanner): voice analysis - pitch, jitter, shimmer, HNR, spectral centroid"
```

---

## Task 6: Маппинг данных → 7 параметров биополя

**Files:**
- Create: `dashboard/public/scanner/biofield.ts`

**Step 1: Реализовать маппинг**

```typescript
// dashboard/public/scanner/biofield.ts
import type { Vitals } from './vitals.js';
import type { VoiceMetrics } from './voice.js';

export interface BiofieldParams {
  stability: number;    // 0-100, Красный
  flow: number;         // 0-100, Оранжевый
  energy: number;       // 0-100, Жёлтый
  resonance: number;    // 0-100, Зелёный
  vibration: number;    // 0-100, Голубой
  clarity: number;      // 0-100, Индиго
  integrity: number;    // 0-100, Фиолетовый
  luminosity: number;   // 0-100, общее свечение
}

const PARAM_COLORS = [
  '#ff6b8a', '#ff9f5a', '#ffd06b', '#5ae8b0',
  '#5ac8ff', '#8b8aff', '#c77dff'
] as const;

const PARAM_NAMES = [
  'Стабильность', 'Поток', 'Энергия', 'Резонанс',
  'Вибрация', 'Ясность', 'Целостность'
] as const;

const PARAM_KEYS: (keyof Omit<BiofieldParams, 'luminosity'>)[] = [
  'stability', 'flow', 'energy', 'resonance',
  'vibration', 'clarity', 'integrity'
];

export { PARAM_COLORS, PARAM_NAMES, PARAM_KEYS };

/** Normalize a value to 0-100 given expected range */
function norm(value: number | null, min: number, max: number, invert = false): number {
  if (value === null) return 50; // default neutral
  const clamped = Math.max(min, Math.min(max, value));
  const ratio = (clamped - min) / (max - min);
  return Math.round((invert ? 1 - ratio : ratio) * 100);
}

export function mapToBiofield(vitals: Vitals, voice: VoiceMetrics): BiofieldParams {
  // 1. Стабильность — HRV (RMSSD): 20-80ms нормальный диапазон
  //    Средние значения = высокая стабильность
  const stability = vitals.hrv !== null
    ? 100 - Math.min(100, Math.abs(vitals.hrv - 50) * 2)
    : 50;

  // 2. Поток — плавность HR (низкая дисперсия = высокий поток)
  const flow = vitals.hrSmoothed !== null
    ? norm(vitals.hrSmoothed, 0, 100)
    : 50;

  // 3. Энергия — HR в зоне нормы (60-80 = оптимально) + громкость голоса
  const hrScore = vitals.hr !== null
    ? 100 - Math.min(100, Math.abs(vitals.hr - 70) * 2.5)
    : 50;
  const volumeScore = norm(voice.rms, 0, 0.3);
  const energy = Math.round(hrScore * 0.6 + volumeScore * 0.4);

  // 4. Резонанс — Heart Coherence
  const resonance = vitals.coherence ?? 50;

  // 5. Вибрация — Pitch + spectral centroid (богатство обертонов)
  const pitchScore = norm(voice.pitch, 80, 300);
  const centroidScore = norm(voice.spectralCentroid, 500, 4000);
  const vibration = Math.round(pitchScore * 0.5 + centroidScore * 0.5);

  // 6. Ясность — HNR (чистота) + низкий jitter
  const hnrScore = norm(voice.hnr, 0, 25);
  const jitterScore = norm(voice.jitter, 0, 5, true); // inverted: low jitter = high clarity
  const clarity = Math.round(hnrScore * 0.6 + jitterScore * 0.4);

  // 7. Целостность — согласованность всех параметров (низкий разброс)
  const params = [stability, flow, energy, resonance, vibration, clarity];
  const mean = params.reduce((a, b) => a + b) / params.length;
  const variance = params.reduce((s, v) => s + (v - mean) ** 2, 0) / params.length;
  const consistency = Math.max(0, 100 - Math.sqrt(variance) * 3);
  const integrity = Math.round(consistency);

  // Светимость — взвешенное среднее
  const all = [stability, flow, energy, resonance, vibration, clarity, integrity];
  const luminosity = Math.round(all.reduce((a, b) => a + b) / all.length);

  return { stability, flow, energy, resonance, vibration, clarity, integrity, luminosity };
}
```

**Step 2: Проверить — значения 7 параметров обновляются**

**Step 3: Commit**

```bash
git add dashboard/public/scanner/biofield.ts
git commit -m "feat(scanner): biofield mapper - vitals & voice to 7 parameters"
```

---

## Task 7: Визуализация — аура (Canvas/WebGL свечение)

**Files:**
- Create: `dashboard/public/scanner/aura.ts`

**Step 1: Реализовать рендер ауры поверх видео**

```typescript
// dashboard/public/scanner/aura.ts
import { BiofieldParams, PARAM_COLORS, PARAM_KEYS } from './biofield.js';

export class AuraRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pulsePhase = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  render(params: BiofieldParams, heartRate: number | null) {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height * 0.45;

    // Пульсация синхронизирована с пульсом
    const bps = (heartRate ?? 72) / 60;
    this.pulsePhase += bps * 0.016 * Math.PI * 2; // ~60fps

    // Рисуем 7 слоёв свечения (от внешнего к внутреннему)
    const values = PARAM_KEYS.map(k => params[k]);

    for (let i = 6; i >= 0; i--) {
      const value = values[i] / 100;
      const baseRadius = 80 + i * 25;
      const pulse = 1 + Math.sin(this.pulsePhase + i * 0.3) * 0.05 * value;
      const radius = baseRadius * pulse * (0.5 + value * 0.5);

      const gradient = ctx.createRadialGradient(
        centerX, centerY, radius * 0.3,
        centerX, centerY, radius
      );

      const color = PARAM_COLORS[i];
      const alpha = 0.1 + value * 0.25;
      gradient.addColorStop(0, color + '00'); // transparent center
      gradient.addColorStop(0.4, hexToRGBA(color, alpha * 0.5));
      gradient.addColorStop(0.7, hexToRGBA(color, alpha));
      gradient.addColorStop(1, color + '00'); // transparent edge

      ctx.fillStyle = gradient;
      ctx.beginPath();
      // Ellipse — slightly taller than wide (body shape)
      ctx.ellipse(centerX, centerY, radius * 0.7, radius, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function hexToRGBA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
```

**Step 2: Проверить — аура рендерится поверх видео, пульсирует**

**Step 3: Commit**

```bash
git add dashboard/public/scanner/aura.ts
git commit -m "feat(scanner): aura visualization with 7 glowing layers"
```

---

## Task 8: Панель AWABAND (7 полосок)

**Files:**
- Create: `dashboard/public/scanner/awaband-panel.ts`

**Step 1: Реализовать панель 7 параметров**

```typescript
// dashboard/public/scanner/awaband-panel.ts
import { BiofieldParams, PARAM_COLORS, PARAM_NAMES, PARAM_KEYS } from './biofield.js';

export class AwabandPanel {
  private container: HTMLElement;
  private bars: HTMLElement[] = [];
  private luminosityEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  private build() {
    this.container.innerHTML = '';
    this.container.className = 'awaband-panel';

    // Luminosity header
    this.luminosityEl = document.createElement('div');
    this.luminosityEl.className = 'luminosity';
    this.container.appendChild(this.luminosityEl);

    // 7 bars
    const grid = document.createElement('div');
    grid.className = 'param-grid';

    for (let i = 0; i < 7; i++) {
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = `
        <span class="param-name">${PARAM_NAMES[i]}</span>
        <div class="param-bar-track">
          <div class="param-bar-fill" style="background:${PARAM_COLORS[i]}"></div>
        </div>
        <span class="param-value">—</span>
      `;
      grid.appendChild(row);
      this.bars.push(row);
    }

    this.container.appendChild(grid);
  }

  update(params: BiofieldParams) {
    PARAM_KEYS.forEach((key, i) => {
      const value = params[key];
      const fill = this.bars[i].querySelector('.param-bar-fill') as HTMLElement;
      const label = this.bars[i].querySelector('.param-value') as HTMLElement;
      fill.style.width = `${value}%`;
      label.textContent = `${value}`;
    });

    if (this.luminosityEl) {
      this.luminosityEl.textContent = `Светимость: ${params.luminosity}`;
      // Цвет светимости: от тусклого к золотисто-зелёному
      const hue = 80 + (params.luminosity / 100) * 40; // 80-120 (yellow-green)
      const sat = 40 + (params.luminosity / 100) * 40;
      const light = 30 + (params.luminosity / 100) * 30;
      this.luminosityEl.style.color = `hsl(${hue}, ${sat}%, ${light}%)`;
    }
  }
}
```

**Step 2: Добавить стили для панели в scanner.css**

7 горизонтальных полосок, компактные, прозрачный фон, шрифт JetBrains Mono для значений.

**Step 3: Проверить — панель обновляется в реальном времени**

**Step 4: Commit**

```bash
git add dashboard/public/scanner/awaband-panel.ts
git commit -m "feat(scanner): AWABAND panel with 7 parameter bars and luminosity"
```

---

## Task 9: Экран сканирования — сборка всех компонентов

**Files:**
- Modify: `dashboard/public/scanner/main.ts` — собрать камеру + микрофон + rPPG + voice + biofield + аура + панель

**Step 1: Собрать цикл сканирования**

В `startScanning()`:
1. Создать DOM: `<video>` (фоном) + `<canvas>` (аура поверх) + div (панель AWABAND)
2. Запустить камеру → video
3. Запустить VoiceAnalyzer
4. requestAnimationFrame loop:
   - Каждый кадр: extractROIPixels → rppg.addFrame
   - Каждые 500ms: rppg.getHeartRate, calculateHRV, voice.getMetrics → mapToBiofield → aura.render + panel.update
5. Кнопка «Стоп» → фиксирует текущий BiofieldParams → showScreen('result')

**Step 2: Реализовать экран результата**

Статичный снимок: аура + панель + кнопки «Новое сканирование» и «Поделиться» (canvas.toDataURL).

**Step 3: Проверить — полный цикл splash → scan → result работает**

**Step 4: Commit**

```bash
git add dashboard/public/scanner/main.ts
git commit -m "feat(scanner): wire up scanning loop - camera, voice, biofield, aura"
```

---

## Task 10: Сборка TypeScript → JS и финальная стилизация

**Files:**
- Create: `scripts/build-scanner.ts` — скрипт сборки scanner/*.ts → scanner/*.js
- Modify: `package.json` — добавить `"build-scanner"` script
- Modify: `dashboard/public/scanner/scanner.css` — финальные стили

**Step 1: Настроить сборку**

Использовать esbuild (быстрый, zero-config) для бандлинга:

```bash
npm install --save-dev esbuild
```

Добавить в package.json:
```json
"build-scanner": "esbuild dashboard/public/scanner/main.ts --bundle --outfile=dashboard/public/scanner/main.js --format=esm --target=es2022"
```

**Step 2: Финализировать CSS**

- Splash: центрированный логотип, glow-анимация кнопки
- Scanning: видео fullscreen, аура поверх, панель снизу (полупрозрачная)
- Result: финальный снимок, кнопки

**Step 3: Полная проверка на мобильном**

```bash
npm run build-scanner
npm run dev
# Открыть с телефона по IP http://<local-ip>:3000/scanner/
# Проверить: камера, микрофон, аура, панель, результат
```

**Step 4: Commit**

```bash
git add scripts/build-scanner.ts package.json dashboard/public/scanner/
git commit -m "feat(scanner): esbuild bundling and final CSS styling"
```

---

## Task 11: Деплой на Railway

**Files:**
- Modify: `Dockerfile` — добавить build-scanner в сборку
- Modify: `start.sh` — если нужно

**Step 1: Добавить build-scanner в Dockerfile**

Добавить `RUN npm run build-scanner` перед стартом.

**Step 2: Протестировать локально**

```bash
docker build -t awaterra-world .
docker run -p 3000:3000 awaterra-world
# Проверить /scanner/
```

**Step 3: Задеплоить**

```bash
MSYS_NO_PATHCONV=1 railway up --detach
```

**Step 4: Commit**

```bash
git add Dockerfile
git commit -m "deploy: add scanner build to Docker"
```

---

План сохранён в `docs/plans/2026-03-10-awaband-scanner-plan.md`.

**Два варианта выполнения:**

1. **Subagent-Driven (в этой сессии)** — я запускаю свежего субагента на каждую задачу, ревью между задачами, быстрая итерация

2. **Параллельная сессия (отдельно)** — открываешь новую сессию с executing-plans, пакетное выполнение с контрольными точками

**Какой подход?**
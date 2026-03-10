// dashboard/public/scanner/aura.js

const PARAM_COLORS = [
  '#ff6b8a', '#ff9f5a', '#ffd06b', '#5ae8b0',
  '#5ac8ff', '#8b8aff', '#c77dff'
];

const PARAM_KEYS = [
  'stability', 'flow', 'energy', 'resonance',
  'vibration', 'clarity', 'integrity'
];

export class AuraRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pulsePhase = 0;
    // Face position (normalized 0-1, smoothed)
    this.faceX = 0.5;
    this.faceY = 0.4;
    this.faceScale = 1.0;
    // Face detector (Chrome/Edge built-in API)
    this._faceDetector = null;
    this._initFaceDetector();
  }

  _initFaceDetector() {
    if (typeof FaceDetector !== 'undefined') {
      try {
        this._faceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      } catch (e) {
        // FaceDetector not supported
      }
    }
  }

  /**
   * Detect face position from video element
   * @param {HTMLVideoElement} video
   */
  async detectFace(video) {
    if (!this._faceDetector || video.readyState < 2) return;
    try {
      const faces = await this._faceDetector.detect(video);
      if (faces.length > 0) {
        const box = faces[0].boundingBox;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        // Normalize to 0-1, mirror X (camera is mirrored)
        const rawX = 1 - (box.x + box.width / 2) / vw;
        const rawY = (box.y + box.height / 2) / vh;
        const rawScale = (box.width / vw) * 3; // scale factor based on face size
        // Smooth with EMA
        this.faceX = this.faceX * 0.7 + rawX * 0.3;
        this.faceY = this.faceY * 0.7 + rawY * 0.3;
        this.faceScale = this.faceScale * 0.8 + rawScale * 0.2;
      }
    } catch (e) {
      // Ignore detection errors
    }
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Render aura glow layers based on biofield parameters
   * @param {{ stability: number, flow: number, energy: number, resonance: number, vibration: number, clarity: number, integrity: number }} params
   * @param {number|null} heartRate - BPM for pulse sync
   */
  render(params, heartRate) {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    // Center on detected face position
    const centerX = this.faceX * width;
    const centerY = this.faceY * height;
    const scale = this.faceScale;

    // Pulse synchronized with heart rate
    const bps = (heartRate ?? 72) / 60;
    this.pulsePhase += bps * 0.016 * Math.PI * 2;

    // Draw 7 glow layers (outer to inner)
    const values = PARAM_KEYS.map(k => params[k]);

    for (let i = 6; i >= 0; i--) {
      const value = values[i] / 100;
      const baseRadius = (60 + i * 22) * scale;
      const pulse = 1 + Math.sin(this.pulsePhase + i * 0.3) * 0.05 * value;
      const radius = baseRadius * pulse * (0.5 + value * 0.5);

      if (radius < 2) continue;

      const gradient = ctx.createRadialGradient(
        centerX, centerY, radius * 0.2,
        centerX, centerY, radius
      );

      const color = PARAM_COLORS[i];
      const alpha = 0.08 + value * 0.2;
      gradient.addColorStop(0, color + '00');
      gradient.addColorStop(0.3, hexToRGBA(color, alpha * 0.3));
      gradient.addColorStop(0.6, hexToRGBA(color, alpha));
      gradient.addColorStop(1, color + '00');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      // Ellipse — slightly taller than wide (head/body shape)
      ctx.ellipse(centerX, centerY, radius * 0.75, radius, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

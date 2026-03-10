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
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Render aura glow layers based on biofield parameters
   * @param {{ stability: number, flow: number, energy: number, resonance: number, vibration: number, clarity: number, integrity: number }} params - values 0-100
   * @param {number|null} heartRate - BPM for pulse sync
   */
  render(params, heartRate) {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height * 0.45;

    // Pulse synchronized with heart rate
    const bps = (heartRate ?? 72) / 60;
    this.pulsePhase += bps * 0.016 * Math.PI * 2; // ~60fps

    // Draw 7 glow layers (outer to inner)
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

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

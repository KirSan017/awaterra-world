// dashboard/public/scanner/awaband-panel.js

const PARAM_COLORS = [
  '#ff6b8a', '#ff9f5a', '#ffd06b', '#5ae8b0',
  '#5ac8ff', '#8b8aff', '#c77dff'
];

const PARAM_NAMES = [
  'Стабильность', 'Поток', 'Энергия', 'Резонанс',
  'Вибрация', 'Ясность', 'Целостность'
];

const PARAM_KEYS = [
  'stability', 'flow', 'energy', 'resonance',
  'vibration', 'clarity', 'integrity'
];

export class AwabandPanel {
  constructor(container) {
    this.container = container;
    this.bars = [];
    this.luminosityEl = null;
    this._build();
  }

  _build() {
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

  /**
   * Update panel with new biofield parameters
   * @param {{ stability: number, flow: number, energy: number, resonance: number, vibration: number, clarity: number, integrity: number, luminosity: number }} params
   */
  update(params) {
    PARAM_KEYS.forEach((key, i) => {
      const value = params[key];
      const fill = this.bars[i].querySelector('.param-bar-fill');
      const label = this.bars[i].querySelector('.param-value');
      fill.style.width = `${value}%`;
      label.textContent = `${value}`;
    });

    if (this.luminosityEl) {
      this.luminosityEl.textContent = `Светимость: ${params.luminosity}`;
      // Color shifts from dim to golden-green as luminosity increases
      const hue = 80 + (params.luminosity / 100) * 40; // 80-120 (yellow-green)
      const sat = 40 + (params.luminosity / 100) * 40;
      const light = 30 + (params.luminosity / 100) * 30;
      this.luminosityEl.style.color = `hsl(${hue}, ${sat}%, ${light}%)`;
    }
  }
}

// AWABAND Scanner — Biofield Analysis Interface
// Awaterra 2225 Universe

const SCREENS = ['splash', 'scanning', 'result'];

/** Switch visible screen */
function showScreen(id) {
  for (const name of SCREENS) {
    const el = document.getElementById(name);
    if (el) el.classList.toggle('active', name === id);
  }
}

/** Create an element with optional classes and attributes */
function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    }
  }
  return e;
}

/** Build splash screen */
function buildSplash() {
  const screen = el('div', 'screen active');
  screen.id = 'splash';

  // Orb
  screen.appendChild(el('div', 'splash-orb'));

  // Brand
  const brand = el('div', 'splash-brand');
  brand.innerHTML = 'AWA<span>BAND</span>';
  screen.appendChild(brand);

  // Version
  screen.appendChild(el('div', 'splash-version', { text: 'Biofield Scanner v2225.7' }));

  // Start button
  const btn = el('button', 'splash-btn');
  btn.appendChild(el('span', 'splash-btn-icon'));
  btn.appendChild(document.createTextNode('Начать сканирование'));
  btn.addEventListener('click', () => showScreen('scanning'));
  screen.appendChild(btn);

  // Footer
  screen.appendChild(el('div', 'splash-footer', { text: 'AWATERRA DYNAMICS // MED-TECH DIVISION' }));

  return screen;
}

/** Build scanning screen (placeholder) */
function buildScanning() {
  const screen = el('div', 'screen');
  screen.id = 'scanning';
  return screen;
}

/** Build result screen (placeholder) */
function buildResult() {
  const screen = el('div', 'screen');
  screen.id = 'result';
  return screen;
}

/** Initialize the app */
function init() {
  const app = document.getElementById('app');
  if (!app) return;

  app.appendChild(buildSplash());
  app.appendChild(buildScanning());
  app.appendChild(buildResult());
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

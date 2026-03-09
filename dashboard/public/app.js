// State
let index = null;
let currentFile = null;
let editMode = false;
let activeFilter = null; // tag filter
let currentView = "tree"; // tree | graph

// DOM refs
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const statsEl = $("#stats");
const treeEl = $("#tree");
const tagPanel = $("#tag-panel");
const tagPanelBody = tagPanel.querySelector(".tag-panel-body");
const graphCanvas = $("#graph-canvas");
const searchEl = $("#search");
const sidebar = $("#sidebar");
const contentEl = $("#content");
const emptyState = $("#empty-state");
const fileView = $("#file-view");
const metadataEl = $("#metadata");
const previewEl = $("#preview");
const editorEl = $("#editor");
const editorBody = $("#editor-body");
const actionsEl = $("#actions");
const btnEdit = $("#btn-edit");
const btnPreview = $("#btn-preview");
const btnDelete = $("#btn-delete");
const btnSave = $("#btn-save");
const btnCancel = $("#btn-cancel");
const newFileBtn = $("#new-file-btn");
const modalOverlay = $("#modal-overlay");

// Boot
async function init() {
  try {
    const res = await fetch("/api/index");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    index = await res.json();
    renderStats();
    renderTagPanel();
    renderTree();
    bindEvents();
  } catch (err) {
    console.error("Failed to load index:", err);
    emptyState.querySelector("p").textContent =
      "Ошибка загрузки данных. Проверьте сервер.";
  }
}

// Stats
function renderStats() {
  const s = index.stats;
  statsEl.textContent = `${s.totalFiles} файлов \u00b7 ${s.totalWords.toLocaleString()} слов \u00b7 ${s.complete}\u2713 ${s.draft}\u270e ${s.stub}\u25a1`;
}

// ==================== VIEW SWITCHER ====================

function switchView(view) {
  currentView = view;
  $$(".view-switcher button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });

  if (view === "graph") {
    sidebar.style.display = "none";
    contentEl.style.display = "none";
    graphCanvas.style.display = "block";
    renderGraph();
  } else {
    sidebar.style.display = "";
    contentEl.style.display = "";
    graphCanvas.style.display = "none";
  }
}

// ==================== TREE ====================

function renderTree() {
  const groups = {};
  const scenes = index.nodes.filter((n) => n.type === "scene");
  const metas = index.nodes.filter((n) => n.type === "meta");
  const concepts = index.nodes.filter(
    (n) => n.type !== "scene" && n.type !== "meta"
  );

  for (const node of concepts) {
    const d = node.domain || "other";
    if (!groups[d]) groups[d] = [];
    groups[d].push(node);
  }

  for (const arr of Object.values(groups)) {
    arr.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }
  scenes.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  metas.sort((a, b) => a.title.localeCompare(b.title, "ru"));

  let html = "";
  if (metas.length) html += renderTreeGroup("meta", "meta", metas);
  const sortedDomains = Object.keys(groups).sort();
  for (const domain of sortedDomains) {
    html += renderTreeGroup(domain, domain, groups[domain]);
  }
  if (scenes.length) html += renderTreeGroup("scenes", "scenes", scenes);

  treeEl.innerHTML = html;

  if (currentFile) {
    const item = treeEl.querySelector(`.tree-item[data-id="${currentFile.id}"]`);
    if (item) item.classList.add("active");
  }

  updateFilterIndicator();
}

function renderTreeGroup(id, label, nodes) {
  const complete = nodes.filter((n) => n.status === "complete").length;
  let html = `<div class="tree-domain" data-group="${id}">`;
  html += `<span class="arrow">\u25bc</span> ${label} `;
  html += `<span class="count">(${complete}/${nodes.length})</span>`;
  html += `</div><div class="tree-items" data-group="${id}">`;
  for (const node of nodes) {
    html += `<div class="tree-item" data-id="${node.id}">`;
    html += `<span class="status-dot ${node.status}"></span>`;
    html += `<span class="item-title">${escapeHtml(node.title)}</span>`;
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ==================== FILTER INDICATOR ====================

function updateFilterIndicator() {
  const existing = sidebar.querySelector(".filter-indicator");
  if (existing) existing.remove();

  if (!activeFilter) return;

  const indicator = document.createElement("div");
  indicator.className = "filter-indicator";
  indicator.innerHTML = `\ud83c\udff7 <strong>${escapeHtml(activeFilter)}</strong> <span class="clear-filter">\u2715</span>`;
  indicator.querySelector(".clear-filter").addEventListener("click", () => {
    clearFilter();
  });
  sidebar.insertBefore(indicator, treeEl);
}

function clearFilter() {
  activeFilter = null;
  searchEl.value = "";
  $$(".tree-item").forEach((el) => el.classList.remove("hidden"));
  tagPanelBody.querySelectorAll(".cloud-tag").forEach((el) => el.classList.remove("active"));
  updateFilterIndicator();
  // Also update meta tags if file is open
  $$(".meta-tag").forEach((el) => el.classList.remove("active"));
}

// ==================== TAG PANEL ====================

function renderTagPanel() {
  const tags = index.tags;
  const entries = Object.entries(tags).sort((a, b) => b[1].length - a[1].length);
  if (!entries.length) {
    tagPanelBody.innerHTML = "<span style='color:var(--text-dim);font-size:11px'>Нет тегов</span>";
    return;
  }

  let html = "";
  for (const [tag, ids] of entries) {
    const isActive = activeFilter === tag ? " active" : "";
    html += `<span class="cloud-tag${isActive}" data-tag="${escapeHtml(tag)}" title="${ids.length} файлов">${escapeHtml(tag)}</span>`;
  }
  tagPanelBody.innerHTML = html;
}

// ==================== FORCE GRAPH ====================

let graphNodes = [];
let graphEdges = [];
let graphDragging = null;
let graphOffset = { x: 0, y: 0 };
let graphAnimFrame = null;
let graphZoom = 1;
let graphPan = { x: 0, y: 0 };
let graphPanning = false;
let graphPanStart = { x: 0, y: 0 };

const DOMAIN_COLORS = {
  technology: "#7aa2f7",
  "daily-life": "#9ece6a",
  society: "#e0af68",
  substances: "#f7768e",
  nature: "#73daca",
  culture: "#bb9af7",
  spaces: "#7dcfff",
  other: "#565f89",
};

const TYPE_SHAPES = { concept: "circle", scene: "diamond", meta: "square" };

function renderGraph() {
  const canvas = graphCanvas;
  const mainRect = document.querySelector("main").getBoundingClientRect();
  canvas.width = mainRect.width;
  canvas.height = mainRect.height;

  // Reset zoom/pan
  graphZoom = 1;
  graphPan = { x: 0, y: 0 };

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  graphNodes = index.nodes.map((n, i) => {
    const angle = (i / index.nodes.length) * Math.PI * 2;
    const r = 150 + Math.random() * 100;
    return {
      ...n,
      x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 50,
      y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 50,
      vx: 0,
      vy: 0,
      radius: n.status === "stub" ? 6 : 8 + Math.min(n.wordCount / 500, 8),
    };
  });

  const nodeMap = {};
  graphNodes.forEach((n) => (nodeMap[n.id] = n));

  graphEdges = index.edges
    .filter((e) => nodeMap[e.from] && nodeMap[e.to])
    .map((e) => ({ source: nodeMap[e.from], target: nodeMap[e.to], type: e.type }));

  // Start simulation
  if (graphAnimFrame) cancelAnimationFrame(graphAnimFrame);
  let iterations = 0;

  function simulate() {
    iterations++;
    const alpha = Math.max(0.01, 1 - iterations / 300);

    // Repulsion between all nodes
    for (let i = 0; i < graphNodes.length; i++) {
      for (let j = i + 1; j < graphNodes.length; j++) {
        const a = graphNodes[i];
        const b = graphNodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (800 / (dist * dist)) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // Attraction along edges
    for (const edge of graphEdges) {
      const dx = edge.target.x - edge.source.x;
      const dy = edge.target.y - edge.source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 80) * 0.005 * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      edge.source.vx += fx;
      edge.source.vy += fy;
      edge.target.vx -= fx;
      edge.target.vy -= fy;
    }

    // Center gravity
    for (const node of graphNodes) {
      node.vx += (cx - node.x) * 0.001 * alpha;
      node.vy += (cy - node.y) * 0.001 * alpha;
    }

    // Apply velocity with damping
    for (const node of graphNodes) {
      if (node === graphDragging) continue;
      node.vx *= 0.85;
      node.vy *= 0.85;
      node.x += node.vx;
      node.y += node.vy;
      // Keep in bounds
      node.x = Math.max(20, Math.min(canvas.width - 20, node.x));
      node.y = Math.max(20, Math.min(canvas.height - 20, node.y));
    }

    drawGraph();
    graphAnimFrame = requestAnimationFrame(simulate);
  }

  simulate();
}

// Convert screen coords to world coords (accounting for zoom/pan)
function screenToWorld(sx, sy) {
  return {
    x: (sx - graphPan.x) / graphZoom,
    y: (sy - graphPan.y) / graphZoom,
  };
}

function drawGraph() {
  const canvas = graphCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(graphPan.x, graphPan.y);
  ctx.scale(graphZoom, graphZoom);

  // Draw edges
  ctx.lineWidth = 0.5 / graphZoom;
  for (const edge of graphEdges) {
    ctx.strokeStyle = edge.type === "related" ? "rgba(122,162,247,0.25)" : "rgba(158,206,106,0.2)";
    ctx.beginPath();
    ctx.moveTo(edge.source.x, edge.source.y);
    ctx.lineTo(edge.target.x, edge.target.y);
    ctx.stroke();
  }

  // Draw nodes
  for (const node of graphNodes) {
    const color = DOMAIN_COLORS[node.domain] || DOMAIN_COLORS.other;
    const isActive = currentFile && currentFile.id === node.id;
    const isHovered = graphHovered === node;

    ctx.fillStyle = color;
    ctx.globalAlpha = node.status === "stub" ? 0.4 : 0.85;

    const r = isHovered ? node.radius * 1.3 : node.radius;

    if (node.type === "scene") {
      ctx.beginPath();
      ctx.moveTo(node.x, node.y - r);
      ctx.lineTo(node.x + r, node.y);
      ctx.lineTo(node.x, node.y + r);
      ctx.lineTo(node.x - r, node.y);
      ctx.closePath();
      ctx.fill();
    } else if (node.type === "meta") {
      const s = r * 0.8;
      ctx.fillRect(node.x - s, node.y - s, s * 2, s * 2);
    } else {
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Active/hover ring
    if (isActive || isHovered) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isActive ? "#fff" : "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2 / graphZoom;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Label — scale font inversely so it stays readable when zoomed
    const fontSize = Math.max(8, Math.min(12, 10 / Math.sqrt(graphZoom)));
    ctx.fillStyle = node.status === "stub" ? "rgba(192,202,245,0.4)" : "rgba(192,202,245,0.9)";
    ctx.font = `${fontSize}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(node.title, node.x, node.y + r + fontSize + 2);
  }

  ctx.restore();

  // Zoom indicator
  if (graphZoom !== 1) {
    ctx.fillStyle = "rgba(192,202,245,0.3)";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(graphZoom * 100)}%`, canvas.width - 12, canvas.height - 12);
  }
}

let graphHovered = null;

function getGraphNodeAt(screenX, screenY) {
  const { x, y } = screenToWorld(screenX, screenY);
  for (const node of graphNodes) {
    const dx = x - node.x;
    const dy = y - node.y;
    const hitRadius = (node.radius + 4) / Math.min(graphZoom, 1); // easier to click when zoomed out
    if (dx * dx + dy * dy < hitRadius * hitRadius) return node;
  }
  return null;
}

// ==================== LOAD FILE ====================

async function loadFile(id) {
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(id)}`);
    if (!res.ok) return;
    currentFile = await res.json();
    currentFile.id = id;

    $$(".tree-item").forEach((el) => el.classList.remove("active"));
    const item = document.querySelector(`.tree-item[data-id="${id}"]`);
    if (item) item.classList.add("active");

    showFileView();
    renderMetadata();
    showPreview();

    // Redraw graph to show active node
    if (currentView === "graph") drawGraph();
  } catch (err) {
    console.error("Failed to load file:", err);
  }
}

function showFileView() {
  emptyState.style.display = "none";
  fileView.style.display = "block";
}

// Metadata
function renderMetadata() {
  const fm = currentFile.frontmatter;
  let html = "";

  html += `<span class="meta-badge domain" style="font-size:13px;font-weight:600">${escapeHtml(fm.title || currentFile.id)}</span>`;
  if (fm.domain) html += `<span class="meta-badge domain">${escapeHtml(fm.domain)}</span>`;
  html += `<span class="meta-badge status-${fm.status}">${fm.status}</span>`;
  html += `<span class="meta-badge domain">${fm.type}</span>`;

  if (fm.tags && fm.tags.length) {
    for (const tag of fm.tags) {
      const isActive = activeFilter === tag ? " active" : "";
      html += `<span class="meta-tag${isActive}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`;
    }
  }

  const links = [...(fm.related || []), ...(fm.illustratedBy || []), ...(fm.illustrates || [])];
  for (const link of links) {
    html += `<span class="meta-link" data-id="${escapeHtml(link)}">\u2192 ${escapeHtml(link)}</span>`;
  }

  metadataEl.innerHTML = html;
}

// Preview
function showPreview() {
  editMode = false;
  previewEl.style.display = "block";
  editorEl.style.display = "none";
  actionsEl.style.display = "none";
  btnEdit.style.display = "";
  btnPreview.style.display = "none";
  previewEl.innerHTML = marked.parse(currentFile.body || "");
}

// Edit
function showEditor() {
  editMode = true;
  previewEl.style.display = "none";
  editorEl.style.display = "block";
  actionsEl.style.display = "flex";
  btnEdit.style.display = "none";
  btnPreview.style.display = "";
  editorBody.value = currentFile.body || "";
  editorBody.style.height = "auto";
  editorBody.style.height = Math.max(400, editorBody.scrollHeight) + "px";
}

// Save
async function saveFile() {
  const body = editorBody.value;
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(currentFile.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frontmatter: currentFile.frontmatter, body }),
    });
    if (res.ok) {
      index = await res.json();
      currentFile.body = body;
      renderStats();
      renderTree();
      showPreview();
    }
  } catch (err) {
    console.error("Failed to save:", err);
    alert("Ошибка сохранения");
  }
}

// Delete
async function deleteFile() {
  if (!confirm(`Удалить "${currentFile.frontmatter.title}"?`)) return;
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(currentFile.id)}`, { method: "DELETE" });
    if (res.ok) {
      index = await res.json();
      currentFile = null;
      renderStats();
      renderTree();
      fileView.style.display = "none";
      emptyState.style.display = "flex";
    }
  } catch (err) {
    console.error("Failed to delete:", err);
    alert("Ошибка удаления");
  }
}

// Create
async function createFile() {
  const id = $("#new-id").value.trim();
  const title = $("#new-title").value.trim();
  const type = $("#new-type").value;
  const domain = $("#new-domain").value;
  if (!id || !title) return alert("ID и название обязательны");
  if (!/^[a-z0-9-]+$/.test(id)) return alert("ID: только строчные латинские буквы, цифры и дефисы");

  try {
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title, type, domain, status: "stub", tags: [], body: "> Эта тема ещё не описана.\n" }),
    });
    if (res.status === 409) return alert("Файл с таким ID уже существует");
    if (res.ok) {
      index = await res.json();
      renderStats();
      renderTree();
      closeModal();
      loadFile(id);
    }
  } catch (err) {
    console.error("Failed to create:", err);
    alert("Ошибка создания файла");
  }
}

// Modal
function openModal() { modalOverlay.style.display = "flex"; $("#new-id").value = ""; $("#new-title").value = ""; $("#new-id").focus(); }
function closeModal() { modalOverlay.style.display = "none"; }

// ==================== FILTER ====================

function filterTree(query) {
  const q = query.toLowerCase();
  activeFilter = null;
  updateFilterIndicator();
  $$(".tree-item").forEach((el) => {
    const title = el.querySelector(".item-title").textContent.toLowerCase();
    const id = el.dataset.id.toLowerCase();
    el.classList.toggle("hidden", q && !title.includes(q) && !id.includes(q));
  });
}

function filterByTag(tag) {
  searchEl.value = "";
  if (activeFilter === tag) {
    clearFilter();
    return;
  }
  activeFilter = tag;
  const ids = index.tags[tag] || [];

  // Filter tree
  $$(".tree-item").forEach((el) => {
    el.classList.toggle("hidden", !ids.includes(el.dataset.id));
  });

  // Highlight active tag in metadata
  $$(".meta-tag").forEach((el) => {
    el.classList.toggle("active", el.dataset.tag === tag);
  });

  // Highlight in tag panel
  tagPanelBody.querySelectorAll(".cloud-tag").forEach((el) => {
    el.classList.toggle("active", el.dataset.tag === tag);
  });

  updateFilterIndicator();
}

// ==================== EVENTS ====================

function bindEvents() {
  // View switcher
  $$(".view-switcher button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      switchView(btn.dataset.view);
    });
  });

  // Tree clicks
  treeEl.addEventListener("click", (e) => {
    const domain = e.target.closest(".tree-domain");
    if (domain) { domain.classList.toggle("collapsed"); return; }
    const item = e.target.closest(".tree-item");
    if (item) loadFile(item.dataset.id);
  });

  // Tag panel: toggle collapse
  tagPanel.querySelector(".tag-panel-header").addEventListener("click", () => {
    tagPanel.classList.toggle("collapsed");
  });

  // Tag panel clicks
  tagPanelBody.addEventListener("click", (e) => {
    const tag = e.target.closest(".cloud-tag");
    if (tag) filterByTag(tag.dataset.tag);
  });

  // Graph: click node → switch to tree + open file
  let graphClickStart = null;
  graphCanvas.addEventListener("mousedown", (e) => {
    const rect = graphCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    graphClickStart = { x: e.clientX, y: e.clientY };
    const node = getGraphNodeAt(sx, sy);
    if (node) {
      graphDragging = node;
      const w = screenToWorld(sx, sy);
      graphOffset.x = w.x - node.x;
      graphOffset.y = w.y - node.y;
    } else {
      // Start panning
      graphPanning = true;
      graphPanStart = { x: e.clientX - graphPan.x, y: e.clientY - graphPan.y };
    }
  });

  graphCanvas.addEventListener("mousemove", (e) => {
    const rect = graphCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (graphDragging) {
      const w = screenToWorld(sx, sy);
      graphDragging.x = w.x - graphOffset.x;
      graphDragging.y = w.y - graphOffset.y;
      graphDragging.vx = 0;
      graphDragging.vy = 0;
    } else if (graphPanning) {
      graphPan.x = e.clientX - graphPanStart.x;
      graphPan.y = e.clientY - graphPanStart.y;
      drawGraph();
    } else {
      // Hover detection
      const node = getGraphNodeAt(sx, sy);
      if (node !== graphHovered) {
        graphHovered = node;
        graphCanvas.style.cursor = node ? "pointer" : "grab";
        drawGraph();
      }
    }
  });

  graphCanvas.addEventListener("mouseup", (e) => {
    // Detect click (vs drag) — if mouse barely moved, it's a click
    if (graphClickStart && graphDragging) {
      const dx = e.clientX - graphClickStart.x;
      const dy = e.clientY - graphClickStart.y;
      if (dx * dx + dy * dy < 25) {
        // It was a click on a node → go to tree
        const nodeId = graphDragging.id;
        graphDragging = null;
        graphPanning = false;
        switchView("tree");
        loadFile(nodeId);
        return;
      }
    }
    graphDragging = null;
    graphPanning = false;
  });

  graphCanvas.addEventListener("mouseleave", () => {
    graphDragging = null;
    graphPanning = false;
    graphHovered = null;
  });

  // Graph zoom with mouse wheel
  graphCanvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = graphCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = Math.max(0.15, Math.min(8, graphZoom * zoomFactor));

    // Zoom toward mouse position
    graphPan.x = mx - ((mx - graphPan.x) / graphZoom) * newZoom;
    graphPan.y = my - ((my - graphPan.y) / graphZoom) * newZoom;
    graphZoom = newZoom;

    drawGraph();
  }, { passive: false });

  // Metadata clicks
  metadataEl.addEventListener("click", (e) => {
    const tag = e.target.closest(".meta-tag");
    if (tag) { filterByTag(tag.dataset.tag); return; }
    const link = e.target.closest(".meta-link");
    if (link) { loadFile(link.dataset.id); return; }
  });

  // Buttons
  btnEdit.addEventListener("click", showEditor);
  btnPreview.addEventListener("click", showPreview);
  btnSave.addEventListener("click", saveFile);
  btnCancel.addEventListener("click", showPreview);
  btnDelete.addEventListener("click", deleteFile);
  newFileBtn.addEventListener("click", openModal);
  $("#modal-create").addEventListener("click", createFile);
  $("#modal-cancel").addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });

  // Search
  let debounce;
  searchEl.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => filterTree(searchEl.value), 150);
  });

  // Textarea auto-resize
  editorBody.addEventListener("input", () => {
    editorBody.style.height = "auto";
    editorBody.style.height = Math.max(400, editorBody.scrollHeight) + "px";
  });

  // Keyboard
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modalOverlay.style.display !== "none") closeModal();
      else if (activeFilter) clearFilter();
      else if (editMode && currentFile) showPreview();
    }
    if (e.ctrlKey && e.key === "s" && editMode && currentFile) { e.preventDefault(); saveFile(); }
    if (e.ctrlKey && e.key === "k") { e.preventDefault(); searchEl.focus(); searchEl.select(); }
  });

  $("#new-title").addEventListener("keydown", (e) => { if (e.key === "Enter") createFile(); });
}

// Go
init();

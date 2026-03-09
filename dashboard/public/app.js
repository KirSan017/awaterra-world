// State
let index = null;
let currentFile = null;
let editMode = false;
let activeFilter = null;
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

// Domain colors — Awaterra's bioluminescent palette
const DOMAIN_COLORS = {
  technology: "#6b9fff",
  "daily-life": "#5ae8b0",
  society: "#ffd06b",
  substances: "#ff6b8a",
  nature: "#4ac8e8",
  culture: "#b47aff",
  spaces: "#7b8aff",
  other: "#4a5578",
};

const DOMAIN_LABELS = {
  technology: "Technology",
  "daily-life": "Daily Life",
  society: "Society",
  substances: "Substances",
  nature: "Nature",
  culture: "Culture",
  spaces: "Spaces",
  meta: "Meta",
  scenes: "Scenes",
};

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
    $(".empty-title").textContent = "Connection Error";
    $(".empty-sub").textContent = "Could not load data. Check server.";
  }
}

// ==================== STATS ====================

function renderStats() {
  const s = index.stats;
  statsEl.innerHTML = `
    <span class="stat-item"><span class="stat-value">${s.totalFiles}</span> files</span>
    <span class="stat-item"><span class="stat-value">${s.totalWords.toLocaleString()}</span> words</span>
    <span class="stat-item"><span class="stat-dot" style="background:var(--green)"></span> ${s.complete}</span>
    <span class="stat-item"><span class="stat-dot" style="background:var(--yellow)"></span> ${s.draft}</span>
    <span class="stat-item"><span class="stat-dot" style="background:var(--text-dim)"></span> ${s.stub}</span>
  `;
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
  if (metas.length) html += renderTreeGroup("meta", metas);
  const sortedDomains = Object.keys(groups).sort();
  for (const domain of sortedDomains) {
    html += renderTreeGroup(domain, groups[domain]);
  }
  if (scenes.length) html += renderTreeGroup("scenes", scenes);

  treeEl.innerHTML = html;

  if (currentFile) {
    const item = treeEl.querySelector(`.tree-item[data-id="${currentFile.id}"]`);
    if (item) item.classList.add("active");
  }

  updateFilterIndicator();
}

function renderTreeGroup(id, nodes) {
  const label = DOMAIN_LABELS[id] || id;
  const complete = nodes.filter((n) => n.status === "complete").length;
  const color = DOMAIN_COLORS[id] || DOMAIN_COLORS.other;

  let html = `<div class="tree-domain" data-group="${id}">`;
  html += `<span class="arrow">\u25bc</span>`;
  html += `<span style="color:${color}">${escapeHtml(label)}</span> `;
  html += `<span class="count">${complete}/${nodes.length}</span>`;
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
  indicator.innerHTML = `Filtered by <strong>${escapeHtml(activeFilter)}</strong> <span class="clear-filter">\u2715</span>`;
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
  $$(".meta-tag").forEach((el) => el.classList.remove("active"));
}

// ==================== TAG PANEL ====================

function renderTagPanel() {
  const tags = index.tags;
  const entries = Object.entries(tags).sort((a, b) => b[1].length - a[1].length);

  // Update count in header
  tagPanel.querySelector(".tag-panel-count").textContent = `${entries.length}`;

  if (!entries.length) {
    tagPanelBody.innerHTML = "<span style='color:var(--text-muted);font-size:11px'>No tags</span>";
    return;
  }

  let html = "";
  for (const [tag, ids] of entries) {
    const isActive = activeFilter === tag ? " active" : "";
    html += `<span class="cloud-tag${isActive}" data-tag="${escapeHtml(tag)}" title="${ids.length} files">${escapeHtml(tag)}</span>`;
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
let graphHovered = null;

function renderGraph() {
  const canvas = graphCanvas;
  const mainRect = document.querySelector("main").getBoundingClientRect();
  canvas.width = mainRect.width;
  canvas.height = mainRect.height;

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
      radius: n.status === "stub" ? 5 : 7 + Math.min(n.wordCount / 500, 9),
    };
  });

  const nodeMap = {};
  graphNodes.forEach((n) => (nodeMap[n.id] = n));

  graphEdges = index.edges
    .filter((e) => nodeMap[e.from] && nodeMap[e.to])
    .map((e) => ({ source: nodeMap[e.from], target: nodeMap[e.to], type: e.type }));

  if (graphAnimFrame) cancelAnimationFrame(graphAnimFrame);
  let iterations = 0;

  function simulate() {
    iterations++;
    const alpha = Math.max(0.01, 1 - iterations / 300);

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

    for (const node of graphNodes) {
      node.vx += (cx - node.x) * 0.001 * alpha;
      node.vy += (cy - node.y) * 0.001 * alpha;
    }

    for (const node of graphNodes) {
      if (node === graphDragging) continue;
      node.vx *= 0.85;
      node.vy *= 0.85;
      node.x += node.vx;
      node.y += node.vy;
      node.x = Math.max(20, Math.min(canvas.width - 20, node.x));
      node.y = Math.max(20, Math.min(canvas.height - 20, node.y));
    }

    drawGraph();
    graphAnimFrame = requestAnimationFrame(simulate);
  }

  simulate();
}

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

  // Edges
  for (const edge of graphEdges) {
    const isHoveredEdge = graphHovered && (edge.source === graphHovered || edge.target === graphHovered);
    const color = DOMAIN_COLORS[edge.source.domain] || DOMAIN_COLORS.other;

    if (isHoveredEdge) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5 / graphZoom;
    } else {
      ctx.strokeStyle = "rgba(107, 159, 255, 0.08)";
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.5 / graphZoom;
    }
    ctx.beginPath();
    ctx.moveTo(edge.source.x, edge.source.y);
    ctx.lineTo(edge.target.x, edge.target.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Nodes
  for (const node of graphNodes) {
    const color = DOMAIN_COLORS[node.domain] || DOMAIN_COLORS.other;
    const isActive = currentFile && currentFile.id === node.id;
    const isHovered = graphHovered === node;
    const isConnected = graphHovered && graphEdges.some(
      (e) => (e.source === graphHovered && e.target === node) || (e.target === graphHovered && e.source === node)
    );
    const dimmed = graphHovered && !isHovered && !isConnected;

    const r = isHovered ? node.radius * 1.4 : node.radius;

    // Glow halo for hovered/active
    if (isHovered || isActive) {
      const grad = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r * 3);
      grad.addColorStop(0, color.replace(")", ",0.2)").replace("rgb", "rgba"));
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = dimmed ? 0.15 : node.status === "stub" ? 0.35 : 0.9;
    ctx.fillStyle = color;

    if (node.type === "scene") {
      // Diamond
      ctx.beginPath();
      ctx.moveTo(node.x, node.y - r);
      ctx.lineTo(node.x + r, node.y);
      ctx.lineTo(node.x, node.y + r);
      ctx.lineTo(node.x - r, node.y);
      ctx.closePath();
      ctx.fill();
    } else if (node.type === "meta") {
      // Rounded square
      const s = r * 0.75;
      const cr = 2;
      ctx.beginPath();
      ctx.moveTo(node.x - s + cr, node.y - s);
      ctx.lineTo(node.x + s - cr, node.y - s);
      ctx.quadraticCurveTo(node.x + s, node.y - s, node.x + s, node.y - s + cr);
      ctx.lineTo(node.x + s, node.y + s - cr);
      ctx.quadraticCurveTo(node.x + s, node.y + s, node.x + s - cr, node.y + s);
      ctx.lineTo(node.x - s + cr, node.y + s);
      ctx.quadraticCurveTo(node.x - s, node.y + s, node.x - s, node.y + s - cr);
      ctx.lineTo(node.x - s, node.y - s + cr);
      ctx.quadraticCurveTo(node.x - s, node.y - s, node.x - s + cr, node.y - s);
      ctx.closePath();
      ctx.fill();
    } else {
      // Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ring
    if (isActive || isHovered) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isActive ? "#fff" : "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1.5 / graphZoom;
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Label
    if (!dimmed || isHovered) {
      const fontSize = Math.max(8, Math.min(11, 10 / Math.sqrt(graphZoom)));
      ctx.fillStyle = dimmed ? "rgba(164, 180, 212, 0.2)" :
        node.status === "stub" ? "rgba(164, 180, 212, 0.35)" : "rgba(164, 180, 212, 0.85)";
      ctx.font = `${isHovered ? 500 : 400} ${fontSize}px "Outfit", sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(node.title, node.x, node.y + r + fontSize + 3);
    }
  }

  ctx.restore();

  // Zoom indicator
  if (graphZoom !== 1) {
    ctx.fillStyle = "rgba(164, 180, 212, 0.25)";
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(graphZoom * 100)}%`, canvas.width - 16, canvas.height - 16);
  }
}

function getGraphNodeAt(screenX, screenY) {
  const { x, y } = screenToWorld(screenX, screenY);
  for (const node of graphNodes) {
    const dx = x - node.x;
    const dy = y - node.y;
    const hitRadius = (node.radius + 4) / Math.min(graphZoom, 1);
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

  // Title
  html += `<span class="meta-title">${escapeHtml(fm.title || currentFile.id)}</span>`;
  html += `<span class="meta-sep"></span>`;

  // Domain badge with color
  if (fm.domain) {
    const color = DOMAIN_COLORS[fm.domain] || DOMAIN_COLORS.other;
    html += `<span class="meta-badge domain" style="color:${color};border-color:${color}22;background:${color}15">${escapeHtml(fm.domain)}</span>`;
  }

  // Type badge
  html += `<span class="meta-badge type-${fm.type}">${fm.type}</span>`;

  // Status badge
  html += `<span class="meta-badge status-${fm.status}">${fm.status}</span>`;

  // Tags
  if (fm.tags && fm.tags.length) {
    html += `<span class="meta-sep"></span>`;
    for (const tag of fm.tags) {
      const isActive = activeFilter === tag ? " active" : "";
      html += `<span class="meta-tag${isActive}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`;
    }
  }

  // Related links
  const links = [...(fm.related || []), ...(fm.illustratedBy || []), ...(fm.illustrates || [])];
  if (links.length) {
    html += `<span class="meta-sep"></span>`;
    for (const link of links) {
      html += `<span class="meta-link" data-id="${escapeHtml(link)}">\u2192 ${escapeHtml(link)}</span>`;
    }
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
    alert("Save error");
  }
}

// Delete
async function deleteFile() {
  if (!confirm(`Delete "${currentFile.frontmatter.title}"?`)) return;
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
    alert("Delete error");
  }
}

// Create
async function createFile() {
  const id = $("#new-id").value.trim();
  const title = $("#new-title").value.trim();
  const type = $("#new-type").value;
  const domain = $("#new-domain").value;
  if (!id || !title) return alert("ID and title required");
  if (!/^[a-z0-9-]+$/.test(id)) return alert("ID: lowercase latin, digits, hyphens only");

  try {
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title, type, domain, status: "stub", tags: [], body: "> \u042d\u0442\u0430 \u0442\u0435\u043c\u0430 \u0435\u0449\u0451 \u043d\u0435 \u043e\u043f\u0438\u0441\u0430\u043d\u0430.\n" }),
    });
    if (res.status === 409) return alert("File with this ID already exists");
    if (res.ok) {
      index = await res.json();
      renderStats();
      renderTree();
      closeModal();
      loadFile(id);
    }
  } catch (err) {
    console.error("Failed to create:", err);
    alert("Create error");
  }
}

// Modal
function openModal() {
  modalOverlay.style.display = "flex";
  $("#new-id").value = "";
  $("#new-title").value = "";
  requestAnimationFrame(() => $("#new-id").focus());
}
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

  $$(".tree-item").forEach((el) => {
    el.classList.toggle("hidden", !ids.includes(el.dataset.id));
  });

  $$(".meta-tag").forEach((el) => {
    el.classList.toggle("active", el.dataset.tag === tag);
  });

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

  // Graph: click node -> switch to tree + open file
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
      const node = getGraphNodeAt(sx, sy);
      if (node !== graphHovered) {
        graphHovered = node;
        graphCanvas.style.cursor = node ? "pointer" : "grab";
        drawGraph();
      }
    }
  });

  graphCanvas.addEventListener("mouseup", (e) => {
    if (graphClickStart && graphDragging) {
      const dx = e.clientX - graphClickStart.x;
      const dy = e.clientY - graphClickStart.y;
      if (dx * dx + dy * dy < 25) {
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
    if (graphHovered) {
      graphHovered = null;
      drawGraph();
    }
  });

  // Graph zoom
  graphCanvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = graphCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = Math.max(0.15, Math.min(8, graphZoom * zoomFactor));

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

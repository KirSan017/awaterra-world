// State
let index = null;
let currentFile = null;
let editMode = false;
let activeFilter = null; // tag filter

// DOM refs
const $ = (sel) => document.querySelector(sel);
const statsEl = $("#stats");
const treeEl = $("#tree");
const searchEl = $("#search");
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

// Tree
function renderTree() {
  // Group nodes by: meta first, then domains alphabetically, then scenes
  const groups = {};

  // Separate scenes and meta
  const scenes = index.nodes.filter((n) => n.type === "scene");
  const metas = index.nodes.filter((n) => n.type === "meta");
  const concepts = index.nodes.filter(
    (n) => n.type !== "scene" && n.type !== "meta"
  );

  // Group concepts by domain
  for (const node of concepts) {
    const d = node.domain || "other";
    if (!groups[d]) groups[d] = [];
    groups[d].push(node);
  }

  // Sort nodes within each group by title
  for (const arr of Object.values(groups)) {
    arr.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }
  scenes.sort((a, b) => a.title.localeCompare(b.title, "ru"));
  metas.sort((a, b) => a.title.localeCompare(b.title, "ru"));

  let html = "";

  // Meta section
  if (metas.length) {
    html += renderTreeGroup("meta", "meta", metas);
  }

  // Domain sections (sorted)
  const sortedDomains = Object.keys(groups).sort();
  for (const domain of sortedDomains) {
    html += renderTreeGroup(domain, domain, groups[domain]);
  }

  // Scenes section
  if (scenes.length) {
    html += renderTreeGroup("scenes", "scenes", scenes);
  }

  treeEl.innerHTML = html;

  // Re-highlight current file if still present
  if (currentFile) {
    const item = treeEl.querySelector(
      `.tree-item[data-id="${currentFile.id}"]`
    );
    if (item) item.classList.add("active");
  }
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

// Load file
async function loadFile(id) {
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(id)}`);
    if (!res.ok) return;
    currentFile = await res.json();
    currentFile.id = id;

    // Update tree selection
    document
      .querySelectorAll(".tree-item")
      .forEach((el) => el.classList.remove("active"));
    const item = document.querySelector(`.tree-item[data-id="${id}"]`);
    if (item) item.classList.add("active");

    showFileView();
    renderMetadata();
    showPreview();
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
  html += `<span class="meta-badge domain" style="font-size:13px;font-weight:600">${escapeHtml(fm.title || currentFile.id)}</span>`;

  // Domain badge
  if (fm.domain) {
    html += `<span class="meta-badge domain">${escapeHtml(fm.domain)}</span>`;
  }

  // Status badge
  html += `<span class="meta-badge status-${fm.status}">${fm.status}</span>`;

  // Type badge
  html += `<span class="meta-badge domain">${fm.type}</span>`;

  // Tags
  if (fm.tags && fm.tags.length) {
    for (const tag of fm.tags) {
      html += `<span class="meta-tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`;
    }
  }

  // Related links
  const links = [
    ...(fm.related || []),
    ...(fm.illustratedBy || []),
    ...(fm.illustrates || []),
  ];
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
  // Auto-resize
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
    const res = await fetch(`/api/files/${encodeURIComponent(currentFile.id)}`, {
      method: "DELETE",
    });
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

// Create new file
async function createFile() {
  const id = $("#new-id").value.trim();
  const title = $("#new-title").value.trim();
  const type = $("#new-type").value;
  const domain = $("#new-domain").value;

  if (!id || !title) return alert("ID и название обязательны");

  // Validate ID format
  if (!/^[a-z0-9-]+$/.test(id)) {
    return alert("ID может содержать только строчные латинские буквы, цифры и дефисы");
  }

  try {
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        title,
        type,
        domain,
        status: "stub",
        tags: [],
        body: "> Эта тема ещё не описана.\n",
      }),
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
function openModal() {
  modalOverlay.style.display = "flex";
  $("#new-id").value = "";
  $("#new-title").value = "";
  $("#new-id").focus();
}
function closeModal() {
  modalOverlay.style.display = "none";
}

// Search / filter
function filterTree(query) {
  const q = query.toLowerCase();
  activeFilter = null; // clear tag filter when searching
  document.querySelectorAll(".tree-item").forEach((el) => {
    const title = el.querySelector(".item-title").textContent.toLowerCase();
    const id = el.dataset.id.toLowerCase();
    el.classList.toggle("hidden", q && !title.includes(q) && !id.includes(q));
  });
}

function filterByTag(tag) {
  searchEl.value = ""; // clear search when filtering by tag
  if (activeFilter === tag) {
    // Clear filter
    activeFilter = null;
    document
      .querySelectorAll(".tree-item")
      .forEach((el) => el.classList.remove("hidden"));
    return;
  }
  activeFilter = tag;
  const ids = index.tags[tag] || [];
  document.querySelectorAll(".tree-item").forEach((el) => {
    el.classList.toggle("hidden", !ids.includes(el.dataset.id));
  });
}

// Events
function bindEvents() {
  // Tree clicks
  treeEl.addEventListener("click", (e) => {
    const domain = e.target.closest(".tree-domain");
    if (domain) {
      domain.classList.toggle("collapsed");
      return;
    }
    const item = e.target.closest(".tree-item");
    if (item) loadFile(item.dataset.id);
  });

  // Metadata clicks (tags and links)
  metadataEl.addEventListener("click", (e) => {
    const tag = e.target.closest(".meta-tag");
    if (tag) {
      filterByTag(tag.dataset.tag);
      return;
    }
    const link = e.target.closest(".meta-link");
    if (link) {
      loadFile(link.dataset.id);
      return;
    }
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
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

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

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Escape closes modal or exits edit mode
    if (e.key === "Escape") {
      if (modalOverlay.style.display !== "none") {
        closeModal();
      } else if (editMode && currentFile) {
        showPreview();
      }
    }
    // Ctrl+S saves in edit mode
    if (e.ctrlKey && e.key === "s" && editMode && currentFile) {
      e.preventDefault();
      saveFile();
    }
    // Ctrl+K focuses search
    if (e.ctrlKey && e.key === "k") {
      e.preventDefault();
      searchEl.focus();
      searchEl.select();
    }
  });

  // Enter in modal creates file
  $("#new-title").addEventListener("keydown", (e) => {
    if (e.key === "Enter") createFile();
  });
}

// Go
init();

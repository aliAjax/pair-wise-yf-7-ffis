const storageKey = "zfl16-movable-type-workshop";

const starterInventory = [
  { id: crypto.randomUUID(), char: "山", style: "宋体旧字", size: 30, quantity: 4, wear: "微磨" },
  { id: crypto.randomUUID(), char: "月", style: "宋体旧字", size: 30, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "风", style: "楷体木刻", size: 28, quantity: 2, wear: "微磨" },
  { id: crypto.randomUUID(), char: "花", style: "楷体木刻", size: 28, quantity: 2, wear: "新" },
  { id: crypto.randomUUID(), char: "茶", style: "黑体铅字", size: 24, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "雨", style: "仿宋细字", size: 22, quantity: 4, wear: "新" }
];

// clipboard：{ width, height, items:[{r,c,typeId}], mode:"copy"|"cut", source: rect|null }
// selection：{ r0,c0,r1,c1 } 矩形选区；lastCut：最近一次已完成剪切的撤销快照
const defaultState = {
  inventory: starterInventory,
  selectedTypeId: starterInventory[0].id,
  placements: [],
  drafts: [],
  selection: null,
  clipboard: null,
  lastCut: null,
  settings: {
    paperSize: "postcard",
    flowMode: "horizontal",
    gridGap: 8,
    workTitle: "晚风小笺"
  }
};

let state = loadState();

const els = {
  paperSize: document.querySelector("#paperSize"),
  flowMode: document.querySelector("#flowMode"),
  gridGap: document.querySelector("#gridGap"),
  workTitle: document.querySelector("#workTitle"),
  stage: document.querySelector("#stage"),
  typeList: document.querySelector("#typeList"),
  typeForm: document.querySelector("#typeForm"),
  charInput: document.querySelector("#charInput"),
  styleInput: document.querySelector("#styleInput"),
  sizeInput: document.querySelector("#sizeInput"),
  quantityInput: document.querySelector("#quantityInput"),
  wearInput: document.querySelector("#wearInput"),
  inventorySearch: document.querySelector("#inventorySearch"),
  styleFilter: document.querySelector("#styleFilter"),
  selectedTypeLabel: document.querySelector("#selectedTypeLabel"),
  shortageBadge: document.querySelector("#shortageBadge"),
  usageList: document.querySelector("#usageList"),
  draftList: document.querySelector("#draftList"),
  placedCount: document.querySelector("#placedCount"),
  inventoryCount: document.querySelector("#inventoryCount"),
  saveDraftBtn: document.querySelector("#saveDraftBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBoardBtn: document.querySelector("#clearBoardBtn"),
  copyBtn: document.querySelector("#copyBtn"),
  cutBtn: document.querySelector("#cutBtn"),
  pasteBtn: document.querySelector("#pasteBtn"),
  undoCutBtn: document.querySelector("#undoCutBtn"),
  clipboardInfo: document.querySelector("#clipboardInfo")
};

// 粘贴瞄准模式为会话态，不写入本地存储
let aimMode = false;
let aimAnchor = null;
let dragSelect = null;
let suppressStageClick = false;
let clipboardNotice = null;

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      settings: { ...defaultState.settings, ...parsed.settings }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getGrid() {
  const size = state.settings.paperSize;
  if (size === "bookmark") return { cols: 7, rows: 18 };
  if (size === "square") return { cols: 12, rows: 12 };
  return { cols: 16, rows: 10 };
}

function placementKey(row, col) {
  return `${row}:${col}`;
}

function normalizeRect(r0, c0, r1, c1) {
  return {
    r0: Math.min(r0, r1),
    c0: Math.min(c0, c1),
    r1: Math.max(r0, r1),
    c1: Math.max(c0, c1)
  };
}

function rectContains(rect, row, col) {
  return !!rect && row >= rect.r0 && row <= rect.r1 && col >= rect.c0 && col <= rect.c1;
}

function sameRect(a, b) {
  if (!a || !b) return a === b;
  return a.r0 === b.r0 && a.c0 === b.c0 && a.r1 === b.r1 && a.c1 === b.c1;
}

function liveTypeIds() {
  return new Set(state.inventory.map((item) => item.id));
}

function getSelectedType() {
  return state.inventory.find((item) => item.id === state.selectedTypeId) || null;
}

function getUsage() {
  return state.placements.reduce((acc, placement) => {
    acc[placement.typeId] = (acc[placement.typeId] || 0) + 1;
    return acc;
  }, {});
}

function renderSettings() {
  els.paperSize.value = state.settings.paperSize;
  els.flowMode.value = state.settings.flowMode;
  els.gridGap.value = state.settings.gridGap;
  els.workTitle.value = state.settings.workTitle;
}

function renderStyleFilter() {
  const current = els.styleFilter.value || "all";
  const styles = [...new Set(state.inventory.map((item) => item.style))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  els.styleFilter.innerHTML = `<option value="all">全部风格</option>${styles
    .map((style) => `<option value="${escapeHtml(style)}">${escapeHtml(style)}</option>`)
    .join("")}`;
  els.styleFilter.value = styles.includes(current) ? current : "all";
}

function renderInventory() {
  const keyword = els.inventorySearch.value.trim();
  const style = els.styleFilter.value;
  const usage = getUsage();
  const items = state.inventory.filter((item) => {
    const matchesKeyword = !keyword || `${item.char}${item.style}${item.wear}`.includes(keyword);
    const matchesStyle = style === "all" || item.style === style;
    return matchesKeyword && matchesStyle;
  });

  els.inventoryCount.textContent = `${state.inventory.length}枚字模`;
  els.typeList.innerHTML = items
    .map((item) => {
      const used = usage[item.id] || 0;
      const selected = item.id === state.selectedTypeId ? "selected" : "";
      return `
        <article class="type-card ${selected}" draggable="true" data-type-id="${item.id}">
          <div class="glyph" style="font-size:${Math.min(item.size, 36)}px">${escapeHtml(item.char)}</div>
          <div class="type-meta">
            <strong>${escapeHtml(item.char)} · ${escapeHtml(item.style)}</strong>
            <span>${item.size}px · ${escapeHtml(item.wear)} · 已用${used}/${item.quantity}</span>
          </div>
          <button class="mini-btn" title="删除字模" data-delete-type="${item.id}" type="button">×</button>
        </article>
      `;
    })
    .join("");
}

function renderStage() {
  const { cols, rows } = getGrid();
  const map = new Map(state.placements.map((item) => [placementKey(item.row, item.col), item]));
  els.stage.className = `stage ${state.settings.paperSize}${aimMode ? " aiming" : ""}`;
  els.stage.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  els.stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  els.stage.style.gap = `${state.settings.gridGap}px`;

  const cutSource = state.clipboard && state.clipboard.mode === "cut" ? state.clipboard.source : null;
  const preview = aimMode && state.clipboard && aimAnchor
    ? inspectPaste(aimAnchor.row, aimAnchor.col)
    : null;
  const previewMap = new Map();
  const ghostText = new Map();
  if (preview) {
    preview.cells.forEach((cell) => {
      previewMap.set(placementKey(cell.row, cell.col), cell);
      if (cell.live && !cell.conflict) {
        const type = state.inventory.find((item) => item.id === cell.typeId);
        if (type && !map.has(placementKey(cell.row, cell.col))) {
          ghostText.set(placementKey(cell.row, cell.col), type.char);
        }
      }
    });
  }

  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const placement = map.get(placementKey(row, col));
      const type = placement ? state.inventory.find((item) => item.id === placement.typeId) : null;
      const vertical = state.settings.flowMode === "vertical" ? "vertical" : "";
      const inSelection = rectContains(state.selection, row, col) ? "in-selection" : "";
      const inCutSource = rectContains(cutSource, row, col) ? "cut-source" : "";
      const previewCell = previewMap.get(placementKey(row, col));
      const previewClass = previewCell
        ? previewCell.conflict
          ? "paste-preview conflict"
          : "paste-preview"
        : "";
      const ghost = ghostText.get(placementKey(row, col));
      cells.push(`
        <button class="cell ${type ? "used" : ""} ${vertical} ${inSelection} ${inCutSource} ${previewClass}" data-row="${row}" data-col="${col}" type="button" aria-label="第${row + 1}行第${col + 1}列">
          ${type ? escapeHtml(type.char) : ghost ? `<span class="ghost">${escapeHtml(ghost)}</span>` : ""}
        </button>
      `);
    }
  }
  els.stage.innerHTML = cells.join("");
}

function renderUsage() {
  const usage = getUsage();
  const entries = state.inventory.filter((item) => usage[item.id]);
  els.placedCount.textContent = `${state.placements.length}个落字`;

  const shortages = entries.filter((item) => usage[item.id] > item.quantity);
  els.shortageBadge.textContent = shortages.length ? `${shortages.length}处超量` : "数量充足";
  els.shortageBadge.className = `badge ${shortages.length ? "warn" : "ok"}`;

  const selectedType = getSelectedType();
  els.selectedTypeLabel.textContent = selectedType ? `当前：${selectedType.char} · ${selectedType.style}` : "未选择字模";

  els.usageList.innerHTML =
    entries
      .map((item) => {
        const used = usage[item.id];
        const warn = used > item.quantity ? "warn" : "";
        return `
          <div class="usage-item ${warn}">
            <strong>${escapeHtml(item.char)} ${escapeHtml(item.style)}</strong>
            <span>${used}/${item.quantity}</span>
          </div>
        `;
      })
      .join("") || `<p class="empty">还没有落字。</p>`;
}

function renderDrafts() {
  els.draftList.innerHTML =
    state.drafts
      .map(
        (draft) => `
          <article class="draft-item">
            <strong>${escapeHtml(draft.title)}</strong>
            <span>${draft.placements.length}个落字 · ${new Date(draft.savedAt).toLocaleString("zh-CN")}</span>
            <div class="draft-actions">
              <button type="button" data-load-draft="${draft.id}">载入</button>
              <button type="button" data-delete-draft="${draft.id}">删除</button>
            </div>
          </article>
        `
      )
      .join("") || `<p class="empty">还没有保存草稿。</p>`;
}

// ---- 矩形剪贴板 ----

function hasSelection() {
  return !!state.selection;
}

function hasClipboard() {
  return !!state.clipboard && state.clipboard.items.some((item) => liveTypeIds().has(item.typeId));
}

function captureSelection(mode) {
  if (!state.selection) return;
  const rect = normalizeRect(state.selection.r0, state.selection.c0, state.selection.r1, state.selection.c1);
  const width = rect.c1 - rect.c0 + 1;
  const height = rect.r1 - rect.r0 + 1;
  const items = state.placements
    .filter((item) => rectContains(rect, item.row, item.col))
    .map((item) => ({ r: item.row - rect.r0, c: item.col - rect.c0, typeId: item.typeId }));
  state.clipboard = {
    width,
    height,
    items,
    mode,
    source: mode === "cut" ? rect : null
  };
  exitAim();
  showClipboardNotice(
    mode === "cut"
      ? `已记录剪切 ${items.length} 字（${width}×${height}），版面暂不变；粘贴成功后才清空原区域。`
      : `已复制 ${items.length} 字（${width}×${height}）到剪贴板。`
  );
  renderAll();
}

// 逐格检查越界与目标占用；剪切模式下原区域格子视为将腾空，不判为冲突
function inspectPaste(anchorRow, anchorCol) {
  const board = getGrid();
  const liveIds = liveTypeIds();
  const boardMap = new Map(state.placements.map((item) => [placementKey(item.row, item.col), item]));
  const source = state.clipboard.mode === "cut" ? state.clipboard.source : null;
  const cells = state.clipboard.items.map((item) => {
    const row = anchorRow + item.r;
    const col = anchorCol + item.c;
    const live = liveIds.has(item.typeId);
    const outOfBounds = live && (row < 0 || row >= board.rows || col < 0 || col >= board.cols);
    const occupied = live && boardMap.has(placementKey(row, col)) && !rectContains(source, row, col);
    return { row, col, typeId: item.typeId, live, outOfBounds, conflict: outOfBounds || occupied };
  });
  return { cells, valid: cells.every((cell) => !cell.conflict) };
}

function commitPaste(anchorRow, anchorCol) {
  if (!state.clipboard) return;
  const result = inspectPaste(anchorRow, anchorCol);
  if (!result.valid) {
    const over = result.cells.filter((cell) => cell.outOfBounds).length;
    const occupied = result.cells.filter((cell) => !cell.outOfBounds && cell.conflict).length;
    showClipboardNotice(`无法粘贴：${over ? `${over}格越界` : ""}${over && occupied ? "、" : ""}${occupied ? `${occupied}格已被占用` : ""}。整次拒绝，源版面保持不变。`);
    renderClipboardBar();
    return;
  }
  const liveIds = liveTypeIds();
  const cuts = [];
  const additions = [];
  if (state.clipboard.mode === "cut" && state.clipboard.source) {
    const source = state.clipboard.source;
    state.placements.forEach((item) => {
      if (rectContains(source, item.row, item.col)) cuts.push({ row: item.row, col: item.col, typeId: item.typeId });
    });
    state.placements = state.placements.filter((item) => !rectContains(source, item.row, item.col));
  }
  result.cells.forEach((cell) => {
    if (!liveIds.has(cell.typeId)) return;
    state.placements.push({ row: cell.row, col: cell.col, typeId: cell.typeId });
    additions.push({ row: cell.row, col: cell.col, typeId: cell.typeId });
  });
  const wasCut = state.clipboard.mode === "cut";
  if (wasCut) {
    state.lastCut = { cuts, additions };
    state.clipboard = { ...state.clipboard, mode: "copy", source: null };
  }
  exitAim();
  showClipboardNotice(
    wasCut
      ? `剪切粘贴完成，原区域 ${cuts.length} 字已腾空；可点“撤销剪切”恢复。`
      : `已粘贴 ${additions.length} 字。`
  );
  renderAll();
}

function undoCut() {
  if (!state.lastCut) return;
  const { cuts, additions } = state.lastCut;
  additions.forEach((item) => {
    state.placements = state.placements.filter((p) => p.row !== item.row || p.col !== item.col);
  });
  cuts.forEach((item) => {
    if (!state.placements.some((p) => p.row === item.row && p.col === item.col)) {
      state.placements.push({ row: item.row, col: item.col, typeId: item.typeId });
    }
  });
  state.lastCut = null;
  exitAim();
  showClipboardNotice("已撤销最近一次剪切粘贴，原区域恢复。");
  renderAll();
}

function enterAim() {
  if (!hasClipboard()) return;
  aimMode = true;
  aimAnchor = null;
  renderAll();
}

function exitAim() {
  aimMode = false;
  aimAnchor = null;
}

function clearSelection() {
  state.selection = null;
  exitAim();
}

// 换纸 / 载入草稿 / 清空：选区失效，但剪贴板内容保留；待剪切状态安全降级为普通复制
function resetSelectionContext({ dropUndo = false } = {}) {
  state.selection = null;
  exitAim();
  if (state.clipboard && state.clipboard.mode === "cut") {
    state.clipboard = { ...state.clipboard, mode: "copy", source: null };
  }
  if (dropUndo) state.lastCut = null;
}

function showClipboardNotice(text) {
  clipboardNotice = { text, at: Date.now() };
}

function renderClipboardBar() {
  els.copyBtn.disabled = !hasSelection();
  els.cutBtn.disabled = !hasSelection();
  els.pasteBtn.disabled = !hasClipboard();
  els.undoCutBtn.disabled = !state.lastCut;

  if (clipboardNotice && Date.now() - clipboardNotice.at > 2800) clipboardNotice = null;

  if (clipboardNotice) {
    els.clipboardInfo.textContent = clipboardNotice.text;
    els.clipboardInfo.className = "clip-info notice";
    return;
  }

  if (aimMode && state.clipboard) {
    const preview = aimAnchor ? inspectPaste(aimAnchor.row, aimAnchor.col) : null;
    const dims = `${state.clipboard.width}×${state.clipboard.height}`;
    if (!preview) {
      els.clipboardInfo.textContent = `粘贴模式（${dims}）：移动鼠标选择落点，点击确认，Esc 或右键取消。`;
    } else if (preview.valid) {
      els.clipboardInfo.textContent = `粘贴模式（${dims}）：落点 (${aimAnchor.row + 1},${aimAnchor.col + 1})，点击确认，Esc 取消。`;
    } else {
      els.clipboardInfo.textContent = `该落点存在越界或占用冲突，整次粘贴将被拒绝；换个位置再点。`;
    }
    els.clipboardInfo.className = "clip-info aiming";
    return;
  }

  const parts = [];
  if (state.selection) {
    const rect = normalizeRect(state.selection.r0, state.selection.c0, state.selection.r1, state.selection.c1);
    parts.push(`已选 ${rect.r1 - rect.r0 + 1}行×${rect.c1 - rect.c0 + 1}列`);
  }
  if (state.clipboard) {
    const live = state.clipboard.items.filter((item) => liveTypeIds().has(item.typeId)).length;
    parts.push(`剪贴板 ${state.clipboard.width}×${state.clipboard.height} · ${live}字 · ${state.clipboard.mode === "cut" ? "待剪切" : "复制"}`);
  }
  parts.push(state.lastCut ? "可撤销最近一次剪切" : "Shift+拖选 · Ctrl+C/X/V");
  els.clipboardInfo.textContent = parts.join("　｜　");
  els.clipboardInfo.className = "clip-info";
}

function renderAll() {
  saveState();
  renderSettings();
  renderStyleFilter();
  renderInventory();
  renderStage();
  renderUsage();
  renderDrafts();
  renderClipboardBar();
}

function placeType(row, col, typeId = state.selectedTypeId) {
  if (!typeId) return;
  const existingIndex = state.placements.findIndex((item) => item.row === row && item.col === col);
  if (existingIndex >= 0) {
    if (state.placements[existingIndex].typeId === typeId) {
      state.placements.splice(existingIndex, 1);
    } else {
      state.placements[existingIndex].typeId = typeId;
    }
  } else {
    state.placements.push({ row, col, typeId });
  }
  renderAll();
}

function addType(event) {
  event.preventDefault();
  const item = {
    id: crypto.randomUUID(),
    char: els.charInput.value.trim(),
    style: els.styleInput.value.trim(),
    size: Number(els.sizeInput.value),
    quantity: Number(els.quantityInput.value),
    wear: els.wearInput.value
  };
  if (!item.char || !item.style) return;
  state.inventory.unshift(item);
  state.selectedTypeId = item.id;
  els.typeForm.reset();
  els.sizeInput.value = 24;
  els.quantityInput.value = 3;
  renderAll();
}

function saveDraft() {
  const title = state.settings.workTitle.trim() || "未命名作品";
  state.drafts.unshift({
    id: crypto.randomUUID(),
    title,
    settings: structuredClone(state.settings),
    placements: structuredClone(state.placements),
    savedAt: new Date().toISOString()
  });
  state.drafts = state.drafts.slice(0, 8);
  renderAll();
}

function exportPreview() {
  const { cols, rows } = getGrid();
  const cell = state.settings.paperSize === "bookmark" ? 44 : 56;
  const gap = state.settings.gridGap;
  const margin = 48;
  const width = cols * cell + (cols - 1) * gap + margin * 2;
  const height = rows * cell + (rows - 1) * gap + margin * 2 + 70;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffaf1";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#2f2921";
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  ctx.fillStyle = "#22201c";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(state.settings.workTitle || "未命名作品", margin, 50);
  ctx.font = "bold 30px serif";
  state.placements.forEach((placement) => {
    const type = state.inventory.find((item) => item.id === placement.typeId);
    if (!type) return;
    const x = margin + placement.col * (cell + gap);
    const y = margin + 45 + placement.row * (cell + gap);
    ctx.fillStyle = "#2f2921";
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = "#fff5df";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.min(type.size + 8, 42)}px serif`;
    ctx.fillText(type.char, x + cell / 2, y + cell / 2);
  });
  const link = document.createElement("a");
  link.download = `${state.settings.workTitle || "movable-type"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.paperSize.addEventListener("change", () => {
  state.settings.paperSize = els.paperSize.value;
  const { cols, rows } = getGrid();
  state.placements = state.placements.filter((item) => item.row < rows && item.col < cols);
  resetSelectionContext({ dropUndo: true });
  renderAll();
});

els.flowMode.addEventListener("change", () => {
  state.settings.flowMode = els.flowMode.value;
  renderAll();
});

els.gridGap.addEventListener("input", () => {
  state.settings.gridGap = Number(els.gridGap.value);
  renderAll();
});

els.workTitle.addEventListener("input", () => {
  state.settings.workTitle = els.workTitle.value;
  saveState();
});

els.typeForm.addEventListener("submit", addType);
els.inventorySearch.addEventListener("input", renderInventory);
els.styleFilter.addEventListener("change", renderInventory);
els.saveDraftBtn.addEventListener("click", saveDraft);
els.exportBtn.addEventListener("click", exportPreview);
els.clearBoardBtn.addEventListener("click", () => {
  state.placements = [];
  resetSelectionContext({ dropUndo: true });
  renderAll();
});

els.typeList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    const typeId = deleteButton.dataset.deleteType;
    state.inventory = state.inventory.filter((item) => item.id !== typeId);
    state.placements = state.placements.filter((item) => item.typeId !== typeId);
    if (state.selectedTypeId === typeId) state.selectedTypeId = state.inventory[0]?.id || null;
    renderAll();
    return;
  }
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  state.selectedTypeId = card.dataset.typeId;
  renderAll();
});

els.typeList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-type-id]");
  if (!card) return;
  event.dataTransfer.setData("text/plain", card.dataset.typeId);
});

els.stage.addEventListener("dragover", (event) => {
  if (event.target.closest(".cell")) event.preventDefault();
});

els.stage.addEventListener("drop", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  clearSelection();
  placeType(Number(cell.dataset.row), Number(cell.dataset.col), event.dataTransfer.getData("text/plain"));
});

els.stage.addEventListener("mousedown", (event) => {
  // 新按下时复位，避免上一次拖到版面外松开（无尾随 click）永久吞掉后续点击
  suppressStageClick = false;
  if (event.button !== 0) return;
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (aimMode) {
    // 落点确认统一交给 click，避免 mousedown+click 双提交
    event.preventDefault();
    return;
  }
  if (event.shiftKey) {
    event.preventDefault();
    dragSelect = { r0: row, c0: col, r1: row, c1: col, moved: false };
    state.selection = normalizeRect(row, col, row, col);
    renderStage();
  }
});

els.stage.addEventListener("mousemove", (event) => {
  const cell = event.target.closest(".cell");
  if (aimMode) {
    if (cell) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      if (!aimAnchor || aimAnchor.row !== row || aimAnchor.col !== col) {
        aimAnchor = { row, col };
        renderStage();
        renderClipboardBar();
      }
    }
    return;
  }
  if (!dragSelect) return;
  if (!cell) return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const next = normalizeRect(dragSelect.r0, dragSelect.c0, row, col);
  dragSelect.moved = true;
  if (!sameRect(state.selection, next)) {
    state.selection = next;
    renderStage();
  }
});

els.stage.addEventListener("mouseup", () => {
  if (dragSelect) {
    suppressStageClick = true;
    dragSelect = null;
    renderAll();
  }
});

// 鼠标在版面外松开时兜底结束拖选（在 stage 内松开时上面的处理器已把 dragSelect 置空）
window.addEventListener("mouseup", () => {
  if (dragSelect) {
    dragSelect = null;
    renderAll();
  }
});

els.stage.addEventListener("mouseleave", () => {
  if (aimMode && aimAnchor) {
    aimAnchor = null;
    renderStage();
    renderClipboardBar();
  }
});

// 瞄准模式下右键取消
els.stage.addEventListener("contextmenu", (event) => {
  if (aimMode) {
    event.preventDefault();
    exitAim();
    renderAll();
  }
});

els.stage.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (suppressStageClick) {
    suppressStageClick = false;
    return;
  }
  if (!cell) return;
  if (aimMode) {
    commitPaste(Number(cell.dataset.row), Number(cell.dataset.col));
    return;
  }
  // 普通落字会清空当前选区
  clearSelection();
  placeType(Number(cell.dataset.row), Number(cell.dataset.col));
});

els.copyBtn.addEventListener("click", () => captureSelection("copy"));
els.cutBtn.addEventListener("click", () => captureSelection("cut"));
els.pasteBtn.addEventListener("click", () => {
  if (aimMode) {
    exitAim();
    renderAll();
  } else {
    enterAim();
  }
});
els.undoCutBtn.addEventListener("click", undoCut);

window.addEventListener("keydown", (event) => {
  const tag = (event.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (event.key === "Escape") {
    if (aimMode) {
      exitAim();
      renderAll();
    } else if (state.selection) {
      state.selection = null;
      renderAll();
    }
    return;
  }
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === "c" && state.selection) {
    event.preventDefault();
    captureSelection("copy");
  } else if (key === "x" && state.selection) {
    event.preventDefault();
    captureSelection("cut");
  } else if (key === "v" && hasClipboard()) {
    event.preventDefault();
    if (aimMode) {
      exitAim();
      renderAll();
    } else {
      enterAim();
    }
  } else if (key === "z" && state.lastCut) {
    event.preventDefault();
    undoCut();
  }
});

els.draftList.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-draft]");
  const deleteButton = event.target.closest("[data-delete-draft]");
  if (loadButton) {
    const draft = state.drafts.find((item) => item.id === loadButton.dataset.loadDraft);
    if (!draft) return;
    state.settings = structuredClone(draft.settings);
    state.placements = structuredClone(draft.placements);
    resetSelectionContext({ dropUndo: true });
    renderAll();
  }
  if (deleteButton) {
    state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
    renderAll();
  }
});

renderAll();

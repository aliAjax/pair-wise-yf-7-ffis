const storageKey = "zfl16-movable-type-workshop";

const starterInventory = [
  { id: crypto.randomUUID(), char: "山", style: "宋体旧字", size: 30, quantity: 4, wear: "微磨" },
  { id: crypto.randomUUID(), char: "月", style: "宋体旧字", size: 30, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "风", style: "楷体木刻", size: 28, quantity: 2, wear: "微磨" },
  { id: crypto.randomUUID(), char: "花", style: "楷体木刻", size: 28, quantity: 2, wear: "新" },
  { id: crypto.randomUUID(), char: "茶", style: "黑体铅字", size: 24, quantity: 3, wear: "旧痕" },
  { id: crypto.randomUUID(), char: "雨", style: "仿宋细字", size: 22, quantity: 4, wear: "新" }
];

const defaultState = {
  inventory: starterInventory,
  selectedTypeId: starterInventory[0].id,
  placements: [],
  drafts: [],
  clipboard: null,
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
  stageHint: document.querySelector("#stageHint"),
  selectionBar: document.querySelector("#selectionBar"),
  selectionInfo: document.querySelector("#selectionInfo"),
  copyRectBtn: document.querySelector("#copyRectBtn"),
  cutRectBtn: document.querySelector("#cutRectBtn"),
  cancelSelectionBtn: document.querySelector("#cancelSelectionBtn"),
  clipboardPanel: document.querySelector("#clipboardPanel")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    const merged = {
      ...structuredClone(defaultState),
      ...parsed,
      settings: { ...defaultState.settings, ...parsed.settings }
    };
    sanitizeClipboard(merged);
    return merged;
  } catch {
    return structuredClone(defaultState);
  }
}

// 剪贴板跨刷新可用，因此载入后剔除指向已删除字模的格子；
// 剪切记录依赖当前版面坐标，换纸/载入草稿后一律降级为复制。
function sanitizeClipboard(target = state) {
  const board = target.clipboard;
  if (!board) {
    target.clipboard = null;
    return;
  }
  const validIds = new Set(target.inventory.map((item) => item.id));
  board.cells = (board.cells || []).filter(
    (cell) =>
      validIds.has(cell.typeId) &&
      Number.isInteger(cell.dr) &&
      cell.dr >= 0 &&
      cell.dr < board.height &&
      Number.isInteger(cell.dc) &&
      cell.dc >= 0 &&
      cell.dc < board.width
  );
  if (board.mode === "cut" && board.source) {
    board.source = { row: Number(board.source.row), col: Number(board.source.col) };
  }
  if (!Number.isInteger(board.width) || board.width < 1 || !Number.isInteger(board.height) || board.height < 1) {
    target.clipboard = null;
  }
}

// 选区/粘贴瞄准态/最近一次剪切的撤销信息只存在于内存，不随刷新保留。
let selection = null;
let pasteArmed = false;
let preview = null;
let lastCut = null;
let dragState = null;
let suppressClick = false;
let messageTimer = null;

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
  els.stage.className = `stage ${state.settings.paperSize}`;
  els.stage.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  els.stage.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  els.stage.style.gap = `${state.settings.gridGap}px`;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const placement = map.get(placementKey(row, col));
      const type = placement ? state.inventory.find((item) => item.id === placement.typeId) : null;
      const vertical = state.settings.flowMode === "vertical" ? "vertical" : "";
      cells.push(`
        <button class="cell ${type ? "used" : ""} ${vertical}" data-row="${row}" data-col="${col}" type="button" aria-label="第${row + 1}行第${col + 1}列">
          ${type ? escapeHtml(type.char) : ""}
        </button>
      `);
    }
  }
  els.stage.innerHTML = cells.join("");
}

function normalizeRect(rect) {
  return {
    top: Math.min(rect.startRow, rect.endRow),
    bottom: Math.max(rect.startRow, rect.endRow),
    left: Math.min(rect.startCol, rect.endCol),
    right: Math.max(rect.startCol, rect.endCol)
  };
}

function getStageCell(row, col) {
  return els.stage.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

// 选区、剪切源、粘贴预览都只改格子样式，不重建 DOM，避免拖拽过程中断交互。
function paintOverlay() {
  els.stage
    .querySelectorAll(".in-selection,.cut-source,.paste-preview,.paste-preview-conflict")
    .forEach((cell) =>
      cell.classList.remove("in-selection", "cut-source", "paste-preview", "paste-preview-conflict")
    );

  const mark = (row, col, className) => {
    const cell = getStageCell(row, col);
    if (cell) cell.classList.add(className);
  };

  if (selection) {
    const rect = normalizeRect(selection);
    for (let row = rect.top; row <= rect.bottom; row += 1) {
      for (let col = rect.left; col <= rect.right; col += 1) {
        mark(row, col, "in-selection");
      }
    }
  }

  // 剪切后源版面保持不变，用浅色标出“待粘贴成功后清空”的区域。
  if (state.clipboard?.mode === "cut" && state.clipboard.source) {
    const { row, col } = state.clipboard.source;
    for (const cell of state.clipboard.cells) {
      mark(row + cell.dr, col + cell.dc, "cut-source");
    }
  }

  if (preview && pasteArmed) {
    for (const cell of state.clipboard.cells) {
      const row = preview.anchor.row + cell.dr;
      const col = preview.anchor.col + cell.dc;
      mark(row, col, preview.ok ? "paste-preview" : "paste-preview-conflict");
    }
  }

  els.stage.classList.toggle("selecting", Boolean(dragState));
  els.stage.classList.toggle("armed", pasteArmed);
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

function renderSelectionBar() {
  if (!selection) {
    els.selectionBar.hidden = true;
    return;
  }
  const rect = normalizeRect(selection);
  const width = rect.right - rect.left + 1;
  const height = rect.bottom - rect.top + 1;
  const map = new Map(state.placements.map((item) => [placementKey(item.row, item.col), item]));
  let glyphCount = 0;
  for (let row = rect.top; row <= rect.bottom; row += 1) {
    for (let col = rect.left; col <= rect.right; col += 1) {
      if (map.has(placementKey(row, col))) glyphCount += 1;
    }
  }
  els.selectionInfo.textContent = `选区 ${width}×${height}（${glyphCount}个字）`;
  els.selectionBar.hidden = false;
}

function renderClipboardPanel() {
  const board = state.clipboard;
  if (!board) {
    els.clipboardPanel.innerHTML = `<p class="empty">按住 Shift 在版面上拖出矩形，再选择复制或剪切。剪贴板内容保存在浏览器本地，刷新后仍可用。</p>`;
    return;
  }
  const modeLabel = board.mode === "cut" ? "剪切" : "复制";
  const source =
    board.mode === "cut" && board.source
      ? `源区域 第${board.source.row + 1}行 第${board.source.col + 1}列起 · 粘贴成功后清空`
      : "复制内容可重复粘贴";
  const undoLabel = lastCut ? "撤销最近一次剪切" : "撤销（仅最近一次剪切）";
  els.clipboardPanel.innerHTML = `
    <div class="clipboard-meta">
      <strong>${modeLabel} · ${board.width}×${board.height} · ${board.cells.length}个字</strong>
      <span>${source}</span>
      ${pasteArmed ? `<span class="clipboard-live">粘贴瞄准中：点击目标格子放置（Esc 取消）</span>` : ""}
    </div>
    <div class="clipboard-actions">
      <button type="button" id="armPasteBtn" ${board.cells.length ? "" : "disabled"}>${pasteArmed ? "退出瞄准" : "准备粘贴"}</button>
      <button type="button" id="undoCutBtn" ${lastCut ? "" : "disabled"}>${undoLabel}</button>
      <button type="button" id="clearClipboardBtn">清空剪贴板</button>
    </div>
  `;
}

function renderStageHint() {
  if (dragState) {
    els.stageHint.textContent = "松开完成矩形选区。";
  } else if (selection) {
    els.stageHint.textContent = "已框选矩形区域，可复制或剪切；按住 Shift 拖出新区可重选。";
  } else if (pasteArmed && state.clipboard) {
    els.stageHint.textContent =
      "粘贴瞄准中：移动到目标格子可预览，点击以左上角落点放置；红色预览表示存在冲突，Esc 取消。";
  } else if (state.clipboard?.mode === "cut" && state.clipboard.source) {
    els.stageHint.textContent = "已剪切，源区域暂未清空；准备粘贴成功后才会清空原区域。";
  } else {
    els.stageHint.textContent = "点击字模后，在版面格子中落字，也可拖拽字模到版面。按住 Shift 拖过格子可框选矩形。";
  }
}

function renderAll() {
  saveState();
  renderSettings();
  renderStyleFilter();
  renderInventory();
  renderStage();
  renderUsage();
  renderDrafts();
  renderSelectionBar();
  renderClipboardPanel();
  renderStageHint();
  paintOverlay();
}

function refreshClipboardUi() {
  renderSelectionBar();
  renderClipboardPanel();
  renderStageHint();
  paintOverlay();
}

function showMessage(text, tone = "info") {
  const bar = document.createElement("div");
  bar.className = `toast ${tone}`;
  bar.textContent = text;
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add("show"));
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => bar.remove(), 3200);
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

function captureSelection(mode) {
  if (!selection) return;
  const rect = normalizeRect(selection);
  const width = rect.right - rect.left + 1;
  const height = rect.bottom - rect.top + 1;
  const map = new Map(state.placements.map((item) => [placementKey(item.row, item.col), item.typeId]));
  const cells = [];
  for (let row = rect.top; row <= rect.bottom; row += 1) {
    for (let col = rect.left; col <= rect.right; col += 1) {
      const typeId = map.get(placementKey(row, col));
      if (typeId) cells.push({ dr: row - rect.top, dc: col - rect.left, typeId });
    }
  }
  state.clipboard = {
    width,
    height,
    cells,
    mode,
    // 剪切不立即清空源区域：记录源坐标，待粘贴成功后按坐标清空。
    source: mode === "cut" ? { row: rect.top, col: rect.left } : null
  };
  lastCut = null;
  selection = null;
  preview = null;
  pasteArmed = cells.length > 0;
  renderAll();
  showMessage(
    mode === "cut"
      ? "已剪切：源版面保持不变，准备粘贴成功后才会清空原区域。"
      : "已复制：点击目标格子粘贴。"
  );
}

// 粘贴前逐格检查越界和目标占用，任一冲突整次拒绝。
function inspectPaste(anchorRow, anchorCol) {
  const board = state.clipboard;
  const { cols, rows } = getGrid();
  const occupied = new Map(
    state.placements.map((item) => [placementKey(item.row, item.col), item.typeId])
  );
  let reason = "";
  for (const cell of board.cells) {
    const row = anchorRow + cell.dr;
    const col = anchorCol + cell.dc;
    if (row < 0 || col < 0 || row >= rows || col >= cols) {
      reason = `越界：第${row + 1}行第${col + 1}列超出当前纸张，整次粘贴已拒绝。`;
      break;
    }
    // 剪切粘贴时，内容未被改动的源格子将在同一次操作中清空，不算占用。
    const isMovedFromSource =
      board.mode === "cut" &&
      board.source &&
      row === board.source.row + cell.dr &&
      col === board.source.col + cell.dc &&
      occupied.get(placementKey(row, col)) === cell.typeId;
    if (!isMovedFromSource && occupied.has(placementKey(row, col))) {
      reason = `目标第${row + 1}行第${col + 1}列已有字，整次粘贴已拒绝。`;
      break;
    }
  }
  return { ok: !reason, reason };
}

function pasteAt(anchorRow, anchorCol) {
  const board = state.clipboard;
  if (!board || !board.cells.length) return;
  const result = inspectPaste(anchorRow, anchorCol);
  if (!result.ok) {
    showMessage(result.reason, "error");
    return;
  }

  const movedCells = structuredClone(board.cells);
  const cleared = [];
  if (board.mode === "cut" && board.source) {
    // 仅粘贴成功后才清空原区域；坐标与字模都对得上的源格子才移除，
    // 若剪切后源格子已被改动则保留现场。
    const sourceMap = new Map(
      movedCells.map((cell) => [
        placementKey(board.source.row + cell.dr, board.source.col + cell.dc),
        cell.typeId
      ])
    );
    state.placements = state.placements.filter((item) => {
      const key = placementKey(item.row, item.col);
      if (sourceMap.has(key) && sourceMap.get(key) === item.typeId) {
        cleared.push({ row: item.row, col: item.col, typeId: item.typeId });
        return false;
      }
      return true;
    });
    lastCut = { source: structuredClone(board.source), cells: cleared };
  }

  movedCells.forEach((cell) => {
    state.placements.push({ row: anchorRow + cell.dr, col: anchorCol + cell.dc, typeId: cell.typeId });
  });

  if (board.mode === "cut") {
    board.mode = "copy";
    board.source = null;
  }
  preview = null;
  pasteArmed = true;
  renderAll();
  showMessage("粘贴成功。");
}

function undoLastCut() {
  if (!lastCut) return;
  const { cols, rows } = getGrid();
  const occupied = new Set(state.placements.map((item) => placementKey(item.row, item.col)));
  for (const cell of lastCut.cells) {
    if (cell.row < 0 || cell.col < 0 || cell.row >= rows || cell.col >= cols) {
      showMessage("原区域已超出当前纸张，无法撤销。", "error");
      return;
    }
    if (occupied.has(placementKey(cell.row, cell.col))) {
      showMessage("原区域已被其他内容占用，撤销被拒绝。", "error");
      return;
    }
  }
  lastCut.cells.forEach((cell) => state.placements.push({ row: cell.row, col: cell.col, typeId: cell.typeId }));
  // 撤销仅恢复最近一次剪切，恢复后即失效。
  lastCut = null;
  renderAll();
  showMessage("已恢复最近一次剪切的内容。");
}

// 换纸或载入草稿会清空选区；剪贴板保留，但剪切无法再保证源坐标有效，降级为复制。
function resetTransientState({ downgradeClipboard = true } = {}) {
  selection = null;
  preview = null;
  pasteArmed = false;
  lastCut = null;
  if (downgradeClipboard && state.clipboard) {
    state.clipboard.mode = "copy";
    state.clipboard.source = null;
  }
}

function pruneClipboardType(typeId) {
  if (!state.clipboard) return;
  state.clipboard.cells = state.clipboard.cells.filter((cell) => cell.typeId !== typeId);
  if (state.clipboard.mode === "cut" && state.clipboard.source && !state.clipboard.cells.length) {
    state.clipboard.mode = "copy";
    state.clipboard.source = null;
  }
  if (!state.clipboard.cells.length) pasteArmed = false;
}

els.paperSize.addEventListener("change", () => {
  state.settings.paperSize = els.paperSize.value;
  const { cols, rows } = getGrid();
  state.placements = state.placements.filter((item) => item.row < rows && item.col < cols);
  resetTransientState();
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
  renderAll();
});

els.typeList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-type]");
  if (deleteButton) {
    const typeId = deleteButton.dataset.deleteType;
    state.inventory = state.inventory.filter((item) => item.id !== typeId);
    state.placements = state.placements.filter((item) => item.typeId !== typeId);
    pruneClipboardType(typeId);
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
  placeType(Number(cell.dataset.row), Number(cell.dataset.col), event.dataTransfer.getData("text/plain"));
});

function cellFromEvent(event) {
  return event.target.closest ? event.target.closest(".cell") : null;
}

// 按住 Shift 在格子上按下并拖过格子形成矩形选区。
els.stage.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !event.shiftKey) return;
  const cell = cellFromEvent(event);
  if (!cell) return;
  event.preventDefault();
  const startRow = Number(cell.dataset.row);
  const startCol = Number(cell.dataset.col);
  selection = { startRow, startCol, endRow: startRow, endCol: startCol };
  dragState = { startRow, startCol, endRow: startRow, endCol: startCol, moved: false };
  if (pasteArmed) {
    pasteArmed = false;
    preview = null;
  }
  try {
    cell.setPointerCapture(event.pointerId);
  } catch {
    /* 某些浏览器不支持时退化为窗口级监听 */
  }
  refreshClipboardUi();
});

els.stage.addEventListener("pointermove", (event) => {
  if (dragState) {
    // 指针被起始格子捕获，event.target 不会变化，按坐标取实际经过的格子。
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const cell = under?.closest?.(".cell");
    if (cell && els.stage.contains(cell)) {
      dragState.endRow = Number(cell.dataset.row);
      dragState.endCol = Number(cell.dataset.col);
      dragState.moved = true;
      selection = { ...dragState };
      refreshClipboardUi();
    }
    return;
  }
  if (pasteArmed && state.clipboard) {
    const cell = cellFromEvent(event);
    if (cell) {
      const anchor = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
      const result = inspectPaste(anchor.row, anchor.col);
      if (
        !preview ||
        preview.anchor.row !== anchor.row ||
        preview.anchor.col !== anchor.col ||
        preview.ok !== result.ok
      ) {
        preview = { anchor, ok: result.ok };
        paintOverlay();
      }
    } else if (preview) {
      preview = null;
      paintOverlay();
    }
  }
});

els.stage.addEventListener("pointerup", () => {
  if (!dragState) return;
  suppressClick = dragState.moved;
  if (!dragState.moved) selection = null;
  dragState = null;
  refreshClipboardUi();
});

els.stage.addEventListener("pointercancel", () => {
  dragState = null;
  suppressClick = false;
  refreshClipboardUi();
});

els.stage.addEventListener("pointerleave", () => {
  if (preview && !dragState) {
    preview = null;
    paintOverlay();
  }
});

// 拖过格子形成选区后，抑制紧随其后的 click，避免误落字。
els.stage.addEventListener("click", (event) => {
  const cell = cellFromEvent(event);
  if (!cell) return;
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (dragState) return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (event.shiftKey) return;
  if (pasteArmed && state.clipboard) {
    pasteAt(row, col);
    return;
  }
  placeType(row, col);
});

els.copyRectBtn.addEventListener("click", () => captureSelection("copy"));
els.cutRectBtn.addEventListener("click", () => captureSelection("cut"));
els.cancelSelectionBtn.addEventListener("click", () => {
  selection = null;
  preview = null;
  refreshClipboardUi();
});

els.draftList.addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-draft]");
  const deleteButton = event.target.closest("[data-delete-draft]");
  if (loadButton) {
    const draft = state.drafts.find((item) => item.id === loadButton.dataset.loadDraft);
    if (!draft) return;
    state.settings = structuredClone(draft.settings);
    state.placements = structuredClone(draft.placements);
    // 载入草稿清空选区；剪贴板内容保留，仅把剪切态降级为复制。
    resetTransientState();
    renderAll();
  }
  if (deleteButton) {
    state.drafts = state.drafts.filter((item) => item.id !== deleteButton.dataset.deleteDraft);
    renderAll();
  }
});

els.clipboardPanel.addEventListener("click", (event) => {
  if (event.target.closest("#armPasteBtn")) {
    if (!state.clipboard?.cells.length) return;
    pasteArmed = !pasteArmed;
    preview = null;
    refreshClipboardUi();
    return;
  }
  if (event.target.closest("#undoCutBtn")) {
    undoLastCut();
    return;
  }
  if (event.target.closest("#clearClipboardBtn")) {
    state.clipboard = null;
    pasteArmed = false;
    preview = null;
    lastCut = null;
    renderAll();
    showMessage("剪贴板已清空。");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (event.target.matches && event.target.matches("input, textarea, select")) return;
  selection = null;
  dragState = null;
  pasteArmed = false;
  preview = null;
  refreshClipboardUi();
});

renderAll();

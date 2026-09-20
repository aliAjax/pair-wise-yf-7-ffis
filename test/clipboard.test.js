// 最小 DOM/localStorage shim，用于在 Node 中驱动 app.js 验证剪贴板逻辑
const fs = require("fs");
const vm = require("vm");
const path = require("path");

function makeEl() {
  const el = {
    className: "",
    innerHTML: "",
    textContent: "",
    value: "",
    disabled: false,
    style: {},
    dataset: {},
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    dispatch(type, event = {}) {
      event.target = event.target || el;
      event.preventDefault = event.preventDefault || (() => {});
      (this.listeners[type] || []).forEach((fn) => fn(event));
    },
    closest(sel) {
      return this._cellForClosest || null;
    },
    querySelector() {
      return makeEl();
    }
  };
  return el;
}

const ids = [
  "paperSize", "flowMode", "gridGap", "workTitle", "stage", "typeList", "typeForm",
  "charInput", "styleInput", "sizeInput", "quantityInput", "wearInput",
  "inventorySearch", "styleFilter", "selectedTypeLabel", "shortageBadge",
  "usageList", "draftList", "placedCount", "inventoryCount", "saveDraftBtn",
  "exportBtn", "clearBoardBtn", "copyBtn", "cutBtn", "pasteBtn", "undoCutBtn",
  "clipboardInfo"
];

const els = {};
ids.forEach((id) => (els[id] = makeEl()));

const storage = {};
const documentShim = {
  querySelector(sel) {
    const id = sel.replace("#", "");
    return els[id] || makeEl();
  },
  createElement() {
    return makeEl();
  }
};

const code = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

const windowListenersByInstance = [];

function loadApp() {
  // 重新加载时清掉旧实例注册的监听，避免重复触发
  Object.values(els).forEach((el) => {
    el.listeners = {};
  });
  const listeners = {};
  windowListenersByInstance.push(listeners);
  const sandbox = {
    document: documentShim,
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => (storage[k] = String(v))
    },
    crypto: { randomUUID: () => Math.random().toString(36).slice(2) },
    structuredClone: (v) => JSON.parse(JSON.stringify(v)),
    window: {
      addEventListener(type, fn) {
        (listeners[type] ||= []).push(fn);
      }
    },
    console,
    setTimeout
  };
  sandbox.window.location = { href: "test" };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
}

loadApp();

// app.js 没有导出，通过 localStorage 反查状态
function getState() {
  return JSON.parse(storage["zfl16-movable-type-workshop"]);
}

function fireStage(type, event) {
  els.stage.dispatch(type, event);
}
function fireWindow(type, event = {}) {
  const listeners = windowListenersByInstance[windowListenersByInstance.length - 1];
  (listeners[type] || []).forEach((fn) => fn(event));
}
// 在 stage 内松开：浏览器顺序 mousedown→mousemove→mouseup→click，
// 拖拽产生的尾随 click 会被 suppressStageClick 吞掉
function releaseOnStage(cell = cellEl(0, 0)) {
  fireStage("mouseup", {});
  fireWindow("mouseup", { target: cell });
  fireStage("click", { target: cell });
}
function cellEl(row, col) {
  return {
    dataset: { row: String(row), col: String(col) },
    closest(sel) {
      return sel === ".cell" ? { dataset: { row: String(row), col: String(col) } } : null;
    }
  };
}

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log("PASS:", msg);
  } else {
    failures += 1;
    console.log("FAIL:", msg);
  }
}

let state = getState();
// 在 16x10 版面落 4 个字：2x2
const typeA = state.inventory[0].id;
const typeB = state.inventory[1].id;
state.placements = [
  { row: 2, col: 3, typeId: typeA },
  { row: 2, col: 4, typeId: typeB },
  { row: 3, col: 3, typeId: typeB },
  { row: 3, col: 4, typeId: typeA }
];
storage["zfl16-movable-type-workshop"] = JSON.stringify(state);

// 重新加载 app.js 实例（模拟刷新后状态恢复）
loadApp();
state = getState();
assert(state.placements.length === 4, "刷新后落字恢复");
assert(state.clipboard === null, "初始无剪贴板");

// Shift 拖选 (2,3)->(3,4)
fireStage("mousedown", { button: 0, shiftKey: true, target: cellEl(2, 3) });
fireStage("mousemove", { target: cellEl(3, 4) });
releaseOnStage();
state = getState();
assert(state.selection && state.selection.r0 === 2 && state.selection.c0 === 3 && state.selection.r1 === 3 && state.selection.c1 === 4, "Shift 拖出 2x2 选区");

// 复制
els.copyBtn.dispatch("click");
state = getState();
assert(state.clipboard && state.clipboard.items.length === 4 && state.clipboard.mode === "copy", "复制 4 字到剪贴板");
assert(state.placements.length === 4, "复制后版面不变");

// 粘贴：进入瞄准
els.pasteBtn.dispatch("click");
// 越界落点 (9,4): 9+1=10 >= rows(10)
fireStage("mousemove", { target: cellEl(9, 4) });
fireStage("click", { target: cellEl(9, 4) });
state = getState();
assert(state.placements.length === 4, "越界粘贴被整次拒绝，版面不变");
assert(els.clipboardInfo.textContent.includes("越界"), "提示越界冲突: " + els.clipboardInfo.textContent);

// 占用落点 (2,3)：与已有字重叠
fireStage("mousemove", { target: cellEl(2, 3) });
fireStage("click", { target: cellEl(2, 3) });
state = getState();
assert(state.placements.length === 4, "占用粘贴被整次拒绝，版面不变");
assert(els.clipboardInfo.textContent.includes("占用"), "提示占用冲突");

// 合法落点 (6,6)
fireStage("mousemove", { target: cellEl(6, 6) });
fireStage("click", { target: cellEl(6, 6) });
state = getState();
assert(state.placements.length === 8, "合法粘贴新增 4 字，共 8 字");
const keys = state.placements.map((p) => `${p.row},${p.col}`);
["6,6", "6,7", "7,6", "7,7"].forEach((k) => assert(keys.includes(k), `粘贴落点含 ${k}`));

// Esc 取消瞄准/选区
fireWindow("keydown", { key: "Escape", target: { tagName: "body" } });

// ---- 剪切流程 ----
// 重新拖选原 2x2 区域
fireStage("mousedown", { button: 0, shiftKey: true, target: cellEl(2, 3) });
fireStage("mousemove", { target: cellEl(3, 4) });
releaseOnStage();
els.cutBtn.dispatch("click");
state = getState();
assert(state.clipboard.mode === "cut" && state.placements.length === 8, "剪切记录后源版面保持不变（仍 8 字）");

// 剪切粘贴到占用的非源区域 (6,6)：应拒绝
els.pasteBtn.dispatch("click");
fireStage("mousemove", { target: cellEl(6, 6) });
fireStage("click", { target: cellEl(6, 6) });
state = getState();
assert(state.placements.length === 8, "剪切粘贴到占用区域被拒绝，源版面不变");
assert(state.clipboard.mode === "cut", "拒绝后仍是待剪切状态");

// 剪切贴到空区域 (0,0)：成功后原区域腾空、左上新增
fireStage("mousemove", { target: cellEl(0, 0) });
fireStage("click", { target: cellEl(0, 0) });
state = getState();
assert(state.placements.length === 8, "剪切移动后总数仍 8（4 留 6,6 区，4 在 0,0 区）");
assert(state.placements.filter((p) => p.row >= 2 && p.row <= 3 && p.col >= 3 && p.col <= 4).length === 0, "成功粘贴后原区域已清空");
assert(state.placements.filter((p) => p.row <= 1 && p.col <= 1).length === 4, "剪切内容落到左上角");
assert(state.clipboard.mode === "copy", "成功粘贴后剪贴板降级为普通复制");
assert(state.lastCut && state.lastCut.cuts.length === 4 && state.lastCut.additions.length === 4, "记录最近一次剪切快照");

// 撤销剪切：恢复原区域 4 字，移除左上角新增的 4 字，6,6 的复制内容不动
els.undoCutBtn.dispatch("click");
state = getState();
assert(state.placements.length === 8, "撤销后总数 8");
assert(state.lastCut === null, "撤销快照被消费");
assert(state.placements.filter((p) => p.row >= 2 && p.row <= 3 && p.col >= 3 && p.col <= 4).length === 4, "撤销恢复原区域 4 字");
assert(state.placements.filter((p) => p.row <= 1 && p.col <= 1).length === 0, "撤销移除剪切粘贴新增的 4 字");
assert(state.placements.filter((p) => p.row >= 6 && p.row <= 7 && p.col >= 6 && p.col <= 7).length === 4, "普通复制粘贴的 4 字不受撤销影响");

// 撤销仅恢复最近一次：再做一次剪切（6,6 区 -> 0,0 区），旧快照被覆盖
fireStage("mousedown", { button: 0, shiftKey: true, target: cellEl(6, 6) });
fireStage("mousemove", { target: cellEl(7, 7) });
releaseOnStage(cellEl(7, 7));
els.cutBtn.dispatch("click");
els.pasteBtn.dispatch("click");
fireStage("mousemove", { target: cellEl(0, 0) });
fireStage("click", { target: cellEl(0, 0) });
state = getState();
assert(state.placements.filter((p) => p.row >= 6 && p.row <= 7 && p.col >= 6 && p.col <= 7).length === 0, "第二次剪切清空 6,6 区域");
assert(state.placements.filter((p) => p.row <= 1 && p.col <= 1).length === 4, "第二次剪切贴到左上角");
assert(state.lastCut.cuts.length === 4, "lastCut 只保留最近一次");

// 换纸：清空选区、剪贴板保留、待剪切降级
// 先制造一个待剪切
fireStage("mousedown", { button: 0, shiftKey: true, target: cellEl(0, 0) });
fireStage("mousemove", { target: cellEl(1, 1) });
releaseOnStage();
els.cutBtn.dispatch("click");
state = getState();
assert(state.clipboard.mode === "cut", "进入待剪切");
els.paperSize.value = "bookmark";
els.paperSize.dispatch("change");
state = getState();
assert(state.selection === null, "换纸清空选区");
assert(state.clipboard && state.clipboard.mode === "copy", "换纸后剪贴板保留并降级为复制");
assert(state.lastCut === null, "换纸清空撤销记录");
assert(state.placements.every((p) => p.row < 18 && p.col < 7), "换纸裁掉越界落字");

// 再模拟一次刷新，剪贴板仍在
loadApp();
state = getState();
assert(state.clipboard && state.clipboard.items.length === 4, "刷新后剪贴板内容可用");
assert(state.clipboard.mode === "copy", "刷新后剪贴板模式保留");

// 载入草稿清空选区但剪贴板保留
state.selection = { r0: 0, c0: 0, r1: 1, c1: 1 };
state.drafts = [{ id: "d1", title: "t", settings: state.settings, placements: [], savedAt: new Date().toISOString() }];
storage["zfl16-movable-type-workshop"] = JSON.stringify(state);
loadApp();
els.draftList.dispatch("click", {
  target: { closest: (s) => (s === "[data-load-draft]" ? { dataset: { loadDraft: "d1" } } : null) }
});
state = getState();
assert(state.selection === null, "载入草稿清空选区");
assert(state.clipboard && state.clipboard.items.length === 4, "载入草稿后剪贴板仍保留");

console.log(failures === 0 ? "\n全部测试通过 ✔" : `\n${failures} 项失败 ✘`);
process.exit(failures === 0 ? 0 : 1);

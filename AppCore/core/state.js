// ── DOM refs ─────────────────────────────────────────────────
const cv = document.getElementById('cv');
const tlPlay = document.getElementById('tl-play');
const fpsSelect = document.getElementById('fps-select');
const ctx = cv.getContext('2d');
const area = document.getElementById('canvas-area');
const rulerCv = document.getElementById('tl-ruler');
const trackCv = document.getElementById('tl-tracks');
const rctx = rulerCv.getContext('2d');
const tctx = trackCv.getContext('2d');
const tlScroll = document.getElementById('tl-scroll');
const layerList = document.getElementById('tl-layer-list');
const tlDurInput = document.getElementById('tl-dur');

let looping = true;
// ── グローバル状態 ────────────────────────────────────────────
let color = '#3B8AE6';
let doFill = false;
let tool = 'select';
let shapes = [];
let selected = null;
let multiSelected = [];

// ── レイヤー ─────────────────────────────────────────────────
let layers = [{ id: 'layer-1', name: 'Layer 1', type: 'normal', parentId: null, visible: true, locked: false, opacity: 1, blendMode: 'source-over', color: null, collapsed: false }];
let activeLayerId = 'layer-1';

// 描画パラメータ
let sw = 2;
let rr = 0;
let rot = 0;
let opa = 100;
let sides = 6;
let dash = '0';

// マウス状態
let isDown = false;
let sx = 0, sy = 0;
let dragSel = false;
let dragOx = 0, dragOy = 0;
let modBrushPoints = [];
let marqueeSelecting = false;
let marqueeRect = null;
let marqueeAppend = false;

// リサイズ状態
let resizing = false;
let resizeHandle = null;
let resizeStart = null;
let freeTransforming = false;
const HANDLE_R = 6;

// ペン/パス
let penPts = [];
let ghostX = 0, ghostY = 0;

// ── path ツール専用の状態 ─────────────────────────────────────
let pathPoints = [];   // 確定した点の配列
let pathDragging = false; // ドラッグ中か
let pathMouseX = 0;    // 現在のマウス位置
let pathMouseY = 0;
let pathDragMode = false; // ドラッグ描画モード（マウスを押したまま動かす）
let _eraserHover = null;  // 消しゴムホバー中の図形

// ブラシ
let brushSize = 16;
let brushOpa = 80;
let brushSpacing = 4;
let brushType = 'round';
let brushPts = [];
let bLastX = null, bLastY = null;

// アニメーション
let animating = false;
let animT = 0;
let animFrame = null;
let lastTs = null;
let totalDur = 3;

// 物理演算は削除済み。再生制御との互換用フラグ。
let physicsRunning = false;
const API = '';
let currentProjectId = null;

// Undo スタック
let undoStack = [];
let redoStack = [];

// タイムライン定数
const PX_PER_SEC = 80;
const TRACK_H = 28;
const RULER_H = 20;

// 再描画系の共有state
let canvasBg = '#111111';

// コピペ
let clipboard = null;

let lastFrameDraw = 0;

// グループ化 + FPS
let FPS = Number(localStorage.getItem('mlcFPS') || 24);

// ── ユーティリティ ────────────────────────────────────────────
function setStatus(msg) {
  document.getElementById('status-txt').textContent = msg;
}

function toast(icon, msg) {
  const el = document.getElementById('toast');
  el.querySelector('i').className = 'ti ' + icon;
  document.getElementById('toast-msg').textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

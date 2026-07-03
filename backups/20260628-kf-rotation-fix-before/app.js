
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

tlDurInput.addEventListener('input', () => {
  const v = parseFloat(tlDurInput.value);

  if (!isNaN(v) && v > 0) {
    totalDur = v;
    drawTimeline();
  }
});

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

// ── Canvas リサイズ ───────────────────────────────────────────
function resizeCanvas() {
  const wrap = document.getElementById('cv-wrap') || area;
  const w = wrap.offsetWidth;
  const h = wrap.offsetHeight;
  if (w < 10 || h < 10) return;
  cv.width = w;
  cv.height = h;
  redraw();
  if (typeof drawRulers === 'function') drawRulers();
}

// ResizeObserver でレイアウト確定後に確実にリサイズ
const _cvWrap = document.getElementById('cv-wrap') || area;
const _ro = new ResizeObserver(() => { resizeCanvas(); drawTimeline(); });
_ro.observe(_cvWrap);

// ── 座標変換 ─────────────────────────────────────────────────
function canvasCoords(e) {
  const r = cv.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// ── 図形ヘルパー ─────────────────────────────────────────────
function polyPts(cx, cy, r, n, a0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + i * 2 * Math.PI / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function getCenter(s) {
  switch (s.type) {
    case 'rect':
      return { x: s.x + s.w / 2, y: s.y + s.h / 2 };

    case 'webgl-image':
      return { x: s.x + s.w / 2, y: s.y + s.h / 2 };

    case 'circle':
      return { x: s.cx, y: s.cy };

    case 'triangle':
    case 'polygon':
      return { x: s.cx, y: s.cy };

    case 'line':
      return {
        x: (s.x1 + s.x2) / 2,
        y: (s.y1 + s.y2) / 2
      };

    case 'pen':
    case 'brush': {
      const b = getBounds(s);
      return {
        x: b.x + b.w / 2,
        y: b.y + b.h / 2
      };
    }

    default: {
      const renderer =
        window.AnimationApp?.customRenderers?.[s.type];

      if (renderer && renderer.getCenter) {
        return renderer.getCenter(s);
      }

      const b = getBounds(s);

      return {
        x: b.x + b.w / 2,
        y: b.y + b.h / 2
      };
    }
  }
}

function getBounds(s) {
  switch (s.type) {
    case 'rect':
      return { x: s.x, y: s.y, w: s.w, h: s.h };
    case 'webgl-image':
      return { x: s.x, y: s.y, w: s.w, h: s.h };
    case 'circle':
      return { x: s.cx - s.rx, y: s.cy - s.ry, w: s.rx * 2, h: s.ry * 2 };
    case 'triangle':
    case 'polygon': {
      const n = s.type === 'triangle' ? 3 : (s.sides || 6);
      const sx = s.scaleX || 1, sy2 = s.scaleY || 1;
      const a0 = s.type === 'triangle'
        ? ((s.rot || 0) - 90) * Math.PI / 180
        : (s.rot || 0) * Math.PI / 180;
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) {
        const a = a0 + i * 2 * Math.PI / n;
        xs.push(s.cx + s.r * Math.cos(a) * sx);
        ys.push(s.cy + s.r * Math.sin(a) * sy2);
      }
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'line': {
      const x = Math.min(s.x1, s.x2) - 4, y = Math.min(s.y1, s.y2) - 4;
      return { x, y, w: Math.abs(s.x2 - s.x1) + 8, h: Math.abs(s.y2 - s.y1) + 8 };
    }
    case 'pen': {
      if (!s.pts || !s.pts.length) return { x: 0, y: 0, w: 0, h: 0 };
      const xs = s.pts.map(p => p.x), ys = s.pts.map(p => p.y);
      const pad = (s.sw || 2) / 2;
      const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
      return { x, y, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
    }
    case 'brush': {
      if (s.pts && s.pts.length) {
        const xs = s.pts.map(p => p.x), ys = s.pts.map(p => p.y);
        const pad = (s.sw || 16) / 2;
        const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
        return {
          x,
          y,
          w: Math.max(...xs) - Math.min(...xs) + pad * 2,
          h: Math.max(...ys) - Math.min(...ys) + pad * 2
        };
      }

      if (s.snap) return {
        x: 0,
        y: 0,
        w: s.snap.width,
        h: s.snap.height
      };

      return {
        x: 0,
        y: 0,
        w: cv.width,
        h: cv.height
      };
    }

    case 'mod-brush': {
      if (!s.pts || !s.pts.length) return { x: 0, y: 0, w: 0, h: 0 };

      const xs = s.pts.map(p => p.x);
      const ys = s.pts.map(p => p.y);
      const pad = (s.sw || 16) * 3;

      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;

      return {
        x,
        y,
        w: Math.max(...xs) - Math.min(...xs) + pad * 2,
        h: Math.max(...ys) - Math.min(...ys) + pad * 2
      };
    }

    default: {
      const renderer = window.AnimationApp?.customRenderers?.[s.type];

      if (renderer && renderer.getBounds) {
        return renderer.getBounds(s);
      }

      return { x: 0, y: 0, w: 0, h: 0 };
    }
  }
}


function hitTest(s, x, y) {
  const b = getBounds(s);
  return x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6;
}

function normalizeRect(x1, y1, x2, y2) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1)
  };
}

function rectsOverlap(a, b) {
  return (
    a.x <= b.x + b.w &&
    a.x + a.w >= b.x &&
    a.y <= b.y + b.h &&
    a.y + a.h >= b.y
  );
}

function pointInRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function shapeIntersectsRect(s, r) {
  const b = getBounds(s);
  if (!b || b.w <= 0 || b.h <= 0) return false;
  const padded = { x: b.x - 3, y: b.y - 3, w: b.w + 6, h: b.h + 6 };
  return rectsOverlap(r, padded) || pointInRect(getCenter(s), r);
}

function finishMarqueeSelection(x, y) {
  if (!marqueeRect) return;

  marqueeRect.x2 = x;
  marqueeRect.y2 = y;
  const r = normalizeRect(marqueeRect.x1, marqueeRect.y1, marqueeRect.x2, marqueeRect.y2);
  const isClick = Math.hypot(marqueeRect.x2 - marqueeRect.x1, marqueeRect.y2 - marqueeRect.y1) < 5;

  if (isClick) {
    if (!marqueeAppend) {
      selected = null;
      multiSelected = [];
      syncProps();
      syncLayers();
    }

    marqueeSelecting = false;
    marqueeRect = null;
    marqueeAppend = false;
    redraw();
    return;
  }

  ensureShapeIds();
  const hits = shapes.filter(s => !s.hidden && shapeIntersectsRect(s, r));

  if (marqueeAppend) {
    const ids = new Set(multiSelected || []);
    hits.forEach(s => ids.add(s.id));
    multiSelected = [...ids];
  } else {
    multiSelected = hits.map(s => s.id);
  }

  if (hits.length > 0) {
    selected = hits[hits.length - 1];
    setStatus(`${multiSelected.length}個を選択`);
  } else if (!marqueeAppend) {
    selected = null;
    setStatus('範囲内に図形がありません');
  }

  marqueeSelecting = false;
  marqueeRect = null;
  marqueeAppend = false;
  syncProps();
  syncLayers();
  redraw();
}

function getGroupMembers(groupId, includeHidden = false) {
  if (!groupId) return [];
  return shapes.filter(s => s.groupId === groupId && (includeHidden || !s.hidden));
}

function getGroupBounds(groupId) {
  const members = getGroupMembers(groupId);
  if (!members.length) return null;

  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;

  members.forEach(s => {
    const b = getBounds(s);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  });

  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function getAnimationCenter(s) {
  if (s?.groupId) {
    const b = getGroupBounds(s.groupId);
    if (b) return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  return getCenter(s);
}

function shapeHasAnimation(s) {
  if (!s) return false;
  return Boolean(
    (s.animPath && s.animPath.length > 1) ||
    (s.keyframes && s.keyframes.length) ||
    s.autoRotate
  );
}

function markGroupAnimationOwner(s) {
  if (!s?.groupId) return;
  getGroupMembers(s.groupId, true).forEach(m => delete m.groupAnimOwner);
  s.groupAnimOwner = true;
}

function animationPropsForShape(s) {
  if (!s) return null;
  const c = getAnimationCenter(s);
  return {
    opa: s.opa ?? 100,
    rot: s.rot ?? 0,
    color: s.color,
    x: c.x,
    y: c.y
  };
}


function animationPropsForShapeAtCurrentTime(s) {
  const props = animationPropsForShape(s);
  if (!props) return null;
  const owner = getAnimationOwnerForShape(s);
  if (!owner) return props;
  const cur = parseFloat((animT * totalDur).toFixed(2));
  const kfP = interpKF(owner.keyframes, cur);
  if (!kfP) return props;

  const kfOpa = Number(kfP.opa);
  const kfRot = Number(kfP.rot);
  if (Number.isFinite(kfOpa)) props.opa = kfOpa;
  if (Number.isFinite(kfRot)) props.rot = kfRot;
  if (kfP.color) props.color = kfP.color;

  const useKfPosition = !(owner.animPath && owner.animPath.length > 1);
  const kfX = Number(kfP.x);
  const kfY = Number(kfP.y);
  if (useKfPosition && Number.isFinite(kfX)) props.x = kfX;
  if (useKfPosition && Number.isFinite(kfY)) props.y = kfY;
  return props;
}

function currentRotationForShape(s) {
  const props = animationPropsForShapeAtCurrentTime(s);
  const rot = Number(props?.rot ?? s?.rot ?? 0);
  return Number.isFinite(rot) ? Math.round(rot * 100) / 100 : 0;
}

function cleanupKeyframeHolds(animOwner) {
  if (!animOwner) return;
  if (hasUserKeyframes(animOwner)) return;
  animOwner.keyframes = [];
  delete animOwner._kfBaseProps;
  if (!shapeHasAnimation(animOwner)) delete animOwner.groupAnimOwner;
}

function upsertKeyframeAtCurrentTime(overrides = {}, options = {}) {
  if (!selected) { setStatus('図形を選択してください'); return null; }
  const animOwner = getSelectedAnimationOwner();
  if (!animOwner) return null;

  const currentT = parseFloat((animT * totalDur).toFixed(2));
  const targetT = Number.isFinite(Number(options.t))
    ? Math.max(0, Math.min(totalDur, Number(options.t)))
    : currentT;
  const props = animationPropsForShapeAtCurrentTime(selected);
  if (!props) return null;
  Object.assign(props, overrides);

  saveState();
  animOwner.keyframes ||= [];

  if (!hasUserKeyframes(animOwner) && targetT > 0.01) {
    const baseProps = animOwner._kfBaseProps || animationPropsForShape(selected) || props;
    if (options.holdBefore === false) {
      animOwner.keyframes.push({ t: 0, props: { ...baseProps } });
    } else {
      const holdGap = Math.max(0.001, totalDur / 10000);
      const holdT = Math.max(0, targetT - holdGap);
      animOwner.keyframes.push({ t: 0, props: { ...baseProps }, autoHold: true });
      if (holdT > 0.001) {
        animOwner.keyframes.push({ t: holdT, props: { ...baseProps }, autoHold: true });
      }
    }
  }

  const existing = animOwner.keyframes.find(k => !k.autoHold && Math.abs(k.t - targetT) < 0.01);
  if (existing) {
    existing.props = props;
    delete existing.autoHold;
  } else {
    animOwner.keyframes.push({ t: targetT, props });
  }

  animOwner.autoRotate = 0;
  markGroupAnimationOwner(animOwner);
  animOwner.keyframes.sort((a, b) => a.t - b.t);
  renderAnimationCanvasFrame(animT);
  syncProps();
  drawTimeline();
  updateCode();
  return { t: targetT, existing: Boolean(existing), owner: animOwner };
}

function deleteKeyframeAtCurrentTime() {
  if (!selected) { setStatus('図形を選択してください'); return; }
  const animOwner = getSelectedAnimationOwner();
  if (!animOwner?.keyframes?.length) { setStatus('削除するKFがありません'); return; }

  const t = parseFloat((animT * totalDur).toFixed(2));
  const userKfs = animOwner.keyframes.filter(k => !k.autoHold);
  if (!userKfs.length) { setStatus('削除するKFがありません'); return; }

  const nearest = userKfs
    .map(k => ({ k, d: Math.abs(Number(k.t) - t) }))
    .sort((a, b) => a.d - b.d)[0];
  const tolerance = Math.max(0.2, 3 / Math.max(1, FPS || 24));
  if (!nearest || nearest.d > tolerance) {
    setStatus('近いKFがありません: 最寄り ' + Number(nearest.k.t).toFixed(2) + 's');
    toast('ti-alert-triangle', '赤い再生位置をKFに近づけてください');
    return;
  }

  saveState();
  animOwner.keyframes = animOwner.keyframes.filter(k => k !== nearest.k);
  cleanupKeyframeHolds(animOwner);
  renderAnimationCanvasFrame(animT);
  syncProps();
  drawTimeline();
  updateCode();
  setStatus('KF削除: ' + Number(nearest.k.t).toFixed(2) + 's');
  toast('ti-diamond-off', Number(nearest.k.t).toFixed(2) + 's のKFを削除');
}

function setRotationKeyframeFromInput() {
  const input = document.getElementById('p-anim-rot');
  const valEl = document.getElementById('p-anim-rot-v');
  const rotVal = Number(input?.value);
  if (!Number.isFinite(rotVal)) {
    setStatus('回転角度を入力してください');
    return;
  }
  if (valEl) valEl.textContent = rotVal + '°';
  const animOwner = getSelectedAnimationOwner();
  const currentT = parseFloat((animT * totalDur).toFixed(2));
  const firstRotationKf = animOwner && !hasUserKeyframes(animOwner) && currentT <= 0.01;
  const targetT = firstRotationKf ? totalDur : currentT;
  const result = upsertKeyframeAtCurrentTime({ rot: rotVal }, { holdBefore: false, t: targetT });
  if (!result) return;
  if (firstRotationKf && totalDur > 0) {
    animT = Math.max(0, Math.min(1, targetT / totalDur));
    renderAnimationCanvasFrame(animT);
    drawTimeline();
  }
  setStatus((result.existing ? '回転KF更新: ' : '回転KF追加: ') + rotVal + '° / ' + result.t.toFixed(2) + 's');
  toast('ti-rotate-clockwise', result.t.toFixed(2) + 's に ' + rotVal + '°');
}


function userKeyframesForShape(s) {
  return (s?.keyframes || [])
    .filter(k => !k.autoHold)
    .sort((a, b) => a.t - b.t);
}

function hasUserKeyframes(s) {
  return userKeyframesForShape(s).length > 0;
}

function getPathTimeRange(s) {
  const userKfs = userKeyframesForShape(s);
  let start = userKfs.length ? Number(userKfs[0].t) : 0;
  let end = Number.isFinite(Number(s?.pathEndT)) ? Number(s.pathEndT) : totalDur;
  start = Math.max(0, Math.min(totalDur, start));
  end = Math.max(0, Math.min(totalDur, end));
  if (end <= start) end = Math.max(start + 0.01, totalDur);
  return { start, end };
}

function getPathProgressForTime(s, cur, fallbackProgress) {
  if (!s?.animPath || s.animPath.length < 2) return null;
  const range = getPathTimeRange(s);
  if (cur <= range.start) return 0;
  if (cur >= range.end) return 1;
  return (cur - range.start) / Math.max(0.001, range.end - range.start);
}

function rememberAnimationBase(s) {
  if (!s) return;
  const owner = getAnimationOwnerForShape(s);
  if (!owner || hasUserKeyframes(owner) || owner._kfBaseProps) return;
  const props = animationPropsForShape(s);
  if (props) owner._kfBaseProps = props;
}

function getGroupAnimationOwner(groupId, fallbackToFirst = true) {
  const members = getGroupMembers(groupId, true);
  return (
    members.find(s => s.groupAnimOwner && shapeHasAnimation(s)) ||
    members.find(shapeHasAnimation) ||
    (fallbackToFirst ? members[0] : null) ||
    null
  );
}

function getSelectedAnimationOwner() {
  if (!selected) return null;
  if (!selected.groupId) return selected;
  return getGroupAnimationOwner(selected.groupId, false) || selected;
}

function getAnimationOwnerForShape(s) {
  if (s && s.groupId) return getGroupAnimationOwner(s.groupId, false) || s;
  return s;
}

function applyAnimationTransform(owner, center, cur, progress) {
  const kfP = interpKF(owner.keyframes, cur);
  const pathProgress = getPathProgressForTime(owner, cur, progress);
  const pos = getPathPos(pathProgress ?? progress, owner.animPath || null);
  const pathDx = pos && owner.animPath && owner.animPath[0] ? pos.x - owner.animPath[0].x : 0;
  const pathDy = pos && owner.animPath && owner.animPath[0] ? pos.y - owner.animPath[0].y : 0;
  const useKfPosition = !(owner.animPath && owner.animPath.length > 1);
  const kfDx = useKfPosition && kfP && Number.isFinite(kfP.x) ? kfP.x - center.x : 0;
  const kfDy = useKfPosition && kfP && Number.isFinite(kfP.y) ? kfP.y - center.y : 0;
  const dx = pathDx + kfDx;
  const dy = pathDy + kfDy;

  if (dx || dy) {
    ctx.translate(dx, dy);
  }

  const kfRot = kfP && Number.isFinite(Number(kfP.rot)) ? Number(kfP.rot) : null;
  if (kfRot !== null) {
    ctx.translate(center.x, center.y);
    ctx.rotate(((kfRot - (owner.rot || 0)) * Math.PI) / 180);
    ctx.translate(-center.x, -center.y);
  }

  if (owner.autoRotate) {
    ctx.translate(center.x, center.y);
    ctx.rotate(owner.autoRotate * cur * Math.PI / 180);
    ctx.translate(-center.x, -center.y);
  }

  return kfP;
}

function offsetShapeForAnimation(s, dx, dy) {
  if (!dx && !dy) return s;

  const copy = { ...s };
  if (s.pts) copy.pts = s.pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
  if (s.snap) copy.snap = s.snap;

  if (s.type === "rect") {
    copy.x = s.x + dx;
    copy.y = s.y + dy;
  } else if (["circle", "triangle", "polygon"].includes(s.type)) {
    copy.cx = s.cx + dx;
    copy.cy = s.cy + dy;
  } else if (s.type === "line") {
    copy.x1 = s.x1 + dx;
    copy.y1 = s.y1 + dy;
    copy.x2 = s.x2 + dx;
    copy.y2 = s.y2 + dy;
  } else if (!s.pts) {
    const renderer = window.AnimationApp?.customRenderers?.[s.type];
    if (renderer && renderer.move) renderer.move(copy, dx, dy);
  }

  return copy;
}

function drawAnimatedShape(s, kfP = null) {
  if (!kfP) {
    drawShape(s, ctx);
    return;
  }

  const kfOpa = Number(kfP.opa);
  drawShape({
    ...s,
    opa: Number.isFinite(kfOpa) ? kfOpa : s.opa,
    color: kfP.color || s.color
  }, ctx);
}

function getAnimationDebugSummary() {
  const groups = [...new Set(shapes.filter(s => s.groupId).map(s => s.groupId))];
  const animatedGroups = groups.filter(id => {
    const owner = getGroupAnimationOwner(id, false);
    return owner && shapeHasAnimation(owner);
  }).length;
  const solo = shapes.filter(s => !s.groupId && shapeHasAnimation(s)).length;
  return { groups: groups.length, animatedGroups, solo };
}

function drawAnimatedScene(cur, progress) {
  const drawnGroups = new Set();

  const drawWithOwner = (items, owner, center) => {
    ctx.save();
    const kfP = applyAnimationTransform(owner, center, cur, progress);
    items.forEach(item => drawAnimatedShape(item, kfP));
    ctx.restore();
  };

  shapes.forEach(s => {
    if (s.hidden) return;

    if (s.groupId) {
      if (drawnGroups.has(s.groupId)) return;
      drawnGroups.add(s.groupId);

      const members = getGroupMembers(s.groupId);
      const owner = getGroupAnimationOwner(s.groupId);
      const b = getGroupBounds(s.groupId);
      if (!members.length || !owner || !b) return;

      drawWithOwner(members, owner, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
      return;
    }

    drawWithOwner([s], s, getCenter(s));
  });
}

// ── ハンドル ─────────────────────────────────────────────────
function getHandles(b) {
  const mx = b.x + b.w / 2, my = b.y + b.h / 2;
  return {
    nw: { x: b.x, y: b.y, cur: 'nwse-resize' },
    ne: { x: b.x + b.w, y: b.y, cur: 'nesw-resize' },
    sw: { x: b.x, y: b.y + b.h, cur: 'nesw-resize' },
    se: { x: b.x + b.w, y: b.y + b.h, cur: 'nwse-resize' },
    n: { x: mx, y: b.y, cur: 'ns-resize' },
    s: { x: mx, y: b.y + b.h, cur: 'ns-resize' },
    w: { x: b.x, y: my, cur: 'ew-resize' },
    e: { x: b.x + b.w, y: my, cur: 'ew-resize' },
  };
}

function hitHandle(s, x, y) {
  if (!s) return null;
  const handles = getHandles(getBounds(s));
  const pad = HANDLE_R + 5;
  for (const [k, h] of Object.entries(handles)) {
    if (x >= h.x - pad && x <= h.x + pad && y >= h.y - pad && y <= h.y + pad) return k;
  }
  return null;
}

// ── 図形描画 ─────────────────────────────────────────────────
function drawShape(s, dc) {
  dc = dc || ctx;
  if (s.hidden) return;
  dc.save();
  dc.globalAlpha = (s.opa || 100) / 100;
  dc.strokeStyle = s.color || '#fff';
  dc.lineWidth = s.sw || 2;
  dc.lineCap = 'round';
  dc.lineJoin = 'round';
  dc.setLineDash(s.dash && s.dash !== '0' ? s.dash.split(',').map(Number) : []);


  switch (s.type) {
    case 'rect': {
      dc.translate(s.x + s.w / 2, s.y + s.h / 2);
      dc.rotate((s.rot || 0) * Math.PI / 180);
      dc.beginPath();
      dc.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, s.rr || 0);
      if (s.fill) { dc.fillStyle = s.color; dc.fill(); }
      dc.stroke();
      break;
    }
    case 'circle': {
      dc.beginPath();
      dc.ellipse(s.cx, s.cy, s.rx, s.ry, (s.rot || 0) * Math.PI / 180, 0, Math.PI * 2);
      if (s.fill) { dc.fillStyle = s.color; dc.fill(); }
      dc.stroke();
      break;
    }
    case 'triangle': {
      const scX = s.scaleX || 1, scY = s.scaleY || 1;
      dc.translate(s.cx, s.cy);
      dc.scale(scX, scY);
      dc.rotate(((s.rot || 0) - 90) * Math.PI / 180);
      const p = polyPts(0, 0, s.r, 3, 0);
      dc.beginPath();
      dc.moveTo(p[0].x, p[0].y);
      p.forEach(q => dc.lineTo(q.x, q.y));
      dc.closePath();
      if (s.fill) { dc.fillStyle = s.color; dc.fill(); }
      dc.stroke();
      break;
    }
    case 'polygon': {
      const scX = s.scaleX || 1, scY = s.scaleY || 1;
      dc.translate(s.cx, s.cy);
      dc.scale(scX, scY);
      dc.rotate((s.rot || 0) * Math.PI / 180);
      const p = polyPts(0, 0, s.r, s.sides || 6, 0);
      dc.beginPath();
      dc.moveTo(p[0].x, p[0].y);
      p.forEach(q => dc.lineTo(q.x, q.y));
      dc.closePath();
      if (s.fill) { dc.fillStyle = s.color; dc.fill(); }
      dc.stroke();
      break;
    }
    case 'line': {
      dc.beginPath();
      dc.moveTo(s.x1, s.y1);
      dc.lineTo(s.x2, s.y2);
      dc.stroke();
      break;
    }
    case 'pen': {
      if (!s.pts || s.pts.length < 2) break;
      dc.beginPath();
      dc.moveTo(s.pts[0].x, s.pts[0].y);
      s.pts.forEach(p => dc.lineTo(p.x, p.y));
      dc.stroke();
      break;
    }
    case 'brush': {
      if (s.snap) {
        // snap はブラシストロークだけを含むオフスクリーン canvas
        // dc に合成して描画
        dc.save();
        dc.globalAlpha = (s.opa || 80) / 100;
        dc.drawImage(s.snap, 0, 0);
        dc.restore();
      }
      break;
    }
    case 'mod-brush': {
      const brush = window.AnimationApp?.customBrushes?.[s.brushId];

      if (brush && brush.draw) {
        brush.draw(dc, s.pts, s);
      }
      break;
    }
    default: {
      const renderer = window.AnimationApp?.customRenderers?.[s.type];

      if (renderer && renderer.draw) {
        renderer.draw(dc, s);
      }

      break;
    }
  }

  dc.restore();
}

// ── 選択ハンドル描画 ──────────────────────────────────────────
function drawHandles(s) {
  const b = getBounds(s);
  const rotR = (s.rot || 0) * Math.PI / 180;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  ctx.save();

  // 回転がある場合は中心を軸に回転した状態で描画
  if (s.rot && s.rot !== 0 && ['rect'].includes(s.type)) {
    ctx.translate(cx, cy);
    ctx.rotate(rotR);
    ctx.translate(-cx, -cy);
  }

  // 選択枠
  ctx.strokeStyle = '#3B8AE6';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(59,138,230,0.04)';
  ctx.fillRect(b.x, b.y, b.w, b.h);

  // ハンドル
  const handles = getHandles(b);
  Object.entries(handles).forEach(([k, h]) => {
    const isCorn = ['nw', 'ne', 'sw', 'se'].includes(k);
    const sz = isCorn ? HANDLE_R : HANDLE_R - 1;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.beginPath();
    ctx.roundRect(h.x - sz, h.y - sz, sz * 2, sz * 2, 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#3B8AE6';
    ctx.lineWidth = isCorn ? 2 : 1.5;
    ctx.stroke();
  });
  ctx.restore();
}

function drawMultiSelectionOutlines() {
  if (!multiSelected || multiSelected.length < 2) return;

  const ids = new Set(multiSelected);
  ctx.save();
  ctx.strokeStyle = '#6fb1ff';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]);
  ctx.fillStyle = 'rgba(59,138,230,0.035)';

  shapes.forEach(s => {
    if (s.hidden || !ids.has(s.id) || s === selected) return;
    const b = getBounds(s);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillRect(b.x, b.y, b.w, b.h);
  });

  ctx.restore();
}

function drawMarqueeSelection() {
  if (!marqueeSelecting || !marqueeRect) return;

  const r = normalizeRect(marqueeRect.x1, marqueeRect.y1, marqueeRect.x2, marqueeRect.y2);
  if (r.w < 2 && r.h < 2) return;

  ctx.save();
  ctx.fillStyle = 'rgba(59,138,230,0.13)';
  ctx.strokeStyle = '#7db8ff';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
  ctx.restore();
}

// ── 再描画 ───────────────────────────────────────────────────
let canvasBg = '#111111';

function redraw() {
  // 必ず clearRect してから背景色で塗る（残像防止）
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = canvasBg;
  ctx.fillRect(0, 0, cv.width, cv.height);
  shapes.forEach(s => drawShape(s));


  drawGroupOutlines();
  drawMultiSelectionOutlines();

  // 選択ハンドル
  if (selected && !animating && !physicsRunning) {
    drawHandles(selected);
  }

  // 消しゴムホバーハイライト
  if (tool === 'eraser' && _eraserHover) {
    const b = getBounds(_eraserHover);
    ctx.save();
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // アニメパスオーバーレイ
  shapes.forEach(s => {
    if (!s.animPath || s.animPath.length < 2) return;
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(s.animPath[0].x, s.animPath[0].y);
    s.animPath.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    [s.animPath[0], s.animPath[s.animPath.length - 1]].forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = s.color; ctx.fill();
    });
    ctx.restore();
  });

  // ペン: フリーハンドプレビュー
  if (tool === 'pen' && penPts.length > 1) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = sw;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(penPts[0].x, penPts[0].y);
    penPts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke(); ctx.restore();
  }

  // パスツール: 確定点 + 現在マウスへのプレビュー線
  if (tool === 'path' && pathPoints.length > 0) {
    const pc = selected ? selected.color : '#EF9F27';
    ctx.save();
    // 確定済みのパス
    ctx.strokeStyle = pc; ctx.lineWidth = 2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
    pathPoints.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
    // 各確定点に丸を描く
    pathPoints.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#fff' : pc; ctx.fill();
      ctx.strokeStyle = pc; ctx.lineWidth = 1.5; ctx.stroke();
    });
    // 最後の確定点 → 現在マウス位置のプレビュー線（破線）
    const last = pathPoints[pathPoints.length - 1];
    ctx.strokeStyle = pc; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]); ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(last.x, last.y);
    ctx.lineTo(pathMouseX, pathMouseY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ドラッグ中ゴースト
  if (isDown && !['select', 'pen', 'path', 'brush', 'eraser'].includes(tool)) {
    drawGhost(tool, sx, sy, ghostX, ghostY);
  }

  drawMarqueeSelection();

  // SVGオーバーレイが表示中なら図形位置を同期（残像防止）
  if (_jeSvg) syncJeSvg();
}

function drawGhost(t, x1, y1, x2, y2) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = sw;
  ctx.setLineDash([5, 3]);
  ctx.globalAlpha = 0.6;
  switch (t) {
    case 'rect':
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      break;
    case 'circle':
      ctx.beginPath();
      ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'triangle': {
      const r = Math.hypot(x2 - x1, y2 - y1) / 2;
      const p = polyPts((x1 + x2) / 2, (y1 + y2) / 2, r, 3, -Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); p.forEach(q => ctx.lineTo(q.x, q.y)); ctx.closePath(); ctx.stroke();
      break;
    }
    case 'polygon': {
      const r = Math.hypot(x2 - x1, y2 - y1) / 2;
      const p = polyPts((x1 + x2) / 2, (y1 + y2) / 2, r, sides, 0);
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); p.forEach(q => ctx.lineTo(q.x, q.y)); ctx.closePath(); ctx.stroke();
      break;
    }
    case 'line':
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      break;
  }
  ctx.setLineDash([]);
  ctx.restore();
}

// ── 図形移動 ─────────────────────────────────────────────────
function moveShape(s, dx, dy) {
  if (s.type === 'rect') {
    s.x += dx;
    s.y += dy;

  } else if (['circle', 'triangle', 'polygon'].includes(s.type)) {
    s.cx += dx;
    s.cy += dy;

  } else if (s.type === 'line') {
    s.x1 += dx;
    s.y1 += dy;
    s.x2 += dx;
    s.y2 += dy;

  } else if (s.type === 'brush') {
    if (s.pts) {
      s.pts = s.pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
    }

    if (s.snap) {
      const moved = document.createElement('canvas');
      moved.width = s.snap.width;
      moved.height = s.snap.height;

      const mctx = moved.getContext('2d');
      mctx.drawImage(s.snap, dx, dy);

      s.snap = moved;
    }
  } else if (s.type === 'pen' || s.type === 'mod-brush') {
    s.pts = s.pts.map(p => ({ x: p.x + dx, y: p.y + dy }));

  } else {
    const renderer = window.AnimationApp?.customRenderers?.[s.type];
    if (renderer && renderer.move) {
      renderer.move(s, dx, dy);
    }
  }

  if (s.animPath) {
    s.animPath = s.animPath.map(p => ({ x: p.x + dx, y: p.y + dy }));
  }
}
// ── リサイズ ─────────────────────────────────────────────────
function applyResize(s, handle, start, dx, dy) {
  const b = start;
  let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
  if (handle.includes('w')) { nx = b.x + dx; nw = b.w - dx; }
  if (handle.includes('e')) { nw = b.w + dx; }
  if (handle.includes('n')) { ny = b.y + dy; nh = b.h - dy; }
  if (handle.includes('s')) { nh = b.h + dy; }
  if (nw < 10) { nw = 10; if (handle.includes('w')) nx = b.x + b.w - 10; }
  if (nh < 10) { nh = 10; if (handle.includes('n')) ny = b.y + b.h - 10; }

  const snap = start.shape;
  if (
    freeTransforming &&
    (s.type === 'pen' || s.type === 'brush' || s.type === 'mod-brush')
  ) {
    applyFreeTransformPts(s, resizeHandle, start, nx, ny, nw, nh);

    if (s.type === 'brush') {
      rebuildBrushSnap(s);
    }

    return;
  }
  if (s.type === 'rect') {
    s.x = nx; s.y = ny; s.w = nw; s.h = nh;
  } else if (s.type === 'circle') {
    s.cx = nx + nw / 2; s.cy = ny + nh / 2; s.rx = nw / 2; s.ry = nh / 2;
  } else if (['triangle', 'polygon'].includes(s.type)) {
    s.cx = snap.cx + (nx + nw / 2) - start.bcx;
    s.cy = snap.cy + (ny + nh / 2) - start.bcy;
    const bW = start.w / (snap.scaleX || 1);
    const bH = start.h / (snap.scaleY || 1);
    s.scaleX = bW > 0 ? nw / bW : 1;
    s.scaleY = bH > 0 ? nh / bH : 1;
  } else if (s.type === 'line') {
    if (handle === 'se' || handle === 'e' || handle === 's') { s.x2 = snap.x2 + dx; s.y2 = snap.y2 + dy; }
    else if (handle === 'nw' || handle === 'w' || handle === 'n') { s.x1 = snap.x1 + dx; s.y1 = snap.y1 + dy; }
    else if (handle === 'ne') { s.x2 = snap.x2 + dx; s.y1 = snap.y1 + dy; }
    else if (handle === 'sw') { s.x1 = snap.x1 + dx; s.y2 = snap.y2 + dy; }

  } else if (s.type === 'pen' || s.type === 'brush' || s.type === 'mod-brush') {
    if (!s.pts || !s.pts.length) return;

    const basePts = start.shape.pts || [];

    const baseX = start.x;
    const baseY = start.y;
    const baseW = Math.max(1, start.w);
    const baseH = Math.max(1, start.h);

    const scaleX = nw / baseW;
    const scaleY = nh / baseH;

    s.pts = basePts.map(p => ({
      x: nx + (p.x - baseX) * scaleX,
      y: ny + (p.y - baseY) * scaleY
    }));

    if (s.type === 'brush') {
      rebuildBrushSnap(s);
    }
  } else {
    const renderer = window.AnimationApp?.customRenderers?.[s.type];
    if (renderer && renderer.resize) {
      renderer.resize(s, handle, start, nx, ny, nw, nh);
    }
  }
}
function applyFreeTransformPts(s, handle, start, nx, ny, nw, nh) {
  if (!s.pts || !s.pts.length) return;

  const basePts = start.shape.pts || [];

  const x0 = start.x;
  const y0 = start.y;
  const w0 = Math.max(1, start.w);
  const h0 = Math.max(1, start.h);

  const leftTop = { x: x0, y: y0 };
  const rightTop = { x: x0 + w0, y: y0 };
  const leftBottom = { x: x0, y: y0 + h0 };
  const rightBottom = { x: x0 + w0, y: y0 + h0 };

  if (handle === 'nw') {
    leftTop.x = nx;
    leftTop.y = ny;
  } else if (handle === 'ne') {
    rightTop.x = nx + nw;
    rightTop.y = ny;
  } else if (handle === 'sw') {
    leftBottom.x = nx;
    leftBottom.y = ny + nh;
  } else if (handle === 'se') {
    rightBottom.x = nx + nw;
    rightBottom.y = ny + nh;
  }

  s.pts = basePts.map(p => {
    const u = (p.x - x0) / w0;
    const v = (p.y - y0) / h0;

    const topX = leftTop.x + (rightTop.x - leftTop.x) * u;
    const topY = leftTop.y + (rightTop.y - leftTop.y) * u;

    const bottomX = leftBottom.x + (rightBottom.x - leftBottom.x) * u;
    const bottomY = leftBottom.y + (rightBottom.y - leftBottom.y) * u;

    return {
      x: topX + (bottomX - topX) * v,
      y: topY + (bottomY - topY) * v
    };
  });
}
// ── Undo / Redo ──────────────────────────────────────────────
function saveState() {
  undoStack.push(JSON.stringify(shapes.map(s => { const { snap, ...r } = s; return r; })));
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(shapes.map(s => { const { snap, ...r } = s; return r; })));
  shapes = JSON.parse(undoStack.pop());
  selected = null; multiSelected = [];
  syncAll();
  setStatus('元に戻しました');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(shapes.map(s => { const { snap, ...r } = s; return r; })));
  shapes = JSON.parse(redoStack.pop());
  selected = null; multiSelected = [];
  syncAll();
  setStatus('やり直しました');
}

// ── コピペ ───────────────────────────────────────────────────
let clipboard = null;

function copySelected() {
  if (!selected) return;
  clipboard = JSON.parse(JSON.stringify(selected));
  const { snap, ..._ } = clipboard; // snap は除外
  setStatus(selected.name + ' をコピー');
}

function paste() {
  if (!clipboard) return;
  const copy = JSON.parse(JSON.stringify(clipboard));
  copy.keyframes = []; copy.animPath = null; delete copy.pathStartT; delete copy.pathEndT; delete copy._kfBaseProps;
  copy.id = 'shape_copy_' + Math.random().toString(36).slice(2, 8);
  delete copy.groupId;
  if (copy.type === 'rect') { copy.x += 20; copy.y += 20; }
  else if (['circle', 'triangle', 'polygon'].includes(copy.type)) { copy.cx += 20; copy.cy += 20; }
  else if (copy.type === 'line') { copy.x1 += 20; copy.y1 += 20; copy.x2 += 20; copy.y2 += 20; }
  else if (copy.type === 'pen' || copy.type === 'brush' || copy.type === 'mod-brush') {
    if (copy.pts) copy.pts = copy.pts.map(p => ({ x: p.x + 20, y: p.y + 20 }));
  } else {
    const renderer = window.AnimationApp?.customRenderers?.[copy.type];
    if (renderer && renderer.move) renderer.move(copy, 20, 20);
  }
  const base = copy.name.replace(/ コピー\d*$/, '');
  const cnt = shapes.filter(s => s.name.startsWith(base + ' コピー')).length;
  copy.name = base + ' コピー' + (cnt > 0 ? cnt + 1 : '');
  saveState();
  shapes.push(copy);
  selected = copy;
  clipboard = JSON.parse(JSON.stringify(copy));
  syncAll();
  setStatus(copy.name + ' をペースト');
}

function deleteSelected() {
  if (!selected && (!multiSelected || !multiSelected.length)) return;
  ensureShapeIds();
  const ids = new Set(multiSelected || []);
  if (selected?.id) ids.add(selected.id);
  const count = shapes.filter(s => ids.has(s.id)).length;
  if (!count) return;
  saveState();
  shapes = shapes.filter(s => !ids.has(s.id));
  selected = null;
  multiSelected = [];
  syncAll();
  setStatus(count > 1 ? `${count}個を削除しました` : '削除しました');
}

// ── キーボードショートカット ──────────────────────────────────
document.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey;

  // Shift: まっすぐ引きモード（INPUT中でも有効）
  if (e.key === 'Shift' && !straightMode) {
    straightMode = true;
    snapBase = (isDown && penPts.length > 0)
      ? { ...penPts[penPts.length - 1] }
      : { x: sx, y: sy };
  }

  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

  if (mod && e.key === 'c') { copySelected(); e.preventDefault(); }
  if (mod && e.key === 'v') { paste(); e.preventDefault(); }
  if (mod && e.key === 'z' && !e.shiftKey) { undo(); e.preventDefault(); }
  if (mod && e.key === 'z' && e.shiftKey) { redo(); e.preventDefault(); }
  if (mod && e.key === 'p') { openPreview(); e.preventDefault(); }
  if (mod && e.key === 's') { saveProject(); e.preventDefault(); }
  if (e.key === 'Escape') { deleteSelected(); }
  if (e.key === ']' && mod) { bringForward(); e.preventDefault(); }
  if (e.key === '[' && mod) { sendBackward(); e.preventDefault(); }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); }

  // ツールショートカット
  const toolKeys = { v: 'select', r: 'rect', c: 'circle', t: 'triangle', p: 'polygon', l: 'line', e: 'eraser' };
  if (!mod && toolKeys[e.key]) setTool(toolKeys[e.key]);

  // Space: 再生/停止
  if (e.key === ' ' && !mod) { toggleAnim(); e.preventDefault(); }
});

document.addEventListener('keyup', e => {
  if (e.key === 'Shift') { straightMode = false; snapBase = null; }
});

// ── ツール選択 ────────────────────────────────────────────────
function setTool(t) {
  // パスツールを離れるとき pathPoints をリセット
  if (tool === 'path' && t !== 'path' && pathPoints.length > 0) {
    pathPoints = []; redraw();
  }
  if (t !== 'select') {
    marqueeSelecting = false;
    marqueeRect = null;
    marqueeAppend = false;
  }
  tool = t;
  if (t !== "mod-brush") {
    document.querySelectorAll(".rp-btn[data-mod-brush]").forEach(b => {
      b.classList.remove("active");
    });
  }
  document.querySelectorAll('.rp-btn[data-tool]').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === t);
  });
  cv.style.cursor = t === 'select' ? 'default' : 'crosshair';
  if (t !== 'path') { /* パス以外は選択維持しない */ }
  if (t === 'path' && selected) {
    setStatus('パス: 赤い再生位置の時刻から開始 / 図形からドラッグ / ダブルクリックで確定');
  } else if (t === 'path') {
    setStatus('図形を選択してからパスを描いてください');
  }
  redraw();
}

window.setTool = setTool;

document.querySelectorAll('.rp-btn[data-tool]').forEach(b => {
  b.addEventListener('click', () => setTool(b.dataset.tool));
});


// ══════════════════════════════════════════════════════════════
// ファイル保存・読み込み
// ══════════════════════════════════════════════════════════════
function serializeProject() {
  return {
    shapes: shapes.map(s => {
      const { snap, _orig, ...rest } = s;
      return rest;
    }),
    totalDur, looping, color,
    canvasBg: canvasBg || '#111111',
    mods: getUsedMods()
  };
}

function getUsedMods() {
  const ids = new Set();

  shapes.forEach(s => {
    if (s.modId) ids.add(s.modId);
    if (s.brushModId) ids.add(s.brushModId);
  });

  return [...ids];
}

function checkRequiredMods(requiredMods) {
  const loadedIds = LoadedMods.map(m => m.id);
  const missing = requiredMods.filter(id => !loadedIds.includes(id));

  if (missing.length) {
    setStatus(`必要MODが不足: ${missing.join(', ')}`);
    toast('ti-alert-triangle', '必要MODが不足しています');
  }
}

function deserializeProject(data) {
  checkRequiredMods(data.mods || []);
  shapes = data.shapes || [];
  totalDur = data.totalDur || 3;
  looping = data.looping !== undefined ? data.looping : true;
  color = data.color || '#3B8AE6';
  if (data.canvasBg) { canvasBg = data.canvasBg; }
  document.getElementById('tl-dur').value = totalDur;
  document.getElementById('tl-loop').checked = looping;
  setColor(color);
  selected = null;
  multiSelected = [];
  syncAll();

}

async function saveProject() {
  const name = document.getElementById('proj-name').textContent.replace('.mlc', '') || '無題';
  const body = { name, data: serializeProject(), thumbnail: cv.toDataURL('image/png', 0.3) };
  try {
    let res;
    if (currentProjectId) {
      res = await fetch(`${API}/projects/${currentProjectId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
    } else {
      res = await fetch(`${API}/projects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (res.ok) currentProjectId = (await res.json()).id;
    }
    if (res && res.ok) toast('ti-device-floppy', '保存しました');
    else throw new Error();
  } catch {
    // ローカル保存
    const blob = new Blob([JSON.stringify({ name, data: serializeProject() })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name + '.mlc'; a.click();
    URL.revokeObjectURL(url);
    toast('ti-device-floppy', 'ローカルに保存しました');
  }
}

function exportMLC() {
  const name = document.getElementById('proj-name').textContent.replace('.mlc', '') || '無題';

  const blob = new Blob([
    JSON.stringify({ name, data: serializeProject() }, null, 2)
  ], { type: 'application/json' });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = name + '.mlc';
  a.click();

  URL.revokeObjectURL(url);

  toast('ti-file-export', '.mlcを書き出しました');
}

function openMLC() {
  const input = document.createElement('input');

  input.type = 'file';
  input.accept = '.mlc,application/json';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (!json.data) {
        throw new Error('無効なMLCファイル');
      }

      deserializeProject(json.data);

      document.getElementById('proj-name').textContent =
        (json.name || file.name.replace('.mlc', '')) + '.mlc';

      redraw();
      drawTimeline();

      toast('ti-file-import', '.mlcを読み込みました');

    } catch (err) {
      console.error(err);

      toast('ti-alert-triangle', '.mlc読み込み失敗');
      setStatus('MLC読み込みエラー');
    }
  };

  input.click();
}

async function openProject() {
  try {
    const res = await fetch(`${API}/projects`);
    if (!res.ok) throw new Error();
    showProjectList(await res.json());
  } catch {
    // ファイル選択にフォールバック
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.mlc,.json';
    input.onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const { name, data } = JSON.parse(ev.target.result);
          document.getElementById('proj-name').textContent = name + '.mlc';
          currentProjectId = null;
          deserializeProject(data);
          toast('ti-folder-open', name + ' を開きました');
        } catch { toast('ti-alert-triangle', '読み込みに失敗しました'); }
      };
      reader.readAsText(file);
    };
    input.click();
  }
}

function showProjectList(projects) {
  document.getElementById('proj-list-modal')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'proj-list-modal';
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center';
  const modal = document.createElement('div');
  modal.style.cssText = 'background:#1f1f1f;border:1px solid #333;border-radius:10px;width:360px;max-height:480px;display:flex;flex-direction:column;overflow:hidden';
  modal.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid #333;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:14px;font-weight:600;color:#e8e6df">プロジェクト一覧</span>
      <span style="cursor:pointer;color:#888;font-size:16px" onclick="document.getElementById('proj-list-modal').remove()">✕</span>
    </div>
    <div style="overflow-y:auto;flex:1">
      ${projects.length === 0
      ? '<p style="padding:24px;text-align:center;font-size:12px;color:#555">保存済みプロジェクトはありません</p>'
      : projects.map(p => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #222;cursor:pointer"
               onmouseover="this.style.background='#282828'" onmouseout="this.style.background=''"
               onclick="loadProject(${p.id})">
            ${p.thumbnail
          ? `<img src="${p.thumbnail}" style="width:48px;height:32px;object-fit:cover;border-radius:4px">`
          : `<div style="width:48px;height:32px;background:#282828;border-radius:4px"></div>`}
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;color:#e8e6df;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</div>
              <div style="font-size:10px;color:#555;margin-top:2px">${p.updated_at}</div>
            </div>
            <span style="font-size:12px;cursor:pointer;padding:4px 8px;color:#666"
                  onclick="event.stopPropagation();deleteProjectItem(${p.id},this.parentElement)">🗑</span>
          </div>`).join('')}
    </div>`;
  wrap.appendChild(modal);
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
}

async function loadProject(id) {
  document.getElementById('proj-list-modal')?.remove();
  try {
    const res = await fetch(`${API}/projects/${id}`);
    if (!res.ok) throw new Error();
    const proj = await res.json();
    currentProjectId = proj.id;
    document.getElementById('proj-name').textContent = proj.name + '.mlc';
    deserializeProject(proj.data);
    toast('ti-folder-open', proj.name + ' を開きました');
  } catch { toast('ti-alert-triangle', '読み込みに失敗しました'); }
}

async function deleteProjectItem(id, row) {
  if (!confirm('削除しますか？')) return;
  try {
    await fetch(`${API}/projects/${id}`, { method: 'DELETE' });
    row?.remove();
    if (currentProjectId === id) currentProjectId = null;
  } catch { }
}

function newProject() {
  if (!confirm('新規プロジェクトを作成しますか？')) return;
  stopAnim(); stopPhysics();
  shapes = []; selected = null; multiSelected = []; currentProjectId = null; animT = 0;
  undoStack = []; redoStack = [];
  document.getElementById('proj-name').textContent = '無題.mlc';
  syncAll();
  toast('ti-file-plus', '新規プロジェクト');
}

function exportPNG() {
  const a = document.createElement('a');
  a.href = cv.toDataURL('image/png'); a.download = 'canvas.png'; a.click();
  toast('ti-photo', 'PNG書き出し完了');
}
function exportJS() {
  const code = generateEditorCode();

  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'animation.js';
  a.click();

  URL.revokeObjectURL(url);

  toast('ti-code', 'JS書き出し完了');
}

// ── カラー ───────────────────────────────────────────────────
function setColor(c) {
  color = c;
  document.getElementById('cur-color').style.background = c;
  document.getElementById('cpicker').value = c;
  document.querySelectorAll('.pdot').forEach(d => d.classList.toggle('active', d.dataset.c === c));
  if (selected) { rememberAnimationBase(selected); selected.color = c; redraw(); }
}

document.getElementById('cpicker').addEventListener('input', e => setColor(e.target.value));
document.getElementById('canvas-bg-picker').addEventListener('input', e => {
  canvasBg = e.target.value;
  redraw();
});
document.querySelectorAll('.pdot').forEach(d => d.addEventListener('click', () => setColor(d.dataset.c)));

document.getElementById('fill-chk').addEventListener('change', e => {
  doFill = e.target.checked;
  if (selected) { rememberAnimationBase(selected); selected.fill = doFill; redraw(); }
});

// ── マウスイベント ────────────────────────────────────────────
cv.addEventListener('mousedown', e => {
  const { x, y } = canvasCoords(e);
  sx = x; sy = y;
  isDown = true;

  if (tool === 'mod-brush') {
    modBrushPoints = [{ x, y }];
    return;
  }

  if (tool === 'select') {
    // ハンドルヒット
    const hk = hitHandle(selected, x, y);
  if (hk) {
    rememberAnimationBase(selected);

    const isPtsShape =
      selected &&
      (selected.type === 'pen' ||
      selected.type === 'brush' ||
      selected.type === 'mod-brush');

    freeTransforming = isPtsShape && e.altKey;

    resizing = true;
    resizeHandle = hk;

    const _b = getBounds(selected);
    resizeStart = {
      x: _b.x,
      y: _b.y,
      w: _b.w,
      h: _b.h,
      bcx: _b.x + _b.w / 2,
      bcy: _b.y + _b.h / 2,
      shape: JSON.parse(JSON.stringify(selected))
    };

    dragOx = x;
    dragOy = y;
    return;
  }
    // 図形ヒット
    const hit = shapes.slice().reverse().find(s => !s.hidden && hitTest(s, x, y));
    if (hit) {
      rememberAnimationBase(hit);
      saveState();
      ensureShapeIds();
      const hitAlreadySelected = multiSelected.includes(hit.id);
      if (e.shiftKey) {
        if (!multiSelected.includes(hit.id)) multiSelected.push(hit.id);
      } else if (hitAlreadySelected && multiSelected.length > 1) {
        // 範囲選択後は、選択済み図形をつかんでも複数選択を維持する。
      } else {
        multiSelected = [hit.id];
      }
      selected = hit; dragSel = true; dragOx = x; dragOy = y;
      syncProps(); syncLayers();
    } else {
      marqueeSelecting = true;
      marqueeAppend = e.shiftKey;
      marqueeRect = { x1: x, y1: y, x2: x, y2: y };
      selected = marqueeAppend ? selected : null;
      dragSel = false;
      if (!marqueeAppend) multiSelected = [];
      syncProps(); syncLayers();
    }
    redraw(); return;
  }

  if (tool === 'eraser') {
    // 通常の hitTest
    let hit = shapes.slice().reverse().find(s => hitTest(s, x, y));

    // ブラシは snap 画像なので hitTest が効かない
    // → ブラシの pts（描画軌跡）に近い点があれば消す
    if (!hit) {
      hit = shapes.slice().reverse().find(s => {
        if (s.type !== 'brush' || !s.pts || !s.pts.length) return false;
        const r = (s.sw || 16) / 2 + 8;
        return s.pts.some(p => Math.hypot(p.x - x, p.y - y) <= r);
      });
    }
    if (!hit) {
      hit = shapes.slice().reverse().find(s => {
        if (!['brush', 'mod-brush', 'pen'].includes(s.type) || !s.pts || !s.pts.length) return false;
        const r = (s.sw || 16) / 2 + 8;
        return s.pts.some(p => Math.hypot(p.x - x, p.y - y) <= r);
      });
    }
    // それでも見つからない場合: ブラシの snap がキャンバス全体を覆っているので
    // snap を持つブラシの最後のものを消す（ドラッグ消しゴム風）
    if (!hit) {
      const brushes = shapes.filter(s => s.type === 'brush' && s.snap);
      if (brushes.length > 0) hit = brushes[brushes.length - 1];
    }

    if (hit) {
      saveState();
      shapes = shapes.filter(s => s !== hit);
      if (selected === hit) selected = null;
      _eraserHover = null;
      syncAll();
    }
    return;
  }

  if (tool === 'brush') {
    brushPts = []; bLastX = null; bLastY = null;
    stampBrush(x, y); brushPts.push({ x, y }); bLastX = x; bLastY = y;
    return;
  }

  if (tool === 'pen') { penPts = [{ x, y }]; return; }

  if (tool === 'path') {
    // 図形をクリックしたら選択（まだ点がない場合）
    const hit = shapes.slice().reverse().find(s => !s.hidden && hitTest(s, x, y));
    if (hit && pathPoints.length === 0) {
      selected = hit; syncProps(); syncLayers();
      // グループ中の図形なら、グループ全体の中心を開始点にする。
      const c = getAnimationCenter(hit);
      pathPoints = [{ x: c.x, y: c.y }];
      pathMouseX = c.x; pathMouseY = c.y;
      pathDragMode = true;  // ドラッグ描画開始
      redraw();
      setStatus(hit.name + ' | ドラッグで自由描画 / Shift+ドラッグで水平垂直 / クリックで点固定 / ダブルクリックで確定');
      return;
    }
    // 既に描画中: Shift なしはドラッグモード開始
    let px = x, py = y;
    if (straightMode && pathPoints.length > 0) {
      const last = pathPoints[pathPoints.length - 1];
      const sn = applyStrightSnap(x, y, last.x, last.y);
      px = sn.x; py = sn.y;
    }
    pathPoints.push({ x: px, y: py });
    pathDragMode = !straightMode; // Shift中はクリック固定モード
    pathMouseX = px; pathMouseY = py;
    setStatus(`${pathPoints.length}点 | ドラッグ自由描画 / Shift=水平垂直 / ダブルクリック確定`);
    redraw();
    return;
  }
});

cv.addEventListener('mousemove', e => {
  const { x, y } = canvasCoords(e);
  // Shift を押しながらドラッグ: snapBase を基準に水平/垂直スナップ
  if (isDown && straightMode && snapBase && ['pen', 'path', 'line'].includes(tool)) {
    const snapped = applyStrightSnap(x, y, snapBase.x, snapBase.y);
    ghostX = snapped.x;
    ghostY = snapped.y;
  } else {
    ghostX = x; ghostY = y;
  }

  // カーソル更新（ドラッグ中でなくても）
  if (tool === 'select' && !isDown && selected) {
    const hk = hitHandle(selected, x, y);
    if (hk) cv.style.cursor = getHandles(getBounds(selected))[hk].cur;
    else if (hitTest(selected, x, y)) cv.style.cursor = 'move';
    else cv.style.cursor = 'default';
  }

  if (tool === 'brush') updateBrushCursor(x, y);
  else hideBrushCursor();

  // 消しゴム: ホバーハイライトのみ（削除は mousedown で行う）
  if (tool === 'eraser') {
    let _hover = shapes.slice().reverse().find(s => hitTest(s, x, y));
    if (!_hover) {
      _hover = shapes.slice().reverse().find(s => {
        if (s.type !== 'brush' || !s.pts || !s.pts.length) return false;
        const r = (s.sw || 16) / 2 + 8;
        return s.pts.some(p => Math.hypot(p.x - x, p.y - y) <= r);
      });
    }
    _eraserHover = _hover || null;
    redraw();
  }

  if (!isDown) return;

  if (tool === 'mod-brush') {
    modBrushPoints.push({ x, y });
    redraw();

    const brush = window.AnimationApp?.activeModBrush;
    if (brush && brush.draw) {
      brush.draw(ctx, modBrushPoints, {
        color,
        sw,
        opa,
        preview: true
      });
    }

    return;
  }

  if (tool === 'select' && resizing && selected) {
    applyResize(selected, resizeHandle, resizeStart, x - dragOx, y - dragOy);
    syncProps(); redraw(); return;
  }
  if (tool === 'select' && marqueeSelecting && marqueeRect) {
    marqueeRect.x2 = x;
    marqueeRect.y2 = y;
    redraw(); return;
  }
  if (tool === 'select' && dragSel && selected) {
    const dx = x - dragOx;
    const dy = y - dragOy;
    moveShape(selected, dx, dy);
    moveSelectionMembers(selected, dx, dy);
    dragOx = x; dragOy = y;
    redraw(); return;
  }

  if (tool === 'brush') { drawBrushStroke(x, y); return; }
  if (tool === 'pen') {
    // ペン: フリーハンド（Shiftで水平/垂直）
    let px = x, py = y;
    if (straightMode && snapBase) {
      const sn = applyStrightSnap(x, y, snapBase.x, snapBase.y);
      px = sn.x; py = sn.y;
    }
    const last = penPts[penPts.length - 1];
    if (!last || Math.hypot(px - last.x, py - last.y) >= 2) penPts.push({ x: px, y: py });
    redraw(); return;
  }
  if (tool === 'path') {
    // Shiftスナップ
    let mx = x, my = y;
    if (straightMode && pathPoints.length > 0) {
      const last = pathPoints[pathPoints.length - 1];
      const sn = applyStrightSnap(x, y, last.x, last.y);
      mx = sn.x; my = sn.y;
    }
    pathMouseX = mx; pathMouseY = my;

    if (pathDragMode && isDown && !straightMode) {
      // ドラッグ自由描画: マウス軌跡を pathPoints に追記
      const last = pathPoints[pathPoints.length - 1];
      // 点が細かすぎると補間が暴れやすいので少し間引く
      if (!last || Math.hypot(mx - last.x, my - last.y) >= 6) {
        pathPoints.push({ x: mx, y: my });
      }
    }
    redraw(); return;
  }
  redraw(); // ghost
});

cv.addEventListener('mouseup', e => {


  if (!isDown) return;
  isDown = false;
  _eraserHover = null;
  if (tool === 'mod-brush') {
    const brush = window.AnimationApp?.activeModBrush;

    if (brush && modBrushPoints.length > 1) {
      saveState();

      const added = {
        type: 'mod-brush',
        brushId: brush.id,
        brushModId: brush.modId || brush.id,
        pts: [...modBrushPoints],
        color,
        sw,
        opa,
        dash,
        keyframes: [],
        hidden: false,
        name: brush.name || 'MODブラシ'
      };

      shapes.push(added);
      selected = added;
      syncAll();
      setStatus(`${added.name} を追加`);
    }

    modBrushPoints = [];
    dragSel = false;
    redraw();
    drawTimeline();
    return;
  };
  // path ドラッグ描画終了
  if (tool === 'path') {
    pathDragMode = false;
    // ドラッグ終了時点の座標を確定点として追加
    if (pathPoints.length > 0) {
      const last = pathPoints[pathPoints.length - 1];
      if (Math.hypot(pathMouseX - last.x, pathMouseY - last.y) > 6) {
        pathPoints.push({ x: pathMouseX, y: pathMouseY });
      }
    }
    redraw();
    return;
  }

  if (resizing) {
    resizing = false;
    resizeHandle = null;
    resizeStart = null;
    freeTransforming = false;
    cv.style.cursor = 'default';
    syncProps(); redraw(); drawTimeline(); return;
  }

  if (tool === 'select' && marqueeSelecting) {
    const { x, y } = canvasCoords(e);
    finishMarqueeSelection(x, y);
    drawTimeline();
    return;
  }

  const { x, y } = canvasCoords(e);
  const dx = x - sx, dy = y - sy;
  let added = null;

  if (tool === 'brush' && brushPts.length > 0) {
    // ブラシストロークだけをオフスクリーン canvas に描いて保存
    const snap = document.createElement('canvas');
    snap.width = cv.width;
    snap.height = cv.height;
    const sctx = snap.getContext('2d');
    // 現在のブラシ描画をオフスクリーンに再現
    brushPts.forEach((p, idx) => {
      if (idx === 0) return;
      const prev = brushPts[idx - 1];
      const r = brushSize / 2;
      const grad = sctx.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, r);
      const a = brushOpa / 100 * 0.4;
      grad.addColorStop(0, hexToRgba(color, a));
      grad.addColorStop(1, hexToRgba(color, 0));
      sctx.fillStyle = grad;
      sctx.beginPath(); sctx.arc(p.x, p.y, r, 0, Math.PI * 2); sctx.fill();
    });
    added = {
      type: 'brush', pts: [...brushPts], snap, color, opa: brushOpa,
      sw: brushSize, dash: '0', keyframes: [], hidden: false, name: 'ブラシ'
    };
    bLastX = null; bLastY = null; brushPts = [];
  } else if (tool === 'pen' && penPts.length > 1) {
    added = { type: 'pen', pts: [...penPts], color, sw, opa, dash, keyframes: [], hidden: false, name: 'ペン' };
  } else if (tool === 'rect' && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
    added = {
      type: 'rect', x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(dx), h: Math.abs(dy),
      color, sw, rr, rot, opa, dash, fill: doFill, scaleX: 1, scaleY: 1,
      keyframes: [], hidden: false, name: '四角形'
    };
  } else if (tool === 'circle' && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
    added = {
      type: 'circle', cx: (sx + x) / 2, cy: (sy + y) / 2, rx: Math.abs(dx) / 2, ry: Math.abs(dy) / 2,
      color, sw, rot, opa, dash, fill: doFill,
      keyframes: [], hidden: false, name: '円'
    };
  } else if (tool === 'triangle' && Math.hypot(dx, dy) > 10) {
    added = {
      type: 'triangle', cx: (sx + x) / 2, cy: (sy + y) / 2, r: Math.hypot(dx, dy) / 2,
      color, sw, rot, opa, dash, fill: doFill, scaleX: 1, scaleY: 1,
      keyframes: [], hidden: false, name: '三角形'
    };
  } else if (tool === 'polygon' && Math.hypot(dx, dy) > 10) {
    added = {
      type: 'polygon', cx: (sx + x) / 2, cy: (sy + y) / 2, r: Math.hypot(dx, dy) / 2, sides,
      color, sw, rot, opa, dash, fill: doFill, scaleX: 1, scaleY: 1,
      keyframes: [], hidden: false, name: `${sides}角形`
    };
  } else if (tool === 'line' && Math.hypot(dx, dy) > 5) {
    added = {
      type: 'line', x1: sx, y1: sy, x2: x, y2: y,
      color, sw, opa, dash, keyframes: [], hidden: false, name: '直線'
    };
  }

  if (added) {
    // 同名の図形があれば番号をつける
    const base = added.name;
    const cnt = shapes.filter(s => s.name.startsWith(base)).length;
    if (cnt > 0) added.name = base + ' ' + (cnt + 1);
    saveState();
    shapes.push(added);
    selected = added;
    syncAll();
    setStatus(added.name + ' を追加');
  }

  if (tool !== 'path') penPts = [];
  dragSel = false;
  redraw(); drawTimeline();
});

// 右クリックメニュー
// path ツール: ダブルクリックでパス確定
cv.addEventListener('dblclick', e => {
  if (tool !== 'path') return;
  e.preventDefault();
  if (pathPoints.length < 2) {
    setStatus('点が少なすぎます（2点以上必要）');
    pathPoints = []; redraw(); return;
  }
  if (selected) {
    saveState();
    const animOwner = getAnimationOwnerForShape(selected);
    animOwner.animPath = [...pathPoints];
    delete animOwner.pathStartT;
    animOwner.pathEndT = totalDur;
    markGroupAnimationOwner(animOwner);
    const range = getPathTimeRange(animOwner);
    setStatus((selected.groupId ? 'グループ' : selected.name) + ' にパスを設定しました / 開始 ' + range.start.toFixed(2) + 's');
  } else {
    setStatus('⚠ 先に図形を選択してください');
  }
  pathPoints = []; pathDragging = false;
  redraw(); drawTimeline();
});

cv.addEventListener('contextmenu', e => {
  e.preventDefault();
  const { x, y } = canvasCoords(e);
  const hit = shapes.slice().reverse().find(s => !s.hidden && hitTest(s, x, y));
  if (hit) showContextMenu(e.clientX, e.clientY, hit);
});

cv.addEventListener('mouseleave', () => hideBrushCursor());

// ── 右クリックメニュー ────────────────────────────────────────
function showContextMenu(x, y, shape) {
  document.getElementById('ctx-menu-el')?.remove();
  const menu = document.createElement('div');
  menu.id = 'ctx-menu-el';
  menu.className = 'ctx-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const items = [
    {
      label: '🗑 削除',
      fn: () => { saveState(); shapes = shapes.filter(s => s !== shape); selected = null; multiSelected = []; syncAll(); }
    },
  ];

  items.forEach(it => {
    if (!it) { const sep = document.createElement('div'); sep.className = 'ctx-sep'; menu.appendChild(sep); return; }
    const el = document.createElement('div');
    el.className = 'ctx-item';
    el.textContent = it.label;
    el.onclick = () => { it.fn(); menu.remove(); };
    menu.appendChild(el);
  });

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
}

// ── ブラシエンジン ────────────────────────────────────────────
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function stampBrush(x, y) {
  const alpha = brushOpa / 100 * 0.4;
  const r = brushSize / 2;
  ctx.save();
  const grad = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
  grad.addColorStop(0, hexToRgba(color, alpha));
  grad.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBrushStroke(x, y) {
  if (bLastX === null) { stampBrush(x, y); bLastX = x; bLastY = y; return; }
  const d = Math.hypot(x - bLastX, y - bLastY);
  const step = Math.max(1, brushSpacing);
  if (d < step) return;
  const n = Math.floor(d / step);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    stampBrush(bLastX + (x - bLastX) * t, bLastY + (y - bLastY) * t);
    brushPts.push({ x: bLastX + (x - bLastX) * t, y: bLastY + (y - bLastY) * t });
  }
  bLastX = x; bLastY = y;
}
function rebuildBrushSnap(s) {
  if (!s.pts || s.pts.length < 1) return;

  const snap = document.createElement('canvas');
  snap.width = cv.width;
  snap.height = cv.height;

  const sctx = snap.getContext('2d');
  const r = (s.sw || 16) / 2;
  const a = (s.opa || 80) / 100 * 0.4;

  s.pts.forEach(p => {
    const grad = sctx.createRadialGradient(p.x, p.y, r * 0.3, p.x, p.y, r);
    grad.addColorStop(0, hexToRgba(s.color || color, a));
    grad.addColorStop(1, hexToRgba(s.color || color, 0));

    sctx.fillStyle = grad;
    sctx.beginPath();
    sctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    sctx.fill();
  });

  s.snap = snap;
}

function updateBrushCursor(x, y) {
  let el = document.getElementById('brush-cursor-el');
  if (!el) {
    el = document.createElement('div');
    el.id = 'brush-cursor-el';
    el.style.cssText = 'position:absolute;border-radius:50%;border:1.5px solid rgba(180,180,180,0.6);pointer-events:none;transform:translate(-50%,-50%);z-index:20;';
    const wrap = document.getElementById('cv-wrap') || area;
    wrap.appendChild(el);
  }
  el.style.width = brushSize + 'px';
  el.style.height = brushSize + 'px';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.display = 'block';
}

function hideBrushCursor() {
  const el = document.getElementById('brush-cursor-el');
  if (el) el.style.display = 'none';
}

// ── プロパティパネル同期 ──────────────────────────────────────
function syncProps() {
  const empty = document.getElementById('panel-empty');
  const props = document.getElementById('panel-props');
  if (!selected) {
    empty.style.display = 'flex';
    props.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  props.style.display = 'block';

  const animOwner = getSelectedAnimationOwner();
  document.getElementById('pp-title').textContent = selected.groupId
    ? `グループ / ${selected.name || selected.type}`
    : (selected.name || selected.type);

  // 角丸: rect のみ
  document.getElementById('row-rr').style.display =
    selected.type === 'rect' ? 'flex' : 'none';
  // 頂点数: polygon のみ
  document.getElementById('row-sides').style.display =
    selected.type === 'polygon' ? 'flex' : 'none';

  const set = (id, val, suffix = '') => {
    const el = document.getElementById(id);
    const vl = document.getElementById(id + '-v');
    if (el) el.value = val;
    if (vl) vl.textContent = val + suffix;
  };

  set('p-sw', selected.sw ?? 2);
  set('p-rr', selected.rr ?? 0);
  set('p-rot', selected.rot ?? 0, '°');
  set('p-opa', selected.opa ?? 100, '%');
  set('p-sides', selected.sides ?? 6);

  const dashEl = document.getElementById('p-dash');
  if (dashEl) dashEl.value = selected.dash || '0';
  set('p-anim-rot', currentRotationForShape(selected), '°');
  const pathRow = document.getElementById('row-path-time');
  const pathInfo = document.getElementById('path-time-info');
  if (pathRow && pathInfo) {
    const hasPath = Boolean(animOwner?.animPath && animOwner.animPath.length > 1);
    pathRow.style.display = hasPath ? 'flex' : 'none';
    if (hasPath) {
      const range = getPathTimeRange(animOwner);
      const hasKf = hasUserKeyframes(animOwner);
      pathInfo.textContent = (hasKf ? 'KF ' : '') + range.start.toFixed(2) + 's -> ' + range.end.toFixed(2) + 's';
    }
  }
}

// プロパティスライダーのバインド
[
  ['p-sw', 'p-sw-v', '', v => { sw = v; if (selected) { rememberAnimationBase(selected); selected.sw = v; redraw(); } }],
  ['p-rr', 'p-rr-v', '', v => { rr = v; if (selected) { rememberAnimationBase(selected); selected.rr = v; redraw(); } }],
  ['p-rot', 'p-rot-v', '°', v => { rot = v; if (selected) { rememberAnimationBase(selected); selected.rot = v; redraw(); } }],
  ['p-opa', 'p-opa-v', '%', v => { opa = v; if (selected) { rememberAnimationBase(selected); selected.opa = v; redraw(); } }],
  ['p-sides', 'p-sides-v', '', v => { sides = v; if (selected && selected.type === 'polygon') { rememberAnimationBase(selected); selected.sides = v; redraw(); } }],
].forEach(([id, vid, sfx, fn]) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById(vid).textContent = v + sfx;
    fn(v);
  });
});

document.getElementById('p-dash').addEventListener('change', e => {
  dash = e.target.value;
  if (selected) { rememberAnimationBase(selected); selected.dash = dash; redraw(); }
});

const animRotInput = document.getElementById('p-anim-rot');
animRotInput?.addEventListener('input', e => {
  const valEl = document.getElementById('p-anim-rot-v');
  if (valEl) valEl.textContent = (e.target.value || '0') + '°';
});
animRotInput?.addEventListener('change', setRotationKeyframeFromInput);
document.getElementById('btn-rotation-kf')?.addEventListener('click', setRotationKeyframeFromInput);

document.getElementById('btn-path-start-now')?.addEventListener('click', () => {
  const animOwner = getSelectedAnimationOwner();
  if (!animOwner?.animPath || animOwner.animPath.length < 2) return;
  addKfFn();
  syncProps(); drawTimeline(); updateCode();
  const range = getPathTimeRange(animOwner);
  setStatus('パス開始KF: ' + range.start.toFixed(2) + 's');
});

document.getElementById('btn-path-end-now')?.addEventListener('click', () => {
  const animOwner = getSelectedAnimationOwner();
  if (!animOwner?.animPath || animOwner.animPath.length < 2) return;
  animOwner.pathEndT = Math.max(0.01, parseFloat((animT * totalDur).toFixed(2)));
  const range = getPathTimeRange(animOwner);
  if (animOwner.pathEndT <= range.start) animOwner.pathEndT = Math.min(totalDur, range.start + 0.5);
  syncProps(); drawTimeline(); updateCode();
  setStatus('パス終了: ' + animOwner.pathEndT.toFixed(2) + 's');
});

// 物理タグトグル
function toggleTag(key) { setStatus('物理演算は削除済みです'); }

// アニメーションボタン
document.getElementById('btn-set-path').addEventListener('click', () => {
  if (!selected) { setStatus('図形を選択してください'); return; }
  setTool('path');
});
document.getElementById('btn-clear-anim').addEventListener('click', () => {
  if (!selected) return;
  const animOwner = getSelectedAnimationOwner();
  if (!animOwner) return;
  animOwner.animPath = null; animOwner.keyframes = []; animOwner.autoRotate = 0; delete animOwner.pathStartT; delete animOwner.pathEndT; delete animOwner._kfBaseProps;
  delete animOwner.groupAnimOwner;
  syncProps();
  redraw(); drawTimeline();
  setStatus('アニメーションを削除しました');
});

// ── レイヤーリスト同期 ────────────────────────────────────────
function syncLayers() {
  layerList.innerHTML = '';
  shapes.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'tl-layer-row' + (s === selected ? ' sel' : '');
    row.innerHTML = `
      <div class="tl-layer-dot" style="background:${s.color}"></div>
      <span class="tl-layer-name">${s.name || s.type}</span>
      <i class="tl-eye ti ${s.hidden ? 'ti-eye-off' : 'ti-eye'}" data-i="${i}"></i>
    `;
    row.querySelector('.tl-eye').addEventListener('click', ev => {
      ev.stopPropagation(); s.hidden = !s.hidden; redraw(); syncLayers(); drawTimeline();
    });
    row.addEventListener('click', () => { selected = s; syncProps(); syncLayers(); redraw(); });
    layerList.appendChild(row);
  });
}

function syncAll() {
  syncProps(); syncLayers(); redraw(); drawTimeline(); updateCode();
  if (typeof drawRulers === 'function') drawRulers();
  // SVGオーバーレイは実行中のみ表示（通常は非表示）
  // syncJeSvg はここでは呼ばない
}

// ── 前面・後面 ────────────────────────────────
function bringForward() {
  if (!selected) return;
  const i = shapes.indexOf(selected);
  if (i < shapes.length - 1) {
    [shapes[i], shapes[i + 1]] = [shapes[i + 1], shapes[i]];
    syncAll(); setStatus('前面へ');
  }
}
function sendBackward() {
  if (!selected) return;
  const i = shapes.indexOf(selected);
  if (i > 0) {
    [shapes[i], shapes[i - 1]] = [shapes[i - 1], shapes[i]];
    syncAll(); setStatus('後面へ');
  }
}
function bringToFront() {
  if (!selected) return;
  const i = shapes.indexOf(selected);
  shapes.push(shapes.splice(i, 1)[0]);
  syncAll(); setStatus('最前面へ');
}
function sendToBack() {
  if (!selected) return;
  const i = shapes.indexOf(selected);
  shapes.unshift(shapes.splice(i, 1)[0]);
  syncAll(); setStatus('最背面へ');
}

// ── タイムライン ─────────────────────────────────────────────
function drawTimeline() {
  syncLayers();
  const sw2 = tlScroll.clientWidth || 300;
  const totalW = Math.max(sw2, Math.round(totalDur * PX_PER_SEC) + 40);
  const totalH = Math.max(shapes.length * TRACK_H, 10);

  rulerCv.width = totalW; rulerCv.height = RULER_H;
  trackCv.width = totalW; trackCv.height = totalH;

  // ruler
  rctx.fillStyle = '#1f1f1f';
  rctx.fillRect(0, 0, totalW, RULER_H);
  rctx.font = '9px monospace';
  rctx.textBaseline = 'middle';
  const step = totalDur <= 5 ? 0.5 : totalDur <= 15 ? 1 : 2;
  for (let t = 0; t <= totalDur + 0.01; t += step) {
    const px = Math.round(t * PX_PER_SEC);
    rctx.fillStyle = '#555';
    rctx.fillRect(px, RULER_H - 6, 1, 6);
    rctx.fillStyle = '#888';
    rctx.fillText(t.toFixed(step < 1 ? 1 : 0) + 's', px + 2, RULER_H / 2);
  }

  // tracks
  tctx.fillStyle = '#161616';
  tctx.fillRect(0, 0, totalW, totalH);
  shapes.forEach((s, i) => {
    const y = i * TRACK_H;
    tctx.fillStyle = i % 2 === 0 ? '#161616' : '#1c1c1c';
    tctx.fillRect(0, y, totalW, TRACK_H);
    tctx.fillStyle = 'rgba(255,255,255,0.04)';
    tctx.fillRect(0, y + TRACK_H - 1, totalW, 1);

    // duration bar
    tctx.fillStyle = s.animPath ? s.color : '#3B8AE6';
    tctx.globalAlpha = s.hidden ? 0.15 : 0.35;
    if (s.animPath && s.animPath.length > 1) {
      const range = getPathTimeRange(s);
      const bx = Math.round(range.start * PX_PER_SEC) + 2;
      const bw = Math.max(3, Math.round((range.end - range.start) * PX_PER_SEC) - 2);
      tctx.fillRect(bx, y + TRACK_H / 2 - 5, bw, 10);
    } else {
      tctx.fillRect(2, y + TRACK_H / 2 - 5, Math.round(totalDur * PX_PER_SEC) - 2, 10);
    }
    tctx.globalAlpha = 1;

    // keyframes
    (s.keyframes || []).forEach(kf => {
      if (kf.autoHold) return;
      const kx = Math.round(kf.t * PX_PER_SEC);
      const ky = y + TRACK_H / 2;
      tctx.fillStyle = s === selected ? '#D85A30' : '#3B8AE6';
      tctx.beginPath();
      tctx.moveTo(kx, ky - 5); tctx.lineTo(kx + 5, ky); tctx.lineTo(kx, ky + 5); tctx.lineTo(kx - 5, ky);
      tctx.closePath(); tctx.fill();
    });
  });

  // playhead
  const px = Math.round(animT * totalDur * PX_PER_SEC);
  rctx.fillStyle = '#D85A30';
  rctx.fillRect(px, 0, 2, RULER_H);
  tctx.fillStyle = '#D85A30';
  tctx.globalAlpha = 0.5;
  tctx.fillRect(px, 0, 1, totalH);
  tctx.globalAlpha = 1;
  document.getElementById('tl-cur').textContent = (animT * totalDur).toFixed(2);
}

// タイムラインクリックでシーク
trackCv.addEventListener('click', e => {
  const r = trackCv.getBoundingClientRect();
  const x = (e.clientX - r.left) * (trackCv.width / r.width);
  const y = (e.clientY - r.top) * (trackCv.height / r.height);
  const idx = Math.floor(y / TRACK_H);
  if (idx >= 0 && idx < shapes.length) {
    animT = Math.max(0, Math.min(1, x / PX_PER_SEC / totalDur));
    selected = shapes[idx]; syncProps(); syncLayers(); renderAnimationCanvasFrame(animT); drawTimeline();
  }
});

rulerCv.addEventListener('click', e => {
  const r = rulerCv.getBoundingClientRect();
  const x = (e.clientX - r.left) * (rulerCv.width / r.width);
  animT = Math.max(0, Math.min(1, x / (totalDur * PX_PER_SEC)));
  renderAnimationCanvasFrame(animT); drawTimeline();
});

// タイムラインコントロール
document.getElementById('tl-rew').addEventListener('click', () => {
  stopAnim(); animT = 0; renderAnimationCanvasFrame(animT); drawTimeline();
});
document.getElementById('tl-play').addEventListener('click', toggleAnim);
document.getElementById('tl-fwd').addEventListener('click', () => {
  animT = Math.min(1, animT + 1 / totalDur / 30); renderAnimationCanvasFrame(animT); drawTimeline();
});
document.getElementById('tl-dur').addEventListener('input', e => {
  totalDur = parseFloat(e.target.value) || 3; drawTimeline(); updateCode();
});
document.getElementById('tl-loop').addEventListener('change', e => { looping = e.target.checked; });

// KFボタン
const addKfFn = () => {
  const result = upsertKeyframeAtCurrentTime();
  if (!result) return;
  setStatus((result.existing ? 'KF更新: ' : 'KF追加: ') + result.t.toFixed(2) + 's');
  toast('ti-diamond', result.t.toFixed(2) + 's にキーフレーム' + (result.existing ? '更新' : '追加'));
};
document.getElementById('tl-add-kf')?.addEventListener('click', addKfFn);
document.getElementById('tl-del-kf')?.addEventListener('click', deleteKeyframeAtCurrentTime);

// ── アニメーション ────────────────────────────────────────────
function interpKF(kfs, t) {
  if (!kfs || !kfs.length) return null;
  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  const before = sorted.filter(k => k.t <= t);
  const after = sorted.filter(k => k.t > t);
  if (!before.length) return null;
  if (!after.length) return { ...sorted[sorted.length - 1].props };
  const k0 = before[before.length - 1], k1 = after[0];
  const f = (t - k0.t) / (k1.t - k0.t);
  const lerp = key => {
    const a = Number(k0.props[key]);
    const b = Number(k1.props[key]);
    return Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * f : undefined;
  };
  return {
    opa: lerp('opa'),
    rot: lerp('rot'),
    x: lerp('x'),
    y: lerp('y'),
    color: k0.props.color,
  };
}

function getPathPos(t, path) {
  if (!path || path.length < 2) return null;

  // 座標系は変えない。保存された animPath をそのまま使う。
  // 点の番号ではなく線の長さで補間するだけにする。
  const segs = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.001) continue;
    segs.push({ a, b, len });
    total += len;
  }
  if (!segs.length) return path[0];

  let d = Math.max(0, Math.min(1, t)) * total;
  for (const seg of segs) {
    if (d <= seg.len) {
      const f = d / seg.len;
      return {
        x: seg.a.x + (seg.b.x - seg.a.x) * f,
        y: seg.a.y + (seg.b.y - seg.a.y) * f
      };
    }
    d -= seg.len;
  }
  return path[path.length - 1];
}

let lastFrameDraw = 0;

function setPlaybackButtonState(playing) {
  const tlBtn = document.getElementById('tl-play');
  if (tlBtn) {
    tlBtn.innerHTML = playing
      ? '<i class="ti ti-player-pause"></i>'
      : '<i class="ti ti-player-play"></i>';
    tlBtn.classList.toggle('playing', playing);
  }

  const runBtn = document.getElementById('je-run-btn');
  if (runBtn) {
    runBtn.innerHTML = playing
      ? '<i class="ti ti-player-pause"></i> 停止'
      : '<i class="ti ti-player-play"></i> JS実行';
    runBtn.classList.toggle('playing', playing);
  }
}

function renderAnimationCanvasFrame(progress) {
  const cur = progress * totalDur;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = canvasBg;
  ctx.fillRect(0, 0, cv.width, cv.height);

  drawAnimatedScene(cur, progress);

  shapes.forEach(s => {
    if (!s.animPath || s.animPath.length < 2) return;
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(s.animPath[0].x, s.animPath[0].y);
    s.animPath.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();
  });
}

function animStep(ts) {
  const frameInterval = 1000 / FPS;

  if (ts - lastFrameDraw < frameInterval) {
    animFrame = requestAnimationFrame(animStep);
    return;
  }

  lastFrameDraw = ts;

  if (physicsRunning) { stopAnim(); return; }
  if (!lastTs) lastTs = ts;
  const dt = (ts - lastTs) / 1000; lastTs = ts;
  animT += dt / totalDur;
  if (animT > 1) { if (looping) animT = 0; else { animT = 1; stopAnim(); return; } }

  renderAnimationCanvasFrame(animT);

  drawTimeline();
  animFrame = requestAnimationFrame(animStep);
}

function startAnim(options = {}) {

  if (physicsRunning) return;
  const restart = Boolean(options && options.restart);
  if (animating) cancelAnimationFrame(animFrame);
  if (typeof gsap !== 'undefined') {
    try {
      gsap.globalTimeline.clear();
      gsap.globalTimeline.resume();
      gsap.globalTimeline.paused(false);
    } catch (e) { }
  }
  document.getElementById('je-svg-overlay')?.remove();
  _jeSvg = null;
  lastFrameDraw = 0;
  if (restart || animT >= 1) animT = 0;
  animating = true; lastTs = null;
  setPlaybackButtonState(true);
  const dbg = getAnimationDebugSummary();
  setStatus("再生中... グループ:" + dbg.animatedGroups + "/" + dbg.groups + " 単体:" + dbg.solo);
  animFrame = requestAnimationFrame(animStep);
}

function stopAnim() {
  animating = false;
  cancelAnimationFrame(animFrame);
  setPlaybackButtonState(false);
  if (!physicsRunning) setStatus('停止');
  renderAnimationCanvasFrame(animT);
}

function toggleAnim() { animating ? stopAnim() : startAnim(); }

// ── 物理演算（削除済み）──────────────────────────────────
function togglePhysics() {
  setStatus('物理演算は削除済みです');
}
function startPhysics() {
  setStatus('物理演算は削除済みです');
}
function stopPhysics() {
  physicsRunning = false;
  redraw();
}
function applyFrame(objects) {
  // 物理演算なし
}

// ── プレビュー ────────────────────────────────────────────────
function refreshEditorCodeIfAuto() {
  const codeEl = document.getElementById('je-code');
  if (!codeEl || codeEl.dataset.manual === '1') return;
  if (typeof generateEditorCode !== 'function') return;
  codeEl.value = generateEditorCode();
  codeEl.dataset.manual = '0';
}

function updateCode() {
  refreshEditorCodeIfAuto();
}

function shouldRunEditorAsCanvas() {
  const codeEl = document.getElementById('je-code');
  return !codeEl || codeEl.dataset.manual !== '1';
}

function runSceneOnCanvasFromEditor() {
  if (typeof stopJeAnim === 'function') stopJeAnim();
  animT = 0;
  startAnim({ restart: true });
  jeLog('キャンバス再生で実行中', 'ok');
}


function previewMotionPathPoints(s) {
  if (!s.animPath || s.animPath.length < 2) return null;
  const first = s.animPath[0];
  const cleanPath = s.animPath.filter((p, idx, arr) => {
    if (idx === 0) return true;

    const prev = arr[idx - 1];

    return Math.hypot(
      p.x - prev.x,
      p.y - prev.y
    ) > 4;
  });

  const cornerPath = cleanPath.filter((p, idx, arr) => {
    if (idx === 0 || idx === arr.length - 1) return true;

    const a = arr[idx - 1];
    const b = p;
    const c = arr[idx + 1];

    const dx1 = Math.sign(b.x - a.x);
    const dy1 = Math.sign(b.y - a.y);

    const dx2 = Math.sign(c.x - b.x);
    const dy2 = Math.sign(c.y - b.y);

    return dx1 !== dx2 || dy1 !== dy2;
  });

  const pts = cornerPath
    .map(p => `{x:${Math.round(p.x)},y:${Math.round(p.y)}}`)
    .join(', ');
  const last = s.animPath[s.animPath.length - 1];
  const tail = pts[pts.length - 1];
  if (!tail || tail.x !== last.x || tail.y !== last.y) pts.push(last);
  return pts.map(p => `{x:${Math.round(p.x - first.x)},y:${Math.round(p.y - first.y)}}`).join(', ');
}

function openPreview(download = false) {

  // SVG/GSAP変換で座標が飛ぶ問題を避けるため、
  // プレビューは編集画面と同じCanvas座標で再生する。
  const previewShapes = JSON.parse(JSON.stringify(shapes.map(s => {
    const { snap, _orig, ...rest } = s;
    return rest;
  })));

  const previewRenderers = {};

  for (const [type, renderer] of Object.entries(window.AnimationApp?.customRenderers || {})) {
    if (renderer.previewDrawCode) {
      previewRenderers[type] = renderer.previewDrawCode;
    }
  }
  const previewBrushes = {};

  for (const [id, brush] of Object.entries(window.AnimationApp?.customBrushes || {})) {
    if (brush.previewDrawCode) {
      previewBrushes[id] = brush.previewDrawCode;
    }
  }

  const payload = {
    width: cv.width,
    height: cv.height,
    bg: canvasBg || '#111111',
    totalDur,
    looping,
    fps: (typeof FPS !== 'undefined' ? FPS : 24),
    shapes: previewShapes,
    renderers: previewRenderers,
    brushes: previewBrushes
  };


  const html = `<!DOCTYPE html>
  <html lang="ja">
  <head>
  <meta charset="UTF-8">
  <title>Motion Logic Canvas — Canvas Preview</title>
  <style>
  * { box-sizing:border-box; }
  body {
    margin:0;
    background:#111;
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    overflow:auto;
    font-family:system-ui,sans-serif;
  }
  #wrap {
    display:flex;
    flex-direction:column;
    gap:10px;
    align-items:center;
  }
  canvas {
    background:${canvasBg || '#111111'};
    max-width:96vw;
    max-height:88vh;
    border-radius:8px;
    box-shadow:0 12px 40px rgba(0,0,0,.45);
  }
  #bar {
    display:flex;
    align-items:center;
    gap:8px;
    color:#ddd;
    font-size:12px;
  }
  button {
    background:#222;
    color:#eee;
    border:1px solid #444;
    border-radius:6px;
    padding:6px 10px;
    cursor:pointer;
  }
  button:hover { border-color:#3B8AE6; }
  </style>
  </head>
  <body>
  <div id="wrap">
    <canvas id="pv" width="${cv.width}" height="${cv.height}"></canvas>
    <div id="bar">
      <button id="play">停止</button>
      <button id="restart">最初から</button>
      <span id="time">0.00s</span>
    </div>
  </div>
  <script>
  const data = ${JSON.stringify(payload)};
  const canvas = document.getElementById('pv');
  const ctx = canvas.getContext('2d');
  const previewRenderers = {};
    console.log('renderers data', data.renderers);
    for (const [type, code] of Object.entries(data.renderers || {})) {
      previewRenderers[type] = new Function("ctx", "s", code);
    }
    console.log('previewRenderers', previewRenderers);
  const previewBrushes = {};
  for (const [id, code] of Object.entries(data.brushes || {})) {
    previewBrushes[id] = new Function("ctx", "pts", "s", code);
  }
  let playing = true;
  let lastPreviewDraw = 0;
  let start = performance.now();
  let pauseAt = 0;

  function polyPts(cx, cy, r, n, a0) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + i * 2 * Math.PI / n;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
  }

  function getCenter(s) {
    switch (s.type) {
      case 'rect': return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      case 'webgl-image': return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      case 'circle': return { x: s.cx, y: s.cy };
      case 'triangle':
      case 'polygon': return { x: s.cx, y: s.cy };
      case 'line': return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
      case 'pen':
      case 'brush':
      case 'mod-brush': {
        const b = getBounds(s);
        return {
          x: b.x + b.w / 2,
          y: b.y + b.h / 2
        };
      }
    }
  }

  function getBounds(s) {
    switch (s.type) {
      case 'rect': return { x: s.x, y: s.y, w: s.w, h: s.h };
      case 'webgl-image': return { x: s.x, y: s.y, w: s.w, h: s.h };
      case 'circle': return { x: s.cx - s.rx, y: s.cy - s.ry, w: s.rx * 2, h: s.ry * 2 };
      case 'triangle':
      case 'polygon': {
        const n = s.type === 'triangle' ? 3 : (s.sides || 6);
        const sx = s.scaleX || 1, sy = s.scaleY || 1;
        const a0 = s.type === 'triangle' ? ((s.rot || 0) - 90) * Math.PI / 180 : (s.rot || 0) * Math.PI / 180;
        const xs = [], ys = [];
        for (let i = 0; i < n; i++) {
          const a = a0 + i * 2 * Math.PI / n;
          xs.push(s.cx + s.r * Math.cos(a) * sx);
          ys.push(s.cy + s.r * Math.sin(a) * sy);
        }
        const x = Math.min(...xs), y = Math.min(...ys);
        return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
      }
      case 'line': {
        const x = Math.min(s.x1, s.x2) - 4, y = Math.min(s.y1, s.y2) - 4;
        return { x, y, w: Math.abs(s.x2 - s.x1) + 8, h: Math.abs(s.y2 - s.y1) + 8 };
      }
      case 'pen':
      case 'brush': {
        if (!s.pts || !s.pts.length) return { x:0,y:0,w:0,h:0 };
        const xs = s.pts.map(p => p.x), ys = s.pts.map(p => p.y);
        const pad = (s.sw || 2) / 2;
        const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
        return { x, y, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
      }
      default: return { x:0,y:0,w:0,h:0 };
    }
  }

  function getGroupMembers(groupId, includeHidden = false) {
    if (!groupId) return [];
    return data.shapes.filter(s => s.groupId === groupId && (includeHidden || !s.hidden));
  }

  function getGroupBounds(groupId) {
    const members = getGroupMembers(groupId);
    if (!members.length) return null;

    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    members.forEach(s => {
      const b = getBounds(s);
      x1 = Math.min(x1, b.x);
      y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.w);
      y2 = Math.max(y2, b.y + b.h);
    });

    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function shapeHasAnimation(s) {
    if (!s) return false;
    return Boolean(
      (s.animPath && s.animPath.length > 1) ||
      (s.keyframes && s.keyframes.length) ||
      s.autoRotate
    );
  }

  function getGroupAnimationOwner(groupId) {
    const members = getGroupMembers(groupId, true);
    return (
      members.find(s => s.groupAnimOwner && shapeHasAnimation(s)) ||
      members.find(shapeHasAnimation) ||
      members[0] ||
      null
    );
  }

  function userKeyframesForShape(s) {
    return (s?.keyframes || []).filter(k => !k.autoHold).sort((a, b) => a.t - b.t);
  }

  function getPathTimeRange(s) {
    const userKfs = userKeyframesForShape(s);
    let start = userKfs.length ? Number(userKfs[0].t) : 0;
    let end = Number.isFinite(Number(s?.pathEndT)) ? Number(s.pathEndT) : data.totalDur;
    start = Math.max(0, Math.min(data.totalDur, start));
    end = Math.max(0, Math.min(data.totalDur, end));
    if (end <= start) end = Math.max(start + 0.01, data.totalDur);
    return { start, end };
  }

  function getPathProgressForTime(s, localTime, fallbackProgress) {
    if (!s?.animPath || s.animPath.length < 2) return null;
    const range = getPathTimeRange(s);
    if (localTime <= range.start) return 0;
    if (localTime >= range.end) return 1;
    return (localTime - range.start) / Math.max(0.001, range.end - range.start);
  }

  function interpKF(kfs, time) {
    if (!kfs || !kfs.length) return null;
    const sorted = [...kfs].sort((a, b) => a.t - b.t);
    const before = sorted.filter(k => k.t <= time);
    const after = sorted.filter(k => k.t > time);
    if (!before.length) return null;
    if (!after.length) return { ...sorted[sorted.length - 1].props };
    const k0 = before[before.length - 1], k1 = after[0];
    const f = (time - k0.t) / (k1.t - k0.t);
    const lerp = key => {
      const a = Number(k0.props[key]);
      const b = Number(k1.props[key]);
      return Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * f : undefined;
    };
    return {
      opa: lerp('opa'),
      rot: lerp('rot'),
      x: lerp('x'),
      y: lerp('y'),
      color: k0.props.color
    };
  }

  function getPathPos(t, path) {
    if (!path || path.length < 2) return null;
    const segs = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.001) continue;
      segs.push({ a, b, len });
      total += len;
    }
    if (!segs.length) return path[0];

    let d = Math.max(0, Math.min(1, t)) * total;
    for (const seg of segs) {
      if (d <= seg.len) {
        const f = d / seg.len;
        return { x: seg.a.x + (seg.b.x - seg.a.x) * f, y: seg.a.y + (seg.b.y - seg.a.y) * f };
      }
      d -= seg.len;
    }
    return path[path.length - 1];
  }

  function drawShape(s) {
    if (s.hidden) return;
    ctx.save();
    ctx.globalAlpha = (s.opa || 100) / 100;
    ctx.strokeStyle = s.color || '#fff';
    ctx.fillStyle = s.color || '#fff';
    ctx.lineWidth = s.sw || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(s.dash && s.dash !== '0' ? String(s.dash).split(',').map(Number) : []);

    switch (s.type) {
      case 'webgl-image': {
        window.__magicPaintPreviewImageCache ||= {};
        let img = window.__magicPaintPreviewImageCache[s.src];
        if (!img) {
          img = new Image();
          img.src = s.src;
          window.__magicPaintPreviewImageCache[s.src] = img;
        }
        ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
        ctx.rotate((s.rot || 0) * Math.PI / 180);
        if (img.complete && img.naturalWidth) {
          ctx.drawImage(img, -s.w / 2, -s.h / 2, s.w, s.h);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,.08)';
          ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
          ctx.strokeStyle = 'rgba(255,255,255,.35)';
          ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
        }
        break;
      }
      case 'rect':
        ctx.translate(s.x + s.w/2, s.y + s.h/2);
        ctx.rotate((s.rot || 0) * Math.PI / 180);
        roundRect(-s.w/2, -s.h/2, s.w, s.h, s.rr || 0);
        if (s.fill) ctx.fill();
        ctx.stroke();
        break;
      case 'circle':
        ctx.beginPath();
        ctx.ellipse(s.cx, s.cy, s.rx, s.ry, (s.rot || 0) * Math.PI / 180, 0, Math.PI * 2);
        if (s.fill) ctx.fill();
        ctx.stroke();
        break;
      case 'triangle': {
        const scX = s.scaleX || 1, scY = s.scaleY || 1;
        ctx.translate(s.cx, s.cy);
        ctx.scale(scX, scY);
        ctx.rotate(((s.rot || 0) - 90) * Math.PI / 180);
        const p = polyPts(0, 0, s.r, 3, 0);
        ctx.beginPath();
        ctx.moveTo(p[0].x, p[0].y);
        p.forEach(q => ctx.lineTo(q.x, q.y));
        ctx.closePath();
        if (s.fill) ctx.fill();
        ctx.stroke();
        break;
      }
      case 'polygon': {
        const scX = s.scaleX || 1, scY = s.scaleY || 1;
        ctx.translate(s.cx, s.cy);
        ctx.scale(scX, scY);
        ctx.rotate((s.rot || 0) * Math.PI / 180);
        const p = polyPts(0, 0, s.r, s.sides || 6, 0);
        ctx.beginPath();
        ctx.moveTo(p[0].x, p[0].y);
        p.forEach(q => ctx.lineTo(q.x, q.y));
        ctx.closePath();
        if (s.fill) ctx.fill();
        ctx.stroke();
        break;
      }
      case 'line':
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        break;
      case 'pen':
      case 'brush':
        if (!s.pts || s.pts.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(s.pts[0].x, s.pts[0].y);
        s.pts.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
        break;
      case 'mod-brush': {
        const brush = previewBrushes[s.brushId];

        if (brush && s.pts && s.pts.length > 1) {
          brush(ctx, s.pts, s);
        }

        break;
      }

    default: {
      const renderer = previewRenderers[s.type];

      if (renderer) {
        renderer(ctx, s);
      }
      break;
    }
  }

  ctx.restore();

  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, Math.abs(w)/2, Math.abs(h)/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y);
    ctx.closePath();
  }

  function applyPreviewAnimationTransform(owner, center, localTime, progress) {
    const kfP = interpKF(owner.keyframes, localTime);
    const pathProgress = getPathProgressForTime(owner, localTime, progress);
    const pos = getPathPos(pathProgress ?? progress, owner.animPath || null);
    const pathDx = pos && owner.animPath && owner.animPath[0] ? pos.x - owner.animPath[0].x : 0;
    const pathDy = pos && owner.animPath && owner.animPath[0] ? pos.y - owner.animPath[0].y : 0;
    const useKfPosition = !(owner.animPath && owner.animPath.length > 1);
    const kfDx = useKfPosition && kfP && Number.isFinite(kfP.x) ? kfP.x - center.x : 0;
    const kfDy = useKfPosition && kfP && Number.isFinite(kfP.y) ? kfP.y - center.y : 0;
    const dx = pathDx + kfDx;
    const dy = pathDy + kfDy;

    if (dx || dy) {
      ctx.translate(dx, dy);
    }

    const kfRot = kfP && Number.isFinite(Number(kfP.rot)) ? Number(kfP.rot) : null;
    if (kfRot !== null) {
      ctx.translate(center.x, center.y);
      ctx.rotate(((kfRot - (owner.rot || 0)) * Math.PI) / 180);
      ctx.translate(-center.x, -center.y);
    }

    if (owner.autoRotate) {
      ctx.translate(center.x, center.y);
      ctx.rotate(owner.autoRotate * localTime * Math.PI / 180);
      ctx.translate(-center.x, -center.y);
    }

    return kfP;
  }

  function drawPreviewAnimatedShape(s, kfP = null) {
    if (!kfP) {
      drawShape(s);
      return;
    }

    const kfOpa = Number(kfP.opa);
    drawShape({
      ...s,
      opa: Number.isFinite(kfOpa) ? kfOpa : s.opa,
      color: kfP.color || s.color
    });
  }

  function drawPreviewAnimatedScene(localTime, progress) {
    const drawnGroups = new Set();

    for (const raw of data.shapes) {
      const s = JSON.parse(JSON.stringify(raw));
      if (s.hidden) continue;

      if (s.groupId) {
        if (drawnGroups.has(s.groupId)) continue;
        drawnGroups.add(s.groupId);

        const members = getGroupMembers(s.groupId).map(m => JSON.parse(JSON.stringify(m)));
        const owner = getGroupAnimationOwner(s.groupId);
        const b = getGroupBounds(s.groupId);
        if (!members.length || !owner || !b) continue;

        const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        ctx.save();
        const kfP = applyPreviewAnimationTransform(owner, center, localTime, progress);
        members.forEach(member => drawPreviewAnimatedShape(member, kfP));
        ctx.restore();
        continue;
      }

      const center = getCenter(s);
      ctx.save();
      const kfP = applyPreviewAnimationTransform(s, center, localTime, progress);
      drawPreviewAnimatedShape(s, kfP);
      ctx.restore();
    }
  }

  function render(now) {
  const frameInterval = 1000 / (data.fps || 24);
    if (now - lastPreviewDraw < frameInterval) {
      requestAnimationFrame(render);
      return;
    }

lastPreviewDraw = now;
    const elapsed = playing ? (now - start) / 1000 : pauseAt;
    const localTime = data.looping ? (elapsed % data.totalDur) : Math.min(elapsed, data.totalDur);
    const t = data.totalDur > 0 ? localTime / data.totalDur : 0;

    ctx.clearRect(0, 0, data.width, data.height);
    ctx.fillStyle = data.bg;
    ctx.fillRect(0, 0, data.width, data.height);

    drawPreviewAnimatedScene(localTime, t);

    document.getElementById('time').textContent = localTime.toFixed(2) + 's';
    requestAnimationFrame(render);
  }
  document.getElementById('play').onclick = () => {
  playing = !playing;

  if (playing) {
    start = performance.now() - pauseAt * 1000;
    document.getElementById('play').textContent = '停止';
  } else {
    pauseAt = (performance.now() - start) / 1000;
    document.getElementById('play').textContent = '再生';
    }
  };

  document.getElementById('restart').onclick = () => {
    start = performance.now();
    pauseAt = 0;
    playing = true;
    document.getElementById('play').textContent = '停止';
  };

  requestAnimationFrame(render);
  </script>
  </body>
  </html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'animation.html';
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('ti-file-export', 'HTMLを書き出しました');
    return;
  }
  const win = window.open(url, 'mlc-preview',
    `width=${Math.min(cv.width + 60, 1400)},height=${Math.min(cv.height + 110, 900)}`);
  if (!win) toast('ti-alert-triangle', 'ポップアップをブロックされました');
  else setTimeout(() => URL.revokeObjectURL(url), 5000);
}


function exportHTML() {
  closeFileMenu();

  openPreview(true);
}
window.exportHTML = exportHTML;

function exportJS() {
  closeFileMenu();
  const lines = shapes.map((s, i) => {
    const path = s.animPath;
    if (!path || path.length < 2) return '';
    const cleanPath = path.filter((p, idx, arr) => {
      if (idx === 0) return true;

      const prev = arr[idx - 1];

      return Math.hypot(
        p.x - prev.x,
        p.y - prev.y
      ) > 4;
    });

    const cornerPath = cleanPath.filter((p, idx, arr) => {
      if (idx === 0 || idx === arr.length - 1) return true;

      const a = arr[idx - 1];
      const b = p;
      const c = arr[idx + 1];

      const dx1 = Math.sign(b.x - a.x);
      const dy1 = Math.sign(b.y - a.y);

      const dx2 = Math.sign(c.x - b.x);
      const dy2 = Math.sign(c.y - b.y);

      return dx1 !== dx2 || dy1 !== dy2;
    });

    const pts = cornerPath
      .map(p => `{x:${Math.round(p.x)},y:${Math.round(p.y)}}`)
      .join(',')
  });
  const code = `gsap.registerPlugin(MotionPathPlugin);\n${lines || '// パスを設定してください'}`;
  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'animation.js'; a.click();
  URL.revokeObjectURL(url);
  toast('ti-code', 'JSを書き出しました');
}

// ツールバーボタン
document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('redo-btn').addEventListener('click', redo);
document.getElementById('del-btn').addEventListener('click', deleteSelected);

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

// ── 初期化 ───────────────────────────────────────────────────
setColor('#3B8AE6');
setStatus('準備完了');
initJSEditor();
setTimeout(() => { initRuler(); initTimelineResize(); setJsEditorHeightVariable(); }, 50);

// ══════════════════════════════════════════════════════════════
// JSエディタ
// ══════════════════════════════════════════════════════════════
let jeCollapsed = false;

function updateEditorRunButtonVisibility() {
  const codeEl = document.getElementById('je-code');
  const runBtn = document.getElementById('je-run-btn');
  if (!runBtn) return;
  const manual = codeEl?.dataset.manual === '1';
  runBtn.classList.toggle('hidden', !manual);
  runBtn.title = manual
    ? '手書きJSを実行 Ctrl+Enter'
    : '通常の再生はタイムライン左の再生ボタンを使います';
}

function initJSEditor() {
  const panel = document.getElementById('js-editor-panel');
  const tl = document.getElementById('timeline');
  const genBtn = document.getElementById('je-gen-btn');
  const runBtn = document.getElementById('je-run-btn');
  const togBtn = document.getElementById('je-toggle-btn');
  const codeEl = document.getElementById('je-code');
  const consoleEl = document.getElementById('je-console');
  // 開閉
  togBtn.addEventListener('click', () => {
    jeCollapsed = !jeCollapsed;
    panel.classList.toggle('collapsed', jeCollapsed);
    tl.classList.toggle('editor-collapsed', jeCollapsed);
    setJsEditorHeightVariable();
    togBtn.querySelector('i').className = jeCollapsed
      ? 'ti ti-chevron-up' : 'ti ti-chevron-down';
  });

  // コード生成
  genBtn.addEventListener('click', () => {
    if (_jeSvg) {
      _jeSvg.remove();
      _jeSvg = null;
    }

    redraw();

    codeEl.value = generateEditorCode();
    codeEl.dataset.manual = '0';
    updateEditorRunButtonVisibility();
    jeLog('コードを生成しました', 'ok');
  });

  // 実行（Ctrl+Enter / Cmd+Enter）
  runBtn.title = '手書きJSを実行 Ctrl+Enter';
  runBtn.addEventListener('click', runEditorCode);
  codeEl.addEventListener('input', () => {
    codeEl.dataset.manual = '1';
    updateEditorRunButtonVisibility();
  });

  codeEl.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runEditorCode();
    }
    // Tab キーでインデント
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = codeEl.selectionStart;
      const v = codeEl.value;
      codeEl.value = v.slice(0, s) + '  ' + v.slice(s);
      codeEl.selectionStart = codeEl.selectionEnd = s + 2;
    }
  });

  // 初期コードを生成
  codeEl.value = generateEditorCode();
  codeEl.dataset.manual = '0';
  updateEditorRunButtonVisibility();

  // SVGオーバーレイは実行時のみ作成（初期化時は不要）
}

function safeCssIdent(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^([^a-zA-Z_-])/, '_$1');
}

function getEditorAnimationItems() {
  const items = [];
  const seenGroups = new Set();

  shapes.forEach((s, i) => {
    if (s.groupId) {
      if (seenGroups.has(s.groupId)) return;
      seenGroups.add(s.groupId);

      const owner = getGroupAnimationOwner(s.groupId, false) || getGroupAnimationOwner(s.groupId, true);
      const b = getGroupBounds(s.groupId);
      if (!owner || !b) return;

      items.push({
        shape: owner,
        index: Math.max(0, shapes.indexOf(owner)),
        selector: '.g-' + safeCssIdent(s.groupId),
        label: 'グループ',
        center: { x: b.x + b.w / 2, y: b.y + b.h / 2 }
      });
      return;
    }

    items.push({
      shape: s,
      index: i,
      selector: '.s' + i,
      label: s.name || s.type,
      center: getCenter(s)
    });
  });

  return items;
}

function generateEditorCode() {
  // 現在のシーンからGSAPコードを生成
  const ease = 'power2.inOut';
  const loopVal = looping ? -1 : 0;

  const lines = ['gsap.registerPlugin(MotionPathPlugin);\n'];

  getEditorAnimationItems().forEach(item => {
    const s = item.shape;
    const sel = item.selector;
    const ctr = item.center;
    const anims = [];

    // パスアニメーション
    if (s.animPath && s.animPath.length > 1) {
      const pts = s.animPath
        .filter((p, idx, arr) => {
          if (idx === 0 || idx === arr.length - 1) return true;

          const prev = arr[idx - 1];
          return Math.hypot(p.x - prev.x, p.y - prev.y) > 4;
        })
        .map(p => '{x:' + Math.round(p.x) + ',y:' + Math.round(p.y) + '}')
        .join(', ');
      const range = getPathTimeRange(s);
      const pathTl = 'pathTl' + item.index;
      anims.push(
        'const ' + pathTl + ' = gsap.timeline({ repeat: ' + loopVal + ' });\n' +
        pathTl + ".to('" + sel + "', {\n" +
        '  duration: ' + Math.max(0.01, range.end - range.start).toFixed(2) + ',\n' +
        "  ease: '" + ease + "',\n" +
        '  motionPath: { path: [' + pts + '], autoRotate: false, curviness: 0, alignOrigin: [0.5, 0.5]}\n' +
        '}, ' + range.start.toFixed(2) + ');\n' +
        pathTl + ".set('" + sel + "', { immediateRender: false }, " + totalDur.toFixed(2) + ');'
      );
    }

    // キーフレーム
    const kfs = s.keyframes || [];
    if (kfs.length >= 1) {
      const sorted = [...kfs].sort((a, b) => a.t - b.t);
      const tlName = 'kfTl' + item.index;
      const motionPathBase = 'autoRotate: false, curviness: 0, alignOrigin: [0.5, 0.5]';
      const propsFor = k => {
        const props = [];
        const opa = Number(k.props.opa);
        const rot = Number(k.props.rot);
        if (Number.isFinite(opa)) props.push('opacity: ' + (opa / 100).toFixed(2));
        if (Number.isFinite(rot)) props.push('rotation: ' + rot.toFixed(2));
        props.push("transformOrigin: '50% 50%'");
        props.push("svgOrigin: '" + Math.round(ctr.x) + ' ' + Math.round(ctr.y) + "'");
        return props;
      };
      const pointFor = k => {
        const x = Number(k.props.x);
        const y = Number(k.props.y);
        return Number.isFinite(x) && Number.isFinite(y)
          ? '{x:' + Math.round(x) + ',y:' + Math.round(y) + '}'
          : null;
      };
      const propsText = props => props.filter(Boolean).join(', ');
      const firstPt = pointFor(sorted[0]);
      const firstProps = propsFor(sorted[0]);
      firstProps.push('immediateRender: false');
      if (firstPt && !(s.animPath && s.animPath.length > 1)) {
        firstProps.push('motionPath: { path: [' + firstPt + ',' + firstPt + '], ' + motionPathBase + ' }');
      }
      const firstAt = Math.max(0, sorted[0].t).toFixed(2);
      let code = 'const ' + tlName + ' = gsap.timeline({ repeat: ' + loopVal + ' });\n' +
        tlName + ".set('" + sel + "', { " + propsText(firstProps) + ' }, ' + firstAt + ');';
      for (let i = 1; i < sorted.length; i++) {
        const dur = Math.max(0, sorted[i].t - sorted[i - 1].t).toFixed(2);
        const at = Math.max(0, sorted[i - 1].t).toFixed(2);
        const fromPt = pointFor(sorted[i - 1]);
        const toPt = pointFor(sorted[i]);
        const segProps = [
          'duration: ' + dur,
          "ease: '" + ease + "'",
          ...propsFor(sorted[i])
        ];
        if (fromPt && toPt && !(s.animPath && s.animPath.length > 1)) {
          segProps.push('motionPath: { path: [' + fromPt + ',' + toPt + '], ' + motionPathBase + ' }');
        }
        code += '\n' + tlName + ".to('" + sel + "', { " + propsText(segProps) + ' }, ' + at + ');';
      }
      code += '\n' + tlName + ".set('" + sel + "', { immediateRender: false }, " + totalDur.toFixed(2) + ');';
      anims.push(code);
    }

    // 自動回転
    if (s.autoRotate && s.autoRotate !== 0) {
      const ox = Math.round(ctr.x), oy = Math.round(ctr.y);
      anims.push(
        "gsap.to('" + sel + "', {\n" +
        '  rotation: ' + (s.autoRotate > 0 ? 360 : -360) + ',\n' +
        '  duration: ' + Math.abs(360 / s.autoRotate).toFixed(1) + ',\n' +
        '  repeat: -1,\n' +
        "  ease: 'none',\n" +
        "  transformOrigin: '50% 50%',\n" +
        "  svgOrigin: '" + ox + ' ' + oy + "'\n" +
        '});'
      );
    }

    if (anims.length > 0) {
      lines.push('// ' + item.label + ' (index ' + item.index + ')');
      lines.push(...anims);
      lines.push('');
    }
  });

  if (lines.length === 1) {
    lines.push('// 図形にパスやキーフレームを設定するとコードが生成されます');
    lines.push("// 例: gsap.to('.s0', { duration: 2, x: 200, rotation: 360, repeat: -1 })");
  }

  return lines.join('\n');
}

// GSAPをキャンバス上で使うためのオーバーレイSVG
let _jeSvg = null;

function ensureJeSvg() {
  if (_jeSvg) return _jeSvg;
  // 実際のキャンバス領域(cv-wrap)に SVG オーバーレイを重ねる。
  // 定規表示中でも canvas と SVG がずれず、二重表示に見えないようにする。
  const wrap = document.getElementById('cv-wrap') || area;
  _jeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  _jeSvg.id = 'je-svg-overlay';
  _jeSvg.style.cssText =
    'position:absolute;top:0;left:0;pointer-events:none;z-index:1;';
  wrap.appendChild(_jeSvg);
  return _jeSvg;
}

function syncJeSvg() {
  // canvas のサイズに合わせる
  const svg = ensureJeSvg();
  svg.setAttribute('width', cv.width);
  svg.setAttribute('height', cv.height);
  svg.setAttribute('viewBox', `0 0 ${cv.width} ${cv.height}`);
  // 現在の図形をSVGに反映
  svg.innerHTML = buildSVGContent();
}

function runEditorCode() {
  refreshEditorCodeIfAuto();
  const codeEl = document.getElementById('je-code');
  const code = codeEl.value.trim();

  if (shouldRunEditorAsCanvas()) {
    if (animating) {
      stopAnim();
      jeLog('キャンバス再生を停止しました', 'warn');
      return;
    }
    runSceneOnCanvasFromEditor();
    return;
  }

  if (!code) return;

  // 手書きJSの実行前に既存アニメ・SVGを停止・削除
  if (typeof gsap !== 'undefined') {
    try {
      gsap.globalTimeline.clear();
      gsap.globalTimeline.resume();
      gsap.globalTimeline.paused(false);
    } catch (e) { }
  }
  stopAnim();
  // 既存SVGを削除してから新規作成
  if (_jeSvg) { _jeSvg.remove(); _jeSvg = null; }
  syncJeSvg();
  clearCanvasForSvgOverlay();

  jeLog('実行中...', 'warn');

  try {
    // GSAP が未ロードなら動的に読み込む
    if (typeof gsap === 'undefined') {
      jeLog('GSAPを読み込み中...', 'warn');
      loadGSAP(() => {

        if (typeof gsap !== 'undefined') {
          gsap.ticker.fps(FPS || 24);
        }

        executeCode(code);

      });
    } else {
      if (typeof gsap !== 'undefined') {
        gsap.ticker.fps(FPS || 24);
      }

      executeCode(code);
    }
  } catch (e) {
    jeLog('✗ ' + e.message, 'error');
  }
}

function executeCode(code) {
  try {
    if (typeof gsap !== 'undefined') {
      gsap.globalTimeline.resume();
      gsap.globalTimeline.paused(false);
    }
    // Function コンストラクタで安全に実行
    const fn = new Function('gsap', 'MotionPathPlugin', code);
    fn(gsap, typeof MotionPathPlugin !== 'undefined' ? MotionPathPlugin : null);
    jeLog('✓ 実行完了', 'ok');
  } catch (e) {
    jeLog('✗ ' + e.message, 'error');
    console.error(e);
  }
}

function loadGSAP(callback) {
  const s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
  s1.onload = () => {
    const s2 = document.createElement('script');
    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/MotionPathPlugin.min.js';
    s2.onload = () => {
      gsap.registerPlugin(MotionPathPlugin);
      jeLog('✓ GSAP 読み込み完了', 'ok');
      callback();
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

function stopJeAnim() {
  if (typeof gsap !== 'undefined') {
    try {
      gsap.globalTimeline.clear();
      gsap.globalTimeline.resume();
      gsap.globalTimeline.paused(false);
    } catch (e) { }
  }
  // SVGオーバーレイを必ず削除
  if (_jeSvg) { _jeSvg.remove(); _jeSvg = null; }
  redraw(); // キャンバスを再描画してSVG残像を消す
}

function clearCanvasForSvgOverlay() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = canvasBg;
  ctx.fillRect(0, 0, cv.width, cv.height);
}

function buildShapeSVGElement(s, i, origin = { x: 0, y: 0 }) {
  if (s.hidden) return '';

  const cls = 's' + i;
  const c = s.color, sw2 = s.sw || 2, op = (s.opa || 100) / 100;
  const fi = s.fill ? c : 'none';
  const dd = s.dash && s.dash !== '0' ? 'stroke-dasharray="' + s.dash + '"' : '';
  const ctr = getCenter(s);
  const cx = Math.round(ctr.x), cy = Math.round(ctr.y);

  if (s.type === 'brush' && s.snap) {
    try {
      const dataUrl = s.snap.toDataURL('image/png');
      return '<image class="' + cls + '" href="' + dataUrl + '" x="' + (-Math.round(origin.x)) + '" y="' + (-Math.round(origin.y)) + '" width="' + s.snap.width + '" height="' + s.snap.height + '" opacity="' + op + '"/>';
    } catch { return ''; }
  }

  let inner = '';

  if (s.type === 'rect') {
    const hw = s.w / 2, hh = s.h / 2;
    inner = '<rect x="' + Math.round(-hw) + '" y="' + Math.round(-hh) + '" width="' + Math.round(s.w) + '" height="' + Math.round(s.h) + '" rx="' + (s.rr || 0) + '" fill="' + fi + '" stroke="' + c + '" stroke-width="' + sw2 + '" ' + dd + '/>';
  } else if (s.type === 'circle') {
    inner = '<ellipse cx="0" cy="0" rx="' + Math.round(s.rx) + '" ry="' + Math.round(s.ry) + '" fill="' + fi + '" stroke="' + c + '" stroke-width="' + sw2 + '"/>';
  } else if (s.type === 'triangle' || s.type === 'polygon') {
    const n = s.type === 'triangle' ? 3 : (s.sides || 6);
    const sx2 = s.scaleX || 1, sy2 = s.scaleY || 1;
    const a0 = s.type === 'triangle'
      ? ((s.rot || 0) - 90) * Math.PI / 180 : (s.rot || 0) * Math.PI / 180;
    const pts = Array.from({ length: n }, (_, k) => {
      const a = a0 + k * 2 * Math.PI / n;
      return Math.round(s.r * Math.cos(a) * sx2) + ',' + Math.round(s.r * Math.sin(a) * sy2);
    }).join(' ');
    inner = '<polygon points="' + pts + '" fill="' + fi + '" stroke="' + c + '" stroke-width="' + sw2 + '" ' + dd + '/>';
  } else if (s.type === 'line') {
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    inner = '<line x1="' + Math.round(s.x1 - mx) + '" y1="' + Math.round(s.y1 - my) + '" x2="' + Math.round(s.x2 - mx) + '" y2="' + Math.round(s.y2 - my) + '" stroke="' + c + '" stroke-width="' + sw2 + '" ' + dd + '/>';
  } else if (s.type === 'pen' && s.pts && s.pts.length > 1) {
    const d = s.pts.map((p, j) => (j === 0 ? 'M' : 'L') + Math.round(p.x - cx) + ',' + Math.round(p.y - cy)).join(' ');
    inner = '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + sw2 + '" stroke-linecap="round" ' + dd + '/>';
  } else if (s.type === 'mod-brush') {
    const brush = window.AnimationApp?.customBrushes?.[s.brushId];
    if (brush?.toSVG) inner = brush.toSVG(s);
  } else {
    const renderer = window.AnimationApp?.customRenderers?.[s.type];
    if (renderer?.toSVG) inner = renderer.toSVG(s);
  }

  if (!inner) return '';

  return '<g class="' + cls + '" transform="translate(' + Math.round(cx - origin.x) + ',' + Math.round(cy - origin.y) + ')" opacity="' + op + '">' + inner + '</g>';
}

function buildSVGContent() {
  const out = [];
  const drawnGroups = new Set();

  shapes.forEach((s, i) => {
    if (s.hidden) return;

    if (s.groupId) {
      if (drawnGroups.has(s.groupId)) return;
      drawnGroups.add(s.groupId);

      const b = getGroupBounds(s.groupId);
      if (!b) return;

      const origin = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const children = getGroupMembers(s.groupId)
        .map(member => buildShapeSVGElement(member, shapes.indexOf(member), origin))
        .filter(Boolean)
        .join('\n    ');

      if (children) {
        out.push('<g class="g-' + safeCssIdent(s.groupId) + '" transform="translate(' + Math.round(origin.x) + ',' + Math.round(origin.y) + ')">' + children + '</g>');
      }
      return;
    }

    out.push(buildShapeSVGElement(s, i));
  });

  return out.filter(Boolean).join('\n  ');
}

function jeLog(msg, type = 'log') {
  const el = document.getElementById('je-console');
  if (!el) return;
  const line = document.createElement('div');
  line.className = `je-log ${type}`;
  const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  line.textContent = `[${time}] ${msg}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

// shapes が変わったらコードを自動更新
const _origSyncAll = syncAll;
// syncAll は既に定義済みなので、上書きせずに initJSEditor で処理


// ══════════════════════════════════════════════════════════════
// 定規 + ガイドライン + 座標表示 + まっすぐ引きツール
// ══════════════════════════════════════════════════════════════
const RULER_SZ = 20;
let rulerVisible = true;
let guides = [];
let draggingGuide = null;
let straightMode = false;   // Shift押しで有効（まっすぐ引き）
let snapBase = null;    // Shiftを押した瞬間の座標
let rulerInitDone = false;

// ── 定規 ON/OFF ───────────────────────────────────────────────
function toggleRuler() {
  rulerVisible = !rulerVisible;
  area.classList.toggle('no-ruler', !rulerVisible);
  const btn = document.getElementById('ruler-toggle-btn');
  if (btn) btn.style.color = rulerVisible ? 'var(--accent)' : '';
  setTimeout(() => { resizeCanvas(); drawRulers(); }, 50);
}

// ── 目盛り描画 ────────────────────────────────────────────────
function drawRulers() {
  if (!rulerVisible) return;
  const rh = document.getElementById('ruler-h');
  const rv = document.getElementById('ruler-v');
  if (!rh || !rv) return;

  const W = cv.width, H = cv.height;
  rh.width = W; rh.height = RULER_SZ;
  rv.width = RULER_SZ; rv.height = H;

  const rc = rh.getContext('2d');
  const vc = rv.getContext('2d');
  const step = W < 400 ? 10 : W < 1000 ? 20 : 50;

  // 水平定規
  rc.fillStyle = '#181818';
  rc.fillRect(0, 0, W, RULER_SZ);
  for (let x = 0; x <= W; x += step) {
    const major = x % (step * 5) === 0;
    rc.fillStyle = major ? '#777' : '#444';
    rc.fillRect(x, RULER_SZ - (major ? 10 : 5), 1, major ? 10 : 5);
    if (major && x > 0) {
      rc.fillStyle = '#666';
      rc.font = '8px monospace';
      rc.textBaseline = 'top';
      rc.fillText(x, x + 2, 2);
    }
  }

  // 垂直定規
  vc.fillStyle = '#181818';
  vc.fillRect(0, 0, RULER_SZ, H);
  for (let y = 0; y <= H; y += step) {
    const major = y % (step * 5) === 0;
    vc.fillStyle = major ? '#777' : '#444';
    vc.fillRect(RULER_SZ - (major ? 10 : 5), y, major ? 10 : 5, 1);
    if (major && y > 0) {
      vc.save();
      vc.fillStyle = '#666';
      vc.font = '8px monospace';
      vc.textBaseline = 'top';
      vc.translate(RULER_SZ - 2, y - 1);
      vc.rotate(-Math.PI / 2);
      vc.fillText(y, 0, 0);
      vc.restore();
    }
  }

  // 選択図形ハイライト
  if (selected) {
    const b = getBounds(selected);
    rc.fillStyle = 'rgba(59,138,230,0.35)';
    rc.fillRect(b.x, 0, b.w, RULER_SZ);
    vc.fillStyle = 'rgba(59,138,230,0.35)';
    vc.fillRect(0, b.y, RULER_SZ, b.h);
  }
}

function drawRulerCrosshair(mx, my) {
  if (!rulerVisible) return;
  drawRulers();
  const rh = document.getElementById('ruler-h');
  const rv = document.getElementById('ruler-v');
  if (!rh || !rv) return;
  const rc = rh.getContext('2d');
  const vc = rv.getContext('2d');
  rc.fillStyle = 'rgba(255,80,80,0.85)';
  rc.fillRect(mx - 0.5, 0, 1, RULER_SZ);
  vc.fillStyle = 'rgba(255,80,80,0.85)';
  vc.fillRect(0, my - 0.5, RULER_SZ, 1);
}

// ── ガイドライン ──────────────────────────────────────────────
function renderGuides() {
  const wrap = document.getElementById('cv-wrap') || area;
  wrap.querySelectorAll('.guide-h, .guide-v').forEach(e => e.remove());
  guides.forEach((g, idx) => {
    const el = document.createElement('div');
    el.className = g.type === 'h' ? 'guide-h' : 'guide-v';
    el.style[g.type === 'h' ? 'top' : 'left'] = g.pos + 'px';
    el.addEventListener('dblclick', () => {
      guides.splice(idx, 1); renderGuides();
    });
    el.addEventListener('mousedown', e => {
      e.stopPropagation(); draggingGuide = g;
    });
    wrap.appendChild(el);
  });
}

// ── 座標ツールチップ ──────────────────────────────────────────
let coordsTip = null;

function showCoordsTip(x, y) {
  if (!coordsTip) {
    coordsTip = document.createElement('div');
    coordsTip.id = 'coords-tip';
    const wrap = document.getElementById('cv-wrap') || area;
    wrap.appendChild(coordsTip);
  }
  const b = selected ? getBounds(selected) : null;
  coordsTip.textContent = b
    ? `x:${Math.round(x)} y:${Math.round(y)}  |  ${selected.name} ${Math.round(b.w)}×${Math.round(b.h)}`
    : `x:${Math.round(x)} y:${Math.round(y)}`;
  coordsTip.style.display = 'block';
  coordsTip.style.left = (x + RULER_SZ + 10) + 'px';
  coordsTip.style.top = (y + RULER_SZ + 4) + 'px';
}

function hideCoordsTip() {
  if (coordsTip) coordsTip.style.display = 'none';
}

// ── まっすぐ引き（Shift キー）─────────────────────────────────
// mousemove で Shift が押されていたら x か y を固定する
function applyStrightSnap(x, y, ox, oy) {
  // 常に呼び出し側でstraightModeを確認するのでここでは無条件にスナップ
  const dx = Math.abs(x - ox), dy = Math.abs(y - oy);
  if (dx >= dy) return { x, y: oy };  // 水平（Y固定）
  else return { x: ox, y };  // 垂直（X固定）
}

// ── 初期化（一度だけ）────────────────────────────────────────
function initRuler() {
  if (rulerInitDone) return;
  rulerInitDone = true;

  const rh = document.getElementById('ruler-h');
  const rv = document.getElementById('ruler-v');
  if (!rh || !rv) return;

  // 水平定規ドラッグ → 水平ガイド
  rh.style.pointerEvents = 'auto';
  rh.style.cursor = 's-resize';
  rh.addEventListener('mousedown', e => {
    const wrap = document.getElementById('cv-wrap') || area;
    const r = wrap.getBoundingClientRect();
    const g = { type: 'h', pos: e.clientY - r.top };
    guides.push(g); draggingGuide = g; renderGuides();
  });

  // 垂直定規ドラッグ → 垂直ガイド
  rv.style.pointerEvents = 'auto';
  rv.style.cursor = 'e-resize';
  rv.addEventListener('mousedown', e => {
    const wrap = document.getElementById('cv-wrap') || area;
    const r = wrap.getBoundingClientRect();
    const g = { type: 'v', pos: e.clientX - r.left };
    guides.push(g); draggingGuide = g; renderGuides();
  });

  // ガイドのドラッグ移動（document に一度だけ登録）
  document.addEventListener('mousemove', e => {
    if (!draggingGuide) return;
    const wrap = document.getElementById('cv-wrap') || area;
    const r = wrap.getBoundingClientRect();
    draggingGuide.pos = draggingGuide.type === 'h'
      ? e.clientY - r.top
      : e.clientX - r.left;
    renderGuides();
  });
  document.addEventListener('mouseup', () => {
    if (!draggingGuide) return;
    const g = draggingGuide;
    if (g.pos < 0 ||
      (g.type === 'h' && g.pos > cv.height) ||
      (g.type === 'v' && g.pos > cv.width)) {
      guides = guides.filter(x => x !== g);
      renderGuides();
    }
    draggingGuide = null;
  });

  // Shift キーは bindCopyPaste に移動

  // マウス移動: 座標表示 + クロスライン
  cv.addEventListener('mousemove', e => {
    const { x, y } = canvasCoords(e);
    showCoordsTip(x, y);
    drawRulerCrosshair(x, y);
  });
  cv.addEventListener('mouseleave', () => {
    hideCoordsTip();
    drawRulers();
  });

  drawRulers();
}

// まっすぐ引きを mousemove に適用
// → canvas の mousemove の中で ghost 描画時に使う
// ghostX/ghostY を snap 後の値に上書きする仕組み


// ── File menu helpers ───────────────────────────────────────
function toggleFileMenu() {
  document.getElementById('file-menu')?.classList.toggle('open');
}
function closeFileMenu() {
  document.getElementById('file-menu')?.classList.remove('open');
}
document.addEventListener('click', e => {
  const wrap = document.getElementById('file-wrap');
  if (wrap && !wrap.contains(e.target)) closeFileMenu();
});


// ══════════════════════════════════════════════════════════════
// タイムライン高さ調整
// ══════════════════════════════════════════════════════════════
function setTimelineHeight(px) {
  const tl = document.getElementById('timeline');
  if (!tl) return;
  const minH = 56;
  const maxH = Math.max(120, Math.floor(window.innerHeight * 0.55));
  const h = Math.max(minH, Math.min(maxH, Math.round(px)));
  document.documentElement.style.setProperty('--timeline-h', h + 'px');
  tl.classList.remove('timeline-collapsed');
  localStorage.setItem('mlcTimelineHeight', String(h));
  setTimeout(() => {
    resizeCanvas();
    drawTimeline();
    if (typeof drawRulers === 'function') drawRulers();
  }, 30);
}

function setTimelineCollapsed(collapsed) {
  const tl = document.getElementById('timeline');
  if (!tl) return;
  tl.classList.toggle('timeline-collapsed', collapsed);
  localStorage.setItem('mlcTimelineCollapsed', collapsed ? '1' : '0');
  setTimeout(() => {
    resizeCanvas();
    drawTimeline();
    if (typeof drawRulers === 'function') drawRulers();
  }, 30);
}

function initTimelineResize() {
  const tl = document.getElementById('timeline');
  const handle = document.getElementById('tl-resize-handle');
  if (!tl || !handle) return;

  const savedH = Number(localStorage.getItem('mlcTimelineHeight') || 170);
  setTimelineHeight(savedH);
  if (localStorage.getItem('mlcTimelineCollapsed') === '1') {
    setTimelineCollapsed(true);
  }

  document.getElementById('tl-size-small')?.addEventListener('click', () => setTimelineHeight(72));
  document.getElementById('tl-size-medium')?.addEventListener('click', () => setTimelineHeight(170));
  document.getElementById('tl-size-large')?.addEventListener('click', () => setTimelineHeight(300));
  document.getElementById('tl-collapse')?.addEventListener('click', () => {
    setTimelineCollapsed(!tl.classList.contains('timeline-collapsed'));
  });

  let dragging = false;
  handle.addEventListener('mousedown', e => {
    dragging = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const editorH = document.getElementById('js-editor-panel')?.classList.contains('collapsed') ? 36 : 220;
    const newH = window.innerHeight - e.clientY - editorH;
    setTimelineHeight(newH);
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  window.addEventListener('resize', () => {
    const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--timeline-h')) || 170;
    setTimelineHeight(current);
  });
}

// JSエディタ開閉時にタイムラインの下マージンも連動
function setJsEditorHeightVariable() {
  const panel = document.getElementById('js-editor-panel');
  const collapsed = panel?.classList.contains('collapsed');
  document.documentElement.style.setProperty('--js-editor-h', collapsed ? '36px' : '220px');
  setTimeout(() => {
    resizeCanvas();
    drawTimeline();
    if (typeof drawRulers === 'function') drawRulers();
  }, 30);
}


// ══════════════════════════════════════════════════════════════
// 追加: グループ化 + FPS変更（既存ボタン処理を壊さない安全版）
// ══════════════════════════════════════════════════════════════
let FPS = Number(localStorage.getItem('mlcFPS') || 24);

function ensureShapeIds() {
  shapes.forEach((s, i) => {
    if (!s.id) s.id = 'shape_' + i + '_' + Math.random().toString(36).slice(2, 8);
  });
}

function selectedGroupMembers() {
  ensureShapeIds();
  const ids = new Set(multiSelected);
  if (selected && selected.id) ids.add(selected.id);
  return shapes.filter(s => ids.has(s.id));
}

function groupSelectedShapes() {
  ensureShapeIds();
  const items = selectedGroupMembers();
  if (items.length < 2) {
    setStatus('Shift+クリックまたは範囲選択で2個以上選択してください');
    return;
  }
  const gid = 'group_' + Math.random().toString(36).slice(2, 8);
  items.forEach(s => s.groupId = gid);
  setStatus(items.length + '個をグループ化');
  syncAll();
}

function ungroupSelectedShapes() {
  const items = selectedGroupMembers();
  if (!items.length) return;
  items.forEach(s => delete s.groupId);
  setStatus('グループ解除');
  syncAll();
}

function moveGroupMembers(base, dx, dy) {
  if (!base || !base.groupId) return;
  shapes.forEach(s => {
    if (s === base || s.groupId !== base.groupId) return;
    moveShape(s, dx, dy);
  });
}

function moveSelectionMembers(base, dx, dy) {
  if (!base) return;

  ensureShapeIds();
  const moved = new Set([base]);
  const ids = new Set(multiSelected || []);

  shapes.forEach(s => {
    if (s === base || s.hidden || !ids.has(s.id)) return;
    moveShape(s, dx, dy);
    moved.add(s);
  });

  if (!base.groupId) return;

  shapes.forEach(s => {
    if (s === base || s.hidden || s.groupId !== base.groupId || moved.has(s)) return;
    moveShape(s, dx, dy);
  });
}

function drawGroupOutlines() {
  const groups = {};
  shapes.forEach(s => {
    if (!s.groupId || s.hidden) return;
    (groups[s.groupId] ||= []).push(s);
  });

  ctx.save();
  Object.values(groups).forEach(arr => {
    if (arr.length < 2) return;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    arr.forEach(s => {
      const b = getBounds(s);
      x1 = Math.min(x1, b.x);
      y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.w);
      y2 = Math.max(y2, b.y + b.h);
    });
    ctx.strokeStyle = '#55aaff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(x1 - 8, y1 - 8, (x2 - x1) + 16, (y2 - y1) + 16);
  });
  ctx.restore();
}

function initGroupAndFpsControls() {
  const fpsSel = document.getElementById('fps-select');
  if (fpsSel) {
    fpsSel.value = String(FPS);
    fpsSel.addEventListener('change', () => {
      FPS = Number(fpsSel.value || 24);
      localStorage.setItem('mlcFPS', String(FPS));
      setStatus('FPS: ' + FPS);
    });
  }

  document.getElementById('group-btn')?.addEventListener('click', groupSelectedShapes);
  document.getElementById('ungroup-btn')?.addEventListener('click', ungroupSelectedShapes);

  document.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (e.key.toLowerCase() === 'g') {
      e.preventDefault();
      groupSelectedShapes();
    }
    if (e.key.toLowerCase() === 'u') {
      e.preventDefault();
      ungroupSelectedShapes();
    }
  });
}

setTimeout(initGroupAndFpsControls, 80);

//-----------------------5/20追加ここから（MOD Loader）-----------------------
// ══════════════════════════════════════════════════════════════
// MOD Loader Prototype: セキュリティなし
// ══════════════════════════════════════════════════════════════
const LoadedMods = [];

window.AnimationApp = {
  version: '0.1-mod-prototype',

  customRenderers: {},
  customBrushes: {},

  customUIPanels: {
    top: null,
    right: null,
    bottom: null,
    left: null
  },

  registerMod(mod) {
    if (!mod || !mod.id) return;
    if (!LoadedMods.some(m => m.id === mod.id)) LoadedMods.push(mod);
    console.log('[MOD loaded]', mod.id, mod.name || '');
    setStatus(`MOD読み込み: ${mod.name || mod.id}`);
  },

  registerTool(tool) {
    if (!tool || !tool.id || !tool.name) return;

    const panel = document.getElementById('right-panel');
    if (!panel) return;

    const btn = document.createElement('button');
    btn.className = 'rp-btn';
    btn.dataset.modTool = tool.id;
    btn.title = tool.name;
    btn.innerHTML = tool.icon || '★';

    btn.addEventListener('click', () => {
      document.querySelectorAll('.rp-btn[data-mod-tool]').forEach(b => {
        b.classList.remove('active');
      });

      btn.classList.add('active');

      window.AnimationApp.activeModTool = tool;
      setTool('select');
      setStatus(`MODツール: ${tool.name}`);
    });

    panel.appendChild(btn);
  },

  addShape(shape) {
    if (!shape) return;

    saveState();

    shapes.push({
      color,
      sw,
      opa,
      dash,
      fill: doFill,
      keyframes: [],
      hidden: false,
      name: shape.name || 'MOD図形',
      modId: shape.modId || shape.type || null,
      ...shape
    });

    selected = shapes[shapes.length - 1];
    syncAll();
  },

  getSelected() {
    return selected;
  },

  setSelectedPatch(patch) {
    if (!selected || !patch) return;
    Object.assign(selected, patch);
    syncAll();
  },

  registerShapeType(type, renderer) {
    this.customRenderers[type] = renderer;
  },

  registerBrush(brush) {
    this.customBrushes[brush.id] = brush;

    const panel =
      document.getElementById("right-panel") ||
      document.querySelector(".right-panel") ||
      document.querySelector("#tools-panel") ||
      document.querySelector(".tools-panel") ||
      document.querySelector("aside");

    if (!panel) {
      console.warn("MODブラシボタンの追加先が見つかりません");
      return;
    }

    const btn = document.createElement("button");
    btn.className = "rp-btn";
    btn.dataset.modBrush = brush.id;
    btn.title = brush.name;
    btn.innerHTML = brush.icon || "🖌";

    btn.addEventListener("click", () => {
      document.querySelectorAll(".rp-btn[data-mod-tool], .rp-btn[data-mod-brush]").forEach(b => {
        b.classList.remove("active");
      });

      btn.classList.add("active");

      this.activeModBrush = brush;
      this.activeModTool = null;

      setTool("mod-brush");
      setStatus(`MODブラシ: ${brush.name}`);
    });

    panel.appendChild(btn);
  },

  registerUI(ui) {
    if (!ui || !ui.id || !ui.position) return;

    const allowed = ['top', 'right', 'bottom', 'left'];
    if (!allowed.includes(ui.position)) {
      console.warn('Invalid UI position:', ui.position);
      return;
    }

    const target = this.getUIArea(ui.position);
    if (!target) {
      console.warn('UI追加先が見つかりません:', ui.position);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'mod-ui-block';
    wrap.dataset.modUi = ui.id;

    if (ui.title) {
      const title = document.createElement('div');
      title.className = 'mod-ui-title';
      title.textContent = ui.title;
      wrap.appendChild(title);
    }

    if (ui.html) {
      const body = document.createElement('div');
      body.className = 'mod-ui-body';
      body.innerHTML = ui.html;
      wrap.appendChild(body);
    }

    if (typeof ui.render === 'function') {
      ui.render(wrap, this);
    }

    target.appendChild(wrap);

    if (typeof ui.onMount === 'function') {
      ui.onMount(wrap, this);
    }

    return wrap;
  },

  getUIArea(position) {
    switch (position) {
      case 'top':
        return document.getElementById('topbar');

      case 'right':
        return document.getElementById('right-panel');

      case 'bottom':
        return document.getElementById('timeline');

      case 'left':
        return document.getElementById('left-panel');

      default:
        return null;
    }
  },

  getSceneSnapshot() {
    const cleanShapes = JSON.parse(JSON.stringify(shapes, (key, value) => {
      if (key === 'snap' || key === '_orig') return undefined;
      if (typeof value === 'function') return undefined;
      return value;
    }));

    return {
      width: cv.width,
      height: cv.height,
      bg: canvasBg || '#111111',
      totalDur,
      looping,
      fps: (typeof FPS !== 'undefined' ? FPS : 24),
      shapes: cleanShapes
    };
  },


  redraw,
  toast,
  setStatus,
  getBounds,
  getCenter


};


async function loadMods() {
  try {
    const res = await fetch('/api/mods');
    if (!res.ok) throw new Error('MOD API error');

    const mods = await res.json();

    for (const mod of mods) {
      if (!LoadedMods.some(m => m.id === mod.id)) LoadedMods.push(mod);
      if (mod.enabled === false) {
        console.log('[MOD disabled]', mod.id);
        continue;
      }
      for (const href of mod.styles || []) {
        if (document.querySelector(`link[data-mod-style="${href}"]`)) continue;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.modStyle = href;
        document.head.appendChild(link);
      }

      for (const src of mod.scripts || []) {
        if (document.querySelector(`script[data-mod-script="${src}"]`)) continue;

        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = src;
          s.dataset.modScript = src;
          s.onload = resolve;
          s.onerror = reject;
          document.body.appendChild(s);
        });
      }
    }

    setStatus(`MOD ${mods.length}件 読み込み完了`);
  } catch (e) {
    console.warn('[MOD load failed]', e);
    setStatus('MOD読み込み失敗しました');
  }
}

function showModsModal() {
  document.getElementById('mod-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'mod-modal';

  const unique = [];
  for (const m of LoadedMods) {
    if (!unique.some(x => x.id === m.id)) unique.push(m);
  }

  const items = unique.length
    ? unique.map(m => `
    <div class="mod-item">
      <div class="mod-item-title">
        <strong>${escapeHtml(m.name || m.id)}</strong>
        <span class="mod-level">LEVEL ${escapeHtml(String(m.level || 1))}</span>
        <button class="mod-toggle-btn" data-mod-id="${escapeHtml(m.id)}">
          ${m.enabled === false ? 'OFF' : 'ON'}
        </button>
      </div>
      <div class="mod-desc">${escapeHtml(m.description || '説明なし')}</div>
      ${m.error ? `<div class="mod-error">ERROR: ${escapeHtml(m.error)}</div>` : ''}
    </div>
  `).join('')
    : '<div class="mod-desc">現在読み込み済みのMODはありません。MODフォルダを確認してください。</div>';

  modal.innerHTML = `
    <div id="mod-modal-card">
      <div class="mod-modal-head">
        <span><i class="ti ti-puzzle"></i> MOD一覧</span>
        <span class="mod-close" onclick="document.getElementById('mod-modal').remove()">✕</span>
      </div>
      <div class="mod-modal-body">${items}</div>
    </div>
  `;

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
  });

  document.body.appendChild(modal);

  modal.querySelectorAll('.mod-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();

      const id = btn.dataset.modId;
      if (!id) return;

      try {
        const res = await fetch(`/api/mods/${id}/toggle`, {
          method: 'POST'
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'toggle failed');
        }

        setStatus(`${id} を ${data.enabled ? 'ON' : 'OFF'} にしました。再読み込みします`);
        location.reload();

      } catch (err) {
        console.error('[MOD toggle failed]', err);
        setStatus('MOD ON/OFF 失敗');
      }
    });
  });
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

document.getElementById('mods-btn')?.addEventListener('click', showModsModal);
setTimeout(loadMods, 250);
//-----------------------5/20追加ここまで（MOD Loader）-----------------------

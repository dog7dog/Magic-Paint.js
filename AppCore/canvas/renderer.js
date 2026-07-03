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
function redraw() {
  // 必ず clearRect してから背景色で塗る（残像防止）
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = canvasBg;
  ctx.fillRect(0, 0, cv.width, cv.height);

  // レイヤー順に描画（フォルダ・非表示・2D以外はスキップ）
  const normalLayers = layers.filter(l => l.type !== 'folder');
  const layerIds = new Set(normalLayers.map(l => l.id));
  normalLayers.forEach(layer => {
    if (!layerIsVisible(layer)) return;
    shapes.filter(s => (s.layerId || 'layer-1') === layer.id && _is2d(s)).forEach(s => drawShape(s));
  });
  // レイヤーに属さない図形（旧形式やエラーケース）をフォールバック描画
  shapes.filter(s => s.layerId && !layerIds.has(s.layerId) && _is2d(s)).forEach(s => drawShape(s));


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

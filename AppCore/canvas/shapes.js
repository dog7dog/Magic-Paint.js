// ── レイヤー判定 ─────────────────────────────────────────────
function _is2d(s) { return !s.engine || s.engine === 'canvas2d'; }

function _notifyLayerState(layerId, type, value) {
  (window.AnimationApp?._threeRenderers || []).forEach(r => {
    if (type === 'visible') r.onLayerVisibility?.(layerId, value);
    if (type === 'locked')  r.onLayerLock?.(layerId, value);
  });
}

function _notifyObjectHidden(obj, hidden) {
  (window.AnimationApp?._threeRenderers || []).forEach(r => {
    r.onObjectHidden?.(obj.id, hidden, obj);
  });
}

function layerIsVisible(layer) {
  if (!layer || !layer.visible) return false;
  if (layer.parentId) {
    const parent = layers.find(l => l.id === layer.parentId);
    if (parent && !parent.visible) return false;
  }
  return true;
}

function canEditShape(shape) {
  const layer = layers.find(l => l.id === (shape.layerId || 'layer-1'));
  if (!layer) return true;
  if (!layer.visible || layer.locked) return false;
  if (layer.parentId) {
    const parent = layers.find(l => l.id === layer.parentId);
    if (parent && (!parent.visible || parent.locked)) return false;
  }
  return true;
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

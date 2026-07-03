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

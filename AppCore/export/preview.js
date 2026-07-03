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
  if (window.__jeModeHandlers?.[jeMode]?.preview) {
    const code = document.getElementById('je-code')?.value.trim() || '';
    window.__jeModeHandlers[jeMode].preview(code, download);
    return;
  }

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
      default:
        // MOD図形（star等）は cx/cy を中心として持つ規約に合わせる
        if (Number.isFinite(s.cx) && Number.isFinite(s.cy)) return { x: s.cx, y: s.cy };
        return { x: s.x || 0, y: s.y || 0 };
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
      default: {
        // MOD図形（star等）は cx/cy を中心、r を半径として持つ規約に合わせる
        if (Number.isFinite(s.cx) && Number.isFinite(s.cy)) {
          const r = Number.isFinite(s.r) ? s.r : 40;
          const sx = s.scaleX || 1, sy = s.scaleY || 1;
          return { x: s.cx - r * sx, y: s.cy - r * sy, w: r * 2 * sx, h: r * 2 * sy };
        }
        return { x:0,y:0,w:0,h:0 };
      }
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
    const pathStartT = Number(s?.pathStartT);
    const pathStartKf = userKeyframesForShape(s).find(k => k.pathStart || k.kind === 'path-start');
    let start = Number.isFinite(pathStartT)
      ? pathStartT
      : (pathStartKf ? Number(pathStartKf.t) : 0);
    let end = Number.isFinite(Number(s?.pathEndT)) ? Number(s.pathEndT) : data.totalDur;
    start = Math.max(0, Math.min(data.totalDur, start));
    end = Math.max(0, Math.min(data.totalDur, end));
    if (end <= start) {
      if (start >= data.totalDur) start = Math.max(0, data.totalDur - 0.5);
      end = Math.min(data.totalDur, start + 0.5);
    }
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

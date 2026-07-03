tlDurInput.addEventListener('input', () => {
  const v = parseFloat(tlDurInput.value);

  if (!isNaN(v) && v > 0) {
    totalDur = v;
    drawTimeline();
  }
});

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
  const animOwner = getSelectedAnimationOwner();
  const startsPath = Boolean(animOwner?.animPath && animOwner.animPath.length > 1);
  const result = upsertKeyframeAtCurrentTime({}, startsPath ? { kind: 'path-start', pathStart: true } : {});
  if (!result) return;
  const label = startsPath ? 'パス開始KF' : 'KF';
  setStatus((result.existing ? label + '更新: ' : label + '追加: ') + result.t.toFixed(2) + 's');
  toast('ti-diamond', result.t.toFixed(2) + 's に' + label + (result.existing ? '更新' : '追加'));
};
document.getElementById('tl-add-kf')?.addEventListener('click', addKfFn);
document.getElementById('tl-del-kf')?.addEventListener('click', deleteKeyframeAtCurrentTime);

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

// ── タイムラインの高さ/折りたたみ ─────────────────────────────
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
    const newH = window.innerHeight - e.clientY;
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

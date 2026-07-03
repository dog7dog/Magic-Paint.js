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

  const keyframeMeta = {};
  if (options.kind) keyframeMeta.kind = options.kind;
  if (options.pathStart) keyframeMeta.pathStart = true;

  const existing = animOwner.keyframes.find(k => !k.autoHold && Math.abs(k.t - targetT) < 0.01);
  if (existing) {
    existing.props = props;
    delete existing.autoHold;
    if (options.kind) existing.kind = options.kind;
    if (options.pathStart) existing.pathStart = true;
    if (options.kind === 'rotation') delete existing.pathStart;
  } else {
    animOwner.keyframes.push({ t: targetT, props, ...keyframeMeta });
  }
  if (options.pathStart) animOwner.pathStartT = targetT;

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
  const removedPathStart = nearest.k.pathStart || nearest.k.kind === 'path-start' ||
    Math.abs(Number(animOwner.pathStartT) - Number(nearest.k.t)) < 0.01;
  if (removedPathStart) {
    const nextPathStart = userKeyframesForShape(animOwner).find(k => k.pathStart || k.kind === 'path-start');
    if (nextPathStart) animOwner.pathStartT = Number(nextPathStart.t) || 0;
    else delete animOwner.pathStartT;
  }
  cleanupKeyframeHolds(animOwner);
  renderAnimationCanvasFrame(animT);
  syncProps();
  drawTimeline();
  updateCode();
  setStatus('KF削除: ' + Number(nearest.k.t).toFixed(2) + 's');
  toast('ti-diamond-off', Number(nearest.k.t).toFixed(2) + 's のKFを削除');
}

function setRotationKeyframeFromInput() {
  if (!selected) { setStatus('図形を選択してください'); return; }
  const input = document.getElementById('p-anim-rot');
  const valEl = document.getElementById('p-anim-rot-v');
  const durInput = document.getElementById('p-anim-rot-dur');
  const rotVal = Number(input?.value);
  const duration = Number(durInput?.value);

  if (!Number.isFinite(rotVal)) { setStatus('回転角度を入力してください'); return; }
  if (valEl) valEl.textContent = rotVal + '°';

  const animOwner = getSelectedAnimationOwner();
  if (!animOwner) return;

  const startT = parseFloat((animT * totalDur).toFixed(2));
  const dur = Number.isFinite(duration) && duration > 0 ? Math.max(0.05, duration) : 0;

  if (dur > 0) {
    const endT = parseFloat((startT + dur).toFixed(2));
    const startRot = currentRotationForShape(selected);
    const startProps = animationPropsForShapeAtCurrentTime(selected) || animationPropsForShape(selected);

    saveState();
    if (endT > totalDur) {
      totalDur = endT;
      if (tlDurInput) tlDurInput.value = Number.isInteger(totalDur) ? String(totalDur) : totalDur.toFixed(2);
    }

    animOwner.keyframes ||= [];
    animOwner.autoRotate = 0;

    const existingStart = animOwner.keyframes.find(k => !k.autoHold && Math.abs(Number(k.t) - startT) < 0.01);
    if (existingStart) {
      existingStart.props = { ...existingStart.props, rot: startRot };
      delete existingStart.autoHold;
    } else {
      animOwner.keyframes.push({ t: startT, props: { ...(startProps || {}), rot: startRot } });
    }

    const existingEnd = animOwner.keyframes.find(k => !k.autoHold && Math.abs(Number(k.t) - endT) < 0.01);
    if (existingEnd) {
      existingEnd.props = { ...existingEnd.props, rot: rotVal };
      delete existingEnd.autoHold;
    } else {
      animOwner.keyframes.push({ t: endT, props: { ...(startProps || {}), rot: rotVal }, kind: 'rotation' });
    }

    markGroupAnimationOwner(animOwner);
    animOwner.keyframes.sort((a, b) => a.t - b.t);
    renderAnimationCanvasFrame(animT);
    syncProps();
    drawTimeline();
    updateCode();
    setStatus('回転: ' + startT.toFixed(2) + 's から ' + dur.toFixed(2) + '秒 → ' + rotVal + '°');
    toast('ti-rotate-clockwise', startT.toFixed(2) + 's → ' + endT.toFixed(2) + 's (' + rotVal + '°)');
    return;
  }

  // 時間未指定: 現在位置に単独KF追加（従来動作）
  const currentT = startT;
  const firstRotationKf = !hasUserKeyframes(animOwner) && currentT <= 0.01;
  const targetT = firstRotationKf ? totalDur : currentT;
  const result = upsertKeyframeAtCurrentTime({ rot: rotVal }, { holdBefore: false, t: targetT, kind: 'rotation' });
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
  const pathStartT = Number(s?.pathStartT);
  const pathStartKf = userKeyframesForShape(s).find(k => k.pathStart || k.kind === 'path-start');
  let start = Number.isFinite(pathStartT)
    ? pathStartT
    : (pathStartKf ? Number(pathStartKf.t) : 0);
  let end = Number.isFinite(Number(s?.pathEndT)) ? Number(s.pathEndT) : totalDur;
  start = Math.max(0, Math.min(totalDur, start));
  end = Math.max(0, Math.min(totalDur, end));
  if (end <= start) {
    if (start >= totalDur) start = Math.max(0, totalDur - 0.5);
    end = Math.min(totalDur, start + 0.5);
  }
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

function setPathDurationFromPlayhead() {
  if (!selected) { setStatus('図形を選択してください'); return; }
  const animOwner = getSelectedAnimationOwner();
  if (!animOwner?.animPath || animOwner.animPath.length < 2) {
    setStatus('先にパスを描いてください');
    return;
  }

  const input = document.getElementById('p-path-duration');
  const duration = Number(input?.value);
  if (!Number.isFinite(duration) || duration <= 0) {
    setStatus('パス秒数を入力してください');
    toast('ti-alert-triangle', '0より大きい秒数を入れてください');
    return;
  }

  const startT = parseFloat((animT * totalDur).toFixed(2));
  const dur = Math.max(0.05, duration);
  const endT = parseFloat((startT + dur).toFixed(2));

  saveState();
  if (endT > totalDur) {
    totalDur = endT;
    if (tlDurInput) tlDurInput.value = Number.isInteger(totalDur) ? String(totalDur) : totalDur.toFixed(2);
  }
  animT = totalDur > 0 ? Math.max(0, Math.min(1, startT / totalDur)) : 0;

  animOwner.pathStartT = startT;
  animOwner.pathEndT = endT;
  animOwner.keyframes ||= [];
  animOwner.keyframes.forEach(k => {
    if (k.pathStart) delete k.pathStart;
    if (k.kind === 'path-start') delete k.kind;
  });
  markGroupAnimationOwner(animOwner);

  renderAnimationCanvasFrame(animT);
  syncProps();
  drawTimeline();
  updateCode();
  setStatus('パス時間: ' + startT.toFixed(2) + 's から ' + dur.toFixed(2) + '秒');
  toast('ti-clock-play', startT.toFixed(2) + 's から ' + dur.toFixed(2) + '秒');
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

// ── キーフレーム補間 ─────────────────────────────────────────
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

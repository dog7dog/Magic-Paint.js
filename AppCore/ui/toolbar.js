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

// ツールバーボタン
document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('redo-btn').addEventListener('click', redo);
document.getElementById('del-btn').addEventListener('click', deleteSelected);

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
// 追加: グループ化 + FPS変更（既存ボタン処理を壊さない安全版）
// ══════════════════════════════════════════════════════════════
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

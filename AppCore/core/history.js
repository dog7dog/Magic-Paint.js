// ── Undo / Redo ──────────────────────────────────────────────
const MAX_HISTORY = 80;

function snapshot() {
  return JSON.stringify({
    shapes: shapes.map(s => { const { snap, ...rest } = s; return rest; }),
    selectedId: selected?.id ?? null,
    multiSelectedIds: multiSelected.slice(),
    animT,
    totalDur,
    FPS,
    canvasBg,
    layers: layers.map(l => ({ ...l })),
    activeLayerId,
  });
}

function restore(data) {
  const state = JSON.parse(data);

  shapes.length = 0;
  shapes.push(...state.shapes);

  selected = shapes.find(s => s.id === state.selectedId) ?? null;
  multiSelected = state.multiSelectedIds ?? [];

  if (state.animT != null)    animT    = state.animT;
  if (state.totalDur != null) totalDur = state.totalDur;
  if (state.FPS != null)      FPS      = state.FPS;
  if (state.canvasBg != null) canvasBg = state.canvasBg;
  if (state.layers?.length) {
    layers.length = 0;
    layers.push(...state.layers);
  }
  if (state.activeLayerId) activeLayerId = state.activeLayerId;

  syncAll();
}

function saveState() {
  const snap = snapshot();
  if (undoStack[undoStack.length - 1] === snap) return;
  undoStack.push(snap);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  setStatus('元に戻しました');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  setStatus('やり直しました');
}

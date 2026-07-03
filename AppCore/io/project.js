// ══════════════════════════════════════════════════════════════
// ファイル保存・読み込み
// ══════════════════════════════════════════════════════════════
function serializeProject() {
  return {
    app: 'Magic Paint',
    version: '3.0.0',
    schemaVersion: 3,
    layers: layers.map(l => ({ ...l })),
    activeLayerId,
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
  if (data.app && data.app !== 'Magic Paint') {
    if (!confirm(`このファイルは "${data.app}" 形式です。開きますか？`)) return;
  }
  checkRequiredMods(data.mods || []);

  // レイヤー復元（旧形式は layer-1 に統合）
  if (data.layers && data.layers.length > 0) {
    layers.length = 0;
    layers.push(...data.layers);
    activeLayerId = data.activeLayerId || layers.find(l => l.type !== 'folder')?.id || layers[0].id;
  } else {
    layers.length = 0;
    layers.push({ id: 'layer-1', name: 'Layer 1', type: 'normal', parentId: null, visible: true, locked: false, opacity: 1, blendMode: 'source-over', color: null, collapsed: false });
    activeLayerId = 'layer-1';
  }

  const loadedShapes = (data.shapes || []).map(s => ({
    ...s,
    engine: s.engine || 'canvas2d',
    layerId: s.layerId || 'layer-1'
  }));
  shapes.length = 0;
  shapes.push(...loadedShapes);
  // 旧形式の図形に layerId を付与
  shapes.forEach(s => { if (!s.layerId) s.layerId = 'layer-1'; });

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
  shapes.length = 0; selected = null; multiSelected = []; currentProjectId = null; animT = 0;
  undoStack.length = 0; redoStack.length = 0;
  layers.length = 0;
  layers.push({ id: 'layer-1', name: 'Layer 1', visible: true, locked: false, opacity: 1, blendMode: 'source-over' });
  activeLayerId = 'layer-1';
  document.getElementById('proj-name').textContent = '無題.mlc';
  syncAll();
  toast('ti-file-plus', '新規プロジェクト');
}

function exportPNG() {
  document.getElementById('png-export-modal')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'png-export-modal';
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:900;display:flex;align-items:center;justify-content:center';
  wrap.innerHTML = `
    <div style="background:#1f1f1f;border:1px solid #333;border-radius:10px;padding:20px 24px;width:260px;display:flex;flex-direction:column;gap:14px">
      <div style="font-size:14px;font-weight:600;color:#e8e6df">PNG書き出し</div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#ccc;cursor:pointer">
        <input type="checkbox" id="png-transparent" style="width:14px;height:14px">
        透明背景
      </label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="document.getElementById('png-export-modal').remove()"
          style="padding:6px 14px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:#aaa;font-size:12px;cursor:pointer">
          キャンセル
        </button>
        <button onclick="_doExportPNG(document.getElementById('png-transparent').checked)"
          style="padding:6px 14px;border-radius:6px;border:none;background:#3B8AE6;color:#fff;font-size:12px;cursor:pointer">
          書き出し
        </button>
      </div>
    </div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
}

function _doExportPNG(transparent) {
  document.getElementById('png-export-modal')?.remove();
  closeFileMenu();

  const offscreen = document.createElement('canvas');
  offscreen.width = cv.width;
  offscreen.height = cv.height;
  const oc = offscreen.getContext('2d');

  if (!transparent) {
    oc.fillStyle = canvasBg || '#111111';
    oc.fillRect(0, 0, offscreen.width, offscreen.height);
  }

  const normalLayers = layers.filter(l => l.type !== 'folder');
  const layerIds = new Set(normalLayers.map(l => l.id));
  normalLayers.forEach(layer => {
    if (!layerIsVisible(layer)) return;
    shapes
      .filter(s => (s.layerId || 'layer-1') === layer.id && _is2d(s) && !s.hidden)
      .forEach(s => drawShape(s, oc));
  });
  shapes
    .filter(s => s.layerId && !layerIds.has(s.layerId) && _is2d(s) && !s.hidden)
    .forEach(s => drawShape(s, oc));

  const cvThree = document.getElementById('cv-three');
  const hasVisibleThreeJs = shapes.some(s => {
    if (_is2d(s) || s.hidden) return false;
    const layer = layers.find(l => l.id === (s.layerId || 'layer-1'));
    return layerIsVisible(layer);
  });
  if (cvThree && cvThree.width > 0 && cvThree.height > 0 && hasVisibleThreeJs) {
    oc.drawImage(cvThree, 0, 0, offscreen.width, offscreen.height);
  }

  offscreen.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = document.getElementById('proj-name')?.textContent?.replace('.mlc', '') || 'canvas';
    a.href = url;
    a.download = name + '.png';
    a.click();
    URL.revokeObjectURL(url);
    toast('ti-photo', 'PNG書き出し完了');
  }, 'image/png');
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

function exportHTML() {
  closeFileMenu();

  openPreview(true);
}
window.exportHTML = exportHTML;

// NOTE: exportJS は元のapp.jsでも2回定義されており、こちらの定義が
// （関数再宣言により）後勝ちで有効になる。これは元の挙動をそのまま維持している。
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

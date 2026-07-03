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
  const pathDurationRow = document.getElementById('row-path-duration');
  const pathInfo = document.getElementById('path-time-info');
  if (pathRow && pathInfo) {
    const hasPath = Boolean(animOwner?.animPath && animOwner.animPath.length > 1);
    pathRow.style.display = hasPath ? 'flex' : 'none';
    if (pathDurationRow) pathDurationRow.style.display = hasPath ? 'flex' : 'none';
    if (hasPath) {
      const range = getPathTimeRange(animOwner);
      const seconds = Math.max(0.05, range.end - range.start);
      const hasKf = hasUserKeyframes(animOwner);
      pathInfo.textContent = (hasKf ? 'KF ' : '') + range.start.toFixed(2) + 's -> ' + range.end.toFixed(2) + 's';
      const durInput = document.getElementById('p-path-duration');
      if (durInput && document.activeElement !== durInput) {
        durInput.value = seconds.toFixed(2);
      }
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
document.getElementById('btn-rotation-kf')?.addEventListener('click', setRotationKeyframeFromInput);

function updateAngleFromSpeed() {
  const speed = Number(document.getElementById('p-anim-rot-speed')?.value);
  const dur = Number(document.getElementById('p-anim-rot-dur')?.value);
  if (!Number.isFinite(speed) || !Number.isFinite(dur) || dur <= 0) return;
  const startRot = selected ? currentRotationForShape(selected) : 0;
  const targetAngle = Math.round((startRot + speed * dur) * 100) / 100;
  const rotInput = document.getElementById('p-anim-rot');
  const valEl = document.getElementById('p-anim-rot-v');
  if (rotInput) rotInput.value = targetAngle;
  if (valEl) valEl.textContent = targetAngle + '°';
}

document.getElementById('p-anim-rot-speed')?.addEventListener('input', updateAngleFromSpeed);
document.getElementById('p-anim-rot-dur')?.addEventListener('input', () => {
  const speed = Number(document.getElementById('p-anim-rot-speed')?.value);
  if (speed !== 0) updateAngleFromSpeed();
});


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
  saveState();
  animOwner.pathEndT = Math.max(0.01, parseFloat((animT * totalDur).toFixed(2)));
  const range = getPathTimeRange(animOwner);
  if (animOwner.pathEndT <= range.start) animOwner.pathEndT = Math.min(totalDur, range.start + 0.5);
  syncProps(); drawTimeline(); updateCode();
  setStatus('パス終了: ' + animOwner.pathEndT.toFixed(2) + 's');
});

document.getElementById('btn-path-duration-apply')?.addEventListener('click', setPathDurationFromPlayhead);
document.getElementById('p-path-duration')?.addEventListener('change', setPathDurationFromPlayhead);

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

// ── レイヤーパネル ────────────────────────────────────────────
function getDrawableActiveLayerId() {
  const active = layers.find(l => l.id === activeLayerId);
  if (active && active.type !== 'folder') return active.id;
  const child = layers.find(l => l.parentId === activeLayerId && l.type !== 'folder');
  return child?.id || layers.find(l => l.type !== 'folder')?.id || 'layer-1';
}

function _layerColorPicker(layer, swatch) {
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.value = layer.color || '#888888';
  inp.style.cssText = 'position:absolute;opacity:0;width:0;height:0;pointer-events:none';
  swatch.appendChild(inp);
  inp.addEventListener('input', e => { layer.color = e.target.value; swatch.style.background = layer.color; });
  inp.addEventListener('change', () => { saveState(); syncLayers(); });
  inp.click();
}

function _showFolderMenu(layer, anchorEl) {
  document.querySelectorAll('.lp-folder-menu').forEach(m => m.remove());
  const folders = layers.filter(l => l.type === 'folder');
  const menu = document.createElement('div');
  menu.className = 'lp-folder-menu';
  const addItem = (label, onClick) => {
    const item = document.createElement('div');
    item.className = 'lp-folder-menu-item';
    item.textContent = label;
    item.addEventListener('mousedown', e => { e.stopPropagation(); onClick(); menu.remove(); });
    menu.appendChild(item);
  };
  if (layer.parentId) addItem('📤 フォルダから出す', () => { saveState(); layer.parentId = null; syncLayers(); });
  folders.filter(f => f.id !== layer.parentId).forEach(f => {
    addItem('📁 ' + f.name + ' に移動', () => { saveState(); layer.parentId = f.id; f.collapsed = false; syncLayers(); });
  });
  if (menu.children.length === 0) addItem('（フォルダがありません）', () => {});
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = rect.left, top = rect.bottom + 2;
  if (left + mw > window.innerWidth - 4) left = window.innerWidth - mw - 4;
  if (top + mh > window.innerHeight - 4) top = rect.top - mh - 2;
  menu.style.cssText = `position:fixed;top:${top}px;left:${left}px;z-index:9999`;
  const close = e => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
  setTimeout(() => document.addEventListener('mousedown', close), 0);
}

function _buildLayerRow(layer, depth) {
  depth = depth || 0;
  const layerShapes = shapes.filter(s => (s.layerId || 'layer-1') === layer.id);
  const isActive = layer.id === activeLayerId;
  const wrap = document.createElement('div');
  wrap.className = 'lp-layer-wrap' + (isActive ? ' active' : '');
  if (depth > 0) wrap.style.marginLeft = (depth * 16) + 'px';
  const header = document.createElement('div');
  header.className = 'lp-layer-row';
  const colorStyle = layer.color ? 'background:' + layer.color : 'background:transparent;border:1px dashed var(--border2)';
  const inFolderIcon = layer.parentId ? 'ti-folder' : 'ti-folder-plus';
  header.innerHTML = `
    <i class="lp-vis ti ${layer.visible ? 'ti-eye' : 'ti-eye-off'}" title="表示切替"></i>
    <i class="lp-lock ti ${layer.locked ? 'ti-lock' : 'ti-lock-open'}" title="ロック切替"></i>
    <span class="lp-color-swatch" title="レイヤーカラー" style="${colorStyle}"></span>
    <span class="lp-layer-name">${layer.name}</span>
    <span class="lp-layer-cnt">${layerShapes.length}個</span>
    <i class="lp-move-folder ti ${inFolderIcon}" title="フォルダに移動"></i>
    <i class="lp-chevron ti ti-chevron-down"></i>
  `;
  header.querySelector('.lp-vis').addEventListener('click', ev => {
    ev.stopPropagation(); saveState(); layer.visible = !layer.visible;
    _notifyLayerState(layer.id, 'visible', layer.visible);
    shapes.filter(s => !_is2d(s) && (s.layerId || 'layer-1') === layer.id)
          .forEach(s => _notifyObjectHidden(s, !layer.visible || s.hidden));
    syncLayers(); redraw();
  });
  header.querySelector('.lp-lock').addEventListener('click', ev => {
    ev.stopPropagation(); saveState(); layer.locked = !layer.locked;
    _notifyLayerState(layer.id, 'locked', layer.locked);
    syncLayers();
  });
  header.querySelector('.lp-color-swatch').addEventListener('click', ev => { ev.stopPropagation(); _layerColorPicker(layer, ev.currentTarget); });
  header.querySelector('.lp-move-folder').addEventListener('click', ev => { ev.stopPropagation(); _showFolderMenu(layer, ev.currentTarget); });
  header.querySelector('.lp-layer-name').addEventListener('dblclick', ev => {
    ev.stopPropagation();
    const n = prompt('レイヤー名を変更', layer.name);
    if (n !== null && n.trim()) { saveState(); layer.name = n.trim(); syncLayers(); }
  });
  header.querySelector('.lp-chevron').addEventListener('click', ev => {
    ev.stopPropagation();
    shapeList.classList.toggle('collapsed');
    const ch = header.querySelector('.lp-chevron');
    ch.classList.toggle('ti-chevron-up'); ch.classList.toggle('ti-chevron-down');
  });
  header.addEventListener('click', () => { activeLayerId = layer.id; setStatus('アクティブ: ' + layer.name); syncLayers(); });
  const shapeList = document.createElement('div');
  shapeList.className = 'lp-shape-list';
  layerShapes.forEach(s => {
    const sRow = document.createElement('div');
    sRow.className = 'lp-shape-row' + (s === selected ? ' sel' : '');
    const icon = { rect: 'ti-square', circle: 'ti-circle', triangle: 'ti-triangle', polygon: 'ti-hexagon', line: 'ti-minus', pen: 'ti-pencil', brush: 'ti-brush', 'mod-brush': 'ti-brush' }[s.type] || 'ti-shape';
    const engineBadge = s.engine && s.engine !== 'canvas2d'
      ? `<span class="lp-engine-badge">${s.engine}</span>` : '';
    sRow.innerHTML = `
      <span class="lp-shape-dot" style="background:${s.color || 'var(--fg3)'}"></span>
      <i class="ti ${icon}" style="font-size:11px;color:var(--fg3)"></i>
      <span class="lp-shape-name">${s.name || s.type}</span>
      ${engineBadge}
      <i class="ti ${s.hidden ? 'ti-eye-off' : 'ti-eye'} lp-shape-eye"></i>
    `;
    sRow.querySelector('.lp-shape-eye').addEventListener('click', ev => {
      ev.stopPropagation(); s.hidden = !s.hidden;
      if (!_is2d(s)) _notifyObjectHidden(s, s.hidden);
      syncLayers(); redraw();
    });
    sRow.addEventListener('click', ev => { ev.stopPropagation(); selected = s; activeLayerId = layer.id; syncProps(); syncLayers(); redraw(); });
    shapeList.appendChild(sRow);
  });
  wrap.appendChild(header); wrap.appendChild(shapeList);
  return wrap;
}

function _buildFolderRow(folder) {
  const isActive = folder.id === activeLayerId;
  const children = layers.filter(l => l.parentId === folder.id);
  const wrap = document.createElement('div');
  wrap.className = 'lp-folder-wrap' + (isActive ? ' active' : '');
  const folderColor = folder.color || 'var(--fg3)';
  const header = document.createElement('div');
  header.className = 'lp-folder-row';
  header.innerHTML = `
    <i class="lp-vis ti ${folder.visible ? 'ti-eye' : 'ti-eye-off'}" title="表示切替"></i>
    <i class="lp-lock ti ${folder.locked ? 'ti-lock' : 'ti-lock-open'}" title="ロック切替"></i>
    <i class="ti ti-folder lp-folder-icon" style="color:${folderColor}" title="フォルダカラー"></i>
    <span class="lp-layer-name">${folder.name}</span>
    <span class="lp-layer-cnt">${children.length}層</span>
    <i class="lp-chevron ti ${folder.collapsed ? 'ti-chevron-right' : 'ti-chevron-down'}"></i>
  `;
  header.querySelector('.lp-vis').addEventListener('click', ev => {
    ev.stopPropagation(); saveState(); folder.visible = !folder.visible;
    layers.filter(l => l.parentId === folder.id).forEach(l => {
      _notifyLayerState(l.id, 'visible', folder.visible && l.visible);
      shapes.filter(s => !_is2d(s) && (s.layerId || 'layer-1') === l.id)
            .forEach(s => _notifyObjectHidden(s, !folder.visible || !l.visible || s.hidden));
    });
    syncLayers(); redraw();
  });
  header.querySelector('.lp-lock').addEventListener('click', ev => {
    ev.stopPropagation(); saveState(); folder.locked = !folder.locked;
    layers.filter(l => l.parentId === folder.id).forEach(l => _notifyLayerState(l.id, 'locked', folder.locked || l.locked));
    syncLayers();
  });
  header.querySelector('.lp-folder-icon').addEventListener('click', ev => {
    ev.stopPropagation();
    const icon = ev.currentTarget;
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = folder.color || '#e67e22';
    inp.style.cssText = 'position:absolute;opacity:0;width:0;height:0;pointer-events:none';
    icon.appendChild(inp);
    inp.addEventListener('input', e => { folder.color = e.target.value; icon.style.color = folder.color; });
    inp.addEventListener('change', () => { saveState(); syncLayers(); });
    inp.click();
  });
  header.querySelector('.lp-layer-name').addEventListener('dblclick', ev => {
    ev.stopPropagation();
    const n = prompt('フォルダ名を変更', folder.name);
    if (n !== null && n.trim()) { saveState(); folder.name = n.trim(); syncLayers(); }
  });
  header.querySelector('.lp-chevron').addEventListener('click', ev => {
    ev.stopPropagation(); folder.collapsed = !folder.collapsed;
    childList.classList.toggle('collapsed', folder.collapsed);
    const ch = header.querySelector('.lp-chevron');
    ch.classList.toggle('ti-chevron-right', folder.collapsed); ch.classList.toggle('ti-chevron-down', !folder.collapsed);
  });
  header.addEventListener('click', () => { activeLayerId = folder.id; setStatus('アクティブ: 📁 ' + folder.name); syncLayers(); });
  const childList = document.createElement('div');
  childList.className = 'lp-folder-children' + (folder.collapsed ? ' collapsed' : '');
  children.forEach(child => childList.appendChild(_buildLayerRow(child, 1)));
  wrap.appendChild(header); wrap.appendChild(childList);
  return wrap;
}

function syncLayers() {
  const fullList = document.getElementById('layers-list');
  if (fullList) {
    fullList.innerHTML = '';
    [...layers].reverse().filter(l => !l.parentId).forEach(l => {
      fullList.appendChild(l.type === 'folder' ? _buildFolderRow(l) : _buildLayerRow(l, 0));
    });
  }
  layerList.innerHTML = '';
  [...layers].reverse().filter(l => l.type !== 'folder').forEach(layer => {
    const isActive = layer.id === activeLayerId;
    const row = document.createElement('div');
    row.className = 'tl-layer-row' + (isActive ? ' sel' : '');
    row.innerHTML = `<span class="tl-layer-name">${layer.parentId ? '  ' : ''}${layer.name}</span>`;
    row.addEventListener('click', () => { activeLayerId = layer.id; syncLayers(); });
    layerList.appendChild(row);
  });
}

function addLayer() {
  saveState();
  const id = 'layer-' + Date.now();
  const activeLayer = layers.find(l => l.id === activeLayerId);
  const parentId = (activeLayer && activeLayer.type === 'folder') ? activeLayerId : (activeLayer ? activeLayer.parentId : null);
  layers.push({ id, name: 'Layer ' + (layers.length + 1), type: 'normal', parentId: parentId || null, visible: true, locked: false, opacity: 1, blendMode: 'source-over', color: null, collapsed: false });
  activeLayerId = id;
  syncLayers();
  setStatus('レイヤーを追加しました');
}

function addFolder() {
  saveState();
  const id = 'folder-' + Date.now();
  layers.push({ id, name: 'フォルダ ' + (layers.filter(l => l.type === 'folder').length + 1), type: 'folder', parentId: null, visible: true, locked: false, opacity: 1, blendMode: 'source-over', color: null, collapsed: false });
  activeLayerId = id;
  syncLayers();
  setStatus('フォルダを追加しました');
}

function deleteActiveLayer() {
  const active = layers.find(l => l.id === activeLayerId);
  if (!active) return;
  if (layers.filter(l => l.type !== 'folder').length <= 1 && active.type !== 'folder') {
    setStatus('最後のレイヤーは削除できません'); return;
  }
  let targetIds = [activeLayerId];
  if (active.type === 'folder') targetIds = targetIds.concat(layers.filter(l => l.parentId === activeLayerId).map(l => l.id));
  const totalShapes = shapes.filter(s => targetIds.includes(s.layerId || 'layer-1')).length;
  const msg = totalShapes > 0 ? `削除対象の図形 ${totalShapes}個も削除されます。よろしいですか？` : '削除しますか？';
  if (!confirm(msg)) return;
  saveState();
  shapes.splice(0, shapes.length, ...shapes.filter(s => !targetIds.includes(s.layerId || 'layer-1')));
  if (selected && targetIds.includes(selected.layerId || 'layer-1')) { selected = null; multiSelected = []; }
  const firstIdx = layers.findIndex(l => targetIds.includes(l.id));
  layers.splice(0, layers.length, ...layers.filter(l => !targetIds.includes(l.id)));
  const remaining = layers.filter(l => l.type !== 'folder');
  activeLayerId = remaining.length > 0 ? (layers[Math.min(firstIdx, layers.length - 1)]?.id || remaining[0].id) : (layers[0]?.id || 'layer-1');
  syncAll();
  setStatus('削除しました');
}

function moveLayerUp() {
  saveState();
  const idx = layers.findIndex(l => l.id === activeLayerId);
  if (idx >= layers.length - 1) return;
  [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]];
  syncLayers(); redraw();
}

function moveLayerDown() {
  saveState();
  const idx = layers.findIndex(l => l.id === activeLayerId);
  if (idx <= 0) return;
  [layers[idx], layers[idx - 1]] = [layers[idx - 1], layers[idx]];
  syncLayers(); redraw();
}

document.getElementById('btn-add-folder')?.addEventListener('click', addFolder);
document.getElementById('btn-add-layer')?.addEventListener('click', addLayer);
document.getElementById('btn-del-layer')?.addEventListener('click', deleteActiveLayer);
document.getElementById('btn-layer-up')?.addEventListener('click', moveLayerUp);
document.getElementById('btn-layer-down')?.addEventListener('click', moveLayerDown);

function syncAll() {
  syncProps(); syncLayers(); redraw(); drawTimeline(); updateCode();
  if (typeof drawRulers === 'function') drawRulers();
  // SVGオーバーレイは実行中のみ表示（通常は非表示）
  // syncJeSvg はここでは呼ばない
}

// ══════════════════════════════════════════════════════════════
// MOD API: window.AnimationApp
// ══════════════════════════════════════════════════════════════
window.AnimationApp = {
  version: '0.1-mod-prototype',

  customRenderers: {},
  customBrushes: {},

  customUIPanels: {
    top: null,
    right: null,
    bottom: null,
    left: null
  },

  registerMod(mod) {
    if (!mod || !mod.id) return;
    if (!LoadedMods.some(m => m.id === mod.id)) LoadedMods.push(mod);
    console.log('[MOD loaded]', mod.id, mod.name || '');
    setStatus(`MOD読み込み: ${mod.name || mod.id}`);
  },

  registerTool(tool) {
    if (!tool || !tool.id || !tool.name) return;

    const panel = document.getElementById('right-panel');
    if (!panel) return;

    const btn = document.createElement('button');
    btn.className = 'rp-btn';
    btn.dataset.modTool = tool.id;
    btn.title = tool.name;
    btn.innerHTML = tool.icon || '★';

    btn.addEventListener('click', () => {
      document.querySelectorAll('.rp-btn[data-mod-tool]').forEach(b => {
        b.classList.remove('active');
      });

      btn.classList.add('active');

      window.AnimationApp.activeModTool = tool;
      setTool('select');
      setStatus(`MODツール: ${tool.name}`);
    });

    panel.appendChild(btn);
  },

  addShape(shape) {
    if (!shape) return;

    saveState();

    shapes.push({
      color,
      sw,
      opa,
      dash,
      fill: doFill,
      keyframes: [],
      hidden: false,
      name: shape.name || 'MOD図形',
      modId: shape.modId || shape.type || null,
      layerId: getDrawableActiveLayerId(),
      ...shape
    });

    selected = shapes[shapes.length - 1];
    syncAll();
  },

  getSelected() {
    return selected;
  },

  setSelectedPatch(patch) {
    if (!selected || !patch) return;
    Object.assign(selected, patch);
    syncAll();
  },

  registerShapeType(type, renderer) {
    this.customRenderers[type] = renderer;
  },

  registerBrush(brush) {
    this.customBrushes[brush.id] = brush;

    const panel =
      document.getElementById("right-panel") ||
      document.querySelector(".right-panel") ||
      document.querySelector("#tools-panel") ||
      document.querySelector(".tools-panel") ||
      document.querySelector("aside");

    if (!panel) {
      console.warn("MODブラシボタンの追加先が見つかりません");
      return;
    }

    const btn = document.createElement("button");
    btn.className = "rp-btn";
    btn.dataset.modBrush = brush.id;
    btn.title = brush.name;
    btn.innerHTML = brush.icon || "🖌";

    btn.addEventListener("click", () => {
      document.querySelectorAll(".rp-btn[data-mod-tool], .rp-btn[data-mod-brush]").forEach(b => {
        b.classList.remove("active");
      });

      btn.classList.add("active");

      this.activeModBrush = brush;
      this.activeModTool = null;

      setTool("mod-brush");
      setStatus(`MODブラシ: ${brush.name}`);
    });

    panel.appendChild(btn);
  },

  registerUI(ui) {
    if (!ui || !ui.id || !ui.position) return;

    const allowed = ['top', 'right', 'bottom', 'left', 'editor-top'];
    if (!allowed.includes(ui.position)) {
      console.warn('Invalid UI position:', ui.position);
      return;
    }

    const target = this.getUIArea(ui.position);
    if (!target) {
      console.warn('UI追加先が見つかりません:', ui.position);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'mod-ui-block';
    wrap.dataset.modUi = ui.id;

    if (ui.title) {
      const title = document.createElement('div');
      title.className = 'mod-ui-title';
      title.textContent = ui.title;
      wrap.appendChild(title);
    }

    if (ui.html) {
      const body = document.createElement('div');
      body.className = 'mod-ui-body';
      body.innerHTML = ui.html;
      wrap.appendChild(body);
    }

    if (typeof ui.render === 'function') {
      ui.render(wrap, this);
    }

    target.appendChild(wrap);

    if (typeof ui.onMount === 'function') {
      ui.onMount(wrap, this);
    }

    return wrap;
  },

  registerFileMenuItem(item) {
    if (!item || !item.id || !item.label) return;
    const menu = document.getElementById('file-menu');
    if (!menu) return;
    if (menu.querySelector(`[data-file-menu-item="${item.id}"]`)) return;

    if (menu.dataset.modSepAdded !== '1') {
      const sep = document.createElement('div');
      sep.className = 'fm-sep';
      menu.appendChild(sep);
      menu.dataset.modSepAdded = '1';
    }

    const el = document.createElement('div');
    el.className = 'fm-item';
    el.dataset.fileMenuItem = item.id;

    if (item.icon) {
      const icon = document.createElement('i');
      icon.className = 'ti ' + item.icon;
      el.appendChild(icon);
    }

    const label = document.createElement('span');
    label.textContent = item.label;
    el.appendChild(label);

    el.addEventListener('click', () => {
      closeFileMenu();
      try { item.onClick?.(this); } catch (e) { console.error(e); }
    });

    menu.appendChild(el);
    return el;
  },

  getUIArea(position) {
    switch (position) {
      case 'top':
        return document.getElementById('topbar');

      case 'editor-top':
        return document.getElementById('editor-mod-ui-area');

      case 'right':
        return document.getElementById('right-panel');

      case 'bottom':
        return document.getElementById('timeline');

      case 'left':
        return document.getElementById('left-panel');

      default:
        return null;
    }
  },

  getSceneSnapshot() {
    const cleanShapes = JSON.parse(JSON.stringify(shapes, (key, value) => {
      if (key === 'snap' || key === '_orig') return undefined;
      if (typeof value === 'function') return undefined;
      return value;
    }));

    return {
      width: cv.width,
      height: cv.height,
      bg: canvasBg || '#111111',
      totalDur,
      looping,
      fps: (typeof FPS !== 'undefined' ? FPS : 24),
      shapes: cleanShapes
    };
  },

  // ── Three.js / エンジン統合 API ──────────────────────────────
  _threeRenderers: [],

  registerThreeRenderer(callbacks) {
    if (callbacks && typeof callbacks === 'object') this._threeRenderers.push(callbacks);
  },

  addObject(obj) {
    if (!obj || !obj.type) return null;
    const newObj = {
      id: obj.id || ('obj-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
      engine: obj.engine || 'threejs',
      layerId: obj.layerId || getDrawableActiveLayerId(),
      keyframes: [],
      hidden: false,
      name: obj.name || obj.type,
      ...obj
    };
    saveState();
    shapes.push(newObj);
    syncLayers();
    return newObj;
  },

  removeObject(id) {
    const idx = shapes.findIndex(s => s.id === id);
    if (idx === -1) return;
    saveState();
    shapes.splice(idx, 1);
    if (selected && selected.id === id) { selected = null; multiSelected = []; }
    syncAll();
  },

  updateObject(id, patch) {
    const obj = shapes.find(s => s.id === id);
    if (!obj || !patch) return;
    Object.assign(obj, patch);
    syncLayers();
  },

  getObjectsByLayer(layerId) {
    return shapes.filter(s => (s.layerId || 'layer-1') === layerId);
  },

  getObjectsByEngine(engine) {
    return shapes.filter(s => s.engine === engine);
  },

  getLayers() { return layers; },

  createLayer(options = {}) {
    const layer = {
      id: options.id || `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: options.name || 'New Layer',
      type: options.type === 'folder' ? 'folder' : 'normal',
      parentId: options.parentId || null,
      color: options.color || null,
      visible: options.visible !== false,
      locked: options.locked === true,
      opacity: options.opacity ?? 1,
      blendMode: options.blendMode || 'source-over',
      collapsed: false
    };
    saveState();
    layers.push(layer);
    activeLayerId = layer.id;
    syncAll();
    return layer;
  },

  isLayerVisible(layerId) {
    const layer = layers.find(l => l.id === layerId);
    return layer ? layerIsVisible(layer) : true;
  },

  isLayerLocked(layerId) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return false;
    if (layer.locked) return true;
    if (layer.parentId) {
      const parent = layers.find(l => l.id === layer.parentId);
      if (parent && parent.locked) return true;
    }
    return false;
  },

  redraw,
  toast,
  setStatus,
  getBounds,
  getCenter
};

// ══════════════════════════════════════════════════════════════
// JSエディタ
// ══════════════════════════════════════════════════════════════
let jeMode = 'canvas'; // 'canvas' | 'threejs' | 'html' | 'css'

function initViewTabs() {
  const tabAnim   = document.getElementById('tab-animation');
  const tabEditor = document.getElementById('tab-editor');
  const tabLayers = document.getElementById('tab-layers');
  const workspace    = document.getElementById('workspace');
  const timeline     = document.getElementById('timeline');
  const editorPanel  = document.getElementById('js-editor-panel');
  const layersPanel  = document.getElementById('layers-panel');
  const topbar       = document.getElementById('topbar');
  const editorTopbar = document.getElementById('editor-topbar');
  const fileWrap     = document.getElementById('file-wrap');
  if (!tabAnim || !tabEditor) return;

  function showView(view) {
    const isEditor = view === 'editor';
    const isLayers = view === 'layers';
    const isAnim   = view === 'animation';

    tabAnim?.classList.toggle('active', isAnim);
    tabEditor?.classList.toggle('active', isEditor);
    tabLayers?.classList.toggle('active', isLayers);

    workspace.style.display = (isEditor || isLayers) ? 'none' : 'flex';
    timeline.style.display  = (isEditor || isLayers) ? 'none' : 'flex';

    editorPanel.classList.toggle('active', isEditor);
    if (layersPanel) layersPanel.classList.toggle('active', isLayers);

    topbar.style.display = (isEditor || isLayers) ? 'none' : 'flex';
    editorTopbar.classList.toggle('active', isEditor);

    if (fileWrap) {
      const targetParent = isEditor ? editorTopbar : topbar;
      if (fileWrap.parentNode !== targetParent) targetParent.insertBefore(fileWrap, targetParent.firstChild);
    }

    if (isEditor) {
      initMonacoEditor();
      renderJeFiles();
      setTimeout(() => monacoEditor?.layout(), 30);
    } else if (isLayers) {
      syncLayers();
    } else {
      setTimeout(() => {
        resizeCanvas();
        drawTimeline();
        if (typeof drawRulers === 'function') drawRulers();
      }, 30);
    }
  }

  tabAnim?.addEventListener('click', () => showView('animation'));
  tabEditor?.addEventListener('click', () => showView('editor'));
  tabLayers?.addEventListener('click', () => showView('layers'));
}

// ══════════════════════════════════════════════════════════════
// Monaco Editor（テキストエディタ用）
// ══════════════════════════════════════════════════════════════
let monacoEditor = null;
let monacoLoading = null;
let monacoSyncing = false;

function monacoLangForMode(mode) {
  if (mode === 'html') return 'html';
  if (mode === 'css') return 'css';
  return 'javascript';
}

function loadMonaco() {
  if (window.monaco) return Promise.resolve();
  if (monacoLoading) return monacoLoading;
  monacoLoading = new Promise((resolve, reject) => {
    const loader = document.createElement('script');
    loader.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@latest/min/vs/loader.js';
    loader.onload = () => {
      window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@latest/min/vs' } });
      window.require(['vs/editor/editor.main'], resolve, reject);
    };
    loader.onerror = reject;
    document.head.appendChild(loader);
  });
  return monacoLoading;
}

function initMonacoEditor() {
  const codeEl = document.getElementById('je-code');
  const container = document.getElementById('je-monaco');
  if (!codeEl || !container || monacoEditor || codeEl.dataset.monacoBound === '1') return;
  codeEl.dataset.monacoBound = '1';

  // je-code の value を Monaco と同期する共有プロパティに置き換える
  let _val = codeEl.value;
  Object.defineProperty(codeEl, 'value', {
    get() { return _val; },
    set(v) {
      _val = v;
      if (monacoEditor && !monacoSyncing && monacoEditor.getValue() !== v) {
        monacoSyncing = true;
        monacoEditor.setValue(v);
        monacoSyncing = false;
      }
    }
  });

  loadMonaco().then(() => {
    monacoEditor = monaco.editor.create(container, {
      value: _val,
      language: monacoLangForMode(jeMode),
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 13,
      tabSize: 2,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
    });

    monacoEditor.onDidChangeModelContent(() => {
      if (monacoSyncing) return;
      _val = monacoEditor.getValue();
      codeEl.dispatchEvent(new Event('input'));
    });

    monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      runEditorCode();
    });
  }).catch(err => {
    console.warn('Monaco Editorの読み込みに失敗しました', err);
    monacoLoading = null;
  });
}

// ══════════════════════════════════════════════════════════════
// ファイルマネージャ（テキストエディタ右パネル）
// ══════════════════════════════════════════════════════════════
window.__jeUserFiles = window.__jeUserFiles || {};
window.__jeActiveCustomFile = window.__jeActiveCustomFile || null;

function modeFileName(mode) {
  if (mode === 'threejs') return 'threejs.js';
  if (mode === 'html') return 'index.html';
  if (mode === 'css') return 'style.css';
  if (mode === 'canvas') return 'canvas.js';
  return mode + '.js';
}

function modeFileIcon(mode) {
  if (mode === 'threejs') return 'ti-cube';
  if (mode === 'html') return 'ti-brand-html5';
  if (mode === 'css') return 'ti-brand-css3';
  return 'ti-brand-javascript';
}

function monacoLangForFile(name) {
  if (/\.html?$/i.test(name)) return 'html';
  if (/\.css$/i.test(name)) return 'css';
  return 'javascript';
}

function persistJeUserFiles() {
  try {
    localStorage.setItem('mlcEditorUserFiles', JSON.stringify(window.__jeUserFiles));
  } catch (e) { /* noop */ }
}

function loadJeUserFiles() {
  try {
    window.__jeUserFiles = JSON.parse(localStorage.getItem('mlcEditorUserFiles') || '{}');
  } catch (e) {
    window.__jeUserFiles = {};
  }
}

// 現在のモード（ファイル）を切り替える。ビルトインファイル一覧からのクリックと
// je-mode-select の change の両方からこの一本の経路を通す。
function switchToModeFile(mode) {
  const codeEl = document.getElementById('je-code');
  const modeSelect = document.getElementById('je-mode-select');
  const genBtn = document.getElementById('je-gen-btn');
  const runBtn = document.getElementById('je-run-btn');
  if (!codeEl || !modeSelect) return;

  // 現在のバッファ内容を保存
  if (window.__jeActiveCustomFile) {
    window.__jeUserFiles[window.__jeActiveCustomFile] = codeEl.value;
    persistJeUserFiles();
  } else {
    window.__jeCodeCache = window.__jeCodeCache || {};
    window.__jeCodeCache[jeMode] = codeEl.value;
  }
  window.__jeActiveCustomFile = null;

  jeMode = mode;
  modeSelect.value = mode;
  stopJeAnim();
  modeSelect.className = modeSelect.className.split(' ').filter(c => !c.endsWith('-mode')).join(' ');
  if (monacoEditor) monaco.editor.setModelLanguage(monacoEditor.getModel(), monacoLangForMode(jeMode));

  if (window.__jeModeHandlers?.[jeMode]) {
    window.__jeModeHandlers[jeMode].activate?.(modeSelect, genBtn, runBtn, codeEl);
  } else {
    genBtn.classList.remove('hidden');
    runBtn.innerHTML = '<i class="ti ti-player-play"></i> JS実行';
    codeEl.placeholder = '// GSAPコードをここに書いてください';
    window.__jeCodeCache = window.__jeCodeCache || {};
    const cached = window.__jeCodeCache[jeMode];
    if (cached !== undefined) {
      codeEl.value = cached;
      codeEl.dataset.manual = cached.trim() ? '1' : '0';
    } else {
      codeEl.value = generateEditorCode();
      codeEl.dataset.manual = '0';
    }
  }
  updateEditorRunButtonVisibility();
  renderJeFiles();
}

function openCustomFile(name) {
  const codeEl = document.getElementById('je-code');
  if (!codeEl || window.__jeUserFiles[name] === undefined) return;

  // 現在のバッファ内容を保存
  if (window.__jeActiveCustomFile) {
    window.__jeUserFiles[window.__jeActiveCustomFile] = codeEl.value;
  } else {
    window.__jeCodeCache = window.__jeCodeCache || {};
    window.__jeCodeCache[jeMode] = codeEl.value;
  }
  persistJeUserFiles();

  window.__jeActiveCustomFile = name;
  stopJeAnim();
  codeEl.value = window.__jeUserFiles[name] || '';
  codeEl.dataset.manual = '1';
  if (monacoEditor) monaco.editor.setModelLanguage(monacoEditor.getModel(), monacoLangForFile(name));
  updateEditorRunButtonVisibility();
  renderJeFiles();
}

function createNewJeFile() {
  let name = prompt('新しいファイル名を入力してください（例: utils.js）', 'new-file.js');
  if (!name) return;
  name = name.trim();
  if (!name) return;
  if (window.__jeUserFiles[name] !== undefined) {
    window.toast?.('ti-alert-triangle', '同名のファイルが既に存在します');
    return;
  }
  window.__jeUserFiles[name] = '';
  persistJeUserFiles();
  openCustomFile(name);
}

function renameCustomFile(oldName) {
  const newName = prompt('新しいファイル名を入力してください', oldName);
  if (!newName || newName.trim() === '' || newName === oldName) return;
  if (window.__jeUserFiles[newName] !== undefined) {
    window.toast?.('ti-alert-triangle', '同名のファイルが既に存在します');
    return;
  }
  window.__jeUserFiles[newName] = window.__jeUserFiles[oldName];
  delete window.__jeUserFiles[oldName];
  if (window.__jeActiveCustomFile === oldName) window.__jeActiveCustomFile = newName;
  persistJeUserFiles();
  renderJeFiles();
}

function deleteCustomFile(name) {
  if (!confirm(`「${name}」を削除しますか？`)) return;
  delete window.__jeUserFiles[name];
  persistJeUserFiles();
  if (window.__jeActiveCustomFile === name) {
    window.__jeActiveCustomFile = null;
    switchToModeFile(jeMode);
    return;
  }
  renderJeFiles();
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getModeFileContent(mode) {
  const codeEl = document.getElementById('je-code');
  if (!window.__jeActiveCustomFile && jeMode === mode) return codeEl.value;
  window.__jeCodeCache = window.__jeCodeCache || {};
  if (window.__jeCodeCache[mode] !== undefined) return window.__jeCodeCache[mode];
  return mode === 'canvas' && typeof generateEditorCode === 'function' ? generateEditorCode() : '';
}

function getCustomFileContent(name) {
  const codeEl = document.getElementById('je-code');
  if (window.__jeActiveCustomFile === name) return codeEl.value;
  return window.__jeUserFiles[name] || '';
}

function renderJeFiles() {
  const list = document.getElementById('je-files-list');
  const modeSelect = document.getElementById('je-mode-select');
  if (!list || !modeSelect) return;
  list.innerHTML = '';

  Array.from(modeSelect.options).forEach(opt => {
    const mode = opt.value;
    const name = modeFileName(mode);
    const item = document.createElement('div');
    item.className = 'je-file-item' + (!window.__jeActiveCustomFile && jeMode === mode ? ' active' : '');
    item.title = opt.textContent.trim();
    const icon = document.createElement('i');
    icon.className = 'ti ' + modeFileIcon(mode);
    const nameSpan = document.createElement('span');
    nameSpan.className = 'je-file-name';
    nameSpan.textContent = name;
    const actions = document.createElement('span');
    actions.className = 'je-file-actions';
    const dlBtn = document.createElement('button');
    dlBtn.title = 'ダウンロード';
    dlBtn.innerHTML = '<i class="ti ti-download"></i>';
    dlBtn.addEventListener('click', e => { e.stopPropagation(); downloadFile(name, getModeFileContent(mode)); });
    actions.appendChild(dlBtn);
    item.appendChild(icon);
    item.appendChild(nameSpan);
    item.appendChild(actions);
    item.addEventListener('click', () => switchToModeFile(mode));
    list.appendChild(item);
  });

  Object.keys(window.__jeUserFiles).sort().forEach(name => {
    const item = document.createElement('div');
    item.className = 'je-file-item' + (window.__jeActiveCustomFile === name ? ' active' : '');
    const icon = document.createElement('i');
    icon.className = 'ti ti-file-text';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'je-file-name';
    nameSpan.textContent = name;
    const actions = document.createElement('span');
    actions.className = 'je-file-actions';
    const dlBtn = document.createElement('button');
    dlBtn.title = 'ダウンロード';
    dlBtn.innerHTML = '<i class="ti ti-download"></i>';
    dlBtn.addEventListener('click', e => { e.stopPropagation(); downloadFile(name, getCustomFileContent(name)); });
    const renameBtn = document.createElement('button');
    renameBtn.title = '名前変更';
    renameBtn.innerHTML = '<i class="ti ti-pencil"></i>';
    renameBtn.addEventListener('click', e => { e.stopPropagation(); renameCustomFile(name); });
    const delBtn = document.createElement('button');
    delBtn.title = '削除';
    delBtn.innerHTML = '<i class="ti ti-trash"></i>';
    delBtn.addEventListener('click', e => { e.stopPropagation(); deleteCustomFile(name); });
    actions.appendChild(dlBtn);
    actions.appendChild(renameBtn);
    actions.appendChild(delBtn);
    item.appendChild(icon);
    item.appendChild(nameSpan);
    item.appendChild(actions);
    item.addEventListener('click', () => openCustomFile(name));
    list.appendChild(item);
  });
}

function initJeFileManager() {
  loadJeUserFiles();
  const addBtn = document.getElementById('je-file-add-btn');
  addBtn?.addEventListener('click', createNewJeFile);
  renderJeFiles();
}

function updateEditorRunButtonVisibility() {
  const codeEl = document.getElementById('je-code');
  const runBtn = document.getElementById('je-run-btn');
  if (!runBtn) return;
  const manual = codeEl?.dataset.manual === '1';
  runBtn.classList.toggle('hidden', !manual);
  runBtn.title = manual
    ? '手書きJSを実行 Ctrl+Enter'
    : '通常の再生はタイムライン左の再生ボタンを使います';
}

function initJSEditor() {
  const genBtn = document.getElementById('je-gen-btn');
  const runBtn = document.getElementById('je-run-btn');
  const codeEl = document.getElementById('je-code');
  const consoleEl = document.getElementById('je-console');

  // コード生成
  genBtn.addEventListener('click', () => {
    if (_jeSvg) {
      _jeSvg.remove();
      _jeSvg = null;
    }

    redraw();

    codeEl.value = generateEditorCode();
    codeEl.dataset.manual = '0';
    updateEditorRunButtonVisibility();
    jeLog('コードを生成しました', 'ok');
  });

  // 実行（Ctrl+Enter / Cmd+Enter）
  runBtn.title = '手書きJSを実行 Ctrl+Enter';
  runBtn.addEventListener('click', runEditorCode);
  codeEl.addEventListener('input', () => {
    codeEl.dataset.manual = '1';
    updateEditorRunButtonVisibility();
  });

  codeEl.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runEditorCode();
    }
    // Tab キーでインデント
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = codeEl.selectionStart;
      const v = codeEl.value;
      codeEl.value = v.slice(0, s) + '  ' + v.slice(s);
      codeEl.selectionStart = codeEl.selectionEnd = s + 2;
    }
  });

  // モード切替
  const modeSelect = document.getElementById('je-mode-select');
  modeSelect?.addEventListener('change', () => {
    switchToModeFile(modeSelect.value);
  });

  // 初期コードを生成
  codeEl.value = generateEditorCode();
  codeEl.dataset.manual = '0';
  updateEditorRunButtonVisibility();

  // SVGオーバーレイは実行時のみ作成（初期化時は不要）
}

function safeCssIdent(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^([^a-zA-Z_-])/, '_$1');
}

function getEditorAnimationItems() {
  const items = [];
  const seenGroups = new Set();

  shapes.forEach((s, i) => {
    if (s.groupId) {
      if (seenGroups.has(s.groupId)) return;
      seenGroups.add(s.groupId);

      const owner = getGroupAnimationOwner(s.groupId, false) || getGroupAnimationOwner(s.groupId, true);
      const b = getGroupBounds(s.groupId);
      if (!owner || !b) return;

      items.push({
        shape: owner,
        index: Math.max(0, shapes.indexOf(owner)),
        selector: '.g-' + safeCssIdent(s.groupId),
        label: 'グループ',
        center: { x: b.x + b.w / 2, y: b.y + b.h / 2 }
      });
      return;
    }

    items.push({
      shape: s,
      index: i,
      selector: '.s' + i,
      label: s.name || s.type,
      center: getCenter(s)
    });
  });

  return items;
}

function generateEditorCode() {
  // 現在のシーンからGSAPコードを生成
  const ease = 'power2.inOut';
  const loopVal = looping ? -1 : 0;

  const lines = ['gsap.registerPlugin(MotionPathPlugin);\n'];

  getEditorAnimationItems().forEach(item => {
    const s = item.shape;
    const sel = item.selector;
    const ctr = item.center;
    const anims = [];

    // パスアニメーション
    if (s.animPath && s.animPath.length > 1) {
      const pts = s.animPath
        .filter((p, idx, arr) => {
          if (idx === 0 || idx === arr.length - 1) return true;

          const prev = arr[idx - 1];
          return Math.hypot(p.x - prev.x, p.y - prev.y) > 4;
        })
        .map(p => '{x:' + Math.round(p.x) + ',y:' + Math.round(p.y) + '}')
        .join(', ');
      const range = getPathTimeRange(s);
      const pathTl = 'pathTl' + item.index;
      anims.push(
        'const ' + pathTl + ' = gsap.timeline({ repeat: ' + loopVal + ' });\n' +
        pathTl + ".to('" + sel + "', {\n" +
        '  duration: ' + Math.max(0.01, range.end - range.start).toFixed(2) + ',\n' +
        "  ease: '" + ease + "',\n" +
        '  motionPath: { path: [' + pts + '], autoRotate: false, curviness: 0, alignOrigin: [0.5, 0.5]}\n' +
        '}, ' + range.start.toFixed(2) + ');\n' +
        pathTl + ".set('" + sel + "', { immediateRender: false }, " + totalDur.toFixed(2) + ');'
      );
    }

    // キーフレーム
    const kfs = s.keyframes || [];
    if (kfs.length >= 1) {
      const sorted = [...kfs].sort((a, b) => a.t - b.t);
      const tlName = 'kfTl' + item.index;
      const motionPathBase = 'autoRotate: false, curviness: 0, alignOrigin: [0.5, 0.5]';
      const propsFor = k => {
        const props = [];
        const opa = Number(k.props.opa);
        const rot = Number(k.props.rot);
        if (Number.isFinite(opa)) props.push('opacity: ' + (opa / 100).toFixed(2));
        if (Number.isFinite(rot)) props.push('rotation: ' + rot.toFixed(2));
        props.push("transformOrigin: '50% 50%'");
        props.push("svgOrigin: '" + Math.round(ctr.x) + ' ' + Math.round(ctr.y) + "'");
        return props;
      };
      const pointFor = k => {
        const x = Number(k.props.x);
        const y = Number(k.props.y);
        return Number.isFinite(x) && Number.isFinite(y)
          ? '{x:' + Math.round(x) + ',y:' + Math.round(y) + '}'
          : null;
      };
      const propsText = props => props.filter(Boolean).join(', ');
      const firstPt = pointFor(sorted[0]);
      const firstProps = propsFor(sorted[0]);
      firstProps.push('immediateRender: false');
      if (firstPt && !(s.animPath && s.animPath.length > 1)) {
        firstProps.push('motionPath: { path: [' + firstPt + ',' + firstPt + '], ' + motionPathBase + ' }');
      }
      const firstAt = Math.max(0, sorted[0].t).toFixed(2);
      let code = 'const ' + tlName + ' = gsap.timeline({ repeat: ' + loopVal + ' });\n' +
        tlName + ".set('" + sel + "', { " + propsText(firstProps) + ' }, ' + firstAt + ');';
      for (let i = 1; i < sorted.length; i++) {
        const dur = Math.max(0, sorted[i].t - sorted[i - 1].t).toFixed(2);
        const at = Math.max(0, sorted[i - 1].t).toFixed(2);
        const fromPt = pointFor(sorted[i - 1]);
        const toPt = pointFor(sorted[i]);
        const segProps = [
          'duration: ' + dur,
          "ease: '" + ease + "'",
          ...propsFor(sorted[i])
        ];
        if (fromPt && toPt && !(s.animPath && s.animPath.length > 1)) {
          segProps.push('motionPath: { path: [' + fromPt + ',' + toPt + '], ' + motionPathBase + ' }');
        }
        code += '\n' + tlName + ".to('" + sel + "', { " + propsText(segProps) + ' }, ' + at + ');';
      }
      code += '\n' + tlName + ".set('" + sel + "', { immediateRender: false }, " + totalDur.toFixed(2) + ');';
      anims.push(code);
    }

    // 自動回転
    if (s.autoRotate && s.autoRotate !== 0) {
      const ox = Math.round(ctr.x), oy = Math.round(ctr.y);
      anims.push(
        "gsap.to('" + sel + "', {\n" +
        '  rotation: ' + (s.autoRotate > 0 ? 360 : -360) + ',\n' +
        '  duration: ' + Math.abs(360 / s.autoRotate).toFixed(1) + ',\n' +
        '  repeat: -1,\n' +
        "  ease: 'none',\n" +
        "  transformOrigin: '50% 50%',\n" +
        "  svgOrigin: '" + ox + ' ' + oy + "'\n" +
        '});'
      );
    }

    if (anims.length > 0) {
      lines.push('// ' + item.label + ' (index ' + item.index + ')');
      lines.push(...anims);
      lines.push('');
    }
  });

  if (lines.length === 1) {
    lines.push('// 図形にパスやキーフレームを設定するとコードが生成されます');
    lines.push("// 例: gsap.to('.s0', { duration: 2, x: 200, rotation: 360, repeat: -1 })");
  }

  return lines.join('\n');
}

// GSAPをキャンバス上で使うためのオーバーレイSVG
let _jeSvg = null;

function ensureJeSvg() {
  if (_jeSvg) return _jeSvg;
  // 実際のキャンバス領域(cv-wrap)に SVG オーバーレイを重ねる。
  // 定規表示中でも canvas と SVG がずれず、二重表示に見えないようにする。
  const wrap = document.getElementById('cv-wrap') || area;
  _jeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  _jeSvg.id = 'je-svg-overlay';
  _jeSvg.style.cssText =
    'position:absolute;top:0;left:0;pointer-events:none;z-index:1;';
  wrap.appendChild(_jeSvg);
  return _jeSvg;
}

function syncJeSvg() {
  // canvas のサイズに合わせる
  const svg = ensureJeSvg();
  svg.setAttribute('width', cv.width);
  svg.setAttribute('height', cv.height);
  svg.setAttribute('viewBox', `0 0 ${cv.width} ${cv.height}`);
  // 現在の図形をSVGに反映
  svg.innerHTML = buildSVGContent();
}

// ── プレビュー（手書きJS実行用ヘルパー） ────────────────────────
function refreshEditorCodeIfAuto() {
  const codeEl = document.getElementById('je-code');
  if (!codeEl || codeEl.dataset.manual === '1') return;
  if (typeof generateEditorCode !== 'function') return;
  codeEl.value = generateEditorCode();
  codeEl.dataset.manual = '0';
}

function updateCode() {
  refreshEditorCodeIfAuto();
}

function shouldRunEditorAsCanvas() {
  const codeEl = document.getElementById('je-code');
  return !codeEl || codeEl.dataset.manual !== '1';
}

function runSceneOnCanvasFromEditor() {
  if (typeof stopJeAnim === 'function') stopJeAnim();
  animT = 0;
  startAnim({ restart: true });
  jeLog('キャンバス再生で実行中', 'ok');
}

function runEditorCode() {
  if (jeMode !== 'canvas' && window.__jeModeHandlers?.[jeMode]) {
    const code = document.getElementById('je-code')?.value.trim();
    if (!code) return;
    if (animating) stopAnim();
    if (_jeSvg) { _jeSvg.remove(); _jeSvg = null; }
    window.__jeModeHandlers[jeMode].run?.(code);
    return;
  }
  refreshEditorCodeIfAuto();
  const codeEl = document.getElementById('je-code');
  const code = codeEl.value.trim();

  if (shouldRunEditorAsCanvas()) {
    if (animating) {
      stopAnim();
      jeLog('キャンバス再生を停止しました', 'warn');
      return;
    }
    runSceneOnCanvasFromEditor();
    return;
  }

  if (!code) return;

  // 手書きJSの実行前に既存アニメ・SVGを停止・削除
  if (typeof gsap !== 'undefined') {
    try {
      gsap.globalTimeline.clear();
      gsap.globalTimeline.resume();
      gsap.globalTimeline.paused(false);
    } catch (e) { }
  }
  stopAnim();
  // 既存SVGを削除してから新規作成
  if (_jeSvg) { _jeSvg.remove(); _jeSvg = null; }
  syncJeSvg();
  clearCanvasForSvgOverlay();

  jeLog('実行中...', 'warn');

  try {
    // GSAP が未ロードなら動的に読み込む
    if (typeof gsap === 'undefined') {
      jeLog('GSAPを読み込み中...', 'warn');
      loadGSAP(() => {

        if (typeof gsap !== 'undefined') {
          gsap.ticker.fps(FPS || 24);
        }

        executeCode(code);

      });
    } else {
      if (typeof gsap !== 'undefined') {
        gsap.ticker.fps(FPS || 24);
      }

      executeCode(code);
    }
  } catch (e) {
    jeLog('✗ ' + e.message, 'error');
  }
}

function executeCode(code) {
  try {
    if (typeof gsap !== 'undefined') {
      gsap.globalTimeline.resume();
      gsap.globalTimeline.paused(false);
    }
    // Function コンストラクタで安全に実行
    const fn = new Function('gsap', 'MotionPathPlugin', code);
    fn(gsap, typeof MotionPathPlugin !== 'undefined' ? MotionPathPlugin : null);
    jeLog('✓ 実行完了', 'ok');
  } catch (e) {
    jeLog('✗ ' + e.message, 'error');
    console.error(e);
  }
}

function loadGSAP(callback) {
  const s1 = document.createElement('script');
  s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
  s1.onload = () => {
    const s2 = document.createElement('script');
    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/MotionPathPlugin.min.js';
    s2.onload = () => {
      gsap.registerPlugin(MotionPathPlugin);
      jeLog('✓ GSAP 読み込み完了', 'ok');
      callback();
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

function stopJeAnim() {
  if (typeof gsap !== 'undefined') {
    try {
      gsap.globalTimeline.clear();
      gsap.globalTimeline.resume();
      gsap.globalTimeline.paused(false);
    } catch (e) { }
  }
  if (_jeSvg) { _jeSvg.remove(); _jeSvg = null; }
  if (window.__jeModeHandlers) {
    Object.values(window.__jeModeHandlers).forEach(h => { try { h.stop?.(); } catch (_) {} });
  }
  redraw();
}


function clearCanvasForSvgOverlay() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = canvasBg;
  ctx.fillRect(0, 0, cv.width, cv.height);
}

function buildShapeSVGElement(s, i, origin = { x: 0, y: 0 }) {
  if (s.hidden) return '';

  const cls = 's' + i;
  const c = s.color, sw2 = s.sw || 2, op = (s.opa || 100) / 100;
  const fi = s.fill ? c : 'none';
  const dd = s.dash && s.dash !== '0' ? 'stroke-dasharray="' + s.dash + '"' : '';
  const ctr = getCenter(s);
  const cx = Math.round(ctr.x), cy = Math.round(ctr.y);

  if (s.type === 'brush' && s.snap) {
    try {
      const dataUrl = s.snap.toDataURL('image/png');
      return '<image class="' + cls + '" href="' + dataUrl + '" x="' + (-Math.round(origin.x)) + '" y="' + (-Math.round(origin.y)) + '" width="' + s.snap.width + '" height="' + s.snap.height + '" opacity="' + op + '"/>';
    } catch { return ''; }
  }

  let inner = '';

  if (s.type === 'rect') {
    const hw = s.w / 2, hh = s.h / 2;
    inner = '<rect x="' + Math.round(-hw) + '" y="' + Math.round(-hh) + '" width="' + Math.round(s.w) + '" height="' + Math.round(s.h) + '" rx="' + (s.rr || 0) + '" fill="' + fi + '" stroke="' + c + '" stroke-width="' + sw2 + '" ' + dd + '/>';
  } else if (s.type === 'circle') {
    inner = '<ellipse cx="0" cy="0" rx="' + Math.round(s.rx) + '" ry="' + Math.round(s.ry) + '" fill="' + fi + '" stroke="' + c + '" stroke-width="' + sw2 + '"/>';
  } else if (s.type === 'triangle' || s.type === 'polygon') {
    const n = s.type === 'triangle' ? 3 : (s.sides || 6);
    const sx2 = s.scaleX || 1, sy2 = s.scaleY || 1;
    const a0 = s.type === 'triangle'
      ? ((s.rot || 0) - 90) * Math.PI / 180 : (s.rot || 0) * Math.PI / 180;
    const pts = Array.from({ length: n }, (_, k) => {
      const a = a0 + k * 2 * Math.PI / n;
      return Math.round(s.r * Math.cos(a) * sx2) + ',' + Math.round(s.r * Math.sin(a) * sy2);
    }).join(' ');
    inner = '<polygon points="' + pts + '" fill="' + fi + '" stroke="' + c + '" stroke-width="' + sw2 + '" ' + dd + '/>';
  } else if (s.type === 'line') {
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    inner = '<line x1="' + Math.round(s.x1 - mx) + '" y1="' + Math.round(s.y1 - my) + '" x2="' + Math.round(s.x2 - mx) + '" y2="' + Math.round(s.y2 - my) + '" stroke="' + c + '" stroke-width="' + sw2 + '" ' + dd + '/>';
  } else if (s.type === 'pen' && s.pts && s.pts.length > 1) {
    const d = s.pts.map((p, j) => (j === 0 ? 'M' : 'L') + Math.round(p.x - cx) + ',' + Math.round(p.y - cy)).join(' ');
    inner = '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + sw2 + '" stroke-linecap="round" ' + dd + '/>';
  } else if (s.type === 'mod-brush') {
    const brush = window.AnimationApp?.customBrushes?.[s.brushId];
    if (brush?.toSVG) inner = brush.toSVG(s);
  } else {
    const renderer = window.AnimationApp?.customRenderers?.[s.type];
    if (renderer?.toSVG) inner = renderer.toSVG(s);
  }

  if (!inner) return '';

  return '<g class="' + cls + '" transform="translate(' + Math.round(cx - origin.x) + ',' + Math.round(cy - origin.y) + ')" opacity="' + op + '">' + inner + '</g>';
}

function buildSVGContent() {
  const out = [];
  const drawnGroups = new Set();

  shapes.forEach((s, i) => {
    if (s.hidden) return;

    if (s.groupId) {
      if (drawnGroups.has(s.groupId)) return;
      drawnGroups.add(s.groupId);

      const b = getGroupBounds(s.groupId);
      if (!b) return;

      const origin = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const children = getGroupMembers(s.groupId)
        .map(member => buildShapeSVGElement(member, shapes.indexOf(member), origin))
        .filter(Boolean)
        .join('\n    ');

      if (children) {
        out.push('<g class="g-' + safeCssIdent(s.groupId) + '" transform="translate(' + Math.round(origin.x) + ',' + Math.round(origin.y) + ')">' + children + '</g>');
      }
      return;
    }

    out.push(buildShapeSVGElement(s, i));
  });

  return out.filter(Boolean).join('\n  ');
}

function jeLog(msg, type = 'log') {
  const el = document.getElementById('je-console');
  if (!el) return;
  const line = document.createElement('div');
  line.className = `je-log ${type}`;
  const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  line.textContent = `[${time}] ${msg}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

// shapes が変わったらコードを自動更新
const _origSyncAll = syncAll;
// syncAll は既に定義済みなので、上書きせずに initJSEditor で処理

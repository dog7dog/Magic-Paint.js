(function () {
  const api = window.AnimationApp;
  if (!api) return;

  const MOD_ID = "webgl_Tree.js";
  const IMAGE_TYPE = "webgl-image";
  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
  let threeModulePromise = null;
  let activeCleanup = null;
  let _threeLayerObj = null;  // レイヤーパネルに登録したオブジェクトの参照

  api.registerMod({
    id: MOD_ID,
    name: "Three.jsプレビューMOD",
    level: 2,
    description: "画像レイヤーを追加し、現在のシーンをThree.jsのCanvasTextureで再生・JS書き出しします。"
  });

  registerImageLayerRenderer();

  if (!api.registerUI) return;

  api.registerUI({
    id: "webgl_preview_top",
    position: "top",
    html: '<button class="tb-btn webgl-preview-btn threejs-preview-btn" id="webgl-preview-btn" title="Three.jsプレビューを開く"><i class="ti ti-cube"></i><span>Three.js</span></button><button class="tb-btn threejs-image-btn" id="three-image-btn" title="画像レイヤーを追加"><i class="ti ti-photo-plus"></i><span>画像</span></button>',
    onMount(el, appApi) {
      const btn = el.querySelector("#webgl-preview-btn");
      const imageBtn = el.querySelector("#three-image-btn");
      if (!btn || !imageBtn) return;

      const getScene = () => {
        if (typeof appApi.getSceneSnapshot !== "function") {
          appApi.toast("ti-alert-triangle", "Three.js用のシーン取得APIがありません");
          return null;
        }
        return appApi.getSceneSnapshot();
      };

      btn.addEventListener("click", () => {
        const scene = getScene();
        if (scene) openThreePreviewModal(scene, appApi);
      });

      imageBtn.addEventListener("click", () => importImageLayer(appApi));

      if (typeof appApi.registerFileMenuItem === "function") {
        appApi.registerFileMenuItem({
          id: "webgl_threejs_export",
          label: "Three.js書き出し",
          icon: "ti-file-export",
          onClick() {
            const scene = getScene();
            if (scene) exportThreeJS(scene, appApi);
          }
        });
      }
    }
  });

  function loadThree() {
    if (!threeModulePromise) {
      if (typeof window.THREE !== "undefined" && window.THREE.WebGLRenderer) {
        threeModulePromise = Promise.resolve(window.THREE);
      } else {
        threeModulePromise = import(THREE_URL).catch(err => {
          threeModulePromise = null;
          throw err;
        });
      }
    }
    return threeModulePromise;
  }


  const imageLayerCache = new Map();

  function registerImageLayerRenderer() {
    if (typeof api.registerShapeType !== "function") return;

    api.registerShapeType(IMAGE_TYPE, {
      draw: drawImageLayer,
      getBounds(s) {
        return { x: Number(s.x || 0), y: Number(s.y || 0), w: Math.max(1, Number(s.w || 1)), h: Math.max(1, Number(s.h || 1)) };
      },
      getCenter(s) {
        return { x: Number(s.x || 0) + Number(s.w || 0) / 2, y: Number(s.y || 0) + Number(s.h || 0) / 2 };
      },
      move(s, dx, dy) {
        s.x = Number(s.x || 0) + dx;
        s.y = Number(s.y || 0) + dy;
      },
      resize(s, handle, start, nx, ny, nw, nh) {
        s.x = nx;
        s.y = ny;
        s.w = nw;
        s.h = nh;
      },
      toSVG(s) {
        const w = Math.max(1, Number(s.w || 1));
        const h = Math.max(1, Number(s.h || 1));
        const rot = Number(s.rot || 0);
        return '<g transform="rotate(' + rot + ')"><image href="' + String(s.src || '') + '" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" preserveAspectRatio="none"/></g>';
      },
      previewDrawCode: imageLayerPreviewDrawCode()
    });
  }

  function getImageRecord(src) {
    const key = String(src || '');
    let rec = imageLayerCache.get(key);
    if (!rec) {
      const img = new Image();
      rec = { img, loaded: false, error: false };
      img.onload = () => {
        rec.loaded = true;
        api.redraw?.();
      };
      img.onerror = () => {
        rec.error = true;
        api.redraw?.();
      };
      if (key) img.src = key;
      imageLayerCache.set(key, rec);
    }
    return rec;
  }

  function drawImageLayer(ctx, s) {
    const w = Math.max(1, Number(s.w || 1));
    const h = Math.max(1, Number(s.h || 1));
    const x = Number(s.x || 0);
    const y = Number(s.y || 0);
    const rec = getImageRecord(s.src);

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((Number(s.rot || 0) * Math.PI) / 180);

    if (rec.loaded && rec.img.naturalWidth) {
      ctx.drawImage(rec.img, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = rec.error ? 'rgba(216,90,48,.18)' : 'rgba(255,255,255,.08)';
      ctx.strokeStyle = rec.error ? 'rgba(216,90,48,.8)' : 'rgba(255,255,255,.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  function imageLayerPreviewDrawCode() {
    return "window.__magicPaintPreviewImageCache ||= {};\n" +
      "let img = window.__magicPaintPreviewImageCache[s.src];\n" +
      "if (!img) { img = new Image(); img.src = s.src; window.__magicPaintPreviewImageCache[s.src] = img; }\n" +
      "const w = Math.max(1, Number(s.w || 1));\n" +
      "const h = Math.max(1, Number(s.h || 1));\n" +
      "const x = Number(s.x || 0);\n" +
      "const y = Number(s.y || 0);\n" +
      "ctx.save();\n" +
      "ctx.translate(x + w / 2, y + h / 2);\n" +
      "ctx.rotate((Number(s.rot || 0) * Math.PI) / 180);\n" +
      "if (img.complete && img.naturalWidth) { ctx.drawImage(img, -w / 2, -h / 2, w, h); }\n" +
      "else { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.strokeRect(-w / 2, -h / 2, w, h); }\n" +
      "ctx.restore();";
  }

  function importImageLayer(appApi) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const src = String(reader.result || "");
        const img = new Image();
        img.onload = () => {
          const scene = typeof appApi.getSceneSnapshot === "function" ? appApi.getSceneSnapshot() : { width: 1280, height: 720 };
          const maxW = Math.max(120, Number(scene.width || 1280) * 0.45);
          const maxH = Math.max(120, Number(scene.height || 720) * 0.45);
          const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth), maxH / Math.max(1, img.naturalHeight));
          const w = Math.max(24, Math.round(img.naturalWidth * scale));
          const h = Math.max(24, Math.round(img.naturalHeight * scale));
          const x = Math.round((Number(scene.width || 1280) - w) / 2);
          const y = Math.round((Number(scene.height || 720) - h) / 2);
          const baseName = file.name ? file.name.replace(/\.[^.]+$/, "") : "画像";

          appApi.addShape({
            type: IMAGE_TYPE,
            src,
            x,
            y,
            w,
            h,
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            rot: 0,
            opa: 100,
            color: "#ffffff",
            sw: 1,
            dash: "0",
            fill: false,
            keyframes: [],
            hidden: false,
            name: baseName || "画像レイヤー",
            modId: MOD_ID
          });

          appApi.toast?.("ti-photo-plus", "画像レイヤーを追加しました");
          appApi.setStatus?.("画像レイヤー: " + (baseName || "画像"));
        };
        img.onerror = () => {
          appApi.toast?.("ti-alert-triangle", "画像を読み込めませんでした");
          appApi.setStatus?.("画像読み込みエラー");
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }


  function openThreePreviewModal(scene, appApi) {
    closeThreePreviewModal();
    scene = scene || {};

    const w = Number(scene.width || 1280);
    const h = Number(scene.height || 720);
    const jeMode = document.getElementById("je-mode-select")?.value || "canvas";
    const userCode = jeMode === "threejs" ? (document.getElementById("je-code")?.value.trim() || "") : "";

    const modal = document.createElement("div");
    modal.id = "three-preview-modal";
    modal.innerHTML = [
      '<div class="three-preview-card" role="dialog" aria-modal="true" aria-label="Three.jsプレビュー">',
      '  <div class="three-preview-head">',
      '    <div class="three-preview-title"><i class="ti ti-cube"></i><span>Three.js Preview</span></div>',
      '    <button class="three-preview-close" type="button" title="閉じる"><i class="ti ti-x"></i></button>',
      '  </div>',
      '  <div class="three-preview-stage">',
      '    <div class="three-canvas-wrap">',
      '      <canvas class="three-preview-canvas" width="' + w + '" height="' + h + '"></canvas>',
      (userCode ? '      <canvas class="three-user-canvas" width="' + w + '" height="' + h + '"></canvas>' : ''),
      '    </div>',
      '  </div>',
      '  <div class="three-preview-bar">',
      '    <button class="three-preview-play" type="button">停止</button>',
      '    <button class="three-preview-restart" type="button">最初から</button>',
      '    <button class="three-preview-export" type="button">JS書出</button>',
      '    <span class="three-preview-time">0.00s</span>',
      '    <span class="three-preview-status">Three.js 読み込み中</span>',
      (userCode ? '    <span class="three-preview-badge">+ JSコード</span>' : ''),
      '  </div>',
      '  <div class="three-preview-warn"></div>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector(".three-preview-close");
    const exportBtn = modal.querySelector(".three-preview-export");
    closeBtn.addEventListener("click", closeThreePreviewModal);
    exportBtn.addEventListener("click", () => exportThreeJS(scene, appApi));
    modal.addEventListener("click", e => {
      if (e.target === modal) closeThreePreviewModal();
    });

    const onKey = e => {
      if (e.key === "Escape") closeThreePreviewModal();
    };
    document.addEventListener("keydown", onKey);

    const statusEl = modal.querySelector(".three-preview-status");
    const warnEl = modal.querySelector(".three-preview-warn");

    loadThree()
      .then(THREE => {
        if (!document.body.contains(modal)) return;
        activeCleanup = mountThreeTexturePreview(THREE, scene, modal, userCode);
        appApi.toast("ti-cube", "Three.jsプレビューを開きました");
      })
      .catch(err => {
        console.error("[Three.js preview load failed]", err);
        statusEl.textContent = "Three.js 読み込み失敗";
        warnEl.textContent = "Three.js moduleを読み込めませんでした。ネットワークまたはCDNを確認してください。";
      });

    modal._threePreviewCleanup = () => {
      document.removeEventListener("keydown", onKey);
      if (activeCleanup) {
        activeCleanup();
        activeCleanup = null;
      }
    };
  }

  function closeThreePreviewModal() {
    const modal = document.getElementById("three-preview-modal");
    if (!modal) return;
    if (typeof modal._threePreviewCleanup === "function") modal._threePreviewCleanup();
    modal.remove();
  }

  function exportThreeJS(scene, appApi) {
    scene = scene || {};
    const js = buildThreeExportJS(scene);
    const blob = new Blob([js], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "magicpaint-threejs.js";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    appApi.toast("ti-file-export", "Three.js JSを書き出しました");
  }

  function buildThreeExportJS(scene) {
    scene = scene || {};
    const json = JSON.stringify(scene).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const runtime = mountThreeTexturePreview.toString();

    return [
      "// MagicPaint.JS Three.js export",
      "// Use from HTML with: <script type=\"module\" src=\"./magicpaint-threejs.js\"></script>",
      "const THREE_URL = " + JSON.stringify(THREE_URL) + ";",
      "const data = " + json + ";",
      "const mountThreeTexturePreview = " + runtime + ";",
      "",
      "function ensureThreeExportHost() {",
      "  const existing = document.querySelector('[data-magicpaint-threejs]');",
      "  const host = existing || document.body.appendChild(document.createElement('div'));",
      "  host.dataset.magicpaintThreejs = 'true';",
      "  host.classList.add('magicpaint-threejs-export');",
      "  const width = Number(data.width || 1280);",
      "  const height = Number(data.height || 720);",
      "  host.innerHTML = [",
      "    '<style>',",
      "    '*{box-sizing:border-box}',",
      "    'body{margin:0;min-height:100vh;background:#101114;color:#e6e8ee;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;overflow:auto}',",
      "    '.magicpaint-threejs-export{display:flex;flex-direction:column;gap:10px;align-items:center;padding:20px}',",
      "    '.three-preview-canvas{background:#111;max-width:96vw;max-height:84vh;border:1px solid #2a2d35;border-radius:8px;box-shadow:0 18px 45px rgba(0,0,0,.45)}',",
      "    '.three-preview-bar{display:flex;align-items:center;gap:8px;min-height:34px;color:#b8bdc8;font-size:12px;flex-wrap:wrap;justify-content:center}',",
      "    'button{height:30px;padding:0 10px;border:1px solid #3a3f4b;border-radius:6px;background:#1d2027;color:#eef2ff;cursor:pointer}',",
      "    'button:hover{border-color:#3B8AE6;background:#262b35}',",
      "    '.three-preview-status{color:#8f96a8}',",
      "    '.three-preview-warn{max-width:min(760px,96vw);color:#d0a85a;font-size:12px;text-align:center;line-height:1.5}',",
      "    '</style>',",
      "    '<canvas class=\"three-preview-canvas\" width=\"' + width + '\" height=\"' + height + '\"></canvas>',",
      "    '<div class=\"three-preview-bar\"><button class=\"three-preview-play\" type=\"button\">停止</button><button class=\"three-preview-restart\" type=\"button\">最初から</button><span class=\"three-preview-time\">0.00s</span><span class=\"three-preview-status\">Three.js 読み込み中</span></div>',",
      "    '<div class=\"three-preview-warn\"></div>'",
      "  ].join('');",
      "  return host;",
      "}",
      "",
      "export async function startMagicPaintThreeJS(container = null) {",
      "  const host = container || ensureThreeExportHost();",
      "  const statusEl = host.querySelector('.three-preview-status');",
      "  const warnEl = host.querySelector('.three-preview-warn');",
      "  try {",
      "    const THREE = await import(THREE_URL);",
      "    return mountThreeTexturePreview(THREE, data, host);",
      "  } catch (err) {",
      "    console.error(err);",
      "    if (statusEl) statusEl.textContent = 'Three.js 読み込み失敗';",
      "    if (warnEl) warnEl.textContent = 'Three.js moduleを読み込めませんでした。ネットワークまたはCDNを確認してください。';",
      "    return null;",
      "  }",
      "}",
      "",
      "if (document.readyState === 'loading') {",
      "  document.addEventListener('DOMContentLoaded', () => startMagicPaintThreeJS(), { once: true });",
      "} else {",
      "  startMagicPaintThreeJS();",
      "}",
      ""
    ].join("\n");
  }

  function mountThreeTexturePreview(THREE, data, modal, userCode) {
    const canvas = modal.querySelector(".three-preview-canvas");
    const statusEl = modal.querySelector(".three-preview-status");
    const warnEl = modal.querySelector(".three-preview-warn");
    const playBtn = modal.querySelector(".three-preview-play");
    const restartBtn = modal.querySelector(".three-preview-restart");
    const timeEl = modal.querySelector(".three-preview-time");
    const width = Math.max(1, Number(data.width || canvas.width || 1280));
    const height = Math.max(1, Number(data.height || canvas.height || 720));

    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = width;
    textureCanvas.height = height;
    const tctx = textureCanvas.getContext("2d");

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "default" });
    } catch (err) {
      console.error("[Three.js renderer failed]", err);
      statusEl.textContent = "WebGL作成失敗";
      warnEl.textContent = "この環境ではThree.jsのWebGLRendererを作成できませんでした。";
      return () => {};
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x111111, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, -10, 10);
    camera.position.z = 1;

    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: false, depthTest: false, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    scene.add(plane);

    let playing = true;
    let start = performance.now();
    let pauseAt = 0;
    let lastDraw = 0;
    let frameId = 0;
    let disposed = false;
    const fps = Math.max(1, Number(data.fps || 24));
    const shapes = Array.isArray(data.shapes) ? data.shapes : [];
    const imageCache = new Map();

    function getImage(src) {
      const key = String(src || "");
      let rec = imageCache.get(key);
      if (!rec) {
        const img = new Image();
        rec = { img, loaded: false, error: false };
        img.onload = () => { rec.loaded = true; };
        img.onerror = () => { rec.error = true; };
        if (key) img.src = key;
        imageCache.set(key, rec);
      }
      return rec;
    }

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    function polyPts(cx, cy, r, n, a0) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = a0 + i * 2 * Math.PI / n;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
      return pts;
    }

    function getBounds(s) {
      switch (s.type) {
        case "rect": return { x: s.x, y: s.y, w: s.w, h: s.h };
        case "webgl-image": return { x: Number(s.x || 0), y: Number(s.y || 0), w: Math.max(1, Number(s.w || 1)), h: Math.max(1, Number(s.h || 1)) };
        case "circle": return { x: s.cx - s.rx, y: s.cy - s.ry, w: s.rx * 2, h: s.ry * 2 };
        case "triangle":
        case "polygon": {
          const n = s.type === "triangle" ? 3 : (s.sides || 6);
          const sx = s.scaleX || 1;
          const sy = s.scaleY || 1;
          const a0 = s.type === "triangle" ? ((s.rot || 0) - 90) * Math.PI / 180 : (s.rot || 0) * Math.PI / 180;
          const xs = [];
          const ys = [];
          for (let i = 0; i < n; i++) {
            const a = a0 + i * 2 * Math.PI / n;
            xs.push(s.cx + (s.r || 1) * Math.cos(a) * sx);
            ys.push(s.cy + (s.r || 1) * Math.sin(a) * sy);
          }
          const x = Math.min(...xs);
          const y = Math.min(...ys);
          return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
        }
        case "star": return getPointsBounds(starPoints(s), 0);
        case "line": return getPointsBounds([{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }], (s.sw || 2) / 2);
        case "pen":
        case "brush":
        case "mod-brush": return getPointsBounds(s.pts || [], (s.sw || 2) / 2);
        default: return { x: 0, y: 0, w: 0, h: 0 };
      }
    }

    function getPointsBounds(pts, pad) {
      if (!pts || !pts.length) return { x: 0, y: 0, w: 0, h: 0 };
      const xs = pts.map(p => p.x);
      const ys = pts.map(p => p.y);
      const x = Math.min(...xs) - (pad || 0);
      const y = Math.min(...ys) - (pad || 0);
      return { x, y, w: Math.max(...xs) - Math.min(...xs) + (pad || 0) * 2, h: Math.max(...ys) - Math.min(...ys) + (pad || 0) * 2 };
    }

    function getCenter(s) {
      switch (s.type) {
        case "rect": return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
        case "circle": return { x: s.cx, y: s.cy };
        case "triangle":
        case "polygon":
        case "star": return { x: s.cx, y: s.cy };
        case "line": return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
        default: {
          const b = getBounds(s);
          return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        }
      }
    }

    function starPoints(s) {
      const outer = s.r || 40;
      const inner = outer * (s.innerRatio || 0.45);
      const points = s.points || 5;
      const sx = s.scaleX || 1;
      const sy = s.scaleY || 1;
      const rot = (s.rot || -90) * Math.PI / 180;
      const pts = [];
      for (let i = 0; i < points * 2; i++) {
        const rr = i % 2 === 0 ? outer : inner;
        const a = rot + i * Math.PI / points;
        pts.push({ x: s.cx + Math.cos(a) * rr * sx, y: s.cy + Math.sin(a) * rr * sy });
      }
      return pts;
    }

    function getGroupMembers(groupId, includeHidden = false) {
      if (!groupId) return [];
      return shapes.filter(s => s.groupId === groupId && (includeHidden || !s.hidden));
    }

    function getGroupBounds(groupId) {
      const members = getGroupMembers(groupId, false);
      if (!members.length) return null;
      let x1 = Infinity;
      let y1 = Infinity;
      let x2 = -Infinity;
      let y2 = -Infinity;
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
      return Boolean(s && ((s.animPath && s.animPath.length > 1) || (s.keyframes && s.keyframes.length) || s.autoRotate));
    }

    function getGroupAnimationOwner(groupId) {
      const members = getGroupMembers(groupId, true);
      return members.find(s => s.groupAnimOwner && shapeHasAnimation(s)) || members.find(shapeHasAnimation) || members[0] || null;
    }

    function userKeyframesForShape(s) {
      return (s && s.keyframes ? s.keyframes : []).filter(k => !k.autoHold).sort((a, b) => a.t - b.t);
    }

    function getPathTimeRange(s) {
      const dur = Number(data.totalDur || 3);
      const pathStartT = Number(s && s.pathStartT);
      const pathStartKf = userKeyframesForShape(s).find(k => k.pathStart || k.kind === "path-start");
      let startTime = Number.isFinite(pathStartT)
        ? pathStartT
        : (pathStartKf ? Number(pathStartKf.t) : 0);
      let endTime = Number.isFinite(Number(s && s.pathEndT)) ? Number(s.pathEndT) : dur;
      startTime = Math.max(0, Math.min(dur, startTime));
      endTime = Math.max(0, Math.min(dur, endTime));
      if (endTime <= startTime) {
        if (startTime >= dur) startTime = Math.max(0, dur - 0.5);
        endTime = Math.min(dur, startTime + 0.5);
      }
      if (endTime <= startTime) endTime = Math.max(startTime + 0.01, dur);
      return { start: startTime, end: endTime };
    }

    function getPathProgressForTime(s, localTime, fallbackProgress) {
      if (!s || !s.animPath || s.animPath.length < 2) return null;
      const range = getPathTimeRange(s);
      if (localTime <= range.start) return 0;
      if (localTime >= range.end) return 1;
      return (localTime - range.start) / Math.max(0.001, range.end - range.start);
    }

    function interpKF(kfs, time) {
      if (!kfs || !kfs.length) return null;
      const sorted = kfs.slice().sort((a, b) => a.t - b.t);
      const before = sorted.filter(k => k.t <= time);
      const after = sorted.filter(k => k.t > time);
      if (!before.length) return null;
      if (!after.length) return Object.assign({}, sorted[sorted.length - 1].props);
      const k0 = before[before.length - 1];
      const k1 = after[0];
      const denom = Math.max(0.001, k1.t - k0.t);
      const f = (time - k0.t) / denom;
      function lerp(key) {
        const a = Number(k0.props && k0.props[key]);
        const b = Number(k1.props && k1.props[key]);
        return Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * f : undefined;
      }
      return { opa: lerp("opa"), rot: lerp("rot"), x: lerp("x"), y: lerp("y"), color: k0.props && k0.props.color };
    }

    function getPathPos(t, path) {
      if (!path || path.length < 2) return null;
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
      let dist = clamp(t, 0, 1) * total;
      for (const seg of segs) {
        if (dist <= seg.len) {
          const f = dist / seg.len;
          return { x: seg.a.x + (seg.b.x - seg.a.x) * f, y: seg.a.y + (seg.b.y - seg.a.y) * f };
        }
        dist -= seg.len;
      }
      return path[path.length - 1];
    }

    function applyAnimationTransform(ctx, owner, center, localTime, progress) {
      const kfP = interpKF(owner && owner.keyframes, localTime);
      const pathProgress = getPathProgressForTime(owner, localTime, progress);
      const pos = getPathPos(pathProgress !== null ? pathProgress : progress, owner && owner.animPath);
      const pathDx = pos && owner.animPath && owner.animPath[0] ? pos.x - owner.animPath[0].x : 0;
      const pathDy = pos && owner.animPath && owner.animPath[0] ? pos.y - owner.animPath[0].y : 0;
      const useKfPosition = !(owner && owner.animPath && owner.animPath.length > 1);
      const kfDx = useKfPosition && kfP && Number.isFinite(Number(kfP.x)) ? Number(kfP.x) - center.x : 0;
      const kfDy = useKfPosition && kfP && Number.isFinite(Number(kfP.y)) ? Number(kfP.y) - center.y : 0;
      const dx = pathDx + kfDx;
      const dy = pathDy + kfDy;
      if (dx || dy) ctx.translate(dx, dy);

      const kfRot = kfP && Number.isFinite(Number(kfP.rot)) ? Number(kfP.rot) : null;
      const baseRot = Number(owner && owner.rot || 0);
      const autoRot = owner && owner.autoRotate ? Number(owner.autoRotate) * localTime : 0;
      const rotDelta = (kfRot !== null ? kfRot - baseRot : 0) + autoRot;
      if (rotDelta) {
        ctx.translate(center.x, center.y);
        ctx.rotate(rotDelta * Math.PI / 180);
        ctx.translate(-center.x, -center.y);
      }
      return kfP;
    }

    function drawShape(ctx, s, kfP) {
      if (!s || s.hidden) return;
      const color = kfP && kfP.color ? kfP.color : (s.color || "#ffffff");
      const kfOpa = kfP && Number.isFinite(Number(kfP.opa)) ? Number(kfP.opa) : null;
      ctx.save();
      ctx.globalAlpha = clamp((kfOpa !== null ? kfOpa : Number(s.opa || 100)) / 100, 0, 1);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1, Number(s.sw || 2));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(s.dash && s.dash !== "0" ? String(s.dash).split(",").map(Number) : []);

      switch (s.type) {
        case "rect":
          ctx.translate(s.x + s.w / 2, s.y + s.h / 2);
          ctx.rotate((s.rot || 0) * Math.PI / 180);
          roundRect(ctx, -s.w / 2, -s.h / 2, s.w, s.h, s.rr || 0);
          if (s.fill) ctx.fill();
          ctx.stroke();
          break;
        case "webgl-image": {
          const w = Math.max(1, Number(s.w || 1));
          const h = Math.max(1, Number(s.h || 1));
          const x = Number(s.x || 0);
          const y = Number(s.y || 0);
          const rec = getImage(s.src);
          ctx.translate(x + w / 2, y + h / 2);
          ctx.rotate((s.rot || 0) * Math.PI / 180);
          if (rec.loaded && rec.img.naturalWidth) {
            ctx.drawImage(rec.img, -w / 2, -h / 2, w, h);
          } else {
            ctx.fillStyle = rec.error ? "rgba(216,90,48,.18)" : "rgba(255,255,255,.08)";
            ctx.strokeStyle = rec.error ? "rgba(216,90,48,.8)" : "rgba(255,255,255,.35)";
            ctx.setLineDash([6, 4]);
            ctx.fillRect(-w / 2, -h / 2, w, h);
            ctx.strokeRect(-w / 2, -h / 2, w, h);
            ctx.setLineDash([]);
          }
          break;
        }
        case "circle":
          ctx.beginPath();
          ctx.ellipse(s.cx, s.cy, s.rx, s.ry, (s.rot || 0) * Math.PI / 180, 0, Math.PI * 2);
          if (s.fill) ctx.fill();
          ctx.stroke();
          break;
        case "triangle":
        case "polygon": {
          const n = s.type === "triangle" ? 3 : (s.sides || 6);
          const scX = s.scaleX || 1;
          const scY = s.scaleY || 1;
          const angle = s.type === "triangle" ? ((s.rot || 0) - 90) * Math.PI / 180 : (s.rot || 0) * Math.PI / 180;
          ctx.translate(s.cx, s.cy);
          ctx.scale(scX, scY);
          ctx.rotate(angle);
          const pts = polyPts(0, 0, s.r || 1, n, 0);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          ctx.closePath();
          if (s.fill) ctx.fill();
          ctx.stroke();
          break;
        }
        case "star": {
          const pts = starPoints({ ...s, cx: 0, cy: 0, rot: 0 });
          ctx.translate(s.cx, s.cy);
          ctx.rotate((s.rot || -90) * Math.PI / 180);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          ctx.closePath();
          if (s.fill) ctx.fill();
          ctx.stroke();
          break;
        }
        case "line":
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
          break;
        case "pen":
        case "brush":
        case "mod-brush":
          if (s.pts && s.pts.length > 1) {
            ctx.beginPath();
            ctx.moveTo(s.pts[0].x, s.pts[0].y);
            s.pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
            ctx.stroke();
          }
          break;
        default: {
          const b = getBounds(s);
          if (b.w || b.h) {
            ctx.globalAlpha *= 0.55;
            ctx.strokeRect(b.x, b.y, b.w, b.h);
          }
          break;
        }
      }
      ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function drawAnimatedScene(ctx, localTime, progress) {
      const drawnGroups = new Set();
      for (const raw of shapes) {
        if (!raw || raw.hidden) continue;

        if (raw.groupId) {
          if (drawnGroups.has(raw.groupId)) continue;
          drawnGroups.add(raw.groupId);
          const members = getGroupMembers(raw.groupId, false);
          const owner = getGroupAnimationOwner(raw.groupId);
          const b = getGroupBounds(raw.groupId);
          if (!members.length || !owner || !b) continue;
          const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
          ctx.save();
          const kfP = applyAnimationTransform(ctx, owner, center, localTime, progress);
          members.forEach(member => drawShape(ctx, member, kfP));
          ctx.restore();
          continue;
        }

        const center = getCenter(raw);
        ctx.save();
        const kfP = applyAnimationTransform(ctx, raw, center, localTime, progress);
        drawShape(ctx, raw, kfP);
        ctx.restore();
      }
    }

    function drawEmptyMessage(ctx) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,.72)";
      ctx.font = "16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.restore();
    }

    function drawFrame(localTime, progress) {
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, width, height);
      tctx.fillStyle = data.bg || "#111111";
      tctx.fillRect(0, 0, width, height);
      if (shapes.length) drawAnimatedScene(tctx, localTime, progress);
      else drawEmptyMessage(tctx);
    }

    function render(now) {
      if (disposed) return;
      const interval = 1000 / fps;
      if (now - lastDraw < interval) {
        frameId = requestAnimationFrame(render);
        return;
      }
      lastDraw = now;

      const dur = Math.max(0.01, Number(data.totalDur || 3));
      const elapsed = playing ? (now - start) / 1000 : pauseAt;
      const localTime = data.looping ? (elapsed % dur) : Math.min(elapsed, dur);
      const progress = dur > 0 ? localTime / dur : 0;

      drawFrame(localTime, progress);
      texture.needsUpdate = true;
      renderer.render(scene, camera);

      timeEl.textContent = localTime.toFixed(2) + "s";
      statusEl.textContent = "Three.js texture / " + shapes.length + " shapes";
      warnEl.textContent = shapes.length ? "" : "シーン取得時点で図形が0件です。編集キャンバス側に図形があるか確認してください。";
      frameId = requestAnimationFrame(render);
    }

    playBtn.addEventListener("click", function () {
      playing = !playing;
      if (playing) {
        start = performance.now() - pauseAt * 1000;
        this.textContent = "停止";
      } else {
        pauseAt = (performance.now() - start) / 1000;
        this.textContent = "再生";
      }
    });

    restartBtn.addEventListener("click", function () {
      start = performance.now();
      pauseAt = 0;
      playing = true;
      playBtn.textContent = "停止";
    });

    statusEl.textContent = "Three.js texture / ready";
    frameId = requestAnimationFrame(render);

    let userCleanup = () => {};
    const userCanvas = modal.querySelector(".three-user-canvas");
    if (userCanvas && userCode) {
      try {
        const prevCleanup = window.__threeCleanup;
        window.__threeCleanup = null;
        const fn = new Function("THREE", "canvas", "width", "height", userCode);
        fn(THREE, userCanvas, width, height);
        userCleanup = () => {
          try { window.__threeCleanup?.(); } catch (_) {}
          window.__threeCleanup = prevCleanup ?? null;
        };
      } catch (err) {
        console.warn("[Three.js user code error]", err);
        warnEl.textContent = "JSコードエラー: " + String(err.message || err);
      }
    }

    return () => {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      texture.dispose();
      material.dispose();
      plane.geometry.dispose();
      renderer.dispose();
      userCleanup();
    };
  }

  // ── JS エディタモード登録 ──────────────────────────────────────────

  const THREE_JS_PLACEHOLDER =
`// Three.js mode — canvas / width / height が使えます
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(width, height, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.z = 5;

const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshBasicMaterial({ color: 0x3B8AE6, wireframe: true });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

let rafId;
function animate() {
  rafId = requestAnimationFrame(animate);
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
animate();

window.__threeCleanup = () => {
  cancelAnimationFrame(rafId);
  renderer.dispose();
};`;

  const HTML_PLACEHOLDER =
`<div style="
  position:fixed;bottom:24px;right:24px;
  background:rgba(22,22,22,.95);
  color:#e8e6df;padding:14px 18px;
  border-radius:10px;
  border:1px solid rgba(59,138,230,.5);
  font-family:system-ui,sans-serif;font-size:13px;
  box-shadow:0 8px 32px rgba(0,0,0,.4);
  z-index:5000;pointer-events:none
">
  🎨 HTMLオーバーレイのサンプル
</div>`;

  const CSS_PLACEHOLDER =
`/* カスタムCSSを書いてください */
/* 例: キャンバスにフィルターをかける */
#cv {
  filter: saturate(1.4) brightness(1.1);
}`;

  function stopThreeJsOverlay() {
    try { window.__threeCleanup?.(); } catch (_) {}
    window.__threeCleanup = null;
    document.getElementById('je-threejs-overlay')?.remove();
    if (_threeLayerObj && api.removeObject) {
      api.removeObject(_threeLayerObj.id);
      _threeLayerObj = null;
    }
  }

  function openThreeJsPreview(code, download = false) {
    const cvEl = document.getElementById('cv');
    const w = cvEl ? cvEl.width : 800;
    const h = cvEl ? cvEl.height : 600;
    const escapedCode = JSON.stringify(code);
    const html = [
      '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">',
      '<title>Three.js Preview</title><style>',
      '*{box-sizing:border-box;margin:0}',
      'body{background:#111;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;gap:10px}',
      'canvas{max-width:96vw;max-height:88vh;border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.45);display:block}',
      '#bar{display:flex;align-items:center;gap:8px;color:#ddd;font-size:12px}',
      'button{background:#222;color:#eee;border:1px solid #444;border-radius:6px;padding:6px 10px;cursor:pointer}',
      'button:hover{border-color:#3B8AE6}',
      '#err{color:#e74c3c;font-size:12px;padding:8px 16px;max-width:680px;white-space:pre-wrap;display:none}',
      '</style></head><body>',
      '<canvas id="pv" width="' + w + '" height="' + h + '"></canvas>',
      '<div id="bar"><button id="btn-stop">停止</button><button id="btn-restart">最初から</button></div>',
      '<div id="err"></div>',
      '<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"><\\/script>',
      '<script>',
      'const canvas=document.getElementById("pv");',
      'const width=' + w + ',height=' + h + ';',
      'const errEl=document.getElementById("err");',
      'const code=' + escapedCode + ';',
      'try{const fn=new Function("THREE","canvas","width","height",code);fn(THREE,canvas,width,height);}',
      'catch(e){errEl.textContent="エラー: "+e.message;errEl.style.display="block";console.error(e);}',
      'document.getElementById("btn-stop").addEventListener("click",()=>{try{window.__threeCleanup?.();}catch(_){}document.getElementById("btn-stop").textContent="停止済み";});',
      'document.getElementById("btn-restart").addEventListener("click",()=>location.reload());',
      '<\\/script></body></html>'
    ].join('');
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement('a');
      a.href = url; a.download = 'threejs-preview.html';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      window.toast?.('ti-file-export', 'Three.js HTMLを書き出しました');
      return;
    }
    const win = window.open(url, 'mlc-threejs-preview',
      'width=' + Math.min(w + 60, 1400) + ',height=' + Math.min(h + 110, 900));
    if (!win) window.toast?.('ti-alert-triangle', 'ポップアップをブロックされました');
    else setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function openHtmlPreview(code, download = false) {
    const html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>HTML Preview</title>' +
      '<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#111;color:#e8e6df;font-family:system-ui,sans-serif}</style>' +
      '</head><body>' + code + '</body></html>';
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    if (download) {
      const a = document.createElement('a');
      a.href = url; a.download = 'preview.html';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else {
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  function injectEditorModeOptions() {
    const select = document.getElementById('je-mode-select');
    if (!select) return;
    const defs = [
      { value: 'threejs', label: 'Three.js' },
      { value: 'html',    label: 'HTML'     },
      { value: 'css',     label: 'CSS'      }
    ];
    for (const m of defs) {
      if (!select.querySelector('option[value="' + m.value + '"]')) {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.label;
        select.appendChild(opt);
      }
    }
  }

  function registerEditorModeHandlers() {
    window.__jeModeHandlers = window.__jeModeHandlers || {};

    window.__jeModeHandlers['threejs'] = {
      activate(modeSelect, genBtn, runBtn, codeEl) {
        modeSelect.classList.add('threejs-mode');
        genBtn.classList.add('hidden');
        runBtn.classList.remove('hidden');
        runBtn.innerHTML = '<i class="ti ti-player-play"></i> Three.js実行';
        codeEl.placeholder = '// Three.jsコードをここに書いてください';
        const cached = window.__jeCodeCache?.threejs;
        codeEl.value = cached !== undefined ? cached : THREE_JS_PLACEHOLDER;
        codeEl.dataset.manual = '1';
      },
      run(code) {
        stopThreeJsOverlay(); // 既存オーバーレイ＆レイヤーオブジェクトをクリア
        const cvEl = document.getElementById('cv');
        const wrap = document.getElementById('cv-wrap');
        const w = cvEl ? cvEl.width : 1280;
        const h = cvEl ? cvEl.height : 720;
        const overlay = document.createElement('canvas');
        overlay.id = 'je-threejs-overlay';
        overlay.width = w;
        overlay.height = h;
        overlay.style.cssText = 'position:absolute;top:0;left:0;width:' + w + 'px;height:' + h + 'px;display:block;pointer-events:none;z-index:20;';
        if (wrap) wrap.appendChild(overlay);

        // レイヤーパネルに登録
        if (api.addObject) {
          _threeLayerObj = api.addObject({
            type: 'threejs-overlay',
            engine: 'threejs',
            name: 'Three.js レイヤー',
            color: '#3B8AE6',
            sw: 1, opa: 100, dash: '0', fill: false
          });
        }

        // レイヤー表示/非表示をオーバーレイに反映（一度だけ登録）
        if (api.registerThreeRenderer && !api._threeJsOverlayHooked) {
          api._threeJsOverlayHooked = true;
          api.registerThreeRenderer({
            onLayerVisibility(layerId, visible) {
              if (_threeLayerObj && _threeLayerObj.layerId === layerId) {
                const el = document.getElementById('je-threejs-overlay');
                if (el) el.style.display = visible ? 'block' : 'none';
              }
            },
            onObjectHidden(objectId, hidden) {
              if (_threeLayerObj && _threeLayerObj.id === objectId) {
                const el = document.getElementById('je-threejs-overlay');
                if (el) el.style.display = hidden ? 'none' : 'block';
              }
            },
            onLayerLock() {}
          });
        }

        window.jeLog?.('Three.js を読み込み中...', 'warn');
        loadThree().then(THREE => {
          try {
            window.__threeCleanup?.();
            window.__threeCleanup = null;
            const fn = new Function('THREE', 'canvas', 'width', 'height', code);
            fn(THREE, overlay, w, h);
            window.jeLog?.('✓ Three.js 実行完了', 'ok');
            window.setStatus?.('Three.js 実行中');
          } catch (e) {
            window.jeLog?.('✗ ' + e.message, 'error');
            window.toast?.('ti-alert-triangle', e.message.slice(0, 60));
          }
        }).catch(() => {
          window.jeLog?.('✗ Three.js 読み込み失敗', 'error');
        });
      },
      stop() { stopThreeJsOverlay(); },
      preview(code, download) { openThreeJsPreview(code, download); }
    };

    window.__jeModeHandlers['html'] = {
      activate(modeSelect, genBtn, runBtn, codeEl) {
        modeSelect.classList.add('html-mode');
        genBtn.classList.add('hidden');
        runBtn.classList.remove('hidden');
        runBtn.innerHTML = '<i class="ti ti-player-play"></i> HTML実行';
        codeEl.placeholder = '<!-- HTMLを書いてください -->';
        const cached = window.__jeCodeCache?.html;
        codeEl.value = cached !== undefined ? cached : HTML_PLACEHOLDER;
        codeEl.dataset.manual = '1';
      },
      run(code) {
        document.getElementById('je-html-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'je-html-overlay';
        overlay.innerHTML = code;
        document.body.appendChild(overlay);
        window.jeLog?.('✓ HTML実行完了', 'ok');
      },
      stop() { document.getElementById('je-html-overlay')?.remove(); },
      preview(code, download) { openHtmlPreview(code, download); }
    };

    window.__jeModeHandlers['css'] = {
      activate(modeSelect, genBtn, runBtn, codeEl) {
        modeSelect.classList.add('css-mode');
        genBtn.classList.add('hidden');
        runBtn.classList.remove('hidden');
        runBtn.innerHTML = '<i class="ti ti-player-play"></i> CSS適用';
        codeEl.placeholder = '/* CSSを書いてください */';
        const cached = window.__jeCodeCache?.css;
        codeEl.value = cached !== undefined ? cached : CSS_PLACEHOLDER;
        codeEl.dataset.manual = '1';
      },
      run(code) {
        let style = document.getElementById('je-css-inject');
        if (!style) {
          style = document.createElement('style');
          style.id = 'je-css-inject';
          document.head.appendChild(style);
        }
        style.textContent = code;
        window.jeLog?.('✓ CSS適用完了', 'ok');
      },
      stop() { document.getElementById('je-css-inject')?.remove(); },
      preview(code, download) { window.jeLog?.('CSSモードではCanvasプレビューを使います', 'warn'); }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectEditorModeOptions();
      registerEditorModeHandlers();
    });
  } else {
    injectEditorModeOptions();
    registerEditorModeHandlers();
  }

})();

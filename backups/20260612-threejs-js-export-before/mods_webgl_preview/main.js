(function () {
  const api = window.AnimationApp;
  if (!api) return;

  const MOD_ID = "webgl_preview";
  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js";
  let threeModulePromise = null;
  let activeCleanup = null;

  api.registerMod({
    id: MOD_ID,
    name: "Three.jsプレビューMOD",
    level: 2,
    description: "現在のシーンをThree.jsのCanvasTextureで再生・HTML書き出しします。"
  });

  if (!api.registerUI) return;

  api.registerUI({
    id: "webgl_preview_top",
    position: "top",
    html: '<button class="tb-btn webgl-preview-btn threejs-preview-btn" id="webgl-preview-btn" title="Three.jsプレビューを開く"><i class="ti ti-cube"></i><span>Three.js</span></button><button class="tb-btn threejs-export-btn" id="three-export-btn" title="Three.js HTMLを書き出す"><i class="ti ti-file-export"></i><span>書出</span></button>',
    onMount(el, appApi) {
      const btn = el.querySelector("#webgl-preview-btn");
      const exportBtn = el.querySelector("#three-export-btn");
      if (!btn || !exportBtn) return;

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

      exportBtn.addEventListener("click", () => {
        const scene = getScene();
        if (scene) exportThreeHTML(scene, appApi);
      });
    }
  });

  function loadThree() {
    if (!threeModulePromise) threeModulePromise = import(THREE_URL);
    return threeModulePromise;
  }

  function openThreePreviewModal(scene, appApi) {
    closeThreePreviewModal();
    scene = scene || {};

    const modal = document.createElement("div");
    modal.id = "three-preview-modal";
    modal.innerHTML = [
      '<div class="three-preview-card" role="dialog" aria-modal="true" aria-label="Three.jsプレビュー">',
      '  <div class="three-preview-head">',
      '    <div class="three-preview-title"><i class="ti ti-cube"></i><span>Three.js Preview</span></div>',
      '    <button class="three-preview-close" type="button" title="閉じる"><i class="ti ti-x"></i></button>',
      '  </div>',
      '  <div class="three-preview-stage">',
      '    <canvas class="three-preview-canvas" width="' + Number(scene.width || 1280) + '" height="' + Number(scene.height || 720) + '"></canvas>',
      '  </div>',
      '  <div class="three-preview-bar">',
      '    <button class="three-preview-play" type="button">停止</button>',
      '    <button class="three-preview-restart" type="button">最初から</button>',
      '    <button class="three-preview-export" type="button">HTML書出</button>',
      '    <span class="three-preview-time">0.00s</span>',
      '    <span class="three-preview-status">Three.js 読み込み中</span>',
      '  </div>',
      '  <div class="three-preview-warn"></div>',
      '</div>'
    ].join('');

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector(".three-preview-close");
    const exportBtn = modal.querySelector(".three-preview-export");
    closeBtn.addEventListener("click", closeThreePreviewModal);
    exportBtn.addEventListener("click", () => exportThreeHTML(scene, appApi));
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
        activeCleanup = mountThreeTexturePreview(THREE, scene, modal);
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

  function exportThreeHTML(scene, appApi) {
    scene = scene || {};
    const html = buildThreeExportHTML(scene);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "magicpaint-threejs.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    appApi.toast("ti-file-export", "Three.js HTMLを書き出しました");
  }

  function buildThreeExportHTML(scene) {
    scene = scene || {};
    const json = JSON.stringify(scene).split("</").join("<\\/");
    const runtime = mountThreeTexturePreview.toString();
    const width = Number(scene.width || 1280);
    const height = Number(scene.height || 720);

    return [
      "<!DOCTYPE html>",
      '<html lang="ja">',
      "<head>",
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      "<title>MagicPaint.JS Three.js Export</title>",
      "<style>",
      "*{box-sizing:border-box}",
      "body{margin:0;min-height:100vh;background:#101114;color:#e6e8ee;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;overflow:auto}",
      ".three-export-wrap{display:flex;flex-direction:column;gap:10px;align-items:center;padding:20px}",
      ".three-preview-canvas{background:#111;max-width:96vw;max-height:84vh;border:1px solid #2a2d35;border-radius:8px;box-shadow:0 18px 45px rgba(0,0,0,.45)}",
      ".three-preview-bar{display:flex;align-items:center;gap:8px;min-height:34px;color:#b8bdc8;font-size:12px;flex-wrap:wrap;justify-content:center}",
      "button{height:30px;padding:0 10px;border:1px solid #3a3f4b;border-radius:6px;background:#1d2027;color:#eef2ff;cursor:pointer}",
      "button:hover{border-color:#3B8AE6;background:#262b35}",
      ".three-preview-status{color:#8f96a8}",
      ".three-preview-warn{max-width:min(760px,96vw);color:#d0a85a;font-size:12px;text-align:center;line-height:1.5}",
      "</style>",
      "</head>",
      "<body>",
      '<div class="three-export-wrap">',
      '<canvas class="three-preview-canvas" width="' + width + '" height="' + height + '"></canvas>',
      '<div class="three-preview-bar"><button class="three-preview-play" type="button">停止</button><button class="three-preview-restart" type="button">最初から</button><span class="three-preview-time">0.00s</span><span class="three-preview-status">Three.js 読み込み中</span></div>',
      '<div class="three-preview-warn"></div>',
      "</div>",
      '<script type="module">',
      'const statusEl = document.querySelector(".three-preview-status");',
      'const warnEl = document.querySelector(".three-preview-warn");',
      'try {',
      '  const THREE = await import("' + THREE_URL + '");',
      '  const data = ' + json + ';',
      '  const mountThreeTexturePreview = ' + runtime + ';',
      '  mountThreeTexturePreview(THREE, data, document);',
      '} catch (err) {',
      '  console.error(err);',
      '  statusEl.textContent = "Three.js 読み込み失敗";',
      '  warnEl.textContent = "Three.js moduleを読み込めませんでした。ネットワークまたはCDNを確認してください。";',
      '}',
      "<\/script>",
      "</body>",
      "</html>"
    ].join("\n");
  }

  function mountThreeTexturePreview(THREE, data, modal) {
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
      const userKfs = userKeyframesForShape(s);
      let startTime = userKfs.length ? Number(userKfs[0].t) : 0;
      let endTime = Number.isFinite(Number(s && s.pathEndT)) ? Number(s.pathEndT) : Number(data.totalDur || 3);
      const dur = Number(data.totalDur || 3);
      startTime = Math.max(0, Math.min(dur, startTime));
      endTime = Math.max(0, Math.min(dur, endTime));
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
      ctx.fillText("Three.js preview: 図形データがありません", width / 2, height / 2);
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

    return () => {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      texture.dispose();
      material.dispose();
      plane.geometry.dispose();
      renderer.dispose();
    };
  }
})();

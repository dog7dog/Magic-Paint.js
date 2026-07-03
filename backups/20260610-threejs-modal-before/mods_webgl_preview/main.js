(function () {
  const api = window.AnimationApp;
  if (!api) return;

  const MOD_ID = "webgl_preview";
  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js";

  api.registerMod({
    id: MOD_ID,
    name: "Three.jsプレビューMOD",
    level: 2,
    description: "現在のシーンをThree.jsで別ウィンドウ再生します。"
  });

  if (!api.registerUI) return;

  api.registerUI({
    id: "webgl_preview_top",
    position: "top",
    html: '<button class="tb-btn webgl-preview-btn threejs-preview-btn" id="webgl-preview-btn" title="Three.jsプレビューを開く"><i class="ti ti-cube"></i><span>Three.js</span></button>',
    onMount(el, appApi) {
      const btn = el.querySelector("#webgl-preview-btn");
      if (!btn) return;

      btn.addEventListener("click", () => {
        if (typeof appApi.getSceneSnapshot !== "function") {
          appApi.toast("ti-alert-triangle", "Three.js用のシーン取得APIがありません");
          return;
        }

        const scene = appApi.getSceneSnapshot();
        openThreePreview(scene, appApi);
      });
    }
  });

  function openThreePreview(scene, appApi) {
    const width = Math.min((scene && scene.width ? scene.width : 1280) + 80, 1500);
    const height = Math.min((scene && scene.height ? scene.height : 720) + 140, 950);
    const win = window.open("", "mlc-threejs-preview", "width=" + width + ",height=" + height);

    if (!win) {
      appApi.toast("ti-alert-triangle", "ポップアップをブロックされました");
      return;
    }

    win.document.open();
    win.document.write(buildPreviewHtml(scene));
    win.document.close();
    appApi.toast("ti-cube", "Three.jsプレビューを開きました");
  }

  function buildPreviewHtml(scene) {
    scene = scene || {};
    const json = JSON.stringify(scene).split("</").join("<\\/");
    const runtime = threePreviewRuntime.toString();

    return [
      "<!DOCTYPE html>",
      '<html lang="ja">',
      "<head>",
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      "<title>MagicPaint.JS Three.js Preview</title>",
      "<style>",
      "*{box-sizing:border-box}",
      "body{margin:0;min-height:100vh;background:#101114;color:#e6e8ee;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;overflow:auto}",
      "#wrap{display:flex;flex-direction:column;gap:10px;align-items:center;padding:20px}",
      "canvas{background:#111;max-width:96vw;max-height:84vh;border:1px solid #2a2d35;border-radius:8px;box-shadow:0 18px 45px rgba(0,0,0,.45)}",
      "#bar{display:flex;align-items:center;gap:8px;min-height:34px;color:#b8bdc8;font-size:12px;flex-wrap:wrap;justify-content:center}",
      "button{height:30px;padding:0 10px;border:1px solid #3a3f4b;border-radius:6px;background:#1d2027;color:#eef2ff;cursor:pointer}",
      "button:hover{border-color:#3B8AE6;background:#262b35}",
      "#status{color:#8f96a8}",
      "#warn{max-width:min(760px,96vw);color:#d0a85a;font-size:12px;text-align:center;line-height:1.5}",
      "</style>",
      "</head>",
      "<body>",
      '<div id="wrap">',
      '<canvas id="three-canvas" width="' + Number(scene.width || 1280) + '" height="' + Number(scene.height || 720) + '"></canvas>',
      '<div id="bar"><button id="play">停止</button><button id="restart">最初から</button><span id="time">0.00s</span><span id="status">Three.js 読み込み中</span></div>',
      '<div id="warn"></div>',
      "</div>",
      '<script type="module">',
      'const statusEl = document.getElementById("status");',
      'const warnEl = document.getElementById("warn");',
      'try {',
      '  const THREE = await import("' + THREE_URL + '");',
      '  const data = ' + json + ';',
      '  (' + runtime + ')(THREE, data);',
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

  function threePreviewRuntime(THREE, data) {
    const canvas = document.getElementById("three-canvas");
    const statusEl = document.getElementById("status");
    const warnEl = document.getElementById("warn");
    const width = Number(data.width || canvas.width || 1280);
    const height = Number(data.height || canvas.height || 720);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(parseThreeColor(data.bg || "#111111").color, 1);
    renderer.sortObjects = true;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, -1000, 1000);
    camera.position.z = 10;

    const root = new THREE.Group();
    scene.add(root);

    let playing = true;
    let start = performance.now();
    let pauseAt = 0;
    let lastDraw = 0;
    let renderOrder = 0;
    const fps = Math.max(1, Number(data.fps || 24));
    const unsupportedTypes = new Set();

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    function parseThreeColor(value) {
      const raw = String(value || "#ffffff").trim();
      const rgba = raw.match(/rgba?\(([^)]+)\)/i);
      if (rgba) {
        const parts = rgba[1].split(",").map(v => Number(v.trim()));
        const color = new THREE.Color((parts[0] || 255) / 255, (parts[1] || 255) / 255, (parts[2] || 255) / 255);
        return { color, alpha: Number.isFinite(parts[3]) ? parts[3] : 1 };
      }

      const color = new THREE.Color();
      try {
        color.setStyle(raw);
      } catch (e) {
        color.setStyle("#ffffff");
      }
      return { color, alpha: 1 };
    }

    function makeMaterial(colorValue, alpha) {
      const parsed = parseThreeColor(colorValue || "#ffffff");
      const opacity = clamp((Number.isFinite(alpha) ? alpha : 1) * parsed.alpha, 0, 1);
      return new THREE.MeshBasicMaterial({
        color: parsed.color,
        transparent: opacity < 1,
        opacity,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide
      });
    }

    function worldPos(x, y) {
      return new THREE.Vector3(x - width / 2, height / 2 - y, 0);
    }

    function localPoint(p, origin) {
      return new THREE.Vector2(p.x - origin.x, -(p.y - origin.y));
    }

    function rotateCanvasPoint(p, center, deg) {
      if (!deg) return { x: p.x, y: p.y };
      const rad = deg * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
    }

    function rectPoints(s) {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      return [
        { x: s.x, y: s.y },
        { x: s.x + s.w, y: s.y },
        { x: s.x + s.w, y: s.y + s.h },
        { x: s.x, y: s.y + s.h }
      ].map(p => rotateCanvasPoint(p, { x: cx, y: cy }, s.rot || 0));
    }

    function ellipsePoints(s, steps) {
      const pts = [];
      const rot = (s.rot || 0) * Math.PI / 180;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const n = steps || Math.max(32, Math.min(128, Math.ceil(Math.max(s.rx || 1, s.ry || 1) / 1.5)));
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n;
        const x = Math.cos(a) * (s.rx || 1);
        const y = Math.sin(a) * (s.ry || 1);
        pts.push({ x: s.cx + x * cos - y * sin, y: s.cy + x * sin + y * cos });
      }
      return pts;
    }

    function regularPolygonPoints(s) {
      const n = s.type === "triangle" ? 3 : Math.max(3, Number(s.sides || 6));
      const sx = s.scaleX || 1;
      const sy = s.scaleY || 1;
      const start = s.type === "triangle" ? ((s.rot || 0) - 90) : (s.rot || 0);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = start * Math.PI / 180 + i * Math.PI * 2 / n;
        pts.push({ x: s.cx + Math.cos(a) * (s.r || 1) * sx, y: s.cy + Math.sin(a) * (s.r || 1) * sy });
      }
      return pts;
    }

    function starPoints(s) {
      const outer = s.r || 40;
      const inner = outer * (s.innerRatio || 0.45);
      const points = s.points || 5;
      const sx = s.scaleX || 1;
      const sy = s.scaleY || 1;
      const start = (s.rot || -90) * Math.PI / 180;
      const pts = [];
      for (let i = 0; i < points * 2; i++) {
        const rr = i % 2 === 0 ? outer : inner;
        const a = start + i * Math.PI / points;
        pts.push({ x: s.cx + Math.cos(a) * rr * sx, y: s.cy + Math.sin(a) * rr * sy });
      }
      return pts;
    }

    function boundsFromPoints(pts, pad) {
      if (!pts || !pts.length) return { x: 0, y: 0, w: 0, h: 0 };
      const xs = pts.map(p => p.x);
      const ys = pts.map(p => p.y);
      const minX = Math.min.apply(null, xs);
      const minY = Math.min.apply(null, ys);
      const maxX = Math.max.apply(null, xs);
      const maxY = Math.max.apply(null, ys);
      return { x: minX - (pad || 0), y: minY - (pad || 0), w: maxX - minX + (pad || 0) * 2, h: maxY - minY + (pad || 0) * 2 };
    }

    function getBounds(s) {
      switch (s.type) {
        case "rect": return { x: s.x, y: s.y, w: s.w, h: s.h };
        case "circle": return { x: s.cx - s.rx, y: s.cy - s.ry, w: s.rx * 2, h: s.ry * 2 };
        case "triangle":
        case "polygon": return boundsFromPoints(regularPolygonPoints(s), 0);
        case "star": return boundsFromPoints(starPoints(s), 0);
        case "line": return boundsFromPoints([{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }], (s.sw || 2) / 2);
        case "pen":
        case "brush":
        case "mod-brush": return boundsFromPoints(s.pts || [], (s.sw || 2) / 2);
        default: return { x: 0, y: 0, w: 0, h: 0 };
      }
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

    function getGroupMembers(groupId, includeHidden) {
      if (!groupId) return [];
      return (data.shapes || []).filter(s => s.groupId === groupId && (includeHidden || !s.hidden));
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

    function animationTransform(owner, center, localTime, progress) {
      const kfP = interpKF(owner && owner.keyframes, localTime);
      const pathProgress = getPathProgressForTime(owner, localTime, progress);
      const pos = getPathPos(pathProgress !== null ? pathProgress : progress, owner && owner.animPath);
      const pathDx = pos && owner.animPath && owner.animPath[0] ? pos.x - owner.animPath[0].x : 0;
      const pathDy = pos && owner.animPath && owner.animPath[0] ? pos.y - owner.animPath[0].y : 0;
      const useKfPosition = !(owner && owner.animPath && owner.animPath.length > 1);
      const kfDx = useKfPosition && kfP && Number.isFinite(Number(kfP.x)) ? Number(kfP.x) - center.x : 0;
      const kfDy = useKfPosition && kfP && Number.isFinite(Number(kfP.y)) ? Number(kfP.y) - center.y : 0;
      const kfRot = kfP && Number.isFinite(Number(kfP.rot)) ? Number(kfP.rot) - Number(owner.rot || 0) : 0;
      const autoRot = owner && owner.autoRotate ? Number(owner.autoRotate) * localTime : 0;
      return {
        dx: pathDx + kfDx,
        dy: pathDy + kfDy,
        rotDelta: kfRot + autoRot,
        opa: kfP && Number.isFinite(Number(kfP.opa)) ? Number(kfP.opa) : null,
        color: kfP && kfP.color ? kfP.color : null
      };
    }

    function opacityFor(s, xf) {
      const source = xf && Number.isFinite(Number(xf.opa)) ? Number(xf.opa) : Number(s.opa || 100);
      return clamp(source / 100, 0, 1);
    }

    function colorFor(s, xf) {
      return (xf && xf.color) || s.color || "#ffffff";
    }

    function makeShapeMesh(points, origin, color, alpha) {
      if (!points || points.length < 3) return null;
      const local = points.map(p => localPoint(p, origin));
      const shape = new THREE.Shape(local);
      const geom = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geom, makeMaterial(color, alpha));
      mesh.renderOrder = renderOrder++;
      return mesh;
    }

    function makeThickPolyline(points, origin, color, alpha, widthPx, closed) {
      if (!points || points.length < 2) return null;
      const pts = points.map(p => localPoint(p, origin));
      const w = Math.max(1, Number(widthPx || 1));
      const vertices = [];
      const count = closed ? pts.length : pts.length - 1;

      for (let i = 0; i < count; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) continue;
        const nx = -dy / len * w / 2;
        const ny = dx / len * w / 2;
        const p1 = [a.x + nx, a.y + ny, 0];
        const p2 = [b.x + nx, b.y + ny, 0];
        const p3 = [b.x - nx, b.y - ny, 0];
        const p4 = [a.x - nx, a.y - ny, 0];
        vertices.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
      }

      if (!vertices.length) return null;
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      const mesh = new THREE.Mesh(geom, makeMaterial(color, alpha));
      mesh.renderOrder = renderOrder++;
      return mesh;
    }

    function addShapeObjects(parent, s, origin, xf) {
      const color = colorFor(s, xf);
      const alpha = opacityFor(s, xf);
      const sw = Math.max(1, Number(s.sw || 2));
      const add = obj => { if (obj) parent.add(obj); };

      if (s.type === "rect") {
        const pts = rectPoints(s);
        if (s.fill) add(makeShapeMesh(pts, origin, color, alpha));
        add(makeThickPolyline(pts, origin, color, alpha, sw, true));
        return;
      }

      if (s.type === "circle") {
        const pts = ellipsePoints(s);
        if (s.fill) add(makeShapeMesh(pts, origin, color, alpha));
        add(makeThickPolyline(pts, origin, color, alpha, sw, true));
        return;
      }

      if (s.type === "triangle" || s.type === "polygon") {
        const pts = regularPolygonPoints(s);
        if (s.fill) add(makeShapeMesh(pts, origin, color, alpha));
        add(makeThickPolyline(pts, origin, color, alpha, sw, true));
        return;
      }

      if (s.type === "star") {
        const pts = starPoints(s);
        if (s.fill) add(makeShapeMesh(pts, origin, color, alpha * 0.9));
        add(makeThickPolyline(pts, origin, color, alpha, sw, true));
        return;
      }

      if (s.type === "line") {
        add(makeThickPolyline([{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }], origin, color, alpha, sw, false));
        return;
      }

      if (s.type === "pen" || s.type === "brush" || s.type === "mod-brush") {
        if (s.pts && s.pts.length > 1) add(makeThickPolyline(s.pts, origin, color, alpha, sw, false));
        return;
      }

      unsupportedTypes.add(s.type || "unknown");
      const b = getBounds(s);
      if (b.w > 0 && b.h > 0) {
        add(makeThickPolyline([
          { x: b.x, y: b.y },
          { x: b.x + b.w, y: b.y },
          { x: b.x + b.w, y: b.y + b.h },
          { x: b.x, y: b.y + b.h }
        ], origin, color, 0.5, 1, true));
      }
    }

    function addAnimatedGroup(items, owner, origin, localTime, progress) {
      const xf = animationTransform(owner, origin, localTime, progress);
      const group = new THREE.Group();
      const pos = worldPos(origin.x + xf.dx, origin.y + xf.dy);
      group.position.copy(pos);
      group.rotation.z = -(xf.rotDelta || 0) * Math.PI / 180;
      group.renderOrder = renderOrder++;
      items.forEach(s => addShapeObjects(group, s, origin, xf));
      root.add(group);
    }

    function clearRoot() {
      while (root.children.length) {
        const child = root.children.pop();
        child.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        });
      }
    }

    function drawScene(localTime, progress) {
      clearRoot();
      renderOrder = 0;
      unsupportedTypes.clear();
      const drawnGroups = new Set();
      const list = data.shapes || [];

      for (const raw of list) {
        if (!raw || raw.hidden) continue;

        if (raw.groupId) {
          if (drawnGroups.has(raw.groupId)) continue;
          drawnGroups.add(raw.groupId);
          const members = getGroupMembers(raw.groupId, false);
          const owner = getGroupAnimationOwner(raw.groupId);
          const b = getGroupBounds(raw.groupId);
          if (!members.length || !owner || !b) continue;
          addAnimatedGroup(members, owner, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, localTime, progress);
          continue;
        }

        addAnimatedGroup([raw], raw, getCenter(raw), localTime, progress);
      }
    }

    function render(now) {
      const interval = 1000 / fps;
      if (now - lastDraw < interval) {
        requestAnimationFrame(render);
        return;
      }
      lastDraw = now;

      const dur = Math.max(0.01, Number(data.totalDur || 3));
      const elapsed = playing ? (now - start) / 1000 : pauseAt;
      const localTime = data.looping ? (elapsed % dur) : Math.min(elapsed, dur);
      const progress = dur > 0 ? localTime / dur : 0;

      drawScene(localTime, progress);
      renderer.render(scene, camera);

      document.getElementById("time").textContent = localTime.toFixed(2) + "s";
      statusEl.textContent = "Three.js / " + (data.shapes ? data.shapes.length : 0) + " shapes";
      warnEl.textContent = unsupportedTypes.size ? "未対応の図形タイプ: " + Array.from(unsupportedTypes).join(", ") + "（簡易枠で表示）" : "";
      requestAnimationFrame(render);
    }

    document.getElementById("play").addEventListener("click", function () {
      playing = !playing;
      if (playing) {
        start = performance.now() - pauseAt * 1000;
        this.textContent = "停止";
      } else {
        pauseAt = (performance.now() - start) / 1000;
        this.textContent = "再生";
      }
    });

    document.getElementById("restart").addEventListener("click", function () {
      start = performance.now();
      pauseAt = 0;
      playing = true;
      document.getElementById("play").textContent = "停止";
    });

    statusEl.textContent = "Three.js / ready";
    requestAnimationFrame(render);
  }
})();

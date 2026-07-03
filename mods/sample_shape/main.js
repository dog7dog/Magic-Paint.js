(function () {
  const api = window.AnimationApp;
  if (!api) return;

  // ── 1. MOD を登録 ───────────────────────────────────────────────
  api.registerMod({
    id: "sample_shape",
    name: "Sample Shape",
    version: "1.0.0",
    description: "サンプル図形MODです。ダイヤモンド形の図形を追加します。"
  });

  // ── 2. 図形タイプを登録 ─────────────────────────────────────────
  // type 名 "diamond" でシステムに登録する
  api.registerShapeType("diamond", {

    // キャンバスに描画する（dc は Canvas2D コンテキスト）
    draw(dc, s) {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;

      dc.save();
      dc.globalAlpha = (s.opa || 100) / 100;
      dc.strokeStyle = s.color || "#fff";
      dc.lineWidth = s.sw || 2;
      dc.lineCap = "round";
      dc.lineJoin = "round";

      dc.translate(cx, cy);
      dc.rotate((s.rot || 0) * Math.PI / 180);

      dc.beginPath();
      dc.moveTo(0, -s.h / 2);     // 上
      dc.lineTo(s.w / 2, 0);      // 右
      dc.lineTo(0, s.h / 2);      // 下
      dc.lineTo(-s.w / 2, 0);     // 左
      dc.closePath();

      if (s.fill) { dc.fillStyle = s.color; dc.fill(); }
      dc.stroke();
      dc.restore();
    },

    // バウンディングボックスを返す（選択・当たり判定に使われる）
    getBounds(s) {
      return { x: s.x, y: s.y, w: s.w, h: s.h };
    },

    // 中心座標を返す（アニメーション基点に使われる）
    getCenter(s) {
      return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    },

    // 移動
    move(s, dx, dy) {
      s.x += dx;
      s.y += dy;
    },

    // リサイズ
    resize(s, handle, start, nx, ny, nw, nh) {
      s.x = nx;
      s.y = ny;
      s.w = Math.max(4, nw);
      s.h = Math.max(4, nh);
    },

    // HTML プレビュー / エクスポート用 SVG
    toSVG(s) {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const points = [
        `${cx},${s.y}`,
        `${s.x + s.w},${cy}`,
        `${cx},${s.y + s.h}`,
        `${s.x},${cy}`
      ].join(" ");
      return `<polygon points="${points}"
        fill="${s.fill ? s.color : 'none'}"
        stroke="${s.color}"
        stroke-width="${s.sw || 2}"/>`;
    },

    // HTML プレビュー内の Canvas 描画コード（文字列）
    previewDrawCode: `
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((s.rot || 0) * Math.PI / 180);
      ctx.beginPath();
      ctx.moveTo(0, -s.h / 2);
      ctx.lineTo(s.w / 2, 0);
      ctx.lineTo(0, s.h / 2);
      ctx.lineTo(-s.w / 2, 0);
      ctx.closePath();
      if (s.fill) { ctx.fillStyle = s.color; ctx.fill(); }
      ctx.stroke();
    `
  });

  // ── 3. ツールボタンを登録 ────────────────────────────────────────
  api.registerTool({
    id: "diamond_tool",
    name: "ダイヤモンド",
    icon: "◆"
  });

  // ── 4. マウスドラッグで図形を配置 ────────────────────────────────
  const cv = document.getElementById("cv");
  let drawing = false;
  let startX = 0;
  let startY = 0;

  function canvasPos(e) {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  cv.addEventListener("mousedown", function (e) {
    if (api.activeModTool?.id !== "diamond_tool") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const p = canvasPos(e);
    startX = p.x;
    startY = p.y;
    drawing = true;
  }, true);

  cv.addEventListener("mouseup", function (e) {
    if (!drawing || api.activeModTool?.id !== "diamond_tool") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    drawing = false;

    const p = canvasPos(e);
    const x = Math.min(startX, p.x);
    const y = Math.min(startY, p.y);
    const w = Math.max(10, Math.abs(p.x - startX));
    const h = Math.max(10, Math.abs(p.y - startY));

    api.addShape({
      type: "diamond",
      name: "ダイヤモンド",
      x, y, w, h
    });

    // ツール解除して選択ツールに戻る
    api.activeModTool = null;
    document.querySelectorAll(".rp-btn[data-mod-tool]")
            .forEach(b => b.classList.remove("active"));
    if (window.setTool) window.setTool("select");
  }, true);

})();

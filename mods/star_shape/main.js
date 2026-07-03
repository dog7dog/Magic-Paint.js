(function () {
  const api = window.AnimationApp;
  if (!api) return;

  api.registerMod({
    id: "star_shape",
    name: "星形図形MOD",
    level: 1,
    description: "ドラッグで星形を配置します。"
  });
  

  api.registerShapeType("star", {
    draw(ctx, s) {
      const outer = s.r || 40;
      const inner = outer * (s.innerRatio || 0.45);
      const points = s.points || 5;

      ctx.save();
      ctx.globalAlpha = (s.opa || 100) / 100;
      ctx.strokeStyle = s.color || "#f1c40f";
      ctx.fillStyle = s.color || "#f1c40f";
      ctx.lineWidth = s.sw || 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.translate(s.cx, s.cy);
      ctx.scale(s.scaleX || 1, s.scaleY || 1);
      ctx.rotate((s.rot || -90) * Math.PI / 180);

      ctx.beginPath();

      for (let i = 0; i < points * 2; i++) {
        const rr = i % 2 === 0 ? outer : inner;
        const a = i * Math.PI / points;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.closePath();

      if (s.fill) ctx.fill();
      ctx.stroke();
      ctx.restore();
    },

    getBounds(s) {
      const r = s.r || 40;
      const sx = s.scaleX || 1;
      const sy = s.scaleY || 1;

      return {
        x: s.cx - r * sx,
        y: s.cy - r * sy,
        w: r * 2 * sx,
        h: r * 2 * sy
      };
    },

    getCenter(s) {
      return {
        x: s.cx,
        y: s.cy
      };
    },

    move(s, dx, dy) {
      s.cx += dx;
      s.cy += dy;
    },

    resize(s, handle, start, nx, ny, nw, nh) {
      nw = Math.max(10, nw);
      nh = Math.max(10, nh);

      s.cx = nx + nw / 2;
      s.cy = ny + nh / 2;

      const baseR = s.r || 40;
      s.scaleX = nw / (baseR * 2);
      s.scaleY = nh / (baseR * 2);
    },
      toSVG(s) {
    const outer = s.r || 40;
    const innerR = outer * (s.innerRatio || 0.45);
    const points = s.points || 5;
    const sx = s.scaleX || 1;
    const sy = s.scaleY || 1;
    const rot = (s.rot || -90) * Math.PI / 180;

    const pts = [];

    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 === 0 ? outer : innerR;
      const a = rot + i * Math.PI / points;

      pts.push(
        `${Math.round(Math.cos(a) * rr * sx)},${Math.round(Math.sin(a) * rr * sy)}`
      );
    }

    return `<polygon points="${pts.join(' ')}"
      fill="${s.fill ? s.color : 'none'}"
      stroke="${s.color}"
      stroke-width="${s.sw || 2}"/>`;
  },
  
   previewDrawCode: `
      const outer = s.r || 40;
      const inner = outer * (s.innerRatio || 0.45);
      const points = s.points || 5;

      ctx.translate(s.cx, s.cy);
      ctx.scale(s.scaleX || 1, s.scaleY || 1);
      ctx.rotate((s.rot || -90) * Math.PI / 180);

      ctx.beginPath();

      for (let i = 0; i < points * 2; i++) {
        const rr = i % 2 === 0 ? outer : inner;
        const a = i * Math.PI / points;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;

      if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.closePath();
     if (s.fill) ctx.fill();
      ctx.stroke();
    `
  });

  api.registerTool({
    id: "star_shape_tool",
    name: "星形",
    icon: "★"
  });

  const cv = document.getElementById("cv");
  let drawing = false;
  let sx = 0;
  let sy = 0;

  function pos(e) {
    const r = cv.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top
    };
  }

  cv.addEventListener("mousedown", function (e) {
    if (!api.activeModTool || api.activeModTool.id !== "star_shape_tool") return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const p = pos(e);
    sx = p.x;
    sy = p.y;
    drawing = true;
  }, true);

  cv.addEventListener("mouseup", function (e) {
    if (!drawing) return;
    if (!api.activeModTool || api.activeModTool.id !== "star_shape_tool") return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const p = pos(e);
    const r = Math.max(12, Math.hypot(p.x - sx, p.y - sy) / 2);

    api.addShape({
      type: "star",
      name: "星形",
      cx: (sx + p.x) / 2,
      cy: (sy + p.y) / 2,
      r,
      points: 5,
      innerRatio: 0.45,
      scaleX: 1,
      scaleY: 1,
      rot: -90
    });

    drawing = false;
    api.activeModTool = null;
    document.querySelectorAll('.rp-btn[data-mod-tool]').forEach(b => {
      b.classList.remove('active');
    });

    if (window.setTool) {
      window.setTool("select");
    }
  }, true);
})();
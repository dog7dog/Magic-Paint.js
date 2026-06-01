(function () {
  const api = window.AnimationApp;
  if (!api) return;

  api.registerMod({
    id: "neon_brush",
    name: "ネオンブラシMOD",
    level: 1,
    description: "発光風ブラシを追加します。"
  });

  api.registerBrush({
    id: "neon_brush",
    name: "ネオンブラシ",
    icon: "✦",

    draw(ctx, pts, s) {
      if (!pts || pts.length < 2) return;

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.strokeStyle = s.color || "#00eaff";
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = (s.sw || 2) * 5;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();

      ctx.globalAlpha = 0.55;
      ctx.lineWidth = (s.sw || 2) * 2.5;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();

      ctx.globalAlpha = (s.opa || 100) / 100;
      ctx.lineWidth = s.sw || 2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();

      ctx.restore();
    },
    previewDrawCode: `
    if (!pts || pts.length < 2) return;

    ctx.save();
    ctx.strokeStyle = s.color || "#00ffff";
    ctx.lineWidth = s.sw || 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = s.color || "#00ffff";
    ctx.shadowBlur = (s.sw || 8) * 2;
    ctx.globalAlpha = (s.opa || 100) / 100;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, (s.sw || 8) / 3);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    ctx.restore();
  `,

toSVG(s) {
  if (!s.pts || s.pts.length < 2) return "";

  const b = window.AnimationApp.getBounds
    ? window.AnimationApp.getBounds(s)
    : { x: 0, y: 0, w: 0, h: 0 };

  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  const d = s.pts.map((p, i) => {
    const x = Math.round(p.x - cx);
    const y = Math.round(p.y - cy);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");

  const c = s.color || "#00ffff";
  const sw = s.sw || 8;
  const op = (s.opa || 100) / 100;

  return `
    <path d="${d}" fill="none" stroke="${c}" stroke-width="${sw}"
      stroke-linecap="round" stroke-linejoin="round" opacity="${op}"
      filter="drop-shadow(0 0 ${sw}px ${c})"/>
    <path d="${d}" fill="none" stroke="#ffffff" stroke-width="${Math.max(1, sw / 3)}"
      stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>
  `;
}
  });
})();
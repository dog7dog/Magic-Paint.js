# MOD 開発ガイド

このガイドではカスタム図形とツールを持つ MOD をゼロから作る手順を説明します。  
完成したサンプルは [`mods/sample_shape/`](../mods/sample_shape/) を参照してください。

---

## ステップ 1: フォルダを作る

```
mods/
└ my_mod/          ← MOD の ID と同じ名前にする
    ├ mod.json
    └ main.js
```

MOD ID はアルファベット・数字・アンダースコアのみ使えます。

---

## ステップ 2: mod.json を作る

```json
{
  "id": "my_mod",
  "name": "My MOD",
  "version": "1.0.0",
  "level": 1,
  "enabled": true,
  "description": "最初の MOD です。",
  "scripts": ["main.js"],
  "styles": []
}
```

| フィールド | 説明 |
|---|---|
| `id` | システム内でユニークな識別子。`mods/` 内のフォルダ名と一致させる |
| `name` | Mods パネルや設定に表示される名前 |
| `version` | セマンティックバージョン |
| `level` | 権限レベル（現在は `1` 固定） |
| `enabled` | `false` にするとサーバーが読み込まない |
| `scripts` | 読み込む JS ファイルのリスト（実行順） |
| `styles` | 読み込む CSS ファイルのリスト |

---

## ステップ 3: main.js を作る

```js
(function () {
  const api = window.AnimationApp;
  if (!api) return;          // Magic Paint 以外の環境対策

  // ── 登録 ────────────────────────────────────────────────
  api.registerMod({
    id: "my_mod",
    name: "My MOD",
    version: "1.0.0",
    description: "最初の MOD です。"
  });

  // ── 図形タイプの定義 ────────────────────────────────────
  api.registerShapeType("my_shape", {
    draw(ctx, s) {
      ctx.save();
      ctx.globalAlpha = (s.opa || 100) / 100;
      ctx.strokeStyle = s.color || "#fff";
      ctx.lineWidth = s.sw || 2;
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      if (s.fill) { ctx.fillStyle = s.color; ctx.fill(); }
      ctx.stroke();
      ctx.restore();
    },
    getBounds(s) { return { x: s.x, y: s.y, w: s.w, h: s.h }; },
    getCenter(s) { return { x: s.x + s.w / 2, y: s.y + s.h / 2 }; },
    move(s, dx, dy) { s.x += dx; s.y += dy; },
    resize(s, handle, start, nx, ny, nw, nh) {
      s.x = nx; s.y = ny;
      s.w = Math.max(4, nw);
      s.h = Math.max(4, nh);
    },
    toSVG(s) {
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"
        fill="${s.fill ? s.color : 'none'}" stroke="${s.color}" stroke-width="${s.sw || 2}"/>`;
    }
  });

  // ── ツールボタン ────────────────────────────────────────
  api.registerTool({
    id: "my_tool",
    name: "My Shape",
    icon: "⬜"
  });

  // ── マウス操作でキャンバスに配置 ────────────────────────
  const cv = document.getElementById("cv");
  let drawing = false, startX = 0, startY = 0;

  function canvasPos(e) {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  cv.addEventListener("mousedown", function (e) {
    if (api.activeModTool?.id !== "my_tool") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const p = canvasPos(e);
    startX = p.x; startY = p.y;
    drawing = true;
  }, true);

  cv.addEventListener("mouseup", function (e) {
    if (!drawing || api.activeModTool?.id !== "my_tool") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    drawing = false;

    const p = canvasPos(e);
    const x = Math.min(startX, p.x);
    const y = Math.min(startY, p.y);
    const w = Math.max(10, Math.abs(p.x - startX));
    const h = Math.max(10, Math.abs(p.y - startY));

    api.addShape({ type: "my_shape", name: "My Shape", x, y, w, h });

    // ツールを解除して選択ツールに戻る
    api.activeModTool = null;
    document.querySelectorAll(".rp-btn[data-mod-tool]")
            .forEach(b => b.classList.remove("active"));
    if (window.setTool) window.setTool("select");
  }, true);

})();
```

---

## ステップ 4: registerMod() を呼ぶ

`main.js` の先頭で必ず呼んでください。これを呼ばないと MOD がシステムに認識されません。

---

## ステップ 5: ツールや図形を登録する

`registerShapeType` → `registerTool` の順で登録するのが安全です。  
両方とも `api.registerMod()` の後に呼んでください。

複数の図形タイプや複数のツールを登録することもできます。

---

## ステップ 6: Magic Paint で有効化する

1. Magic Paint を起動します。
2. 上部バーの「Mods」ボタンをクリックします。
3. 作成した MOD の名前が一覧に出ていれば認識されています。
4. 有効化して「適用」をクリックすると右パネルにボタンが追加されます。

認識されない場合は `/api/mods` をブラウザで開いてレスポンスを確認してください。  
`mod.json` の JSON が壊れているとサーバーが無視することがあります。

---

## よくあるパターン

### プロパティパネルと連動する

選択中の図形のプロパティを変更したいとき:

```js
document.getElementById("my-slider").addEventListener("input", function () {
  api.setSelectedPatch({ myProp: Number(this.value) });
});
```

### カスタム UI を右パネルに追加する

```js
api.registerUI({
  id: "my_ui",
  position: "right",
  title: "オプション",
  html: `<label>サイズ <input id="my-size" type="range" min="10" max="200" value="60"></label>`,
  onMount(wrap, api) {
    wrap.querySelector("#my-size").addEventListener("input", function () {
      const s = api.getSelected();
      if (s && s.type === "my_shape") api.setSelectedPatch({ r: Number(this.value) });
    });
  }
});
```

### ファイルメニューに書き出し項目を追加する

```js
api.registerFileMenuItem({
  id: "my_export",
  label: "JSON で書き出し",
  icon: "ti-file-export",
  onClick(api) {
    const scene = api.getSceneSnapshot();
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "scene.json"; a.click();
    URL.revokeObjectURL(url);
    api.toast("ti-check", "書き出し完了");
  }
});
```

### アニメーションに対応する

`addShape` で追加した図形は自動的にキーフレームアニメーションの対象になります。  
`draw(ctx, s)` では `s.x`, `s.y` などが補間済みの値で渡されるため、特別な対応は不要です。

---

## チェックリスト

- [ ] `mod.json` の `id` がフォルダ名と一致している
- [ ] `main.js` が即時関数 `(function(){ ... })()` で囲まれている
- [ ] `api` の存在確認 (`if (!api) return`) がある
- [ ] `registerMod()` が最初に呼ばれている
- [ ] `draw()` 内で `ctx.save()` / `ctx.restore()` している
- [ ] `getBounds()` が正しいバウンディングボックスを返している
- [ ] マウスイベントで `e.preventDefault()` + `e.stopImmediatePropagation()` している

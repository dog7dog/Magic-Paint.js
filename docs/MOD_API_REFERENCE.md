# MOD API Reference

`window.AnimationApp` が Magic Paint の公開 API です。  
MOD の `main.js` 内で `const api = window.AnimationApp;` として参照します。

---

## registerMod(mod)

MOD をシステムに登録します。`main.js` の先頭で必ず呼んでください。

```js
api.registerMod({
  id: "my_mod",          // 必須。ユニークな識別子
  name: "My MOD",        // 表示名
  version: "1.0.0",
  description: "説明文"
});
```

---

## registerTool(tool)

右パネルにツールボタンを追加します。

```js
api.registerTool({
  id: "my_tool",         // 必須
  name: "マイツール",    // ボタンの title に表示
  icon: "◆"             // ボタン内 HTML（絵文字・HTMLどちらも可）
});
```

アクティブなツールか確認するには:

```js
if (api.activeModTool?.id === "my_tool") { ... }
```

---

## registerBrush(brush)

カスタムブラシを登録します。ストローク描画を自分でコントロールできます。

```js
api.registerBrush({
  id: "my_brush",
  name: "マイブラシ",
  icon: "🖌",
  onStart(ctx, point, shape) { ... },
  onMove(ctx, point, shape)  { ... },
  onEnd(ctx, point, shape)   { ... }
});
```

`point` は `{ x, y, pressure }` です。

---

## registerShapeType(type, renderer)

カスタム図形タイプを登録します。`draw` が必須で、残りは省略可能です。

```js
api.registerShapeType("my_shape", {
  // 必須: Canvas 2D で図形を描画する
  draw(ctx, s) {
    ctx.save();
    ctx.globalAlpha = (s.opa || 100) / 100;
    ctx.strokeStyle = s.color || "#fff";
    ctx.lineWidth = s.sw || 2;
    // ... 描画処理 ...
    ctx.restore();
  },

  // バウンディングボックスを返す
  getBounds(s) {
    return { x: s.x, y: s.y, w: s.w, h: s.h };
  },

  // 中心座標を返す
  getCenter(s) {
    return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  },

  // 移動
  move(s, dx, dy) {
    s.x += dx;
    s.y += dy;
  },

  // リサイズ（handle: 'se'|'sw'|'ne'|'nw'|'n'|'s'|'e'|'w'）
  resize(s, handle, start, nx, ny, nw, nh) {
    s.x = nx; s.y = ny;
    s.w = Math.max(4, nw);
    s.h = Math.max(4, nh);
  },

  // SVG 書き出し用
  toSVG(s) {
    return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"
              fill="none" stroke="${s.color}" stroke-width="${s.sw || 2}"/>`;
  },

  // HTML プレビュー用のコード文字列
  previewDrawCode: `
    ctx.strokeRect(s.x, s.y, s.w, s.h);
  `
});
```

---

## addShape(shape)

キャンバスに図形を追加します。アクティブレイヤーに自動で配置されます。

```js
api.addShape({
  type: "my_shape",      // registerShapeType で登録した type
  name: "マイ図形",      // レイヤーパネルの表示名
  x: 100, y: 100,
  w: 120, h: 80,
  // color / sw / opa / dash / fill / rot は省略時にエディタ設定値が使われる
});
```

**Shape の共通フィールド:**

| フィールド | 型 | 説明 |
|---|---|---|
| `type` | string | 図形タイプ |
| `name` | string | レイヤーパネル表示名 |
| `color` | string | 色 (CSS color) |
| `sw` | number | 線の太さ |
| `opa` | number | 不透明度 (0–100) |
| `dash` | string | 破線パターン例: `"5,3"` |
| `fill` | boolean | 塗りつぶし |
| `rot` | number | 回転角度 (度) |
| `hidden` | boolean | 個別非表示 |
| `engine` | string | `"canvas2d"` (省略時) または `"threejs"` |
| `layerId` | string | 配置レイヤー (省略時はアクティブレイヤー) |

---

## getSelected()

現在選択中の図形オブジェクトを返します。未選択時は `null`。

```js
const s = api.getSelected();
if (s) console.log(s.type, s.x, s.y);
```

---

## setSelectedPatch(patch)

選択中の図形のプロパティを更新し、パネルを同期します。

```js
api.setSelectedPatch({ color: "#ff0000", sw: 4 });
```

---

## requestRender() / redraw()

キャンバスを再描画します。`api.redraw()` で呼べます。

```js
api.redraw();
```

---

## registerUI(ui)

任意のパネルエリアにカスタム UI を追加します。

```js
api.registerUI({
  id: "my_ui",
  position: "right",     // "top" | "right" | "bottom" | "left" | "editor-top"
  title: "マイ設定",     // オプション
  html: `<button onclick="doSomething()">実行</button>`,

  // render / onMount で DOM を直接操作することもできる
  render(wrap, api) { ... },
  onMount(wrap, api) { ... }
});
```

---

## registerFileMenuItem(item)

ファイルメニューにアイテムを追加します。

```js
api.registerFileMenuItem({
  id: "my_export",
  label: "カスタム書き出し",
  icon: "ti-download",   // Tabler Icons クラス名（省略可）
  onClick(api) {
    // 書き出し処理
  }
});
```

---

## createLayer(options)

新しいレイヤーを作成してレイヤーパネルに追加します。作成したレイヤーがアクティブになります。

```js
const layer = api.createLayer({
  name: "WebGL Effects",    // 省略時 "New Layer"
  type: "normal",           // "normal"（省略時）または "folder"
  parentId: null,           // フォルダ内に入れる場合は親フォルダの id
  color: "#8b5cf6",         // レイヤーパネルのカラードット（省略時なし）
  visible: true,            // 省略時 true
  locked: false,            // 省略時 false
  opacity: 1,               // 0.0〜1.0（省略時 1）
  blendMode: "source-over"  // CSS globalCompositeOperation（省略時 "source-over"）
});
// → 作成したレイヤーオブジェクトを返す
```

**典型的な使い方（addObject と組み合わせる）:**

```js
const layer = api.createLayer({ name: "Particle Layer", color: "#ff9900" });

api.addObject({
  engine: "threejs",
  type: "particle",
  name: "パーティクル",
  layerId: layer.id       // 作成したレイヤーに配置
});
```

**フォルダを作成してレイヤーを入れる:**

```js
const folder = api.createLayer({ name: "WebGL Group", type: "folder" });
const child  = api.createLayer({ name: "Effects",     parentId: folder.id });
```

> `type: "folder"` のレイヤーは `addShape` / `addObject` の対象になりません。
> 図形の追加先は `getDrawableActiveLayerId()` が自動的に子レイヤーへ振り分けます。

---

## getLayers / isLayerVisible / isLayerLocked

```js
// 全レイヤーを取得
const layers = api.getLayers();
// 例: [ { id, name, type, visible, locked, opacity, ... }, ... ]

// レイヤー状態の確認（フォルダの継承も考慮）
api.isLayerVisible("layer-1");  // → boolean
api.isLayerLocked("layer-1");   // → boolean
```

---

## addObject(obj) / removeObject(id) / updateObject(id, patch)

Three.js など非 Canvas2D エンジンのオブジェクトを shapes[] に登録します。

```js
const obj = api.addObject({
  type: "my_3d_object",
  engine: "threejs",          // 省略時 "threejs"
  name: "3Dオブジェクト",
  color: "#3B8AE6",
  sw: 1, opa: 100, dash: "0", fill: false
});

api.updateObject(obj.id, { name: "名前変更" });
api.removeObject(obj.id);
```

---

## registerThreeRenderer(callbacks)

Three.js レンダラーがレイヤー状態の変化を受け取るためのコールバックを登録します。

```js
api.registerThreeRenderer({
  onLayerVisibility(layerId, visible) { ... },
  onLayerLock(layerId, locked)        { ... },
  onObjectHidden(objectId, hidden, shape) { ... }
});
```

---

## ユーティリティ

```js
api.toast("ti-check", "完了しました");   // トースト通知
api.setStatus("処理中...");              // ステータスバー

const bounds = api.getBounds(shape);    // → { x, y, w, h }
const center = api.getCenter(shape);    // → { x, y }

const snapshot = api.getSceneSnapshot();
// → { width, height, bg, totalDur, looping, fps, shapes[] }
```

---

## getObjectsByLayer(layerId) / getObjectsByEngine(engine)

```js
// 特定レイヤーの全オブジェクト（エンジン問わず）
api.getObjectsByLayer("layer-1");

// 特定エンジンの全オブジェクト
api.getObjectsByEngine("threejs");
```

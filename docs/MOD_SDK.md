# Magic Paint MOD SDK

Magic Paint は `window.AnimationApp` を通じて外部 MOD からキャンバス・レイヤー・ツールを拡張できます。

---

## MOD でできること

| カテゴリ | できること |
|---|---|
| **カスタム図形** | 独自の描画ロジックを持つ図形タイプを追加 |
| **カスタムツール** | 右パネルにツールボタンを追加し、マウスイベントを乗っ取る |
| **カスタムブラシ** | ストローク描画を完全にコントロールするブラシを追加 |
| **カスタム UI** | top / right / bottom / left / editor-top エリアに HTML パネルを追加 |
| **ファイルメニュー** | 「File」メニューに独自の書き出し・読み込み項目を追加 |
| **Three.js 統合** | WebGL レンダラーを 2D レイヤーと同じ管理下に置く |
| **シーン読み取り** | shapes / layers / アニメーション情報を取得して外部ツールと連携 |

---

## MOD の構成

```
mods/
└ my_mod/
    ├ mod.json    ← 必須。メタデータと読み込むファイルのリスト
    ├ main.js     ← エントリポイント
    └ style.css   ← オプション
```

### mod.json の最小構成

```json
{
  "id": "my_mod",
  "name": "My MOD",
  "version": "1.0.0",
  "level": 1,
  "enabled": true,
  "description": "説明",
  "scripts": ["main.js"],
  "styles": []
}
```

`level` は将来の権限管理用フィールドです（現在は `1` 固定）。

### main.js の最小構成

```js
(function () {
  const api = window.AnimationApp;
  if (!api) return;

  api.registerMod({
    id: "my_mod",
    name: "My MOD",
    version: "1.0.0",
    description: "説明"
  });

  // ここから機能を追加する
})();
```

即時関数 `(function(){ ... })()` で囲むことでグローバル汚染を防ぎます。

---

## 読み込みの仕組み

1. Magic Paint 起動時に `/api/mods` から MOD 一覧を取得します。
2. `enabled: true` の MOD の `scripts` を `<script>` タグで動的に読み込みます。
3. 各 `main.js` が実行され、`api.registerMod()` が呼ばれた時点でシステムに登録されます。

MOD の有効/無効は「Mods」メニューから切り替えられます。

---

## 保存データへの影響

`addShape()` で追加した図形は `.mlc` プロジェクトファイルに保存されます。  
再読み込み時にその MOD が有効でないと、図形タイプが未登録のまま読み込まれます（データは失われません）。

保存データに MOD の識別子が記録されるため、必要な MOD が不足している場合は Magic Paint が警告を出します。

---

## 詳細リファレンス

- [MOD_API_REFERENCE.md](./MOD_API_REFERENCE.md) — 全 API の仕様
- [MOD_DEVELOPMENT_GUIDE.md](./MOD_DEVELOPMENT_GUIDE.md) — 実装手順

## サンプル MOD

- [`mods/sample_shape/`](../mods/sample_shape/) — カスタム図形 + ツールの実装例
- [`mods/star_shape/`](../mods/star_shape/) — 実際に動作する星形 MOD
- [`mods/neon_brush/`](../mods/neon_brush/) — カスタムブラシの実装例

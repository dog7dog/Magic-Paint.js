# Sample Shape MOD

ダイヤモンド（菱形）図形を Magic Paint に追加するサンプル MOD です。  
MOD を作る際のテンプレートとして使ってください。

## 機能

- ◆ ボタンを右パネルに追加
- ドラッグ操作でダイヤモンド形の図形をキャンバスに配置
- 選択・移動・リサイズ・回転・塗りつぶし・アニメーション対応
- `.mlc` プロジェクトへの保存・読み込み対応

## 使い方

1. Magic Paint を起動し「Mods」を開いて `Sample Shape` を有効化する
2. 右パネルに ◆ ボタンが表示される
3. ◆ をクリック → キャンバス上でドラッグ → 放すと図形が配置される

## ファイル構成

```
sample_shape/
├ mod.json    メタデータ
├ main.js     図形・ツールの登録とマウス操作
└ README.md   このファイル
```

## カスタマイズのポイント

- 頂点を変えれば三角形・六角形など別のポリゴンに変更できます
- `registerShapeType` の `draw()` に独自ロジックを書くだけで新しい図形になります
- `api.registerUI()` でプロパティパネルを追加すると頂点数などを調整できます

## 参考ドキュメント

- [MOD_API_REFERENCE.md](../../docs/MOD_API_REFERENCE.md)
- [MOD_DEVELOPMENT_GUIDE.md](../../docs/MOD_DEVELOPMENT_GUIDE.md)

// webgl-image 図形（画像レイヤー）の draw/getCenter/getBounds は
// mods/webgl_Tree.js/main.js が registerShapeType('webgl-image', {...}) で
// window.AnimationApp.customRenderers 経由で提供している。
// canvas/renderer.js の drawShape / canvas/shapes.js の getCenter・getBounds は
// すべて default: ケースでこの customRenderers にフォールバックするため、
// ライブ編集画面側にこの図形専用のコードは存在しない（意図的に空）。
//
// export/preview.js の自己完結プレビュー window だけは customRenderers に
// アクセスできない別実行コンテキストのため、そちらにのみ webgl-image 用の
// 描画コードが複製されている（意図的な重複）。

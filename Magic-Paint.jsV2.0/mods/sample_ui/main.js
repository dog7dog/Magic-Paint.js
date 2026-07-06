(function () {
  const api = window.AnimationApp;
  if (!api) return;

  api.registerMod({
    id: "sample_ui",
    name: "UI拡張サンプル",
    level: 2,
    description: "UI拡張MODのサンプル"
  });

  if (!api.registerUI) {
    console.error("registerUI がありません");
    return;
  }

  api.registerUI({
    id: "sample_ui_top",
    position: "top",
    html: `
      <button class="tb-btn" id="sample-ui-btn">
        UI MOD
      </button>
    `,
    onMount(el, api) {
      el.querySelector("#sample-ui-btn").addEventListener("click", () => {
        api.toast("ti-sparkles", "UI MOD動作OK");
      });
    }
  });
})();
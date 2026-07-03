// ── 初期化 ───────────────────────────────────────────────────
setColor('#3B8AE6');
setStatus('準備完了');
initJSEditor();
initViewTabs();
initJeFileManager();
setTimeout(() => { initRuler(); initTimelineResize(); }, 50);
setTimeout(initGroupAndFpsControls, 80);
setTimeout(loadMods, 250);

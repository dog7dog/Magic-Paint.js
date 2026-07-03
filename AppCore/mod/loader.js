// ══════════════════════════════════════════════════════════════
// MOD Loader Prototype: セキュリティなし
// ══════════════════════════════════════════════════════════════
const LoadedMods = [];

async function loadMods() {
  try {
    const res = await fetch('/api/mods');
    if (!res.ok) throw new Error('MOD API error');

    const mods = await res.json();

    for (const mod of mods) {
      if (!LoadedMods.some(m => m.id === mod.id)) LoadedMods.push(mod);
      if (mod.enabled === false) {
        console.log('[MOD disabled]', mod.id);
        continue;
      }
      for (const href of mod.styles || []) {
        if (document.querySelector(`link[data-mod-style="${href}"]`)) continue;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.modStyle = href;
        document.head.appendChild(link);
      }

      for (const src of mod.scripts || []) {
        if (document.querySelector(`script[data-mod-script="${src}"]`)) continue;

        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = src;
          s.dataset.modScript = src;
          s.onload = resolve;
          s.onerror = reject;
          document.body.appendChild(s);
        });
      }
    }

    setStatus(`MOD ${mods.length}件 読み込み完了`);
  } catch (e) {
    console.warn('[MOD load failed]', e);
    setStatus('MOD読み込み失敗しました');
  }
}

function showModsModal() {
  document.getElementById('mod-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'mod-modal';

  const unique = [];
  for (const m of LoadedMods) {
    if (!unique.some(x => x.id === m.id)) unique.push(m);
  }

  const items = unique.length
    ? unique.map(m => `
    <div class="mod-item">
      <div class="mod-item-title">
        <strong>${escapeHtml(m.name || m.id)}</strong>
        <span class="mod-level">LEVEL ${escapeHtml(String(m.level || 1))}</span>
        <button class="mod-toggle-btn" data-mod-id="${escapeHtml(m.id)}">
          ${m.enabled === false ? 'OFF' : 'ON'}
        </button>
      </div>
      <div class="mod-desc">${escapeHtml(m.description || '説明なし')}</div>
      ${m.error ? `<div class="mod-error">ERROR: ${escapeHtml(m.error)}</div>` : ''}
    </div>
  `).join('')
    : '<div class="mod-desc">現在読み込み済みのMODはありません。MODフォルダを確認してください。</div>';

  modal.innerHTML = `
    <div id="mod-modal-card">
      <div class="mod-modal-head">
        <span><i class="ti ti-puzzle"></i> MOD一覧</span>
        <span class="mod-close" onclick="document.getElementById('mod-modal').remove()">✕</span>
      </div>
      <div class="mod-modal-body">${items}</div>
    </div>
  `;

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
  });

  document.body.appendChild(modal);

  modal.querySelectorAll('.mod-toggle-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();

      const id = btn.dataset.modId;
      if (!id) return;

      try {
        const res = await fetch(`/api/mods/${id}/toggle`, {
          method: 'POST'
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'toggle failed');
        }

        setStatus(`${id} を ${data.enabled ? 'ON' : 'OFF'} にしました。再読み込みします`);
        location.reload();

      } catch (err) {
        console.error('[MOD toggle failed]', err);
        setStatus('MOD ON/OFF 失敗');
      }
    });
  });
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

document.getElementById('mods-btn')?.addEventListener('click', showModsModal);

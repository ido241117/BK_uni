/*
 * Shared behavior for the templates: light / dark toggle (remembered), collapsible groups, disclosures, chips,
 * tabs and selects. Kept tiny on purpose: templates show the look; the app owns real behavior.
 */
(() => {
  const root = document.documentElement;
  const KEY = 'bk-template:theme';
  const apply = (mode) => {
    if (mode === 'dark') root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    document.querySelectorAll('.theme-switch').forEach((b) => { b.textContent = mode === 'dark' ? '☀ Light' : '☾ Dark'; });
  };
  const fromUrl = new URLSearchParams(location.search).get('theme');
  apply(fromUrl || localStorage.getItem(KEY) || 'light');

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'theme-switch';
    document.body.appendChild(toggle);
    apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    toggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      apply(next);
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const groupHeader = target.closest('.group-header');
    if (groupHeader) groupHeader.parentElement.toggleAttribute('data-open');
    const disclosure = target.closest('.disclosure-trigger');
    if (disclosure) disclosure.setAttribute('aria-expanded', String(disclosure.getAttribute('aria-expanded') !== 'true'));
    const chip = target.closest('.chip');
    if (chip) chip.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    const tab = target.closest('.tab');
    if (tab) tab.parentElement.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    const trigger = target.closest('.select-trigger');
    document.querySelectorAll('.select[data-open]').forEach((s) => { if (!trigger || s !== trigger.parentElement) s.removeAttribute('data-open'); });
    if (trigger) trigger.parentElement.toggleAttribute('data-open');
    const opt = target.closest('.select .menu-opt');
    if (opt) {
      const select = opt.closest('.select');
      select.querySelectorAll('.menu-opt').forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
      select.querySelector('.select-value').innerHTML = opt.querySelector('.opt-label').innerHTML;
      select.removeAttribute('data-open');
    }
  });
})();

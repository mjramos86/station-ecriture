/* Palette de commandes (Ctrl+K) : aller à un document, une scène, une fiche, ou lancer une action. */
(function () {
  'use strict';
  const NS = window.SE;
  const { h } = NS;

  function score(q, s) {
    // correspondance floue : toutes les lettres dans l'ordre, bonus aux débuts de mots et aux suites
    s = NS.norm(s); q = NS.norm(q);
    if (!q) return 1;
    const at = s.indexOf(q);
    if (at >= 0) return 100 - at + (at === 0 || s[at - 1] === ' ' ? 50 : 0);
    let i = 0, sc = 0, run = 0;
    for (const ch of s) { if (ch === q[i]) { i++; run++; sc += run; } else run = 0; if (i === q.length) return sc; }
    return 0;
  }

  function items() {
    const p = NS.app.project, out = [];
    if (!p) return out;
    const mode = NS.modes.get(p.mode);
    NS.projects.walk(p).forEach(({ id, depth }) => {
      const it = p.items[id];
      out.push({ group: 'Plan', icon: it.type === 'folder' ? '📁' : it.kind === 'graph' ? '🌳' : '📄', label: it.title, sub: it.synopsis || '', depth, run: () => (it.type === 'folder' ? NS.app.openCorkboard(id) : NS.app.openDoc(id)) });
    });
    const doc = p.open && p.items[p.open];
    if (doc && doc.kind === 'text') mode.outline(NS.editor.blocks()).forEach(x => out.push({ group: 'Dans ce document', icon: x.num ? '#' + x.num : '¶', label: x.label, run: () => NS.editor.goTo(x.el) }));
    if (doc && doc.kind === 'graph') NS.graph.outline().forEach(x => out.push({ group: 'Nœuds', icon: '◆', label: x.label, sub: x.sub, run: () => NS.graph.centerOn(x.id) }));
    p.bible.forEach(b => out.push({ group: 'Fiches', icon: '👤', label: b.name, sub: b.role, run: () => { NS.nav.setTab('fiches'); NS.nav.editFiche(b); } }));
    NS.app.commands().forEach(c => out.push(Object.assign({ group: 'Actions', icon: '›' }, c)));
    return out;
  }

  NS.palette = {
    open(prefix) {
      if (document.querySelector('.palette')) return;
      const all = items();
      const input = h('input.pal-input', { type: 'text', placeholder: 'Aller à un document, une scène, une fiche… ou taper une action (« > »)', value: prefix || '' });
      const list = h('div.pal-list', { role: 'listbox' });
      let shown = [], sel = 0;
      const draw = () => {
        let q = input.value.trim();
        let pool = all;
        if (q.startsWith('>')) { pool = all.filter(x => x.group === 'Actions'); q = q.slice(1).trim(); }
        shown = pool.map(x => ({ x, s: score(q, x.label + ' ' + (x.sub || '')) })).filter(r => r.s > 0).sort((a, b) => (q ? b.s - a.s : 0)).slice(0, 60).map(r => r.x);
        sel = Math.min(sel, Math.max(0, shown.length - 1));
        list.innerHTML = '';
        let group = null;
        shown.forEach((x, i) => {
          if (x.group !== group) { group = x.group; list.append(h('div.pal-group', null, group)); }
          list.append(h('div.pal-item' + (i === sel ? '.on' : ''), { role: 'option', onmousemove: () => { if (sel !== i) { sel = i; draw(); } }, onclick: () => go(i) },
            h('span.pal-ico', null, x.icon), h('span.pal-label', { style: x.depth ? { paddingLeft: x.depth * 12 + 'px' } : null }, x.label || 'Sans titre'), x.sub ? h('span.pal-sub', null, x.sub) : null, x.hint ? h('kbd', null, x.hint) : null));
        });
        if (!shown.length) list.append(h('div.pal-empty', null, 'Aucun résultat'));
        const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
      };
      const go = (i) => { const x = shown[i]; if (!x) return; m.close(); setTimeout(() => x.run(), 10); };
      input.addEventListener('input', () => { sel = 0; draw(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
        else if (e.key === 'Enter') { e.preventDefault(); go(sel); }
      });
      const m = NS.modal({ title: 'Aller à…', body: [input, list], cls: 'palette' });
      draw();
      setTimeout(() => input.focus(), 20);
    },
  };
})();

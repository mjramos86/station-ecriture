/* Application : écran d'accueil (projets), espace de travail, préférences, raccourcis, sauvegarde automatique. */
(function () {
  'use strict';
  const NS = window.SE;
  const { h, $ } = NS;
  const P = () => NS.projects;

  const THEMES = [
    { id: 'nuit', label: 'Nuit', dark: true }, { id: 'encre', label: 'Encre', dark: true }, { id: 'foret', label: 'Forêt', dark: true },
    { id: 'papier', label: 'Papier', dark: false }, { id: 'sepia', label: 'Sépia', dark: false },
  ];
  const BGS = {
    aube: 'radial-gradient(ellipse at 20% 0%, #4a3f73 0%, transparent 60%), radial-gradient(ellipse at 90% 100%, #7a4b5c 0%, transparent 55%), linear-gradient(160deg, #262848, #14152a)',
    etoiles: 'radial-gradient(1px 1px at 20% 30%, #fff8, transparent), radial-gradient(1px 1px at 70% 20%, #fff6, transparent), radial-gradient(1.5px 1.5px at 40% 80%, #fff5, transparent), radial-gradient(1px 1px at 85% 60%, #fff7, transparent), linear-gradient(180deg, #0d1330, #1d1840 60%, #2c1f3d)',
    foret: 'radial-gradient(ellipse at 30% 10%, #3f6b52 0%, transparent 55%), linear-gradient(170deg, #1d3a2f, #0f1f1a)',
    brume: 'linear-gradient(160deg, #5a6b7d, #2c3442 70%)',
    braise: 'radial-gradient(ellipse at 50% 120%, #b4552d 0%, transparent 60%), linear-gradient(180deg, #21161a, #2a1a17)',
    ocean: 'radial-gradient(ellipse at 80% 0%, #2f6f8f 0%, transparent 55%), linear-gradient(170deg, #12324a, #0a1a28)',
    uni: 'var(--bg-solid)',
  };
  const BG_LABELS = { aube: 'Aube violette', etoiles: 'Nuit étoilée', foret: 'Forêt', brume: 'Brume', braise: 'Braises', ocean: 'Océan', uni: 'Uni' };

  const App = {
    project: null,
    view: 'home', // home | doc | cork

    init() {
      this.applyTheme();
      NS.bus.on('settings', (p) => { if (p === '*' || /^(theme|bg|accent)/.test(p)) this.applyTheme(); });
      this.el = {
        home: $('#home'), work: $('#work'), nav: $('#nav'), widgets: $('#widgets'), center: $('#center'),
        title: $('#proj-title'), docTitle: $('#doc-title'), status: $('#statusbar'), save: $('#save-state'),
        edArea: $('#ed-area'), graphArea: $('#graph-area'), corkArea: $('#cork-area'),
      };
      NS.editor.init({ ed: $('#ed'), wrap: $('#ed-wrap'), page: $('#page'), bar: $('#toolbar') });
      NS.graph.init(this.el.graphArea);
      NS.nav.init(this.el.nav);
      NS.find.init($('#find'));
      NS.widgets.init(this.el.widgets);
      this.persistSoon = NS.debounce(() => this.persist(), 1000);
      NS.bus.on('doc-change', () => this.saveSoon());
      NS.bus.on('status', (s) => this.renderStatus(s));
      NS.bus.on('element', (label) => { $('#st-el').textContent = label || ''; });
      NS.bus.on('words', () => this.renderStatus());
      this.bindTopbar();
      this.bindKeys();
      document.addEventListener('pointerdown', () => NS.audio.resumeSaved(), { once: true });
      window.addEventListener('pagehide', () => { this.flush(); if (this.project) P().persist(this.project); });
      document.addEventListener('visibilitychange', () => { if (document.hidden) { this.flush(); this.persist(); } });
      this.syncPanels();
      const last = NS.store.get('lastProject', null);
      if (last && P().list().some(r => r.id === last)) this.openProject(last).catch(() => this.showHome());
      else this.showHome();
      document.body.classList.add('ready');
    },

    applyTheme() {
      const s = NS.settings.data;
      const th = THEMES.find(t => t.id === s.theme) || THEMES[0];
      document.documentElement.dataset.theme = th.id;
      document.documentElement.style.colorScheme = th.dark ? 'dark' : 'light';
      const bg = $('#bg');
      if (bg) bg.style.background = s.bgUrl ? `center / cover no-repeat url("${s.bgUrl.replace(/"/g, '%22')}"), #111` : (th.dark ? BGS[s.bg] || BGS.aube : 'var(--bg-solid)');
      const st = document.documentElement.style;
      if (!/^#[0-9a-f]{6}$/i.test(s.accent || '')) { ['--accent', '--accent-rgb', '--on-accent'].forEach(k => st.removeProperty(k)); return; }
      const a = s.accent;
      const rgb = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
      document.documentElement.style.setProperty('--accent', a);
      document.documentElement.style.setProperty('--accent-rgb', rgb.join(', '));
      const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
      document.documentElement.style.setProperty('--on-accent', lum > 0.6 ? '#22180f' : '#fff');
    },

    /* ================================================================ accueil */
    showHome() {
      this.flush();
      if (this.project) this.persist();
      this.project = null; this.view = 'home';
      NS.store.set('lastProject', null);
      this.el.work.hidden = true; this.el.home.hidden = false;
      document.title = 'Station d’écriture';
      const home = this.el.home;
      home.innerHTML = '';
      const modes = NS.modes.list();
      const list = P().list();
      home.append(
        h('header.home-head', null,
          h('div.brand', null, h('span.brand-ico', null, '✒'), h('span.brand-name', null, 'Station ', h('em', null, 'd’écriture'))),
          h('span.spacer'),
          h('button.btn', { onclick: () => this.importDialog() }, '⇪ Importer'),
          h('button.ico', { title: 'Préférences', onclick: () => this.settingsDialog() }, '⚙')),
        h('section.home-new', null,
          h('h2', null, 'Nouveau projet'),
          h('div.mode-grid', null, modes.map(m => h('button.mode-card', { onclick: () => this.newProject(m.id) },
            h('span.mode-ico', null, m.icon), h('b', null, m.name), h('span', null, m.blurb))))),
        h('section.home-list', null,
          h('h2', null, 'Mes projets ', list.length ? h('span.muted', null, `(${list.length})`) : null),
          list.length ? h('div.proj-grid', null, list.map(r => {
            const m = NS.modes.get(r.mode);
            return h('div.proj-card', { tabindex: 0, onclick: () => this.openProject(r.id), onkeydown: (e) => { if (e.key === 'Enter') this.openProject(r.id); } },
              h('div.proj-top', null, h('span.mode-ico.sm', null, m.icon), h('span.muted.small', null, m.name),
                h('button.ico.small', { title: 'Options', onclick: (e) => { e.stopPropagation(); this.projectMenu(r, e.clientX, e.clientY); } }, '⋯')),
              h('b.proj-title', null, r.title),
              h('span.muted.small', null, `${NS.fmtNum(r.words || 0)} mots · modifié le ${NS.fmtDate(r.updated)}`));
          })) : h('p.muted', null, 'Aucun projet pour l’instant. Choisissez un mode ci-dessus pour commencer. Tout est enregistré dans ce navigateur ; exportez régulièrement une sauvegarde.')),
        h('footer.home-foot.muted.small', null, 'Station d’écriture fonctionne entièrement dans votre navigateur : rien n’est envoyé sur un serveur. Les projets sont conservés dans le stockage local de ce navigateur – pensez à exporter des sauvegardes (.json).'));
    },
    async newProject(modeId) {
      const m = NS.modes.get(modeId);
      const title = await NS.ask('Nouveau projet – ' + m.name, 'Titre du projet :', '', { ok: 'Créer', placeholder: modeId === 'scenario' ? 'ex. : Le Dernier Café' : modeId === 'theatre' ? 'ex. : Les Cartons' : modeId === 'interactif' ? 'ex. : La Taverne du Col' : 'ex. : Les Heures claires' });
      if (title == null) return;
      const p = P().create(modeId, title.trim() || 'Projet sans titre');
      P().refreshWords(p);
      await P().persist(p);
      this.openProject(p.id);
    },
    projectMenu(r, x, y) {
      NS.menu(x, y, [
        { label: 'Ouvrir', icon: '↗', run: () => this.openProject(r.id) },
        { label: 'Renommer', icon: '✎', run: async () => { const v = await NS.ask('Renommer', null, r.title); if (v == null) return; const p = await P().load(r.id); p.title = v.trim() || p.title; await P().persist(p); this.showHome(); } },
        { label: 'Dupliquer', icon: '⧉', run: async () => { const p = await P().load(r.id); p.title += ' (copie)'; await P().importJSON(p); this.showHome(); } },
        { label: 'Télécharger une sauvegarde', icon: '💾', run: async () => { const p = await P().load(r.id); NS.download(NS.slug(p.title) + '-' + NS.today() + '.station.json', JSON.stringify(p), 'application/json'); } },
        '-',
        { label: 'Supprimer', icon: '🗑', danger: true, run: async () => { if (await NS.confirm('Supprimer le projet ?', `« ${r.title} » sera supprimé de ce navigateur. Cette action est définitive.`, 'Supprimer')) { await P().remove(r.id); this.showHome(); } } },
      ]);
    },
    importDialog() {
      NS.pickFile('.json,.fountain,.spmd,.txt,.md,.html,.htm').then(async (f) => {
        if (!f) return;
        try {
          const inProject = this.project && !/\.json$/i.test(f.name) ? this.project : null;
          const r = await NS.exporter.importFile(f, inProject);
          if (r.project) { NS.toast('Projet importé.'); this.openProject(r.project.id); }
          else if (r.docId) { this.saveSoon(); NS.nav.render(); this.openDoc(r.docId); NS.toast('Document importé.'); }
        } catch (e) { NS.toast('Import impossible : ' + e.message, 5000); }
      });
    },

    /* ================================================================ espace de travail */
    async openProject(id) {
      const p = await P().load(id);
      this.project = p;
      NS.store.set('lastProject', id);
      P().refreshWords(p);
      this.el.home.hidden = true; this.el.work.hidden = false;
      document.body.dataset.mode = p.mode;
      this.refreshTitle();
      const first = p.open && p.items[p.open] ? p.open : P().flatDocs(p)[0];
      this.openDoc(first, true);
      NS.bus.emit('project', p);
      // rappel de sauvegarde
      const lb = p.meta.lastBackup || p.created;
      if (P().totalWords(p) > 2000 && Date.now() - lb > 7 * 86400000) setTimeout(() => NS.toast('💾 Pensez à exporter une sauvegarde de ce projet (Exporter → Sauvegarde complète).', 6000), 1500);
    },
    openDoc(id, force) {
      const p = this.project;
      if (!p) return;
      const it = id && p.items[id];
      // « force » sur le document déjà ouvert = recharger depuis le modèle (instantané restauré, remplacement…)
      const reload = force && p.open === id && this.view === 'doc';
      if (!reload) this.flush();
      if (this.view === 'doc' && NS.editor.doc && NS.editor.doc.kind === 'text') NS.editor.doc._scroll = NS.editor.wrap.scrollTop;
      if (!it || it.type !== 'doc') {
        this.view = 'doc';
        p.open = null;
        NS.editor.doc = null;
        this.showArea(null);
        NS.nav.render();
        this.refreshTitle();
        return;
      }
      if (!force && p.open === id && this.view === 'doc') { if (it.kind === 'text') NS.editor.focus(); return; }
      p.open = id;
      this.view = 'doc';
      if (it.kind === 'graph') {
        NS.editor.doc = it; // pour les statistiques
        this.showArea('graph');
        NS.graph.open(p, it);
        $('#st-el').textContent = '';
        this.renderStatus({ words: it.words, est: { label: `${it.graph.nodes.length} nœuds` } });
      } else {
        this.showArea('ed');
        NS.editor.open(p, it, reload);
        setTimeout(() => NS.editor.focus(), 30);
      }
      this.saveSoon();
      NS.nav.render();
      this.refreshTitle();
      NS.bus.emit('open', it);
      if (!this.wide()) this.setPanel('nav', false);
    },
    openCorkboard(folderId) {
      this.flush();
      this.view = 'cork';
      this.showArea('cork');
      NS.corkboard.render(this.el.corkArea, folderId);
      this.corkId = folderId;
      this.refreshTitle(this.project.items[folderId].title);
      if (!this.wide()) this.setPanel('nav', false);
    },
    showArea(which) {
      this.el.edArea.hidden = which !== 'ed';
      this.el.graphArea.hidden = which !== 'graph';
      this.el.corkArea.hidden = which !== 'cork';
      $('#empty-area').hidden = !!which;
      if (which !== 'ed') NS.find.root.hidden = true;
    },
    refreshTitle(sub) {
      const p = this.project;
      if (!p) return;
      this.el.title.textContent = p.title;
      const doc = p.open && p.items[p.open];
      this.el.docTitle.textContent = sub || (doc ? doc.title : '');
      $('#mode-badge').textContent = NS.modes.get(p.mode).icon + ' ' + NS.modes.get(p.mode).name;
      document.title = this.docTitle();
    },
    docTitle() { const p = this.project; if (!p) return 'Station d’écriture'; const d = p.open && p.items[p.open]; return (d ? d.title + ' · ' : '') + p.title + ' — Station d’écriture'; },

    /* ---------- sauvegarde ---------- */
    flush() { if (this.project && NS.editor.doc && NS.editor.doc.kind === 'text' && this.view === 'doc') NS.editor.commit(); },
    saveSoon() { this.el.save.textContent = '● Modifications…'; this.el.save.className = 'pending'; this.persistSoon(); },
    async persist() {
      if (!this.project) return;
      this.flush();
      try {
        await P().persist(this.project);
        this.el.save.textContent = '✓ Enregistré'; this.el.save.className = 'ok';
        this.el.save.title = 'Enregistré dans ce navigateur à ' + new Date().toLocaleTimeString('fr-CA');
      } catch (e) {
        this.el.save.textContent = '⚠ Non enregistré'; this.el.save.className = 'err';
        this.el.save.title = 'Le stockage du navigateur a refusé l’enregistrement (espace plein ?). Exportez une sauvegarde !';
        NS.toast('⚠ Impossible d’enregistrer : exportez une sauvegarde.', 6000);
      }
    },

    /* ---------- barre d'état ---------- */
    renderStatus(s) {
      if (s) this._st = s;
      s = this._st;
      if (!this.project) return;
      const total = P().totalWords(this.project);
      $('#st-words').textContent = s ? `${NS.fmtNum(s.words)} mots` + (s.sel ? ` (${NS.fmtNum(s.sel)} sél.)` : '') : '';
      $('#st-est').textContent = s && s.est ? s.est.label : '';
      $('#st-total').textContent = `Projet : ${NS.fmtNum(total)}`;
      const goal = NS.settings.data.goals.daily;
      $('#st-today').textContent = `Aujourd’hui : ${NS.fmtNum(NS.stats.todayWords)}${goal ? ' / ' + NS.fmtNum(goal) : ''}`;
      $('#st-today').style.setProperty('--p', goal ? Math.min(100, NS.stats.todayWords / goal * 100) + '%' : '0%');
    },

    /* ---------- panneaux, zen ---------- */
    wide() { return matchMedia('(min-width: 1000px)').matches; },
    setPanel(which, on) {
      if (this.wide()) NS.settings.set('panels.' + which, on);
      else { document.body.classList.toggle('drawer-' + which, on); if (on) document.body.classList.remove('drawer-' + (which === 'nav' ? 'widgets' : 'nav')); }
      this.syncPanels();
    },
    togglePanel(which) {
      const on = this.wide() ? NS.settings.data.panels[which] : document.body.classList.contains('drawer-' + which);
      this.setPanel(which, !on);
    },
    syncPanels() {
      const s = NS.settings.data.panels;
      document.body.classList.toggle('no-nav', !s.nav);
      document.body.classList.toggle('no-widgets', !s.widgets);
      $('#btn-nav').classList.toggle('on', this.wide() ? s.nav : document.body.classList.contains('drawer-nav'));
      $('#btn-widgets').classList.toggle('on', this.wide() ? s.widgets : document.body.classList.contains('drawer-widgets'));
    },
    setZen(on, auto) {
      if (auto && !on && !this._autoZen) return;
      this._autoZen = auto && on;
      document.body.classList.toggle('zen', on);
      if (!auto) {
        try { if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* ignore */ }
      }
      if (on) NS.toast('Mode zen – Échap pour sortir', 1800);
    },

    bindTopbar() {
      $('#btn-home').addEventListener('click', () => this.showHome());
      $('#btn-nav').addEventListener('click', () => this.togglePanel('nav'));
      $('#btn-widgets').addEventListener('click', () => this.togglePanel('widgets'));
      $('#btn-palette').addEventListener('click', () => NS.palette.open());
      $('#btn-export').addEventListener('click', () => NS.exporter.dialog(this.project));
      $('#btn-zen').addEventListener('click', () => this.setZen(!document.body.classList.contains('zen')));
      $('#btn-settings').addEventListener('click', () => this.settingsDialog());
      $('#btn-help').addEventListener('click', () => this.helpDialog());
      $('#btn-more').addEventListener('click', (e) => { const r = e.currentTarget.getBoundingClientRect(); NS.menu(r.right - 240, r.bottom + 6, this.commands().map(c => ({ label: c.label, icon: c.icon, hint: c.hint, run: c.run }))); });
      $('#zen-exit').addEventListener('click', () => this.setZen(false));
      this.el.title.addEventListener('dblclick', () => NS.ask('Titre du projet', null, this.project.title).then(v => { if (v) { this.project.title = v.trim(); this.refreshTitle(); this.saveSoon(); } }));
      $('#scrim').addEventListener('click', () => { document.body.classList.remove('drawer-nav', 'drawer-widgets'); this.syncPanels(); });
      $('#empty-new').addEventListener('click', () => NS.nav.addItem('doc'));
      NS.bus.on('settings', (p) => { if (p === '*' || p.startsWith('panels')) this.syncPanels(); });
      matchMedia('(min-width: 1000px)').addEventListener('change', () => { document.body.classList.remove('drawer-nav', 'drawer-widgets'); this.syncPanels(); });
    },
    commands() {
      const ed = NS.settings.data.editor;
      const tog = (key, label) => ({ label: (ed[key] ? '✓ ' : '') + label, icon: '◐', run: () => NS.settings.set('editor.' + key, !NS.settings.data.editor[key]) });
      return [
        { label: 'Nouveau document', icon: '📄', run: () => NS.nav.addItem('doc') },
        { label: 'Nouveau dossier', icon: '📁', run: () => NS.nav.addItem('folder') },
        { label: 'Rechercher / remplacer', icon: '🔍', hint: 'Ctrl+F', run: () => NS.find.open() },
        { label: 'Exporter…', icon: '⇩', hint: 'Ctrl+Maj+E', run: () => NS.exporter.dialog(this.project) },
        { label: 'Télécharger une sauvegarde (.json)', icon: '💾', run: () => NS.exporter.backup(this.project) },
        { label: 'Importer un fichier…', icon: '⇪', run: () => this.importDialog() },
        { label: 'Prendre un instantané du document', icon: '📸', run: () => { if (!this.project.open) return; this.flush(); P().snapshot(this.project, this.project.open, ''); this.saveSoon(); NS.toast('Instantané enregistré.'); if (NS.nav.tab === 'infos') NS.nav.render(); } },
        { label: 'Mode zen', icon: '🧘', hint: 'Ctrl+Maj+F', run: () => this.setZen(true) },
        tog('typewriter', 'Défilement machine à écrire'),
        tog('focusMode', 'Estomper les autres paragraphes'),
        tog('keySounds', 'Sons de machine à écrire'),
        { label: 'Démarrer / suspendre le minuteur', icon: '🍅', run: () => { NS.widgets.reveal('focus'); NS.widgets.api.focus && NS.widgets.api.focus.toggle(); } },
        { label: 'Musique', icon: '🎵', run: () => NS.widgets.reveal('music') },
        { label: 'Thème suivant', icon: '🎨', run: () => { const i = THEMES.findIndex(t => t.id === NS.settings.data.theme); NS.settings.set('theme', THEMES[(i + 1) % THEMES.length].id); } },
        { label: 'Préférences', icon: '⚙', run: () => this.settingsDialog() },
        { label: 'Raccourcis et aide', icon: '?', hint: 'F1', run: () => this.helpDialog() },
        { label: 'Retour aux projets', icon: '⌂', run: () => this.showHome() },
      ];
    },

    bindKeys() {
      const held = (e) => document.body.classList.toggle('ctrl-held', (e.ctrlKey || e.metaKey) && (e.key === 'Control' || e.key === 'Meta'));
      document.addEventListener('keyup', held);
      window.addEventListener('blur', () => document.body.classList.remove('ctrl-held'));
      document.addEventListener('keydown', (e) => {
        held(e);
        const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
        if (e.key === 'Escape' && document.body.classList.contains('zen') && !document.querySelector('.modal-back')) { this.setZen(false); return; }
        if (!this.project) return;
        if (mod && k === 'k' && !e.shiftKey) { e.preventDefault(); NS.palette.open(); }
        else if (mod && k === 'p' && e.shiftKey) { e.preventDefault(); NS.palette.open('>'); }
        else if (mod && k === 'f' && !e.shiftKey) { if (this.view === 'doc' && NS.editor.doc && NS.editor.doc.kind === 'text') { e.preventDefault(); NS.find.open(); } }
        else if (mod && k === 'h') { if (this.view === 'doc' && NS.editor.doc && NS.editor.doc.kind === 'text') { e.preventDefault(); NS.find.open(true); } }
        else if (mod && k === 's') { e.preventDefault(); this.persist().then(() => NS.toast('Enregistré ✓', 1200)); }
        else if (mod && e.shiftKey && k === 'f') { e.preventDefault(); this.setZen(!document.body.classList.contains('zen')); }
        else if (mod && e.shiftKey && k === 'e') { e.preventDefault(); NS.exporter.dialog(this.project); }
        else if (mod && (e.key === '\\' || e.code === 'Backslash')) { e.preventDefault(); this.togglePanel('nav'); }
        else if (mod && e.code === 'Period') { e.preventDefault(); this.togglePanel('widgets'); }
        else if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !mod) {
          const docs = P().flatDocs(this.project), i = docs.indexOf(this.project.open);
          const j = i + (e.key === 'ArrowDown' ? 1 : -1);
          if (docs[j]) { e.preventDefault(); this.openDoc(docs[j]); }
        } else if (e.key === 'F1') { e.preventDefault(); this.helpDialog(); }
      });
    },

    /* ================================================================ préférences */
    settingsDialog() {
      const s = NS.settings;
      const d = s.data;
      const row = (label, ctl, hint) => h('label.set-row', null, h('span.set-label', null, label, hint ? h('small', null, hint) : null), ctl);
      const check = (path, label, hint) => row(label, h('input', { type: 'checkbox', checked: !!s.get(path), onchange: (e) => s.set(path, e.target.checked) }), hint);
      const range = (path, min, max, step, fmt) => { const out = h('output', null, fmt(s.get(path))); return h('span.set-range', null, h('input.range', { type: 'range', min, max, step, value: s.get(path), oninput: (e) => { s.set(path, +e.target.value); out.textContent = fmt(+e.target.value); } }), out); };
      const seg = (path, opts) => h('div.seg', null, opts.map(([v, l]) => h('button' + (s.get(path) === v ? '.on' : ''), { onclick: (e) => { s.set(path, v); Array.from(e.currentTarget.parentNode.children).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, l)));
      const body = h('div.settings',
        null,
        h('h3', null, 'Apparence'),
        row('Thème', seg('theme', THEMES.map(t => [t.id, t.label]))),
        row('Fond (thèmes sombres)', h('select.text', { onchange: (e) => s.set('bg', e.target.value) }, Object.keys(BGS).map(k => h('option', { value: k, selected: d.bg === k }, BG_LABELS[k])))),
        row('Image de fond (URL)', h('input.text', { value: d.bgUrl, placeholder: 'https://…', onchange: (e) => s.set('bgUrl', e.target.value.trim()) })),
        row('Couleur d’accent', h('span.row', { style: 'margin:0;align-items:center' }, h('input', { type: 'color', value: d.accent || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ffb86b', oninput: (e) => s.set('accent', e.target.value) }), h('button.btn.sm', { onclick: () => s.set('accent', '') }, 'Couleur du thème'))),
        h('h3', null, 'Page'),
        row('Police (roman, notes)', h('select.text', { onchange: (e) => s.set('editor.font', e.target.value) }, NS.editor.FONTS.map(f => h('option', { value: f[0], selected: d.editor.font === f[0] }, f[1]))), 'Scénario : toujours Courier, comme l’exige le format.'),
        row('Taille du texte', range('editor.size', 14, 28, 1, v => v + ' px')),
        row('Interligne', range('editor.lineHeight', 1.2, 2.4, 0.1, v => String(v).replace('.', ','))),
        row('Largeur de la page', range('editor.width', 480, 1100, 20, v => v + ' px')),
        check('editor.paper', 'Page « papier »'),
        check('editor.indent', 'Retrait de première ligne (roman)'),
        check('editor.justify', 'Texte justifié (roman)'),
        h('h3', null, 'Écriture'),
        row('Typographie automatique', seg('editor.frTypo', [['qc', 'Québec'], ['fr', 'France'], ['off', 'Désactivée']]), 'Guillemets « », apostrophe ’, tiret —, points …, espaces insécables (France : aussi avant ; ! ?).'),
        check('editor.spellcheck', 'Correcteur orthographique du navigateur'),
        check('editor.typewriter', 'Défilement machine à écrire', 'La ligne en cours reste au milieu de l’écran.'),
        check('editor.focusMode', 'Estomper les autres paragraphes'),
        check('editor.sceneNumbers', 'Numéroter les scènes (scénario)'),
        check('editor.keySounds', 'Sons de machine à écrire'),
        row('Volume des sons', range('sound.volume', 0, 1, 0.05, v => Math.round(v * 100) + ' %')),
        h('h3', null, 'Données'),
        h('p.muted.small', null, 'Tout est stocké dans ce navigateur (IndexedDB). Effacer les données du site supprime vos projets : exportez des sauvegardes.'),
        h('div.row', null, h('button.btn.danger', { onclick: () => NS.confirm('Réinitialiser les préférences ?', 'Thème, page, widgets… reviennent aux valeurs d’origine. Vos projets ne sont pas touchés.', 'Réinitialiser').then(ok => { if (ok) { s.reset(); m.close(); } }) }, 'Réinitialiser les préférences')));
      const m = NS.modal({ title: 'Préférences', body, wide: true, actions: [{ label: 'Fermer', primary: true }] });
    },

    helpDialog() {
      const mode = this.project ? NS.modes.get(this.project.mode) : null;
      const k = (keys, what) => h('tr', null, h('td', null, keys.split(' ').map(x => h('kbd', null, x))), h('td', null, what));
      const rows = [
        k('Ctrl K', 'Aller à… (documents, scènes, fiches, actions)'), k('Ctrl F', 'Rechercher'), k('Ctrl H', 'Remplacer'), k('Ctrl S', 'Enregistrer maintenant (sinon automatique)'),
        k('Alt ↑ ↓', 'Document précédent / suivant'), k('Ctrl \\', 'Afficher / masquer le plan'), k('Ctrl .', 'Afficher / masquer les widgets'), k('Ctrl Maj F', 'Mode zen'), k('Ctrl Maj E', 'Exporter'),
        k('Ctrl B I U', 'Gras, italique, souligné'), k('Ctrl Alt M', 'Annoter la sélection'), k('Ctrl 1…9', 'Style / élément de paragraphe'),
      ];
      const extra = [];
      if (mode && (mode.id === 'scenario' || mode.id === 'theatre')) {
        extra.push(h('h3', null, mode.icon + ' ' + mode.name),
          h('p', null, 'Entrée crée l’élément suivant logique, Tab et Maj+Tab changent l’élément de la ligne en cours. Sur une ligne vide, Entrée revient à ', mode.id === 'scenario' ? 'l’action.' : 'la didascalie.'),
          h('table.keys', null, mode.elements.map((el, i) => k('Ctrl ' + (i + 1), el.label + (mode.enter[el.id] ? `  → Entrée : ${NS.modes.def(mode, mode.enter[el.id]).label}` : '')))),
          h('p.muted', null, mode.id === 'scenario' ? 'Tapez INT. ou EXT. en début de ligne : la ligne devient un en-tête de scène. Les noms de personnages, lieux, moments de la journée et transitions sont proposés automatiquement (Tab pour accepter).' : 'Tapez « Acte II » ou « Scène 3 » en début de ligne pour créer l’acte ou la scène. Les noms des personnages sont proposés automatiquement.'));
      }
      if (mode && mode.id === 'interactif') extra.push(h('h3', null, '🌳 Dialogues interactifs'), h('p', null, 'Double-clic sur le fond : nouveau nœud. Tirez le petit rond d’un choix vers un nœud pour les relier (ou dans le vide pour créer la suite). Suppr : supprimer le nœud sélectionné. N : nouveau nœud. Clic droit : définir le départ, marquer une fin, tester à partir d’ici.'));
      NS.modal({ title: 'Raccourcis et aide', wide: true, body: [h('table.keys', null, rows), ...extra], actions: [{ label: 'Fermer', primary: true }] });
    },
  };

  NS.app = App;
  window.addEventListener('DOMContentLoaded', () => App.init());
})();

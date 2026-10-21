/*
 * Panneau de navigation : Plan (classeur glisser-déposer), Scènes (plan du document courant),
 * Fiches (personnages, lieux…), Infos (document, instantanés, projet). + tableau de liège des dossiers.
 */
(function () {
  'use strict';
  const NS = window.SE;
  const { h, $$ } = NS;
  const P = () => NS.projects;

  const TABS = [
    { id: 'plan', label: 'Plan', icon: '🗂' },
    { id: 'scenes', label: 'Scènes', icon: '☰' },
    { id: 'fiches', label: 'Fiches', icon: '👤' },
    { id: 'infos', label: 'Infos', icon: 'ℹ' },
  ];

  const Nav = {
    init(root) {
      this.root = root;
      this.tabsEl = h('div.nav-tabs', { role: 'tablist' });
      this.body = h('div.nav-body');
      root.append(this.tabsEl, this.body);
      NS.bus.on('outline', () => { if (this.tab === 'scenes') this.render(); });
      NS.bus.on('doc-change', () => { if (this.tab === 'plan') this.updateCounts(); });
    },
    get tab() { return NS.settings.data.panels.navTab; },
    setTab(id) { NS.settings.set('panels.navTab', id); this.render(); },
    get p() { return NS.app.project; },

    render() {
      if (!this.p) return;
      const mode = NS.modes.get(this.p.mode);
      this.tabsEl.innerHTML = '';
      TABS.forEach(t => {
        const label = t.id === 'scenes' ? (this.curDoc() && this.curDoc().kind === 'graph' ? 'Nœuds' : mode.id === 'roman' ? 'Titres' : 'Scènes') : t.label;
        this.tabsEl.append(h('button.nav-tab' + (this.tab === t.id ? '.on' : ''), { role: 'tab', 'aria-selected': String(this.tab === t.id), onclick: () => this.setTab(t.id) }, h('span', null, t.icon), ' ', label));
      });
      const st = this.body.scrollTop;
      this.body.innerHTML = '';
      ({ plan: () => this.renderPlan(), scenes: () => this.renderScenes(), fiches: () => this.renderFiches(), infos: () => this.renderInfos() })[this.tab]();
      this.body.scrollTop = st;
    },
    curDoc() { return this.p && this.p.open ? this.p.items[this.p.open] : null; },
    changed() { NS.app.saveSoon(); },

    /* ================================================================ Plan (classeur) */
    renderPlan() {
      const p = this.p, mode = NS.modes.get(p.mode);
      const head = h('div.nav-head', null,
        h('button.btn.sm', { title: 'Nouveau document', onclick: () => this.addItem('doc') }, '＋ ' + mode.docLabel),
        h('button.btn.sm', { title: 'Nouveau dossier', onclick: () => this.addItem('folder') }, '＋ ' + mode.folderLabel),
        mode.docKind === 'graph' ? h('button.btn.sm', { title: 'Document texte (notes, synopsis…)', onclick: () => this.addItem('doc', 'text') }, '＋ Note') : null);
      const tree = h('div.tree', { role: 'tree' });
      const rec = (ids, depth) => ids.forEach(id => {
        const it = p.items[id];
        if (!it) return;
        tree.append(this.row(it, depth));
        if (it.type === 'folder' && !it.collapsed) rec(it.children, depth + 1);
      });
      rec(p.root, 0);
      tree.addEventListener('dragover', (e) => { if (e.target === tree) { e.preventDefault(); } });
      tree.addEventListener('drop', (e) => { if (e.target === tree && this.dragId) { e.preventDefault(); P().move(p, this.dragId, null, p.root.length); this.dragId = null; this.changed(); this.render(); } });
      const total = P().totalWords(p);
      this.body.append(head, tree, h('div.nav-foot', null, `${NS.fmtNum(total)} mots au total`));
    },
    row(it, depth) {
      const p = this.p;
      const isOpen = p.open === it.id;
      const st = P().STATUSES.find(s => s.id === it.status);
      const words = it.type === 'folder' ? P().totalWords(p, [it.id]) : it.words || 0;
      const row = h('div.tree-row' + (isOpen ? '.on' : '') + (it.type === 'folder' ? '.folder' : ''), {
        role: 'treeitem', draggable: true, tabindex: 0, dataset: { id: it.id }, style: { paddingLeft: (8 + depth * 16) + 'px' },
        onclick: () => this.activate(it),
        ondblclick: (e) => { e.preventDefault(); this.rename(it); },
        oncontextmenu: (e) => { e.preventDefault(); this.itemMenu(it, e.clientX, e.clientY); },
        onkeydown: (e) => {
          if (e.key === 'Enter') this.activate(it);
          else if (e.key === 'F2') this.rename(it);
          else if (e.key === 'Delete') this.removeItem(it);
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const rows = $$('.tree-row', this.body); const i = rows.indexOf(e.currentTarget); const n = rows[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) n.focus(); }
        },
      },
      it.type === 'folder' ? h('button.tw', { title: it.collapsed ? 'Déplier' : 'Replier', onclick: (e) => { e.stopPropagation(); it.collapsed = !it.collapsed; this.changed(); this.render(); } }, it.collapsed ? '▸' : '▾') : h('span.tw'),
      h('span.ti', null, it.type === 'folder' ? (it.collapsed ? '📁' : '📂') : it.kind === 'graph' ? '🌳' : '📄'),
      h('span.tt', null, it.title || 'Sans titre'),
      st && st.id ? h('span.sdot', { title: st.label, style: { background: st.color } }) : null,
      h('span.tc', { dataset: { count: it.id } }, words ? NS.fmtNum(words) : ''));
      row.addEventListener('dragstart', (e) => { this.dragId = it.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', it.title); } catch (x) { /* ignore */ } row.classList.add('dragging'); });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); $$('.tree-row', this.body).forEach(r => r.classList.remove('d-before', 'd-after', 'd-in')); });
      row.addEventListener('dragover', (e) => {
        if (!this.dragId || this.dragId === it.id) return;
        e.preventDefault();
        const r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
        const where = it.type === 'folder' ? (y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'in') : (y < 0.5 ? 'before' : 'after');
        row.classList.toggle('d-before', where === 'before'); row.classList.toggle('d-after', where === 'after'); row.classList.toggle('d-in', where === 'in');
        row.dataset.where = where;
      });
      row.addEventListener('dragleave', () => row.classList.remove('d-before', 'd-after', 'd-in'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const id = this.dragId; this.dragId = null;
        if (!id || id === it.id) return;
        const where = row.dataset.where;
        let ok;
        if (where === 'in') { ok = P().move(p, id, it.id, it.children.length); it.collapsed = false; }
        else {
          const par = P().parentOf(p, it.id), list = par ? par.children : p.root;
          ok = P().move(p, id, par ? par.id : null, list.indexOf(it.id) + (where === 'after' ? 1 : 0));
        }
        if (!ok) NS.toast('Impossible de placer un dossier dans lui-même.');
        this.changed(); this.render();
      });
      return row;
    },
    updateCounts() {
      const p = this.p;
      $$('[data-count]', this.body).forEach(el => {
        const it = p.items[el.dataset.count];
        if (!it) return;
        const w = it.type === 'folder' ? P().totalWords(p, [it.id]) : it.words || 0;
        el.textContent = w ? NS.fmtNum(w) : '';
      });
      const f = this.body.querySelector('.nav-foot');
      if (f) f.textContent = `${NS.fmtNum(P().totalWords(p))} mots au total`;
    },
    activate(it) {
      if (it.type === 'folder') NS.app.openCorkboard(it.id);
      else NS.app.openDoc(it.id);
    },
    addItem(type, kind, ref) {
      const p = this.p, mode = NS.modes.get(p.mode);
      if (!ref) {
        // un document : à côté du document courant ; un dossier : à côté du dossier qui le contient
        const cur = p.open && p.items[p.open];
        if (cur) {
          const par = P().parentOf(p, cur.id);
          if (type === 'folder' && par) { const gp = P().parentOf(p, par.id); ref = { parent: gp ? gp.id : null, after: par.id }; }
          else ref = { parent: par ? par.id : null, after: cur.id };
        }
      }
      const n = P().flatDocs(p).length + 1;
      const title = type === 'folder' ? `${mode.folderLabel} ${Object.values(p.items).filter(x => x.type === 'folder').length + 1}` : kind === 'text' && mode.docKind === 'graph' ? 'Notes' : `${mode.docLabel.split(' /')[0]} ${n}`;
      const spec = { type, kind, title };
      if (type === 'folder' && !kind) spec.children = [{ type: 'doc', title: `${mode.docLabel.split(' /')[0]} 1` }];
      const id = P().add(p, spec, ref);
      this.changed();
      const first = p.items[id].children[0];
      if (type === 'doc' || first) NS.app.openDoc(first || id); else this.render();
      setTimeout(() => this.rename(p.items[id], true), 50);
    },
    rename(it, thenWrite) {
      const row = this.body.querySelector(`.tree-row[data-id="${it.id}"] .tt`);
      if (!row) { NS.ask('Renommer', null, it.title).then(v => { if (v != null) { it.title = v.trim() || it.title; this.changed(); this.render(); NS.app.refreshTitle(); } }); return; }
      const input = h('input.tree-input', { value: it.title });
      row.replaceWith(input);
      input.focus(); input.select();
      let done = false;
      const finish = (save) => {
        if (done) return; done = true;
        if (save) it.title = input.value.trim() || it.title;
        this.changed(); this.render(); NS.app.refreshTitle();
        if (thenWrite && NS.app.view === 'doc') { if (NS.editor.doc && NS.editor.doc.kind === 'text') NS.editor.focus(); }
      };
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (e) => e.stopPropagation());
    },
    removeItem(it) {
      const n = it.type === 'folder' ? P().flatDocs(this.p, [it.id]).length : 1;
      NS.confirm('Supprimer ?', `« ${it.title} »${it.type === 'folder' ? ` et ses ${n} document(s)` : ''} seront supprimés définitivement (pensez à exporter une sauvegarde).`, 'Supprimer').then(ok => {
        if (!ok) return;
        const wasOpen = this.p.open;
        P().removeItem(this.p, it.id);
        this.changed();
        if (this.p.open !== wasOpen || !this.p.items[wasOpen]) NS.app.openDoc(this.p.open);
        else this.render();
      });
    },
    itemMenu(it, x, y) {
      const p = this.p, mode = NS.modes.get(p.mode);
      const par = P().parentOf(p, it.id);
      NS.menu(x, y, [
        { label: 'Ouvrir', icon: '↗', run: () => this.activate(it) },
        { label: 'Renommer', icon: '✎', hint: 'F2', run: () => this.rename(it) },
        '-',
        { label: `Nouveau ${mode.docLabel.toLowerCase().split(' /')[0]} après`, icon: '📄', run: () => this.addItem('doc', null, { parent: par ? par.id : null, after: it.id }) },
        it.type === 'folder' ? { label: 'Nouveau document dedans', icon: '↳', run: () => { it.collapsed = false; this.addItem('doc', null, { parent: it.id }); } } : null,
        { label: `Nouveau ${mode.folderLabel.toLowerCase()} après`, icon: '📁', run: () => this.addItem('folder', null, { parent: par ? par.id : null, after: it.id }) },
        { label: 'Dupliquer', icon: '⧉', run: () => { P().duplicate(p, it.id); P().refreshWords(p); this.changed(); this.render(); } },
        '-',
        ...P().STATUSES.map(s => ({ label: (it.status === s.id ? '✓ ' : '') + s.label, icon: h('span.sdot', { style: { background: s.color } }), run: () => { it.status = s.id; this.changed(); this.render(); } })),
        '-',
        { label: 'Supprimer', icon: '🗑', danger: true, hint: 'Suppr', run: () => this.removeItem(it) },
      ]);
    },

    /* ================================================================ Scènes (plan du document) */
    renderScenes() {
      const doc = this.curDoc();
      if (!doc) { this.body.append(h('p.muted.pad', null, 'Aucun document ouvert.')); return; }
      const filter = h('input.text.nav-filter', { type: 'search', placeholder: 'Filtrer…', value: this._filter || '', oninput: (e) => { this._filter = e.target.value; draw(); } });
      const list = h('div.outline');
      this.body.append(filter, list);
      const draw = () => {
        list.innerHTML = '';
        const q = NS.norm(this._filter || '');
        if (doc.kind === 'graph') {
          NS.graph.outline().filter(x => !q || NS.norm(x.label + ' ' + x.sub).includes(q)).forEach(x => list.append(h('div.ol-row', { onclick: () => NS.graph.centerOn(x.id) },
            h('span.ol-num', null, x.num), h('span.ol-label', null, x.label, x.sub ? h('small', null, ' — ' + x.sub) : null), x.start ? h('span.chip.tiny', null, 'départ') : null, x.end ? h('span.chip.tiny', null, 'fin') : null)));
          return;
        }
        const mode = NS.modes.get(this.p.mode);
        const items = mode.outline(NS.editor.blocks());
        const shown = items.filter(x => !q || NS.norm(x.label).includes(q));
        if (!items.length) {
          list.append(h('p.muted.pad', null, mode.id === 'scenario' ? 'Aucun en-tête de scène. Commencez une ligne par INT. ou EXT., ou utilisez Ctrl+1.' : mode.id === 'theatre' ? 'Aucun acte ni scène. Tapez « Acte I » ou « Scène 1 », ou utilisez Ctrl+1 / Ctrl+2.' : 'Aucun titre dans ce document. Utilisez les styles Titre de chapitre / Sous-titre (Ctrl+2…4) pour structurer.'));
        }
        shown.forEach(x => {
          const row = h('div.ol-row.l' + x.level + (x.muted ? '.muted' : ''), { onclick: () => NS.editor.goTo(x.el), title: x.label },
            x.num ? h('span.ol-num', null, x.num) : null,
            h('span.ol-label', null, x.label),
            !x.muted ? h('span.ol-tools', null,
              h('button.ico.small', { title: 'Monter la section', onclick: (e) => { e.stopPropagation(); NS.editor.moveSection(x, -1); } }, '▲'),
              h('button.ico.small', { title: 'Descendre la section', onclick: (e) => { e.stopPropagation(); NS.editor.moveSection(x, 1); } }, '▼')) : null);
          list.append(row);
        });
        const add = (label, cls, text) => h('button.btn.sm', { onclick: () => this.appendBlock(cls, text) }, label);
        if (mode.id === 'scenario') list.append(h('div.nav-head', null, add('＋ Scène', 'sc-scene', 'INT. ')));
        if (mode.id === 'theatre') list.append(h('div.nav-head', null, add('＋ Acte', 'th-acte', 'Acte ' + romanNum(items.filter(i => i.level === 1).length + 1)), add('＋ Scène', 'th-scene', 'Scène ' + (countAfterLastAct(items) + 1))));
        // annotations
        const annos = NS.$$('.anno', NS.editor.ed);
        if (annos.length) {
          list.append(h('h4.nav-sub', null, `💬 Annotations (${annos.length})`));
          annos.forEach(a => list.append(h('div.ol-row.anno-row', { onclick: () => NS.editor.goTo(a.parentNode === NS.editor.ed ? a : NS.editor.blockOf(a)) }, h('span.ol-label', null, h('i', null, '« ' + a.textContent.slice(0, 40) + ' » '), a.dataset.note))));
        }
      };
      draw();
    },
    appendBlock(cls, text) {
      const ed = NS.editor.ed;
      const b = h('p', { class: cls }, text);
      ed.appendChild(b);
      NS.editor.afterChange();
      NS.editor.goTo(b);
      NS.bus.emit('outline');
    },

    /* ================================================================ Fiches */
    renderFiches() {
      const p = this.p;
      P().BIBLE_KINDS.forEach(k => {
        const items = p.bible.filter(b => b.kind === k.id);
        this.body.append(h('div.fiche-group', null,
          h('div.fiche-head', null, h('span', null, k.icon + ' ' + k.label), h('button.ico.small', { title: 'Ajouter : ' + k.one, onclick: () => this.editFiche({ id: NS.uid(), kind: k.id, name: '', role: '', color: '', text: '' }, true) }, '＋')),
          items.length ? items.map(b => h('div.fiche-row', { onclick: () => this.editFiche(b), title: b.text || '' },
            h('span.fdot', { style: { background: b.color || 'var(--glass-border)' } }), h('span.fname', null, b.name || 'Sans nom'), b.role ? h('span.frole', null, b.role) : null))
            : h('div.muted.small.pad', null, 'Aucun pour l’instant.')));
      });
    },
    editFiche(b, isNew) {
      const p = this.p;
      const kinds = P().BIBLE_KINDS;
      const f = Object.assign({}, b);
      const appear = () => {
        if (!f.name) return '';
        const q = NS.norm(f.name);
        const docs = P().flatDocs(p).filter(id => { const it = p.items[id]; const txt = it.kind === 'graph' ? JSON.stringify(it.graph || {}) : NS.htmlToText(it.content); return NS.norm(txt).includes(q); });
        return docs.length ? `Apparaît dans ${docs.length} document(s) : ${docs.slice(0, 8).map(id => p.items[id].title).join(', ')}${docs.length > 8 ? '…' : ''}` : 'N’apparaît encore dans aucun document.';
      };
      const body = [
        h('div.form-grid', null,
          h('label', null, 'Nom', h('input.text', { value: f.name, autofocus: true, oninput: (e) => { f.name = e.target.value; } })),
          h('label', null, 'Type', h('select.text', { onchange: (e) => { f.kind = e.target.value; } }, kinds.map(k => h('option', { value: k.id, selected: k.id === f.kind }, k.one)))),
          h('label', null, 'Rôle / résumé', h('input.text', { value: f.role, placeholder: 'ex. : antagoniste, ville natale…', oninput: (e) => { f.role = e.target.value; } })),
          h('label', null, 'Couleur', h('input', { type: 'color', value: f.color || '#ffb86b', oninput: (e) => { f.color = e.target.value; } }))),
        h('label.field-label', null, 'Description, notes, arc, apparence…'),
        h('textarea.text', { rows: 9, value: f.text, oninput: (e) => { f.text = e.target.value; } }),
        isNew ? null : h('p.muted.small', null, appear()),
      ];
      const actions = [];
      if (!isNew) actions.push({ label: 'Supprimer', danger: true, run: () => { NS.confirm('Supprimer la fiche ?', `« ${b.name} » sera supprimée.`, 'Supprimer').then(ok => { if (ok) { p.bible = p.bible.filter(x => x.id !== b.id); this.changed(); this.render(); NS.editor.refreshCharacters(); } }); } });
      if (!isNew && NS.editor.doc && NS.editor.doc.kind === 'text') actions.push({ label: 'Insérer le nom', run: () => { NS.editor.restore(); document.execCommand('insertText', false, b.name); } });
      actions.push({ label: 'Annuler' }, { label: 'Enregistrer', primary: true, run: () => {
        if (!f.name.trim()) { NS.toast('Donnez un nom à la fiche.'); return false; }
        if (isNew) p.bible.push(f); else Object.assign(b, f);
        this.changed(); this.render(); NS.editor.refreshCharacters();
      } });
      NS.modal({ title: isNew ? 'Nouvelle fiche' : f.name, body, actions, wide: true });
    },

    /* ================================================================ Infos */
    renderInfos() {
      const p = this.p, doc = this.curDoc();
      const sec = (title, ...kids) => h('section.info-sec', null, h('h4.nav-sub', null, title), ...kids);
      if (doc) {
        const snaps = p.snapshots[doc.id] || [];
        this.body.append(sec('Document',
          h('input.text', { value: doc.title, 'aria-label': 'Titre du document', oninput: (e) => { doc.title = e.target.value; this.changed(); NS.app.refreshTitle(); } }),
          h('label.field-label', null, 'Statut'),
          h('select.text', { onchange: (e) => { doc.status = e.target.value; this.changed(); } }, P().STATUSES.map(s => h('option', { value: s.id, selected: s.id === doc.status }, s.label))),
          h('label.field-label', null, 'Synopsis'),
          h('textarea.text', { rows: 4, value: doc.synopsis || '', placeholder: 'En une ou deux phrases, que se passe-t-il ici ?', oninput: (e) => { doc.synopsis = e.target.value; this.changed(); } }),
          h('label.field-label', null, 'Notes'),
          h('textarea.text', { rows: 5, value: doc.notes || '', placeholder: 'Idées, questions, à vérifier…', oninput: (e) => { doc.notes = e.target.value; this.changed(); } }),
          h('div.muted.small', null, `${NS.fmtNum(doc.words || 0)} mots`)));
        this.body.append(sec(`Instantanés (${snaps.length})`,
          h('p.muted.small', null, 'Une copie figée du document, à restaurer si une réécriture tourne mal.'),
          h('button.btn.sm', { onclick: () => NS.ask('Instantané', 'Nom (facultatif) :', '').then(v => { if (v == null) return; NS.app.flush(); P().snapshot(p, doc.id, v); this.changed(); this.render(); NS.toast('Instantané enregistré.'); }) }, '📸 Prendre un instantané'),
          snaps.map((s, i) => h('div.snap-row', null,
            h('span', null, h('b', null, s.label || 'Instantané'), h('br'), h('small.muted', null, NS.fmtDate(s.t) + ` · ${NS.fmtNum(s.words || 0)} mots`)),
            h('span.snap-tools', null,
              h('button.ico.small', { title: 'Aperçu', onclick: () => this.previewSnap(s) }, '👁'),
              h('button.ico.small', { title: 'Restaurer', onclick: () => this.restoreSnap(doc, s) }, '↺'),
              h('button.ico.small', { title: 'Supprimer', onclick: () => { snaps.splice(i, 1); this.changed(); this.render(); } }, '✕'))))));
      }
      const m = p.meta;
      const total = P().totalWords(p);
      const goal = +m.goal || 0;
      const days = m.deadline ? Math.ceil((new Date(m.deadline) - new Date(NS.today())) / 86400000) : null;
      this.body.append(sec('Projet',
        h('label.field-label', null, 'Titre'),
        h('input.text', { value: p.title, oninput: (e) => { p.title = e.target.value; this.changed(); NS.app.refreshTitle(); } }),
        h('label.field-label', null, 'Auteur·e'),
        h('input.text', { value: m.author || '', oninput: (e) => { m.author = e.target.value; this.changed(); } }),
        p.mode === 'scenario' ? [h('label.field-label', null, 'Contact (page de titre)'), h('textarea.text', { rows: 2, value: m.contact || '', oninput: (e) => { m.contact = e.target.value; this.changed(); } })] : null,
        h('label.field-label', null, 'Logline / pitch'),
        h('textarea.text', { rows: 3, value: m.logline || '', placeholder: 'Quand X, Y doit Z, sinon…', oninput: (e) => { m.logline = e.target.value; this.changed(); } }),
        h('div.form-grid', null,
          h('label', null, 'Objectif (mots)', h('input.text', { type: 'number', min: 0, step: 1000, value: goal || '', oninput: (e) => { m.goal = +e.target.value || 0; this.changed(); NS.bus.emit('words'); } })),
          h('label', null, 'Échéance', h('input.text', { type: 'date', value: m.deadline || '', onchange: (e) => { m.deadline = e.target.value; this.changed(); this.render(); NS.bus.emit('words'); } }))),
        goal ? h('div.goal-line', null,
          h('div.st-bar', null, h('div.st-fill', { style: { width: Math.min(100, total / goal * 100) + '%' } })),
          h('div.muted.small', null, `${NS.fmtNum(total)} / ${NS.fmtNum(goal)} mots (${Math.round(total / goal * 100)} %)` + (days != null && days > 0 && total < goal ? ` · ${NS.fmtNum(Math.ceil((goal - total) / days))} mots/jour pendant ${days} j` : days != null && days <= 0 ? ' · échéance atteinte' : ''))) : null));
    },
    previewSnap(s) {
      const body = s.graph ? h('pre.snap-pre', null, NS.graph.toScript(s.graph)) : h('div.snap-preview.page-preview', { dataset: { mode: this.p.mode } });
      if (!s.graph) body.innerHTML = s.content;
      NS.modal({ title: (s.label || 'Instantané') + ' — ' + NS.fmtDate(s.t), body, wide: true, actions: [{ label: 'Fermer', primary: true }] });
    },
    restoreSnap(doc, s) {
      NS.confirm('Restaurer cet instantané ?', 'Le texte actuel sera remplacé. Un instantané « Avant restauration » est d’abord créé, par sécurité.', 'Restaurer').then(ok => {
        if (!ok) return;
        NS.app.flush();
        P().snapshot(this.p, doc.id, 'Avant restauration');
        if (s.graph) doc.graph = JSON.parse(JSON.stringify(s.graph)); else doc.content = s.content;
        doc.words = P().docWords(doc);
        this.changed();
        NS.app.openDoc(doc.id, true);
        NS.toast('Instantané restauré.');
      });
    },
  };

  function romanNum(n) {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    map.forEach(([v, r]) => { while (n >= v) { s += r; n -= v; } });
    return s;
  }
  function countAfterLastAct(items) {
    let n = 0;
    items.forEach(i => { if (i.level === 1) n = 0; else n++; });
    return n;
  }
  NS.romanNum = romanNum;

  /* ================================================================ tableau de liège */
  NS.corkboard = {
    render(root, folderId) {
      const p = NS.app.project, f = p.items[folderId];
      root.innerHTML = '';
      const grid = h('div.cork-grid');
      root.append(h('div.cork-head', null, h('h2', null, '📌 ', f.title), h('span.muted', null, `${f.children.length} élément(s) · ${NS.fmtNum(P().totalWords(p, [f.id]))} mots · glissez les cartes pour réordonner`),
        h('button.btn.sm', { onclick: () => { Nav.addItem('doc', null, { parent: f.id }); } }, '＋ ' + NS.modes.get(p.mode).docLabel)), grid);
      let dragId = null;
      f.children.forEach(id => {
        const it = p.items[id];
        const st = P().STATUSES.find(s => s.id === it.status);
        const card = h('div.cork-card', { draggable: true, dataset: { id }, style: { borderTopColor: st && st.id ? st.color : '' } },
          h('div.cork-title', null, h('span', null, it.type === 'folder' ? '📁 ' : ''), it.title, h('button.ico.small', { title: 'Ouvrir', onclick: () => Nav.activate(it) }, '↗')),
          h('textarea.cork-syn', { value: it.synopsis || '', placeholder: 'Synopsis…', oninput: (e) => { it.synopsis = e.target.value; NS.app.saveSoon(); } }),
          h('div.cork-foot', null, st && st.id ? st.label : '', h('span', null, NS.fmtNum(it.type === 'folder' ? P().totalWords(p, [id]) : it.words || 0) + ' mots')));
        card.addEventListener('dblclick', (e) => { if (!e.target.closest('textarea')) Nav.activate(it); });
        card.addEventListener('dragstart', (e) => { if (e.target.closest('textarea')) { e.preventDefault(); return; } dragId = id; card.classList.add('dragging'); });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        card.addEventListener('dragover', (e) => { if (dragId && dragId !== id) { e.preventDefault(); card.classList.add('over'); } });
        card.addEventListener('dragleave', () => card.classList.remove('over'));
        card.addEventListener('drop', (e) => {
          e.preventDefault(); card.classList.remove('over');
          if (!dragId || dragId === id) return;
          const r = card.getBoundingClientRect();
          const after = e.clientX > r.left + r.width / 2;
          P().move(p, dragId, f.id, f.children.indexOf(id) + (after ? 1 : 0));
          dragId = null;
          NS.app.saveSoon(); this.render(root, folderId); Nav.render();
        });
        grid.append(card);
      });
      if (!f.children.length) grid.append(h('p.muted', null, 'Ce dossier est vide.'));
    },
  };

  NS.nav = Nav;
})();

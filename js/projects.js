/* Projets : modèle de données (classeur de documents, fiches, instantanés) et persistance IndexedDB. */
(function () {
  'use strict';
  const NS = window.SE;
  const { uid } = NS;

  const STATUSES = [
    { id: '', label: 'Sans statut', color: 'transparent' },
    { id: 'idee', label: 'Idée', color: '#9aa7ff' },
    { id: 'brouillon', label: 'Premier jet', color: '#ffb86b' },
    { id: 'revision', label: 'En révision', color: '#ff8fa3' },
    { id: 'fini', label: 'Terminé', color: '#7fdca4' },
  ];
  const BIBLE_KINDS = [
    { id: 'personnage', label: 'Personnages', one: 'Personnage', icon: '👤' },
    { id: 'lieu', label: 'Lieux', one: 'Lieu', icon: '📍' },
    { id: 'objet', label: 'Objets & concepts', one: 'Objet', icon: '🗝️' },
    { id: 'recherche', label: 'Recherches & notes', one: 'Note', icon: '🔖' },
  ];

  let index = NS.store.get('projects', []); // [{id, title, mode, updated, words}]
  const saveIndex = () => NS.store.set('projects', index);

  function newItem(spec, mode, items) {
    const id = uid();
    const it = {
      id, type: spec.type || 'doc', title: spec.title || 'Sans titre',
      kind: spec.type === 'folder' ? null : (spec.kind || mode.docKind),
      children: [], content: spec.content || '', graph: spec.graph || null,
      synopsis: spec.synopsis || '', notes: spec.notes || '', status: spec.status || '', words: 0,
    };
    if (it.kind === 'graph' && !it.graph) it.graph = NS.graph ? NS.graph.empty() : { nodes: [], vars: [], start: null };
    if (it.kind === 'text' && !it.content) it.content = mode.id === 'scenario' ? '<p class="sc-scene"><br></p>' : mode.id === 'theatre' ? '<p class="th-dida"><br></p>' : '<p><br></p>';
    items[id] = it;
    (spec.children || []).forEach(c => it.children.push(newItem(c, mode, items)));
    return id;
  }

  const Projects = {
    STATUSES, BIBLE_KINDS,
    cur: null,
    list() { return index.slice().sort((a, b) => b.updated - a.updated); },

    create(modeId, title) {
      const mode = NS.modes.get(modeId);
      const tpl = mode.template();
      const items = {};
      const p = {
        id: uid(), version: 1, title: title || 'Projet sans titre', mode: mode.id,
        meta: { author: '', contact: '', logline: '', goal: mode.id === 'roman' ? 80000 : 0, deadline: '', draft: 'Premier jet' },
        created: Date.now(), updated: Date.now(),
        items, root: [], bible: [], snapshots: {}, open: null,
      };
      tpl.tree.forEach(s => p.root.push(newItem(s, mode, items)));
      (tpl.bible || []).forEach(b => p.bible.push(Object.assign({ id: uid(), color: '', text: '', role: '' }, b)));
      p.open = this.flatDocs(p)[0] || null;
      return p;
    },

    async load(id) {
      const p = await NS.idb.get('p:' + id);
      if (!p) throw new Error('introuvable');
      // compatibilité / réparations douces
      p.items = p.items || {}; p.root = p.root || []; p.bible = p.bible || []; p.snapshots = p.snapshots || {}; p.meta = p.meta || {};
      return p;
    },

    async persist(p) {
      p.updated = Date.now();
      const words = this.totalWords(p);
      await NS.idb.set('p:' + p.id, p);
      const row = { id: p.id, title: p.title, mode: p.mode, updated: p.updated, words };
      const i = index.findIndex(r => r.id === p.id);
      if (i >= 0) index[i] = row; else index.push(row);
      saveIndex();
    },

    async remove(id) {
      await NS.idb.del('p:' + id);
      index = index.filter(r => r.id !== id);
      saveIndex();
    },

    /** importer un projet (sauvegarde JSON) : nouvel identifiant pour ne rien écraser */
    async importJSON(obj) {
      if (!obj || !obj.items || !obj.root || !obj.mode) throw new Error('Ce fichier n’est pas une sauvegarde de Station d’écriture.');
      const p = JSON.parse(JSON.stringify(obj));
      p.id = uid();
      p.title = p.title || 'Projet importé';
      p.snapshots = p.snapshots || {}; p.bible = p.bible || []; p.meta = p.meta || {};
      await this.persist(p);
      return p;
    },

    /* ---------- classeur ---------- */
    flatDocs(p, ids) {
      const out = [];
      const walk = (list) => list.forEach(id => { const it = p.items[id]; if (!it) return; if (it.type === 'doc') out.push(id); walk(it.children); });
      walk(ids || p.root);
      return out;
    },
    /** parcours complet en profondeur : [{id, depth}] */
    walk(p) {
      const out = [];
      const rec = (list, depth) => list.forEach(id => { const it = p.items[id]; if (!it) return; out.push({ id, depth }); rec(it.children, depth + 1); });
      rec(p.root, 0);
      return out;
    },
    parentOf(p, id) {
      if (p.root.includes(id)) return null;
      return Object.values(p.items).find(it => it.children.includes(id)) || null;
    },
    siblings(p, id) { const par = this.parentOf(p, id); return par ? par.children : p.root; },
    add(p, spec, ref) {
      // ref : { parent: id|null, after: id|null }
      const mode = NS.modes.get(p.mode);
      const id = newItem(spec, mode, p.items);
      const list = ref && ref.parent ? p.items[ref.parent].children : p.root;
      const at = ref && ref.after ? list.indexOf(ref.after) + 1 : list.length;
      list.splice(at < 0 ? list.length : at, 0, id);
      return id;
    },
    removeItem(p, id) {
      const list = this.siblings(p, id);
      list.splice(list.indexOf(id), 1);
      const kill = (x) => { const it = p.items[x]; if (!it) return; it.children.forEach(kill); delete p.items[x]; delete p.snapshots[x]; };
      kill(id);
      if (p.open && !p.items[p.open]) p.open = this.flatDocs(p)[0] || null;
    },
    isAncestor(p, a, b) { // a est-il un ancêtre de b ?
      let par = this.parentOf(p, b);
      while (par) { if (par.id === a) return true; par = this.parentOf(p, par.id); }
      return false;
    },
    move(p, id, parentId, index) {
      if (id === parentId || (parentId && this.isAncestor(p, id, parentId))) return false;
      const from = this.siblings(p, id);
      const oldIdx = from.indexOf(id);
      from.splice(oldIdx, 1);
      const to = parentId ? p.items[parentId].children : p.root;
      if (to === from && index > oldIdx) index--;
      to.splice(NS.clamp(index, 0, to.length), 0, id);
      return true;
    },
    duplicate(p, id) {
      const src = p.items[id];
      const clone = (it) => ({ type: it.type, kind: it.kind, title: it.title, content: it.content, graph: it.graph ? JSON.parse(JSON.stringify(it.graph)) : null, synopsis: it.synopsis, notes: it.notes, status: it.status, children: it.children.map(c => clone(p.items[c])) });
      const spec = clone(src); spec.title += ' (copie)';
      const par = this.parentOf(p, id);
      return this.add(p, spec, { parent: par ? par.id : null, after: id });
    },

    /* ---------- mots ---------- */
    docWords(it) {
      if (!it || it.type !== 'doc') return 0;
      if (it.kind === 'graph') return (it.graph && it.graph.nodes || []).reduce((n, nd) => n + NS.countWords(nd.text) + (nd.choices || []).reduce((m, c) => m + NS.countWords(c.text), 0), 0);
      return NS.countWords(NS.htmlToText(it.content));
    },
    totalWords(p, ids) { return this.flatDocs(p, ids).reduce((n, id) => n + (p.items[id].words || 0), 0); },
    refreshWords(p) { Object.values(p.items).forEach(it => { it.words = this.docWords(it); }); },

    /* ---------- instantanés ---------- */
    snapshot(p, id, label) {
      const it = p.items[id];
      if (!it) return;
      const list = p.snapshots[id] = p.snapshots[id] || [];
      list.unshift({ t: Date.now(), label: label || '', content: it.content, graph: it.graph ? JSON.parse(JSON.stringify(it.graph)) : null, words: it.words });
      if (list.length > 40) list.length = 40;
    },
  };

  NS.projects = Projects;
})();

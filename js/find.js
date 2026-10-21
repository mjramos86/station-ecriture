/* Rechercher / remplacer : dans le document courant (avec surlignage) ou dans tout le projet. */
(function () {
  'use strict';
  const NS = window.SE;
  const { h } = NS;
  const HL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

  const Find = {
    matches: [], i: -1,
    init(root) {
      this.root = root;
      this.q = h('input.text', { type: 'search', placeholder: 'Rechercher…', 'aria-label': 'Rechercher', oninput: () => this.run(), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); this.step(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') this.close(); } });
      this.r = h('input.text', { type: 'text', placeholder: 'Remplacer par…', 'aria-label': 'Remplacer par', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); this.replaceOne(); } if (e.key === 'Escape') this.close(); } });
      this.caseBox = h('input', { type: 'checkbox', onchange: () => this.run() });
      this.wordBox = h('input', { type: 'checkbox', onchange: () => this.run() });
      this.allBox = h('input', { type: 'checkbox', onchange: () => this.run() });
      this.count = h('span.find-count');
      this.results = h('div.find-results');
      root.append(
        h('div.find-row', null, this.q, this.count,
          h('button.ico.small', { title: 'Précédent (Maj+Entrée)', onclick: () => this.step(-1) }, '↑'),
          h('button.ico.small', { title: 'Suivant (Entrée)', onclick: () => this.step(1) }, '↓'),
          h('button.ico.small', { title: 'Fermer (Échap)', onclick: () => this.close() }, '✕')),
        h('div.find-row', null, this.r,
          h('button.btn.sm', { onclick: () => this.replaceOne() }, 'Remplacer'),
          h('button.btn.sm', { onclick: () => this.replaceAll() }, 'Tout')),
        h('div.find-row.opts', null,
          h('label', null, this.caseBox, ' Aa'), h('label', null, this.wordBox, ' Mot entier'), h('label', null, this.allBox, ' Tout le projet')),
        this.results);
      NS.bus.on('open', () => { if (!this.root.hidden) this.run(); });
    },
    open(replace) {
      this.root.hidden = false;
      const sel = getSelection().toString();
      if (sel && sel.length < 80 && !/\n/.test(sel)) this.q.value = sel;
      (replace && this.q.value ? this.r : this.q).focus();
      this.q.select();
      this.run();
    },
    close() {
      this.root.hidden = true;
      if (HL) CSS.highlights.delete('find');
      NS.editor.focus();
    },
    regex() {
      const q = this.q.value;
      if (!q) return null;
      const src = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, '[\'’]').replace(/ /g, '[ \\u00A0\\u202F]');
      return new RegExp(this.wordBox.checked ? `(?<![\\p{L}\\p{N}])${src}(?![\\p{L}\\p{N}])` : src, 'gu' + (this.caseBox.checked ? '' : 'i'));
    },
    /** index des correspondances dans un élément : [{ node, start, end }] (dans un même nœud texte) */
    scan(root, re) {
      const out = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(n.textContent))) { if (!m[0]) { re.lastIndex++; continue; } out.push({ node: n, start: m.index, end: m.index + m[0].length }); }
      }
      return out;
    },
    run() {
      const re = this.regex();
      this.results.innerHTML = '';
      const ed = NS.editor;
      const textDoc = ed.doc && ed.doc.kind === 'text';
      this.matches = re && textDoc ? this.scan(ed.ed, re) : [];
      this.i = this.matches.length ? 0 : -1;
      if (HL) {
        CSS.highlights.delete('find');
        if (this.matches.length) CSS.highlights.set('find', new Highlight(...this.matches.map(m => this.range(m))));
      }
      this.count.textContent = re ? (textDoc ? `${this.matches.length}` : '–') : '';
      if (re && this.allBox.checked) this.projectResults(re);
      if (this.matches.length) this.show(false);
    },
    range(m) { const r = document.createRange(); r.setStart(m.node, m.start); r.setEnd(m.node, m.end); return r; },
    show(select) {
      const m = this.matches[this.i];
      if (!m || !m.node.isConnected) return;
      const r = this.range(m);
      if (select) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); NS.editor.lastRange = r.cloneRange(); }
      if (HL) CSS.highlights.set('find-cur', new Highlight(r));
      const rect = r.getBoundingClientRect(), wr = NS.editor.wrap.getBoundingClientRect();
      if (rect.top < wr.top + 60 || rect.bottom > wr.bottom - 40) NS.editor.wrap.scrollTop += rect.top - wr.top - wr.height / 3;
      this.count.textContent = `${this.i + 1} / ${this.matches.length}`;
    },
    step(d) {
      if (!this.matches.length) return;
      this.i = (this.i + d + this.matches.length) % this.matches.length;
      this.show(true);
    },
    replaceOne() {
      const m = this.matches[this.i];
      if (!m) return;
      NS.editor.ed.focus({ preventScroll: true });
      const s = getSelection(); s.removeAllRanges(); s.addRange(this.range(m));
      document.execCommand('insertText', false, this.r.value);
      NS.editor.afterChange();
      const keep = this.i;
      this.run();
      if (this.matches.length) { this.i = Math.min(keep, this.matches.length - 1); this.show(true); }
    },
    replaceAll() {
      const re = this.regex();
      if (!re) return;
      if (this.allBox.checked) { this.replaceProject(re); return; }
      const n = this.matches.length;
      if (!n) return;
      NS.editor.ed.focus({ preventScroll: true });
      for (let k = this.matches.length - 1; k >= 0; k--) {
        const s = getSelection(); s.removeAllRanges(); s.addRange(this.range(this.matches[k]));
        document.execCommand('insertText', false, this.r.value);
      }
      NS.editor.afterChange();
      this.run();
      NS.toast(`${n} remplacement(s).`);
    },

    /* ---------- tout le projet ---------- */
    docText(it) {
      if (it.kind === 'graph') return (it.graph ? it.graph.nodes : []).map(n => [n.title, n.speaker, n.text, ...n.choices.map(c => c.text)].join('\n')).join('\n');
      return NS.htmlToText(it.content);
    },
    projectResults(re) {
      const p = NS.app.project;
      NS.app.flush();
      let total = 0;
      NS.projects.flatDocs(p).forEach(id => {
        const it = p.items[id];
        const txt = this.docText(it);
        re.lastIndex = 0;
        const hits = [];
        let m;
        while ((m = re.exec(txt)) && hits.length < 50) { if (!m[0]) { re.lastIndex++; continue; } hits.push(m.index); }
        if (!hits.length) return;
        total += hits.length;
        const row = h('div.find-doc', null, h('button.find-doc-title', { onclick: () => { NS.app.openDoc(id); setTimeout(() => { this.run(); this.show(true); }, 50); } }, `${it.title} (${hits.length})`));
        const flat = (s) => s.replace(/\s+/g, ' ');
        hits.slice(0, 3).forEach(at => row.append(h('div.find-snip', null, (at > 30 ? '…' : '') + flat(txt.slice(Math.max(0, at - 30), at)), h('mark', null, txt.slice(at, at + this.q.value.length)), flat(txt.slice(at + this.q.value.length, at + this.q.value.length + 40)) + '…')));
        this.results.append(row);
      });
      this.results.prepend(h('div.muted.small', null, total ? `${total} occurrence(s) dans le projet` : 'Aucune occurrence dans le projet.'));
    },
    replaceProject(re) {
      const p = NS.app.project, rep = this.r.value;
      NS.app.flush();
      NS.confirm('Remplacer dans tout le projet ?', `Toutes les occurrences de « ${this.q.value} » seront remplacées par « ${rep} ». Un instantané de chaque document modifié est créé d’abord.`, 'Tout remplacer').then(ok => {
        if (!ok) return;
        let n = 0;
        NS.projects.flatDocs(p).forEach(id => {
          const it = p.items[id];
          let count = 0;
          if (it.kind === 'graph') {
            const g = it.graph;
            const f = (s) => String(s || '').replace(re, () => { count++; return rep; });
            const before = JSON.stringify(g);
            g.nodes.forEach(nd => { nd.title = f(nd.title); nd.speaker = f(nd.speaker); nd.text = f(nd.text); nd.choices.forEach(c => { c.text = f(c.text); }); });
            if (count) { const after = JSON.parse(JSON.stringify(g)); it.graph = JSON.parse(before); NS.projects.snapshot(p, id, 'Avant remplacement'); it.graph = after; }
          } else {
            const box = document.createElement('div');
            box.innerHTML = it.content;
            const hits = this.scan(box, re);
            if (hits.length) {
              NS.projects.snapshot(p, id, 'Avant remplacement');
              for (let k = hits.length - 1; k >= 0; k--) { const m = hits[k]; m.node.textContent = m.node.textContent.slice(0, m.start) + rep + m.node.textContent.slice(m.end); }
              it.content = box.innerHTML; count = hits.length;
            }
          }
          if (count) { it.words = NS.projects.docWords(it); n += count; }
        });
        NS.app.saveSoon();
        NS.app.openDoc(p.open, true);
        this.run();
        NS.toast(`${n} remplacement(s) dans le projet.`);
      });
    },
  };
  NS.find = Find;
})();

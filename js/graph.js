/*
 * Dialogues interactifs : graphe de nœuds (réplique + choix), conditions et effets sur des variables,
 * vue graphe déplaçable/zoomable, inspecteur, mode test, vérifications, export JSON / Ink / Yarn.
 *
 * Nœud  : { id, title, speaker, text, x, y, end, tags, choices:[{ id, text, target, cond, effect }] }
 * Graphe : { nodes:[], vars:[{ name, value }], start: id }
 * Conditions : `courage >= 2 && !trahi`   Effets : `courage += 1; trahi = true`
 */
(function () {
  'use strict';
  const NS = window.SE;
  const { h, $$, uid, clamp } = NS;
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ================================================================ mini-langage d'expressions */
  function tokenize(src) {
    const toks = [], re = /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_À-ÿ][\wÀ-ÿ]*)|(&&|\|\||==|!=|>=|<=|\+=|-=|[-+*/%<>!=();]))/gy;
    let m; re.lastIndex = 0;
    const s = String(src || '');
    while (re.lastIndex < s.length) {
      const at = re.lastIndex;
      m = re.exec(s);
      if (!m) { if (/^\s*$/.test(s.slice(at))) break; throw new Error('Caractère inattendu : « ' + s.slice(at, at + 8) + ' »'); }
      if (m[1]) toks.push({ t: 'num', v: parseFloat(m[1]) });
      else if (m[2]) toks.push({ t: 'str', v: m[2].slice(1, -1).replace(/\\(.)/g, '$1') });
      else if (m[3]) toks.push(/^(true|vrai)$/i.test(m[3]) ? { t: 'num', v: true } : /^(false|faux)$/i.test(m[3]) ? { t: 'num', v: false } : /^et$/i.test(m[3]) ? { t: 'op', v: '&&' } : /^ou$/i.test(m[3]) ? { t: 'op', v: '||' } : /^non$/i.test(m[3]) ? { t: 'op', v: '!' } : { t: 'id', v: m[3] });
      else if (m[4]) toks.push({ t: 'op', v: m[4] });
    }
    return toks;
  }
  const PREC = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
  function evalExpr(src, vars) {
    const toks = tokenize(src);
    let i = 0;
    const peek = () => toks[i];
    function primary() {
      const t = toks[i++];
      if (!t) throw new Error('Expression incomplète');
      if (t.t === 'num' || t.t === 'str') return t.v;
      if (t.t === 'id') return Object.prototype.hasOwnProperty.call(vars, t.v) ? vars[t.v] : 0;
      if (t.v === '!') return !primary();
      if (t.v === '-') return -primary();
      if (t.v === '(') { const v = expr(0); if (!toks[i] || toks[i++].v !== ')') throw new Error('Parenthèse manquante'); return v; }
      throw new Error('Symbole inattendu : ' + t.v);
    }
    function expr(min) {
      let left = primary();
      for (;;) {
        const t = peek();
        if (!t || t.t !== 'op' || !(t.v in PREC) || PREC[t.v] < min) return left;
        i++;
        const right = expr(PREC[t.v] + 1);
        switch (t.v) {
          case '||': left = left || right; break; case '&&': left = left && right; break;
          case '==': left = left == right; break; case '!=': left = left != right; break; // eslint-disable-line eqeqeq
          case '<': left = left < right; break; case '>': left = left > right; break;
          case '<=': left = left <= right; break; case '>=': left = left >= right; break;
          case '+': left = left + right; break; case '-': left = left - right; break;
          case '*': left = left * right; break; case '/': left = left / right; break; case '%': left = left % right; break;
        }
      }
    }
    if (!toks.length) return true;
    const v = expr(0);
    if (i < toks.length) throw new Error('Fin d’expression inattendue');
    return v;
  }
  function runEffect(src, vars) {
    String(src || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean).forEach(stmt => {
      const m = /^([A-Za-z_À-ÿ][\wÀ-ÿ]*)\s*(=|\+=|-=)\s*(.+)$/.exec(stmt);
      if (!m) throw new Error('Effet invalide : « ' + stmt + ' » (ex. : courage += 1)');
      const v = evalExpr(m[3], vars);
      if (m[2] === '=') vars[m[1]] = v;
      else if (m[2] === '+=') vars[m[1]] = (vars[m[1]] || 0) + v;
      else vars[m[1]] = (vars[m[1]] || 0) - v;
    });
  }
  const interp = (s, vars) => String(s || '').replace(/\{([\wÀ-ÿ]+)\}/g, (_, k) => (k in vars ? vars[k] : '{' + k + '}'));
  const parseValue = (s) => { const t = String(s).trim(); if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t); if (/^(true|vrai)$/i.test(t)) return true; if (/^(false|faux)$/i.test(t)) return false; return t; };

  /* ================================================================ modèle */
  const newNode = (x, y, extra) => Object.assign({ id: uid(), title: '', speaker: '', text: '', x, y, end: false, tags: '', choices: [] }, extra || {});
  const newChoice = (extra) => Object.assign({ id: uid(), text: '', target: '', cond: '', effect: '' }, extra || {});

  function sample() {
    const a = newNode(80, 80, { title: 'Accueil', speaker: 'Aubergiste', text: 'Encore un voyageur trempé… Qu’est-ce que je vous sers ?' });
    const b = newNode(470, 10, { title: 'Bière', speaker: 'Aubergiste', text: 'Une bonne mousse, ça ! Et avec ça, des nouvelles du col ?' });
    const c = newNode(470, 230, { title: 'Rumeurs', speaker: 'Aubergiste', text: 'On dit que la route du nord est gardée par… enfin, vous verrez bien. Ça fera {argent} pièces d’argent… ou un service.' });
    const d = newNode(860, 120, { title: 'Fin', speaker: 'Aubergiste', text: 'Bonne route, et ne traînez pas après la nuit tombée.', end: true });
    a.choices = [newChoice({ text: 'Une bière, s’il vous plaît.', target: b.id, effect: 'argent -= 2' }), newChoice({ text: 'Juste des informations.', target: c.id }), newChoice({ text: '[Menacer] Parle, ou gare à toi.', target: c.id, cond: 'courage >= 2', effect: 'reputation -= 1' })];
    b.choices = [newChoice({ text: 'Oui, racontez-moi.', target: c.id }), newChoice({ text: 'Non merci, je repars.', target: d.id })];
    c.choices = [newChoice({ text: '', target: d.id })];
    return { nodes: [a, b, c, d], vars: [{ name: 'argent', value: 10 }, { name: 'courage', value: 1 }, { name: 'reputation', value: 0 }], start: a.id, view: { x: 0, y: 0, z: 1 } };
  }
  NS.graphSample = sample;

  /* ================================================================ vérifications */
  function check(g) {
    const issues = [];
    const ids = new Set(g.nodes.map(n => n.id));
    if (!g.start || !ids.has(g.start)) issues.push({ msg: 'Aucun nœud de départ défini.' });
    const reach = new Set();
    const stack = g.start && ids.has(g.start) ? [g.start] : [];
    while (stack.length) { const id = stack.pop(); if (reach.has(id)) continue; reach.add(id); const n = g.nodes.find(x => x.id === id); n.choices.forEach(c => { if (c.target && ids.has(c.target)) stack.push(c.target); }); }
    const names = new Set(g.vars.map(v => v.name));
    g.nodes.forEach(n => {
      const label = n.title || n.text.slice(0, 30) || 'nœud sans titre';
      if (!reach.has(n.id) && g.start) issues.push({ node: n.id, msg: `« ${label} » n’est jamais atteint.` });
      if (!n.choices.length && !n.end) issues.push({ node: n.id, msg: `« ${label} » est une impasse (aucun choix, pas marqué « fin »).` });
      n.choices.forEach((c, i) => {
        if (!c.target) issues.push({ node: n.id, msg: `« ${label} », choix ${i + 1} : aucune destination.` });
        else if (!ids.has(c.target)) issues.push({ node: n.id, msg: `« ${label} », choix ${i + 1} : destination supprimée.` });
        try { evalExpr(c.cond, {}); } catch (e) { issues.push({ node: n.id, msg: `« ${label} », condition ${i + 1} : ${e.message}` }); }
        try { runEffect(c.effect, {}); } catch (e) { issues.push({ node: n.id, msg: `« ${label} », effet ${i + 1} : ${e.message}` }); }
        tokenize(c.cond + ' ' + c.effect).filter(t => t.t === 'id').forEach(t => { if (!names.has(t.v)) issues.push({ node: n.id, msg: `Variable inconnue « ${t.v} » (ajoutez-la dans Variables).` }); });
      });
    });
    const seen = new Set();
    return issues.filter(x => { const k = x.node + x.msg; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  /* ================================================================ exports */
  const knot = (n, g) => 'n_' + (n.title ? NS.slug(n.title).replace(/-/g, '_') : '') + '_' + g.nodes.indexOf(n);
  function toInk(g, title) {
    const L = [`// ${title} — exporté depuis Station d’écriture`];
    g.vars.forEach(v => L.push(`VAR ${v.name} = ${typeof v.value === 'string' ? JSON.stringify(v.value) : v.value}`));
    const start = g.nodes.find(n => n.id === g.start);
    if (start) L.push('', `-> ${knot(start, g)}`);
    const conv = (s) => String(s || '').replace(/\{([\wÀ-ÿ]+)\}/g, '{$1}');
    const effInk = (e) => String(e || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean).map(s => `~ ${s}`);
    g.nodes.forEach(n => {
      L.push('', `=== ${knot(n, g)} ===`);
      if (n.tags) L.push('# ' + n.tags.split(',').map(t => t.trim()).filter(Boolean).join(' # '));
      L.push((n.speaker ? n.speaker + ': ' : '') + conv(n.text));
      if (!n.choices.length) { L.push('-> END'); return; }
      const auto = n.choices.length === 1 && !n.choices[0].text;
      n.choices.forEach(c => {
        const tgt = g.nodes.find(x => x.id === c.target);
        const dest = tgt ? '-> ' + knot(tgt, g) : '-> END';
        if (auto) { effInk(c.effect).forEach(x => L.push(x)); L.push(dest); return; }
        L.push(`* ${c.cond ? '{' + c.cond.replace(/&&/g, 'and').replace(/\|\|/g, 'or') + '} ' : ''}[${conv(c.text).replace(/[[\]]/g, '\\$&')}]`);
        effInk(c.effect).forEach(x => L.push('    ' + x));
        L.push('    ' + dest);
      });
    });
    return L.join('\n') + '\n';
  }
  function toYarn(g) {
    const name = (n) => (n.title ? NS.slug(n.title).replace(/-/g, '_') : 'Noeud') + '_' + g.nodes.indexOf(n);
    const out = [];
    const ordered = g.nodes.slice().sort((a, b) => (a.id === g.start ? -1 : b.id === g.start ? 1 : 0));
    ordered.forEach(n => {
      const L = [`title: ${name(n)}`];
      if (n.tags) L.push('tags: ' + n.tags.split(',').map(t => t.trim()).join(' '));
      L.push(`position: ${Math.round(n.x)},${Math.round(n.y)}`, '---');
      if (n.id === g.start) g.vars.forEach(v => L.push(`<<declare $${v.name} = ${typeof v.value === 'string' ? JSON.stringify(v.value) : v.value}>>`));
      L.push((n.speaker ? n.speaker + ': ' : '') + String(n.text || '').replace(/\{([\wÀ-ÿ]+)\}/g, '{$$$1}'));
      const yv = (s) => String(s || '').replace(/([A-Za-z_À-ÿ][\wÀ-ÿ]*)/g, (m) => /^(true|false|and|or|not)$/.test(m) ? m : '$' + m);
      const auto = n.choices.length === 1 && !n.choices[0].text;
      n.choices.forEach(c => {
        const tgt = g.nodes.find(x => x.id === c.target);
        const eff = String(c.effect || '').split(/[;\n]/).map(s => s.trim()).filter(Boolean).map(s => { const m = /^(\S+)\s*(\+=|-=|=)\s*(.+)$/.exec(s); return m ? `<<set $${m[1]} to ${m[2] === '=' ? yv(m[3]) : '$' + m[1] + ' ' + m[2][0] + ' ' + yv(m[3])}>>` : `// ${s}`; });
        if (auto) { eff.forEach(e => L.push(e)); if (tgt) L.push(`<<jump ${name(tgt)}>>`); return; }
        L.push(`-> ${c.text}${c.cond ? ` <<if ${yv(c.cond)}>>` : ''}`);
        eff.forEach(e => L.push('    ' + e));
        if (tgt) L.push(`    <<jump ${name(tgt)}>>`);
      });
      L.push('===');
      out.push(L.join('\n'));
    });
    return out.join('\n') + '\n';
  }
  function toScript(g) {
    // lecture « linéaire » pour relecture / impression
    return g.nodes.map((n, i) => {
      const lines = [`[${i + 1}] ${n.title || 'Nœud'}${n.id === g.start ? '  (départ)' : ''}${n.end ? '  (fin)' : ''}`, `${n.speaker ? n.speaker.toUpperCase() + ' — ' : ''}${n.text}`];
      n.choices.forEach(c => { const t = g.nodes.findIndex(x => x.id === c.target); lines.push(`   → ${c.text || '(continuer)'}${c.cond ? ` [si ${c.cond}]` : ''}${c.effect ? ` {${c.effect}}` : ''}  ⇒ ${t >= 0 ? '[' + (t + 1) + ']' : '—'}`); });
      return lines.join('\n');
    }).join('\n\n') + '\n';
  }

  /* ================================================================ vue */
  const Graph = {
    root: null, doc: null, g: null, sel: null,
    empty() { const n = newNode(120, 120, { title: 'Début' }); return { nodes: [n], vars: [], start: n.id, view: { x: 0, y: 0, z: 1 } }; },
    check, evalExpr, runEffect, toInk, toYarn, toScript,

    init(root) {
      this.root = root;
      this.bar = h('div.g-bar');
      this.canvas = h('div.g-canvas', { tabindex: 0 });
      this.world = h('div.g-world');
      this.svg = document.createElementNS(SVGNS, 'svg'); this.svg.setAttribute('class', 'g-edges');
      this.world.append(this.svg);
      this.canvas.append(this.world, h('div.g-help', null, 'Double-clic : nouveau nœud · glisser le fond : se déplacer · molette : zoom · tirer le ● d’un choix vers un nœud : relier'));
      this.side = h('aside.g-side');
      root.append(this.bar, h('div.g-main', null, this.canvas, this.side));
      this.saveSoon = NS.debounce(() => this.commit(), 400);
      this.bindCanvas();
    },
    open(project, doc) {
      this.project = project; this.doc = doc;
      if (!doc.graph) doc.graph = this.empty();
      this.g = doc.graph;
      this.g.view = this.g.view || { x: 0, y: 0, z: 1 };
      this.g.vars = this.g.vars || [];
      this.sel = this.g.start || (this.g.nodes[0] && this.g.nodes[0].id) || null;
      this.buildBar();
      this.render();
      this.inspect();
      const v = this.g.view;
      if (!v.x && !v.y && v.z === 1) requestAnimationFrame(() => this.fit());
    },
    commit() {
      if (!this.doc) return;
      const w = NS.projects.docWords(this.doc);
      NS.stats.add(w - (this.doc.words || 0));
      this.doc.words = w;
      NS.bus.emit('doc-change', this.doc);
      NS.bus.emit('outline');
    },
    node(id) { return this.g.nodes.find(n => n.id === id); },
    speakers() {
      const s = new Set(this.project.bible.filter(b => b.kind === 'personnage').map(b => b.name));
      this.g.nodes.forEach(n => n.speaker && s.add(n.speaker));
      return Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
    },

    buildBar() {
      const b = this.bar;
      b.innerHTML = '';
      const btn = (label, title, run, cls) => h('button.btn.sm' + (cls ? '.' + cls : ''), { title, onclick: run }, label);
      b.append(
        btn('＋ Nœud', 'Ajouter un nœud', () => { const v = this.g.view, r = this.canvas.getBoundingClientRect(); this.addNode((r.width / 2 - v.x) / v.z - 110, (r.height / 2 - v.y) / v.z - 50); }),
        btn('▶ Tester', 'Jouer la conversation', () => this.play(), 'primary'),
        btn('𝑥 Variables', 'Variables de la conversation', () => this.varsDialog()),
        btn('✓ Vérifier', 'Repérer impasses, nœuds inaccessibles, erreurs', () => this.checkDialog()),
        btn('⤢ Recentrer', 'Tout afficher', () => this.fit()),
        h('span.g-zoom', null, btn('－', 'Dézoomer', () => this.zoomBy(1 / 1.2)), btn('＋', 'Zoomer', () => this.zoomBy(1.2))),
        h('span.spacer'),
        btn('⇩ Exporter', 'JSON, Ink, Yarn ou texte', (e) => { const r = e.currentTarget.getBoundingClientRect(); NS.menu(r.left, r.bottom + 4, [
          { label: 'JSON (moteurs maison, Unity, Godot…)', icon: '{}', run: () => NS.download(NS.slug(this.doc.title) + '.json', JSON.stringify(this.exportJSON(), null, 2), 'application/json') },
          { label: 'Ink (.ink)', icon: '✒', run: () => NS.download(NS.slug(this.doc.title) + '.ink', toInk(this.g, this.doc.title)) },
          { label: 'Yarn Spinner (.yarn)', icon: '🧶', run: () => NS.download(NS.slug(this.doc.title) + '.yarn', toYarn(this.g)) },
          { label: 'Texte lisible (.txt)', icon: '📄', run: () => NS.download(NS.slug(this.doc.title) + '.txt', toScript(this.g)) },
        ]); }),
      );
    },
    exportJSON() {
      return { title: this.doc.title, start: this.g.start, variables: Object.fromEntries(this.g.vars.map(v => [v.name, v.value])),
        nodes: this.g.nodes.map(n => ({ id: n.id, title: n.title, speaker: n.speaker, text: n.text, end: !!n.end, tags: n.tags ? n.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          choices: n.choices.map(c => ({ text: c.text, next: c.target || null, condition: c.cond || null, effect: c.effect || null })) })) };
    },

    /* ---------- rendu ---------- */
    applyView() {
      const v = this.g.view;
      this.world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
      this.canvas.style.backgroundPosition = `${v.x}px ${v.y}px`;
      this.canvas.style.backgroundSize = `${24 * v.z}px ${24 * v.z}px`;
    },
    render() {
      $$('.g-node', this.world).forEach(n => n.remove());
      this.els = {};
      this.g.nodes.forEach(n => this.world.appendChild(this.renderNode(n)));
      this.applyView();
      requestAnimationFrame(() => this.drawEdges());
    },
    renderNode(n) {
      const el = h('div.g-node' + (n.id === this.sel ? '.sel' : '') + (n.id === this.g.start ? '.start' : '') + (n.end ? '.end' : ''), { dataset: { id: n.id }, style: { left: n.x + 'px', top: n.y + 'px' } });
      const head = h('div.g-head', null,
        n.id === this.g.start ? h('span.g-badge', { title: 'Départ' }, '▶') : null,
        h('span.g-title', null, n.title || 'Sans titre'),
        n.end ? h('span.g-badge.endb', { title: 'Fin' }, '■') : null);
      const body = h('div.g-body', null, n.speaker ? h('b.g-speaker', null, n.speaker) : null, h('div.g-text', null, n.text ? (n.text.length > 140 ? n.text.slice(0, 140) + '…' : n.text) : h('i.muted', null, 'Réplique vide')));
      const chs = h('div.g-choices', null, n.choices.map((c, i) => h('div.g-choice' + (c.cond ? '.cond' : ''), { dataset: { cid: c.id } },
        h('span.g-cnum', null, i + 1), h('span.g-ctext', null, c.text || '(continuer)'), c.cond ? h('span.g-lock', { title: 'Condition : ' + c.cond }, '🔒') : null,
        h('span.g-port' + (c.target ? '.linked' : ''), { title: 'Tirer vers un nœud pour relier', dataset: { cid: c.id } }))));
      el.append(head, body, chs, h('button.g-add', { title: 'Ajouter un choix', onclick: (e) => { e.stopPropagation(); this.select(n.id); n.choices.push(newChoice()); this.changed(); this.refreshNode(n); this.inspect(); } }, '＋ choix'));
      this.els[n.id] = el;
      return el;
    },
    drawEdges() {
      const svg = this.svg;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const defs = document.createElementNS(SVGNS, 'defs');
      defs.innerHTML = '<marker id="g-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>';
      svg.appendChild(defs);
      let maxX = 0, maxY = 0;
      this.g.nodes.forEach(n => {
        const el = this.els[n.id];
        if (!el) return;
        maxX = Math.max(maxX, n.x + el.offsetWidth + 200); maxY = Math.max(maxY, n.y + el.offsetHeight + 200);
        n.choices.forEach(c => {
          const tgt = c.target && this.els[c.target];
          if (!tgt) return;
          const p = this.portPos(n, c.id);
          const t = this.g.nodes.find(x => x.id === c.target);
          const x2 = t.x - 2, y2 = t.y + 18;
          this.svg.appendChild(this.edgePath(p.x, p.y, x2, y2, c.cond ? 'cond' : '', n.id === this.sel || t.id === this.sel));
        });
      });
      svg.setAttribute('width', Math.max(maxX, 2000)); svg.setAttribute('height', Math.max(maxY, 2000));
    },
    portPos(n, cid) {
      const el = this.els[n.id], port = el.querySelector(`.g-port[data-cid="${cid}"]`);
      let x = port.offsetWidth / 2, y = port.offsetHeight / 2, o = port;
      while (o && o !== el) { x += o.offsetLeft; y += o.offsetTop; o = o.offsetParent; }
      return { x: n.x + x, y: n.y + y };
    },
    edgePath(x1, y1, x2, y2, cls, hot) {
      const path = document.createElementNS(SVGNS, 'path');
      const dx = Math.max(40, Math.abs(x2 - x1) / 2);
      const back = x2 < x1 + 20;
      const d = back
        ? `M${x1},${y1} C${x1 + 80},${y1} ${x1 + 80},${Math.max(y1, y2) + 120} ${(x1 + x2) / 2},${Math.max(y1, y2) + 120} S${x2 - 80},${y2} ${x2},${y2}`
        : `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      path.setAttribute('d', d);
      path.setAttribute('class', 'g-edge ' + (cls || '') + (hot ? ' hot' : ''));
      path.setAttribute('marker-end', 'url(#g-arrow)');
      return path;
    },

    /* ---------- interactions ---------- */
    bindCanvas() {
      const cv = this.canvas;
      let drag = null;
      const toWorld = (cx, cy) => { const r = cv.getBoundingClientRect(), v = this.g.view; return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }; };
      cv.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.button !== 1) return;
        const port = e.target.closest('.g-port');
        const nodeEl = e.target.closest('.g-node');
        if (e.target.closest('button')) return;
        if (port) {
          const n = this.node(port.closest('.g-node').dataset.id);
          const p = this.portPos(n, port.dataset.cid);
          drag = { kind: 'link', n, cid: port.dataset.cid, from: p, path: this.edgePath(p.x, p.y, p.x, p.y, 'drafting') };
          this.svg.appendChild(drag.path);
        } else if (nodeEl) {
          const n = this.node(nodeEl.dataset.id);
          this.select(n.id);
          const w = toWorld(e.clientX, e.clientY);
          drag = { kind: 'node', n, dx: w.x - n.x, dy: w.y - n.y, moved: false };
        } else {
          drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.g.view.x, vy: this.g.view.y };
          cv.classList.add('panning');
        }
        cv.setPointerCapture(e.pointerId);
        e.preventDefault();
        cv.focus({ preventScroll: true });
      });
      cv.addEventListener('pointermove', (e) => {
        if (!drag) return;
        if (drag.kind === 'pan') { this.g.view.x = drag.vx + e.clientX - drag.sx; this.g.view.y = drag.vy + e.clientY - drag.sy; this.applyView(); }
        else if (drag.kind === 'node') {
          const w = toWorld(e.clientX, e.clientY);
          drag.n.x = Math.round((w.x - drag.dx) / 8) * 8; drag.n.y = Math.round((w.y - drag.dy) / 8) * 8;
          drag.moved = true;
          const el = this.els[drag.n.id]; el.style.left = drag.n.x + 'px'; el.style.top = drag.n.y + 'px';
          this.drawEdges();
        } else if (drag.kind === 'link') {
          const w = toWorld(e.clientX, e.clientY);
          const np = this.edgePath(drag.from.x, drag.from.y, w.x, w.y, 'drafting');
          drag.path.setAttribute('d', np.getAttribute('d'));
          $$('.g-node.drop', this.world).forEach(x => x.classList.remove('drop'));
          const over = document.elementFromPoint(e.clientX, e.clientY);
          const ne = over && over.closest('.g-node');
          if (ne) ne.classList.add('drop');
        }
      });
      const end = (e) => {
        if (!drag) return;
        cv.classList.remove('panning');
        if (drag.kind === 'link') {
          drag.path.remove();
          $$('.g-node.drop', this.world).forEach(x => x.classList.remove('drop'));
          const over = document.elementFromPoint(e.clientX, e.clientY);
          const ne = over && over.closest('.g-node');
          const c = drag.n.choices.find(x => x.id === drag.cid);
          if (ne) c.target = ne.dataset.id;
          else if (over && cv.contains(over)) { // relâché dans le vide : créer le nœud suivant
            const w = toWorld(e.clientX, e.clientY);
            const nn = this.addNode(w.x, w.y - 18, { speaker: drag.n.speaker }, true);
            c.target = nn.id;
          }
          this.changed(); this.render(); this.inspect();
        } else if (drag.kind === 'node' && drag.moved) this.saveSoon();
        else if (drag.kind === 'pan') this.saveSoon();
        drag = null;
      };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      cv.addEventListener('dblclick', (e) => {
        if (e.target.closest('.g-node')) { const t = this.side.querySelector('textarea'); if (t) t.focus(); return; }
        const w = toWorld(e.clientX, e.clientY);
        this.addNode(w.x - 110, w.y - 30);
      });
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          const r = cv.getBoundingClientRect();
          this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
        } else { this.g.view.x -= e.deltaX; this.applyView(); }
      }, { passive: false });
      cv.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { e.preventDefault(); this.removeNode(this.sel); }
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); const n = this.node(this.sel); this.addNode(n ? n.x + 300 : 100, n ? n.y : 100); }
      });
      cv.addEventListener('contextmenu', (e) => {
        const ne = e.target.closest('.g-node');
        e.preventDefault();
        if (!ne) { const w = toWorld(e.clientX, e.clientY); NS.menu(e.clientX, e.clientY, [{ label: 'Nouveau nœud ici', icon: '＋', run: () => this.addNode(w.x, w.y) }, { label: 'Tout afficher', icon: '⤢', run: () => this.fit() }]); return; }
        const n = this.node(ne.dataset.id);
        NS.menu(e.clientX, e.clientY, [
          { label: 'Définir comme départ', icon: '▶', run: () => { this.g.start = n.id; this.changed(); this.render(); } },
          { label: n.end ? 'Ne plus marquer comme fin' : 'Marquer comme fin', icon: '■', run: () => { n.end = !n.end; this.changed(); this.render(); this.inspect(); } },
          { label: 'Dupliquer', icon: '⧉', run: () => { const c = JSON.parse(JSON.stringify(n)); c.id = uid(); c.x += 40; c.y += 40; c.choices.forEach(ch => { ch.id = uid(); }); this.g.nodes.push(c); this.select(c.id); this.changed(); this.render(); } },
          { label: 'Tester à partir d’ici', icon: '▷', run: () => this.play(n.id) },
          '-',
          { label: 'Supprimer', icon: '🗑', danger: true, run: () => this.removeNode(n.id) },
        ]);
      });
    },
    zoomBy(k, cx, cy) {
      const v = this.g.view, r = this.canvas.getBoundingClientRect();
      if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
      const z = clamp(v.z * k, 0.25, 2);
      v.x = cx - (cx - v.x) * (z / v.z); v.y = cy - (cy - v.y) * (z / v.z); v.z = z;
      this.applyView(); this.saveSoon();
    },
    fit() {
      if (!this.g.nodes.length) return;
      const xs = this.g.nodes.map(n => n.x), ys = this.g.nodes.map(n => n.y);
      const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs) + 260, maxY = Math.max(...ys) + 200;
      const r = this.canvas.getBoundingClientRect();
      const z = clamp(Math.min(r.width / (maxX - minX + 80), r.height / (maxY - minY + 80)), 0.25, 1.2);
      this.g.view = { z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: (r.height - (maxY - minY) * z) / 2 - minY * z };
      this.applyView(); this.saveSoon();
    },
    centerOn(id) {
      const n = this.node(id); if (!n) return;
      const r = this.canvas.getBoundingClientRect(), v = this.g.view;
      v.x = r.width / 2 - (n.x + 120) * v.z; v.y = r.height / 2 - (n.y + 60) * v.z;
      this.applyView(); this.select(id);
    },
    select(id) {
      if (this.sel === id) return;
      this.sel = id;
      $$('.g-node', this.world).forEach(el => el.classList.toggle('sel', el.dataset.id === id));
      this.drawEdges();
      this.inspect();
    },
    addNode(x, y, extra, silent) {
      const n = newNode(Math.round(x / 8) * 8, Math.round(y / 8) * 8, extra);
      if (!this.g.nodes.length) this.g.start = n.id;
      this.g.nodes.push(n);
      this.sel = n.id;
      if (!silent) { this.changed(); this.render(); this.inspect(); setTimeout(() => { const t = this.side.querySelector('.gi-text'); if (t) t.focus(); }, 30); }
      return n;
    },
    removeNode(id) {
      const n = this.node(id); if (!n) return;
      NS.confirm('Supprimer ce nœud ?', `« ${n.title || n.text.slice(0, 40) || 'Sans titre'} » et ses choix seront supprimés. Les choix qui y mènent resteront sans destination.`, 'Supprimer').then(ok => {
        if (!ok) return;
        this.g.nodes = this.g.nodes.filter(x => x.id !== id);
        this.g.nodes.forEach(x => x.choices.forEach(c => { if (c.target === id) c.target = ''; }));
        if (this.g.start === id) this.g.start = this.g.nodes[0] ? this.g.nodes[0].id : null;
        this.sel = null;
        this.changed(); this.render(); this.inspect();
      });
    },
    changed() { this.saveSoon(); },
    refreshNode(n) {
      const old = this.els[n.id];
      if (!old) return;
      const el = this.renderNode(n);
      old.replaceWith(el);
      this.drawEdges();
    },

    /* ---------- inspecteur ---------- */
    inspect() {
      const side = this.side;
      side.innerHTML = '';
      const n = this.node(this.sel);
      if (!n) {
        side.append(h('div.gi-empty', null, h('p', null, 'Sélectionnez un nœud pour le modifier.'), h('p.muted', null, 'Chaque nœud est une réplique ; ses choix mènent à d’autres nœuds. Un choix sans texte devient « continuer ». Conditions et effets utilisent les variables : ', h('code', null, 'argent >= 5 && !trahi'), ', ', h('code', null, 'argent -= 5; trahi = vrai'), '. Insérez une variable dans une réplique avec ', h('code', null, '{argent}'), '.')));
        return;
      }
      const upd = (fn, redraw) => (e) => { fn(e.target.type === 'checkbox' ? e.target.checked : e.target.value); this.changed(); if (redraw !== false) this.refreshNode(n); };
      const listId = 'g-speakers';
      const dl = h('datalist#' + listId, null, this.speakers().map(s => h('option', { value: s })));
      const nodeOpts = () => [h('option', { value: '' }, '— destination —'), ...this.g.nodes.map((x, i) => h('option', { value: x.id }, `${i + 1}. ${x.title || (x.text || 'Sans titre').slice(0, 32)}`)), h('option', { value: '__new' }, '＋ Nouveau nœud…')];
      side.append(
        dl,
        h('div.gi-row', null,
          h('input.text.gi-title', { value: n.title, placeholder: 'Titre du nœud', oninput: upd(v => { n.title = v; }) }),
          h('button.ico.small', { title: 'Supprimer le nœud', onclick: () => this.removeNode(n.id) }, '🗑')),
        h('label.field-label', null, 'Personnage'),
        h('input.text', { value: n.speaker, list: listId, placeholder: 'Qui parle ? (vide = narration)', oninput: upd(v => { n.speaker = v; }) }),
        h('label.field-label', null, 'Réplique'),
        h('textarea.text.gi-text', { rows: 5, value: n.text, placeholder: 'Ce que dit le personnage…', oninput: upd(v => { n.text = v; }) }),
        h('div.gi-flags', null,
          h('label', null, h('input', { type: 'checkbox', checked: n.id === this.g.start, onchange: (e) => { if (e.target.checked) { this.g.start = n.id; this.changed(); this.render(); } else e.target.checked = true; } }), ' Départ'),
          h('label', null, h('input', { type: 'checkbox', checked: n.end, onchange: upd(v => { n.end = v; }) }), ' Fin de conversation')),
        h('label.field-label', null, 'Étiquettes (séparées par des virgules)'),
        h('input.text', { value: n.tags, placeholder: 'ex. : colère, quête_principale', oninput: upd(v => { n.tags = v; }, false) }),
        h('h4.gi-h', null, 'Choix ', h('span.muted', null, `(${n.choices.length})`)),
      );
      n.choices.forEach((c, i) => {
        const tgtSel = h('select.text', { onchange: (e) => {
          if (e.target.value === '__new') { const nn = this.addNode(n.x + 320, n.y + i * 90, { speaker: n.speaker }, true); c.target = nn.id; this.changed(); this.render(); this.inspect(); return; }
          c.target = e.target.value; this.changed(); this.drawEdges();
        } }, nodeOpts());
        tgtSel.value = c.target || '';
        side.append(h('div.gi-choice', null,
          h('div.gi-row', null, h('span.g-cnum', null, i + 1),
            h('input.text', { value: c.text, placeholder: '(continuer)', oninput: upd(v => { c.text = v; }) }),
            h('button.ico.small', { title: 'Monter', onclick: () => { if (i > 0) { [n.choices[i - 1], n.choices[i]] = [n.choices[i], n.choices[i - 1]]; this.changed(); this.refreshNode(n); this.inspect(); } } }, '▲'),
            h('button.ico.small', { title: 'Supprimer le choix', onclick: () => { n.choices.splice(i, 1); this.changed(); this.refreshNode(n); this.inspect(); } }, '✕')),
          h('div.gi-row', null, h('span.gi-k', null, '⇒'), tgtSel, c.target ? h('button.ico.small', { title: 'Aller au nœud', onclick: () => this.centerOn(c.target) }, '↗') : null),
          h('div.gi-row', null, h('span.gi-k', { title: 'Condition' }, 'si'), h('input.text.mono', { value: c.cond, placeholder: 'condition (facultatif)', oninput: upd(v => { c.cond = v; }) })),
          h('div.gi-row', null, h('span.gi-k', { title: 'Effet' }, 'fx'), h('input.text.mono', { value: c.effect, placeholder: 'effet (facultatif)', oninput: upd(v => { c.effect = v; }, false) }))));
      });
      side.append(h('button.btn.wide', { onclick: () => { n.choices.push(newChoice()); this.changed(); this.refreshNode(n); this.inspect(); } }, '＋ Ajouter un choix'));
      if (this.g.vars.length) side.append(h('div.w-note', null, 'Variables : ', this.g.vars.map(v => h('code', null, v.name)).reduce((a, x) => a.length ? [...a, ' ', x] : [x], [])));
    },

    /* ---------- variables ---------- */
    varsDialog() {
      const list = h('div.vars');
      const draw = () => {
        list.innerHTML = '';
        this.g.vars.forEach((v, i) => list.append(h('div.gi-row', null,
          h('input.text.mono', { value: v.name, placeholder: 'nom', oninput: (e) => { v.name = e.target.value.replace(/[^\wÀ-ÿ]/g, ''); this.changed(); } }),
          h('span.gi-k', null, '='),
          h('input.text.mono', { value: String(v.value), placeholder: 'valeur initiale', oninput: (e) => { v.value = parseValue(e.target.value); this.changed(); } }),
          h('button.ico.small', { title: 'Supprimer', onclick: () => { this.g.vars.splice(i, 1); this.changed(); draw(); } }, '✕'))));
        list.append(h('button.btn', { onclick: () => { this.g.vars.push({ name: 'var' + (this.g.vars.length + 1), value: 0 }); this.changed(); draw(); } }, '＋ Variable'));
      };
      draw();
      NS.modal({ title: 'Variables', body: [h('p.muted', null, 'Nombres, vrai/faux ou texte. Utilisables dans les conditions, les effets et les répliques ({nom}).'), list], actions: [{ label: 'Fermer', primary: true }], onclose: () => this.inspect() });
    },
    checkDialog() {
      const issues = check(this.g);
      const body = issues.length
        ? h('ul.issues', null, issues.map(x => h('li', null, x.node ? h('a', { href: '#', onclick: (e) => { e.preventDefault(); this.centerOn(x.node); m.close(); } }, x.msg) : x.msg)))
        : h('p', null, '✓ Aucun problème détecté : tous les nœuds sont atteignables et chaque branche aboutit.');
      const m = NS.modal({ title: issues.length ? `${issues.length} point(s) à vérifier` : 'Tout est en ordre', body, actions: [{ label: 'Fermer', primary: true }] });
    },

    /* ---------- mode test ---------- */
    play(fromId) {
      const vars = Object.fromEntries(this.g.vars.map(v => [v.name, v.value]));
      const log = h('div.play-log'), choicesEl = h('div.play-choices'), varsEl = h('div.play-vars');
      const showVars = () => { varsEl.innerHTML = ''; Object.entries(vars).forEach(([k, v]) => varsEl.append(h('span.chip', null, `${k} = ${v}`))); };
      const go = (id) => {
        const n = this.node(id);
        choicesEl.innerHTML = '';
        if (!n) { log.append(h('div.play-end', null, '— fin (aucune destination) —')); return; }
        log.append(h('div.play-line', null, n.speaker ? h('b', null, n.speaker) : null, h('span', null, interp(n.text, vars) || '…')));
        log.scrollTop = log.scrollHeight;
        const avail = n.choices.map(c => { let ok = true; try { ok = !!evalExpr(c.cond, vars); } catch (e) { ok = false; } return { c, ok }; });
        if (!avail.length) { log.append(h('div.play-end', null, n.end ? '— fin de la conversation —' : '— impasse : aucun choix —')); choicesEl.append(h('button.btn.primary', { onclick: () => restart() }, '↺ Recommencer')); return; }
        avail.forEach(({ c, ok }, i) => {
          if (!ok && !showLocked.checked) return;
          choicesEl.append(h('button.play-choice' + (ok ? '' : '.locked'), { disabled: !ok, title: c.cond ? 'Condition : ' + c.cond : '', onclick: () => {
            if (c.text) log.append(h('div.play-line.me', null, h('span', null, '▸ ' + interp(c.text, vars))));
            try { runEffect(c.effect, vars); } catch (e) { NS.toast(e.message); }
            showVars(); go(c.target);
          } }, h('span.g-cnum', null, i + 1), interp(c.text, vars) || 'Continuer ▸', c.cond ? h('small', null, ok ? '' : ' 🔒 ' + c.cond) : null));
        });
      };
      const showLocked = h('input', { type: 'checkbox', checked: true, onchange: () => restart() });
      const restart = () => { Object.keys(vars).forEach(k => delete vars[k]); this.g.vars.forEach(v => { vars[v.name] = v.value; }); log.innerHTML = ''; showVars(); go(fromId || this.g.start); };
      const onKey = (e) => { if (/^[1-9]$/.test(e.key)) { const b = choicesEl.querySelectorAll('.play-choice:not(:disabled)')[+e.key - 1]; if (b) b.click(); } };
      document.addEventListener('keydown', onKey);
      NS.modal({ title: '▶ Test : ' + this.doc.title, wide: true, cls: 'play', body: [h('div.play-top', null, varsEl, h('label.muted', null, showLocked, ' montrer les choix verrouillés')), log, choicesEl],
        actions: [{ label: '↺ Recommencer', run: () => { restart(); return false; } }, { label: 'Fermer', primary: true }], onclose: () => document.removeEventListener('keydown', onKey) });
      restart();
    },

    /** éléments du navigateur (liste des nœuds) */
    outline() {
      if (!this.g) return [];
      return this.g.nodes.map((n, i) => ({ id: n.id, num: i + 1, label: (n.title || n.text.slice(0, 40) || 'Sans titre'), sub: n.speaker, start: n.id === this.g.start, end: n.end }));
    },
  };

  NS.graph = Graph;
})();

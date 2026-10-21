/* Widgets (colonne de droite) : minuteur de concentration, objectifs, musique, ambiance,
   statistiques du document, bloc-notes, horloge, inspiration. Inspirés de solitaire n' chill. */
(function () {
  'use strict';
  const NS = window.SE;
  const { h, clamp, pad2 } = NS;

  const cfgOf = (id) => NS.settings.data.widgets.cfg[id] || (NS.settings.data.widgets.cfg[id] = {});
  const setCfg = (id, partial) => NS.settings.set('widgets.cfg.' + id, Object.assign({}, cfgOf(id), partial));
  const chip = (label, active, onclick, title) => h('button.chip' + (active ? '.on' : ''), { onclick, title, 'aria-pressed': String(!!active) }, label);

  /* ================================================================ minuteur (pomodoro) */
  function mountFocus(body) {
    const MODES = { focus: 'Concentration', short: 'Pause', long: 'Longue pause' };
    const c0 = cfgOf('focus');
    let mode = 'focus', remaining = (c0.focus || 25) * 60, endAt = 0, timer = 0, done = 0, wordsAtStart = null;
    const R = 34, C = 2 * Math.PI * R, SVGNS = 'http://www.w3.org/2000/svg';
    const circle = (cls) => { const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', 40); c.setAttribute('cy', 40); c.setAttribute('r', R); c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', 6); c.setAttribute('class', cls); return c; };
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 80 80'); svg.setAttribute('class', 'ring');
    const ringEl = circle('ring-fg');
    ringEl.setAttribute('stroke-linecap', 'round'); ringEl.setAttribute('stroke-dasharray', C); ringEl.setAttribute('transform', 'rotate(-90 40 40)');
    svg.append(circle('ring-bg'), ringEl);
    const readout = h('div.fc-read');
    const sprint = h('div.fc-sprint');
    const modes = h('div.fc-modes');
    const startBtn = h('button.btn.primary', { onclick: () => toggle() });
    const resetBtn = h('button.btn', { onclick: () => reset() }, 'Réinitialiser');
    const count = h('div.w-note');
    const zenBox = h('label.w-check', null, h('input', { type: 'checkbox', checked: !!c0.zen, onchange: (e) => setCfg('focus', { zen: e.target.checked }) }), ' Mode zen pendant la concentration');
    body.append(h('div.fc-dial', null, svg, h('div.fc-center', null, readout, sprint)), modes, h('div.fc-btns', null, startBtn, resetBtn), count, zenBox);
    const total = () => (cfgOf('focus')[mode] || 1) * 60;
    function draw() {
      readout.textContent = `${pad2(Math.floor(remaining / 60))}:${pad2(remaining % 60)}`;
      ringEl.setAttribute('stroke-dashoffset', String(C * (1 - remaining / total())));
      startBtn.textContent = timer ? 'Pause' : (remaining < total() ? 'Reprendre' : 'Démarrer');
      count.textContent = done ? `${done} session${done > 1 ? 's' : ''} de concentration terminée${done > 1 ? 's' : ''} 🍅` : 'Écrivez 25 minutes, soufflez 5.';
      sprint.textContent = wordsAtStart != null && mode === 'focus' ? `+${Math.max(0, NS.stats.session - wordsAtStart)} mots` : MODES[mode].toLowerCase();
      modes.innerHTML = '';
      Object.keys(MODES).forEach(k => modes.append(chip(MODES[k], k === mode, () => setMode(k))));
      document.title = timer ? `${readout.textContent} · ${NS.app && NS.app.project ? NS.app.project.title : 'Station d’écriture'}` : (NS.app ? NS.app.docTitle() : document.title);
    }
    function setMode(k) { stop(); mode = k; remaining = total(); draw(); }
    function stop() { clearInterval(timer); timer = 0; if (NS.app) NS.app.setZen(false, true); }
    function toggle() {
      if (timer) { stop(); draw(); return; }
      endAt = Date.now() + remaining * 1000;
      timer = setInterval(tick, 250);
      if (mode === 'focus' && wordsAtStart == null) wordsAtStart = NS.stats.session;
      NS.audio.ac();
      if (mode === 'focus' && cfgOf('focus').zen && NS.app) NS.app.setZen(true, true);
      draw();
    }
    function tick() {
      remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (remaining <= 0) {
        stop();
        NS.audio.doneChime();
        if (mode === 'focus') {
          done++;
          const w = Math.max(0, NS.stats.session - (wordsAtStart || 0));
          NS.toast(`Session terminée : ${w} mots écrits. Place à une pause ☕`, 6000);
          wordsAtStart = null;
          mode = done % 4 === 0 ? 'long' : 'short';
        } else { NS.toast('La pause est finie – on s’y remet ✍️', 5000); mode = 'focus'; }
        remaining = total();
      }
      draw();
    }
    function reset() { stop(); remaining = total(); wordsAtStart = null; draw(); }
    NS.bus.on('settings', (p) => { if (p === '*' || p.startsWith('widgets.cfg.focus')) { if (!timer) remaining = total(); draw(); } });
    NS.bus.on('words', () => { if (timer) draw(); });
    draw();
    const dur = h('div.fc-dur');
    ['focus', 'short', 'long'].forEach(k => dur.append(h('label', null, MODES[k], h('input.num', { type: 'number', min: 1, max: 180, value: cfgOf('focus')[k], 'aria-label': `Minutes : ${MODES[k]}`,
      onchange: (e) => setCfg('focus', { [k]: clamp(parseInt(e.target.value, 10) || 1, 1, 180) }) }))));
    body.append(h('details.fc-set', null, h('summary', null, 'Durées (minutes)'), dur));
    return { toggle };
  }

  /* ================================================================ objectifs */
  function mountGoals(body) {
    const view = h('div');
    body.append(view);
    let celebrated = NS.store.get('goalDone', '');
    function draw() {
      const g = NS.settings.data.goals;
      const today = NS.stats.todayWords, goal = g.daily || 0;
      const pct = goal ? Math.min(100, today / goal * 100) : 0;
      const days = NS.stats.days();
      const last = [];
      for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; last.push({ k, n: days[k] || 0, l: d.toLocaleDateString('fr-CA', { weekday: 'narrow' }) }); }
      const max = Math.max(goal, ...last.map(x => x.n), 1);
      const p = NS.app && NS.app.project;
      const pg = p && +p.meta.goal ? NS.projects.totalWords(p) / p.meta.goal : null;
      view.innerHTML = '';
      view.append(...[
        h('div.goal-big', null, h('b', null, NS.fmtNum(today)), h('span', null, goal ? ` / ${NS.fmtNum(goal)} mots aujourd’hui` : ' mots aujourd’hui')),
        goal ? h('div.st-bar', null, h('div.st-fill', { style: { width: pct + '%' } })) : null,
        h('div.goal-meta', null,
          h('span', { title: 'Depuis l’ouverture de la page' }, `Session : ${NS.fmtNum(NS.stats.session)}`),
          h('span', { title: 'Jours consécutifs à l’objectif' }, `🔥 ${NS.stats.streak()} j`)),
        h('div.week', { 'aria-label': 'Mots écrits ces 7 derniers jours' }, last.map(x => h('div.wk-col', { title: `${x.k} : ${x.n} mots` }, h('div.wk-bar' + (goal && x.n >= goal ? '.ok' : ''), { style: { height: Math.max(2, x.n / max * 100) + '%' } }), h('span', null, x.l)))),
        pg != null ? h('div.w-note', null, `Projet : ${Math.round(pg * 100)} % de ${NS.fmtNum(p.meta.goal)} mots`) : null,
        h('details.fc-set', null, h('summary', null, 'Objectif quotidien'),
          h('label.fc-dur', null, 'Mots par jour', h('input.num', { type: 'number', min: 0, step: 50, value: goal, onchange: (e) => NS.settings.set('goals.daily', Math.max(0, parseInt(e.target.value, 10) || 0)) })))].filter(Boolean));
      if (goal && today >= goal && celebrated !== NS.today()) {
        celebrated = NS.today(); NS.store.set('goalDone', celebrated);
        NS.audio.goalChime(); NS.toast(`🎉 Objectif du jour atteint : ${NS.fmtNum(today)} mots !`, 5000);
      }
    }
    const soon = NS.debounce(draw, 800);
    NS.bus.on('words', soon);
    NS.bus.on('settings', (p) => { if (p === '*' || p.startsWith('goals')) draw(); });
    NS.bus.on('project', draw);
    setInterval(draw, 60000);
    draw();
  }

  /* ================================================================ musique */
  function mountMusic(body) { NS.music.init(body, NS.$('#music-slot')); }

  /* ================================================================ ambiance */
  function mountAmbience(body) {
    const rows = [['rain', '🌧️', 'Pluie'], ['wind', '💨', 'Vent'], ['fire', '🔥', 'Feu de bois'], ['cafe', '☕', 'Café']];
    const sl = {};
    rows.forEach(([key, emoji, label]) => {
      const input = h('input.range', { type: 'range', min: 0, max: 100, value: Math.round((NS.settings.data.sound.ambience[key] || 0) * 100), 'aria-label': 'Volume : ' + label,
        oninput: (e) => NS.audio.setAmbience(key, e.target.value / 100) });
      sl[key] = input;
      body.append(h('label.amb-row', null, h('span.amb-ico', null, emoji), h('span.amb-label', null, label), input));
    });
    body.append(h('div.w-note', null, 'Sons générés dans le navigateur, aucun téléchargement. Se combinent avec la musique.'));
    NS.bus.on('settings', (p) => { if (p === '*') rows.forEach(([k]) => { sl[k].value = Math.round((NS.settings.data.sound.ambience[k] || 0) * 100); }); });
  }

  /* ================================================================ statistiques du document */
  function mountDocStats(body) {
    const view = h('div');
    body.append(view);
    let last = null;
    const cell = (k, v) => h('div.st-cell', null, h('div.st-v', null, v), h('div.st-k', null, k));
    function draw(s) {
      if (s) last = s;
      s = last;
      view.innerHTML = '';
      const ed = NS.editor;
      if (!s || !ed.doc || ed.doc.kind !== 'text' || !NS.app.project) {
        const g = NS.graph.g;
        if (ed.doc && ed.doc.kind === 'graph' && g) {
          const words = NS.projects.docWords(ed.doc), ch = g.nodes.reduce((n, x) => n + x.choices.length, 0);
          view.append(h('div.st-grid', null, cell('nœuds', g.nodes.length), cell('choix', ch), cell('mots', NS.fmtNum(words))));
          const by = {};
          g.nodes.forEach(n => { const k = n.speaker || 'Narration'; by[k] = (by[k] || 0) + 1; });
          view.append(h('div.cast', null, Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => h('div.cast-row', null, h('span', null, k), h('span.muted', null, v + ' nœud' + (v > 1 ? 's' : ''))))));
        } else view.append(h('div.w-note', null, 'Ouvrez un document.'));
        return;
      }
      const text = ed.ed.innerText;
      const chars = text.replace(/\n/g, '').length;
      view.append(h('div.st-grid', null, cell('mots', NS.fmtNum(s.words)), cell('signes', NS.fmtNum(chars)), cell(ed.mode.id === 'theatre' ? 'durée' : 'pages', ed.mode.id === 'theatre' ? Math.round(s.est.minutes) + ' min' : s.est.pages != null ? (s.est.pages < 10 ? s.est.pages.toFixed(1).replace('.', ',') : Math.round(s.est.pages)) : '–')));
      view.append(h('div.w-note', null, s.est.label + (s.sel ? ` · sélection : ${NS.fmtNum(s.sel)} mots` : '')));
      if (ed.mode.id === 'scenario' || ed.mode.id === 'theatre') {
        const cast = ed.castStats(ed.blocks());
        const scenes = ed.mode.outline(ed.blocks()).filter(x => x.level === (ed.mode.id === 'scenario' ? 1 : 2)).length;
        view.append(h('div.w-note', null, `${scenes} scène${scenes > 1 ? 's' : ''} · ${cast.length} personnage${cast.length > 1 ? 's' : ''} qui parle${cast.length > 1 ? 'nt' : ''}`));
        if (cast.length) {
          const max = Math.max(...cast.map(c => c[1].words), 1);
          view.append(h('div.cast', null, cast.slice(0, 12).map(([name, v]) => h('div.cast-row', { title: `${v.lines} répliques, ${v.words} mots` },
            h('span', null, name), h('span.cast-bar', null, h('i', { style: { width: (v.words / max * 100) + '%' } })), h('span.muted', null, v.lines)))));
        }
      } else {
        const paras = ed.blocks().filter(b => b.textContent.trim()).length;
        const sentences = (text.match(/[.!?…]+(\s|$)/g) || []).length || 1;
        view.append(h('div.w-note', null, `${paras} paragraphe${paras > 1 ? 's' : ''} · ${(s.words / sentences).toFixed(1).replace('.', ',')} mots/phrase en moyenne`));
      }
    }
    NS.bus.on('status', draw);
    NS.bus.on('open', () => draw());
    NS.bus.on('outline', () => draw());
    draw();
  }

  /* ================================================================ bloc-notes */
  function mountNote(body) {
    const ta = h('textarea.note', { placeholder: 'Idées en vrac, à-côtés, choses à vérifier… (commun à tous les projets)', 'aria-label': 'Bloc-notes', rows: 6, spellcheck: true });
    ta.value = NS.store.get('note', '');
    ta.addEventListener('input', NS.debounce(() => NS.store.set('note', ta.value), 300));
    body.append(ta);
  }

  /* ================================================================ horloge */
  function mountClock(body) {
    const time = h('div.clk-time'), date = h('div.clk-date'), greet = h('div.clk-greet');
    body.append(greet, time, date);
    const update = () => {
      const d = new Date(), hr = d.getHours();
      time.textContent = `${pad2(hr)} h ${pad2(d.getMinutes())}`;
      date.textContent = d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
      greet.textContent = hr < 5 ? 'Écriture nocturne 🌙' : hr < 12 ? 'Bonjour ☀️' : hr < 18 ? 'Bon après-midi' : hr < 22 ? 'Bonsoir' : 'Belle soirée d’écriture';
    };
    update(); setInterval(update, 10000);
  }

  /* ================================================================ inspiration */
  const PROMPTS = [
    'Votre personnage trouve une lettre qui ne lui est pas adressée.', 'Écrivez la scène du point de vue de l’objet le plus proche.',
    'Quelqu’un ment, et tout le monde le sait sauf lui.', 'La scène se passe pendant une panne de courant.',
    'Un dialogue où personne ne dit ce qu’il pense vraiment.', 'Commencez par la fin de la scène, puis remontez.',
    'Ajoutez une odeur, un son et une texture à votre décor.', 'Votre antagoniste a raison sur un point. Lequel ?',
    'Faites attendre votre personnage. Que fait-il de ses mains ?', 'Une promesse est rompue, sans un mot.',
    'Réécrivez la dernière phrase en deux fois moins de mots.', 'Un secret se révèle à cause d’un détail insignifiant.',
    'Coupez la première réplique de chaque échange. Que reste-t-il ?', 'Le temps change brutalement au milieu de la scène.',
    'Votre personnage doit choisir entre deux choses qu’il aime.', 'Une conversation au téléphone, on n’entend qu’un côté.',
    'Écrivez sans adjectif pendant dix minutes.', 'Un inconnu connaît le prénom de votre personnage.',
    'Le lieu de la scène a une histoire. Laquelle transparaît ?', 'Faites rire, puis serrez la gorge, dans la même page.',
  ];
  const FIRST = ['Agathe', 'Basile', 'Céleste', 'Dorian', 'Élise', 'Félix', 'Gaëlle', 'Hugo', 'Inès', 'Jules', 'Képhren', 'Léonie', 'Malo', 'Noémie', 'Octave', 'Philomène', 'Quentin', 'Rosalie', 'Simone', 'Théo', 'Ulysse', 'Violette', 'Yann', 'Zélie', 'Anouk', 'Gaspard', 'Maëlle', 'Rémi', 'Solène', 'Victor', 'Lou', 'Arsène', 'Margaux', 'Édouard', 'Clémence', 'Mathis'];
  const LAST = ['Lambert', 'Dufresne', 'Tremblay', 'Gagnon', 'Moreau', 'Leclerc', 'Beaulieu', 'Fontaine', 'Marchand', 'Roy', 'Delorme', 'Vasseur', 'Bélanger', 'Caron', 'Langlois', 'Pelletier', 'Rousseau', 'Morin', 'Lévesque', 'Garnier', 'Aubry', 'Desjardins', 'Ménard', 'Ouellet', 'Bouchard', 'Vidal'];
  function mountInspire(body) {
    const q = h('blockquote.q');
    const names = h('div.names');
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    let i = Math.floor(Date.now() / 86400000) % PROMPTS.length;
    const draw = () => { q.textContent = PROMPTS[i]; };
    const gen = () => { names.innerHTML = ''; for (let k = 0; k < 4; k++) { const n = pick(FIRST) + ' ' + pick(LAST); names.append(h('button.chip', { title: 'Copier', onclick: () => { try { navigator.clipboard.writeText(n); NS.toast('« ' + n + ' » copié'); } catch (e) { /* ignore */ } } }, n)); } };
    draw(); gen();
    body.append(q, h('div.fc-btns', null, h('button.btn.sm', { onclick: () => { i = (i + 1) % PROMPTS.length; draw(); } }, '↻ Autre relance'), h('button.btn.sm', { onclick: gen }, '🎲 Noms')), names);
  }

  /* ================================================================ registre et colonne */
  const REGISTRY = {
    focus: { icon: '🍅', title: 'Minuteur', mount: mountFocus },
    goals: { icon: '🎯', title: 'Objectifs', mount: mountGoals },
    music: { icon: '🎵', title: 'Musique', mount: mountMusic },
    ambience: { icon: '🎧', title: 'Ambiance', mount: mountAmbience },
    docstats: { icon: '📊', title: 'Statistiques', mount: mountDocStats },
    note: { icon: '📝', title: 'Bloc-notes', mount: mountNote },
    clock: { icon: '🕰️', title: 'Horloge', mount: mountClock },
    inspire: { icon: '💡', title: 'Inspiration', mount: mountInspire },
  };

  const Widgets = {
    nodes: {}, api: {},
    REGISTRY,
    init(root) {
      this.root = root;
      this.list = h('div.w-list');
      this.addBtn = h('button.btn.sm.w-addbtn', { onclick: (e) => this.addMenu(e) }, '＋ Widgets');
      root.append(this.list, this.addBtn);
      Object.keys(REGISTRY).forEach(id => {
        const def = REGISTRY[id];
        const body = h('div.w-body');
        const node = h('section.widget', { dataset: { w: id } },
          h('header.w-head', { onclick: (e) => { if (!e.target.closest('button')) this.toggleCollapse(id); } },
            h('span.w-icon', null, def.icon), h('span.w-title', null, def.title),
            h('span.w-tools', null,
              h('button.ico.small', { title: 'Options', 'aria-label': 'Options du widget ' + def.title, onclick: (e) => this.itemMenu(id, e) }, '⋯'),
              h('button.ico.small.w-fold', { title: 'Replier / déplier', 'aria-label': 'Replier ' + def.title, onclick: () => this.toggleCollapse(id) }, '▾'))),
          body);
        this.nodes[id] = node;
        try { this.api[id] = def.mount(body) || {}; } catch (e) { console.error(e); }
      });
      NS.bus.on('settings', (p) => { if (p === '*' || p.startsWith('widgets.order') || p.startsWith('widgets.hidden') || p.startsWith('widgets.collapsed')) this.place(); });
      this.place();
    },
    place() {
      const w = NS.settings.data.widgets;
      while (this.list.firstChild) this.list.removeChild(this.list.firstChild);
      w.order.filter(id => !w.hidden.includes(id)).forEach(id => {
        const n = this.nodes[id];
        n.classList.toggle('collapsed', w.collapsed.includes(id));
        this.list.appendChild(n);
      });
      this.addBtn.hidden = !w.hidden.length;
    },
    set(key, arr) { NS.settings.set('widgets.' + key, arr); },
    toggleCollapse(id) { const c = NS.settings.data.widgets.collapsed; this.set('collapsed', c.includes(id) ? c.filter(x => x !== id) : [...c, id]); },
    hide(id) { this.set('hidden', [...NS.settings.data.widgets.hidden, id]); },
    show(id) { this.set('hidden', NS.settings.data.widgets.hidden.filter(x => x !== id)); },
    shift(id, dir) {
      const visible = NS.settings.data.widgets.order.filter(x => !NS.settings.data.widgets.hidden.includes(x));
      const i = visible.indexOf(id), j = i + dir;
      if (j < 0 || j >= visible.length) return;
      const order = NS.settings.data.widgets.order.slice();
      const a = order.indexOf(visible[i]), b = order.indexOf(visible[j]);
      [order[a], order[b]] = [order[b], order[a]];
      this.set('order', order);
    },
    reveal(id) {
      const w = NS.settings.data.widgets;
      if (w.hidden.includes(id)) this.show(id);
      if (w.collapsed.includes(id)) this.toggleCollapse(id);
      if (NS.app) NS.app.setPanel('widgets', true);
      setTimeout(() => { this.nodes[id].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); this.nodes[id].classList.add('flash'); setTimeout(() => this.nodes[id].classList.remove('flash'), 1000); }, 60);
    },
    itemMenu(id, e) {
      const r = e.currentTarget.getBoundingClientRect();
      NS.menu(r.left - 140, r.bottom + 4, [
        { label: 'Monter', icon: '▲', run: () => this.shift(id, -1) },
        { label: 'Descendre', icon: '▼', run: () => this.shift(id, 1) },
        { label: 'Masquer', icon: '✕', run: () => this.hide(id) },
      ]);
    },
    addMenu(e) {
      const r = e.currentTarget.getBoundingClientRect();
      NS.menu(r.left, r.top - 8 - 36 * NS.settings.data.widgets.hidden.length, NS.settings.data.widgets.hidden.map(id => ({ label: REGISTRY[id].title, icon: REGISTRY[id].icon, run: () => this.reveal(id) })));
    },
  };
  NS.widgets = Widgets;
})();

/* Préférences : un seul objet JSON fusionné avec les valeurs par défaut, sauvegardé, avec événements. */
(function () {
  'use strict';
  const NS = window.SE;

  const DEFAULTS = {
    theme: 'nuit',            // nuit | papier | sepia | foret | encre
    bg: 'aube',               // fond derrière la page (thèmes sombres)
    bgUrl: '',
    accent: '',               // vide = couleur du thème
    editor: {
      font: 'literata',       // police du roman / des notes
      size: 19,               // px
      lineHeight: 1.7,
      width: 720,             // largeur de la page en px
      indent: true,           // retrait de première ligne (roman)
      justify: false,
      paper: true,            // page « papier » derrière le texte
      spellcheck: true,
      frTypo: 'qc',           // 'qc' | 'fr' | 'off' : guillemets, apostrophes, tirets, points de suspension, espaces insécables
      typewriter: false,      // garder la ligne active au centre
      focusMode: false,       // estomper les paragraphes inactifs
      sceneNumbers: true,     // numérotation des scènes (scénario)
      keySounds: false,       // bruit de machine à écrire
    },
    goals: { daily: 500, session: 0 },
    sound: { volume: 0.7, ambience: { rain: 0, wind: 0, fire: 0, cafe: 0 } },
    panels: { nav: true, widgets: true, navTab: 'plan' },
    widgets: {
      order: ['focus', 'goals', 'music', 'ambience', 'docstats', 'note', 'clock', 'inspire'],
      hidden: ['clock', 'inspire'],
      collapsed: [],
      cfg: { focus: { focus: 25, short: 5, long: 15 } },
    },
  };

  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function merge(base, over) {
    if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
    const out = { ...base };
    for (const k of Object.keys(over)) out[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
    return out;
  }
  const copy = (o) => JSON.parse(JSON.stringify(o));
  let data = merge(copy(DEFAULTS), NS.store.get('settings', {}));

  function normaliseWidgets() {
    const all = DEFAULTS.widgets.order;
    const w = data.widgets, seen = new Set();
    w.order = (w.order || []).filter(id => all.includes(id) && !seen.has(id) && seen.add(id));
    all.forEach(id => { if (!seen.has(id)) { w.order.push(id); w.hidden.push(id); } });
    w.hidden = (w.hidden || []).filter(id => all.includes(id));
  }
  normaliseWidgets();

  const save = NS.debounce(() => NS.store.set('settings', data), 150);
  NS.settings = {
    DEFAULTS,
    get data() { return data; },
    get(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), data); },
    set(path, value) {
      const keys = path.split('.');
      let o = data;
      for (let i = 0; i < keys.length - 1; i++) { if (!isObj(o[keys[i]])) o[keys[i]] = {}; o = o[keys[i]]; }
      o[keys[keys.length - 1]] = value;
      save();
      NS.bus.emit('settings', path);
    },
    reset() { data = copy(DEFAULTS); NS.store.set('settings', data); NS.bus.emit('settings', '*'); },
    flush() { NS.store.set('settings', data); },
  };
  window.addEventListener('pagehide', () => NS.settings.flush());

  /* ---------- statistiques d'écriture (mots par jour) ---------- */
  const stats = NS.store.get('stats', { days: {} });
  let sessionWords = 0;
  const saveStats = NS.debounce(() => NS.store.set('stats', stats), 500);
  NS.stats = {
    get session() { return sessionWords; },
    get todayWords() { return stats.days[NS.today()] || 0; },
    days() { return stats.days; },
    add(delta) {
      if (!delta) return;
      sessionWords = Math.max(0, sessionWords + delta);
      const k = NS.today();
      stats.days[k] = Math.max(0, (stats.days[k] || 0) + delta);
      saveStats();
      NS.bus.emit('words');
    },
    /** jours consécutifs (jusqu'à aujourd'hui ou hier) ayant atteint l'objectif */
    streak() {
      const goal = Math.max(1, data.goals.daily || 1);
      let n = 0;
      const d = new Date();
      const key = (x) => `${x.getFullYear()}-${NS.pad2(x.getMonth() + 1)}-${NS.pad2(x.getDate())}`;
      if ((stats.days[key(d)] || 0) < goal) d.setDate(d.getDate() - 1);
      while ((stats.days[key(d)] || 0) >= goal) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },
  };
})();

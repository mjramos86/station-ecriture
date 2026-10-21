/* Les quatre modes d'écriture : éléments de mise en forme, enchaînements clavier, plan, modèles. */
(function () {
  'use strict';
  const NS = window.SE;

  const p = (cls, text) => `<p class="${cls}">${text}</p>`;

  const MODES = {
    roman: {
      id: 'roman', name: 'Roman', icon: '📖',
      blurb: 'Parties, chapitres et scènes dans un classeur. Mise en forme complète, typographie française, fiches de personnages et de lieux.',
      docKind: 'text', folderLabel: 'Chapitre', docLabel: 'Scène',
      elements: [
        { id: 'p', label: 'Paragraphe', tag: 'P', cls: '' },
        { id: 'h1', label: 'Titre de chapitre', tag: 'H1', cls: '' },
        { id: 'h2', label: 'Sous-titre', tag: 'H2', cls: '' },
        { id: 'h3', label: 'Intertitre', tag: 'H3', cls: '' },
        { id: 'quote', label: 'Citation', tag: 'BLOCKQUOTE', cls: '' },
        { id: 'letter', label: 'Lettre / document', tag: 'P', cls: 'n-letter' },
        { id: 'center', label: 'Centré', tag: 'P', cls: 'n-center' },
        { id: 'noindent', label: 'Sans retrait', tag: 'P', cls: 'n-noindent' },
      ],
      enter: { h1: 'p', h2: 'p', h3: 'p', quote: 'p', center: 'p' },
      richToolbar: true,
      outline(blocks) {
        const out = [];
        blocks.forEach(b => {
          if (b.tagName === 'H1') out.push({ level: 1, label: b.textContent, el: b });
          else if (b.tagName === 'H2') out.push({ level: 2, label: b.textContent, el: b });
          else if (b.tagName === 'H3') out.push({ level: 3, label: b.textContent, el: b });
          else if (b.tagName === 'HR') out.push({ level: 3, label: '⁂ Rupture de scène', el: b, muted: true });
        });
        return out;
      },
      template() {
        return {
          tree: [
            { type: 'folder', title: 'Chapitre 1', children: [
              { type: 'doc', title: 'Scène 1', content: '<p><br></p>', synopsis: '' },
            ] },
          ],
          bible: [{ kind: 'personnage', name: 'Protagoniste', role: 'Personnage principal', text: '' }],
        };
      },
    },

    scenario: {
      id: 'scenario', name: 'Scénario', icon: '🎬',
      blurb: 'Cinéma ou télé : en-têtes de scène, action, personnage, dialogue, transition. Entrée et Tab enchaînent les éléments comme dans les logiciels pros. Export Fountain.',
      docKind: 'text', folderLabel: 'Acte', docLabel: 'Séquence / épisode',
      elements: [
        { id: 'scene', label: 'En-tête de scène', tag: 'P', cls: 'sc-scene', hint: 'INT. LIEU – JOUR' },
        { id: 'action', label: 'Action', tag: 'P', cls: 'sc-action' },
        { id: 'character', label: 'Personnage', tag: 'P', cls: 'sc-char' },
        { id: 'paren', label: 'Parenthèse', tag: 'P', cls: 'sc-paren' },
        { id: 'dialogue', label: 'Dialogue', tag: 'P', cls: 'sc-dial' },
        { id: 'transition', label: 'Transition', tag: 'P', cls: 'sc-trans', hint: 'CUT À :' },
        { id: 'shot', label: 'Plan', tag: 'P', cls: 'sc-shot' },
        { id: 'center', label: 'Centré', tag: 'P', cls: 'sc-center' },
        { id: 'note', label: 'Note (non exportée)', tag: 'P', cls: 'sc-note' },
      ],
      defaultEl: 'action',
      enter: { scene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'character', transition: 'scene', shot: 'action', center: 'action', note: 'action' },
      tab: { action: 'character', character: 'transition', transition: 'scene', scene: 'action', dialogue: 'paren', paren: 'dialogue', shot: 'action', center: 'action', note: 'action' },
      shiftTab: { character: 'action', transition: 'character', scene: 'transition', action: 'scene', paren: 'dialogue', dialogue: 'character', shot: 'scene', center: 'action', note: 'action' },
      emptyEnter: { character: 'action', dialogue: 'action', paren: 'action', transition: 'action', shot: 'action' },
      characterEl: 'character', sceneEl: 'scene',
      /** conversions automatiques selon ce qu'on tape */
      smart(el, text) {
        if ((el === 'action' || el === 'shot') && /^(INT|EXT|INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|EST)[.\s]/i.test(text)) return 'scene';
        return null;
      },
      smartOnEnter(el, text) {
        if (el === 'action' && /^[A-ZÀ-Ý0-9 .'’\-]+(À|TO|SUR|IN|OUT)\s?:$/.test(text.trim()) && text.trim().length < 30) return 'transition';
        if (el === 'action' && /^[A-ZÀ-ÝŒ][A-ZÀ-ÝŒ0-9 .'’\-]{1,30}(\s\((V\.?O|O\.?S|OFF|HC|V\.?O\.?|CONT'D|SUITE)\.?\))?$/.test(text.trim()) && text.trim() === text.trim().toUpperCase() && /[A-ZÀ-Ý]{2}/.test(text)) return 'character';
        return null;
      },
      outline(blocks) {
        const out = [];
        let n = 0;
        blocks.forEach(b => { if (b.classList.contains('sc-scene')) { n++; out.push({ level: 1, label: b.textContent || '(scène sans titre)', el: b, num: n }); } });
        return out;
      },
      characters(blocks) {
        return blocks.filter(b => b.classList.contains('sc-char')).map(b => cleanName(b.textContent)).filter(Boolean);
      },
      template() {
        return {
          tree: [{ type: 'doc', title: 'Scénario', content: [
            p('sc-center', 'FONDU D’OUVERTURE :'),
            p('sc-scene', 'INT. CAFÉ DU COIN – JOUR'),
            p('sc-action', 'Une pluie fine raye la vitrine. CLAIRE (30 ans, carnet à la main) attend, le regard fixé sur la porte.'),
            p('sc-char', 'Claire'),
            p('sc-paren', 'à elle-même'),
            p('sc-dial', 'Encore cinq minutes. Après, je pars.'),
            p('sc-trans', 'Cut à :'),
          ].join('') }],
          bible: [{ kind: 'personnage', name: 'Claire', role: 'Protagoniste', text: '30 ans, carnet toujours à la main.' }],
        };
      },
    },

    theatre: {
      id: 'theatre', name: 'Théâtre', icon: '🎭',
      blurb: 'Actes et scènes, liste des personnages, répliques et didascalies. Décompte des répliques par personnage et présence en scène.',
      docKind: 'text', folderLabel: 'Partie', docLabel: 'Acte',
      elements: [
        { id: 'acte', label: 'Acte', tag: 'P', cls: 'th-acte', hint: 'ACTE I' },
        { id: 'scene', label: 'Scène', tag: 'P', cls: 'th-scene', hint: 'Scène 1' },
        { id: 'cast', label: 'Personnages en scène', tag: 'P', cls: 'th-cast' },
        { id: 'dida', label: 'Didascalie', tag: 'P', cls: 'th-dida' },
        { id: 'character', label: 'Personnage', tag: 'P', cls: 'th-char' },
        { id: 'replique', label: 'Réplique', tag: 'P', cls: 'th-rep' },
        { id: 'chant', label: 'Chant / vers', tag: 'P', cls: 'th-vers' },
        { id: 'note', label: 'Note (non exportée)', tag: 'P', cls: 'th-note' },
      ],
      defaultEl: 'dida',
      enter: { acte: 'scene', scene: 'cast', cast: 'dida', dida: 'character', character: 'replique', replique: 'character', chant: 'chant', note: 'dida' },
      tab: { character: 'dida', dida: 'character', replique: 'dida', acte: 'scene', scene: 'cast', cast: 'dida', chant: 'replique', note: 'dida' },
      shiftTab: { dida: 'replique', character: 'replique', replique: 'character', scene: 'acte', cast: 'scene', acte: 'dida', chant: 'replique', note: 'dida' },
      emptyEnter: { character: 'dida', replique: 'dida', chant: 'replique' },
      characterEl: 'character', sceneEl: 'scene',
      smart(el, text) {
        if (el !== 'acte' && /^ACTE\s+([IVXLC]+|\d+|premier|[a-zé]+ième)\b/i.test(text)) return 'acte';
        if (el !== 'scene' && el !== 'replique' && /^SC[ÈE]NE\s+([IVXLC]+|\d+|premi[eè]re|[a-zé]+ième)\b/i.test(text)) return 'scene';
        return null;
      },
      outline(blocks) {
        const out = [];
        blocks.forEach(b => {
          if (b.classList.contains('th-acte')) out.push({ level: 1, label: b.textContent || '(acte)', el: b });
          else if (b.classList.contains('th-scene')) out.push({ level: 2, label: b.textContent || '(scène)', el: b });
        });
        return out;
      },
      characters(blocks) {
        return blocks.filter(b => b.classList.contains('th-char')).map(b => cleanName(b.textContent)).filter(Boolean);
      },
      template() {
        return {
          tree: [{ type: 'doc', title: 'Acte I', content: [
            p('th-acte', 'Acte I'),
            p('th-scene', 'Scène 1'),
            p('th-cast', 'Hélène, Bastien'),
            p('th-dida', 'Un salon encombré de cartons. La nuit tombe. Hélène entre, une lampe à la main.'),
            p('th-char', 'Hélène'),
            p('th-rep', 'Tu as tout gardé ? Même les lettres ?'),
            p('th-char', 'Bastien'),
            p('th-dida', 'sans se retourner'),
            p('th-rep', 'Surtout les lettres.'),
          ].join('') }],
          bible: [
            { kind: 'personnage', name: 'Hélène', role: 'Sœur aînée', text: '' },
            { kind: 'personnage', name: 'Bastien', role: 'Frère cadet', text: '' },
          ],
        };
      },
    },

    interactif: {
      id: 'interactif', name: 'Dialogues interactifs', icon: '🌳',
      blurb: 'Arbres de dialogue pour jeux et fictions interactives : nœuds, choix, conditions et variables, graphe visuel, mode test, export JSON / Ink / Yarn.',
      docKind: 'graph', folderLabel: 'Dossier', docLabel: 'Conversation',
      elements: [
        { id: 'p', label: 'Paragraphe', tag: 'P', cls: '' },
        { id: 'h1', label: 'Titre', tag: 'H1', cls: '' },
        { id: 'h2', label: 'Sous-titre', tag: 'H2', cls: '' },
      ],
      richToolbar: true,
      outline(blocks) { return MODES.roman.outline(blocks); },
      template() {
        return {
          tree: [{ type: 'doc', kind: 'graph', title: 'Rencontre à la taverne', graph: NS.graphSample ? NS.graphSample() : null }],
          bible: [
            { kind: 'personnage', name: 'Aubergiste', role: 'PNJ', text: 'Bourru mais honnête.' },
            { kind: 'personnage', name: 'Joueur', role: 'Personnage joueur', text: '' },
          ],
        };
      },
    },
  };

  /** « CLAIRE (V.O.) » → « CLAIRE » */
  function cleanName(s) {
    return String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/[:.]+$/, '').trim().toUpperCase();
  }

  NS.MODES = MODES;
  NS.modes = {
    get(id) { return MODES[id] || MODES.roman; },
    list() { return Object.values(MODES); },
    cleanName,
    /** élément (id) d'un bloc selon le mode */
    elementOf(mode, block) {
      if (!block) return null;
      const els = mode.elements;
      const byCls = els.find(e => e.cls && block.classList.contains(e.cls));
      if (byCls) return byCls.id;
      const byTag = els.find(e => !e.cls && e.tag === block.tagName);
      return byTag ? byTag.id : (mode.defaultEl || els[0].id);
    },
    def(mode, id) { return mode.elements.find(e => e.id === id) || mode.elements[0]; },
  };
})();

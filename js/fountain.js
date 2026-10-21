/* Fountain (format texte des scénarios) : lecture vers les blocs de l'éditeur et écriture depuis ceux-ci.
   Sert aussi au collage de texte brut en modes scénario et théâtre. https://fountain.io/syntax */
(function () {
  'use strict';
  const NS = window.SE;
  const esc = NS.esc;

  const SCENE_RE = /^(\.(?!\.)|(?:INT|EXT|EST|INT\.?\/EXT|EXT\.?\/INT|I\/E)[.\s])/i;
  const TRANS_RE = /^(?:[A-ZÀ-Ý0-9 .'’\-]+(?:TO|À|SUR):|FADE OUT\.|FONDU AU NOIR\.|FERMETURE EN FONDU\.)$/;

  /** **gras** *italique* _souligné_ → HTML */
  function inline(s) {
    return esc(s)
      .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/(^|[^\w])_(.+?)_(?=[^\w]|$)/g, '$1<u>$2</u>');
  }
  const isUpperName = (s) => {
    const t = s.replace(/\s*\(.*?\)\s*$/, '').replace(/\s*\^$/, '').trim();
    return t.length > 0 && t.length < 40 && /[A-ZÀ-Ý]/.test(t) && t === t.toUpperCase() && !/[.!?:]$/.test(t);
  };

  /** Texte Fountain → { html, meta } (mode scénario) ; texte de pièce → html (mode théâtre) */
  function parse(text, modeId) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
    const out = [], meta = {};
    const P = (cls, s) => out.push(`<p class="${cls}">${s ? inline(s) : '<br>'}</p>`);
    let i = 0;

    if (modeId === 'theatre') {
      let prev = '';
      for (; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l) { if (prev === 'replique') prev = ''; continue; }
        const next = (lines[i + 1] || '').trim();
        if (/^ACTE\b/i.test(l)) { P('th-acte', l); prev = 'acte'; }
        else if (/^SC[ÈE]NE\b/i.test(l)) { P('th-scene', l); prev = 'scene'; }
        else if (/^\(.*\)$/.test(l) || /^_.*_$/.test(l)) { P('th-dida', l.replace(/^[(_]|[)_]$/g, '')); prev = 'dida'; }
        else if (isUpperName(l.replace(/[.:,—–-]+$/, '')) && next) { P('th-char', l.replace(/[.:,—–-]+$/, '')); prev = 'character'; }
        else if (prev === 'character' || prev === 'replique' || prev === 'dida-in') { P('th-rep', l); prev = 'replique'; }
        else if (prev === 'scene') { P('th-cast', l); prev = 'cast'; }
        else { P('th-dida', l); prev = 'dida'; }
      }
      return { html: out.join('') || '<p class="th-dida"><br></p>', meta };
    }

    // page de titre : « Clé: valeur » en tête de fichier
    if (/^[A-Za-zÀ-ÿ ]+:\s*/.test(lines[0] || '') && !SCENE_RE.test(lines[0])) {
      let key = null;
      for (; i < lines.length && lines[i].trim() !== ''; i++) {
        const m = /^([A-Za-zÀ-ÿ ]+):\s*(.*)$/.exec(lines[i]);
        if (m) { key = m[1].trim().toLowerCase(); meta[key] = m[2].trim(); }
        else if (key) meta[key] = (meta[key] ? meta[key] + '\n' : '') + lines[i].trim();
      }
    }
    let inDialogue = false;
    for (; i < lines.length; i++) {
      const raw = lines[i];
      const l = raw.trim();
      const prevBlank = i === 0 || lines[i - 1].trim() === '';
      const nextLine = lines[i + 1] != null ? lines[i + 1].trim() : '';
      if (!l) { inDialogue = false; continue; }
      if (/^={3,}$/.test(l)) continue; // saut de page
      if (/^\[\[.*\]\]$/.test(l)) { P('sc-note', l.slice(2, -2)); continue; }
      if (/^#/.test(l)) { P('sc-note', l.replace(/^#+\s*/, '§ ')); continue; }
      if (/^=(?!=)/.test(l)) { P('sc-note', l.replace(/^=\s*/, '')); continue; }
      if (inDialogue) {
        if (/^\(.*\)$/.test(l)) P('sc-paren', l.slice(1, -1));
        else P('sc-dial', l);
        continue;
      }
      if (/^>.*<$/.test(l)) { P('sc-center', l.slice(1, -1).trim()); continue; }
      if (/^>/.test(l)) { P('sc-trans', l.slice(1).trim()); continue; }
      if (prevBlank && SCENE_RE.test(l)) { P('sc-scene', l.replace(/^\./, '').replace(/\s*#.*#$/, '')); continue; }
      if (prevBlank && TRANS_RE.test(l) && !nextLine) { P('sc-trans', l); continue; }
      if (/^@/.test(l) || (prevBlank && nextLine && isUpperName(l))) { P('sc-char', l.replace(/^@/, '').replace(/\s*\^$/, '')); inDialogue = true; continue; }
      if (/^!/.test(l)) { P('sc-action', l.slice(1)); continue; }
      P('sc-action', l);
    }
    return { html: out.join('') || '<p class="sc-scene"><br></p>', meta };
  }

  /* ---------- export ---------- */
  function inlineOut(node) {
    let s = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { s += n.textContent; return; }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'BR') { s += '\n'; return; }
      const inner = inlineOut(n);
      if (/^(B|STRONG)$/.test(n.tagName)) s += `**${inner}**`;
      else if (/^(I|EM)$/.test(n.tagName)) s += `*${inner}*`;
      else if (n.tagName === 'U') s += `_${inner}_`;
      else s += inner;
    });
    return s.replace(/\u00A0|\u202F/g, ' ');
  }

  /** blocs HTML d'un scénario → Fountain */
  function fromBlocks(blocks) {
    const out = [];
    const push = (s, blankBefore) => { if (blankBefore && out.length && out[out.length - 1] !== '') out.push(''); out.push(s); };
    blocks.forEach(b => {
      const t = inlineOut(b).trim();
      const c = b.className || '';
      if (/sc-scene/.test(c)) { const up = t.toUpperCase(); push(SCENE_RE.test(up) ? up : '.' + up, true); out.push(''); }
      else if (/sc-char/.test(c)) push(isUpperName(t.toUpperCase()) ? t.toUpperCase() : '@' + t.toUpperCase(), true);
      else if (/sc-paren/.test(c)) push('(' + t.replace(/^\(|\)$/g, '') + ')');
      else if (/sc-dial/.test(c)) push(t);
      else if (/sc-trans/.test(c)) { const up = t.toUpperCase(); push(/TO:$/.test(up) ? up : '> ' + up, true); out.push(''); }
      else if (/sc-center/.test(c)) push('> ' + t + ' <', true);
      else if (/sc-note/.test(c)) push('[[' + t + ']]', true);
      else if (/sc-shot/.test(c)) push(t.toUpperCase(), true);
      else if (t) { push(/^[A-ZÀ-Ý\s]+$/.test(t) || SCENE_RE.test(t) ? '!' + t : t, true); }
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  NS.fountain = {
    parse,
    toHTML(text, modeId) { return parse(text, modeId).html; },
    fromBlocks,
    inlineOut,
  };
})();

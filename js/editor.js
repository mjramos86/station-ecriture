/*
 * Éditeur de texte riche (contenteditable) commun aux modes roman, scénario et théâtre.
 *   - barre d'outils adaptée au mode (mise en forme complète ou éléments de script)
 *   - Entrée / Tab enchaînent les éléments (scénario, théâtre), Ctrl+1…9 choisit l'élément
 *   - autocomplétion des personnages, en-têtes de scène et transitions
 *   - typographie française automatique, collage nettoyé, annotations
 *   - mode machine à écrire, mode concentration
 */
(function () {
  'use strict';
  const NS = window.SE;
  const { h, $, $$ } = NS;
  const S = () => NS.settings.data.editor;

  const ALLOWED_TOP = ['P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'HR'];
  const FONTS = [
    ['literata', 'Literata', '"Literata", Georgia, serif'],
    ['garamond', 'EB Garamond', '"EB Garamond", Garamond, Georgia, serif'],
    ['georgia', 'Georgia', 'Georgia, "Times New Roman", serif'],
    ['courier', 'Courier Prime', '"Courier Prime", "Courier New", Courier, monospace'],
    ['nunito', 'Nunito', '"Nunito", system-ui, sans-serif'],
    ['system', 'Système (sans)', 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'],
  ];
  const SIZES = [['1', 'Très petit'], ['2', 'Petit'], ['3', 'Normal'], ['4', 'Moyen'], ['5', 'Grand'], ['6', 'Très grand'], ['7', 'Énorme']];
  const SPECIALS = ['«\u00A0', '\u00A0»', '—', '–', '…', '’', '“', '”', '\u00A0', '\u202F', 'œ', 'Œ', 'æ', 'Æ', 'É', 'È', 'Ê', 'À', 'Ç', 'Ô', 'Î', 'ß', '§', '†', '°', '×', '½', '←', '→', '♪', '❦', '⁂', '✦'];
  const SPECIAL_NAMES = { '«\u00A0': '« (avec espace)', '\u00A0»': '» (avec espace)', '\u00A0': 'espace insécable', '\u202F': 'espace fine insécable' };
  const TRANSITIONS = ['CUT À :', 'FONDU ENCHAÎNÉ :', 'FONDU AU NOIR.', 'RACCORD :', 'ENCHAÎNÉ :', 'FERMETURE EN FONDU.', 'SMASH CUT :', 'RETOUR À :', 'PLUS TARD'];
  const TIMES = ['JOUR', 'NUIT', 'MATIN', 'SOIR', 'AUBE', 'CRÉPUSCULE', 'PLUS TARD', 'CONTINU', 'MÊME MOMENT'];
  const PREFIXES = ['INT. ', 'EXT. ', 'INT./EXT. '];

  const Editor = {
    ed: null, wrap: null, page: null, bar: null,
    project: null, doc: null, mode: null,
    lastRange: null,
    ac: null, // autocomplétion ouverte : { el, items, i, apply }

    init(els) {
      this.ed = els.ed; this.wrap = els.wrap; this.page = els.page; this.bar = els.bar;
      const ed = this.ed;
      try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignore */ }
      ed.addEventListener('keydown', (e) => this.onKey(e));
      ed.addEventListener('beforeinput', (e) => this.onBeforeInput(e));
      ed.addEventListener('input', () => this.onInput());
      ed.addEventListener('paste', (e) => this.onPaste(e));
      ed.addEventListener('click', (e) => this.onClick(e));
      ed.addEventListener('blur', () => setTimeout(() => this.closeAC(), 150));
      document.addEventListener('selectionchange', () => {
        const sel = getSelection();
        if (sel.rangeCount && ed.contains(sel.anchorNode)) {
          this.lastRange = sel.getRangeAt(0).cloneRange();
          this.onCaret();
        }
      });
      this.saveSoon = NS.debounce(() => this.commit(), 600);
      this.outlineSoon = NS.debounce(() => NS.bus.emit('outline'), 400);
      NS.bus.on('settings', (p) => { if (p === '*' || p.startsWith('editor')) this.applyLook(); });
      this.applyLook();
    },

    /* ================================================================ ouverture / sauvegarde */
    open(project, doc, reload) {
      if (!reload) this.commit();
      this.project = project; this.doc = doc;
      this.mode = NS.modes.get(project.mode);
      this.closeAC();
      this.page.dataset.mode = this.mode.id;
      this.ed.innerHTML = doc.content || '';
      this.normalize();
      this.ed.setAttribute('lang', 'fr');
      this.buildToolbar();
      this.applyLook();
      this.wrap.scrollTop = doc._scroll || 0;
      this.lastWords = NS.countWords(this.ed.innerText);
      this.markEmpty();
      this.refreshCharacters();
      NS.bus.emit('outline');
      this.status();
    },
    /** écrit le contenu courant dans le document et met à jour les compteurs */
    commit() {
      if (!this.doc || !this.ed.isConnected || this.ed.closest('[hidden]')) return;
      const html = this.ed.innerHTML.replace(/ ?\b(is-current|flash)\b/g, '').replace(/ class=""/g, '');
      if (html === this.doc.content) return;
      this.doc.content = html;
      const w = NS.countWords(this.ed.innerText);
      NS.stats.add(w - (this.lastWords || 0));
      this.lastWords = w;
      this.doc.words = w;
      NS.bus.emit('doc-change', this.doc);
    },
    focus() { this.ed.focus(); },
    markEmpty() {
      const one = this.ed.children.length === 1 && !this.ed.textContent;
      this.ed.classList.toggle('empty', one);
      if (one) { const d = NS.modes.def(this.mode, NS.modes.elementOf(this.mode, this.ed.firstElementChild)); this.ed.style.setProperty('--ph', JSON.stringify(d.hint ? `${d.label} – ${d.hint}` : 'Commencez à écrire…')); }
    },
    blocks() { return Array.from(this.ed.children); },

    applyLook() {
      if (!this.page) return;
      const s = S(), f = FONTS.find(x => x[0] === s.font) || FONTS[0];
      const st = this.page.style;
      st.setProperty('--ed-font', f[2]);
      st.setProperty('--ed-size', s.size + 'px');
      st.setProperty('--ed-lh', s.lineHeight);
      st.setProperty('--ed-width', s.width + 'px');
      this.page.classList.toggle('indent', !!s.indent);
      this.page.classList.toggle('justify', !!s.justify);
      this.page.classList.toggle('paper', !!s.paper);
      this.page.classList.toggle('numbered', !!s.sceneNumbers);
      this.page.classList.toggle('focus-mode', !!s.focusMode);
      this.wrap.classList.toggle('typewriter', !!s.typewriter);
      this.ed.spellcheck = !!s.spellcheck;
    },

    /* ================================================================ structure */
    defaultBlock() {
      const m = this.mode;
      const def = NS.modes.def(m, m.defaultEl || m.elements[0].id);
      const p = document.createElement(def.tag);
      if (def.cls) p.className = def.cls;
      return p;
    },
    /** chaque enfant direct doit être un bloc autorisé */
    normalize() {
      const ed = this.ed, script = !this.mode.richToolbar;
      const sel = getSelection();
      const keep = sel.rangeCount ? { n: sel.anchorNode, o: sel.anchorOffset } : null;
      let changed = false, pending = null;
      Array.from(ed.childNodes).forEach(n => {
        const isBlock = n.nodeType === 1 && (script ? n.tagName === 'P' : ALLOWED_TOP.includes(n.tagName));
        if (isBlock) { pending = null; return; }
        if (n.nodeType === 3 && !n.textContent.trim() && !pending) { n.remove(); return; }
        changed = true;
        if (n.nodeType === 1 && (n.tagName === 'DIV' || /^H[1-6]$|^BLOCKQUOTE$|^P$|^UL$|^OL$/.test(n.tagName))) {
          // un DIV (ou un titre en mode script) devient un paragraphe du mode
          const p = this.defaultBlock();
          if (!script) { const t = n.tagName === 'DIV' ? 'P' : n.tagName; if (t !== p.tagName) { const q = document.createElement(t); n.replaceWith(q); q.append(...n.childNodes); pending = null; return; } }
          if (n.className && script) p.className = n.className.split(/\s+/).find(c => /^(sc|th)-/.test(c)) || p.className;
          p.append(...n.childNodes); n.replaceWith(p); pending = null; return;
        }
        if (!pending) { pending = this.defaultBlock(); n.before(pending); }
        pending.appendChild(n);
      });
      if (!ed.firstElementChild) { const p = this.defaultBlock(); p.appendChild(document.createElement('br')); ed.appendChild(p); changed = true; }
      if (changed && keep && keep.n && ed.contains(keep.n)) {
        try { const r = document.createRange(); r.setStart(keep.n, Math.min(keep.o, keep.n.nodeType === 3 ? keep.n.length : keep.n.childNodes.length)); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); } catch (e) { /* ignore */ }
      }
      return changed;
    },
    blockOf(node) {
      while (node && node.parentNode !== this.ed) node = node.parentNode;
      return node && node.parentNode === this.ed ? node : null;
    },
    curBlock() {
      const sel = getSelection();
      if (!sel.rangeCount || !this.ed.contains(sel.anchorNode)) return null;
      return this.blockOf(sel.anchorNode);
    },
    selBlocks() {
      const sel = getSelection();
      if (!sel.rangeCount) return [];
      const r = sel.getRangeAt(0);
      const a = this.blockOf(r.startContainer), b = this.blockOf(r.endContainer);
      if (!a) return [];
      const all = this.blocks(), i = all.indexOf(a), j = b ? all.indexOf(b) : i;
      return all.slice(Math.min(i, j), Math.max(i, j) + 1);
    },
    curElement() { return NS.modes.elementOf(this.mode, this.curBlock()); },
    atEnd(block) {
      const sel = getSelection();
      if (!sel.rangeCount || !sel.isCollapsed) return false;
      const r = document.createRange();
      r.selectNodeContents(block);
      r.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
      return r.toString().length === 0;
    },
    caretTo(node, end) {
      const r = document.createRange();
      r.selectNodeContents(node);
      r.collapse(!end);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    },
    /** remet la sélection mémorisée, seulement si le focus a quitté l'éditeur (boîte de dialogue, liste…) */
    restore() {
      const cur = getSelection();
      if (cur.rangeCount && this.ed.contains(cur.anchorNode) && document.activeElement === this.ed) return;
      if (!this.lastRange) return;
      this.ed.focus({ preventScroll: true });
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(this.lastRange);
    },

    /** change l'élément (style de paragraphe) des blocs sélectionnés */
    setElement(id) {
      const def = NS.modes.def(this.mode, id);
      this.restore();
      let blocks = this.selBlocks();
      if (!blocks.length) return;
      const needTag = blocks.some(b => b.tagName !== def.tag);
      if (needTag && this.mode.richToolbar) {
        document.execCommand('formatBlock', false, def.tag === 'BLOCKQUOTE' ? 'blockquote' : def.tag.toLowerCase());
        blocks = this.selBlocks();
      }
      blocks.forEach(b => {
        if (b.tagName !== def.tag) { const q = document.createElement(def.tag); b.replaceWith(q); q.append(...b.childNodes); b = q; }
        b.className = def.cls || '';
      });
      this.afterChange();
    },

    afterChange() {
      this.normalize();
      this.saveSoon();
      this.outlineSoon();
      this.updateToolbarState();
      this.status();
    },

    /* ================================================================ clavier */
    onKey(e) {
      const mod = e.ctrlKey || e.metaKey;
      // autocomplétion
      if (this.ac) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.ac.i = (this.ac.i + (e.key === 'ArrowDown' ? 1 : -1) + this.ac.items.length) % this.ac.items.length; this.drawAC(); return; }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); const keepGoing = e.key === 'Enter'; this.acceptAC(); if (keepGoing) this.enter(); return; }
        if (e.key === 'Escape') { e.preventDefault(); this.closeAC(); return; }
      }
      if (mod && /^[1-9]$/.test(e.key)) {
        const def = this.mode.elements[+e.key - 1];
        if (def) { e.preventDefault(); this.setElement(def.id); }
        return;
      }
      if (mod && !e.shiftKey && (e.key === 'b' || e.key === 'i' || e.key === 'u')) {
        e.preventDefault(); document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[e.key]); this.updateToolbarState(); return;
      }
      if (mod && e.shiftKey && (e.key === 'X' || e.key === 'x')) { e.preventDefault(); document.execCommand('strikeThrough'); return; }
      if (mod && e.key.toLowerCase() === 'k' && e.shiftKey) { e.preventDefault(); this.link(); return; }
      if (mod && e.altKey && (e.key === 'm' || e.key === 'µ')) { e.preventDefault(); this.annotate(); return; }
      const script = !this.mode.richToolbar;
      if (e.key === 'Enter' && !e.shiftKey && !mod && script) { e.preventDefault(); this.enter(); return; }
      if (e.key === 'Tab' && !mod) {
        e.preventDefault();
        if (script) {
          const el = this.curElement();
          const map = e.shiftKey ? this.mode.shiftTab : this.mode.tab;
          if (map && map[el]) this.setElement(map[el]);
        } else {
          const b = this.curBlock();
          if (b && (b.tagName === 'UL' || b.tagName === 'OL')) document.execCommand(e.shiftKey ? 'outdent' : 'indent');
          else if (!e.shiftKey) document.execCommand('insertText', false, ' ');
        }
        return;
      }
      if (S().keySounds && NS.audio && (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace')) NS.audio.key(e.key);
    },

    /** Entrée en mode script : nouveau bloc avec l'élément suivant logique */
    enter() {
      const block = this.curBlock();
      if (!block) { document.execCommand('insertParagraph'); return; }
      let el = NS.modes.elementOf(this.mode, block);
      const text = block.textContent;
      if (!text.trim() && this.mode.emptyEnter && this.mode.emptyEnter[el]) { this.setElement(this.mode.emptyEnter[el]); return; }
      if (this.mode.smartOnEnter) {
        const s = this.mode.smartOnEnter(el, text);
        if (s) { block.className = NS.modes.def(this.mode, s).cls; el = s; }
      }
      const end = this.atEnd(block);
      document.execCommand('insertParagraph');
      const nb = this.curBlock();
      if (nb && nb !== block && end) {
        const next = (this.mode.enter && this.mode.enter[el]) || el;
        nb.className = NS.modes.def(this.mode, next).cls || '';
        if (!nb.textContent && !nb.querySelector('br')) nb.appendChild(document.createElement('br'));
        // un bloc vide ne doit pas hériter du gras/italique du précédent
        if (!nb.textContent) { nb.innerHTML = '<br>'; this.caretTo(nb, false); }
      }
      this.afterChange();
      this.keepCaretVisible();
    },

    /* ================================================================ typographie */
    onBeforeInput(e) {
      if (e.inputType !== 'insertText' || !e.data || e.data.length !== 1) return;
      const mode = S().frTypo;
      if (!mode || mode === 'off') return;
      const sel = getSelection();
      if (!sel.rangeCount || !sel.isCollapsed) return;
      const r = sel.getRangeAt(0);
      const node = r.startContainer, off = r.startOffset;
      const before = node.nodeType === 3 ? node.textContent.slice(0, off) : '';
      const prev = before.slice(-1);
      const c = e.data;
      const ins = (text, back) => { e.preventDefault(); for (let i = 0; i < (back || 0); i++) sel.modify('extend', 'backward', 'character'); document.execCommand('insertText', false, text); };
      if (c === '\'' ) return ins('’');
      if (c === '"') {
        const opening = !prev || /[\s(\[«\u00A0\u202F—–-]/.test(prev);
        return ins(opening ? '«\u00A0' : '\u00A0»', !opening && (prev === ' ' || prev === '\u00A0') ? 1 : 0);
      }
      if (c === '-' && prev === '-') return ins('—', 1);
      if (c === '.' && before.endsWith('..')) return ins('…', 2);
      if (c === ':' ) {
        if (/https?$|\d$/.test(before) || !prev) return;
        if (prev === ' ' || prev === '\u00A0') return ins('\u00A0:', 1);
        if (prev === '\u202F') return;
        return ins('\u00A0:');
      }
      if (c === ';' || c === '!' || c === '?') {
        if (mode !== 'fr' || !prev) return;
        if (/[!?;\u202F]/.test(prev)) return;
        if (prev === ' ' || prev === '\u00A0') return ins('\u202F' + c, 1);
        return ins('\u202F' + c);
      }
    },

    onInput() {
      if (this.ed.childNodes.length === 0 || this.ed.firstChild.nodeType !== 1 || Array.from(this.ed.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) this.normalize();
      const block = this.curBlock();
      if (block && this.mode.smart) {
        const el = NS.modes.elementOf(this.mode, block);
        const s = this.mode.smart(el, block.textContent);
        if (s && s !== el) { block.className = NS.modes.def(this.mode, s).cls; }
      }
      this.markEmpty();
      this.saveSoon();
      this.outlineSoon();
      this.updateAC();
      this.keepCaretVisible();
      this.statusSoon();
    },

    statusSoon: NS.debounce(function () { Editor.status(); }, 250),

    onCaret() {
      const b = this.curBlock();
      if (b !== this._curB) {
        if (this._curB) this._curB.classList.remove('is-current');
        if (b) b.classList.add('is-current');
        this._curB = b;
        if (!this.ac || this.ac.block !== b) this.closeAC();
      }
      this.updateToolbarState();
      this.statusSoon();
    },

    keepCaretVisible() {
      if (!S().typewriter) return;
      const sel = getSelection();
      if (!sel.rangeCount) return;
      let rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect || (!rect.top && !rect.height)) { const b = this.curBlock(); if (!b) return; rect = b.getBoundingClientRect(); }
      const wr = this.wrap.getBoundingClientRect();
      const target = wr.top + wr.height * 0.45;
      this.wrap.scrollTop += rect.top - target;
    },

    /* ================================================================ collage */
    onPaste(e) {
      const cd = e.clipboardData;
      if (!cd) return;
      e.preventDefault();
      const html = cd.getData('text/html'), text = cd.getData('text/plain');
      let out;
      if (!this.mode.richToolbar) {
        const src = text || NS.htmlToText(html);
        if (!/\n/.test(src)) { document.execCommand('insertText', false, src); return; }
        out = NS.fountain.toHTML(src, this.mode.id);
      } else if (html) out = sanitize(html);
      else {
        if (!/\n/.test(text)) { document.execCommand('insertText', false, text); return; }
        out = text.split(/\r?\n/).map(l => `<p>${NS.esc(l) || '<br>'}</p>`).join('');
      }
      document.execCommand('insertHTML', false, out);
      this.afterChange();
      this.refreshCharacters();
    },

    /* ================================================================ autocomplétion */
    refreshCharacters() {
      const names = new Set();
      if (this.project) {
        this.project.bible.filter(b => b.kind === 'personnage').forEach(b => b.name && names.add(NS.modes.cleanName(b.name)));
        if (this.mode && this.mode.characters) {
          this.mode.characters(this.blocks()).forEach(n => names.add(n));
          // et ceux des autres documents du projet
          NS.projects.flatDocs(this.project).forEach(id => {
            const it = this.project.items[id];
            if (it === this.doc || it.kind !== 'text') return;
            const re = this.mode.id === 'scenario' ? /<p class="sc-char[^"]*">(.*?)<\/p>/g : /<p class="th-char[^"]*">(.*?)<\/p>/g;
            let m; while ((m = re.exec(it.content || ''))) names.add(NS.modes.cleanName(m[1].replace(/<[^>]+>/g, '')));
          });
        }
      }
      names.delete('');
      // au théâtre, on garde la graphie des fiches (« Hélène ») ; en scénario, les majuscules
      const display = {};
      if (this.project && this.mode && this.mode.id === 'theatre') this.project.bible.filter(b => b.kind === 'personnage' && b.name).forEach(b => { display[NS.modes.cleanName(b.name)] = b.name.trim(); });
      this.characters = Array.from(names).sort((a, b) => a.localeCompare(b, 'fr')).map(n => display[n] || n);
    },
    sceneLocations() {
      const set = new Set();
      this.blocks().filter(b => b.classList.contains('sc-scene')).forEach(b => {
        const m = /^(?:INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+(.+?)(?:\s+[–—-]\s+.*)?$/i.exec(b.textContent.trim());
        if (m && m[1]) set.add(m[1].toUpperCase());
      });
      return Array.from(set);
    },
    updateAC() {
      const b = this.curBlock();
      if (!b || this.mode.richToolbar) { this.closeAC(); return; }
      const el = NS.modes.elementOf(this.mode, b);
      const text = b.textContent.replace(/\u00A0/g, ' ');
      const q = NS.norm(text.trim());
      let items = [], apply = null;
      if (el === this.mode.characterEl) {
        if (!this.characters || !q) { this.closeAC(); return; }
        items = this.characters.filter(n => NS.norm(n).startsWith(q) && NS.norm(n) !== q).slice(0, 8);
        apply = (v) => v;
      } else if (this.mode.id === 'scenario' && el === 'scene') {
        const up = text.toUpperCase();
        const pm = /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+(.*)$/i.exec(text);
        if (!pm) items = PREFIXES.filter(x => x.startsWith(up) && x.trim() !== up.trim());
        else if (!/\s[–—-]\s?/.test(pm[2])) {
          const loc = NS.norm(pm[2]);
          items = this.sceneLocations().filter(l => NS.norm(l).startsWith(loc) && NS.norm(l) !== loc).map(l => pm[1].toUpperCase() + ' ' + l + ' – ');
        } else {
          const dash = /^(.*\s[–—-]\s?)(.*)$/.exec(text);
          const t = NS.norm(dash[2]);
          items = TIMES.filter(x => NS.norm(x).startsWith(t) && NS.norm(x) !== t).map(x => dash[1].replace(/\s[–—-]\s?$/, ' – ') + x);
        }
        apply = (v) => v;
      } else if (this.mode.id === 'scenario' && el === 'transition') {
        items = TRANSITIONS.filter(x => NS.norm(x).startsWith(q) && NS.norm(x) !== q);
        apply = (v) => v;
      } else { this.closeAC(); return; }
      if (!items.length) { this.closeAC(); return; }
      this.ac = { block: b, items, i: 0, apply, el: this.ac ? this.ac.el : null };
      this.drawAC();
    },
    drawAC() {
      const ac = this.ac;
      if (!ac.el) { ac.el = h('div.ac-pop', { role: 'listbox' }); document.body.appendChild(ac.el); }
      ac.el.innerHTML = '';
      ac.items.forEach((it, i) => ac.el.appendChild(h('div.ac-item' + (i === ac.i ? '.on' : ''), { role: 'option', onmousedown: (e) => { e.preventDefault(); ac.i = i; this.acceptAC(); } }, it)));
      ac.el.appendChild(h('div.ac-hint', null, 'Tab ou Entrée pour choisir · Échap'));
      const r = ac.block.getBoundingClientRect();
      ac.el.style.left = Math.min(r.left + 8, innerWidth - 260) + 'px';
      ac.el.style.top = Math.min(r.bottom + 4, innerHeight - ac.el.offsetHeight - 8) + 'px';
    },
    acceptAC() {
      const ac = this.ac;
      if (!ac) return;
      const v = ac.apply(ac.items[ac.i]);
      const b = ac.block;
      this.closeAC();
      const r = document.createRange();
      r.selectNodeContents(b);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      document.execCommand('insertText', false, v);
      this.saveSoon(); this.outlineSoon();
      // une proposition de lieu enchaîne sur le moment de la journée
      if (/ – $/.test(v)) setTimeout(() => this.updateAC(), 0);
    },
    closeAC() { if (this.ac && this.ac.el) this.ac.el.remove(); this.ac = null; },

    /* ================================================================ annotations, liens */
    annotate() {
      this.restore();
      const sel = getSelection();
      if (!sel.rangeCount || sel.isCollapsed) { NS.toast('Sélectionnez d’abord le passage à annoter.'); return; }
      const range = sel.getRangeAt(0).cloneRange();
      NS.ask('Annotation', 'Note pour ce passage (visible seulement ici, jamais exportée) :', '', { multiline: true, ok: 'Annoter' }).then(v => {
        if (v == null || !v.trim()) return;
        const span = h('span.anno', { dataset: { note: v.trim() }, title: v.trim() });
        try { span.appendChild(range.extractContents()); range.insertNode(span); } catch (e) { return; }
        this.afterChange();
        NS.bus.emit('outline');
      });
    },
    onClick(e) {
      const a = e.target.closest('.anno');
      if (a) {
        NS.menu(e.clientX, e.clientY + 10, [
          { label: 'Modifier l’annotation', icon: '✎', run: () => NS.ask('Annotation', null, a.dataset.note, { multiline: true }).then(v => { if (v != null) { a.dataset.note = v; a.title = v; this.afterChange(); NS.bus.emit('outline'); } }) },
          { label: 'Supprimer l’annotation', icon: '🗑', danger: true, run: () => { a.replaceWith(...a.childNodes); this.afterChange(); NS.bus.emit('outline'); } },
        ]);
      }
      const link = e.target.closest('a[href]');
      if (link && (e.ctrlKey || e.metaKey)) window.open(link.href, '_blank', 'noopener');
    },
    link() {
      this.restore();
      const range = this.lastRange && this.lastRange.cloneRange();
      NS.ask('Lien', 'Adresse (URL) :', 'https://').then(v => {
        if (!v) return;
        const sel = getSelection(); sel.removeAllRanges(); if (range) sel.addRange(range);
        if (sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${NS.esc(v)}">${NS.esc(v)}</a>`);
        else document.execCommand('createLink', false, v);
        this.afterChange();
      });
    },
    sceneBreak() {
      this.restore();
      document.execCommand('insertHTML', false, '<hr><p><br></p>');
      this.afterChange();
    },

    /* ================================================================ barre d'outils */
    buildToolbar() {
      const bar = this.bar, m = this.mode;
      bar.innerHTML = '';
      const btn = (glyph, title, run, cls) => h('button.tb' + (cls ? '.' + cls : ''), { title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick: () => { this.restore(); run(); this.updateToolbarState(); this.ed.focus(); } }, glyph);
      const cmd = (name, val) => () => { document.execCommand('styleWithCSS', false, name === 'hiliteColor' || name === 'foreColor' || name === 'fontName' || name === 'fontSize'); document.execCommand(name, false, val); this.afterChange(); };
      const sep = () => h('span.tb-sep');
      const group = (...k) => h('div.tb-group', null, k);
      this.tbState = {};

      bar.append(group(btn('↶', 'Annuler (Ctrl+Z)', cmd('undo')), btn('↷', 'Rétablir (Ctrl+Y)', cmd('redo'))), sep());

      if (m.richToolbar) {
        const elSel = h('select.tb-select', { title: 'Style de paragraphe', 'aria-label': 'Style de paragraphe', onchange: (e) => { this.setElement(e.target.value); this.ed.focus(); } },
          m.elements.map((el, i) => h('option', { value: el.id }, el.label + (i < 9 ? `  (Ctrl+${i + 1})` : ''))));
        const fontSel = h('select.tb-select.narrow', { title: 'Police (sélection)', 'aria-label': 'Police', onchange: (e) => { this.restore(); cmd('fontName', e.target.value)(); e.target.selectedIndex = 0; this.ed.focus(); } },
          h('option', { value: '' }, 'Police…'), FONTS.map(f => h('option', { value: f[2].split(',')[0].replace(/"/g, '') }, f[1])));
        const sizeSel = h('select.tb-select.narrow', { title: 'Taille (sélection)', 'aria-label': 'Taille', onchange: (e) => { this.restore(); cmd('fontSize', e.target.value)(); e.target.selectedIndex = 0; this.ed.focus(); } },
          h('option', { value: '' }, 'Taille…'), SIZES.map(s => h('option', { value: s[0] }, s[1])));
        this.tbState.el = elSel;
        bar.append(group(elSel, fontSel, sizeSel), sep());
      } else {
        const pills = h('div.tb-group.els');
        m.elements.forEach((el, i) => pills.append(h('button.tb-el', { dataset: { el: el.id }, title: `${el.label} (Ctrl+${i + 1})`, onmousedown: (e) => e.preventDefault(), onclick: () => { this.setElement(el.id); this.ed.focus(); } },
          h('span', null, el.label), h('kbd', null, i + 1))));
        this.tbState.pills = pills;
        bar.append(pills, sep());
      }

      const B = btn(h('b', null, 'G'), 'Gras (Ctrl+B)', cmd('bold')), I = btn(h('i', null, 'I'), 'Italique (Ctrl+I)', cmd('italic')), U = btn(h('u', null, 'S'), 'Souligné (Ctrl+U)', cmd('underline'));
      B.dataset.state = 'bold'; I.dataset.state = 'italic'; U.dataset.state = 'underline';
      const parts = [B, I, U];
      if (m.richToolbar) {
        const X = btn(h('s', null, 'B'), 'Barré (Ctrl+Maj+X)', cmd('strikeThrough')); X.dataset.state = 'strikeThrough';
        parts.push(X, btn(h('span', null, 'x', h('sup', null, '2')), 'Exposant', cmd('superscript')), btn(h('span', null, 'x', h('sub', null, '2')), 'Indice', cmd('subscript')));
      }
      bar.append(group(...parts), sep());

      if (m.richToolbar) {
        const color = (title, glyph, command) => {
          const input = h('input', { type: 'color', value: command === 'foreColor' ? '#c0392b' : '#fff3a3', oninput: (e) => { this.restore(); cmd(command, e.target.value)(); }, onchange: () => this.ed.focus() });
          return h('label.tb.color', { title, onmousedown: () => { /* garde la sélection via lastRange */ } }, glyph, input);
        };
        bar.append(group(color('Couleur du texte', h('span.tb-a', null, 'A'), 'foreColor'), color('Surligner', '🖍', 'hiliteColor')), sep());
        const al = (g, t, c) => { const b = btn(g, t, cmd(c)); b.dataset.state = c; return b; };
        bar.append(group(al('⇤', 'Aligner à gauche', 'justifyLeft'), al('↔', 'Centrer', 'justifyCenter'), al('⇥', 'Aligner à droite', 'justifyRight'), al('☰', 'Justifier', 'justifyFull')), sep());
        bar.append(group(btn('•', 'Liste à puces', cmd('insertUnorderedList')), btn('1.', 'Liste numérotée', cmd('insertOrderedList')), btn('⇠', 'Diminuer le retrait', cmd('outdent')), btn('⇢', 'Augmenter le retrait', cmd('indent'))), sep());
        bar.append(group(btn('❝', 'Citation', () => this.setElement('quote')), btn('🔗', 'Lien (Ctrl+Maj+K)', () => this.link()), btn('⁂', 'Rupture de scène', () => this.sceneBreak())), sep());
      }
      const special = btn('Ω', 'Caractères spéciaux', () => {
        const r = special.getBoundingClientRect();
        this.specialMenu(r.left, r.bottom + 4);
      });
      bar.append(group(special, btn('💬', 'Annoter la sélection (Ctrl+Alt+M)', () => this.annotate()), btn('⌫', 'Effacer la mise en forme', cmd('removeFormat')), btn('🔍', 'Rechercher / remplacer (Ctrl+F)', () => NS.find.open())));
      if (m.id === 'scenario') {
        bar.append(sep(), h('label.tb-check', { title: 'Numéroter les scènes' }, h('input', { type: 'checkbox', checked: S().sceneNumbers, onchange: (e) => NS.settings.set('editor.sceneNumbers', e.target.checked) }), '№ scènes'));
      }
      this.updateToolbarState();
    },
    specialMenu(x, y) {
      NS.$$('.ctx-menu').forEach(m => m.remove());
      const pop = h('div.ctx-menu.chars', null, SPECIALS.map(c => h('button', { title: SPECIAL_NAMES[c] || c, onmousedown: (e) => e.preventDefault(), onclick: () => { pop.remove(); this.restore(); document.execCommand('insertText', false, c); } }, c.trim() || '␣')));
      document.body.appendChild(pop);
      pop.style.left = Math.min(x, innerWidth - 280) + 'px'; pop.style.top = y + 'px';
      const off = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off, true); } };
      setTimeout(() => document.addEventListener('mousedown', off, true), 0);
    },
    updateToolbarState() {
      if (!this.bar) return;
      $$('[data-state]', this.bar).forEach(b => { let on = false; try { on = document.queryCommandState(b.dataset.state); } catch (e) { /* ignore */ } b.classList.toggle('on', on); });
      const el = this.curElement();
      if (this.tbState.el && el) this.tbState.el.value = el;
      if (this.tbState.pills) $$('.tb-el', this.tbState.pills).forEach(b => b.classList.toggle('on', b.dataset.el === el));
      NS.bus.emit('element', el && NS.modes.def(this.mode, el).label);
    },

    /* ================================================================ déplacement de sections (plan) */
    sectionRange(item, items) {
      const i = items.indexOf(item);
      const next = items.slice(i + 1).find(x => x.level <= item.level);
      const all = this.blocks();
      const a = all.indexOf(item.el), b = next ? all.indexOf(next.el) : all.length;
      return all.slice(a, b);
    },
    moveSection(item, dir) {
      const items = this.mode.outline(this.blocks());
      const it = items.find(x => x.el === item.el);
      if (!it) return;
      const same = items.filter(x => x.level === it.level);
      const j = same.indexOf(it) + dir;
      if (j < 0 || j >= same.length) return;
      const mine = this.sectionRange(it, items), other = this.sectionRange(same[j], items);
      // ne pas sortir d'un acte / chapitre parent
      const parent = (x) => items.slice(0, items.indexOf(x)).reverse().find(y => y.level < x.level);
      if (parent(it) !== parent(same[j])) { NS.toast('Déplacement limité à la même section parente.'); return; }
      if (dir < 0) other[0].before(...mine); else other[other.length - 1].after(...mine);
      mine[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      this.afterChange();
      NS.bus.emit('outline');
    },
    goTo(el) {
      if (!el || !el.isConnected) return;
      el.scrollIntoView({ block: 'center', behavior: NS.settings.data.reduceMotion ? 'auto' : 'smooth' });
      this.caretTo(el, true);
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1200);
    },

    /* ================================================================ statistiques */
    selectionWords() {
      const sel = getSelection();
      if (!sel.rangeCount || sel.isCollapsed || !this.ed.contains(sel.anchorNode)) return 0;
      return NS.countWords(sel.toString());
    },
    /** estimation du nombre de pages (scénario : 1 page ≈ 1 minute) */
    estimate(blocks, modeId) {
      const words = NS.countWords(blocks.map(b => b.textContent).join(' '));
      if (modeId === 'scenario') {
        let lines = 0;
        const W = { 'sc-scene': [61, 2], 'sc-action': [61, 1], 'sc-char': [38, 1], 'sc-paren': [25, 0], 'sc-dial': [35, 0], 'sc-trans': [61, 1], 'sc-shot': [61, 1], 'sc-center': [61, 1] };
        blocks.forEach(b => {
          const k = Object.keys(W).find(c => b.classList.contains(c));
          if (!k) return;
          lines += Math.max(1, Math.ceil(b.textContent.length / W[k][0])) + W[k][1];
        });
        const pages = lines / 55;
        return { words, pages, minutes: pages, label: `≈ ${pages.toFixed(1).replace('.', ',')} p. · ≈ ${Math.round(pages)} min` };
      }
      if (modeId === 'theatre') {
        const spoken = NS.countWords(blocks.filter(b => b.classList.contains('th-rep') || b.classList.contains('th-vers')).map(b => b.textContent).join(' '));
        const min = spoken / 140;
        return { words, minutes: min, label: `≈ ${Math.round(min)} min de jeu` };
      }
      return { words, pages: words / 250, label: `≈ ${Math.max(1, Math.round(words / 250))} p. · ${Math.max(1, Math.round(words / 230))} min de lecture` };
    },
    /** répliques et mots par personnage (scénario / théâtre) */
    castStats(blocks) {
      const charCls = this.mode.id === 'scenario' ? 'sc-char' : 'th-char';
      const lineCls = this.mode.id === 'scenario' ? ['sc-dial'] : ['th-rep', 'th-vers'];
      const out = {};
      let cur = null;
      blocks.forEach(b => {
        if (b.classList.contains(charCls)) { cur = NS.modes.cleanName(b.textContent); if (cur) { out[cur] = out[cur] || { lines: 0, words: 0 }; out[cur].lines++; } }
        else if (cur && lineCls.some(c => b.classList.contains(c))) out[cur].words += NS.countWords(b.textContent);
        else if (!b.classList.contains('sc-paren') && !b.classList.contains('th-dida')) cur = null;
      });
      return Object.entries(out).sort((a, b) => b[1].words - a[1].words);
    },
    status() {
      if (!this.doc) return;
      NS.bus.emit('status', { words: NS.countWords(this.ed.innerText), sel: this.selectionWords(), est: this.estimate(this.blocks(), this.mode.id) });
    },
  };

  /* ================================================================ nettoyage du HTML collé */
  const KEEP = { P: 1, H1: 1, H2: 1, H3: 1, BLOCKQUOTE: 1, UL: 1, OL: 1, LI: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, SUB: 1, SUP: 1, A: 1, BR: 1, HR: 1, SPAN: 1 };
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const clean = (node) => {
      Array.from(node.childNodes).forEach(n => {
        if (n.nodeType === 8) { n.remove(); return; }
        // l'éditeur est en white-space: pre-wrap : on replie les blancs de mise en page du HTML source
        if (n.nodeType === 3) { n.textContent = n.textContent.replace(/[ \t\r\n]+/g, ' '); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT', 'IMG', 'SVG', 'VIDEO', 'AUDIO'].includes(tag)) { n.remove(); return; }
        clean(n);
        if (/^H[4-6]$/.test(tag)) { const q = doc.createElement('h3'); q.append(...n.childNodes); n.replaceWith(q); return; }
        if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE') { const q = doc.createElement('p'); q.append(...n.childNodes); n.replaceWith(q); return; }
        if (!KEEP[tag]) { n.replaceWith(...n.childNodes); return; }
        const st = n.getAttribute('style') || '';
        const bold = /font-weight:\s*(bold|[6-9]00)/.test(st), ital = /font-style:\s*italic/.test(st), align = /text-align:\s*(center|right|justify)/.exec(st);
        Array.from(n.attributes).forEach(a => { if (!(tag === 'A' && a.name === 'href')) n.removeAttribute(a.name); });
        if (tag === 'A' && /^\s*javascript:/i.test(n.getAttribute('href') || '')) n.removeAttribute('href');
        if (align && /^(P|H\d|BLOCKQUOTE)$/.test(tag)) n.style.textAlign = align[1];
        if (tag === 'SPAN') {
          if (!bold && !ital) { n.replaceWith(...n.childNodes); return; }
          let inner = n;
          if (bold) { const b = doc.createElement('b'); b.append(...inner.childNodes); inner.appendChild(b); }
          if (ital) { const i = doc.createElement('i'); i.append(...inner.childNodes); inner.appendChild(i); }
          n.replaceWith(...n.childNodes);
        }
      });
    };
    clean(doc.body);
    return doc.body.innerHTML;
  }
  Editor.sanitize = sanitize;
  Editor.FONTS = FONTS;

  NS.editor = Editor;
})();

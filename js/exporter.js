/* Exports (HTML, Word, PDF via impression, Markdown, texte, Fountain, sauvegarde JSON) et imports. */
(function () {
  'use strict';
  const NS = window.SE;
  const { h, esc } = NS;

  /* ---------- compilation : le classeur mis à plat ---------- */
  function compile(p, opts) {
    const out = [];
    const rec = (ids, depth) => ids.forEach(id => {
      const it = p.items[id];
      if (!it) return;
      if (opts.only && !opts.only.includes(id) && !NS.projects.flatDocs(p, [id]).some(d => opts.only.includes(d))) return;
      if (it.type === 'folder') { out.push({ kind: 'folder', title: it.title, depth }); rec(it.children, depth + 1); return; }
      if (opts.only && !opts.only.includes(id)) return;
      out.push({ kind: it.kind === 'graph' ? 'graph' : 'doc', title: it.title, depth, html: it.content || '', graph: it.graph, synopsis: it.synopsis });
    });
    rec(p.root, 0);
    return out;
  }
  /** retire annotations et notes non exportées */
  function cleanHTML(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    d.querySelectorAll('.anno').forEach(a => a.replaceWith(...a.childNodes));
    d.querySelectorAll('.sc-note, .th-note').forEach(n => n.remove());
    d.querySelectorAll('.is-current, .flash').forEach(n => n.classList.remove('is-current', 'flash'));
    d.querySelectorAll('[class=""]').forEach(n => n.removeAttribute('class'));
    return d.innerHTML;
  }

  const MANUSCRIPT_CSS = `
  body{margin:0;background:#fff;color:#111}
  .ms{max-width:6.5in;margin:0 auto;padding:1in 0;font:12pt/1.6 "Literata",Georgia,"Times New Roman",serif}
  .ms h1{font-size:20pt;text-align:center;margin:2.2em 0 1.2em;font-weight:600}
  .ms h2{font-size:15pt;margin:1.6em 0 .8em} .ms h3{font-size:13pt;margin:1.4em 0 .6em}
  .ms p{margin:0;text-align:justify} .ms.indent p{text-indent:1.5em} .ms.indent h1+p,.ms.indent h2+p,.ms.indent h3+p,.ms.indent hr+p,.ms .n-noindent{text-indent:0}
  .ms hr{border:0;text-align:center;margin:1.2em 0} .ms hr:after{content:"* * *";letter-spacing:.4em}
  .ms blockquote{margin:1em 2em;font-style:italic} .ms .n-center{text-align:center;text-indent:0} .ms .n-letter{margin:0 2em;font-style:italic;text-indent:0}
  .ms .folder-title{text-align:center;font-size:22pt;margin:3em 0 1.5em;page-break-before:always;break-before:page}
  .ms .doc-title{font-size:13pt;text-align:center;margin:2em 0 1em;font-weight:600}
  .ms .title-page{text-align:center;padding-top:30vh;page-break-after:always;break-after:page}
  .ms .title-page h1{font-size:28pt;margin:0 0 .6em} .ms .title-page .by{font-size:14pt}
  .ms .title-page .contact{margin-top:20vh;text-align:left;white-space:pre-line;font-size:11pt}
  .pb{page-break-before:always;break-before:page}
  /* scénario */
  .ms.scenario{font:12pt/1.0 "Courier Prime","Courier New",Courier,monospace;width:6in;max-width:6in}
  .ms.scenario p{text-align:left;text-indent:0;margin:0}
  .ms.scenario .sc-scene{text-transform:uppercase;font-weight:700;margin-top:2em;margin-bottom:1em}
  .ms.scenario.numbered{counter-reset:sc} .ms.scenario.numbered .sc-scene{counter-increment:sc;position:relative}
  .ms.scenario.numbered .sc-scene:before{content:counter(sc);position:absolute;left:-.6in} .ms.scenario.numbered .sc-scene:after{content:counter(sc);position:absolute;right:-.5in}
  .ms.scenario .sc-action{margin-bottom:1em} .ms.scenario .sc-shot{text-transform:uppercase;margin:1em 0}
  .ms.scenario .sc-char{text-transform:uppercase;margin:1em 0 0 2.2in;page-break-after:avoid;break-after:avoid}
  .ms.scenario .sc-paren{margin-left:1.6in;width:2in} .ms.scenario .sc-paren:before{content:"("} .ms.scenario .sc-paren:after{content:")"}
  .ms.scenario .sc-dial{margin-left:1in;width:3.5in;margin-bottom:1em}
  .ms.scenario .sc-trans{text-transform:uppercase;text-align:right;margin:1em 0}
  .ms.scenario .sc-center{text-align:center;text-transform:uppercase;margin:1em 0}
  .ms.scenario .title-page h1{text-transform:uppercase;text-decoration:underline;font-size:12pt;font-weight:400}
  /* théâtre */
  .ms.theatre p{text-indent:0;text-align:left}
  .ms.theatre .th-acte{text-align:center;text-transform:uppercase;font-size:16pt;letter-spacing:.12em;margin:2.5em 0 1em;font-weight:600}
  .ms.theatre .th-scene{text-align:center;text-transform:uppercase;letter-spacing:.1em;margin:2em 0 .4em;font-weight:600}
  .ms.theatre .th-cast{text-align:center;font-variant:small-caps;margin-bottom:1em}
  .ms.theatre .th-dida{font-style:italic;margin:.5em 0 .5em 2em}
  .ms.theatre .th-char{text-align:center;font-variant:small-caps;letter-spacing:.06em;margin-top:1em;font-weight:600}
  .ms.theatre .th-char+.th-dida{text-align:center;margin:0}
  .ms.theatre .th-rep{margin-bottom:.3em} .ms.theatre .th-vers{margin-left:3em;font-style:italic}
  .graph-node{margin:1em 0;padding:.5em 0;border-top:1px solid #ccc} .graph-node .sp{font-weight:700;text-transform:uppercase}
  .graph-node ul{margin:.3em 0 0 1em;padding:0;list-style:"→ "} .graph-node small{color:#666}
  @page{size:letter;margin:1in} @page{@bottom-center{content:counter(page)}}
  @media print{.ms{padding:0}}`;

  function buildHTMLBody(p, opts) {
    const mode = p.mode;
    const parts = [];
    if (opts.titlePage) {
      parts.push(`<div class="title-page"><h1>${esc(p.title)}</h1>${p.meta.author ? `<div class="by">${mode === 'scenario' ? 'Écrit par<br><br>' : ''}${esc(p.meta.author)}</div>` : ''}${p.meta.contact ? `<div class="contact">${esc(p.meta.contact)}</div>` : ''}</div>`);
    }
    let first = true;
    compile(p, opts).forEach(sec => {
      if (sec.kind === 'folder') { if (opts.folderTitles) { parts.push(`<h1 class="folder-title">${esc(sec.title)}</h1>`); first = true; } return; }
      const pb = opts.pageBreaks && !first ? ' pb' : '';
      if (opts.docTitles) parts.push(`<h2 class="doc-title${pb}">${esc(sec.title)}</h2>`);
      else if (pb) parts.push('<div class="pb"></div>');
      else if (!first && mode === 'roman') parts.push('<hr>');
      if (sec.kind === 'graph') {
        const g = sec.graph || { nodes: [] };
        parts.push(g.nodes.map((n, i) => `<div class="graph-node"><b>[${i + 1}] ${esc(n.title || '')}</b>${n.id === g.start ? ' <small>(départ)</small>' : ''}<p>${n.speaker ? `<span class="sp">${esc(n.speaker)}</span> — ` : ''}${esc(n.text)}</p><ul>${n.choices.map(c => { const t = g.nodes.findIndex(x => x.id === c.target); return `<li>${esc(c.text || '(continuer)')}${c.cond ? ` <small>[si ${esc(c.cond)}]</small>` : ''} ⇒ ${t >= 0 ? '[' + (t + 1) + ']' : '—'}</li>`; }).join('')}</ul></div>`).join(''));
      } else parts.push(cleanHTML(sec.html));
      first = false;
    });
    const cls = ['ms', mode === 'interactif' ? 'roman' : mode, opts.indent ? 'indent' : '', opts.sceneNumbers ? 'numbered' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}">${parts.join('\n')}</div>`;
  }
  function fullHTML(p, opts) {
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Literata:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>${MANUSCRIPT_CSS}</style></head><body>${buildHTMLBody(p, opts)}</body></html>`;
  }

  /* ---------- Markdown / texte ---------- */
  function inlineMD(node) {
    let s = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { s += n.textContent.replace(/([*_`\\])/g, '\\$1'); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName, inner = inlineMD(n);
      if (t === 'BR') s += '  \n';
      else if (t === 'B' || t === 'STRONG') s += inner.trim() ? `**${inner}**` : inner;
      else if (t === 'I' || t === 'EM') s += inner.trim() ? `*${inner}*` : inner;
      else if (t === 'S' || t === 'STRIKE') s += `~~${inner}~~`;
      else if (t === 'A') s += `[${inner}](${n.getAttribute('href') || ''})`;
      else s += inner;
    });
    return s;
  }
  function blocksTo(html, mode, md) {
    const d = document.createElement('div');
    d.innerHTML = cleanHTML(html);
    const txt = (n) => (md ? inlineMD(n) : n.textContent).replace(/\u00A0|\u202F/g, md ? '\u00A0' : ' ');
    const out = [];
    Array.from(d.children).forEach(b => {
      const c = b.className || '', t = txt(b).trim();
      if (b.tagName === 'H1') out.push((md ? '# ' : '') + t, '');
      else if (b.tagName === 'H2') out.push((md ? '## ' : '') + t, '');
      else if (b.tagName === 'H3') out.push((md ? '### ' : '') + t, '');
      else if (b.tagName === 'HR') out.push(md ? '* * *' : '                              * * *', '');
      else if (b.tagName === 'BLOCKQUOTE') out.push(t.split('\n').map(l => (md ? '> ' : '    ') + l).join('\n'), '');
      else if (b.tagName === 'UL' || b.tagName === 'OL') { Array.from(b.children).forEach((li, i) => out.push((b.tagName === 'OL' ? `${i + 1}. ` : '- ') + txt(li).trim())); out.push(''); }
      else if (/th-acte|th-scene/.test(c)) out.push(md ? `## ${t.toUpperCase()}` : t.toUpperCase(), '');
      else if (/th-cast/.test(c)) out.push(md ? `*${t}*` : t, '');
      else if (/th-char/.test(c)) out.push(md ? `**${t.toUpperCase()}**` : t.toUpperCase());
      else if (/th-dida/.test(c)) out.push(md ? `*(${t})*` : `(${t})`, '');
      else if (/th-rep|th-vers/.test(c)) out.push(t, '');
      else if (/sc-/.test(c)) out.push(t);
      else out.push(t, '');
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function toText(p, opts, md) {
    if (p.mode === 'scenario' && !md) return toFountain(p, opts);
    const parts = [];
    if (opts.titlePage) parts.push(md ? `# ${p.title}\n\n${p.meta.author ? '*' + p.meta.author + '*\n' : ''}` : `${p.title.toUpperCase()}\n${p.meta.author || ''}\n\n`);
    compile(p, opts).forEach(sec => {
      if (sec.kind === 'folder') { if (opts.folderTitles) parts.push(md ? `${'#'.repeat(Math.min(3, sec.depth + 1))} ${sec.title}\n` : `\n${sec.title.toUpperCase()}\n`); return; }
      if (opts.docTitles) parts.push(md ? `### ${sec.title}\n` : `${sec.title}\n`);
      if (sec.kind === 'graph') parts.push(NS.graph.toScript(sec.graph || { nodes: [] }));
      else parts.push(blocksTo(sec.html, p.mode, md) + '\n');
    });
    return parts.join('\n').replace(/\n{3,}/g, '\n\n');
  }
  function toFountain(p, opts) {
    const head = [`Title: ${p.title}`];
    if (p.meta.author) head.push('Credit: Écrit par', `Author: ${p.meta.author}`);
    if (p.meta.contact) head.push('Contact:', ...p.meta.contact.split('\n').map(l => '    ' + l));
    head.push(`Draft date: ${new Date().toLocaleDateString('fr-CA')}`);
    const body = [];
    compile(p, opts).forEach(sec => {
      if (sec.kind === 'folder') { body.push(`# ${sec.title}`, ''); return; }
      if (sec.kind !== 'doc') return;
      if (opts.docTitles) body.push(`## ${sec.title}`, '');
      const d = document.createElement('div');
      d.innerHTML = sec.html;
      d.querySelectorAll('.anno').forEach(a => a.replaceWith(...a.childNodes));
      body.push(NS.fountain.fromBlocks(Array.from(d.children)));
    });
    return head.join('\n') + '\n\n' + body.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  /* ---------- impression / PDF ---------- */
  function print(p, opts) {
    let root = document.getElementById('print-root');
    if (!root) { root = h('div#print-root'); document.body.appendChild(root); }
    let style = document.getElementById('print-style');
    if (!style) { style = h('style#print-style'); document.head.appendChild(style); }
    style.textContent = '@media print{' + MANUSCRIPT_CSS.replace(/\bbody\{[^}]*\}/, '') + '}';
    root.innerHTML = buildHTMLBody(p, opts);
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1500); }, 150);
  }

  /* ---------- boîte de dialogue ---------- */
  const FORMATS = [
    { id: 'pdf', label: 'PDF / impression', icon: '🖨', modes: null, hint: 'Ouvre l’impression ; choisissez « Enregistrer au format PDF ».' },
    { id: 'html', label: 'Page web (.html)', icon: '🌐', modes: null },
    { id: 'doc', label: 'Word (.doc)', icon: '📝', modes: null, hint: 'Document lisible par Word, LibreOffice et Google Docs.' },
    { id: 'fountain', label: 'Fountain (.fountain)', icon: '⛲', modes: ['scenario'], hint: 'Format texte standard : Final Draft, Highland, WriterSolo, Fade In…' },
    { id: 'md', label: 'Markdown (.md)', icon: 'Ⓜ', modes: ['roman', 'theatre', 'interactif'] },
    { id: 'txt', label: 'Texte brut (.txt)', icon: '📄', modes: ['roman', 'theatre', 'interactif'] },
    { id: 'json', label: 'Sauvegarde complète (.json)', icon: '💾', modes: null, hint: 'Tout le projet (fiches, instantanés compris), réimportable ici.' },
  ];
  function dialog(p, onlyDoc) {
    NS.app.flush();
    const mode = p.mode;
    const o = { format: mode === 'scenario' ? 'pdf' : 'doc', scope: onlyDoc ? 'doc' : 'all', titlePage: mode === 'scenario', folderTitles: mode === 'roman', docTitles: false, pageBreaks: mode === 'scenario' ? false : mode !== 'roman', indent: NS.settings.data.editor.indent, sceneNumbers: mode === 'scenario' && NS.settings.data.editor.sceneNumbers };
    const fmts = FORMATS.filter(f => !f.modes || f.modes.includes(mode));
    const fmtBox = h('div.fmt-grid');
    const hint = h('p.muted.small');
    const drawFmts = () => {
      fmtBox.innerHTML = '';
      fmts.forEach(f => fmtBox.append(h('button.fmt' + (o.format === f.id ? '.on' : ''), { onclick: () => { o.format = f.id; drawFmts(); } }, h('span', null, f.icon), f.label)));
      const f = fmts.find(x => x.id === o.format);
      hint.textContent = f.hint || '';
      opts.hidden = o.format === 'json';
    };
    const chk = (key, label) => h('label.w-check', null, h('input', { type: 'checkbox', checked: !!o[key], onchange: (e) => { o[key] = e.target.checked; } }), ' ' + label);
    const opts = h('div.exp-opts', null,
      h('label.w-check', null, h('select.text', { onchange: (e) => { o.scope = e.target.value; } }, h('option', { value: 'all', selected: o.scope === 'all' }, 'Tout le projet'), h('option', { value: 'doc', selected: o.scope === 'doc' }, 'Document courant seulement'))),
      chk('titlePage', 'Page de titre'), chk('folderTitles', 'Titres des dossiers (chapitres, actes…)'), chk('docTitles', 'Titres des documents'), chk('pageBreaks', 'Saut de page entre documents'),
      mode === 'roman' ? chk('indent', 'Retrait de première ligne') : null, mode === 'scenario' ? chk('sceneNumbers', 'Numéros de scène') : null);
    drawFmts();
    NS.modal({ title: 'Exporter', wide: true, body: [fmtBox, hint, opts], actions: [{ label: 'Annuler' }, { label: 'Exporter', primary: true, run: () => run(p, o) }] });
  }
  function run(p, o) {
    const opts = Object.assign({}, o, { only: o.scope === 'doc' && p.open ? [p.open] : null });
    const name = NS.slug(p.title) + (opts.only ? '-' + NS.slug(p.items[p.open].title) : '');
    switch (o.format) {
      case 'pdf': print(p, opts); break;
      case 'html': NS.download(name + '.html', fullHTML(p, opts), 'text/html;charset=utf-8'); break;
      case 'doc': NS.download(name + '.doc', '﻿' + fullHTML(p, opts).replace('<html lang="fr">', '<html lang="fr" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">'), 'application/msword'); break;
      case 'fountain': NS.download(name + '.fountain', toFountain(p, opts)); break;
      case 'md': NS.download(name + '.md', toText(p, opts, true), 'text/markdown;charset=utf-8'); break;
      case 'txt': NS.download(name + '.txt', toText(p, opts, false)); break;
      case 'json': backup(p); break;
    }
  }
  function backup(p) {
    NS.download(NS.slug(p.title) + '-' + NS.today() + '.station.json', JSON.stringify(p), 'application/json');
    p.meta.lastBackup = Date.now();
    NS.app.saveSoon();
  }

  /* ---------- imports ---------- */
  async function importFile(file, intoProject) {
    const text = await file.text();
    const name = file.name.replace(/\.[^.]+$/, '');
    if (/\.json$/i.test(file.name)) {
      const obj = JSON.parse(text);
      return { project: await NS.projects.importJSON(obj) };
    }
    const isFountain = /\.(fountain|spmd)$/i.test(file.name);
    const p = intoProject;
    if (!p || (isFountain && p.mode !== 'scenario')) {
      // nouveau projet
      const mode = isFountain ? 'scenario' : 'roman';
      const np = NS.projects.create(mode, name);
      const doc = np.items[NS.projects.flatDocs(np)[0]];
      if (mode === 'scenario') { const r = NS.fountain.parse(text, 'scenario'); doc.content = r.html; doc.title = name; if (r.meta.title) np.title = r.meta.title.replace(/[_*]/g, ''); if (r.meta.author || r.meta.authors) np.meta.author = r.meta.author || r.meta.authors; if (r.meta.contact) np.meta.contact = r.meta.contact; np.bible = []; }
      else doc.content = textToHTML(text, file.name);
      NS.projects.refreshWords(np);
      await NS.projects.persist(np);
      return { project: np };
    }
    // nouveau document dans le projet courant
    const id = NS.projects.add(p, { type: 'doc', kind: 'text', title: name }, null);
    const doc = p.items[id];
    doc.content = p.mode === 'scenario' || p.mode === 'theatre' ? NS.fountain.parse(text, p.mode).html : textToHTML(text, file.name);
    doc.words = NS.projects.docWords(doc);
    return { docId: id };
  }
  function textToHTML(text, filename) {
    if (/\.html?$/i.test(filename)) return NS.editor.sanitize(text);
    const md = /\.md$/i.test(filename);
    return text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(par => {
      const t = par.trim();
      if (!t) return '';
      if (md) {
        const m = /^(#{1,3})\s+(.*)$/.exec(t);
        if (m) return `<h${m[1].length}>${esc(m[2])}</h${m[1].length}>`;
        if (/^(\* ?\* ?\*|-{3,}|_{3,})$/.test(t)) return '<hr>';
        if (/^>/.test(t)) return `<blockquote>${mdInline(t.replace(/^>\s?/gm, ''))}</blockquote>`;
        return `<p>${mdInline(t).replace(/\n/g, ' ')}</p>`;
      }
      return t.split('\n').map(l => `<p>${esc(l)}</p>`).join('');
    }).join('') || '<p><br></p>';
  }
  const mdInline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/_(.+?)_/g, '<i>$1</i>');

  NS.exporter = { dialog, backup, print, importFile, fullHTML, toText, toFountain, compile };
})();

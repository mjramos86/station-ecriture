/* Tests sans navigateur : langage des conditions/effets, exports Ink/Yarn, lecture Fountain.
   node tests/logic.test.js */
'use strict';
const assert = require('assert');
const path = require('path');

global.window = { SE: {} };
global.document = {};
const NS = window.SE;
Object.assign(NS, {
  h() {}, $$() { return []; }, clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  uid: (() => { let i = 0; return () => 'id' + (++i); })(),
  esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  slug: (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet',
});
require(path.join(__dirname, '../js/graph.js'));
require(path.join(__dirname, '../js/fountain.js'));
const G = NS.graph;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };

t('conditions', () => {
  const v = { argent: 3, trahi: false, nom: 'Lia' };
  assert.strictEqual(G.evalExpr('argent >= 2 && !trahi', v), true);
  assert.strictEqual(G.evalExpr('argent > 5 ou nom == "Lia"', v), true);
  assert.strictEqual(G.evalExpr('(argent + 2) * 2', v), 10);
  assert.strictEqual(G.evalExpr('non trahi et vrai', v), true);
  assert.strictEqual(G.evalExpr('', v), true, 'une condition vide est toujours vraie');
  assert.strictEqual(G.evalExpr('inconnue', v), 0);
  assert.throws(() => G.evalExpr('argent >= ', v));
  assert.throws(() => G.evalExpr('alert(1)', v));
});

t('effets', () => {
  const v = { argent: 10 };
  G.runEffect('argent -= 3; trahi = vrai\nnom = "Bo"', v);
  assert.deepStrictEqual(v, { argent: 7, trahi: true, nom: 'Bo' });
  assert.throws(() => G.runEffect('argent ++', v));
});

t('vérifications du graphe', () => {
  const g = NS.graphSample();
  assert.deepStrictEqual(G.check(g), []);
  g.nodes[0].choices[0].target = '';
  g.nodes[0].choices[1].cond = 'x >';
  const msgs = G.check(g).map(i => i.msg).join('\n');
  assert.match(msgs, /aucune destination/);
  assert.match(msgs, /condition 2/);
});

t('export Ink', () => {
  const ink = G.toInk(NS.graphSample(), 'Taverne');
  assert.match(ink, /^VAR argent = 10$/m);
  assert.match(ink, /^-> n_accueil_0$/m);
  assert.match(ink, /\* \{courage >= 2\} \[\\\[Menacer\\\] Parle/);
  assert.match(ink, /~ argent -= 2/);
});

t('export Yarn', () => {
  const y = G.toYarn(NS.graphSample());
  assert.match(y, /^title: accueil_0$/m);
  assert.match(y, /<<declare \$argent = 10>>/);
  assert.match(y, /<<if \$courage >= 2>>/);
  assert.match(y, /<<set \$argent to \$argent - 2>>/);
});

t('lecture Fountain', () => {
  const r = NS.fountain.parse('Title: Essai\nAuthor: A. B.\n\nINT. CUISINE - JOUR\n\nMarc entre.\n\nMARC\n(bas)\nSalut.\n\nCUT TO:\n\n.FLASHBACK\n\n> FIN <\n', 'scenario');
  assert.strictEqual(r.meta.title, 'Essai');
  assert.strictEqual(r.meta.author, 'A. B.');
  const cls = [...r.html.matchAll(/class="([\w-]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(cls, ['sc-scene', 'sc-action', 'sc-char', 'sc-paren', 'sc-dial', 'sc-trans', 'sc-scene', 'sc-center']);
});

t('collage de théâtre', () => {
  const html = NS.fountain.toHTML('ACTE II\nSCÈNE 3\nAnne, Paul\n(Un jardin.)\nANNE\nTu viens ?\nPAUL\nNon.', 'theatre');
  const cls = [...html.matchAll(/class="([\w-]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(cls, ['th-acte', 'th-scene', 'th-cast', 'th-dida', 'th-char', 'th-rep', 'th-char', 'th-rep']);
});

console.log(`\n${n} tests réussis.`);

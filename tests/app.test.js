/* Test de bout en bout dans Chromium : les quatre modes, Entrée/Tab, autocomplétion, typographie,
   graphe, recherche/remplacement, export, persistance.
   npm i playwright   puis   node tests/app.test.js */
'use strict';
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('Installez playwright : npm i playwright'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let n = 0;
  const t = async (name, fn) => { await fn(); n++; console.log('✓ ' + name); };
  const open = (mode, title) => page.evaluate(async ([m, ti]) => { const p = SE.projects.create(m, ti); await SE.projects.persist(p); await SE.app.openProject(p.id); }, [mode, title]);
  const caretAtEnd = () => page.evaluate(() => { const ed = SE.editor.ed; SE.editor.caretTo(ed.lastElementChild, true); ed.focus(); });
  const lastBlocks = (k) => page.evaluate((k) => SE.editor.blocks().slice(-k).map(b => b.className.replace(/\s*is-current/, '') + '|' + b.textContent), k);

  await page.goto(url);
  await page.waitForFunction(() => document.body.classList.contains('ready'));

  await t('accueil : quatre modes proposés', async () => {
    assert.strictEqual(await page.locator('.mode-card').count(), 4);
  });

  await t('scénario : Entrée/Tab enchaînent les éléments, autocomplétion', async () => {
    await open('scenario', 'Essai');
    await caretAtEnd();
    await page.keyboard.press('Enter');            // transition → en-tête de scène
    await page.keyboard.type('ext. parc – nu');
    await page.keyboard.press('Tab');              // « NUIT » proposé
    await page.keyboard.press('Enter');            // → action
    await page.keyboard.type('Il pleut.');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');              // action → personnage
    await page.keyboard.type('cl');
    await page.keyboard.press('Enter');            // accepte CLAIRE puis → dialogue
    await page.keyboard.type('Enfin.');
    await page.keyboard.press('Enter');            // → personnage
    await page.keyboard.press('Enter');            // vide → action
    await page.keyboard.type('INT. GARE - JOUR');  // devient un en-tête
    assert.deepStrictEqual(await lastBlocks(5), ['sc-scene|ext. parc – NUIT', 'sc-action|Il pleut.', 'sc-char|CLAIRE', 'sc-dial|Enfin.', 'sc-scene|INT. GARE - JOUR']);
    const outline = await page.evaluate(() => SE.modes.get('scenario').outline(SE.editor.blocks()).map(x => x.num));
    assert.deepStrictEqual(outline, [1, 2, 3]);
    const f = await page.evaluate(() => { SE.app.flush(); return SE.exporter.toFountain(SE.app.project, {}); });
    assert.match(f, /\nEXT\. PARC – NUIT\n\nIl pleut\.\n\nCLAIRE\nEnfin\.\n/);
  });

  await t('théâtre : répliques, didascalies, décompte par personnage', async () => {
    await open('theatre', 'Pièce');
    await caretAtEnd();
    await page.keyboard.press('Enter');
    await page.keyboard.type('hé');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.keyboard.type('On brûle tout ?');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Scène 2');
    assert.deepStrictEqual(await lastBlocks(3), ['th-char|Hélène', 'th-rep|On brûle tout ?', 'th-scene|Scène 2']);
    const cast = await page.evaluate(() => SE.editor.castStats(SE.editor.blocks()).map(([k, v]) => k + ':' + v.lines));
    assert.deepStrictEqual(cast, ['HÉLÈNE:2', 'BASTIEN:1']);
  });

  await t('roman : typographie française', async () => {
    await open('roman', 'Roman');
    await page.evaluate(() => SE.settings.set('editor.frTypo', 'fr'));
    await caretAtEnd();
    await page.keyboard.type('Il dit : "C\'est l\'heure !" -- puis... rien ?');
    assert.strictEqual(await page.evaluate(() => SE.editor.ed.textContent), 'Il dit\u00A0: «\u00A0C’est l’heure\u202F!\u00A0» — puis… rien\u202F?');
    await page.keyboard.press('Control+2');
    assert.strictEqual(await page.evaluate(() => SE.editor.ed.firstElementChild.tagName), 'H1');
  });

  await t('roman : recherche et remplacement dans tout le projet, avec instantané', async () => {
    await page.evaluate(() => { SE.editor.ed.innerHTML = '<p>Le chat dort. Le chat rêve.</p>'; SE.editor.afterChange(); });
    await page.keyboard.press('Control+f');
    await page.keyboard.type('chat');
    assert.strictEqual(await page.textContent('.find-count'), '1 / 2');
    await page.click('.find-row.opts label:nth-child(3)');
    await page.fill('.find input[placeholder="Remplacer par…"]', 'matou');
    await page.click('.find button:has-text("Tout")');
    await page.click('.modal-foot button:has-text("Tout remplacer")');
    await page.waitForTimeout(100);
    assert.strictEqual(await page.evaluate(() => SE.editor.ed.textContent), 'Le matou dort. Le matou rêve.');
    assert.strictEqual(await page.evaluate(() => Object.values(SE.app.project.snapshots)[0].length), 1);
    await page.keyboard.press('Escape');
  });

  await t('dialogues interactifs : créer, relier, tester', async () => {
    await open('interactif', 'Taverne');
    const box = await page.locator('.g-canvas').boundingBox();
    await page.mouse.dblclick(box.x + box.width - 140, box.y + box.height - 90);
    assert.strictEqual(await page.evaluate(() => SE.graph.g.nodes.length), 5);
    await page.click('.g-node.sel .g-add');
    const pb = await page.locator('.g-node.sel .g-port').boundingBox();
    const tb = await page.locator('.g-node.start .g-head').boundingBox();
    await page.mouse.move(pb.x + 5, pb.y + 5); await page.mouse.down();
    await page.mouse.move(tb.x + 40, tb.y + 10, { steps: 6 }); await page.mouse.up();
    assert.ok(await page.evaluate(() => SE.graph.node(SE.graph.sel).choices[0].target === SE.graph.g.start));
    await page.click('text=▶ Tester');
    await page.click('.play-choice >> nth=0');
    assert.match(await page.textContent('.play-vars'), /argent = 8/);
    await page.keyboard.press('Escape');
  });

  await t('persistance après rechargement', async () => {
    await page.evaluate(() => SE.app.persist());
    await page.reload();
    await page.waitForFunction(() => SE.app.project);
    assert.strictEqual(await page.evaluate(() => SE.app.project.title), 'Taverne');
    assert.strictEqual(await page.evaluate(() => SE.projects.list().length), 4);
  });

  await t('mode zen', async () => {
    await page.keyboard.press('Control+Shift+f');
    assert.ok(await page.evaluate(() => document.body.classList.contains('zen') && document.getElementById('center').getBoundingClientRect().width > 1000));
    await page.keyboard.press('Escape');
  });

  assert.deepStrictEqual(errors, []);
  console.log(`\n${n} tests réussis.`);
  await browser.close();
  server.close();
})().catch(async (e) => { console.error(e); process.exit(1); });

/* Outils partagés : stockage, bus d'événements, constructeur DOM, toast, téléchargements. */
(function () {
  'use strict';
  const NS = (window.SE = window.SE || {});

  /* ---------- petit stockage clé/valeur (localStorage, chaque accès protégé) ---------- */
  NS.store = {
    prefix: 'se.',
    get(key, fallback) {
      try { const v = localStorage.getItem(this.prefix + key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem(this.prefix + key); } catch (e) { /* ignore */ } },
  };

  /* ---------- IndexedDB (projets complets) avec repli sur localStorage ---------- */
  NS.idb = (function () {
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        if (!window.indexedDB) { rej(new Error('no idb')); return; }
        const r = indexedDB.open('station-ecriture', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      dbp.catch(() => { /* repli */ });
      return dbp;
    }
    const tx = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction('kv', mode);
      const req = fn(t.objectStore('kv'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    }));
    return {
      get: (k) => tx('readonly', s => s.get(k)).catch(() => NS.store.get('idb.' + k, undefined)),
      set: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => { if (!NS.store.set('idb.' + k, v)) throw new Error('quota'); }),
      del: (k) => tx('readwrite', s => s.delete(k)).catch(() => NS.store.remove('idb.' + k)),
    };
  })();

  /* ---------- bus d'événements ---------- */
  NS.bus = (function () {
    const map = {};
    return {
      on(evt, fn) { (map[evt] = map[evt] || []).push(fn); return () => { map[evt] = map[evt].filter(f => f !== fn); }; },
      emit(evt, ...args) { (map[evt] || []).slice().forEach(fn => { try { fn(...args); } catch (err) { console.error(err); } }); },
    };
  })();

  /* ---------- DOM ---------- */
  NS.$ = (sel, root) => (root || document).querySelector(sel);
  NS.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Mini hyperscript : h('div.cls#id', {onclick, style:{}, dataset:{}}, ...enfants) */
  NS.h = function (tag, props, ...kids) {
    const m = /^([a-z0-9-]+)((?:[.#][\w-]+)*)/i.exec(tag);
    if (props != null && (typeof props !== 'object' || props.nodeType || Array.isArray(props))) { kids.unshift(props); props = null; }
    const el = document.createElement(m ? m[1] : 'div');
    if (m && m[2]) m[2].replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') el.classList.add(v); else el.id = v; });
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') v.split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
        else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k in el && k !== 'list' && typeof v !== 'object') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (kid) => {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(add);
      else el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
    };
    kids.forEach(add);
    return el;
  };

  /* ---------- divers ---------- */
  NS.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  NS.pad2 = (n) => String(n).padStart(2, '0');
  NS.fmtTime = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${NS.pad2(m)}:${NS.pad2(s)}` : `${m}:${NS.pad2(s)}`;
  };
  NS.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  NS.debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; return d; };
  NS.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  NS.today = () => { const d = new Date(); return `${d.getFullYear()}-${NS.pad2(d.getMonth() + 1)}-${NS.pad2(d.getDate())}`; };
  NS.fmtNum = (n) => Number(n || 0).toLocaleString('fr-CA');
  NS.fmtDate = (t) => new Date(t).toLocaleString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  NS.norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /** Compte de mots (gère les apostrophes françaises et les tirets). */
  NS.countWords = (text) => {
    const m = String(text || '').match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu);
    return m ? m.length : 0;
  };
  /** Texte brut d'un fragment HTML (avec sauts de ligne entre blocs). */
  NS.htmlToText = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    d.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    return Array.from(d.childNodes).map(n => n.textContent).join('\n');
  };

  NS.download = (name, content, type) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const a = NS.h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  NS.pickFile = (accept) => new Promise((res) => {
    const i = NS.h('input', { type: 'file', accept, style: 'display:none' });
    i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); });
    document.body.appendChild(i); i.click();
  });
  NS.slug = (s) => NS.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet';

  /* ---------- toast ---------- */
  NS.toast = function (msg, ms = 2600) {
    let host = document.getElementById('toasts');
    if (!host) { host = NS.h('div#toasts', { 'aria-live': 'polite' }); document.body.appendChild(host); }
    if (Array.from(host.children).some(c => c.textContent === msg)) return;
    const t = NS.h('div.toast', null, msg);
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 350); }, ms);
  };

  /* ---------- boîtes de dialogue (modales légères) ---------- */
  NS.modal = function ({ title, body, actions, wide, onclose, cls }) {
    const back = NS.h('div.modal-back');
    const close = () => { back.remove(); document.removeEventListener('keydown', esc, true); if (onclose) onclose(); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const box = NS.h('div.modal' + (wide ? '.wide' : '') + (cls ? '.' + cls : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      NS.h('header.modal-head', null, NS.h('h2', null, title), NS.h('button.ico', { title: 'Fermer', 'aria-label': 'Fermer', onclick: close }, '✕')),
      NS.h('div.modal-body', null, body),
      actions && actions.length ? NS.h('footer.modal-foot', null, actions.map(a => NS.h('button.btn' + (a.primary ? '.primary' : '') + (a.danger ? '.danger' : ''), { onclick: () => { if (a.run && a.run() === false) return; close(); } }, a.label))) : null);
    back.appendChild(box);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', esc, true);
    document.body.appendChild(back);
    const f = box.querySelector('[autofocus], input, textarea, select');
    if (f) setTimeout(() => f.focus(), 30);
    return { close, box };
  };
  NS.ask = (title, label, value, opts) => new Promise((res) => {
    const input = NS.h(opts && opts.multiline ? 'textarea.text' : 'input.text', { value: value || '', placeholder: (opts && opts.placeholder) || '', rows: 4,
      onkeydown: (e) => { if (e.key === 'Enter' && !(opts && opts.multiline)) { done = true; res(input.value); m.close(); } } });
    let done = false;
    const m = NS.modal({ title, body: [label ? NS.h('label.field-label', null, label) : null, input],
      actions: [{ label: 'Annuler' }, { label: (opts && opts.ok) || 'OK', primary: true, run: () => { done = true; res(input.value); } }],
      onclose: () => { if (!done) res(null); } });
    setTimeout(() => { input.focus(); input.select && input.select(); }, 40);
  });
  NS.confirm = (title, text, okLabel) => new Promise((res) => {
    let done = false;
    NS.modal({ title, body: NS.h('p', null, text), actions: [{ label: 'Annuler' }, { label: okLabel || 'Confirmer', danger: true, primary: false, run: () => { done = true; res(true); } }],
      onclose: () => { if (!done) res(false); } });
  });

  /* ---------- menus contextuels ---------- */
  NS.menu = function (x, y, items) {
    NS.$$('.ctx-menu').forEach(m => m.remove());
    const m = NS.h('div.ctx-menu', { role: 'menu' }, items.filter(Boolean).map(it => it === '-' ? NS.h('hr') :
      NS.h('button' + (it.danger ? '.danger' : ''), { role: 'menuitem', disabled: it.disabled, onclick: () => { m.remove(); it.run(); } }, it.icon ? NS.h('span.mi-ico', null, it.icon) : null, it.label, it.hint ? NS.h('kbd', null, it.hint) : null)));
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 6)) + 'px';
    m.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 6)) + 'px';
    const off = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } };
    setTimeout(() => document.addEventListener('mousedown', off, true), 0);
    const first = m.querySelector('button'); if (first) first.focus();
    m.addEventListener('keydown', (e) => {
      const bs = NS.$$('button:not(:disabled)', m), i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (bs[i + 1] || bs[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (bs[i - 1] || bs[bs.length - 1]).focus(); }
      else if (e.key === 'Escape') m.remove();
    });
    return m;
  };
})();

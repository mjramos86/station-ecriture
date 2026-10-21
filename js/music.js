/*
 * Lecteur de musique (repris de solitaire n’ chill) : collez un lien et écrivez en musique.
 *
 *   YouTube / YouTube Music  – IFrame API (play/pause, volume, playlists)
 *   SoundCloud               – Widget API (play/pause, volume)
 *   Spotify, Apple Music, Deezer, Mixcloud, Vimeo, Twitch – official embeds
 *   Direct audio files & internet-radio streams – native <audio>
 *   Anything else            – tried as audio first, then as a plain embedded page
 *
 * Embeds are created only after the player is asked to play (a user gesture), never on page load.
 */
(function () {
  'use strict';
  const NS = window.SE;
  const { h, clamp } = NS;

  /* ================================================================ link parsing */
  const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(?:$|[?#])/i;

  function parseTime(t) {
    if (!t) return 0;
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  }

  function toURL(input) {
    let s = String(input || '').trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    try { return new URL(s); } catch (e) { return null; }
  }

  /** Returns { kind, ...data, url } or null if it doesn't look like a link at all. */
  function parseLink(input) {
    const raw = String(input || '').trim();
    const uri = /^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]+)$/.exec(raw);
    if (uri) return { kind: 'spotify', type: uri[1], id: uri[2], url: raw };
    const u = toURL(raw);
    if (!u || !/^https?:$/.test(u.protocol) || !(/\./.test(u.hostname) || u.hostname === 'localhost' || u.hostname.includes(':'))) return null;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname;
    const url = u.href;

    if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) {
      let vid = null;
      let list = u.searchParams.get('list');
      if (host === 'youtu.be') vid = path.slice(1).split('/')[0];
      else if (path === '/watch') vid = u.searchParams.get('v');
      else { const m = /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(path); if (m) vid = m[1]; }
      if (vid && !/^[\w-]{11}$/.test(vid)) vid = null;
      if (list && /^(RD|UL)/.test(list)) list = null; // auto-generated mixes can't be embedded as playlists
      if (!vid && !list) return null;
      return { kind: 'youtube', vid, list, start: parseTime(u.searchParams.get('t') || u.searchParams.get('start')), url };
    }
    if (host === 'open.spotify.com' || host === 'play.spotify.com') {
      const m = /\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/.exec(path);
      if (m) return { kind: 'spotify', type: m[1], id: m[2], url };
    }
    if (host === 'soundcloud.com' || host === 'm.soundcloud.com') {
      if (path.split('/').filter(Boolean).length >= 1) return { kind: 'soundcloud', url: url.replace('//m.', '//') };
    }
    if (host === 'music.apple.com' || host === 'embed.music.apple.com') {
      return { kind: 'apple', embed: url.replace(/\/\/(?:embed\.)?music\.apple\.com/, '//embed.music.apple.com'), single: /[?&]i=/.test(url), url };
    }
    if (host === 'deezer.com' || host === 'deezer.page.link') {
      const m = /\/(track|album|playlist|artist)\/(\d+)/.exec(path);
      if (m) return { kind: 'deezer', type: m[1], id: m[2], url };
    }
    if (host === 'mixcloud.com') {
      if (path.split('/').filter(Boolean).length >= 2) return { kind: 'mixcloud', feed: path, url };
    }
    if (host === 'vimeo.com') {
      const m = /\/(\d+)/.exec(path);
      if (m) return { kind: 'vimeo', id: m[1], url };
    }
    if (host === 'twitch.tv') {
      const v = /\/videos\/(\d+)/.exec(path);
      if (v) return { kind: 'twitch', video: v[1], url };
      const c = /^\/([A-Za-z0-9_]+)\/?$/.exec(path);
      if (c) return { kind: 'twitch', channel: c[1], url };
    }
    if (AUDIO_EXT.test(path + u.search)) return { kind: 'audio', url };
    return { kind: 'web', url }; // unknown service: try as a stream, fall back to embedding the page
  }

  const tr = (...a) => NS.t(...a);
  const BRAND = { youtube: 'YouTube', spotify: 'Spotify', soundcloud: 'SoundCloud', apple: 'Apple Music', deezer: 'Deezer', mixcloud: 'Mixcloud', vimeo: 'Vimeo', twitch: 'Twitch' };
  const kindLabel = (kind) => BRAND[kind] || (kind === 'audio' ? tr('mp.kind.audio') : kind === 'web' ? tr('mp.kind.web') : '');
  const KIND_ICON = { youtube: '▶', spotify: '●', soundcloud: '☁', apple: '♪', deezer: '♫', mixcloud: '☾', vimeo: '▷', twitch: '◆', audio: '♬', web: '◌' };

  function fallbackTitle(item) {
    const k = kindLabel(item.kind) || 'Link';
    if (item.kind === 'spotify') return tr('mp.ft.spotify', { type: tr('mp.sp.' + item.type) === 'mp.sp.' + item.type ? item.type : tr('mp.sp.' + item.type) });
    if (item.kind === 'youtube') return tr(item.vid ? 'mp.ft.ytVideo' : 'mp.ft.ytList');
    if (item.kind === 'audio' || item.kind === 'web') {
      try {
        const u = new URL(item.url);
        const f = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
        return f ? f.replace(/\.[a-z0-9]{2,5}$/i, '') : u.hostname;
      } catch (e) { return k; }
    }
    return tr('mp.ft.link', { k });
  }

  /* best-effort title lookup (all failures are silent) */
  async function lookupTitle(item) {
    const endpoints = [];
    if (item.kind === 'spotify') endpoints.push('https://open.spotify.com/oembed?url=' + encodeURIComponent(item.url));
    if (['youtube', 'soundcloud', 'vimeo', 'mixcloud'].includes(item.kind)) endpoints.push('https://noembed.com/embed?url=' + encodeURIComponent(item.url));
    for (const ep of endpoints) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(ep, { signal: ctl.signal });
        clearTimeout(t);
        if (!r.ok) continue;
        const j = await r.json();
        if (j && j.title) return String(j.title);
      } catch (e) { /* try next */ }
    }
    return null;
  }

  /* ================================================================ script loaders */
  let ytPromise = null, scPromise = null;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  function ytAPI() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (ytPromise) return ytPromise;
    ytPromise = new Promise((res, rej) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(window.YT); };
      loadScript('https://www.youtube.com/iframe_api').catch((e) => { ytPromise = null; rej(e); });
      setTimeout(() => { if (!(window.YT && window.YT.Player)) { ytPromise = null; rej(new Error('YouTube API timed out')); } }, 12000);
    });
    return ytPromise;
  }
  function scAPI() {
    if (window.SC && window.SC.Widget) return Promise.resolve(window.SC);
    if (!scPromise) scPromise = loadScript('https://w.soundcloud.com/player/api.js').then(() => window.SC).catch((e) => { scPromise = null; throw e; });
    return scPromise;
  }

  const IFRAME_ALLOW = 'autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture';
  function iframe(src, extra) {
    return h('iframe', Object.assign({ src, allow: IFRAME_ALLOW, allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin', frameborder: '0', title: tr('mp.title') }, extra || {}));
  }

  /* ================================================================ engines
     engine = { el, height|ratio, controllable, volume, play(), pause(), next(), prev(), seek(), setVolume(v), destroy() }
     cb     = { state(playing), title(str), ended(), error(msg), time(t,d), useNative(bool) } */

  function youtubeEngine(item, cb, vol) {
    const host = h('div');
    const wrap = h('div.yt-wrap', null, host);
    let player = null, ready = false, wantPlay = true, dead = false, fallbackFrame = null;

    const eng = {
      el: wrap, ratio: '16 / 9', controllable: true, nativeNav: !!item.list,
      play() { if (player && ready) player.playVideo(); else wantPlay = true; },
      pause() { wantPlay = false; if (player && ready) player.pauseVideo(); },
      next() { if (player && ready && item.list) player.nextVideo(); },
      prev() { if (player && ready && item.list) player.previousVideo(); },
      setVolume(v) { if (player && ready) { try { player.setVolume(v); } catch (e) { /* ignore */ } } },
      destroy() { dead = true; try { player && player.destroy(); } catch (e) { /* ignore */ } wrap.remove(); },
    };

    const vars = { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, start: item.start || undefined };
    if (item.list) { vars.list = item.list; vars.listType = 'playlist'; }
    if (/^https?:$/.test(location.protocol)) vars.origin = location.origin;

    ytAPI().then((YT) => {
      if (dead) return;
      player = new YT.Player(host, {
        width: '100%', height: '100%', videoId: item.vid || undefined, playerVars: vars,
        events: {
          onReady: (e) => {
            ready = true;
            e.target.setVolume(vol());
            if (wantPlay) e.target.playVideo();
          },
          onStateChange: (e) => {
            const S = YT.PlayerState;
            if (e.data === S.PLAYING) cb.state(true);
            else if (e.data === S.PAUSED) cb.state(false);
            else if (e.data === S.ENDED) { cb.state(false); if (!item.list) cb.ended(); }
            if (e.data === S.PLAYING || e.data === S.CUED) {
              try { const d = e.target.getVideoData(); if (d && d.title) cb.title(d.title); } catch (err) { /* ignore */ }
            }
          },
          onError: (e) => {
            const code = e.data;
            if (code === 101 || code === 150 || code === 153) cb.error('mp.errEmbed');
            else if (code === 100) cb.error('mp.errRemoved');
            else if (code === 2) cb.error('mp.errInvalid');
            else cb.error('mp.errYt', { code });
          },
        },
      });
    }).catch(() => {
      if (dead) return;
      // API blocked/offline: fall back to a bare embed (you lose volume / play buttons but music still plays)
      const q = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1' });
      if (item.start) q.set('start', item.start);
      let src;
      if (item.list) { q.set('list', item.list); src = `https://www.youtube-nocookie.com/embed/${item.vid || 'videoseries'}?${q}`; }
      else src = `https://www.youtube-nocookie.com/embed/${item.vid}?${q}`;
      fallbackFrame = iframe(src);
      wrap.innerHTML = '';
      wrap.appendChild(fallbackFrame);
      eng.controllable = false;
      cb.useNative(false);
    });
    return eng;
  }

  function soundcloudEngine(item, cb, vol) {
    const q = new URLSearchParams({ url: item.url, auto_play: 'true', hide_related: 'true', show_comments: 'false', show_user: 'true', show_reposts: 'false', visual: 'false' });
    const frame = iframe('https://w.soundcloud.com/player/?' + q, { allow: 'autoplay' });
    const isSet = /\/sets\//.test(item.url);
    let w = null, dead = false;
    const eng = {
      el: frame, height: isSet ? 300 : 166, controllable: false, nativeNav: isSet,
      play() { w && w.play(); }, pause() { w && w.pause(); },
      next() { w && w.next(); }, prev() { w && w.prev(); },
      setVolume(v) { w && w.setVolume(v); },
      destroy() { dead = true; frame.remove(); },
    };
    scAPI().then((SC) => {
      if (dead) return;
      w = SC.Widget(frame);
      const E = SC.Widget.Events;
      w.bind(E.READY, () => { w.setVolume(vol()); eng.controllable = true; cb.useNative(true); w.getCurrentSound((s) => s && s.title && cb.title(s.title)); });
      w.bind(E.PLAY, () => { cb.state(true); w.getCurrentSound((s) => s && s.title && cb.title(s.title)); });
      w.bind(E.PAUSE, () => cb.state(false));
      w.bind(E.FINISH, () => { if (!isSet) cb.ended(); });
    }).catch(() => { /* embed still works with its own controls */ });
    return eng;
  }

  function audioEngine(item, cb, vol) {
    const a = new Audio();
    a.preload = 'none';
    a.src = item.url;
    a.volume = vol() / 100;
    let started = false, dead = false, gaveUp = null;
    const eng = {
      el: null, controllable: true, hasSeek: true, nativeNav: false,
      play() { a.play().catch((err) => { if (err && err.name === 'NotAllowedError') cb.error('mp.errPress'); }); },
      pause() { a.pause(); },
      seek(t) { if (isFinite(a.duration)) a.currentTime = clamp(t, 0, a.duration); },
      setVolume(v) { a.volume = clamp(v / 100, 0, 1); },
      destroy() { dead = true; clearTimeout(gaveUp); a.pause(); a.removeAttribute('src'); a.load(); },
    };
    a.addEventListener('playing', () => { started = true; clearTimeout(gaveUp); cb.state(true); });
    a.addEventListener('pause', () => cb.state(false));
    a.addEventListener('ended', () => cb.ended());
    a.addEventListener('timeupdate', () => cb.time(a.currentTime, isFinite(a.duration) ? a.duration : 0));
    a.addEventListener('loadedmetadata', () => cb.time(a.currentTime, isFinite(a.duration) ? a.duration : 0));
    a.addEventListener('error', () => {
      if (dead) return;
      if (item.kind === 'web' && !started) cb.fallbackToEmbed();
      else cb.error('mp.errAudio');
    });
    if (item.kind === 'web') gaveUp = setTimeout(() => { if (!started && !dead) { a.pause(); cb.fallbackToEmbed(); } }, 7000);
    return eng;
  }

  function embedEngine(item, cb) {
    let src, height = 152, ratio = null;
    switch (item.kind) {
      case 'spotify':
        src = `https://open.spotify.com/embed/${item.type}/${item.id}?utm_source=generator`;
        height = (item.type === 'track' || item.type === 'episode') ? 152 : 352; break;
      case 'apple': src = item.embed; height = item.single ? 175 : 450; break;
      case 'deezer': src = `https://widget.deezer.com/widget/dark/${item.type}/${item.id}`; height = item.type === 'track' ? 150 : 300; break;
      case 'mixcloud': src = `https://www.mixcloud.com/widget/iframe/?hide_cover=1&light=0&autoplay=1&feed=${encodeURIComponent(item.feed)}`; height = 120; break;
      case 'vimeo': src = `https://player.vimeo.com/video/${item.id}?autoplay=1`; ratio = '16 / 9'; break;
      case 'twitch':
        src = item.video
          ? `https://player.twitch.tv/?video=${item.video}&parent=${location.hostname}&autoplay=true`
          : `https://player.twitch.tv/?channel=${item.channel}&parent=${location.hostname}&autoplay=true`;
        ratio = '16 / 9'; break;
      default: src = item.url; height = 260; // generic page
    }
    // unknown pages get a sandbox so they cannot navigate this page away
    const frame = iframe(src, item.kind === 'web' ? { sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation' } : null);
    return {
      el: frame, height, ratio, controllable: false, nativeNav: false,
      play() {}, pause() {}, setVolume() {}, destroy() { frame.remove(); },
    };
  }

  /* ================================================================ the player */
  const EXAMPLES = [
    { label: 'mp.ex1', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
    { label: 'mp.ex2', url: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn' },
    { label: 'mp.ex3', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  ];

  const Music = {
    items: [],      // [{url, kind, title}]
    cur: -1,
    volume: 60,
    repeat: 'all',  // 'off' | 'all' | 'one'
    engine: null,
    playing: false,
    open: false,
    ui: {},

    init(mount, barMount) {
      this.barMount = barMount;
      const saved = NS.store.get('music', {});
      this.items = (saved.items || []).filter(i => i && i.url && parseLink(i.url));
      this.cur = this.items.length && saved.cur >= 0 && saved.cur < this.items.length ? saved.cur : -1;
      this.volume = saved.volume == null ? 60 : clamp(saved.volume, 0, 100);
      this.repeat = saved.repeat || 'all';
      this.build(mount);
      this.renderQueue();
      this.renderBar();
      document.addEventListener('paste', (e) => this.onGlobalPaste(e));
      NS.bus.on('lang', () => this.relang());
    },

    save() { NS.store.set('music', { items: this.items.slice(0, 60), cur: this.cur, volume: this.volume, repeat: this.repeat }); NS.bus.emit('music'); },

    /** Data pulled from the account: replace the list but never interrupt what is playing. */
    applyRemote(d) {
      const playing = this.engine ? this.items[this.cur] : null;
      this.items = (d.items || []).filter(i => i && i.url && parseLink(i.url));
      if (d.volume != null) this.volume = clamp(d.volume, 0, 100);
      if (d.repeat) this.repeat = d.repeat;
      if (playing) {
        let idx = this.items.findIndex(i => i.url === playing.url);
        if (idx < 0) { this.items.push(playing); idx = this.items.length - 1; }
        this.cur = idx;
      } else this.cur = this.items.length && d.cur >= 0 && d.cur < this.items.length ? d.cur : -1;
      this.ui.vol.value = this.volume;
      if (this.engine) this.engine.setVolume(this.volume);
      this.renderQueue(); this.renderBar();
    },

    /* ---------------------------------------------------------- UI */
    build(mount) {
      const u = this.ui;
      u.root = mount;
      u.input = h('input.mp-input', { type: 'text', spellcheck: false, autocomplete: 'off',
        onkeydown: (e) => { if (e.key === 'Enter') this.submit(true); e.stopPropagation(); },
        onfocus: () => { clearTimeout(this._typingT); this.ui.root.classList.add('typing'); },
        onblur: () => { // wait a beat: tapping Play / ✕ blurs the field first, and moving the panel now would make the tap miss
          clearTimeout(this._typingT);
          this._typingT = setTimeout(() => { if (document.activeElement !== this.ui.input) { this.ui.root.classList.remove('typing'); window.scrollTo(0, 0); } }, 350);
        } });
      u.msg = h('div.mp-msg', { role: 'status' });
      u.embed = h('div.mp-embed');
      u.title = h('div.mp-now-title');
      u.sub = h('div.mp-now-sub', null, '');
      u.play = h('button.ico.mp-play', { onclick: () => this.toggle() }, '▶');
      u.prev = h('button.ico', { onclick: () => this.step(-1) }, '⏮');
      u.next = h('button.ico', { onclick: () => this.step(1) }, '⏭');
      u.repeatBtn = h('button.ico.small', { onclick: () => this.cycleRepeat() });
      u.vol = h('input.range.mp-vol', { type: 'range', min: 0, max: 100, value: this.volume, oninput: (e) => this.setVolume(+e.target.value) });
      u.seek = h('input.range.mp-seek', { type: 'range', min: 0, max: 1000, value: 0, oninput: (e) => { if (this.engine && this.engine.seek && this.dur) this.engine.seek(e.target.value / 1000 * this.dur); } });
      u.time = h('span.mp-time', null, '');
      u.queue = h('div.mp-queue');
      u.hintP = h('p');
      u.exChips = EXAMPLES.map(ex => h('button.chip', { onclick: () => { u.input.value = ex.url; this.submit(true); } }));
      u.hint = h('div.mp-hint', null, u.hintP, h('div.mp-examples', null, u.exChips));

      u.panel = h('div.music-panel', { 'aria-hidden': 'true' },
        h('div.mp-head', null, u.headTitle = h('strong'), u.closeBtn = h('button.ico.small', { onclick: () => this.setOpen(false) }, '✕')),
        h('div.mp-addrow', null, u.input,
          u.playTxt = h('button.btn.primary', { onclick: () => this.submit(true) }),
          u.addBtn = h('button.btn', { onclick: () => this.submit(false) }, '＋')),
        u.msg, u.embed,
        h('div.mp-controls', null, u.prev, u.play, u.next, u.repeatBtn, h('span.mp-vol-wrap', null, h('span.vol-ico', '🔊'), u.vol)),
        h('div.mp-seekrow', null, u.seek, u.time),
        u.queue, u.hint);

      u.barIcon = h('span.mp-bar-icon', null, '♪');
      u.barTitle = h('span.mp-bar-title');
      u.barPlay = h('button.ico.mp-play', { onclick: (e) => { e.stopPropagation(); this.toggle(); } }, '▶');
      u.barNext = h('button.ico', { onclick: (e) => { e.stopPropagation(); this.step(1); } }, '⏭');
      u.bar = h('div.music-bar', { role: 'button', tabindex: 0,
        onclick: () => this.setOpen(!this.open), onkeydown: (e) => { if (e.key === 'Enter' && e.target === u.bar) this.setOpen(!this.open); } },
      u.barIcon, h('span.mp-bar-text', null, u.barTitle), u.barPlay, u.barNext, h('span.mp-caret', '⌃'));

      mount.append(u.panel);
      (this.barMount || mount).append(u.bar);
      this.labels();
    },

    /** every fixed label of the player, in the current language */
    labels() {
      const u = this.ui;
      const tip = (el, title, aria) => { el.title = title; el.setAttribute('aria-label', aria || title); };
      u.input.placeholder = tr('mp.ph'); u.input.setAttribute('aria-label', tr('mp.aria'));
      tip(u.play, tr('mp.playPause'), tr('mp.playPauseAria')); tip(u.barPlay, tr('mp.playPause'), tr('mp.playPauseAria'));
      tip(u.prev, tr('mp.prev')); tip(u.next, tr('mp.next')); tip(u.barNext, tr('mp.next'));
      u.repeatBtn.setAttribute('aria-label', tr('mp.repeatAria'));
      u.vol.setAttribute('aria-label', tr('mp.volume')); u.seek.setAttribute('aria-label', tr('mp.seek'));
      u.headTitle.textContent = tr('mp.title'); tip(u.closeBtn, tr('btn.close'), tr('mp.closeAria'));
      u.playTxt.textContent = tr('mp.play'); u.addBtn.title = tr('mp.addTip'); u.addBtn.setAttribute('aria-label', tr('mp.addTip'));
      u.bar.setAttribute('aria-label', tr('mp.openAria'));
      u.hintP.textContent = tr('mp.hint');
      u.exChips.forEach((c, i) => { c.textContent = tr(EXAMPLES[i].label); });
    },

    /** the language changed: redraw labels, the current message, the bar and the list – playback is untouched */
    relang() {
      if (!this.ui.root) return;
      this.labels();
      this.setMsg(this.msgKey, this.msgKind, this.msgParams);
      this.renderBar(); this.renderQueue();
      if (!this.dur && this.pos) this.onTime(this.pos, 0);
    },

    /** ici, le lecteur vit dans un widget : « ouvrir » = afficher le widget */
    setOpen(v) {
      this.open = false;
      this.ui.panel.setAttribute('aria-hidden', 'false');
      if (v && NS.widgets) NS.widgets.reveal('music');
      if (v) setTimeout(() => { if (!this.items.length) this.ui.input.focus(); }, 120);
    },

    /** show a message by language key (kept so it can be re-translated) */
    setMsg(key, kind, params) {
      this.msgKey = key || ''; this.msgKind = kind; this.msgParams = params;
      this.ui.msg.textContent = key ? tr(key, params) : '';
      this.ui.msg.className = 'mp-msg' + (key ? ' show ' + (kind || '') : '');
    },

    renderBar() {
      const u = this.ui, it = this.items[this.cur];
      u.barTitle.textContent = it ? (it.title || fallbackTitle(parseLink(it.url) || { kind: 'web', url: it.url })) : tr('mp.barEmpty');
      u.title.textContent = it ? u.barTitle.textContent : tr('mp.nothing');
      u.sub.textContent = it ? kindLabel(it.kind) : '';
      u.barIcon.textContent = it ? (KIND_ICON[it.kind] || '♪') : '♪';
      const glyph = this.playing ? '⏸' : '▶';
      u.play.textContent = glyph; u.barPlay.textContent = glyph;
      u.root.classList.toggle('playing', this.playing);
      const e = this.engine;
      const ctl = !!(e && e.controllable);
      u.root.classList.toggle('no-ctl', !!e && !ctl);
      u.vol.disabled = !ctl;
      u.root.classList.toggle('has-seek', !!(e && e.hasSeek));
      u.repeatBtn.textContent = this.repeat === 'one' ? '🔂' : '🔁';
      u.repeatBtn.classList.toggle('off', this.repeat === 'off');
      u.repeatBtn.title = tr('mp.repeatState', { mode: tr('mp.rep.' + (this.repeat === 'one' || this.repeat === 'off' ? this.repeat : 'all')) });
      u.hint.style.display = this.items.length ? 'none' : '';
    },

    renderQueue() {
      const u = this.ui;
      u.queue.innerHTML = '';
      this.items.forEach((it, i) => {
        const label = it.title || fallbackTitle(parseLink(it.url) || { kind: 'web', url: it.url });
        u.queue.appendChild(h('div.mp-row' + (i === this.cur ? '.cur' : ''), { onclick: () => this.playIndex(i), title: it.url },
          h('span.mp-row-ico', null, KIND_ICON[it.kind] || '♪'),
          h('span.mp-row-title', null, label),
          h('span.mp-row-kind', null, kindLabel(it.kind)),
          h('button.ico.small', { title: tr('mp.remove'), 'aria-label': tr('mp.removeAria', { label }), onclick: (e) => { e.stopPropagation(); this.remove(i); } }, '✕')));
      });
    },

    /* ---------------------------------------------------------- queue operations */
    submit(playNow) {
      const text = this.ui.input.value.trim();
      if (!text) { this.setMsg('mp.pasteFirst', 'warn'); return; }
      if (!this.addLink(text, playNow)) return;
      this.ui.input.value = '';
    },

    addLink(text, playNow) {
      const parsed = parseLink(text);
      if (!parsed) {
        this.setMsg('mp.badLink', 'warn');
        return false;
      }
      this.setMsg('');
      let idx = this.items.findIndex(i => i.url === parsed.url);
      if (idx < 0) {
        this.items.push({ url: parsed.url, kind: parsed.kind, title: '' });
        idx = this.items.length - 1;
        const item = this.items[idx];
        lookupTitle(parsed).then((t) => { if (t && this.items.includes(item) && !item.title) { item.title = t; this.save(); this.renderQueue(); this.renderBar(); } });
      }
      this.save();
      this.renderQueue();
      if (playNow) this.playIndex(idx); else { this.renderBar(); NS.toast(tr('toast.added')); }
      return true;
    },

    remove(i) {
      const wasCur = i === this.cur;
      this.items.splice(i, 1);
      if (wasCur) { this.stopEngine(); this.cur = -1; }
      else if (i < this.cur) this.cur--;
      this.save(); this.renderQueue(); this.renderBar();
    },

    onGlobalPaste(e) {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
      if (!/^\s*(https?:\/\/|spotify:)\S+\s*$/i.test(text)) return;
      if (this.addLink(text, true)) { e.preventDefault(); NS.toast(tr('toast.pasted')); }
    },

    /* ---------------------------------------------------------- playback */
    stopEngine() {
      if (this.engine) { try { this.engine.destroy(); } catch (e) { /* ignore */ } }
      this.engine = null;
      this.playing = false;
      this.dur = 0;
      this.ui.embed.innerHTML = '';
      this.ui.embed.style.height = '';
      this.ui.embed.classList.remove('has');
      this.ui.time.textContent = '';
      this.ui.seek.value = 0;
    },

    playIndex(i) {
      const it = this.items[i];
      if (!it) return;
      this.cur = i;
      this.save();
      this.renderQueue();
      const parsed = parseLink(it.url);
      if (!parsed) { this.setMsg('mp.cantPlay', 'warn'); return; }
      this.startItem(it, parsed);
    },

    startItem(it, parsed, forceEmbed) {
      this.stopEngine();
      this.setMsg('');
      const cb = {
        state: (p) => { this.playing = p; this.renderBar(); },
        title: (t) => { if (t && it.title !== t) { it.title = t; this.save(); this.renderQueue(); this.renderBar(); } },
        ended: () => this.onEnded(),
        error: (m, p) => { this.setMsg(m, 'warn', p); this.playing = false; this.renderBar(); },
        time: (t, d) => this.onTime(t, d),
        useNative: () => this.renderBar(),
        fallbackToEmbed: () => { if (this.items[this.cur] === it) this.startItem(it, { ...parsed, kind: 'web' }, true); },
      };
      const vol = () => this.volume;
      let eng;
      switch (parsed.kind) {
        case 'youtube': eng = youtubeEngine(parsed, cb, vol); break;
        case 'soundcloud': eng = soundcloudEngine(parsed, cb, vol); break;
        case 'audio': eng = audioEngine(parsed, cb, vol); break;
        case 'web': eng = forceEmbed ? embedEngine(parsed, cb) : audioEngine(parsed, cb, vol); break;
        default: eng = embedEngine(parsed, cb);
      }
      this.engine = eng;
      if (eng.el) {
        this.ui.embed.appendChild(eng.el);
        this.ui.embed.classList.add('has');
        this.ui.embed.style.aspectRatio = eng.ratio || '';
        this.ui.embed.style.height = eng.ratio ? '' : (eng.height || 200) + 'px';
      }
      if (parsed.kind === 'audio' || (parsed.kind === 'web' && !forceEmbed)) eng.play();
      if (['spotify', 'apple', 'deezer'].includes(parsed.kind)) this.setMsg('mp.pressInside', 'info');
      if (parsed.kind === 'web' && forceEmbed) this.setMsg('mp.showingPage', 'info');
      this.renderBar();
      this.ui.bar.classList.add('flash');
      setTimeout(() => this.ui.bar.classList.remove('flash'), 900);
    },

    toggle() {
      if (!this.items.length) { this.setOpen(true); return; }
      if (!this.engine) { this.playIndex(this.cur >= 0 ? this.cur : 0); return; }
      if (!this.engine.controllable) { this.setOpen(true); return; }
      if (this.playing) this.engine.pause(); else this.engine.play();
    },

    step(dir) {
      if (!this.items.length) { this.setOpen(true); return; }
      const e = this.engine;
      if (e && e.controllable && e.nativeNav) { if (dir > 0) e.next(); else e.prev(); return; }
      let i = this.cur + dir;
      if (i >= this.items.length) i = 0;
      if (i < 0) i = this.items.length - 1;
      this.playIndex(i);
    },

    onEnded() {
      if (this.repeat === 'one') { this.engine && this.engine.play(); return; }
      const last = this.cur >= this.items.length - 1;
      if (last && this.repeat === 'off') return;
      if (this.items.length > 1 || this.repeat === 'all') this.step(1);
    },

    cycleRepeat() {
      this.repeat = { all: 'one', one: 'off', off: 'all' }[this.repeat] || 'all';
      this.save(); this.renderBar();
    },

    setVolume(v) {
      this.volume = clamp(v, 0, 100);
      this.ui.vol.value = this.volume;
      if (this.engine) this.engine.setVolume(this.volume);
      this.save();
    },

    onTime(t, d) {
      this.dur = d; this.pos = t;
      if (d) {
        this.ui.seek.value = Math.round(t / d * 1000);
        this.ui.time.textContent = `${NS.fmtTime(t)} / ${NS.fmtTime(d)}`;
      } else this.ui.time.textContent = t ? NS.fmtTime(t) + ' · ' + tr('mp.live') : '';
    },
  };

  NS.music = Music;
  NS.parseMusicLink = parseLink;
})();

/* Sons : carillon de fin de minuteur, mixeur d'ambiance (pluie, vent, feu de bois, café) généré en WebAudio,
   et cliquetis facultatif de machine à écrire. Repris et étendu de solitaire n' chill. */
(function () {
  'use strict';
  const NS = window.SE;

  let ctx = null;
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const vol = () => NS.settings.data.sound.volume;

  function chime(notes, gain = 0.12) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + 0.02;
    notes.forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t = t0 + i * 0.16;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * vol(), t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + 1.4);
    });
  }
  const doneChime = () => chime([659.25, 523.25, 659.25, 783.99], 0.14);
  const goalChime = () => chime([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.12);

  /* ---------------------------------------------------------------- machine à écrire */
  let clickBuf = null;
  function key(k) {
    const c = ac();
    if (!c) return;
    if (!clickBuf) clickBuf = noiseBuffer(c, 0.05, 'white');
    const t = c.currentTime;
    if (k === 'Enter') { chime([1567.98], 0.05); }
    const b = c.createBufferSource(); b.buffer = clickBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = (k === ' ' ? 900 : 2200) + Math.random() * 900; f.Q.value = 2.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.32 * vol(), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (k === ' ' ? 0.05 : 0.03));
    b.connect(f).connect(g).connect(c.destination);
    b.start(t);
    // petit « tac » grave du marteau
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(180 + Math.random() * 40, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.04);
    og.gain.setValueAtTime(0.12 * vol(), t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(og).connect(c.destination); o.start(t); o.stop(t + 0.06);
  }

  /* ---------------------------------------------------------------- ambiance */
  let master = null;
  const chans = {};
  function noiseBuffer(c, seconds, kind) {
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
      else d[i] = w;
    }
    return buf;
  }
  function loopSource(c, buf) {
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.start(0, Math.random() * buf.duration);
    return s;
  }
  function crackles(c, out, opts) {
    const buf = noiseBuffer(c, opts.len || 0.06, 'white');
    let alive = true;
    const pop = () => {
      if (!alive) return;
      if (out.gain.value > 0.005) {
        const b = c.createBufferSource(); b.buffer = buf;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = opts.f0 + Math.random() * opts.fr; f.Q.value = opts.q || 1.2;
        const g = c.createGain(); g.gain.value = opts.g0 + Math.random() * opts.gr;
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + (opts.decay || 0.05));
        b.connect(f).connect(g).connect(out);
        b.start();
      }
      setTimeout(pop, opts.wait());
    };
    pop();
    return () => { alive = false; };
  }
  function buildChannel(name) {
    const c = ac();
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(master);
    const ch = { out, stop() {} };
    if (name === 'rain') {
      const s = loopSource(c, noiseBuffer(c, 4, 'white'));
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7500;
      s.connect(hp).connect(lp).connect(out);
      const s2 = loopSource(c, noiseBuffer(c, 5, 'brown'));
      const lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 500;
      const g2 = c.createGain(); g2.gain.value = 0.35;
      s2.connect(lp2).connect(g2).connect(out);
    } else if (name === 'wind') {
      const s = loopSource(c, noiseBuffer(c, 6, 'brown'));
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.7;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.11;
      const lg = c.createGain(); lg.gain.value = 260;
      lfo.connect(lg).connect(bp.frequency); lfo.start();
      s.connect(bp).connect(out);
    } else if (name === 'fire') {
      const s = loopSource(c, noiseBuffer(c, 5, 'brown'));
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const rumble = c.createGain(); rumble.gain.value = 0.9;
      s.connect(lp).connect(rumble).connect(out);
      ch.stop = crackles(c, out, { f0: 1200, fr: 3800, g0: 0.15, gr: 0.55, wait: () => 60 + Math.random() * (Math.random() < 0.2 ? 90 : 650) });
    } else if (name === 'cafe') {
      // brouhaha : bruit rose filtré dans la bande de la voix, modulé lentement, + tintements de tasses
      const s = loopSource(c, noiseBuffer(c, 7, 'pink'));
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.9;
      const mod = c.createGain(); mod.gain.value = 0.8;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.37;
      const lg = c.createGain(); lg.gain.value = 0.25;
      lfo.connect(lg).connect(mod.gain); lfo.start();
      s.connect(bp).connect(mod).connect(out);
      const s2 = loopSource(c, noiseBuffer(c, 5, 'brown'));
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
      const g2 = c.createGain(); g2.gain.value = 0.5;
      s2.connect(lp).connect(g2).connect(out);
      ch.stop = crackles(c, out, { len: 0.25, f0: 2600, fr: 2200, q: 18, g0: 0.08, gr: 0.18, decay: 0.25, wait: () => 900 + Math.random() * 4200 });
    }
    return ch;
  }
  const LEVEL = { rain: 0.5, wind: 0.55, fire: 0.6, cafe: 0.7 };
  function setAmbience(name, level) {
    level = NS.clamp(level, 0, 1);
    NS.settings.set('sound.ambience.' + name, level);
    if (level <= 0 && !chans[name]) return;
    const c = ac();
    if (!c) return;
    if (!master) { master = c.createGain(); master.gain.value = 1; master.connect(c.destination); }
    if (!chans[name]) chans[name] = buildChannel(name);
    chans[name].out.gain.setTargetAtTime(level * (LEVEL[name] || 0.5), c.currentTime, 0.25);
  }
  function resumeSaved() {
    const a = NS.settings.data.sound.ambience;
    Object.keys(a).forEach(n => { if (a[n] > 0) setAmbience(n, a[n]); });
  }

  NS.audio = { chime, doneChime, goalChime, key, setAmbience, resumeSaved, ac };
})();

/*
 * Peetako Sound — synthesized sound effects (no audio files needed). Draft of 11 Oct 2026, added in Phase 2B.
 *
 * Usage:
 *   <script src="/assets/sound.js"></script>
 *   PeetakoSound.toggle();          // call from a button click (first tap unlocks audio)
 *   PeetakoSound.play('eat');       // does nothing while sound is off
 *
 * Sounds: tap, eat, bathe, warm, play, levelUp, sape, agung, chikchak, coin, gift, error
 * Borneo sounds (20 Oct 2026, GDD Visual and audio direction), all synthesized here, no audio files:
 *   care actions = sompoton-style reeds (Kadazandusun mouth organ), tier-up and hatch = a sape phrase
 *   (Orang Ulu lute), battle start = an agung (gong) strike, news = the gecko's own "chik-chak" call.
 *   They are inspired by these instruments, not recordings of them.
 * Default: ON (from 17 Oct 2026). Browsers stay silent until the first tap. Setting is remembered in localStorage ("peetako_sound").
 * Music: an optional, quiet sape loop with its own switch, OFF by default ("peetako_music"). PeetakoSound.toggleMusic().
 */
(function (global) {
  'use strict';

  var STORE_KEY = 'peetako_sound';
  var MASTER_VOLUME = 0.22; // keep low; players on phones in public places
  var ctx = null;
  var master = null;
  var enabled = true;

  try { enabled = localStorage.getItem(STORE_KEY) !== 'off'; } catch (e) {}

  function ensureContext() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One oscillator note with a quick attack and exponential decay.
  function tone(freq, start, dur, type, vol, slideTo) {
    var t0 = ctx.currentTime + start;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.6, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // Short burst of filtered noise (used for the water/splash feel).
  function noise(start, dur, vol, freq) {
    var t0 = ctx.currentTime + start;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq || 1800;
    filter.Q.value = 0.9;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  // Plucked string, after the sape: bright attack, quick decay, a slight bend, soft upper partials.
  function pluck(freq, start, dur, vol) {
    tone(freq, start, dur, 'triangle', vol, freq * 0.994);
    tone(freq * 2, start, dur * 0.5, 'sine', vol * 0.32);
    tone(freq * 3, start, dur * 0.22, 'sine', vol * 0.12);
  }

  // Reed chord, after the sompoton: close-tuned reeds through a soft low-pass, with a puff of breath.
  function reed(freqs, start, dur, vol) {
    var t0 = ctx.currentTime + start;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.035);
    g.gain.setValueAtTime(vol || 0.3, t0 + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    lp.connect(g);
    g.connect(master);
    for (var i = 0; i < freqs.length; i++) {
      var osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freqs[i], t0);
      osc.detune.setValueAtTime((i % 2 ? 6 : -6), t0);
      osc.connect(lp);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }
    noise(start, 0.07, 0.06, 3200);
  }

  // Gong strike, after the agung: a low fundamental with inharmonic partials and a long ring.
  function gong(start, vol) {
    var base = 98;
    var partials = [[1, 1], [2.02, 0.45], [2.76, 0.3], [4.07, 0.15], [5.4, 0.08]];
    for (var i = 0; i < partials.length; i++) {
      tone(base * partials[i][0], start, 2.6 - i * 0.35, 'sine', (vol || 0.8) * partials[i][1], base * partials[i][0] * 0.985);
    }
    noise(start, 0.09, 0.25, 320);
  }

  // The sape's pentatonic notes (D major pentatonic) for phrases and the music loop.
  var SAPE = [294, 330, 370, 440, 494, 587, 659, 740, 880];
  function sapePhrase(start, vol, seed) {
    var steps = [[0, 3], [0.18, 4], [0.36, 5], [0.62, 4], [0.8, 6], [1.15, 5]];
    for (var i = 0; i < steps.length; i++) {
      var k = (steps[i][1] + (seed || 0)) % SAPE.length;
      pluck(SAPE[k], start + steps[i][0], 0.7, vol);
    }
    pluck(SAPE[0], start, 1.6, vol * 0.5); // drone string
  }

  var sounds = {
    // soft UI click
    tap: function () {
      tone(880, 0, 0.05, 'sine', 0.5, 660);
    },
    // Care actions: sompoton-style reed puffs, a different chord for each need.
    // feed / charge: two puffs, low and warm
    eat: function () {
      reed([294, 440], 0.00, 0.20, 0.28);
      reed([330, 494], 0.22, 0.24, 0.28);
    },
    // clean / oil: a splash, then a bright reed
    bathe: function () {
      noise(0, 0.22, 0.28, 2200);
      reed([440, 659], 0.16, 0.30, 0.25);
    },
    // warm / cool: one long, soft chord
    warm: function () {
      reed([262, 392, 523], 0.00, 0.55, 0.24);
    },
    // play / update: three rising puffs
    play: function () {
      reed([392, 587], 0.00, 0.13, 0.25);
      reed([440, 659], 0.15, 0.13, 0.25);
      reed([494, 740], 0.30, 0.22, 0.25);
    },
    // tier up and hatch: a short sape phrase
    levelUp: function () {
      sapePhrase(0, 0.55, 0);
    },
    sape: function () {
      sapePhrase(0, 0.5, 2);
    },
    // battle start: the agung
    agung: function () {
      gong(0, 0.85);
    },
    // news: the gecko's "chik-chak" call (clicks falling in pitch)
    chikchak: function () {
      for (var i = 0; i < 5; i++) {
        noise(i * 0.095, 0.035, 0.55, 3600 - i * 260);
        tone(2700 - i * 170, i * 0.095, 0.03, 'square', 0.12);
      }
    },
    // coin collected (Phase 2C)
    coin: function () {
      tone(988, 0.00, 0.07, 'square', 0.25);
      tone(1319, 0.07, 0.22, 'square', 0.25);
    },
    // gift received (Phase 2C): rising shimmer
    gift: function () {
      var notes = [659, 784, 988, 1319, 1568];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], i * 0.07, 0.18, 'sine', 0.45);
      }
    },
    // neutral error / report
    error: function () {
      tone(220, 0.00, 0.13, 'sawtooth', 0.22, 180);
      tone(165, 0.14, 0.18, 'sawtooth', 0.22, 130);
    }
  };

  // ---------- optional music: a quiet sape loop, off by default ----------
  var MUSIC_KEY = 'peetako_music';
  var musicOn = false;
  var musicTimer = null;
  var musicSeed = 0;
  try { musicOn = localStorage.getItem(MUSIC_KEY) === 'on'; } catch (e) {}
  function musicTick() {
    if (!musicOn || !ctx || document.hidden) return;
    sapePhrase(0, 0.22, musicSeed);
    musicSeed = (musicSeed + 3) % 5;
  }
  function startMusic() {
    if (!ensureContext()) return;
    clearInterval(musicTimer);
    musicTick();
    musicTimer = setInterval(musicTick, 7000);
  }
  function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
  // Browsers only allow audio after a gesture, so a saved "on" starts at the first tap.
  function resumeOnGesture() {
    global.removeEventListener('pointerdown', resumeOnGesture);
    if (musicOn) startMusic();
  }
  if (musicOn) global.addEventListener('pointerdown', resumeOnGesture);

  var api = {
    names: Object.keys(sounds),

    isMusicOn: function () { return musicOn; },
    // Call from a user gesture.
    toggleMusic: function () {
      musicOn = !musicOn;
      try { localStorage.setItem(MUSIC_KEY, musicOn ? 'on' : 'off'); } catch (e) {}
      if (musicOn) startMusic(); else stopMusic();
      return musicOn;
    },

    isEnabled: function () { return enabled; },

    // Call from a user gesture (click/tap) so the browser allows audio.
    setEnabled: function (on) {
      enabled = !!on;
      try { localStorage.setItem(STORE_KEY, enabled ? 'on' : 'off'); } catch (e) {}
      if (enabled) {
        if (ensureContext()) sounds.tap();
      }
      return enabled;
    },

    toggle: function () { return api.setEnabled(!enabled); },

    play: function (name) {
      if (!enabled || !sounds[name]) return;
      if (!ensureContext()) return;
      try { sounds[name](); } catch (e) {}
    },

    // For a preview page only: plays regardless of the saved setting.
    preview: function (name) {
      if (!sounds[name]) return;
      if (!ensureContext()) return;
      sounds[name]();
    }
  };

  global.PeetakoSound = api;
})(window);

/*
 * Peetako Sound — synthesized sound effects (no audio files needed). Draft of 11 Oct 2026, added in Phase 2B.
 *
 * Usage:
 *   <script src="/assets/sound.js"></script>
 *   PeetakoSound.toggle();          // call from a button click (first tap unlocks audio)
 *   PeetakoSound.play('eat');       // does nothing while sound is off
 *
 * Sounds: tap, eat, bathe, play, levelUp, coin, gift, error
 * Default: ON (from 17 Oct 2026). Browsers stay silent until the first tap. Setting is remembered in localStorage ("peetako_sound").
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

  var sounds = {
    // soft UI click
    tap: function () {
      tone(880, 0, 0.05, 'sine', 0.5, 660);
    },
    // three quick "nom nom nom"
    eat: function () {
      tone(330, 0.00, 0.08, 'triangle', 0.7, 220);
      tone(310, 0.11, 0.08, 'triangle', 0.7, 210);
      tone(290, 0.22, 0.10, 'triangle', 0.7, 190);
    },
    // splash plus rising bubbles
    bathe: function () {
      noise(0, 0.28, 0.35, 2200);
      tone(500, 0.10, 0.09, 'sine', 0.35, 900);
      tone(650, 0.20, 0.09, 'sine', 0.35, 1100);
      tone(800, 0.30, 0.10, 'sine', 0.30, 1300);
    },
    // bouncy two-step
    play: function () {
      tone(392, 0.00, 0.10, 'square', 0.28, 523);
      tone(523, 0.11, 0.10, 'square', 0.28, 659);
      tone(659, 0.22, 0.16, 'square', 0.28, 784);
    },
    // tier up: fanfare arpeggio with sparkle
    levelUp: function () {
      var notes = [523, 659, 784, 1047];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], i * 0.11, 0.22, 'triangle', 0.6);
        tone(notes[i] * 2, i * 0.11, 0.16, 'sine', 0.18);
      }
      tone(1047, 0.46, 0.55, 'triangle', 0.55);
      tone(1568, 0.46, 0.55, 'sine', 0.22);
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

  var api = {
    names: Object.keys(sounds),

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

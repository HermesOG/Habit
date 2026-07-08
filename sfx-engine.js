/* ============================================================
   Хранитель — SFX-движок v2 (Web Audio, чистый синтез).
   Профессиональный саунд-дизайн под «хранителя огня»:
     • проходной алгоритмический ревер (тёплый зал/храм)
     • master-шина: компрессор + мягкий лимитер (soft-clip)
     • колокола на инharmonических партиалах (стекло/бронза)
     • угольковый crackle-бэд, восходящий riser, shimmer-хвост
     • лейтмотив Хранителя (открытая триада) в крупных сценах
     • гуманизация тайминга/строя + комбо-подъём серии задач
     • тембр следует теме: amber — тёплый, azure — стеклянный
   API:  GuardianSfx.setEnabled(bool) / isEnabled()
         GuardianSfx.setTheme('amber'|'azure'|'spark')
         GuardianSfx.unlock()
         GuardianSfx.play(name[, arg])
   Cue:  complete(diff 1..5), habit(streak), streak(n), goal,
         levelup, undo, cap, tap, toggle(on), open, error
   ============================================================ */
(function () {
  var AC = null, enabled = true, theme = 'amber';
  var master = null, revBus = null, comp = null;
  var combo = 0, lastCompleteAt = 0;

  /* ---- тембровые палитры по теме ---------------------------- */
  var PALETTES = {
    amber: { root: 349.23, bell: 'triangle', warm: 2600, air: 5200, wet: 0.26, partialGain: 1.0, glass: 0.0 },
    azure: { root: 392.00, bell: 'sine',     warm: 3200, air: 6600, wet: 0.30, partialGain: 0.9, glass: 0.5 },
    spark: { root: 370.00, bell: 'triangle', warm: 2900, air: 6000, wet: 0.28, partialGain: 1.0, glass: 0.25 }
  };
  function pal() { return PALETTES[theme] || PALETTES.amber; }

  /* ---- инфраструктура --------------------------------------- */
  function softClipCurve() {
    var n = 1024, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 1.6) * 0.92; }
    return c;
  }
  function makeIR(ac, seconds, decay, damp) {
    var rate = ac.sampleRate, len = Math.floor(rate * seconds);
    var ir = ac.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch), lp = 0;
      for (var i = 0; i < len; i++) {
        var env = Math.pow(1 - i / len, decay);
        var white = (Math.random() * 2 - 1) * env;
        lp += (white - lp) * damp;          // одно-полюсный ФНЧ — тёмный хвост
        d[i] = lp * 1.6;
      }
    }
    return ir;
  }
  function ctx() {
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { AC = new C(); } catch (e) { return null; }

      comp = AC.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 26; comp.ratio.value = 3.2;
      comp.attack.value = 0.004; comp.release.value = 0.22;

      var limiter = AC.createWaveShaper();
      limiter.curve = softClipCurve(); limiter.oversample = '4x';

      master = AC.createGain(); master.gain.value = 0.9;
      master.connect(comp); comp.connect(limiter); limiter.connect(AC.destination);

      var conv = AC.createConvolver();
      conv.buffer = makeIR(AC, 2.1, 2.4, 0.34);
      revBus = AC.createGain(); revBus.gain.value = 1.0;
      var revShelf = AC.createBiquadFilter();  // осадить верх ревера, чтобы не шипел
      revShelf.type = 'highshelf'; revShelf.frequency.value = 3600; revShelf.gain.value = -6;
      revBus.connect(conv); conv.connect(revShelf); revShelf.connect(master);
    }
    if (AC.state === 'suspended') { try { AC.resume(); } catch (e) {} }
    return AC;
  }

  /* колокол: набор инharmonических партиалов с индивидуальным спадом */
  var BELL_PARTIALS = [
    { r: 1.0,  g: 1.00, d: 1.00 },
    { r: 2.00, g: 0.55, d: 0.80 },
    { r: 2.98, g: 0.34, d: 0.62 },
    { r: 4.20, g: 0.20, d: 0.46 },
    { r: 5.43, g: 0.12, d: 0.34 },
    { r: 6.79, g: 0.08, d: 0.26 }
  ];
  function bell(freq, o) {
    var ac = ctx(); if (!ac) return;
    o = o || {}; var P = pal();
    var t = ac.currentTime + (o.at || 0);
    var dur = o.dur || 0.7;
    var peak = (o.gain == null ? 0.5 : o.gain);
    var wet = (o.wet == null ? P.wet : o.wet);
    var pan = o.pan || 0;
    var bright = o.bright == null ? 1 : o.bright;

    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime((o.cut || P.air) * bright, t);
    lp.Q.value = 0.5;
    lp.connect(master);
    var send = ac.createGain(); send.gain.value = wet; lp.connect(send); send.connect(revBus);
    if (pan && ac.createStereoPanner) { /* панораму даём на выходе lp */ }

    var partials = BELL_PARTIALS.length;
    var glassBoost = 1 + P.glass * 0.6;
    for (var i = 0; i < partials; i++) {
      var pt = BELL_PARTIALS[i];
      var g = ac.createGain();
      var pg = peak * pt.g * P.partialGain * (i === 0 ? 1 : glassBoost);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(pg, t + (o.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * pt.d);
      g.connect(lp);
      var osc = ac.createOscillator();
      osc.type = i === 0 ? P.bell : 'sine';
      osc.frequency.setValueAtTime(freq * pt.r, t);
      if (o.glideTo && i === 0) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + dur * 0.9);
      osc.detune.value = (Math.random() * 2 - 1) * (o.hum || 4);  // лёгкая гуманизация строя
      osc.connect(g);
      osc.start(t); osc.stop(t + dur * pt.d + 0.05);
    }
  }

  /* мягкий тон (для UI и подложек) */
  function tone(freq, o) {
    var ac = ctx(); if (!ac) return;
    o = o || {}; var P = pal();
    var t = ac.currentTime + (o.at || 0);
    var dur = o.dur || 0.3;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain == null ? 0.3 : o.gain, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = o.cut || P.warm;
    g.connect(lp); lp.connect(master);
    if ((o.wet || 0) > 0) { var s = ac.createGain(); s.gain.value = o.wet; lp.connect(s); s.connect(revBus); }
    var osc = ac.createOscillator();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + dur * 0.9);
    osc.connect(g); osc.start(t); osc.stop(t + dur + 0.05);
  }

  /* шумовой бэд: угольки / вжух / воздух (полосовой свип + панорама) */
  function noise(o) {
    var ac = ctx(); if (!ac) return;
    o = o || {};
    var t = ac.currentTime + (o.at || 0);
    var dur = o.dur || 0.5;
    var len = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    var crackle = o.crackle || 0;
    for (var i = 0; i < len; i++) {
      var env = Math.pow(1 - i / len, o.tail || 1.5);
      var s = (Math.random() * 2 - 1) * env;
      if (crackle && Math.random() < crackle) s += (Math.random() * 2 - 1) * 0.9; // редкие «щелчки» угля
      d[i] = s;
    }
    var src = ac.createBufferSource(); src.buffer = buf;
    var bp = ac.createBiquadFilter();
    bp.type = o.filter || 'bandpass'; bp.Q.value = o.q || 1.0;
    bp.frequency.setValueAtTime(o.f0 || 320, t);
    bp.frequency.exponentialRampToValueAtTime(o.f1 || 1400, t + dur);
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.2, t + (o.attack || 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var last = g;
    if (o.pan && ac.createStereoPanner) { var pn = ac.createStereoPanner(); pn.pan.value = o.pan; g.connect(pn); last = pn; }
    src.connect(bp); bp.connect(g); last.connect(master);
    if ((o.wet || 0) > 0) { var sn = ac.createGain(); sn.gain.value = o.wet; last.connect(sn); sn.connect(revBus); }
    src.start(t); src.stop(t + dur + 0.02);
  }

  /* восходящий riser (пилообразный + свип фильтра) */
  function riser(o) {
    var ac = ctx(); if (!ac) return;
    o = o || {};
    var t = ac.currentTime + (o.at || 0);
    var dur = o.dur || 0.7;
    var osc = ac.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(o.f0 || 110, t);
    osc.frequency.exponentialRampToValueAtTime(o.f1 || 520, t + dur);
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(o.cut || 3400, t + dur);
    lp.Q.value = 6;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.16, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    osc.connect(lp); lp.connect(g); g.connect(master);
    var s = ac.createGain(); s.gain.value = 0.3; g.connect(s); s.connect(revBus);
    osc.start(t); osc.stop(t + dur + 0.1);
  }

  /* высокий мерцающий хвост (несколько случайных верхних колокольчиков) */
  function shimmer(o) {
    o = o || {};
    var P = pal(), base = o.base == null ? 12 : o.base, n = o.n || 5;
    for (var i = 0; i < n; i++) {
      bell(scale(base + (i % 3) + Math.floor(i / 3) * 2), {
        at: (o.at || 0) + 0.04 * i + Math.random() * 0.03,
        dur: 0.6, gain: 0.12, wet: P.wet + 0.1, bright: 1.15,
        pan: (Math.random() * 2 - 1) * 0.6
      });
    }
  }

  /* тёплая пентатоника от корня темы */
  function scale(step) {
    var steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
    var s = steps[Math.max(0, Math.min(steps.length - 1, step))];
    return pal().root * Math.pow(2, s / 12);
  }
  /* лейтмотив Хранителя: открытая триада (корень-терция-квинта) */
  function motif(startStep, o) {
    o = o || {};
    var deg = [0, 2, 3];           // индексы в пентатонике → тоника, терция, квинта
    for (var i = 0; i < deg.length; i++) {
      bell(scale(startStep + deg[i]), {
        at: (o.at || 0) + i * (o.gap || 0.09),
        dur: o.dur || 0.7, gain: (o.gain || 0.42) * (1 - i * 0.06),
        wet: o.wet, pan: (i - 1) * 0.22, bright: o.bright || 1
      });
    }
  }

  var SFX = {
    /* Задача выполнена: колокол + комбо-подъём серии; выше и ярче по сложности. */
    complete: function (diff) {
      diff = Math.max(1, Math.min(5, diff || 2));
      var ac = ctx(); var now = ac ? ac.currentTime : 0;
      if (now - lastCompleteAt < 1.8) combo = Math.min(combo + 1, 6); else combo = 0;
      lastCompleteAt = now;
      var base = (diff - 1) + combo;                 // сложность + позиция в серии
      bell(scale(base),     { dur: 0.5,  gain: 0.4,  pan: -0.12 });
      bell(scale(base + 2), { at: 0.075, dur: 0.66, gain: 0.5, pan: 0.12, bright: 1.05 });
      if (diff >= 4) noise({ at: 0.0, dur: 0.32, gain: 0.1, f0: 500, f1: 2200, crackle: 0.02, wet: 0.2 });
      if (diff >= 5) { bell(scale(base + 4), { at: 0.16, dur: 0.7, gain: 0.4, bright: 1.2 }); shimmer({ at: 0.12, n: 3 }); }
    },
    /* Привычка: тёплая пара + шиммер; на «жарких» стриках — росчерк вверх. */
    habit: function (streak) {
      bell(scale(1), { dur: 0.56, gain: 0.44, pan: -0.1 });
      bell(scale(4), { at: 0.06, dur: 0.5, gain: 0.32, pan: 0.14, bright: 1.1 });
      if ((streak || 0) >= 7) { bell(scale(5), { at: 0.16, dur: 0.6, gain: 0.34 }); bell(scale(7), { at: 0.26, dur: 0.6, gain: 0.28, bright: 1.1 }); }
    },
    /* Юбилей стрика (кратно 7/30): маленькая фанфара. */
    streak: function () { riser({ dur: 0.5, gain: 0.1, f0: 160, f1: 440 }); motif(4, { gap: 0.1, gain: 0.4 }); shimmer({ at: 0.32, n: 4 }); },
    /* Цель достигнута: аккорд-подложка + лейтмотив + угольковый вжух + хвост. */
    goal: function () {
      noise({ dur: 0.6, gain: 0.22, f0: 240, f1: 1500, crackle: 0.015, tail: 1.3, wet: 0.3, pan: -0.2 });
      [0, 2, 3].forEach(function (s) { bell(scale(s), { dur: 1.0, gain: 0.26, wet: 0.34 }); });
      motif(5, { at: 0.16, gap: 0.11, gain: 0.42, bright: 1.05 });
      shimmer({ at: 0.5, n: 6 });
    },
    /* Новый уровень: ризер + угольки + полный лейтмотив + длинный шиммер-хвост. */
    levelup: function () {
      riser({ dur: 0.75, gain: 0.16, f0: 90, f1: 560 });
      noise({ at: 0.1, dur: 0.6, gain: 0.2, f0: 280, f1: 1800, crackle: 0.02, wet: 0.3 });
      motif(4, { at: 0.45, gap: 0.12, gain: 0.5, wet: 0.32, bright: 1.1 });
      bell(scale(9), { at: 0.82, dur: 1.1, gain: 0.42, bright: 1.2 });
      shimmer({ at: 0.7, n: 8 });
    },
    /* Откат: тихий нисходящий «выдох». */
    undo: function () {
      tone(scale(3), { dur: 0.18, gain: 0.2, type: 'sine', cut: 1700, glideTo: scale(1), wet: 0.15 });
      tone(scale(0), { at: 0.1, dur: 0.24, gain: 0.16, type: 'sine', cut: 1200, wet: 0.12 });
      combo = 0;
    },
    /* Предел дневного жара: приглушённое низкое «не сейчас». */
    cap: function () {
      tone(pal().root * 0.5, { dur: 0.2, gain: 0.22, type: 'sine', cut: 700 });
      tone(pal().root * 0.472, { at: 0.13, dur: 0.26, gain: 0.18, type: 'sine', cut: 640 });
    },
    /* UI-тик. */
    tap: function () { tone(scale(4), { dur: 0.06, gain: 0.13, type: 'triangle', cut: 2600, attack: 0.003 }); },
    open: function () { tone(scale(2), { dur: 0.09, gain: 0.14, type: 'triangle', cut: 2400, glideTo: scale(4), attack: 0.003 }); },
    /* Тумблер. */
    toggle: function (on) { tone(scale(on ? 5 : 2), { dur: 0.11, gain: 0.18, type: 'triangle', cut: 3000, glideTo: scale(on ? 6 : 1) }); },
    error: function () { tone(pal().root * 0.6, { dur: 0.14, gain: 0.2, type: 'square', cut: 900 }); }
  };

  window.GuardianSfx = {
    setEnabled: function (v) { enabled = !!v; if (enabled) ctx(); },
    isEnabled: function () { return enabled; },
    setTheme: function (t) { if (PALETTES[t]) theme = t; },
    unlock: function () { ctx(); },
    play: function (name, arg) {
      if (!enabled) return;
      var fn = SFX[name];
      if (fn) { try { fn(arg); } catch (e) {} }
    }
  };
})();

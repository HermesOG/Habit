/* ============================================================
   Хранитель — конфиг персонажа: ассеты, якоря, маппинг уровней.
   Экран «Калибровка» (Кабинет → Калибровка, dev-флаг) копирует
   anchors-JSON в буфер — вставьте его сюда вместо ANCHORS.<тема>.
   ============================================================ */
(function () {
  var R = window.__resources || {};
  var ASSETS = {
    amber: {
      form1: R.form1_amber || 'uploads/form1_amber_c.png',
      form2: R.form2_amber || 'uploads/form2_amber_c.png',
      form3: R.form3_amber || 'uploads/form3_amber_c.png',
      form3a: null, /* слот аномалии 29 — если появится PNG, заменит рисованную трещину */
      form4: R.form4_amber || 'uploads/form4_amber_c.png',
      form5: R.form5_amber || 'uploads/form5_amber_c.png'
    },
    azure: {
      form1: R.form1_azure || 'uploads/form1_azure_c.png',
      form2: R.form2_azure || 'uploads/form2_azure_c.png',
      form3: R.form3_azure || 'uploads/form3_azure_c.png',
      form3a: null,
      form4: R.form4_azure || 'uploads/form4_azure_c.png',
      form5: R.form5_azure || 'uploads/form5_azure_c.png'
    },
    spark: {
      form1: R.form1_spark || 'uploads/form1_spark_c.png',
      form2: R.form2_spark || 'uploads/form2_spark_c.png',
      form3: R.form3_spark || 'uploads/form3_spark_c.png',
      form3a: null,
      form4: R.form4_spark || 'uploads/form4_spark_c.png',
      form5: R.form5_spark || 'uploads/form5_spark_c.png'
    }
  };

  /* Якоря: x,y в % контейнера, для каждой темы и формы. Грубые дефолты — калибруются. */
  var ANCHORS = {
    amber: {
      form1: { peakL:{x:28.2,y:17},   peakR:{x:68.3,y:17},   eyeL:{x:41.8,y:29.2}, eyeR:{x:51.1,y:29.2}, scarfKnot:{x:46.7,y:45}, notch:{x:47,y:55}, hemCenter:{x:46,y:88}, crownCenter:{x:46,y:6} },
      form2: { peakL:{x:42.8,y:14.5}, peakR:{x:58.2,y:14.2}, eyeL:{x:45,y:32.5}, eyeR:{x:54.8,y:32.5}, scarfKnot:{x:50,y:46}, notch:{x:50,y:55}, hemCenter:{x:49.5,y:82}, crownCenter:{x:50,y:4} },
      form3: { peakL:{x:44.8,y:16.5}, peakR:{x:54.3,y:16}, eyeL:{x:43.8,y:30.2}, eyeR:{x:52.8,y:30.2}, scarfKnot:{x:48.3,y:40.8}, notch:{x:49.5,y:52}, hemCenter:{x:49.5,y:75}, crownCenter:{x:49.5,y:3.5} },
      form4: { peakL:{x:42.2,y:16.3}, peakR:{x:57.5,y:15.7}, eyeL:{x:45.1,y:31}, eyeR:{x:52.4,y:31}, scarfKnot:{x:48.7,y:43.9}, notch:{x:50,y:55}, hemCenter:{x:50,y:86}, crownCenter:{x:50,y:4} },
      form5: { peakL:{x:41,y:21.5},   peakR:{x:54.7,y:21},   eyeL:{x:43.4,y:31.5}, eyeR:{x:51,y:31.5}, scarfKnot:{x:46.5,y:45.4}, notch:{x:49,y:55}, hemCenter:{x:50,y:88}, crownCenter:{x:48,y:3} }
    }
  };
  /* Лазурь и Искра: свои таблицы якорей (детекция по пикселям + визуальная сверка);
     тонкая подгонка — через экран «Калибровка» (экспортирует anchors[тема]). */
  ANCHORS.azure = {
    form1: { peakL:{x:27.5,y:21.5}, peakR:{x:70.5,y:21},   eyeL:{x:44,y:22.5},   eyeR:{x:55.5,y:22.5}, scarfKnot:{x:46,y:40},   notch:{x:46.5,y:52}, hemCenter:{x:47,y:88},   crownCenter:{x:47,y:5} },
    form2: { peakL:{x:40.5,y:15},   peakR:{x:57,y:15},     eyeL:{x:44,y:31.5},   eyeR:{x:53.5,y:31.5}, scarfKnot:{x:48.5,y:44}, notch:{x:49,y:54},   hemCenter:{x:48.5,y:81}, crownCenter:{x:48.5,y:4} },
    form3: { peakL:{x:41,y:15},     peakR:{x:58.5,y:15},   eyeL:{x:44,y:30.5},   eyeR:{x:54,y:30.5},   scarfKnot:{x:49.5,y:42}, notch:{x:49.5,y:52}, hemCenter:{x:49.5,y:84}, crownCenter:{x:49.5,y:3.5} },
    form4: { peakL:{x:43,y:15},     peakR:{x:56.5,y:15},   eyeL:{x:44.7,y:32},   eyeR:{x:52.7,y:32},   scarfKnot:{x:48.5,y:43}, notch:{x:49,y:54},   hemCenter:{x:49,y:84},   crownCenter:{x:48.5,y:4} },
    form5: { peakL:{x:42.5,y:20},   peakR:{x:55,y:20},     eyeL:{x:44.5,y:34.5}, eyeR:{x:52.5,y:34.5}, scarfKnot:{x:47.5,y:45}, notch:{x:49,y:55},   hemCenter:{x:49,y:90},   crownCenter:{x:48.5,y:3} }
  };
  ANCHORS.spark = {
    form1: { peakL:{x:26,y:15.5},   peakR:{x:71.5,y:15},   eyeL:{x:46.5,y:26},   eyeR:{x:57,y:26},     scarfKnot:{x:49.5,y:40}, notch:{x:50,y:52},   hemCenter:{x:50,y:88},   crownCenter:{x:50,y:5} },
    form2: { peakL:{x:42.7,y:16.5}, peakR:{x:58,y:16.3},   eyeL:{x:45.7,y:32.3}, eyeR:{x:55.3,y:32.3}, scarfKnot:{x:50.5,y:42}, notch:{x:50.5,y:52}, hemCenter:{x:50,y:80},   crownCenter:{x:50.5,y:4} },
    form3: { peakL:{x:40.7,y:14},   peakR:{x:57,y:13.5},   eyeL:{x:45,y:33.5},   eyeR:{x:53.3,y:33.5}, scarfKnot:{x:49,y:43},   notch:{x:49,y:52},   hemCenter:{x:49,y:82},   crownCenter:{x:49,y:3.5} },
    form4: { peakL:{x:40.5,y:17},   peakR:{x:59,y:16.3},   eyeL:{x:45.7,y:34},   eyeR:{x:53,y:34},     scarfKnot:{x:49.5,y:45}, notch:{x:49.5,y:55}, hemCenter:{x:49.5,y:84}, crownCenter:{x:49.5,y:4} },
    form5: { peakL:{x:42.3,y:19},   peakR:{x:55.7,y:18.7}, eyeL:{x:45,y:34.7},   eyeR:{x:52.3,y:34.7}, scarfKnot:{x:48,y:46},   notch:{x:49,y:56},   hemCenter:{x:49,y:90},   crownCenter:{x:48.5,y:3} }
  };
  /* Правки пользователя: localStorage поверх дефолтов */
  var DEFAULT_ANCHORS = JSON.parse(JSON.stringify(ANCHORS));
  var LS_KEY = 'gsAnchors.v1';
  try {
    var _ov = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (_ov) for (var _t in _ov) { if (!ANCHORS[_t]) continue; for (var _f in _ov[_t]) ANCHORS[_t][_f] = Object.assign({}, ANCHORS[_t][_f] || {}, _ov[_t][_f]); }
  } catch (e) {}
  function saveAnchors(theme, anchors) {
    if (!ANCHORS[theme]) return;
    ANCHORS[theme] = JSON.parse(JSON.stringify(anchors));
    try {
      var ov = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
      ov[theme] = ANCHORS[theme];
      localStorage.setItem(LS_KEY, JSON.stringify(ov));
    } catch (e) {}
  }
  function resetAnchors(theme) {
    if (!DEFAULT_ANCHORS[theme]) return;
    ANCHORS[theme] = JSON.parse(JSON.stringify(DEFAULT_ANCHORS[theme]));
    try {
      var ov = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {};
      delete ov[theme];
      localStorage.setItem(LS_KEY, JSON.stringify(ov));
    } catch (e) {}
  }

  var METRICS = {
    form1: { eyeW:6.5, eyeH:9.0, flameW:0,   flameH:0,    candleW:5,   candleH:8,   spread:34 },
    form2: { eyeW:4.8, eyeH:6.6, flameW:6.5, flameH:9.5,  candleW:4.5, candleH:7,   spread:30 },
    form3: { eyeW:3.8, eyeH:5.4, flameW:6.5, flameH:11,   candleW:4.5, candleH:7,   spread:27 },
    form4: { eyeW:4.2, eyeH:6.2, flameW:7,   flameH:10.5, candleW:4.5, candleH:7,   spread:30 },
    form5: { eyeW:3.8, eyeH:5.4, flameW:8,   flameH:15.5, candleW:4.5, candleH:7,   spread:33 }
  };

  function formFor(level) { return level >= 50 ? 5 : level >= 40 ? 4 : level >= 20 ? 3 : level >= 10 ? 2 : 1; }

  /* Диапазоны уровней → набор эффектов */
  function visuals(level) {
    var form = formFor(level);
    return {
      form: form,
      eyesDim: level < 5,                        /* глаза приглушены тёмными эллипсами */
      candles: level >= 5 && level < 10,         /* SVG-свечи на кончиках капюшона */
      smoke: level < 5,                          /* дымки с пиков */
      flameFlicker: form >= 2,                   /* фликер поверх запечённого пламени */
      eyePulse: level >= 5,                      /* идл-пульс глаз */
      lining: level >= 50 ? 0.95 : level >= 40 ? 0.6 : level >= 20 ? 0.3 : 0,
      sparks: level >= 50 ? 9 : level >= 40 ? 6 : level >= 29 ? 5 : level >= 20 ? 3 : 0,
      crack: level === 29,                       /* пульсирующая трещина у выреза */
      residual: level >= 30 && level < 40,       /* остаточное свечение 10% — шрам-память */
      slivers: level === 29,                     /* язычки пламени над глазами */
      halo: level >= 50,
      crown: level >= 50
    };
  }

  function anchorsFor(theme, form) { var t = ANCHORS[theme] || ANCHORS.amber; return t['form'+form] || ANCHORS.amber['form'+form]; }
  function assetFor(theme, form) { var t = ASSETS[theme] || ASSETS.amber; return t['form'+form] || ASSETS.amber['form'+form]; }
  function metricsFor(form) { return METRICS['form'+form] || METRICS.form1; }

  window.GuardianCharConfig = {
    ASSETS: ASSETS, ANCHORS: ANCHORS, METRICS: METRICS,
    formFor: formFor, visuals: visuals,
    anchorsFor: anchorsFor, assetFor: assetFor, metricsFor: metricsFor,
    saveAnchors: saveAnchors, resetAnchors: resetAnchors, DEFAULT_ANCHORS: DEFAULT_ANCHORS,
    TITLES: { 1:'Тлеющий', 5:'Зажжённый', 10:'Окрепший', 20:'Яркий', 29:'???', 40:'Пылающий', 50:'Хранитель' }
  };
})();

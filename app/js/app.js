/*
 * アプリ本体：状態の管理と各部品の接続
 */
Lab.modules.push(function () {
  const $ = (id) => document.getElementById(id);
  const SESSION_KEY = 'lab3d.session.v1';
  // 破片の作り直しが必要な項目（集合先の形に関わる項目は Lab.shapes.cacheKey が判定）
  const GEOMETRY_KEYS = ['count', 'shardType', 'seed'];
  // プリセットを切り替えても引き継ぐ項目（入力した文字やフォント、背景など）
  const KEEP_ON_PRESET = ['text', 'font', 'fontWeight', 'textAlign', 'autoWrap', 'depth', 'background', 'floor'];

  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z" fill="currentColor"/></svg>';

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 保存できない環境では無視 */ }
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  Lab.start = async function () {
    const stage = new Lab.Stage($('viewport'));
    const system = new Lab.ShardSystem(stage);
    const timeline = new Lab.Timeline();
    const sim = new Lab.SimController(stage);
    // タイムライン型の演出と、シミュレーションで再生役を切り替える
    const isSim = () => Lab.effects[state.effect].kind === 'sim';
    const clock = () => (isSim() ? sim : timeline);
    const state = { effect: 'gather', presetId: 'g_text', modified: false, params: Lab.schemaDefaults(), memo: '' };
    let geoKey = null;
    let shapeInfo = null;

    // ---- 状態 → 画面への反映 ----
    let chain = Promise.resolve();
    function apply(opts) {
      chain = chain.then(() => doApply(opts || {})).catch((e) => console.error(e));
      return chain;
    }
    async function doApply(opts) {
      if (isSim()) await applySim(opts);
      else await applyEffect(opts);
      ui.refresh(state);
      ui.setTextInfo(!isSim() && state.params.shape === 'text' ? shapeInfo : null, state.params.count);
      ui.setBodyLabels(isSim() && state.params.simSubject === 'text' ? sim.labels : []);
      $('btnStep').hidden = !isSim();
      $('btnBlender').disabled = !isSim();
      $('btnBlender').title = isSim() ? 'シミュレーションの動きをフレームごとに記録し、Blender用のJSONを保存します' : 'Blenderへの出力は、いまはシミュレーションだけに対応しています';
      $('btnRestart').title = isSim() ? '初期状態へリセット（R）' : '最初から再実行（R）';
      loopBtns.pingpong.hidden = isSim();
      markPreset(state.presetId);
      updateBadge();
      updateHints();
      saveSession();
    }

    async function applySim({ restart = false, seek = null, lookOnly = false } = {}) {
      const p = state.params;
      system.setVisible(false);
      sim.setActive(true);
      stage.applyLook(p);
      stage.bloom.strength *= 0.35; // 立体の物体は明るい面が多いので発光を控えめに
      sim.speed = parseFloat(p.simSpeed) || 1;
      if (!lookOnly || !sim.world) {
        const loading = $('loading');
        if (!sim.world) { loading.textContent = '物理エンジンを読み込み中…'; loading.classList.add('show'); }
        try {
          await sim.configure(p);
        } catch (e) {
          console.error(e);
          toast('物理エンジンを読み込めませんでした。インターネット接続を確認してください。');
        }
        loading.classList.remove('show');
        if (seek != null) { sim.seek(seek); sim.pause(); }
        else if (restart) sim.restart();
      }
      sim.applyLook(p);
    }

    async function applyEffect({ restart = false, seek = null } = {}) {
      const p = state.params;
      sim.setActive(false);
      system.setVisible(true);
      const key = Lab.shapes.cacheKey(p) + '|' + GEOMETRY_KEYS.map((k) => p[k]).join('|');
      if (key !== geoKey) {
        await Lab.shapes.prepare(p);
        const shape = Lab.shapes.sample(p, Lab.util.mulberry32(p.seed * 9973 + 7));
        system.build(p, shape);
        shapeInfo = shape.info || null;
        geoKey = key;
      }
      system.configure(Lab.effects[state.effect], p);
      stage.applyLook(p);
      timeline.setDuration(p.duration);
      if (restart) timeline.restart();
      if (seek != null) { timeline.seek(seek); timeline.pause(); }
    }

    function updateBadge() {
      const eff = Lab.effects[state.effect];
      const preset = Lab.presetById(state.presetId);
      const name = preset ? preset.name : '読み込んだ設定';
      $('presetBadge').textContent = `${eff.label}｜${name}${state.modified ? '（調整中）' : ''}`;
    }

    function updateHints() {
      const ul = $('hintList');
      ul.innerHTML = '';
      for (const h of Lab.record.blenderHints(state)) ul.appendChild(Lab.el('li', null, h));
    }

    function saveSession() {
      storageSet(SESSION_KEY, JSON.stringify({
        effect: state.effect, presetId: state.presetId, modified: state.modified,
        params: state.params, memo: state.memo, loop: timeline.loop,
      }));
    }

    // ---- 操作 ----
    function pickPreset(id) {
      const preset = Lab.presetById(id);
      if (!preset) return;
      const keep = {};
      for (const k of KEEP_ON_PRESET) keep[k] = state.params[k];
      state.effect = preset.effect;
      state.presetId = preset.id;
      state.modified = false;
      state.params = Lab.sanitizeParams({
        ...Lab.schemaDefaults(), ...Lab.effects[preset.effect].defaults, ...preset.params, ...keep,
      });
      apply({ restart: true });
    }

    function changeParam(key, value) {
      if (state.params[key] === value) return;
      state.params[key] = value;
      state.modified = true;
      const def = Lab.paramSchema.find((d) => d.key === key);
      // 動きに関わる変更はすぐ最初から再生して違いを見せる（色や背景は再生位置を保つ）
      apply({ restart: def.replay !== false, lookOnly: def.replay === false });
    }

    const ui = new Lab.UI($('rightPanel'), {
      change: changeParam,
      reseed: () => changeParam('seed', (state.params.seed % 9999) + 1 + Math.floor(Math.random() * 50)),
    });
    const markPreset = Lab.UI.buildPresetList($('presetList'), pickPreset);

    // ---- 再生バー ----
    const btnPlay = $('btnPlay'), scrub = $('scrub'), timeLabel = $('timeLabel');
    const resetOrRestart = () => (isSim() ? sim.resetToStart() : timeline.restart());
    btnPlay.addEventListener('click', () => clock().toggle());
    $('btnRestart').addEventListener('click', resetOrRestart);
    $('btnStep').addEventListener('click', () => sim.stepFrame());
    let scrubbing = false;
    scrub.addEventListener('pointerdown', () => { scrubbing = true; clock().pause(); });
    scrub.addEventListener('input', () => { clock().pause(); clock().seek(scrub.value / 1000); });
    window.addEventListener('pointerup', () => { scrubbing = false; });

    const loopBtns = {};
    for (const [k, label] of [['once', '1回'], ['loop', 'ループ'], ['pingpong', '往復']]) {
      const b = Lab.el('button', null, label);
      b.type = 'button';
      b.addEventListener('click', () => setLoop(k));
      $('loopSeg').appendChild(b);
      loopBtns[k] = b;
    }
    function setLoop(k) {
      timeline.loop = k;
      sim.loop = k === 'once' ? 'once' : 'loop'; // シミュレーションに「往復」はない
      timeline.dir = 1;
      for (const id in loopBtns) loopBtns[id].classList.toggle('on', id === k);
      saveSession();
    }

    // ---- ビュー操作 ----
    const btnAuto = $('btnAutoRotate');
    btnAuto.addEventListener('click', () => {
      stage.controls.autoRotate = !stage.controls.autoRotate;
      btnAuto.classList.toggle('on', stage.controls.autoRotate);
    });
    $('btnResetView').addEventListener('click', () => stage.resetView());

    // ---- 記録 ----
    const memo = $('memo');
    memo.addEventListener('input', () => { state.memo = memo.value; saveSession(); });
    memo.addEventListener('keydown', (e) => e.stopPropagation());

    function extra() {
      return {
        playback: { loop: timeline.loop, progress: +clock().progress.toFixed(4) },
        camera: { ...stage.getView(), autoRotate: stage.controls.autoRotate },
      };
    }
    function saveShot(name) {
      Lab.record.download(stage.capture(), name + '.png');
    }
    function saveJson(name) {
      const data = Lab.record.buildJSON(state, extra());
      Lab.record.downloadText(JSON.stringify(data, null, 2), name + '.json');
    }
    $('btnShot').addEventListener('click', () => { saveShot(Lab.record.baseName(state)); toast('スクリーンショットを保存しました'); });
    $('btnSaveJson').addEventListener('click', () => { saveJson(Lab.record.baseName(state)); toast('設定をJSONで保存しました'); });
    $('btnSaveAll').addEventListener('click', () => {
      const name = Lab.record.baseName(state);
      saveShot(name);
      setTimeout(() => saveJson(name), 300);
      toast('画像とJSONを保存しました');
    });

    // Blenderへ出力：固定ステップで計算し直した動きを30fpsで記録してJSONに保存
    const btnBlender = $('btnBlender');
    btnBlender.addEventListener('click', async () => {
      if (!isSim()) { toast('Blenderへの出力は、いまはシミュレーションだけに対応しています'); return; }
      btnBlender.disabled = true;
      try {
        await chain; // 設定の反映が終わってから記録する
        const data = await Lab.blenderExport.build(state, { sim, stage }, { fps: parseInt($('blenderFps').value, 10) || 30 });
        Lab.record.downloadText(JSON.stringify(data), `3d-lab_blender_${Lab.record.baseName(state).replace(/^3d-lab_/, '')}_${data.timing.fps}fps.json`);
        toast(`Blender用JSONを保存しました（${data.objects.length}個・${data.timing.frameCount}フレーム・${data.timing.fps}fps）`);
      } catch (e) {
        console.error(e);
        toast('Blenderへの出力に失敗しました：' + e.message);
      } finally {
        btnBlender.disabled = !isSim();
      }
    });

    const fileInput = $('fileInput');
    $('btnLoadJson').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) loadFile(fileInput.files[0]);
      fileInput.value = '';
    });

    async function loadFile(file) {
      try {
        const r = Lab.record.parseJSON(await file.text());
        if (document.activeElement) document.activeElement.blur(); // 入力欄にも復元した値を反映させる
        state.effect = r.effect;
        state.presetId = r.presetId;
        state.modified = r.modified;
        state.params = r.params;
        state.memo = r.memo;
        memo.value = r.memo;
        if (['once', 'loop', 'pingpong'].includes(r.playback.loop)) setLoop(r.playback.loop);
        if (r.camera) {
          stage.setView(r.camera);
          stage.controls.autoRotate = !!r.camera.autoRotate;
          btnAuto.classList.toggle('on', stage.controls.autoRotate);
        }
        const progress = typeof r.playback.progress === 'number' ? r.playback.progress : 1;
        await apply({ seek: progress });
        toast(`「${file.name}」から設定を復元しました`);
      } catch (e) {
        toast('読み込みに失敗しました：' + e.message);
      }
    }

    // ドラッグ＆ドロップで復元
    const dz = $('dropzone');
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; dz.classList.add('show'); });
    window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dz.classList.remove('show'); } });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      dz.classList.remove('show');
      const f = e.dataTransfer.files[0];
      if (f) loadFile(f);
    });

    // ---- キーボード ----
    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input[type=text], textarea, input[type=file]')) return;
      if (e.code === 'Space') { e.preventDefault(); clock().toggle(); }
      else if (e.key === 'r' || e.key === 'R') resetOrRestart();
      else if (e.key === 'ArrowRight' && isSim() && !e.target.matches('input[type=range]')) sim.stepFrame();
      else if (e.key === 'p' || e.key === 'P') { saveShot(Lab.record.baseName(state)); toast('スクリーンショットを保存しました'); }
    });

    // ---- 前回の状態を復元（なければ最初のプリセット） ----
    let restored = false;
    const saved = storageGet(SESSION_KEY);
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s && Lab.effects[s.effect]) {
          state.effect = s.effect;
          state.presetId = Lab.presetById(s.presetId) ? s.presetId : null;
          state.modified = !!s.modified;
          state.params = Lab.sanitizeParams(s.params);
          state.memo = typeof s.memo === 'string' ? s.memo : '';
          memo.value = state.memo;
          if (['once', 'loop', 'pingpong'].includes(s.loop)) setLoop(s.loop);
          restored = true;
        }
      } catch (e) { /* 壊れた保存データは無視 */ }
    }
    if (!loopBtns[timeline.loop].classList.contains('on')) setLoop(timeline.loop);
    if (restored) await apply({ restart: true });
    else pickPreset('g_text');
    await chain;
    $('loading').classList.remove('show');

    // ---- 描画ループ ----
    let last = performance.now();
    let lastPlaying = null;
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const c = clock();
      if (isSim()) {
        sim.update(dt);
      } else {
        timeline.update(dt);
        system.update(timeline.progress, state.params);
      }
      stage.render();

      if (!scrubbing) scrub.value = Math.round(c.progress * 1000);
      scrub.style.setProperty('--fill', c.progress * 100 + '%');
      timeLabel.textContent = `${c.time.toFixed(1)} / ${c.duration.toFixed(1)}s`;
      if (lastPlaying !== c.playing) {
        lastPlaying = c.playing;
        btnPlay.innerHTML = c.playing ? ICON_PAUSE : ICON_PLAY;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    Lab.app = { state, stage, system, timeline, sim, pickPreset, changeParam, apply }; // デバッグ用
  };
});

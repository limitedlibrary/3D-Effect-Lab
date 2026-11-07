/*
 * 比較モード：同じ演出を2〜4枠で並べ、枠ごとにカメラ・照明・マテリアルを変えて見比べる
 *
 * - 比較を始めると、A枠には1画面で編集中の演出（設定一式＋視点）をそのまま置き、B〜D枠には
 *   その案からカメラ（角度・高さ・距離）と見た目（質感・色・照明）の一部を変えた候補を自動で並べる
 * - 演出（動き）の設定は全枠で共通。枠ごとに変えられるのはカメラと「見た目」（params.js の look グループ）
 * - 再生位置は全枠で共有する。タイムライン型の演出は1つの Lab.Timeline の進行度で全枠を描き、
 *   シミュレーションは各枠の物理ワールドに同じ操作を送る（同じ設定・同じ乱数なので同じ動きになる）
 * - 「この案から比較」で、その枠の設定一式を A 枠に置き、残りの枠にその案から少しだけ変えた候補を並べた
 *   新しい比較を作る。元の比較（自動の候補・手動調整を含む）は履歴に残り、いつでも戻れる
 * - 「採用」でその枠の設定を1画面編集へ引き継ぐ。「比較をやめる」なら比較前の状態のまま1画面に戻る
 * 比較の履歴はページを開いている間だけ保持する（保存はしない）。
 */
Lab.modules.push(function () {
  const MAX = 4;
  const LETTERS = ['A', 'B', 'C', 'D'];
  const GEOMETRY_KEYS = ['count', 'shardType', 'seed']; // app.js と同じ（破片の作り直しが必要な項目）
  const LOOK_DEFS = Lab.paramSchema.filter((d) => d.group === 'look');
  const LOOK_KEYS = LOOK_DEFS.map((d) => d.key);
  // 枠の見出しに出す短い名前
  const SHORT = { palette: '色', background: '背景', glow: '光', dust: '光の粒', floor: 'グリッド', finish: '質感', lightDir: '照明', lightPower: '照明の強さ' };
  // カメラの候補（base は比較を始めたときの視点）
  const CAMERAS = {
    base: { label: '元の視点' },
    auto: { label: '自動の候補' }, // 自動で並べた候補の構図（候補の枠だけ）
    low: { label: '低い', position: [0, -1.9, 11.5], target: [0, 0.8, 0] },
    high: { label: '高い', position: [0, 10, 8], target: [0, -0.5, 0] },
    side: { label: '横から', position: [11, 1.8, 4.5], target: [0, 0, 0] },
    close: { label: '寄り', position: [0, 1.2, 7], target: [0, 0, 0] },
  };
  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z" fill="currentColor"/></svg>';
  const el = (tag, cls, text) => Lab.el(tag, cls, text);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const pickLook = (params) => { const o = {}; for (const k of LOOK_KEYS) o[k] = params[k]; return o; };

  // ---- 候補の自動生成（B〜D枠） ----
  // strength：1 は比較を始めたとき（適度に変える）、BRANCH_STRENGTH は「この案から比較」（少しずつ変える）
  const BRANCH_STRENGTH = 0.5;
  const DEG = Math.PI / 180;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // 構図の候補：注視点はそのままに、注視点の周りでカメラを回す・上げ下げする・寄せ引きする。
  // 注視点を動かさないので被写体は画面の中央付近に残り、距離と高さも範囲を決めて極端にならないようにする
  function varyCamera(base, move, s) {
    const t = base.target, p = base.position;
    const off = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
    const r = Math.hypot(off[0], off[1], off[2]) || 1;
    const elev = Math.asin(clamp(off[1] / r, -1, 1));
    const az = Math.atan2(off[0], off[2]);
    // 元の視点がもともと範囲の外なら、その値までは許す（元より極端にはしない）
    const elevMin = Math.min(3 * DEG, elev), elevMax = Math.max(55 * DEG, elev);
    const rMin = Math.min(5, r), rMax = Math.max(26, r);
    const az2 = az + move.yaw * rand(20, 35) * DEG * s;
    let elev2 = elev;
    if (move.elev > 0) elev2 = elev + rand(14, 24) * DEG * s;
    else if (move.elev < 0) elev2 = elev - rand(7, 12) * DEG * s;
    elev2 = clamp(elev2, elevMin, elevMax);
    let r2 = r;
    if (move.dist < 0) r2 = r * (1 - rand(0.08, 0.14) * s); // 寄りは控えめ（被写体がはみ出しにくいように）
    else if (move.dist > 0) r2 = r * (1 + rand(0.14, 0.24) * s);
    r2 = clamp(r2, rMin, rMax);
    const position = [
      t[0] + r2 * Math.cos(elev2) * Math.sin(az2),
      t[1] + r2 * Math.sin(elev2),
      t[2] + r2 * Math.cos(elev2) * Math.cos(az2),
    ];
    const parts = [move.yaw > 0 ? '右から' : '左から'];
    if (elev2 - elev > 2 * DEG) parts.push('高め');
    else if (elev - elev2 > 2 * DEG) parts.push('低め');
    if (r2 < r * 0.97) parts.push('寄り');
    else if (r2 > r * 1.03) parts.push('引き');
    return { camera: { position, target: t.slice() }, label: parts.join(' ') };
  }

  // 見た目の候補：質感・色・照明のうち選んだ項目だけ変える。used で候補どうしの値の重なりを避ける
  function varyLook(look, kind, used, s) {
    const fresh = (keys, cur, key) => {
      const all = keys.filter((k) => k !== cur);
      const unused = all.filter((k) => !used[key].has(k));
      const v = pickOne(unused.length ? unused : all);
      used[key].add(v);
      return v;
    };
    if (kind === 'finish') look.finish = fresh(Object.keys(Lab.finishes), look.finish, 'finish');
    else if (kind === 'palette') look.palette = fresh(Object.keys(Lab.palettes), look.palette, 'palette');
    else if (kind === 'light') {
      const p0 = typeof look.lightPower === 'number' ? look.lightPower : 1;
      const changePower = () => {
        // 明るすぎ・暗すぎにならない範囲（0.6〜1.6倍）で、元から 0.25〜0.45倍ぶん（少しずつなら半分）変える
        const d = rand(0.25, 0.45) * s;
        const up = p0 + d <= 1.6 && (p0 - d < 0.6 || Math.random() < 0.5);
        look.lightPower = Math.round(clamp(up ? p0 + d : p0 - d, 0.6, 1.6) * 20) / 20;
      };
      if (s < 1 && Math.random() < 0.5) changePower(); // 少しずつ変えるときは、強さだけのこともある
      else {
        look.lightDir = fresh(Object.keys(Lab.lightDirs), look.lightDir, 'lightDir');
        if (Math.random() < 0.4) changePower();
      }
    }
  }

  // 基準の案（params と camera）から、候補 n 個ぶんの枠を作る。
  // どの候補も構図と見た目の両方を変える（2枠でも両方の違いが見える）。変える見た目の項目は候補ごとに替える
  function makeCandidates(base, n, s) {
    const yawStart = Math.random() < 0.5 ? 1 : -1;
    const elevs = shuffle([1, -1, 0]);
    const dists = shuffle([-1, 1, 0]);
    const kinds = shuffle(['finish', 'palette', 'light']);
    const used = { finish: new Set(), palette: new Set(), lightDir: new Set() };
    const out = [];
    for (let k = 0; k < n; k++) {
      const move = { yaw: k % 2 ? -yawStart : yawStart, elev: elevs[k % 3], dist: dists[k % 3] };
      if (!move.elev && !move.dist) move.dist = s < 1 ? 0 : 1; // 回り込みだけだと差が小さいので、最初の比較では引きも加える
      const cam = varyCamera(base.camera, move, s);
      const look = pickLook(base.params);
      const changes = [kinds[k % 3]];
      // 最初の比較では、半分くらいの候補でもう1項目変える（全項目を一律には変えない）
      if (s >= 1 && Math.random() < 0.5) changes.push(kinds[(k + 1 + Math.floor(Math.random() * 2)) % 3]);
      for (const kind of changes) varyLook(look, kind, used, s);
      out.push({ look, camera: cam.camera, camPreset: 'auto', autoCamera: clone(cam.camera), camLabel: cam.label });
    }
    return out;
  }

  function button(cls, text, title) {
    const b = el('button', cls, text);
    b.type = 'button';
    if (title) b.title = title;
    return b;
  }

  function valueLabel(def, v) {
    if (def.type === 'swatch') return (Lab.palettes[v] || {}).label || String(v);
    if (def.type === 'segment') return Lab.optionLabel(def.key, v);
    if (def.type === 'toggle') return v ? 'あり' : 'なし';
    if (def.type === 'range') return def.format ? def.format(v) : Math.round(v * 100) + '%';
    return String(v);
  }

  // ---- 1枠ぶんの表示（それぞれ自分のレンダラー・シーン・破片・物理ワールドを持つ） ----
  class Viewer {
    constructor(index, host, cmp) {
      this.index = index;
      this.el = el('div', 'cmp-frame');
      host.appendChild(this.el);
      this.stage = new Lab.Stage(this.el);
      this.system = new Lab.ShardSystem(this.stage);
      this.sim = new Lab.SimController(this.stage);
      this.geoKey = null;

      const tl = el('div', 'overlay tl');
      this.badge = el('span', 'badge');
      tl.appendChild(this.badge);
      const tr = el('div', 'overlay tr');
      const branch = button('chip', 'この案から比較', 'この枠の設定一式を起点に、新しい比較を作ります（今の比較は残ります）');
      const adopt = button('chip', '採用', 'この枠の設定を引き継いで1画面編集に戻ります');
      branch.addEventListener('click', (e) => { e.stopPropagation(); cmp.branch(index); });
      adopt.addEventListener('click', (e) => { e.stopPropagation(); cmp.adopt(index); });
      tr.append(branch, adopt);
      this.loading = el('div', 'loading', '読み込み中…');
      this.el.append(tl, tr, this.loading);

      this.el.addEventListener('pointerdown', () => cmp.select(index));
      const c = this.stage.controls;
      c.addEventListener('start', () => cmp.onCameraStart(index));
      c.addEventListener('change', () => cmp.onCameraChange(index));
      c.addEventListener('end', () => cmp.refreshLabels());
    }

    set visible(on) { this.el.hidden = !on; }

    // 視点を置き換える。直前のドラッグの惰性（減衰中の回転）を先に消しておかないと、
    // 置き換えた後もしばらく回り続けて、別の比較の視点として記録されてしまう
    setView(view) {
      const c = this.stage.controls;
      c.enableDamping = false;
      c.update(); // 減衰中の回転・移動をここで使い切る
      c.enableDamping = true;
      this.stage.setView(view);
    }

    setLoading(on) { this.loading.classList.toggle('show', on); }

    // 1画面編集の applySim / applyEffect と同じ手順で、この枠に設定を反映する
    async apply(effect, p, lookOnly) {
      if (effect.kind === 'sim') {
        this.system.setVisible(false);
        this.sim.setActive(true);
        this.stage.applyLook(p);
        this.stage.bloom.strength *= 0.35; // 1画面と同じく、立体の物体では発光を控えめに
        if (!lookOnly || !this.sim.world) await this.sim.configure(p);
        this.sim.applyLook(p);
        return;
      }
      this.sim.setActive(false);
      this.system.setVisible(true);
      const key = Lab.shapes.cacheKey(p) + '|' + GEOMETRY_KEYS.map((k) => p[k]).join('|');
      if (key !== this.geoKey) {
        await Lab.shapes.prepare(p);
        const shape = Lab.shapes.sample(p, Lab.util.mulberry32(p.seed * 9973 + 7));
        this.system.build(p, shape);
        this.geoKey = key;
        lookOnly = false;
      }
      if (lookOnly) this.system.applyLook(p);
      else this.system.configure(effect, p);
      this.stage.applyLook(p);
    }
  }

  Lab.Compare = class {
    // handlers: { adopt(result), cancel(), toast(msg) }
    constructor(root, handlers) {
      this.root = root;
      this.h = handlers;
      this.active = false;
      this.viewers = [];
      this.history = [];
      this.cur = -1;
      this.timeline = new Lab.Timeline();
      this.loop = 'once';
      this.busy = false;
      this.chain = Promise.resolve();
      this.loadGen = 0;     // 読み込みの依頼番号（新しい依頼が来たら、古い読み込みは途中でやめる）
      this.resume = null;   // 読み込みが終わったら戻す再生状態（連続して依頼されても最初の状態を保つ）
      this.build();
    }

    get c() { return this.history[this.cur]; }
    get effect() { return Lab.effects[this.c.base.effect]; }
    get isSim() { return this.effect.kind === 'sim'; }
    get shown() { return this.viewers.slice(0, this.c.count); }
    // 再生位置を読み取る相手（シミュレーションは全枠が同じ状態なので A の枠で代表する）
    get lead() { return this.isSim ? this.viewers[0].sim : this.timeline; }

    // c を渡すと、今表示中ではない比較（読み込み中に切り替えられた比較など）の値を取れる
    frameParams(i, c = this.c) {
      return { ...c.base.params, ...c.frames[i].look };
    }

    // ---- 画面の組み立て ----
    build() {
      const main = el('div', 'cmp-main');
      this.grid = el('div', 'cmp-grid');
      main.appendChild(this.grid);

      // 共有の再生バー
      const bar = el('div', 'timeline');
      this.btnPlay = button('icon-btn play', '', '全枠を再生 / 停止（Space）');
      this.btnRestart = button('icon-btn', '', '全枠を最初から再実行（R）');
      this.btnRestart.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" fill="currentColor"/></svg>';
      this.btnStep = button('icon-btn', '', '全枠をコマ送り（→）');
      this.btnStep.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 5v14l9-7zM16 5h2.5v14H16z" fill="currentColor"/></svg>';
      this.scrub = el('input');
      this.scrub.type = 'range';
      this.scrub.min = 0; this.scrub.max = 1000; this.scrub.value = 0;
      this.scrub.setAttribute('aria-label', '再生位置（全枠共通）');
      this.timeLabel = el('span', 'time', '0.0 / 3.0s');
      const loopSeg = el('div', 'seg small');
      loopSeg.setAttribute('aria-label', '繰り返し');
      this.loopBtns = {};
      for (const [k, label] of [['once', '1回'], ['loop', 'ループ'], ['pingpong', '往復']]) {
        const b = button(null, label);
        b.addEventListener('click', () => this.setLoop(k));
        loopSeg.appendChild(b);
        this.loopBtns[k] = b;
      }
      bar.append(this.btnPlay, this.btnRestart, this.btnStep, this.scrub, this.timeLabel, loopSeg);
      main.appendChild(bar);

      this.btnPlay.addEventListener('click', () => this.toggle());
      this.btnRestart.addEventListener('click', () => this.restart());
      this.btnStep.addEventListener('click', () => this.stepFrame());
      this.scrubbing = false;
      this.scrub.addEventListener('pointerdown', () => { this.scrubbing = true; this.pause(); });
      this.scrub.addEventListener('input', () => { this.pause(); this.seek(this.scrub.value / 1000); });
      window.addEventListener('pointerup', () => { this.scrubbing = false; });

      // 右パネル：比較の履歴・枠数・選んだ枠の調整・採用 / 取りやめ
      const side = el('aside', 'panel cmp-side');
      const head = el('section');
      head.appendChild(el('h2', null, '比較モード'));
      this.historyList = el('div', 'cmp-history');
      head.appendChild(this.historyList);
      const countCtrl = el('div', 'ctrl');
      const countHead = el('div', 'ctrl-head');
      countHead.appendChild(el('label', null, '並べる数'));
      countCtrl.appendChild(countHead);
      const countSeg = el('div', 'seg');
      this.countBtns = {};
      for (let n = 2; n <= MAX; n++) {
        const b = button(null, n + '枠');
        b.addEventListener('click', () => this.setCount(n));
        countSeg.appendChild(b);
        this.countBtns[n] = b;
      }
      countCtrl.appendChild(countSeg);
      head.appendChild(countCtrl);
      head.appendChild(el('p', 'note', '再生・停止・再生位置は全枠で共通です。枠をクリックすると、その枠の見え方を下で調整できます。'));
      side.appendChild(head);

      const adjust = el('section');
      this.adjustTitle = el('h2');
      adjust.appendChild(this.adjustTitle);
      // カメラ
      const camCtrl = el('div', 'ctrl');
      const camHead = el('div', 'ctrl-head');
      camHead.appendChild(el('label', null, 'カメラ'));
      camCtrl.appendChild(camHead);
      const camSeg = el('div', 'seg');
      this.camBtns = {};
      for (const [k, d] of Object.entries(CAMERAS)) {
        const b = button(null, d.label);
        b.addEventListener('click', () => this.setCamera(this.c.selected, k));
        camSeg.appendChild(b);
        this.camBtns[k] = b;
      }
      camCtrl.appendChild(camSeg);
      camCtrl.appendChild(el('p', 'note', '枠の中をドラッグで回転、ホイールで寄り・引き、右ドラッグで移動できます。'));
      adjust.appendChild(camCtrl);
      // 照明・マテリアルなどの見た目（params.js の look グループをそのまま使う）
      const ctx = { h: { change: (k, v) => this.changeLook(k, v) } };
      this.lookCtrls = LOOK_DEFS.map((def) => {
        const c = Lab.UI.prototype.makeControl.call(ctx, def);
        adjust.appendChild(c.el);
        return c;
      });
      side.appendChild(adjust);

      const actions = el('section');
      actions.appendChild(el('h2', null, '選んだ案をどうするか'));
      const grid = el('div', 'btn-grid');
      this.btnBranch = button(null, 'この案から次の比較', '選んだ枠の設定一式を起点に、新しい比較を作ります');
      this.btnAdopt = button('primary', 'この案を採用して1画面に戻る');
      const btnCancel = button(null, '比較をやめる', '比較を始める前の編集状態に戻ります');
      this.btnBranch.addEventListener('click', () => this.branch(this.c.selected));
      this.btnAdopt.addEventListener('click', () => this.adopt(this.c.selected));
      btnCancel.addEventListener('click', () => this.cancel());
      grid.append(this.btnAdopt, this.btnBranch, btnCancel);
      actions.appendChild(grid);
      side.appendChild(actions);

      this.root.append(main, side);
    }

    viewer(i) {
      while (this.viewers.length <= i) this.viewers.push(new Viewer(this.viewers.length, this.grid, this));
      return this.viewers[i];
    }

    // ---- 比較の作成・切り替え ----
    // A 枠は基準の案そのまま、B〜D 枠は自動の候補（strength は makeCandidates を参照）
    makeComparison(base, from, count, strength) {
      const a = { look: pickLook(base.params), camera: clone(base.camera), camPreset: 'base' };
      return {
        title: '比較' + (this.history.length + 1),
        from,
        base,
        count,
        selected: 0,
        frames: [a, ...makeCandidates(base, MAX - 1, strength)],
      };
    }

    // snapshot: { effect, presetId, modified, params, camera, loop }
    open(snapshot) {
      this.history = [];
      this.resume = null;
      this.origin = clone(snapshot);
      this.history.push(this.makeComparison(clone(snapshot), null, MAX, 1));
      this.cur = 0;
      this.active = true;
      this.root.hidden = false;
      this.setLoop(['once', 'loop', 'pingpong'].includes(snapshot.loop) ? snapshot.loop : 'once');
      return this.load({ restart: true });
    }

    close() {
      this.loadGen++; // 途中の読み込みがあれば打ち切る
      this.resume = null;
      this.pause();
      this.active = false;
      this.root.hidden = true;
    }

    switchTo(i) {
      if (i === this.cur || !this.history[i]) return;
      this.cur = i;
      this.load({ keep: true });
    }

    // 選んだ枠の設定一式（演出・見た目・視点）を起点に、新しい比較を作る
    branch(i) {
      if (this.busy) return;
      const c = this.c, f = c.frames[i];
      const base = clone({ ...c.base, params: this.frameParams(i), camera: f.camera });
      const from = `${c.title}の案${LETTERS[i]}`;
      this.history.push(this.makeComparison(base, from, c.count, BRANCH_STRENGTH));
      this.cur = this.history.length - 1;
      this.h.toast(`${this.c.title}を作りました（${from}から）`);
      this.load({ keep: true });
    }

    setCount(n) {
      if (this.busy || n === this.c.count) return;
      this.c.count = n;
      if (this.c.selected >= n) this.c.selected = 0;
      this.load({ keep: true });
    }

    // 枠の表示と設定をそろえ、再生位置を全枠で合わせる
    load({ restart = false, keep = false } = {}) {
      const gen = ++this.loadGen;
      // 依頼した時点の再生状態を覚えておく（前の読み込みが途中なら、その前の状態をそのまま引き継ぐ）
      if (keep && !this.resume && this.viewers.length) this.resume = { playing: this.lead.playing, progress: this.lead.progress };
      // 読み込みが終わるまで、どの枠もどの比較にも視点を書き戻さない（比較どうしで設定が混ざらないように）
      for (const v of this.viewers) v.shows = null;
      this.chain = this.chain.then(() => this.doLoad(gen, restart, keep)).catch((e) => {
        console.error(e);
        this.h.toast('比較の準備に失敗しました：' + e.message);
      }).finally(() => { this.busy = false; });
      return this.chain;
    }

    async doLoad(gen, restart, keep) {
      if (gen !== this.loadGen) return; // もっと新しい依頼がある
      this.busy = true;
      const c = this.c, eff = Lab.effects[c.base.effect];
      const stale = () => gen !== this.loadGen || c !== this.c;
      const resume = keep ? this.resume : null;
      const wasPlaying = resume ? resume.playing : false;
      const progress = resume ? resume.progress : 0;
      this.pause();
      this.grid.className = 'cmp-grid n' + c.count;
      for (let i = 0; i < MAX; i++) {
        if (i < c.count) this.viewer(i).visible = true;
        else if (this.viewers[i]) this.viewers[i].visible = false;
      }
      this.btnStep.hidden = !this.isSim;
      this.loopBtns.pingpong.hidden = this.isSim;
      if (this.isSim && this.loop === 'pingpong') this.setLoop('loop');
      this.refreshSide();
      this.refreshLabels();

      this.dragging = null;
      for (let i = 0; i < c.count; i++) {
        const v = this.viewers[i];
        v.setView(c.frames[i].camera);
        v.setLoading(true);
      }
      try {
        for (let i = 0; i < c.count; i++) {
          await this.viewers[i].apply(eff, this.frameParams(i, c), false);
          if (stale()) return; // 読み込み中に別の比較へ切り替えられた：続きは新しい読み込みに任せる
          this.viewers[i].setLoading(false);
        }
      } catch (e) {
        if (this.isSim) throw new Error('物理エンジンを読み込めませんでした。インターネット接続を確認してください。');
        throw e;
      } finally {
        if (!stale()) for (const v of this.shown) v.setLoading(false);
      }
      // ここまで来たら全枠が c の設定になっている。視点の書き戻し先を c に決める
      this.resume = null;
      this.shown.forEach((v, i) => { v.setView(c.frames[i].camera); v.shows = c; });

      if (this.isSim) {
        for (const v of this.shown) v.sim.loop = this.loop === 'once' ? 'once' : 'loop';
        if (progress > 0) for (const v of this.shown) v.sim.seek(progress);
      } else {
        this.timeline.setDuration(c.base.params.duration);
        this.timeline.seek(progress);
      }
      if (restart) this.restart();
      else if (wasPlaying) this.play();
    }

    // ---- 共有の再生操作（全枠へ同じ操作を送る） ----
    play() {
      if (this.isSim) for (const v of this.shown) v.sim.play();
      else this.timeline.play();
    }

    pause() {
      if (!this.c || !this.viewers.length) return;
      if (this.isSim) for (const v of this.shown) v.sim.pause();
      else this.timeline.pause();
    }

    toggle() {
      if (this.busy) return;
      this.lead.playing ? this.pause() : this.play();
    }

    restart() {
      if (this.isSim) for (const v of this.shown) v.sim.resetToStart();
      else this.timeline.restart();
      if (this.isSim) this.play();
    }

    // R キー・↻ ボタン：シミュレーションは1画面と同じく初期状態へ戻して止める
    resetOrRestart() {
      if (this.busy) return;
      if (this.isSim) for (const v of this.shown) v.sim.resetToStart();
      else this.timeline.restart();
    }

    stepFrame() {
      if (this.busy || !this.isSim) return;
      for (const v of this.shown) v.sim.stepFrame();
    }

    seek(p) {
      if (this.busy) return;
      if (this.isSim) for (const v of this.shown) v.sim.seek(p);
      else this.timeline.seek(p);
    }

    setLoop(k) {
      this.loop = k;
      this.timeline.loop = k;
      this.timeline.dir = 1;
      for (const v of this.viewers) v.sim.loop = k === 'once' ? 'once' : 'loop';
      for (const id in this.loopBtns) this.loopBtns[id].classList.toggle('on', id === k);
    }

    // ---- 枠ごとの調整 ----
    select(i) {
      if (!this.c || i >= this.c.count || i === this.c.selected) return;
      this.c.selected = i;
      this.refreshSide();
      this.refreshLabels();
    }

    changeLook(key, value) {
      const c = this.c, i = c.selected;
      if (c.frames[i].look[key] === value) return;
      c.frames[i].look[key] = value;
      // 反映する時点でもその枠が同じ比較を表示しているときだけ反映する（違えば次の読み込みが反映する）
      this.chain = this.chain.then(() => {
        const v = this.viewers[i];
        if (v && v.shows === c) return v.apply(Lab.effects[c.base.effect], this.frameParams(i, c), true);
      }).catch((e) => console.error(e));
      this.refreshSide();
      this.refreshLabels();
    }

    setCamera(i, id) {
      const f = this.c.frames[i];
      const d = CAMERAS[id];
      this.dragging = null;
      if (id === 'auto' && !f.autoCamera) return;
      f.camPreset = id;
      f.camera = clone(id === 'base' ? this.c.base.camera : id === 'auto' ? f.autoCamera : { position: d.position, target: d.target });
      const v = this.viewers[i];
      if (v && v.shows === this.c) v.setView(f.camera); // 読み込み中なら、読み込みの最後に反映される
      this.refreshSide();
      this.refreshLabels();
    }

    // マウスで視点を動かした枠だけ「カメラ：調整」にする（クリックで選ぶだけなら変えない）
    onCameraStart(i) {
      this.dragging = i;
    }

    onCameraChange(i) {
      const v = this.viewers[i], c = v && v.shows;
      if (!c || c !== this.c || i >= c.count) return; // 読み込み中・別の比較を表示中なら書き戻さない
      const f = c.frames[i];
      f.camera = v.stage.getView();
      if (this.dragging === i && f.camPreset !== 'custom') {
        f.camPreset = 'custom';
        if (i === this.c.selected) this.refreshSide();
      }
    }

    // 枠の見出し：起点（その比較を作ったときの設定）から何を変えたか
    describe(i) {
      const c = this.c, f = c.frames[i];
      const parts = [];
      if (f.camPreset === 'custom') parts.push('カメラ：調整');
      else if (f.camPreset === 'auto') parts.push('カメラ：' + f.camLabel);
      else if (f.camPreset !== 'base') parts.push('カメラ：' + CAMERAS[f.camPreset].label);
      for (const def of LOOK_DEFS) {
        if (f.look[def.key] !== c.base.params[def.key]) parts.push(`${SHORT[def.key] || def.label}：${valueLabel(def, f.look[def.key])}`);
      }
      return parts.length ? parts.join('・') : '基準';
    }

    refreshLabels() {
      if (!this.c) return;
      const c = this.c;
      this.shown.forEach((v, i) => {
        v.badge.textContent = `${LETTERS[i]}｜${this.describe(i)}`;
        v.el.classList.toggle('sel', i === c.selected);
      });
    }

    refreshSide() {
      const c = this.c, i = c.selected, f = c.frames[i];
      const sim = this.isSim;
      // 履歴
      this.historyList.innerHTML = '';
      this.history.forEach((h, k) => {
        const b = button('cmp-tab' + (k === this.cur ? ' on' : ''), h.title);
        if (h.from) b.appendChild(el('span', 'from', '← ' + h.from));
        b.addEventListener('click', () => this.switchTo(k));
        this.historyList.appendChild(b);
      });
      for (const n in this.countBtns) this.countBtns[n].classList.toggle('on', +n === c.count);
      // 選んだ枠の調整
      this.adjustTitle.textContent = `案${LETTERS[i]} の見え方`;
      for (const k in this.camBtns) this.camBtns[k].classList.toggle('on', k === f.camPreset);
      this.camBtns.auto.hidden = !f.autoCamera; // A 枠（基準）には自動の候補がない
      const params = this.frameParams(i);
      for (const ctl of this.lookCtrls) {
        const d = ctl.def;
        let show = !d.effects || d.effects.includes(c.base.effect);
        if (sim && !d.sim && !(d.effects && d.effects.includes('sim'))) show = false;
        ctl.el.hidden = !show;
        ctl.set(params[d.key]);
      }
      this.btnBranch.textContent = `案${LETTERS[i]}から次の比較`;
      this.btnAdopt.textContent = `案${LETTERS[i]}を採用して1画面に戻る`;
    }

    // ---- 採用 / 取りやめ ----
    adopt(i) {
      if (this.busy) return;
      const c = this.c, f = c.frames[i];
      const params = this.frameParams(i);
      const changed = LOOK_KEYS.some((k) => params[k] !== this.origin.params[k]);
      const result = {
        effect: c.base.effect,
        presetId: c.base.presetId,
        modified: !!this.origin.modified || changed,
        params: clone(params),
        camera: clone(f.camera),
        loop: this.loop,
        label: `${c.title}の案${LETTERS[i]}`,
      };
      this.close();
      this.h.adopt(result);
    }

    cancel() {
      this.close();
      this.h.cancel();
    }

    handleKey(e) {
      if (e.code === 'Space') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'r' || e.key === 'R') this.resetOrRestart();
      else if (e.key === 'ArrowRight' && this.isSim && !e.target.matches('input[type=range]')) this.stepFrame();
    }

    // ---- 描画（app.js の描画ループから毎フレーム呼ばれる） ----
    frame(dt) {
      if (!this.c || !this.viewers.length) return;
      const shown = this.shown;
      if (!this.busy) {
        if (this.isSim) {
          for (const v of shown) v.sim.update(dt);
        } else {
          this.timeline.update(dt);
          shown.forEach((v, i) => v.system.update(this.timeline.progress, this.frameParams(i)));
        }
      }
      for (const v of shown) v.stage.render();

      const lead = this.lead;
      if (!this.scrubbing) this.scrub.value = Math.round(lead.progress * 1000);
      this.scrub.style.setProperty('--fill', lead.progress * 100 + '%');
      this.timeLabel.textContent = `${lead.time.toFixed(1)} / ${lead.duration.toFixed(1)}s`;
      if (this.lastPlaying !== lead.playing) {
        this.lastPlaying = lead.playing;
        this.btnPlay.innerHTML = lead.playing ? ICON_PAUSE : ICON_PLAY;
      }
    }
  };
});

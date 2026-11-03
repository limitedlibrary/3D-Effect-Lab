/*
 * シミュレーションの操作役
 *
 * 「何を動かすか（subjects）」「どう動かすか（rules）」「周辺環境（environment）」を組み合わせて
 * 物理ワールドを作り、再生・一時停止・初期状態へのリセット・コマ送り・再生位置の移動を担当します。
 *
 * タイムライン型の演出（Lab.Timeline）は「時刻 t を決めれば見た目が決まる」のに対し、
 * シミュレーションは「前の状態から1ステップずつ進める」ものなので、別の再生役として分けています。
 * 再生位置を戻すときは、初期状態から同じ回数だけ計算し直して同じ場面を再現します。
 */
Lab.modules.push(function () {
  const U = Lab.util;
  const DT = Lab.SimWorld.DT;
  const FLOOR_Y = Lab.simEnvironment.FLOOR_Y;
  const LOOP_WAIT = 0.8;
  const MAX_STEPS_PER_FRAME = 8;

  // 演出の一覧に「シミュレーション」として登録（左パネル・JSONの effect に使われる）
  Lab.registerEffect({
    id: 'sim',
    kind: 'sim',
    label: 'シミュレーション',
    description: '重力や衝突で物体を動かす',
    defaults: {},
  });

  // 初期配置（ランダムでも乱数の種が同じなら毎回同じ）
  function placeSpawns(items, params, rng) {
    const tilt = params.simTilt;
    const maxR = Math.max(...items.map((it) => it.radius));
    const minY = Math.min(...items.map((it) => it.layout.y - it.radius));
    const qTmp = new THREE.Quaternion(), axis = new THREE.Vector3();

    // 重ならないように格子のマスへ割り当てる
    const cells = (nx, nz, ny, cw, y0, ch) => {
      const list = [];
      for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
        list.push(new THREE.Vector3((x - (nx - 1) / 2) * cw, y0 + y * ch, (z - (nz - 1) / 2) * cw));
      }
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };

    if (params.simSpawn === 'pile') {
      const cw = Math.max(0.6, maxR * 2 + 0.25);
      const nx = Math.max(1, Math.floor(12 / cw)), nz = Math.max(1, Math.floor(6 / cw));
      const free = cells(nx, nz, Math.ceil(items.length / (nx * nz)), cw, 0, maxR * 2 + 0.3);
      items.forEach((it, i) => {
        const c = free[i];
        // 文字は床に寝かせ、図形はそのまま置く
        const lying = it.halfDepth < it.radius * 0.6;
        it.spawn = {
          p: new THREE.Vector3(c.x, FLOOR_Y + (lying ? it.halfDepth : it.radius) + 0.02 + c.y, c.z),
          q: new THREE.Quaternion().setFromEuler(new THREE.Euler(lying ? -Math.PI / 2 : 0, 0, (rng() - 0.5) * Math.PI * 2 * Math.max(0.15, tilt), 'XZY')),
        };
      });
      return;
    }

    if (params.simSpawn === 'scatter') {
      const cw = maxR * 2 + 0.3;
      const nx = Math.max(1, Math.floor(11 / cw)), nz = Math.max(1, Math.floor(4 / cw));
      const free = cells(nx, nz, Math.ceil(items.length / (nx * nz)) + 1, cw, FLOOR_Y + 1 + params.simHeight, cw);
      items.forEach((it, i) => {
        U.randomUnit(rng, axis);
        it.spawn = {
          p: free[i].clone(),
          q: new THREE.Quaternion().setFromAxisAngle(axis, rng() * Math.PI * 2 * Math.max(0.3, tilt)),
        };
      });
      return;
    }

    // 並んだまま空中へ
    items.forEach((it) => {
      U.randomUnit(rng, axis);
      const jitter = tilt * 0.35;
      it.spawn = {
        p: new THREE.Vector3(
          it.layout.x + (rng() - 0.5) * jitter,
          FLOOR_Y + 0.3 + params.simHeight + (it.layout.y - minY) + (rng() - 0.5) * jitter,
          (rng() - 0.5) * jitter
        ),
        q: qTmp.setFromAxisAngle(axis, (rng() - 0.5) * tilt * 1.6).clone(),
      };
    });
  }

  Lab.SimController = class {
    constructor(stage) {
      this.stage = stage;
      this.root = new THREE.Group();
      this.root.visible = false;
      stage.scene.add(this.root);
      this.items = [];
      this.labels = [];
      this.world = null;
      this.playing = false;
      this.loop = 'once';
      this.acc = 0;
      this.wait = 0;
      this.duration = 8;
      this.speed = 1;
      this.assetKey = null;
      this.envKey = null;
    }

    setActive(on) {
      this.root.visible = on;
      this.stage.setShadows(on);
      if (!on) this.playing = false;
    }

    // ---- 設定の反映 ----
    async configure(params) {
      const R = await Lab.loadRapier();
      const subject = Lab.simSubjects[params.simSubject] || Lab.simSubjects.text;
      if (subject.prepare) await subject.prepare(params);

      const assetKey = JSON.stringify([params.simSubject, params.simSplit, params.simShape, params.simCount, params.seed,
        params.simSubject === 'text' ? [Lab.shapes.cacheKey({ ...params, shape: 'text' })] : 0]);
      if (assetKey !== this.assetKey) {
        if (this.subjectGroup) {
          this.root.remove(this.subjectGroup);
          this.subjectGroup.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
        }
        const made = subject.create(params, U.mulberry32(params.seed * 131 + 5));
        this.items = made.items;
        this.subjectGroup = new THREE.Group();
        for (const it of this.items) this.subjectGroup.add(it.object);
        this.root.add(this.subjectGroup);
        this.assetKey = assetKey;
        this.lookKey = null;
      }
      this.labels = this.items.map((it) => it.label);

      const envKey = JSON.stringify([params.simFloor, params.simWalls, params.simObstacles]);
      if (envKey !== this.envKey) {
        if (this.env) this.root.remove(this.env.object);
        this.env = Lab.simEnvironment.build(params);
        this.root.add(this.env.object);
        this.envKey = envKey;
      }

      const rule = Lab.simRules[params.simForce] || Lab.simRules.none;
      for (const it of this.items) {
        it.home = new THREE.Vector3(it.layout.x, it.layout.y + params.simTargetHeight, 0);
      }
      placeSpawns(this.items, params, U.mulberry32(params.seed * 977 + 11));
      this.buildMarkers(params, rule);

      this.params = params;
      this.duration = params.simDuration;
      this.speed = parseFloat(params.simSpeed) || 1;
      if (!this.world) this.world = new Lab.SimWorld(R);
      this.applyLook(params);
      this.reset();
    }

    // 力の目標（整列先・引き寄せる点・反発の中心）を薄く表示する
    buildMarkers(params, rule) {
      if (this.markers) this.root.remove(this.markers);
      const g = (this.markers = new THREE.Group());
      const mat = new THREE.MeshBasicMaterial({ color: '#9fb3d9', transparent: true, opacity: 0.05, depthWrite: false });
      if (rule.id === 'align') {
        for (const it of this.items) {
          const meshes = it.object.isMesh ? [it.object] : it.object.children.filter((o) => o.isMesh);
          for (const o of meshes) {
            const ghost = new THREE.Mesh(o.geometry, mat);
            ghost.scale.copy(o.scale);
            ghost.position.copy(it.home);
            if (o !== it.object) ghost.position.add(o.position);
            g.add(ghost);
          }
        }
      } else if (rule.id === 'point') {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffe2a8' }));
        s.position.set(0, params.simTargetHeight, 0);
        g.add(s);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.015, 8, 48), mat.clone());
        ring.material.opacity = 0.35;
        ring.position.copy(s.position);
        g.add(ring);
      } else if (rule.id === 'repel') {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 48), new THREE.MeshBasicMaterial({ color: '#ff9a6b', transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = FLOOR_Y + 0.01;
        g.add(ring);
      }
      this.root.add(g);
    }

    applyLook(params) {
      const pal = Lab.palettes[params.palette] || Lab.palettes.library;
      const key = params.palette + '|' + params.glow;
      if (key === this.lookKey) return;
      this.lookKey = key;
      const glow = new THREE.Color(pal.glow);
      for (const it of this.items) {
        for (const m of it.materials) {
          const c = pal.colors[m.colorIndex % pal.colors.length];
          m.mats[0].color.set(c);
          m.mats[0].emissive.copy(glow).multiplyScalar(params.glow * 0.12);
          if (m.mats[1]) {
            m.mats[1].color.set(c).multiplyScalar(0.62);
            m.mats[1].emissive.copy(glow).multiplyScalar(params.glow * 0.05);
          }
        }
      }
    }

    // ---- 再生の操作（Lab.Timeline と同じ使い方ができる） ----
    get time() { return this.world ? this.world.time : 0; }
    get progress() { return U.clamp(this.time / this.duration, 0, 1); }

    reset() {
      if (!this.world) return;
      this.world.build(this.params, this.items, this.env);
      this.acc = 0;
      this.wait = 0;
      this.world.sync(1);
    }

    resetToStart() { this.reset(); this.playing = false; }
    restart() { this.reset(); this.playing = true; }
    play() { if (this.time >= this.duration - 1e-6) this.reset(); this.playing = true; }
    pause() { this.playing = false; }
    toggle() { this.playing ? this.pause() : this.play(); }

    stepFrame() {
      if (!this.world) return;
      this.playing = false;
      if (this.time < this.duration) this.world.stepOnce();
      this.acc = 0;
      this.world.sync(1);
    }

    // 再生位置へ移動：戻るときは初期状態から計算し直す（同じ結果になる）
    seek(p) {
      if (!this.world) return;
      const target = Math.round(U.clamp(p, 0, 1) * this.duration / DT);
      if (target < this.world.step) this.reset();
      while (this.world.step < target) this.world.stepOnce();
      this.acc = 0;
      this.wait = 0;
      this.world.sync(1);
    }

    update(dt) {
      if (!this.world) return;
      if (this.playing) {
        if (this.wait > 0) {
          this.wait -= dt;
          if (this.wait <= 0) this.reset();
        } else {
          this.acc += dt * this.speed;
          let n = 0;
          while (this.acc >= DT && n < MAX_STEPS_PER_FRAME) {
            this.world.stepOnce();
            this.acc -= DT;
            n++;
            if (this.time >= this.duration - 1e-6) {
              this.acc = 0;
              if (this.loop === 'once') this.playing = false;
              else this.wait = LOOP_WAIT;
              break;
            }
          }
          if (n === MAX_STEPS_PER_FRAME) this.acc = 0; // 処理が追いつかないときは遅らせて結果は変えない
        }
      }
      this.world.sync(this.playing && !this.wait ? this.acc / DT : 1);
    }
  };
});

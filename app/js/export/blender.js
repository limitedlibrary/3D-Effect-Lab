/*
 * Blenderへのアニメーション出力（シミュレーション用）
 *
 * 画面のプレビューとは別に、同じ設定・同じ乱数の種で「もう1つの物理ワールド」を作り、
 * 1/60秒の固定ステップで最初から計算し直して、指定fpsごとに各物体の位置・回転・スケールを記録します。
 * 表示のフレームレートや再生速度、一時停止・シーク操作には一切影響されません。
 *
 * 出力するJSONは Three.js の座標系（Y が上・右手系・1単位 = 1m）のままです。
 * Blender（Z が上）への変換は blender/lab_to_blender.py が行います。
 */
Lab.modules.push(function () {
  const FORMAT = '3d-lab-blender-anim';
  const VERSION = 1;
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  const hex = (c) => '#' + c.getHexString();

  // メッシュのマテリアルが、物体のマテリアル一覧（materialsOf の並び）の何番目から始まるか
  function materialSlot(item, material) {
    let slot = 0;
    for (const m of item.materials) {
      if (m.mats === material || m.mats.includes(material) || (Array.isArray(material) && material.includes(m.mats[0]))) return slot;
      slot += m.mats.length;
    }
    return 0;
  }

  // item.object（物理で動く単位）から見たメッシュの頂点・三角形・マテリアル番号を集める
  function meshData(item) {
    const root = item.object;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    // root 自身の拡大率はオブジェクトのスケールとして別に出すので、頂点は root のローカル座標にする
    const verts = [], faces = [], mats = [];
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const g = o.geometry, pos = g.attributes.position, base = verts.length / 3;
      const slot0 = materialSlot(item, o.material);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        verts.push(r6(v.x), r6(v.y), r6(v.z));
      }
      const idx = g.index ? g.index.array : null;
      const triCount = (idx ? idx.length : pos.count) / 3;
      const groups = g.groups.length ? g.groups : [{ start: 0, count: triCount * 3, materialIndex: 0 }];
      for (const gr of groups) {
        for (let k = gr.start; k < gr.start + gr.count; k += 3) {
          const a = idx ? idx[k] : k, b = idx ? idx[k + 1] : k + 1, c = idx ? idx[k + 2] : k + 2;
          faces.push(base + a, base + b, base + c);
          mats.push(slot0 + (Array.isArray(o.material) ? gr.materialIndex : 0));
        }
      }
    });
    return { vertices: verts, triangles: faces, materialIndex: mats };
  }

  // 物体の形の説明：基本図形は Blender でもきれいな基本図形として作り、文字はメッシュをそのまま渡す
  function shapeOf(item) {
    const o = item.object;
    if (o.isMesh && o.geometry && ['BoxGeometry', 'SphereGeometry', 'CylinderGeometry'].includes(o.geometry.type)) {
      const p = o.geometry.parameters;
      if (o.geometry.type === 'BoxGeometry') return { type: 'cube', size: [p.width, p.height, p.depth] };
      if (o.geometry.type === 'SphereGeometry') return { type: 'sphere', radius: p.radius, segments: p.widthSegments, rings: p.heightSegments };
      return { type: 'cylinder', radius: p.radiusTop, height: p.height, segments: p.radialSegments };
    }
    return { type: 'mesh', mesh: meshData(item) };
  }

  // 色はパレットと番号から決まる（画面と同じ計算）。文字全体で1つの物体のときは文字ごとに表面・側面の2つずつ
  function materialsOf(item, palette) {
    const pal = Lab.palettes[palette] || Lab.palettes.library;
    const out = [];
    item.materials.forEach((m, k) => {
      const base = new THREE.Color(pal.colors[m.colorIndex % pal.colors.length]);
      const tag = item.materials.length > 1 ? `${k}_` : '';
      out.push({ name: tag + 'face', color: hex(base), metalness: 0.35, roughness: 0.38 });
      if (m.mats[1]) out.push({ name: tag + 'side', color: hex(base.clone().multiplyScalar(0.62)), metalness: 0.35, roughness: 0.5 });
    });
    return out;
  }

  function envObject(pc, i) {
    const shape = pc.kind === 'cylinder'
      ? { type: 'cylinder', radius: pc.r, height: pc.hh * 2, segments: 32 }
      : { type: 'cube', size: [pc.hx * 2, pc.hy * 2, pc.hz * 2] };
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pc.rotZ || 0);
    return {
      id: `env_${String(i).padStart(2, '0')}`,
      role: pc.floor ? 'floor' : pc.glass ? 'wall' : 'obstacle',
      shape,
      position: pc.pos.map(r6),
      quaternion: [q.x, q.y, q.z, q.w].map(r6),
    };
  }

  /*
   * 固定ステップで計算し直して記録する。
   *   fps      : 出力フレームレート（60 を割り切れる値なら物理ステップそのものを記録。それ以外は隣のステップ間を補間）
   *   duration : 秒（省略時は「計算する長さ」）
   */
  async function bake(sim, params, opts = {}) {
    const fps = opts.fps || 30;
    const duration = opts.duration ?? params.simDuration;
    const DT = Lab.SimWorld.DT;
    const stepsPerFrame = 1 / (fps * DT);
    const exact = Math.abs(stepsPerFrame - Math.round(stepsPerFrame)) < 1e-9;
    const frameCount = Math.round(duration * fps) + 1; // 0秒の初期状態を含む
    const R = await Lab.loadRapier();
    const world = new Lab.SimWorld(R); // プレビュー用のワールドには触らない
    const items = sim.items;
    const tracks = items.map(() => ({ p: [], q: [], s: [] }));
    const qa = new THREE.Quaternion(), pa = new THREE.Vector3();
    try {
      world.build(params, items, sim.env);
      for (let f = 0; f < frameCount; f++) {
        const s = f * stepsPerFrame;
        const s0 = Math.floor(s + 1e-9);
        let a = s - s0;
        if (a < 1e-9) a = 0;
        const need = a ? s0 + 1 : s0;
        while (world.step < need) world.stepOnce();
        world.bodies.forEach((b, i) => {
          if (a) {
            pa.lerpVectors(b.prev.p, b.cur.p, a);
            qa.slerpQuaternions(b.prev.q, b.cur.q, a);
          } else {
            pa.copy(b.cur.p);
            qa.copy(b.cur.q);
          }
          const sc = items[i].object.scale;
          tracks[i].p.push([r6(pa.x), r6(pa.y), r6(pa.z)]);
          tracks[i].q.push([r6(qa.x), r6(qa.y), r6(qa.z), r6(qa.w)]);
          tracks[i].s.push([r6(sc.x), r6(sc.y), r6(sc.z)]);
        });
      }
    } finally {
      world.free();
    }

    const over = params.simOverrides || {};
    const objects = items.map((it, i) => ({
      id: `obj_${String(i).padStart(3, '0')}`,
      index: i,
      label: typeof it.label === 'string' ? it.label : String(it.label),
      shape: shapeOf(it),
      materials: materialsOf(it, params.palette),
      physics: {
        mass: (over[i] && over[i].mass) ?? params.simMass,
        restitution: (over[i] && over[i].restitution) ?? params.simRestitution,
        friction: params.simFriction,
        colliders: it.colliders,
      },
      track: tracks[i],
    }));

    return { fps, duration, frameCount, exact, stepsPerFrame, objects };
  }

  async function build(state, ctx, opts = {}) {
    const params = state.params;
    const baked = await bake(ctx.sim, params, opts);
    const preset = Lab.presetById(state.presetId);
    const cam = ctx.stage.camera;
    const view = ctx.stage.getView();
    return {
      format: FORMAT,
      version: VERSION,
      app: '3D演出ラボ',
      exportedAt: new Date().toISOString(),
      source: {
        effect: state.effect,
        preset: preset ? { id: preset.id, name: preset.name, modified: state.modified } : null,
        seed: params.seed,
        params: { ...params },
        physics: { engine: 'rapier3d-compat@0.14.0', step: Lab.SimWorld.DT, gravity: [0, -9.81 * params.simGravity, 0] },
      },
      coordinateSystem: {
        up: 'Y', forward: '-Z', handedness: 'right', unit: 'meter',
        note: 'Three.js の座標のまま。Blender（Z が上）へは (x, y, z) → (x, -z, y)、四元数 (x, y, z, w) → (w, x, -z, y) で変換',
      },
      rotation: 'quaternion [x, y, z, w]',
      timing: {
        fps: baked.fps,
        duration: baked.duration,
        frameCount: baked.frameCount,
        frameTime: 'frame i = i / fps 秒（i = 0 が初期状態）',
        physicsStepsPerFrame: baked.stepsPerFrame,
        sampling: baked.exact ? 'exact-physics-steps' : 'interpolated-between-physics-steps',
      },
      objects: baked.objects,
      environment: ctx.sim.env.pieces.map(envObject),
      camera: { fov: cam.fov, aspect: cam.aspect, position: view.position.map(r6), target: view.target.map(r6) },
      notExported: [
        '光（ライト・発光・Bloom）と背景色',
        '床グリッド・影だけの床・目標位置のマーカー表示',
        '物理演算そのもの（記録済みの動きを再生するだけ。Blender側で再計算はしない）',
      ],
    };
  }

  Lab.blenderExport = { FORMAT, VERSION, bake, build };
});

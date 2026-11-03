/*
 * シミュレーション：何を動かすか（Subject）
 *
 * 動かすものの種類ごとに Lab.registerSimSubject() で登録します。
 *   create(params, rng) → { items: [...] }
 *   item = {
 *     label     : 一覧に出す名前（文字なら1文字）
 *     object    : 表示用の THREE.Object3D（位置・向きは物理演算が毎フレーム上書き）
 *     colliders : 衝突形状 [{ kind: 'cuboid'|'ball'|'cylinder', hx, hy, hz | r | hh, r, offset: [x,y,z] }]
 *     volume    : 体積（重さ → 密度の換算に使う）
 *     radius    : おおよその大きさ（初期配置や回転力の計算に使う）
 *     layout    : 整列したときの位置（全体の中心からの相対位置 THREE.Vector3）
 *     materials : 色を変えるときに更新するマテリアル
 *   }
 * 今後、GLBモデルやキャラクターもここに種類を足すだけで、ルールや環境と組み合わせられます。
 */
Lab.modules.push(function () {
  Lab.simSubjects = {};
  Lab.registerSimSubject = (def) => { Lab.simSubjects[def.id] = def; };

  function makeMaterials(color) {
    const face = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.38 });
    const side = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.5 });
    side.color.multiplyScalar(0.62);
    return [face, side];
  }

  // ---- 文字 ----
  Lab.registerSimSubject({
    id: 'text',
    label: '文字',
    async prepare(params) {
      await Lab.targets.text.prepare(params);
    },
    create(params) {
      const L = Lab.glyphs.layoutText(params, 8.4, 4.4, 1.5);
      const s = L.scale;
      const depth = 0.15 + params.depth * 0.9;
      const parts = L.chars.map((c, i) => {
        const geo = Lab.glyphs.geometryFor(c.g, depth / s);
        const mats = makeMaterials('#ffffff');
        const mesh = new THREE.Mesh(geo, mats);
        mesh.scale.setScalar(s);
        mesh.castShadow = mesh.receiveShadow = true;
        const colliders = c.g.boxes.map((b) => ({
          kind: 'cuboid', hx: b.hx * s, hy: b.hy * s, hz: depth / 2, offset: [b.x * s, b.y * s, 0],
        }));
        const volume = colliders.reduce((v, b) => v + 8 * b.hx * b.hy * b.hz, 0);
        return {
          label: c.ch, mesh, mats, colliders, volume, colorIndex: i,
          radius: (Math.max(c.g.bw, c.g.bh) * s) / 2,
          layout: new THREE.Vector3(c.x, c.y, 0),
          halfDepth: depth / 2,
        };
      });
      if (!parts.length) return { items: [] };

      if (params.simSplit === 'whole') {
        // 文字全体を1つの物体に：子メッシュと衝突箱を文字の位置にずらしてまとめる
        const group = new THREE.Group();
        const colliders = [];
        let radius = 0;
        for (const p of parts) {
          p.mesh.position.copy(p.layout);
          group.add(p.mesh);
          for (const c of p.colliders) {
            colliders.push({ ...c, offset: [c.offset[0] + p.layout.x, c.offset[1] + p.layout.y, 0] });
          }
          radius = Math.max(radius, p.layout.length() + p.radius);
        }
        return {
          items: [{
            label: '全体', object: group, colliders, radius, halfDepth: parts[0].halfDepth,
            volume: colliders.reduce((v, b) => v + 8 * b.hx * b.hy * b.hz, 0),
            layout: new THREE.Vector3(), materials: parts.map((p, i) => ({ mats: p.mats, colorIndex: i })),
          }],
        };
      }
      return {
        items: parts.map((p) => ({
          label: p.label, object: p.mesh, colliders: p.colliders, volume: p.volume, radius: p.radius,
          layout: p.layout, halfDepth: p.halfDepth, materials: [{ mats: p.mats, colorIndex: p.colorIndex }],
        })),
      };
    },
  });

  // ---- 基本図形 ----
  const geoCache = {};
  const unitGeo = (kind) =>
    geoCache[kind] || (geoCache[kind] = {
      cube: () => new THREE.BoxGeometry(1, 1, 1),
      sphere: () => new THREE.SphereGeometry(0.5, 32, 20),
      cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
    }[kind]());

  Lab.registerSimSubject({
    id: 'shapes',
    label: '基本図形',
    create(params, rng) {
      const kinds = ['cube', 'sphere', 'cylinder'];
      const n = params.simCount;
      const cols = Math.ceil(Math.sqrt(n * 2.5));
      const rows = Math.ceil(n / cols);
      const gap = 1.15;
      const items = [];
      for (let i = 0; i < n; i++) {
        const kind = params.simShape === 'mix' ? kinds[Math.floor(rng() * 3)] : params.simShape;
        const size = 0.55 + rng() * 0.45;
        const mats = makeMaterials('#ffffff');
        const mesh = new THREE.Mesh(unitGeo(kind), mats[0]);
        mesh.scale.setScalar(size);
        mesh.castShadow = mesh.receiveShadow = true;
        const h = size / 2;
        const collider = kind === 'cube' ? { kind: 'cuboid', hx: h, hy: h, hz: h, offset: [0, 0, 0] }
          : kind === 'sphere' ? { kind: 'ball', r: h, offset: [0, 0, 0] }
          : { kind: 'cylinder', hh: h, r: h, offset: [0, 0, 0] };
        const volume = kind === 'cube' ? size ** 3 : kind === 'sphere' ? (4 / 3) * Math.PI * h ** 3 : Math.PI * h * h * size;
        const col = i % cols, row = Math.floor(i / cols);
        items.push({
          label: { cube: '立方体', sphere: '球', cylinder: '円柱' }[kind] + (i + 1),
          object: mesh, colliders: [collider], volume, radius: h, halfDepth: h,
          layout: new THREE.Vector3((col - (cols - 1) / 2) * gap, ((rows - 1) / 2 - row) * gap, 0),
          materials: [{ mats: [mats[0]], colorIndex: i }],
        });
      }
      return { items };
    },
  });
});

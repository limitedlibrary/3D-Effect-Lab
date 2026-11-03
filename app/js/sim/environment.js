/*
 * シミュレーション：周辺環境（床・壁・障害物）
 *
 * build(params) → { object: 表示用グループ, pieces: 動かない衝突形状の一覧 }
 *   piece = { kind: 'cuboid'|'cylinder', hx, hy, hz | hh, r, pos: [x,y,z], rotZ: ラジアン }
 * 障害物の種類を増やすときは OBSTACLES に1つ追加します。
 */
Lab.modules.push(function () {
  const FLOOR_Y = -2.6;              // 床の高さ（グリッドと同じ）
  const ARENA = { x: 6.5, z: 3.4, h: 4.5, t: 0.2 }; // 壁で囲む範囲

  const OBSTACLES = {
    box: {
      label: '箱',
      make: (o) => {
        const s = o.size;
        return { kind: 'cuboid', hx: s / 2, hy: s / 2, hz: s / 2, pos: [o.x, FLOOR_Y + s / 2, o.z || 0], rotZ: (o.angle * Math.PI) / 180 };
      },
    },
    pillar: {
      label: '柱',
      make: (o) => {
        const hh = (2.2 + o.size) / 2;
        return { kind: 'cylinder', hh, r: 0.25 + o.size * 0.18, pos: [o.x, FLOOR_Y + hh, o.z || 0], rotZ: 0 };
      },
    },
    ramp: {
      label: '斜面',
      make: (o) => {
        const a = (o.angle * Math.PI) / 180, hx = 1.2 + o.size * 0.9, hy = 0.12;
        return { kind: 'cuboid', hx, hy, hz: 2.2, pos: [o.x, FLOOR_Y + Math.abs(Math.sin(a)) * hx + hy, o.z || 0], rotZ: a };
      },
    },
  };

  function wallPieces(mode) {
    const { x, z, h, t } = ARENA;
    const y = FLOOR_Y + h / 2;
    const back = { kind: 'cuboid', hx: x + t, hy: h / 2, hz: t / 2, pos: [0, y, -z - t / 2], rotZ: 0, glass: true };
    const front = { ...back, pos: [0, y, z + t / 2] };
    const left = { kind: 'cuboid', hx: t / 2, hy: h / 2, hz: z, pos: [-x - t / 2, y, 0], rotZ: 0, glass: true };
    const right = { ...left, pos: [x + t / 2, y, 0] };
    return { none: [], back: [back], sides: [left, right], box: [back, front, left, right] }[mode] || [];
  }

  function meshFor(piece) {
    let geo;
    if (piece.kind === 'cylinder') geo = new THREE.CylinderGeometry(piece.r, piece.r, piece.hh * 2, 32);
    else geo = new THREE.BoxGeometry(piece.hx * 2, piece.hy * 2, piece.hz * 2);
    const group = new THREE.Group();
    if (piece.glass) {
      group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: '#9fb3d9', transparent: true, opacity: 0.03, depthWrite: false, roughness: 0.1,
      })));
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: '#9fb3d9', transparent: true, opacity: 0.35 })));
    } else {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#3b4354', roughness: 0.75, metalness: 0.1 }));
      m.castShadow = m.receiveShadow = true;
      group.add(m);
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30),
        new THREE.LineBasicMaterial({ color: '#7d889e', transparent: true, opacity: 0.5 })));
    }
    group.position.fromArray(piece.pos);
    group.rotation.z = piece.rotZ || 0;
    return group;
  }

  Lab.simEnvironment = {
    FLOOR_Y,
    ARENA,
    OBSTACLES,
    build(params) {
      const object = new THREE.Group();
      const pieces = [];
      if (params.simFloor) {
        pieces.push({ kind: 'cuboid', hx: 40, hy: 0.5, hz: 40, pos: [0, FLOOR_Y - 0.5, 0], rotZ: 0, floor: true });
        // 影だけを受ける透明な床
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.35 }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = FLOOR_Y + 0.002;
        shadow.receiveShadow = true;
        object.add(shadow);
      }
      for (const w of wallPieces(params.simWalls)) {
        pieces.push(w);
        object.add(meshFor(w));
      }
      for (const o of params.simObstacles || []) {
        const def = OBSTACLES[o.type];
        if (!def) continue;
        const piece = def.make(o);
        pieces.push(piece);
        object.add(meshFor(piece));
      }
      return { object, pieces };
    },
  };
});

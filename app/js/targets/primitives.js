/*
 * 集合先：基本図形（球体・立方体・ドーナツ）
 */
Lab.modules.push(function () {
  const U = Lab.util;

  Lab.registerTarget({
    id: 'sphere', label: '球体', category: 'primitive',
    sample(params, n, rng) {
      const R = 2.2;
      const points = [];
      for (let i = 0; i < n; i++) {
        const nrm = U.randomUnit(rng, new THREE.Vector3());
        points.push({ p: nrm.clone().multiplyScalar(R), n: nrm });
      }
      return { points, area: 4 * Math.PI * R * R };
    },
  });

  Lab.registerTarget({
    id: 'cube', label: '立方体', category: 'primitive',
    sample(params, n, rng) {
      const h = 1.6;
      const axes = ['x', 'y', 'z'];
      const points = [];
      for (let i = 0; i < n; i++) {
        const f = Math.floor(rng() * 6);
        const axis = axes[f >> 1];
        const sign = f & 1 ? 1 : -1;
        const p = new THREE.Vector3((rng() * 2 - 1) * h, (rng() * 2 - 1) * h, (rng() * 2 - 1) * h);
        p[axis] = sign * h;
        const nrm = new THREE.Vector3();
        nrm[axis] = sign;
        points.push({ p, n: nrm });
      }
      return { points, area: 6 * (2 * h) * (2 * h) };
    },
  });

  // 正面（XY平面）を向いたドーナツ
  Lab.registerTarget({
    id: 'torus', label: 'ドーナツ', category: 'primitive',
    sample(params, n, rng) {
      const R = 1.9, r = 0.8;
      const points = [];
      while (points.length < n) {
        const u = rng() * Math.PI * 2;
        const v = rng() * Math.PI * 2;
        if (rng() * (R + r) > R + r * Math.cos(v)) continue; // 面積に比例した一様分布
        const c = R + r * Math.cos(v);
        points.push({
          p: new THREE.Vector3(c * Math.cos(u), c * Math.sin(u), r * Math.sin(v)),
          n: new THREE.Vector3(Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u), Math.sin(v)),
        });
      }
      return { points, area: 4 * Math.PI * Math.PI * R * r };
    },
  });
});

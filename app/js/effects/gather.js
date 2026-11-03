/*
 * 演出A：破片の集合
 * 空間に散らばった破片が、ひとつの形（球体・文字など）に集まる。
 */
Lab.modules.push(function () {
  const U = Lab.util, fx = Lab.fx;
  const _e = new THREE.Euler();

  Lab.registerEffect({
    id: 'gather',
    label: '集合',
    description: '散らばった破片がひとつの形に集まる',
    defaults: { easing: 'smooth', order: 'random', stagger: 0.35, spread: 0.5, scatter: 'cloud' },

    setup({ shards, params, bounds, rng }) {
      fx.assignKeys(shards, params, bounds);
      const R = 3 + params.spread * 9;
      for (const s of shards) {
        s.from = s.from || new THREE.Vector3();
        s.qFrom = s.qFrom || new THREE.Quaternion();
        s.qFrom.copy(s.qRand);
        switch (params.scatter) {
          case 'floor': {
            const a = rng() * Math.PI * 2, rad = (1.5 + R * 0.8) * Math.sqrt(rng());
            s.from.set(Math.cos(a) * rad, -2.55 + rng() * 0.05, Math.sin(a) * rad);
            s.qFrom.setFromEuler(_e.set(-Math.PI / 2, 0, rng() * Math.PI * 2)); // 床に寝かせる
            break;
          }
          case 'ring': {
            const a = rng() * Math.PI * 2, rad = R * (0.85 + 0.3 * rng());
            s.from.set(Math.cos(a) * rad, (rng() - 0.5) * (0.5 + params.spread * 3), Math.sin(a) * rad);
            break;
          }
          case 'sky':
            s.from.set(
              s.target.x + (rng() - 0.5) * R * 0.6,
              5 + rng() * R,
              s.target.z + (rng() - 0.5) * R * 0.6
            );
            break;
          default:
            U.randomUnit(rng, s.from).multiplyScalar(R * (0.35 + 0.65 * Math.cbrt(rng())));
        }
      }
    },

    evaluate(s, t, p, out) {
      const l = fx.local(t, s.key, p.stagger);
      const e = fx.ease(p.easing, l);
      fx.move(s.from, s.target, e, p.motion, s, out.pos);
      fx.turn(s.qFrom, s.qTarget, e, p.motion, s, 1 - l, out.quat);
      out.glow = U.pulse(l, 0.9, 0.06);           // 到着の瞬間に光る
      out.dust = l > 0 && l < 1 ? U.bell(l) * 0.7 : 0;
      out.dustRadius = 0.35;
    },

    light(t) {
      return U.pulse(t, 0.92, 0.04) * 0.6;
    },
  });
});

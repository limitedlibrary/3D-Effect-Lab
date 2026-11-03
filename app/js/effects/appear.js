/*
 * 演出C：出現・消滅
 * 粒子と光の変化で、形が現れたり消えたりする。
 */
Lab.modules.push(function () {
  const U = Lab.util, fx = Lab.fx;
  const _r = new THREE.Vector3();

  Lab.registerEffect({
    id: 'appear',
    label: '出現・消滅',
    description: '光の粒とともに現れる・消える',
    defaults: { easing: 'smooth', order: 'bottom', stagger: 0.6, spread: 0.4, motion: 'linear',
                mode: 'appear', drift: 'up', dust: 0.7, glow: 0.5 },

    setup({ shards, params, bounds, rng }) {
      fx.assignKeys(shards, params, bounds);
      const sp = params.spread;
      const appear = params.mode === 'appear';
      for (const s of shards) {
        const d = new THREE.Vector3();
        switch (params.drift) {
          case 'out':
            d.subVectors(s.target, bounds.center);
            if (d.lengthSq() < 1e-6) U.randomUnit(rng, d);
            d.normalize().multiplyScalar((1 + sp * 5) * (0.4 + rng() * 0.8))
              .addScaledVector(U.randomUnit(rng, _r), 0.3);
            break;
          case 'still':
            U.randomUnit(rng, d).multiplyScalar(0.1 + sp * 0.4);
            break;
          default: // 上へ昇る（出現のときは下から昇ってきて形になる）
            U.randomUnit(rng, d).multiplyScalar(0.3 + sp * 1.2);
            d.y = Math.abs(d.y) + (1.2 + sp * 4) * (0.5 + rng());
            if (appear) d.y = -d.y;
        }
        s.away = (s.away || new THREE.Vector3()).copy(s.target).add(d);
      }
    },

    evaluate(s, t, p, out) {
      const l = fx.local(t, s.key, p.stagger);
      const e = fx.ease(p.easing, l);
      if (p.mode === 'disappear') {
        fx.move(s.target, s.away, e, p.motion, s, out.pos);
        fx.turn(s.qTarget, s.qRand, e, p.motion, s, l, out.quat);
        out.scale = 1 - U.smoothstep(0.35, 1, l) * 0.85;
        out.alpha = 1 - U.smoothstep(0.25, 0.95, l);
        out.glow = U.pulse(l, 0.25, 0.2);
        out.dust = U.bell(l);
        out.dustRadius = 0.12 + l * 0.8;
      } else {
        fx.move(s.away, s.target, e, p.motion, s, out.pos);
        fx.turn(s.qRand, s.qTarget, e, p.motion, s, 1 - l, out.quat);
        out.scale = U.smoothstep(0, 0.7, l);
        out.alpha = U.smoothstep(0, 0.45, l);
        out.glow = U.pulse(l, 0.55, 0.22);
        out.dust = U.bell(l);
        out.dustRadius = 0.12 + (1 - l) * 0.6;
      }
    },

    light(t, p) {
      return p.mode === 'disappear' ? U.pulse(t, 0.3, 0.25) : U.pulse(t, 0.6, 0.25);
    },
  });
});

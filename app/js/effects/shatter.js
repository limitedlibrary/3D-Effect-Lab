/*
 * 演出B：破砕・飛散
 * ひとつの形が多数の破片に分かれて外側へ散っていく。
 */
Lab.modules.push(function () {
  const U = Lab.util, fx = Lab.fx;
  const HOLD = 0.08; // 壊れる前に形が見えている時間（全体に対する割合）
  const _r = new THREE.Vector3(), _ax = new THREE.Vector3(), _q = new THREE.Quaternion();

  Lab.registerEffect({
    id: 'shatter',
    label: '破砕・飛散',
    description: '形が砕けて破片が飛び散る',
    defaults: { easing: 'snap', order: 'center', stagger: 0.25, spread: 0.5, motion: 'spin',
                direction: 'radial', power: 0.5, gravity: 0, fadeOut: false },

    setup({ shards, params, bounds, rng }) {
      fx.assignKeys(shards, params, bounds);
      const sp = params.spread;
      for (const s of shards) {
        const radial = new THREE.Vector3().subVectors(s.target, bounds.center);
        if (radial.lengthSq() < 1e-6) U.randomUnit(rng, radial);
        radial.normalize();

        const dir = new THREE.Vector3();
        switch (params.direction) {
          case 'up': dir.set(0, 1, 0).addScaledVector(radial, 0.3 * sp); break;
          case 'side': dir.set(1, 0, 0).addScaledVector(radial, 0.3 * sp); break;
          case 'front': dir.set(0, 0, 1).addScaledVector(radial, 0.3 * sp); break;
          default: dir.copy(radial);
        }
        dir.normalize().addScaledVector(U.randomUnit(rng, _r), 0.15 + sp * 1.1).normalize();

        const dist = (1.5 + params.power * 9) * (0.55 + rng() * 0.9) * (0.7 + sp * 0.6);
        s.to = (s.to || new THREE.Vector3()).copy(s.target).addScaledVector(dir, dist);

        // 飛んだ後の向き（「直線的」でも少しだけ傾く）
        U.randomUnit(rng, _ax);
        s.qEnd = (s.qEnd || new THREE.Quaternion()).copy(s.qTarget)
          .multiply(_q.setFromAxisAngle(_ax, (rng() - 0.5) * 1.4));
      }
    },

    evaluate(s, t, p, out) {
      const tt = U.clamp((t - HOLD) / (1 - HOLD), 0, 1);
      const l = fx.local(tt, s.key, p.stagger);
      const e = fx.ease(p.easing, l);
      fx.move(s.target, s.to, e, p.motion, s, out.pos);
      if (p.gravity > 0) out.pos.y -= p.gravity * 7 * l * l;
      fx.turn(s.qTarget, s.qEnd, e, p.motion, s, l, out.quat);
      if (p.fadeOut) {
        out.alpha = 1 - U.smoothstep(0.5, 1, l);
        out.scale = 1 - U.smoothstep(0.6, 1, l) * 0.6;
      }
      out.glow = l > 0 ? U.pulse(l, 0.04, 0.08) : 0; // 割れた瞬間に光る
      out.dust = l > 0 && l < 1 ? (1 - l) * 0.9 : 0;
      out.dustRadius = 0.15 + l * 1.5;
    },

    light(t) {
      return U.pulse(t, HOLD + 0.04, 0.07);
    },
  });
});

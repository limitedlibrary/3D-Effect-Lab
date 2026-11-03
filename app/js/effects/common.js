/*
 * 演出の共通部品
 *
 * 演出（effects/*.js）は次の形のオブジェクトで、Lab.registerEffect() で登録します。
 *   id, label, description
 *   defaults        : この演出に切り替えたときの初期値（paramSchema の値を上書き）
 *   setup(ctx)      : 破片ごとの開始位置・終了位置などを計算（設定が変わるたびに呼ばれる）
 *   evaluate(s, t, params, out) : 進行度 t (0〜1) における破片 s の状態を out に書く
 *                     out.pos / out.quat / out.scale / out.alpha / out.glow / out.dust / out.dustRadius
 *   light(t, params): 中央の光（フラッシュ）の強さ 0〜1（省略可）
 *
 * evaluate は t だけで状態が決まる「純粋な関数」にしてあるので、
 * 再生位置をスライダーで自由に動かしても同じ見た目が再現されます。
 */
Lab.modules.push(function () {
  const U = Lab.util;
  const _q = new THREE.Quaternion();

  Lab.registerEffect = function (def) {
    Lab.effects[def.id] = def;
    Lab.effectOrder.push(def.id);
  };

  Lab.fx = {
    // 破片が動き出す順番を 0〜1 の値にする
    orderKey(order, p, b, rnd) {
      let k;
      const sy = Math.max(1e-6, b.size.y), sx = Math.max(1e-6, b.size.x);
      switch (order) {
        case 'bottom': k = (p.y - b.min.y) / sy; break;
        case 'top': k = 1 - (p.y - b.min.y) / sy; break;
        case 'left': k = (p.x - b.min.x) / sx; break;
        case 'center': k = p.distanceTo(b.center) / Math.max(1e-6, b.radius); break;
        default: return rnd;
      }
      return U.clamp(k * 0.88 + rnd * 0.12, 0, 1);
    },

    assignKeys(shards, params, bounds) {
      for (const s of shards) s.key = Lab.fx.orderKey(params.order, s.target, bounds, s.r[0]);
    },

    // 全体の進行度 t から、時間差を考慮した破片ごとの進行度を求める
    local(t, key, stagger) {
      const span = stagger * 0.75;
      return U.clamp((t - key * span) / (1 - span), 0, 1);
    },

    ease(name, t) {
      return (U.easings[name] || U.easings.smooth)(t);
    },

    // 位置の補間：直線的 / 回転しながら（弧を描く）/ 渦を巻く（Y軸まわりに螺旋）
    move(from, to, e, motion, s, out) {
      if (motion === 'vortex') {
        const ra = Math.hypot(from.x, from.z), rb = Math.hypot(to.x, to.z);
        const aa = Math.atan2(from.z, from.x), ab = Math.atan2(to.z, to.x);
        const turns = 1 + s.r[1] * 0.8;
        const a = U.lerp(aa, ab + turns * Math.PI * 2, e);
        const r = U.lerp(ra, rb, e) + Math.sin(Math.PI * U.clamp(e, 0, 1)) * (0.6 + s.r[2]);
        return out.set(Math.cos(a) * r, U.lerp(from.y, to.y, e), Math.sin(a) * r);
      }
      out.lerpVectors(from, to, e);
      if (motion === 'spin') {
        const d = from.distanceTo(to);
        out.addScaledVector(s.side, Math.sin(Math.PI * U.clamp(e, 0, 1)) * d * 0.35 * (0.3 + s.r[2]));
      }
      return out;
    },

    // 向きの補間。phase は「まだ残っている回転量」(1→0 で回転が止まる)
    turn(qFrom, qTo, e, motion, s, phase, out) {
      out.slerpQuaternions(qFrom, qTo, U.clamp(e, 0, 1));
      if (motion !== 'linear') {
        const ang = phase * s.spin * Math.PI * 2 * (motion === 'spin' ? 2.5 : 1.2);
        _q.setFromAxisAngle(s.axis, ang);
        out.multiply(_q);
      }
      return out;
    },
  };
});

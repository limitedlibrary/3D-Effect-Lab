/*
 * シミュレーション：どう動かすか（動きのルール）
 *
 * 重力・反発・摩擦・空気抵抗は物理エンジンの設定として world.js で反映し、
 * ここには「毎ステップ物体に力を加えるルール」を登録します。
 *   apply(ctx) : ctx = { body, item, mass, t, params, gravity, w(0〜1: 力のかかり具合), point }
 * 今後「目標地点へ向かう」「障害物を避ける」などの行動もここに足していけます。
 */
Lab.modules.push(function () {
  const U = Lab.util;
  const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _qc = new THREE.Quaternion();

  Lab.simRules = {};
  Lab.registerSimRule = (def) => { Lab.simRules[def.id] = def; };

  function stiffness(params) {
    return 4 + params.simForceStrength * 36;
  }

  // 位置のずれ・速度・重力の打ち消しから力を作る（ばね＋ダンパー）
  function springForce(ctx, target, k, damp, maxDist) {
    const { body, mass, gravity } = ctx;
    const p = body.translation(), v = body.linvel();
    _v.set(target.x - p.x, target.y - p.y, target.z - p.z);
    if (maxDist && _v.length() > maxDist) _v.setLength(maxDist);
    const c = 2 * Math.sqrt(k) * damp;
    _f.set(_v.x * k - v.x * c, _v.y * k - v.y * c - gravity.y, _v.z * k - v.z * c).multiplyScalar(mass * ctx.w);
    body.addForce({ x: _f.x, y: _f.y, z: _f.z }, true);
  }

  // 向きを正面へそろえる回転力
  function alignTorque(ctx, k) {
    const { body, mass, item } = ctx;
    const r = body.rotation(), av = body.angvel();
    _q.set(r.x, r.y, r.z, r.w);
    _qc.copy(_q).invert(); // 目標（正面＝回転なし）× 現在の逆
    if (_qc.w < 0) _qc.set(-_qc.x, -_qc.y, -_qc.z, -_qc.w);
    const inertia = mass * item.radius * item.radius * 0.35;
    const c = 2 * Math.sqrt(k) * 0.9;
    body.addTorque({
      x: inertia * (2 * _qc.x * k - av.x * c) * ctx.w,
      y: inertia * (2 * _qc.y * k - av.y * c) * ctx.w,
      z: inertia * (2 * _qc.z * k - av.z * c) * ctx.w,
    }, true);
  }

  Lab.registerSimRule({ id: 'none', label: 'なし', apply() {} });

  // 指定位置（文字の並び）へ引き寄せて整列
  Lab.registerSimRule({
    id: 'align',
    label: '指定位置へ整列',
    target: (item, params) => new THREE.Vector3(item.layout.x, item.layout.y + params.simTargetHeight, 0),
    apply(ctx) {
      const k = stiffness(ctx.params);
      springForce(ctx, ctx.item.home, k, 0.85);
      alignTorque(ctx, k * 0.8);
    },
  });

  // 一点に引き寄せる（物体同士がぶつかり合って固まりになる）
  Lab.registerSimRule({
    id: 'point',
    label: '一点に引き寄せる',
    apply(ctx) {
      springForce(ctx, ctx.point, stiffness(ctx.params) * 0.6, 0.45, 3);
    },
  });

  // 中心から反発：力がはたらき始めた直後の短い時間だけ、外向きに強く押す
  Lab.registerSimRule({
    id: 'repel',
    label: '中心から反発',
    window: 0.3,
    apply(ctx) {
      const { body, mass, params } = ctx;
      const p = body.translation();
      _v.set(p.x - ctx.point.x, 0, p.z - ctx.point.z);
      const d = _v.length();
      if (d < 1e-3) _v.set(1, 0, 0); else _v.divideScalar(d);
      _v.y = 0.3;
      const f = (mass * (20 + params.simForceStrength * 120)) / (1 + d * 0.25);
      body.addForce({ x: _v.x * f, y: _v.y * f, z: _v.z * f }, true);
    },
  });

  // 力のかかり具合（開始時刻からなめらかに強くなる。反発は短時間だけ）
  Lab.simRuleWeight = function (rule, t, params) {
    const t0 = params.simForceStart;
    if (t < t0) return 0;
    if (rule.window) return t < t0 + rule.window ? 1 : 0;
    return U.smoothstep(t0, t0 + 0.6, t);
  };
});

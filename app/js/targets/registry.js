/*
 * 集合先（ターゲット）の仕組み
 *
 * 「破片が最終的に並ぶ位置」を作る部品です。種類ごとに別ファイルで登録します。
 *   category : 'text'（文字）| 'primitive'（基本図形）| 'image'（画像・ロゴ：今後追加予定）
 *   keys     : 形に影響する設定項目。これらが変わったときだけ形を作り直す
 *   prepare(params)        : フォントや画像の読み込みなど、事前の非同期処理（省略可）
 *   sample(params, n, rng) : { points: [{ p: 位置, n: 面の向き }], area: 表面積の目安, maxShard?: 破片サイズの上限, info? }
 *
 * 画像・ロゴを追加するときは、text.js と同じように
 * 「画像をキャンバスに描く → 塗られたピクセルから点を拾う」ターゲットを1つ登録すれば、
 * 集合・破砕・出現の全演出でそのまま使えます。
 */
Lab.modules.push(function () {
  Lab.targets = {};
  Lab.targetOrder = [];

  Lab.registerTarget = function (def) {
    Lab.targets[def.id] = def;
    Lab.targetOrder.push(def.id);
  };

  function computeBounds(points) {
    const box = new THREE.Box3();
    for (const pt of points) box.expandByPoint(pt.p);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    let radius = 0;
    for (const pt of points) radius = Math.max(radius, pt.p.distanceTo(center));
    return { min: box.min, max: box.max, center, size, radius };
  }

  const targetOf = (params) => Lab.targets[params.shape] || Lab.targets.sphere;

  Lab.shapes = {
    // 形を作り直す必要があるかの判定に使う文字列
    cacheKey(params) {
      const t = targetOf(params);
      return [t.id, ...(t.keys || []).map((k) => params[k])].join('|');
    },

    async prepare(params) {
      const t = targetOf(params);
      if (t.prepare) await t.prepare(params);
    },

    sample(params, rng) {
      let shape = targetOf(params).sample(params, params.count, rng);
      if (!shape || !shape.points.length) shape = Lab.targets.sphere.sample(params, params.count, rng);
      shape.bounds = computeBounds(shape.points);
      return shape;
    },
  };
});

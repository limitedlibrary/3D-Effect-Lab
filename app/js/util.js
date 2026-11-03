/*
 * 3D演出ラボ 共通ユーティリティ
 *
 * 各ファイルは通常の <script> として読み込まれ、Three.js に依存する処理は
 * Lab.modules に関数として登録します。Three.js（ES Module）の読み込みが終わると
 * index.html から Lab.boot() が呼ばれ、登録順に実行されます。
 * この仕組みにより index.html をダブルクリックで直接開いても動作します。
 */
(function () {
  const Lab = (window.Lab = window.Lab || {});
  Lab.modules = [];
  Lab.effects = {};       // id → 演出定義（effects/*.js が登録）
  Lab.effectOrder = [];   // 左パネルでの表示順

  Lab.boot = function () {
    for (const m of Lab.modules) m();
    Lab.start().catch((err) => {
      console.error(err);
      const el = document.getElementById('loading');
      el.textContent = '初期化に失敗しました: ' + err.message;
      el.classList.add('show');
    });
  };

  // 再現性のある乱数（同じ seed なら同じ散らばり方になる）
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const bell = (t) => Math.sin(Math.PI * clamp(t, 0, 1));
  const pulse = (t, center, width) => Math.exp(-Math.pow((t - center) / width, 2));

  // 緩急（イージング）
  const easings = {
    smooth: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    snap: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -9 * t)),
    linear: (t) => t,
    bounce: (t) => {
      const c1 = 1.9, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };

  // 単位球上の一様な乱数ベクトル（out は THREE.Vector3）
  function randomUnit(rng, out) {
    const u = rng() * 2 - 1;
    const th = rng() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return out.set(s * Math.cos(th), u, s * Math.sin(th));
  }

  Lab.util = { mulberry32, clamp, lerp, smoothstep, bell, pulse, easings, randomUnit };
})();

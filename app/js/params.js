/*
 * 設定項目の定義
 *
 * 右パネルのUI・JSON保存/復元・初期値はすべてこの一覧から作られます。
 * 項目を増やすときはここに1行追加するだけでUIとJSONに反映されます。
 *
 *  group   : 'target' | 'shape' | 'motion' | 'effect' | 'look'（右パネルの見出し）
 *  type    : 'segment'（ボタン切替）| 'range'（スライダー）| 'textarea' | 'toggle' | 'swatch'（色見本）
 *  effects : 指定した演出のときだけ表示
 *  replay  : 変更したら最初から再生し直す（見た目だけの項目は false）
 */
(function () {
  const Lab = window.Lab;

  Lab.palettes = {
    library: { label: '書庫', colors: ['#e8c98a', '#9b8fd6', '#f3e7cc', '#7d6fc0'], glow: '#ffcf7a', dust: '#ffe2a8' },
    ice:     { label: '氷',   colors: ['#9fd8ff', '#e6f6ff', '#4a8fd6', '#c2e9ff'], glow: '#7fcbff', dust: '#d6f1ff' },
    fire:    { label: '炎',   colors: ['#ff6a2b', '#ffc04d', '#ff3b3b', '#ffd98a'], glow: '#ff7a2b', dust: '#ffb347' },
    forest:  { label: '森',   colors: ['#7bc47f', '#d9e8a5', '#3e8e5a', '#b8d68a'], glow: '#a6f0a0', dust: '#e0ffd0' },
    neon:    { label: 'ネオン', colors: ['#00e5ff', '#ff3df2', '#9d7bff', '#3dffb5'], glow: '#7af4ff', dust: '#ff9df8' },
    mono:    { label: 'モノクロ', colors: ['#f0f0f0', '#a0a0a0', '#5a5a5a', '#d0d0d0'], glow: '#ffffff', dust: '#ffffff' },
  };

  // 照明の向き（メインのライトを置く位置。原点を照らす）
  Lab.lightDirs = {
    base:  { label: '基準',     pos: [5, 8, 6] },
    back:  { label: '逆光',     pos: [-1.5, 4.5, -9] },
    side:  { label: '横から',   pos: [10, 2.5, 0.5] },
    top:   { label: '真上から', pos: [0.5, 12, 0.5] },
    front: { label: '正面から', pos: [0, 3, 10] },
  };

  // 質感（破片・シミュレーションの物体のマテリアル）。base は従来の値
  Lab.finishes = {
    base:  { label: '標準',     metalness: 0.35, roughness: 0.4 },
    metal: { label: '金属寄り', metalness: 0.9,  roughness: 0.22 },
    matte: { label: 'マット',   metalness: 0.05, roughness: 0.85 },
    gloss: { label: 'つや',     metalness: 0.1,  roughness: 0.12 },
  };

  // 文字の集合先に使うフォント（index.html で Google Fonts から読み込み）
  Lab.fonts = {
    gothic:  { label: 'ゴシック',   family: '"Noto Sans JP"',       bold: 900, normal: 500 },
    mincho:  { label: '明朝',       family: '"Noto Serif JP"',      bold: 900, normal: 500 },
    maru:    { label: '丸ゴシック', family: '"M PLUS Rounded 1c"', bold: 800, normal: 500 },
    pop:     { label: 'ポップ',     family: '"Dela Gothic One"',    bold: 400, normal: 400 },
    hand:    { label: '手書き風',   family: '"Yomogi"',             bold: 400, normal: 400 },
    display: { label: '英字ロゴ',   family: '"Bebas Neue"',         bold: 400, normal: 400 },
  };

  Lab.backgrounds = {
    dark:  { label: '暗い',   color: '#0f1319', grid1: '#3a4354', grid2: '#1e2430', bloom: 1.0, lightDust: false },
    dusk:  { label: '薄暗い', color: '#2a2f3b', grid1: '#566076', grid2: '#373d4b', bloom: 0.8, lightDust: false },
    light: { label: '明るい', color: '#e9e7e2', grid1: '#a9a59c', grid2: '#cfccc5', bloom: 0.25, lightDust: true },
  };

  // 文字の設定を表示するか（シミュレーションでは「動かすもの」が文字のとき）
  const isText = (p, effect) => (effect === 'sim' ? p.simSubject === 'text' : p.shape === 'text');
  const simText = (p) => p.simSubject === 'text';

  Lab.paramSchema = [
    // ---- シミュレーション：動かすもの ----
    { group: 'target', key: 'simSubject', label: '種類', type: 'segment', default: 'text', effects: ['sim'],
      options: [['text', '文字'], ['shapes', '基本図形']] },
    { group: 'target', key: 'simSplit', label: '文字の動かし方', type: 'segment', default: 'chars', effects: ['sim'],
      options: [['chars', '1文字ずつ'], ['whole', '全体で1つの物体']], showIf: simText },

    // ---- 集合先の形 ----
    { group: 'target', key: 'shape', label: '形の種類', type: 'segment', default: 'text',
      options: [['text', '文字'], ['sphere', '球体'], ['cube', '立方体'], ['torus', 'ドーナツ']] },
    { group: 'target', key: 'text', label: '文字（改行もできます）', type: 'textarea', default: '有限書庫', maxLength: 120,
      examples: ['有限書庫', 'LIBRARY', '2026', 'Hello\nWorld', '夢を、かたちに。'],
      showIf: isText, sim: true },
    { group: 'target', key: 'font', label: 'フォント', type: 'segment', default: 'gothic',
      options: [['gothic', 'ゴシック'], ['mincho', '明朝'], ['maru', '丸ゴシック'], ['pop', 'ポップ'], ['hand', '手書き風'], ['display', '英字ロゴ']],
      showIf: isText, sim: true },
    { group: 'target', key: 'fontWeight', label: '文字の太さ', type: 'segment', default: 'bold',
      options: [['bold', '太字'], ['normal', '標準']], showIf: isText, sim: true },
    { group: 'target', key: 'textAlign', label: '行のそろえ方', type: 'segment', default: 'center',
      options: [['left', '左'], ['center', '中央'], ['right', '右']], showIf: isText, sim: true },
    { group: 'target', key: 'autoWrap', label: '長い文は自動で改行', type: 'toggle', default: true,
      showIf: isText, sim: true },
    { group: 'target', key: 'depth', label: '文字の厚み', type: 'range', default: 0.1,
      min: 0, max: 1, step: 0.01, minLabel: '薄い', maxLabel: '厚い', showIf: isText, sim: true },

    { group: 'target', key: 'simShape', label: '図形の種類', type: 'segment', default: 'mix', effects: ['sim'],
      options: [['cube', '立方体'], ['sphere', '球'], ['cylinder', '円柱'], ['mix', 'ミックス']], showIf: (p) => !simText(p) },
    { group: 'target', key: 'simCount', label: '図形の数', type: 'range', default: 24, effects: ['sim'],
      min: 1, max: 80, step: 1, minLabel: '少ない', maxLabel: '多い', format: (v) => v + '個', showIf: (p) => !simText(p) },
    { group: 'target', key: 'simSpawn', label: '最初の置き方', type: 'segment', default: 'line', effects: ['sim'],
      options: [['line', '並んだまま空中'], ['scatter', 'ばらばらに空中'], ['pile', '床に置く']] },
    { group: 'target', key: 'simHeight', label: '落とす高さ', type: 'range', default: 4, effects: ['sim'],
      min: 0, max: 8, step: 0.1, minLabel: '低い', maxLabel: '高い', showIf: (p) => p.simSpawn !== 'pile' },
    { group: 'target', key: 'simTilt', label: '最初の傾き・ばらつき', type: 'range', default: 0.3, effects: ['sim'],
      min: 0, max: 1, step: 0.01, minLabel: 'そろっている', maxLabel: 'ばらばら' },
    { group: 'target', key: 'simOverrides', label: '1つずつの重さ・跳ね返り', type: 'bodies', default: {}, effects: ['sim'] },

    // ---- 破片 ----
    { group: 'shape', key: 'count', label: '破片の数', type: 'range', default: 3000,
      min: 200, max: 12000, step: 100, minLabel: '少ない', maxLabel: '多い', format: (v) => v + '個' },
    { group: 'shape', key: 'size', label: '破片の大きさ', type: 'range', default: 1.0,
      min: 0.4, max: 2.0, step: 0.05, minLabel: '小さい', maxLabel: '大きい' },
    { group: 'shape', key: 'shardType', label: '破片の形', type: 'segment', default: 'tri',
      options: [['tri', '三角'], ['square', '四角'], ['chunk', 'かたまり']] },

    // ---- 動き ----
    { group: 'motion', key: 'duration', label: '再生時間', type: 'range', default: 3,
      min: 0.5, max: 10, step: 0.1, minLabel: '速い', maxLabel: '遅い', format: (v) => v.toFixed(1) + '秒' },
    { group: 'motion', key: 'motion', label: '動き方', type: 'segment', default: 'linear',
      options: [['linear', '直線的'], ['spin', '回転しながら'], ['vortex', '渦を巻く']] },
    { group: 'motion', key: 'spread', label: '破片の広がり', type: 'range', default: 0.5,
      min: 0, max: 1, step: 0.01, minLabel: '狭い', maxLabel: '広い' },
    { group: 'motion', key: 'easing', label: '緩急', type: 'segment', default: 'smooth',
      options: [['smooth', 'なめらか'], ['snap', 'すっと止まる'], ['linear', '一定'], ['bounce', '弾む']] },
    { group: 'motion', key: 'order', label: '動き出す順番', type: 'segment', default: 'random',
      options: [['random', 'ランダム'], ['bottom', '下から'], ['top', '上から'], ['left', '左から'], ['center', '中心から']] },
    { group: 'motion', key: 'stagger', label: '時間差', type: 'range', default: 0.35,
      min: 0, max: 1, step: 0.01, minLabel: '一斉に', maxLabel: 'ばらばら' },

    // ---- 演出ごとの設定 ----
    { group: 'effect', key: 'scatter', label: '最初の散らばり方', type: 'segment', default: 'cloud', effects: ['gather'],
      options: [['cloud', '空間全体'], ['floor', '床に散らばる'], ['ring', '輪になる'], ['sky', '上から降る']] },
    { group: 'effect', key: 'direction', label: '飛ぶ方向', type: 'segment', default: 'radial', effects: ['shatter'],
      options: [['radial', '全方向'], ['up', '上へ'], ['side', '横へ'], ['front', '手前へ']] },
    { group: 'effect', key: 'power', label: '飛ぶ速さ', type: 'range', default: 0.5, effects: ['shatter'],
      min: 0, max: 1, step: 0.01, minLabel: '遅い', maxLabel: '速い' },
    { group: 'effect', key: 'gravity', label: '重力', type: 'range', default: 0, effects: ['shatter'],
      min: 0, max: 1, step: 0.01, minLabel: 'なし', maxLabel: '強い' },
    { group: 'effect', key: 'fadeOut', label: '最後に消える', type: 'toggle', default: false, effects: ['shatter'] },
    { group: 'effect', key: 'mode', label: '種類', type: 'segment', default: 'appear', effects: ['appear'],
      options: [['appear', '出現'], ['disappear', '消滅']] },
    { group: 'effect', key: 'drift', label: '粒子の流れ', type: 'segment', default: 'up', effects: ['appear'],
      options: [['up', '上へ昇る'], ['out', '外へ広がる'], ['still', 'その場で']] },

    // ---- シミュレーション：動きのルール ----
    { group: 'rules', key: 'simGravity', label: '重力', type: 'range', default: 1, effects: ['sim'],
      min: 0, max: 2, step: 0.05, minLabel: '無重力', maxLabel: '強い', format: (v) => '地球の' + v.toFixed(2) + '倍' },
    { group: 'rules', key: 'simMass', label: '重さ（基本）', type: 'range', default: 1, effects: ['sim'],
      min: 0.2, max: 5, step: 0.1, minLabel: '軽い', maxLabel: '重い', format: (v) => v.toFixed(1) },
    { group: 'rules', key: 'simRestitution', label: '反発（跳ね返り）', type: 'range', default: 0.4, effects: ['sim'],
      min: 0, max: 1, step: 0.01, minLabel: '跳ねない', maxLabel: 'よく跳ねる', format: (v) => v.toFixed(2) },
    { group: 'rules', key: 'simFriction', label: '摩擦', type: 'range', default: 0.6, effects: ['sim'],
      min: 0, max: 1.5, step: 0.01, minLabel: 'つるつる', maxLabel: 'ざらざら', format: (v) => v.toFixed(2) },
    { group: 'rules', key: 'simDamping', label: '空気抵抗', type: 'range', default: 0.05, effects: ['sim'],
      min: 0, max: 2, step: 0.01, minLabel: 'なし', maxLabel: '強い' },
    { group: 'rules', key: 'simForce', label: '引力・反発力', type: 'segment', default: 'none', effects: ['sim'],
      options: [['none', 'なし'], ['align', '指定位置へ整列'], ['point', '一点に引き寄せる'], ['repel', '中心から反発']] },
    { group: 'rules', key: 'simForceStart', label: '力がはたらき始める時刻', type: 'range', default: 1.5, effects: ['sim'],
      min: 0, max: 10, step: 0.1, minLabel: 'すぐ', maxLabel: '遅く', format: (v) => v.toFixed(1) + '秒後',
      showIf: (p) => p.simForce !== 'none' },
    { group: 'rules', key: 'simForceStrength', label: '力の強さ', type: 'range', default: 0.5, effects: ['sim'],
      min: 0.05, max: 1, step: 0.01, minLabel: '弱い', maxLabel: '強い', showIf: (p) => p.simForce !== 'none' },
    { group: 'rules', key: 'simTargetHeight', label: '目標の高さ', type: 'range', default: 1.2, effects: ['sim'],
      min: -1.5, max: 4, step: 0.1, minLabel: '低い', maxLabel: '高い', showIf: (p) => p.simForce === 'align' || p.simForce === 'point' },
    { group: 'rules', key: 'simDuration', label: '計算する長さ', type: 'range', default: 8, effects: ['sim'],
      min: 2, max: 20, step: 0.5, minLabel: '短い', maxLabel: '長い', format: (v) => v.toFixed(1) + '秒' },
    { group: 'rules', key: 'simSpeed', label: '再生速度', type: 'segment', default: '1', effects: ['sim'], replay: false,
      options: [['0.25', '1/4（スロー）'], ['0.5', '1/2'], ['1', '等速'], ['2', '2倍']] },

    // ---- シミュレーション：環境 ----
    { group: 'env', key: 'simFloor', label: '床（ぶつかる）', type: 'toggle', default: true, effects: ['sim'] },
    { group: 'env', key: 'simWalls', label: '壁', type: 'segment', default: 'none', effects: ['sim'],
      options: [['none', 'なし'], ['back', '奥だけ'], ['sides', '左右'], ['box', '四方を囲む']] },
    { group: 'env', key: 'simObstacles', label: '障害物', type: 'obstacles', default: [], effects: ['sim'] },

    // ---- 見た目 ----
    { group: 'look', sim: true, key: 'palette', label: '色', type: 'swatch', default: 'library', replay: false },
    { group: 'look', sim: true, key: 'background', label: '背景', type: 'segment', default: 'dark', replay: false,
      options: [['dark', '暗い'], ['dusk', '薄暗い'], ['light', '明るい']] },
    { group: 'look', sim: true, key: 'glow', label: '光の強さ', type: 'range', default: 0.5, replay: false,
      min: 0, max: 1, step: 0.01, minLabel: '控えめ', maxLabel: '強い' },
    { group: 'look', key: 'dust', label: '光の粒', type: 'range', default: 0.5, replay: false,
      min: 0, max: 1, step: 0.01, minLabel: 'なし', maxLabel: '多い' },
    { group: 'look', sim: true, key: 'floor', label: '床のグリッドを表示', type: 'toggle', default: true, replay: false },
    { group: 'look', sim: true, key: 'finish', label: '質感', type: 'segment', default: 'base', replay: false,
      options: [['base', '標準'], ['metal', '金属寄り'], ['matte', 'マット'], ['gloss', 'つや']] },
    { group: 'look', sim: true, key: 'lightDir', label: '照明の向き', type: 'segment', default: 'base', replay: false,
      options: [['base', '基準'], ['back', '逆光'], ['side', '横から'], ['top', '真上から'], ['front', '正面から']] },
    { group: 'look', sim: true, key: 'lightPower', label: '照明の強さ', type: 'range', default: 1, replay: false,
      min: 0.2, max: 2, step: 0.05, minLabel: '暗い', maxLabel: '明るい', format: (v) => v.toFixed(2) + '倍' },

    // ---- 内部値（UIは「ばらつきを変える」ボタン） ----
    { group: 'hidden', key: 'seed', type: 'number', default: 1 },
  ];

  Lab.groupLabels = { target: '集合先の形', rules: '動きのルール', env: '環境（床・壁・障害物）', shape: '破片', motion: '動き', effect: '演出ごとの設定', look: '見た目' };

  Lab.schemaDefaults = function () {
    const p = {};
    for (const d of Lab.paramSchema) p[d.key] = d.default && typeof d.default === 'object' ? JSON.parse(JSON.stringify(d.default)) : d.default;
    return p;
  };

  // JSONなど外部から来た値を、定義に沿って安全な値へ整える
  Lab.sanitizeParams = function (input) {
    const out = Lab.schemaDefaults();
    if (!input || typeof input !== 'object') return out;
    for (const d of Lab.paramSchema) {
      const v = input[d.key];
      if (v === undefined) continue;
      switch (d.type) {
        case 'segment':
          if (d.options.some((o) => o[0] === v)) out[d.key] = v;
          break;
        case 'range':
          if (typeof v === 'number' && isFinite(v)) out[d.key] = Lab.util.clamp(v, d.min, d.max);
          break;
        case 'text':
        case 'textarea':
          if (typeof v === 'string') out[d.key] = v.slice(0, d.maxLength || 40);
          break;
        case 'toggle':
          if (typeof v === 'boolean') out[d.key] = v;
          break;
        case 'swatch':
          if (Lab.palettes[v]) out[d.key] = v;
          break;
        case 'bodies': // { "0": { mass, restitution }, ... }
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            const o = {};
            for (const [i, x] of Object.entries(v).slice(0, 200)) {
              if (!/^\d+$/.test(i) || !x || typeof x !== 'object') continue;
              const e = {};
              if (typeof x.mass === 'number' && isFinite(x.mass)) e.mass = Lab.util.clamp(x.mass, 0.1, 10);
              if (typeof x.restitution === 'number' && isFinite(x.restitution)) e.restitution = Lab.util.clamp(x.restitution, 0, 1);
              if (Object.keys(e).length) o[i] = e;
            }
            out[d.key] = o;
          }
          break;
        case 'obstacles': // [{ type, x, size, angle }]
          if (Array.isArray(v)) {
            out[d.key] = v.slice(0, 8)
              .filter((x) => x && ['box', 'pillar', 'ramp'].includes(x.type))
              .map((x) => ({
                type: x.type,
                x: Lab.util.clamp(+x.x || 0, -8, 8),
                size: Lab.util.clamp(+x.size || 1, 0.3, 4),
                angle: Lab.util.clamp(+x.angle || 0, -60, 60),
              }));
          }
          break;
        case 'number':
          if (typeof v === 'number' && isFinite(v)) out[d.key] = Math.floor(v);
          break;
      }
    }
    return out;
  };

  Lab.optionLabel = function (key, value) {
    const d = Lab.paramSchema.find((x) => x.key === key);
    if (!d || !d.options) return String(value);
    const o = d.options.find((x) => x[0] === value);
    return o ? o[1] : String(value);
  };
})();

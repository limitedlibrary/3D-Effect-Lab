/*
 * 集合先：文字
 *
 * 入力された文章をキャンバスに描き、塗られたピクセルから破片の集合先を拾います。
 * - 日本語・英語・数字・記号、複数行（改行）に対応
 * - 長い文は自動で改行し、全体がプレビューに収まるよう大きさを自動調整
 * - キャンバスの大きさに上限を設け、長文でも処理が重くならないようにする
 * - 一度描いた文字はキャッシュし、破片数や演出を変えても描き直さない
 */
Lab.modules.push(function () {
  const BASE_FS = 160;        // 描画時の基準フォントサイズ(px)
  const MAX_SIDE = 2400;      // キャンバスの最大辺(px)
  const MAX_PIXELS = 2.2e6;   // キャンバスの最大ピクセル数
  const MIN_FS = 28;
  const FIT_W = 8.4, FIT_H = 4.8, EM = 2.2; // 3D空間での最大幅・最大高さ・1文字の最大高さ
  const DENSITY = 2500;       // 推奨破片数 = 文字の面積（1文字の大きさを1とした値）× DENSITY
  const MAX_COUNT = 12000;
  const FALLBACK = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
  const NO_LINE_START = '、。，．,.!?！？）)」』】〕〉》・ーぁぃぅぇぉっゃゅょァィゥェォッャュョ';

  function fontCss(params, fs) {
    const f = Lab.fonts[params.font] || Lab.fonts.gothic;
    const w = params.fontWeight === 'normal' ? f.normal : f.bold;
    return `${w} ${fs}px ${f.family}, ${FALLBACK}`;
  }

  function paragraphs(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines;
  }

  // 英数字の単語はひとまとまり、日本語は1文字ずつ改行できる
  function tokenize(line) {
    return line.match(/[A-Za-z0-9À-ɏ'’\-]+|\s+|./gu) || [];
  }

  function wrapLine(ctx, line, maxW) {
    const out = [];
    let cur = '';
    for (const tk of tokenize(line)) {
      const blank = /^\s+$/.test(tk);
      if (cur.trim() && !blank && !NO_LINE_START.includes(tk) && ctx.measureText(cur + tk).width > maxW) {
        out.push(cur.trimEnd());
        cur = tk;
      } else if (!(blank && !cur)) {
        cur += tk;
      }
    }
    if (cur.trim()) out.push(cur.trimEnd());
    return out.length ? out : [''];
  }

  // 文字数に応じて、横長（およそ 3:1）にまとまる行数へ自動で折り返す
  function layout(ctx, params, fs) {
    const paras = paragraphs(params.text);
    if (!params.autoWrap) return paras;
    const total = paras.reduce((s, p) => s + ctx.measureText(p).width, 0);
    const rows = Math.max(1, Math.round(Math.sqrt(total / (fs * 4))));
    const maxW = Math.max(fs * 6, (total / rows) * 1.08);
    return paras.flatMap((p) => (p.trim() ? wrapLine(ctx, p, maxW) : ['']));
  }

  let cache = { key: null, data: null };

  function raster(params) {
    const loaded = document.fonts ? document.fonts.check(fontCss(params, BASE_FS), params.text || 'a') : true;
    const key = [params.text, params.font, params.fontWeight, params.textAlign, params.autoWrap, loaded].join('\u0001');
    if (cache.key === key) return cache.data;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let fs = BASE_FS;
    ctx.font = fontCss(params, fs);
    const lines = layout(ctx, params, fs);

    const measure = () => {
      ctx.font = fontCss(params, fs);
      const lw = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
      return { w: Math.ceil(lw + fs * 0.6), h: Math.ceil(lines.length * fs * 1.25 + fs * 0.6) };
    };
    let { w, h } = measure();
    const scale = Math.min(1, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_PIXELS / (w * h)));
    if (scale < 1) {
      fs = Math.max(MIN_FS, Math.floor(fs * scale));
      ({ w, h } = measure());
      w = Math.min(w, MAX_SIDE * 2);
      h = Math.min(h, MAX_SIDE * 2);
    }

    canvas.width = w;
    canvas.height = h;
    ctx.font = fontCss(params, fs);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    const pad = fs * 0.3, lh = fs * 1.25;
    const align = params.textAlign || 'center';
    ctx.textAlign = align;
    const x = align === 'left' ? pad : align === 'right' ? w - pad : w / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, pad + lh * (i + 0.5)));

    // 塗られたピクセルの位置を Int32Array にまとめる（2回走査で無駄な配列を作らない）
    const img = ctx.getImageData(0, 0, w, h).data;
    let count = 0;
    for (let i = 3; i < img.length; i += 4) if (img[i] > 140) count++;
    const idx = new Int32Array(count);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let p = 0, c = 0; p < w * h; p++) {
      if (img[p * 4 + 3] > 140) {
        idx[c++] = p;
        const px = p % w, py = (p / w) | 0;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
    const data = {
      fs, w, idx, minX, maxX, minY, maxY,
      lines: lines.filter((l) => l.trim()).length,
      chars: [...String(params.text || '').replace(/\s/g, '')].length,
    };
    cache = { key, data };
    return data;
  }

  // シミュレーションの文字オブジェクトでも同じ改行・フォント処理を使う
  Lab.textTools = { fontCss, layout, paragraphs, BASE_FS };

  Lab.registerTarget({
    id: 'text', label: '文字', category: 'text',
    keys: ['text', 'font', 'fontWeight', 'textAlign', 'autoWrap', 'depth'],

    async prepare(params) {
      if (!document.fonts || !String(params.text || '').trim()) return;
      const timeout = new Promise((res) => setTimeout(res, 5000));
      try {
        await Promise.race([document.fonts.load(fontCss(params, BASE_FS), params.text), timeout]);
      } catch (e) { /* フォールバックのフォントで続行 */ }
    },

    sample(params, n, rng) {
      if (!String(params.text || '').trim()) return null;
      const r = raster(params);
      if (!r.idx.length) return null;
      const bw = r.maxX - r.minX + 1, bh = r.maxY - r.minY + 1;
      const k = Math.min(FIT_W / bw, FIT_H / bh, EM / r.fs);
      const cx = (r.minX + r.maxX) / 2, cy = (r.minY + r.maxY) / 2;
      const depth = 0.04 + (params.depth || 0) * 1.4;
      const points = [];
      for (let i = 0; i < n; i++) {
        const j = r.idx[Math.floor(rng() * r.idx.length)];
        const x = j % r.w, y = (j / r.w) | 0;
        points.push({
          p: new THREE.Vector3((x + rng() - cx) * k, -(y + rng() - cy) * k, (rng() - 0.5) * depth),
          n: new THREE.Vector3(0, 0, 1),
        });
      }
      const area = r.idx.length * k * k;
      // 推奨数は表示サイズではなく「線の細かさ」で決める（縮小された長文ほど多く必要）
      const normArea = r.idx.length / (r.fs * r.fs);
      const recommended = Math.min(MAX_COUNT, Math.max(800, Math.round((normArea * DENSITY) / 100) * 100));
      // 破片が線の太さより大きくならないよう上限を設ける（長文でも文字がつぶれない）
      const maxShard = k * r.fs * 0.03;
      return { points, area, maxShard, info: { chars: r.chars, lines: r.lines, recommended } };
    },
  });
});

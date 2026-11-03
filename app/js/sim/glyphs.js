/*
 * 文字の立体化（シミュレーション用）
 *
 * 1文字ずつキャンバスに描き、輪郭をなぞって THREE.Shape にし、押し出して立体の文字にします。
 * 同時に、衝突判定用の「箱の組み合わせ」を文字の形から作ります（細かいほど正確・重い）。
 *  - 輪郭・衝突箱はピクセル単位でキャッシュし、大きさや厚みが変わっても描き直さない
 *  - 文章の並び（改行・自動改行・そろえ方）は「集合」の文字と同じ処理（Lab.textTools）を使う
 */
Lab.modules.push(function () {
  const PX = 128;          // 1文字を描くときの大きさ(px)
  const CELL = PX / 9;     // 衝突箱を作るときの格子の大きさ(px)
  const glyphCache = new Map();

  // ---- 1文字をラスタライズ ----
  function rasterGlyph(ch, params) {
    const T = Lab.textTools;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = T.fontCss(params, PX);
    const adv = ctx.measureText(ch).width;
    const pad = Math.ceil(PX * 0.3);
    const w = Math.ceil(adv + pad * 2), h = Math.ceil(PX * 1.6);
    canvas.width = w; canvas.height = h;
    ctx.font = T.fontCss(params, PX);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, pad, h / 2);
    const img = ctx.getImageData(0, 0, w, h).data;
    const mask = new Uint8Array(w * h);
    let minX = w, maxX = -1, minY = h, maxY = -1;
    for (let i = 0; i < w * h; i++) {
      if (img[i * 4 + 3] > 120) {
        mask[i] = 1;
        const x = i % w, y = (i / w) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    // 文字の中心（px）と、ペン位置からの中心のずれ
    const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2;
    return { mask, w, h, cx, cy, offX: cx - pad, offY: cy - h / 2, bw: maxX - minX + 1, bh: maxY - minY + 1 };
  }

  // ---- 輪郭をなぞる（塗られたピクセルの境界を、塗りが右側に来る向きでつなぐ） ----
  function traceLoops(mask, w, h) {
    const W1 = w + 1;
    const out = new Map(); // 始点 → [終点...]
    const add = (x0, y0, x1, y1) => {
      const a = y0 * W1 + x0, b = y1 * W1 + x1;
      if (!out.has(a)) out.set(a, []);
      out.get(a).push(b);
    };
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        if (!at(x, y - 1)) add(x, y, x + 1, y);
        if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
        if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
        if (!at(x - 1, y)) add(x, y + 1, x, y);
      }
    }
    const loops = [];
    for (const [start, list] of out) {
      while (list.length) {
        const loop = [];
        let prev = start, cur = list.pop();
        loop.push(start);
        let guard = 0;
        while (cur !== start && guard++ < 1e6) {
          loop.push(cur);
          const nexts = out.get(cur);
          if (!nexts || !nexts.length) break;
          let pick = 0;
          if (nexts.length > 1) {
            // 斜めに接するピクセルは別の輪郭として分ける（右折を優先）
            const dx = (cur % W1) - (prev % W1), dy = ((cur / W1) | 0) - ((prev / W1) | 0);
            let best = -1;
            nexts.forEach((n, i) => {
              const nx = (n % W1) - (cur % W1), ny = ((n / W1) | 0) - ((cur / W1) | 0);
              const score = nx === -dy && ny === dx ? 3 : nx === dx && ny === dy ? 2 : 1;
              if (score > best) { best = score; pick = i; }
            });
          }
          prev = cur;
          cur = nexts.splice(pick, 1)[0];
        }
        if (loop.length >= 4) loops.push(loop.map((v) => [v % W1, (v / W1) | 0]));
      }
    }
    return loops;
  }

  // 階段状の輪郭をなめらかにする（Douglas–Peucker 法で点を間引く）
  function simplify(pts, eps) {
    if (pts.length < 4) return pts;
    const keep = new Uint8Array(pts.length);
    const stack = [];
    let far = 0, fd = -1;
    for (let i = 1; i < pts.length; i++) {
      const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
      if (d > fd) { fd = d; far = i; }
    }
    keep[0] = keep[far] = 1;
    stack.push([0, far], [far, pts.length]);
    while (stack.length) {
      const [a, b] = stack.pop();
      const pa = pts[a], pb = pts[b % pts.length];
      const vx = pb[0] - pa[0], vy = pb[1] - pa[1];
      const len = Math.hypot(vx, vy) || 1;
      let md = -1, mi = -1;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((pts[i][0] - pa[0]) * vy - (pts[i][1] - pa[1]) * vx) / len;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  function area(pts) {
    let s = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    return s / 2;
  }

  function inside(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  // 輪郭（px, y下向き）→ 中心基準・y上向きの THREE.Shape 一覧（1px = 1単位）
  function buildShapes(g) {
    const loops = traceLoops(g.mask, g.w, g.h)
      .map((l) => simplify(l, 0.85).map(([x, y]) => [x - g.cx, g.cy - y]))
      .filter((l) => l.length >= 3 && Math.abs(area(l)) > 6);
    const outers = loops.filter((l) => area(l) > 0).map((l) => ({ pts: l, a: area(l), holes: [] }));
    for (const hole of loops.filter((l) => area(l) < 0)) {
      let best = null;
      for (const o of outers) if (inside(hole[0], o.pts) && (!best || o.a < best.a)) best = o;
      if (best) best.holes.push(hole);
    }
    return outers.map((o) => {
      const shape = new THREE.Shape(o.pts.map(([x, y]) => new THREE.Vector2(x, y)));
      for (const hl of o.holes) shape.holes.push(new THREE.Path(hl.map(([x, y]) => new THREE.Vector2(x, y))));
      return shape;
    });
  }

  // 衝突用の箱：粗い格子で塗りの多いマスを拾い、横→縦にまとめる（px, 中心基準・y上向き）
  function buildBoxes(g) {
    const x0 = g.cx - g.bw / 2, y0 = g.cy - g.bh / 2;
    const nx = Math.max(1, Math.round(g.bw / CELL)), ny = Math.max(1, Math.round(g.bh / CELL));
    const cw = g.bw / nx, chh = g.bh / ny;
    const filled = [];
    for (let j = 0; j < ny; j++) {
      filled.push([]);
      for (let i = 0; i < nx; i++) {
        let n = 0, t = 0;
        for (let y = Math.floor(y0 + j * chh); y < y0 + (j + 1) * chh; y += 2) {
          for (let x = Math.floor(x0 + i * cw); x < x0 + (i + 1) * cw; x += 2) {
            t++;
            if (g.mask[y * g.w + x]) n++;
          }
        }
        filled[j].push(t && n / t > 0.38);
      }
    }
    const runs = []; // 横に連続するマス
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!filled[j][i]) continue;
        let k = i;
        while (k + 1 < nx && filled[j][k + 1]) k++;
        runs.push({ i0: i, i1: k, j0: j, j1: j });
        i = k;
      }
    }
    const merged = []; // 同じ幅の行を縦にまとめる
    for (const r of runs) {
      const m = merged.find((b) => b.i0 === r.i0 && b.i1 === r.i1 && b.j1 === r.j0 - 1);
      if (m) m.j1 = r.j0; else merged.push({ ...r });
    }
    if (!merged.length) merged.push({ i0: 0, i1: nx - 1, j0: 0, j1: ny - 1 });
    return merged.map((b) => ({
      x: x0 + ((b.i0 + b.i1 + 1) / 2) * cw - g.cx,
      y: g.cy - (y0 + ((b.j0 + b.j1 + 1) / 2) * chh),
      hx: ((b.i1 - b.i0 + 1) * cw) / 2,
      hy: ((b.j1 - b.j0 + 1) * chh) / 2,
    }));
  }

  function glyph(ch, params) {
    const T = Lab.textTools;
    const key = ch + '\u0001' + T.fontCss(params, PX) + '\u0001' + (document.fonts ? document.fonts.check(T.fontCss(params, PX), ch) : '');
    if (glyphCache.has(key)) return glyphCache.get(key);
    const g = rasterGlyph(ch, params);
    const data = g ? { ...g, shapes: buildShapes(g), boxes: buildBoxes(g), geoms: new Map() } : null;
    if (data) { data.mask = null; }
    glyphCache.set(key, data);
    return data;
  }

  // 押し出した立体（px単位）。厚みごとにキャッシュ
  function geometryFor(g, depthPx) {
    const k = Math.round(depthPx);
    if (g.geoms.has(k)) return g.geoms.get(k);
    const geo = new THREE.ExtrudeGeometry(g.shapes, {
      depth: k, steps: 1, curveSegments: 1,
      bevelEnabled: true, bevelThickness: Math.min(3, k * 0.2), bevelSize: 0.9, bevelSegments: 1,
    });
    geo.translate(0, 0, -k / 2);
    geo.computeVertexNormals();
    g.geoms.set(k, geo);
    return geo;
  }

  /*
   * 文章をレイアウトして、1文字ずつの情報を返す
   * 戻り値: { chars: [{ ch, g, x, y }], scale, height }  x, y は文章中心からの位置（ワールド単位）
   */
  Lab.glyphs = {
    PX,
    layoutText(params, maxW, maxH, charH) {
      const T = Lab.textTools;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = T.fontCss(params, PX);
      const lines = T.layout(ctx, params, PX).filter((l, i, a) => l.trim() || (i > 0 && i < a.length - 1));
      const lh = PX * 1.25;
      const widths = lines.map((l) => ctx.measureText(l).width);
      const maxLineW = Math.max(1, ...widths);
      const scale = Math.min(charH / PX, maxW / maxLineW, maxH / Math.max(1, lines.length * lh));
      const chars = [];
      lines.forEach((line, li) => {
        const arr = [...line];
        const lw = widths[li];
        const start = params.textAlign === 'left' ? -maxLineW / 2 : params.textAlign === 'right' ? maxLineW / 2 - lw : -lw / 2;
        const y = ((lines.length - 1) / 2 - li) * lh;
        for (let i = 0; i < arr.length; i++) {
          const ch = arr[i];
          if (!ch.trim()) continue;
          const g = glyph(ch, params);
          if (!g) continue;
          // 直前までの幅で位置を決める（カーニングも反映される）
          const pen = ctx.measureText(arr.slice(0, i).join('')).width;
          chars.push({ ch, g, x: (start + pen + g.offX) * scale, y: (y - g.offY) * scale });
        }
      });
      return { chars, scale, lines: lines.length };
    },
    geometryFor,
  };
});

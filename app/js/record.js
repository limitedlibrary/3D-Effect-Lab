/*
 * アイデアの記録：スクリーンショット / 設定JSONの保存・読み込み / Blender向けメモ
 */
(function () {
  const FORMAT = '3d-effect-lab';
  const VERSION = 1;

  function stamp() {
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  }

  function download(href, filename) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadText(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    download(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Blenderで組み立てるときの手がかり（設定値を言葉に置き換える）
  // シミュレーション → Blender の Rigid Body に置き換えるときの手がかり
  function simHints(state) {
    const p = state.params;
    const L = (k) => Lab.optionLabel(k, p[k]);
    const hints = [];
    hints.push(`長さ：${p.simDuration.toFixed(1)}秒 ≒ ${Math.round(p.simDuration * 24)}フレーム（24fps）。Scene > Rigid Body World の Cache 終了フレームに設定`);
    if (p.simSubject === 'text') {
      hints.push(`動かすもの：テキスト「${p.text.replace(/\n/g, ' / ')}」を Extrude（厚み）→ Convert to Mesh` +
        (p.simSplit === 'chars' ? ' → Separate > By Loose Parts で1文字ずつ別オブジェクトに（漢字の離れた部分は Join し直す）' : '（1つのオブジェクトのまま）'));
      hints.push('衝突形状：Rigid Body > Collisions の Shape を Convex Hull（凹んだ形を正確にするなら Mesh）');
    } else {
      hints.push(`動かすもの：${L('simShape')}を約${p.simCount}個（Rigid Body: Active、Shape: Box / Sphere / Cylinder）`);
    }
    hints.push(`重さ：Mass ${p.simMass.toFixed(1)}、反発：Bounciness ${p.simRestitution.toFixed(2)}、摩擦：Friction ${p.simFriction.toFixed(2)}、空気抵抗：Damping Translation ${p.simDamping.toFixed(2)}`);
    const over = Object.keys(p.simOverrides || {});
    if (over.length) hints.push(`文字ごとの上書き：${over.map((i) => `${Number(i) + 1}文字目（重さ ${p.simOverrides[i].mass ?? p.simMass}、跳ね返り ${p.simOverrides[i].restitution ?? p.simRestitution}）`).join('、')}`);
    hints.push(`重力：Scene > Gravity を ${(-9.81 * p.simGravity).toFixed(2)} m/s²（Blender は Z が上方向）`);
    hints.push('床・壁・障害物：Rigid Body を Passive に。床の Bounciness は 0 にして、物体側の値で跳ね方を決める');
    if (p.simForce === 'align') hints.push(`整列：${p.simForceStart.toFixed(1)}秒で Rigid Body の Animated をオンにし、整列位置へキーフレーム（または Force Field で引き寄せ）`);
    if (p.simForce === 'point') hints.push(`一点に引き寄せる：Force Field（Force）を Strength マイナスで置く（${p.simForceStart.toFixed(1)}秒から有効）`);
    if (p.simForce === 'repel') hints.push(`中心から反発：床の中心に Force Field（Force, Strength プラス）を置き、${p.simForceStart.toFixed(1)}秒付近だけ強くする`);
    return hints;
  }

  function blenderHints(state) {
    if (Lab.effects[state.effect] && Lab.effects[state.effect].kind === 'sim') return simHints(state);
    const p = state.params;
    const L = (k) => Lab.optionLabel(k, p[k]);
    const fps = 24;
    const hints = [];
    hints.push(`長さ：${p.duration.toFixed(1)}秒 ≒ ${Math.round(p.duration * fps)}フレーム（24fps）`);

    const base = {
      text: `テキストオブジェクト「${p.text.replace(/\n/g, ' / ')}」（フォント：${(Lab.fonts[p.font] || Lab.fonts.gothic).label}・${Lab.optionLabel('fontWeight', p.fontWeight)}、Extrude で厚み ${Math.round(p.depth * 100)}%）`,
      sphere: 'UV球', cube: '立方体', torus: 'トーラス',
    }[p.shape];
    hints.push(`ベース形状：${base} → Geometry Nodes の Distribute Points on Faces で約${p.count}点`);
    hints.push(`破片：${L('shardType')}の小さなメッシュを Instance on Points（Scale にランダム値 0.7〜1.3）`);

    if (state.effect === 'gather') {
      hints.push(`集合：開始位置（${L('scatter')}）→ ベース形状の点へ。Mix Vector の Factor を 0→1 でキーフレーム`);
    } else if (state.effect === 'shatter') {
      hints.push(`破砕：Set Position の Offset = 方向（${L('direction')}）× 距離 × Factor。Factor を 0→1 でアニメーション`);
      if (p.gravity > 0) hints.push('重力：Offset の Z に −Factor² × 係数 を足す（Blender は Z が上方向）');
      if (p.fadeOut) hints.push('最後に消える：Factor 0.5〜1 で Scale Instances を縮める／マテリアルの Alpha を下げる');
    } else if (state.effect === 'appear') {
      hints.push(`${L('mode')}：Scale Instances と マテリアルの Alpha・Emission Strength を Factor で制御（粒子の流れ：${L('drift')}）`);
    }

    hints.push({
      linear: '動き方（直線的）：位置は Mix Vector の直線補間だけ',
      spin: '動き方（回転しながら）：Rotate Instances でランダム軸に回転。回転量 ×（1 − Factor）で到着時に止める',
      vortex: '動き方（渦）：Vector Rotate で Z軸まわりに回しつつ半径を補間。回転角 ×（1 − Factor）',
    }[p.motion]);

    const axis = { bottom: 'Z座標（下から）', top: 'Z座標を反転（上から）', left: 'X座標（左から）', center: '中心からの距離', random: 'Random Value' }[p.order];
    hints.push(`順番（${L('order')}）：${axis} を Map Range して各破片の開始ディレイに。時間差は全体の約${Math.round(p.stagger * 75)}%`);
    hints.push({
      smooth: '緩急：Ease In/Out（ベジェ補間）',
      snap: '緩急：Ease Out（指数）— 勢いよく動いて、すっと止まる',
      linear: '緩急：リニア補間',
      bounce: '緩急：Back（少し行き過ぎて戻る）',
    }[p.easing]);

    const pal = Lab.palettes[p.palette];
    hints.push(`色：${pal.colors.join(' / ')}（発光色 ${pal.glow}）。光の強さ ${Math.round(p.glow * 100)}% → Emission ＋ Bloom / Glare`);
    return hints;
  }

  function buildJSON(state, extra) {
    const eff = Lab.effects[state.effect];
    const preset = Lab.presetById(state.presetId);
    return {
      format: FORMAT,
      version: VERSION,
      app: '3D演出ラボ',
      savedAt: new Date().toISOString(),
      effect: state.effect,
      effectLabel: eff.label,
      preset: preset ? { id: preset.id, name: preset.name, modified: state.modified } : null,
      params: { ...state.params },
      playback: extra.playback,
      camera: extra.camera,
      memo: state.memo || '',
      blenderHints: blenderHints(state),
    };
  }

  // 読み込んだJSONを検証して、復元に使える形に整える
  function parseJSON(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('JSONとして読み込めませんでした');
    }
    if (!data || typeof data !== 'object' || !data.params) throw new Error('3D演出ラボの設定ファイルではありません');
    const effect = Lab.effects[data.effect] ? data.effect : 'gather';
    return {
      effect,
      presetId: data.preset && Lab.presetById(data.preset.id) ? data.preset.id : null,
      modified: data.preset ? !!data.preset.modified : true,
      params: Lab.sanitizeParams(data.params),
      memo: typeof data.memo === 'string' ? data.memo : '',
      playback: data.playback || {},
      camera: data.camera || null,
    };
  }

  function baseName(state) {
    return `3d-lab_${state.effect}_${stamp()}`;
  }

  Lab.record = { blenderHints, buildJSON, parseJSON, download, downloadText, baseName };
})();

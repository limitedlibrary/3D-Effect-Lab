/*
 * 左パネルの演出プリセット
 * effect の初期値（defaults）に params を上書きしたものが適用されます。
 * 気に入った設定ができたら、保存したJSONの params をここへ貼れば新しいプリセットになります。
 */
(function () {
  Lab.presets = [
    // ---- 集合 ----
    { id: 'g_text', effect: 'gather', name: '文字に集合', desc: '入力した文字に回りながら集まる',
      params: { shape: 'text', count: 4500, motion: 'spin', order: 'left', stagger: 0.5,
                duration: 4, size: 0.9, palette: 'library' } },
    { id: 'g_sphere', effect: 'gather', name: '球体に集合', desc: 'いちばん基本の集合',
      params: { shape: 'sphere', count: 2000, motion: 'linear', duration: 3, palette: 'library' } },
    { id: 'g_vortex', effect: 'gather', name: '渦を巻いて集合', desc: '輪から渦を描いてドーナツへ',
      params: { shape: 'torus', count: 3000, motion: 'vortex', scatter: 'ring', spread: 0.6, duration: 4,
                stagger: 0.4, palette: 'neon' } },
    { id: 'g_floor', effect: 'gather', name: '床から組み上がる', desc: '散らばった破片が下から立方体に',
      params: { shape: 'cube', count: 2500, motion: 'spin', scatter: 'floor', order: 'bottom', stagger: 0.7,
                easing: 'bounce', duration: 4, shardType: 'square', palette: 'ice' } },
    { id: 'g_rain', effect: 'gather', name: '降り注いで文字に', desc: '上から降ってきて左から並ぶ',
      params: { shape: 'text', count: 4500, motion: 'linear', scatter: 'sky', order: 'left',
                stagger: 0.6, easing: 'snap', duration: 4, size: 0.85, palette: 'library' } },

    // ---- 破砕 ----
    { id: 's_burst', effect: 'shatter', name: '球体の爆散', desc: '中心から全方向へ弾ける',
      params: { shape: 'sphere', count: 2500, direction: 'radial', power: 0.6, motion: 'spin', duration: 3,
                palette: 'fire', glow: 0.7 } },
    { id: 's_crumble', effect: 'shatter', name: '文字が崩れ落ちる', desc: '上から順に重力で落ちる',
      params: { shape: 'text', count: 4500, direction: 'front', power: 0.15, gravity: 0.7,
                order: 'top', stagger: 0.65, easing: 'linear', motion: 'spin', duration: 4, size: 0.9,
                fadeOut: true, palette: 'library' } },
    { id: 's_wind', effect: 'shatter', name: '横風で吹き飛ぶ', desc: '左から順に右へさらわれる',
      params: { shape: 'cube', count: 3000, direction: 'side', power: 0.7, spread: 0.35, order: 'left',
                stagger: 0.7, easing: 'smooth', motion: 'spin', duration: 4, shardType: 'square',
                fadeOut: true, palette: 'mono' } },

    // ---- 出現・消滅 ----
    { id: 'a_rise', effect: 'appear', name: '光の粒から出現', desc: '下から昇る粒が文字になる',
      params: { shape: 'text', count: 4500, mode: 'appear', drift: 'up', order: 'bottom',
                duration: 4, size: 0.9, palette: 'library' } },
    { id: 'a_vanish', effect: 'appear', name: '上へ溶けて消える', desc: '下から順にほどけて昇る',
      params: { shape: 'sphere', count: 3000, mode: 'disappear', drift: 'up', order: 'bottom', duration: 4,
                palette: 'ice' } },
    { id: 'a_swirl', effect: 'appear', name: '渦の中から出現', desc: '外から渦を巻いて現れる',
      params: { shape: 'torus', count: 3000, mode: 'appear', drift: 'out', motion: 'vortex', order: 'random',
                stagger: 0.5, spread: 0.6, duration: 4, palette: 'neon' } },
    { id: 'a_burst', effect: 'appear', name: '外へ散って消える', desc: '中心からほどけて消滅',
      params: { shape: 'text', count: 4500, mode: 'disappear', drift: 'out', order: 'center',
                stagger: 0.5, spread: 0.3, duration: 3.5, size: 0.9, palette: 'forest' } },

    // ---- シミュレーション ----
    { id: 'sim_drop', effect: 'sim', name: '文字が落ちて跳ねる', desc: '1文字ずつ落下。「有」は重く「庫」はよく跳ねる',
      params: { simSubject: 'text', simSplit: 'chars', simSpawn: 'line', simHeight: 4, simTilt: 0.35,
                simRestitution: 0.45, simFriction: 0.6, simForce: 'none', simDuration: 7,
                simOverrides: { 0: { mass: 4, restitution: 0.1 }, 3: { mass: 0.6, restitution: 0.75 } } } },
    { id: 'sim_whole', effect: 'sim', name: '文字全体で落下', desc: '文章を1つの物体として落とす',
      params: { simSubject: 'text', simSplit: 'whole', simSpawn: 'line', simHeight: 3.5, simTilt: 0.6,
                simRestitution: 0.35, simDuration: 6 } },
    { id: 'sim_align', effect: 'sim', name: '空中に整列', desc: '床の文字が引き寄せられて並ぶ',
      params: { simSubject: 'text', simSplit: 'chars', simSpawn: 'pile', simTilt: 0.6, simForce: 'align',
                simForceStart: 0.8, simForceStrength: 0.45, simTargetHeight: 1.2, simDuration: 6 } },
    { id: 'sim_fall_align', effect: 'sim', name: '落ちてから整列', desc: '跳ねて散らばった後、元の並びへ',
      params: { simSubject: 'text', simSplit: 'chars', simSpawn: 'line', simHeight: 3, simTilt: 0.5,
                simRestitution: 0.5, simForce: 'align', simForceStart: 3, simForceStrength: 0.5,
                simTargetHeight: 1.2, simDuration: 8 } },
    { id: 'sim_repel', effect: 'sim', name: '箱の中ではじける', desc: '図形が積もった後、中心から弾け飛ぶ',
      params: { simSubject: 'shapes', simShape: 'mix', simCount: 36, simSpawn: 'scatter', simHeight: 2, simTilt: 1,
                simWalls: 'box', simRestitution: 0.5, simForce: 'repel', simForceStart: 2.5, simForceStrength: 0.6,
                simDuration: 8, palette: 'neon' } },
    { id: 'sim_ramp', effect: 'sim', name: '斜面を転がる', desc: '球や円柱が斜面を転がり柱にぶつかる',
      params: { simSubject: 'shapes', simShape: 'mix', simCount: 14, simSpawn: 'line', simHeight: 3, simTilt: 0.6,
                simWalls: 'back', simFriction: 0.4, simRestitution: 0.3, simDuration: 8, palette: 'ice',
                simObstacles: [{ type: 'ramp', x: -0.5, size: 3, angle: -18 }, { type: 'pillar', x: 5.2, size: 1, angle: 0 },
                  { type: 'box', x: 3.6, size: 0.8, angle: 0 }] } },
    { id: 'sim_ramp_blender', effect: 'sim', name: '斜面の立方体と円柱', desc: 'Blender出力の検証用：5秒・6個',
      params: { simSubject: 'shapes', simShape: 'mix', simCount: 6, simSpawn: 'line', simHeight: 3, simTilt: 0.6,
                simWalls: 'back', simFriction: 0.4, simRestitution: 0.3, simDuration: 5, palette: 'ice',
                simObstacles: [{ type: 'ramp', x: -0.5, size: 3, angle: -18 }, { type: 'pillar', x: 5.2, size: 1, angle: 0 },
                  { type: 'box', x: 3.6, size: 0.8, angle: 0 }] } },
  ];

  Lab.presetById = (id) => Lab.presets.find((p) => p.id === id);
})();

/*
 * 破片システム（全演出で共通）
 *
 * - 破片は InstancedMesh で一括描画（数千個でも軽い）
 * - 破片ごとの透明度・発光は独自の instance 属性（aAlpha / aGlow）でシェーダーに渡す
 * - 光の粒は Points（加算合成）で描画
 * 演出（effect）は「各破片が時刻 t にどこにいるか」だけを決め、描画はここが担当します。
 */
Lab.modules.push(function () {
  const U = Lab.util;
  const Z = new THREE.Vector3(0, 0, 1);

  function makeGeometry(type) {
    switch (type) {
      case 'square':
        return new THREE.BoxGeometry(0.85, 0.85, 0.1);
      case 'chunk': {
        const g = new THREE.IcosahedronGeometry(0.55, 0);
        g.scale(1, 0.8, 0.6);
        return g;
      }
      default: { // 三角の薄板（正面 = +Z）
        const g = new THREE.CylinderGeometry(0.62, 0.62, 0.1, 3, 1);
        g.rotateX(Math.PI / 2);
        return g;
      }
    }
  }

  Lab.ShardSystem = class {
    constructor(stage) {
      this.stage = stage;
      this.scene = stage.scene;
      this.glowColor = new THREE.Color('#ffcf7a');
      const glowUniform = { value: this.glowColor };

      const mat = (this.material = new THREE.MeshStandardMaterial({
        metalness: 0.35, roughness: 0.4, flatShading: true, transparent: true, side: THREE.DoubleSide,
      }));
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uGlowColor = glowUniform;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nattribute float aGlow;\nvarying float vAlpha;\nvarying float vGlow;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;\nvGlow = aGlow;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uGlowColor;\nvarying float vAlpha;\nvarying float vGlow;')
          .replace('#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\nif (vAlpha < 0.01) discard;\ndiffuseColor.a *= vAlpha;\ntotalEmissiveRadiance += uGlowColor * vGlow;');
      };

      this.dustMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#ffe2a8') },
          uSize: { value: 5.0 },
          uPixelRatio: { value: stage.renderer.getPixelRatio() },
        },
        vertexShader: `
          attribute float aAlpha; attribute float aSize; varying float vAlpha;
          uniform float uSize; uniform float uPixelRatio;
          void main() {
            vAlpha = aAlpha;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * aSize * uPixelRatio * (10.0 / max(0.1, -mv.z));
          }`,
        fragmentShader: `
          uniform vec3 uColor; varying float vAlpha;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5 || vAlpha < 0.003) discard;
            float a = smoothstep(0.5, 0.0, d);
            gl_FragColor = vec4(uColor, a * a * vAlpha);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      this.mesh = null;
      this.dust = null;
      this.shards = [];
      this.out = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1, alpha: 1, glow: 0, dust: 0, dustRadius: 0.2 };
      this._m = new THREE.Matrix4();
      this._s = new THREE.Vector3();
      this._c = new THREE.Color();
    }

    // シミュレーション中は破片を隠す
    setVisible(on) {
      if (this.mesh) this.mesh.visible = on;
      if (this.dust) this.dust.visible = on;
      if (!on) this.stage.setFlash(0);
    }

    dispose() {
      if (this.mesh) {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.dispose();
      }
      if (this.dust) {
        this.scene.remove(this.dust);
        this.dust.geometry.dispose();
      }
    }

    // 形・破片数・破片の形・ばらつき が変わったときだけ作り直す
    build(params, shape) {
      this.dispose();
      const n = shape.points.length;
      const geo = makeGeometry(params.shardType);
      this.alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
      this.glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
      this.glowAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aAlpha', this.alphaAttr);
      geo.setAttribute('aGlow', this.glowAttr);

      const mesh = (this.mesh = new THREE.InstancedMesh(geo, this.material, n));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.setColorAt(0, this._c.set('#ffffff'));
      this.scene.add(mesh);

      const rng = U.mulberry32(params.seed * 31 + 1);
      const tmp = new THREE.Quaternion();
      this.shards = shape.points.map((pt) => {
        const qTarget = new THREE.Quaternion().setFromUnitVectors(Z, pt.n)
          .multiply(tmp.setFromAxisAngle(Z, rng() * Math.PI * 2));
        const axis = U.randomUnit(rng, new THREE.Vector3());
        const qRand = new THREE.Quaternion().setFromAxisAngle(axis, rng() * Math.PI * 2);
        return {
          target: pt.p,
          normal: pt.n,
          qTarget,
          qRand,
          r: [rng(), rng(), rng(), rng()],
          side: U.randomUnit(rng, new THREE.Vector3()),
          axis: U.randomUnit(rng, new THREE.Vector3()),
          spin: (0.5 + rng()) * (rng() < 0.5 ? -1 : 1),
          jit: U.randomUnit(rng, new THREE.Vector3()).multiplyScalar(0.3 + rng() * 0.7),
          colorIdx: Math.floor(rng() * 4),
          sizeVar: 0.7 + rng() * 0.6,
          key: 0,
        };
      });
      this.bounds = shape.bounds;
      const typeFactor = params.shardType === 'chunk' ? 1.1 : params.shardType === 'square' ? 1.0 : 1.25;
      this.baseSize = Math.min(Math.sqrt(shape.area / n), shape.maxShard || Infinity) * typeFactor;

      const dn = (this.dustCount = Math.min(n, 5000));
      const dg = new THREE.BufferGeometry();
      this.dustPos = new THREE.BufferAttribute(new Float32Array(dn * 3), 3).setUsage(THREE.DynamicDrawUsage);
      this.dustAlpha = new THREE.BufferAttribute(new Float32Array(dn), 1).setUsage(THREE.DynamicDrawUsage);
      const sizes = new Float32Array(dn);
      for (let i = 0; i < dn; i++) sizes[i] = 0.5 + rng() * 1.1;
      dg.setAttribute('position', this.dustPos);
      dg.setAttribute('aAlpha', this.dustAlpha);
      dg.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      this.dust = new THREE.Points(dg, this.dustMaterial);
      this.dust.frustumCulled = false;
      this.scene.add(this.dust);
      this.paletteKey = null;
    }

    configure(effect, params) {
      this.effect = effect;
      effect.setup({ shards: this.shards, params, bounds: this.bounds, rng: U.mulberry32(params.seed * 7 + 3) });
      this.applyLook(params);
    }

    applyLook(params) {
      const pal = Lab.palettes[params.palette] || Lab.palettes.library;
      const bg = Lab.backgrounds[params.background] || Lab.backgrounds.dark;
      const fin = Lab.finishes[params.finish] || Lab.finishes.base;
      this.material.metalness = fin.metalness;
      this.material.roughness = fin.roughness;
      const key = params.palette + '|' + params.background;
      if (this.paletteKey === key) return;
      this.paletteKey = key;
      for (let i = 0; i < this.shards.length; i++) {
        const s = this.shards[i];
        this._c.set(pal.colors[s.colorIdx % pal.colors.length]).offsetHSL(0, 0, (s.r[3] - 0.5) * 0.08);
        this.mesh.setColorAt(i, this._c);
      }
      this.mesh.instanceColor.needsUpdate = true;
      this.glowColor.set(pal.glow);
      // 明るい背景では加算合成の粒が見えないので、濃い色で普通に重ねる
      this.dustMaterial.blending = bg.lightDust ? THREE.NormalBlending : THREE.AdditiveBlending;
      this.dustMaterial.uniforms.uColor.value.set(bg.lightDust ? pal.colors[2] : pal.dust);
      this.dustMaterial.needsUpdate = true;
    }

    update(t, params) {
      if (!this.mesh || !this.effect) return;
      const eff = this.effect, out = this.out;
      const size = this.baseSize * params.size;
      const glowAmt = params.glow;
      const baseGlow = glowAmt * 0.12;
      const dustAmt = params.dust;
      const alphas = this.alphaAttr.array, glows = this.glowAttr.array;
      const dpos = this.dustPos.array, dalpha = this.dustAlpha.array;
      const dn = this.dustCount;

      for (let i = 0; i < this.shards.length; i++) {
        const s = this.shards[i];
        out.scale = 1; out.alpha = 1; out.glow = 0; out.dust = 0; out.dustRadius = 0.2;
        eff.evaluate(s, t, params, out);

        const sc = out.alpha <= 0.003 ? 0 : size * s.sizeVar * out.scale;
        this._s.set(sc, sc, sc);
        this._m.compose(out.pos, out.quat, this._s);
        this.mesh.setMatrixAt(i, this._m);
        alphas[i] = out.alpha;
        glows[i] = baseGlow + out.glow * glowAmt * 0.9;

        if (i < dn) {
          const j = i * 3, r = out.dustRadius;
          dpos[j] = out.pos.x + s.jit.x * r;
          dpos[j + 1] = out.pos.y + s.jit.y * r;
          dpos[j + 2] = out.pos.z + s.jit.z * r;
          const twinkle = 0.6 + 0.4 * Math.sin(t * 40 + s.r[1] * 20);
          dalpha[i] = out.dust * dustAmt * twinkle * 0.6;
        }
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
      this.glowAttr.needsUpdate = true;
      this.dustPos.needsUpdate = true;
      this.dustAlpha.needsUpdate = true;
      this.stage.setFlash(eff.light ? eff.light(t, params) * glowAmt : 0);
    }
  };
});

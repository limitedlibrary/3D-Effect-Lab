/*
 * 3Dプレビューの土台：レンダラー・カメラ・マウス操作・ライト・床・発光（ブルーム）
 */
Lab.modules.push(function () {
  const A = Lab.addons;
  const HOME = { pos: new THREE.Vector3(0, 2.2, 12.5), target: new THREE.Vector3(0, 0, 0) };

  Lab.Stage = class {
    constructor(container) {
      this.container = container;
      const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
      r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.shadowMap.enabled = true; // 影はシミュレーションのときだけ使う（setShadows）
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      container.prepend(r.domElement);

      const scene = (this.scene = new THREE.Scene());
      this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
      this.camera.position.copy(HOME.pos);

      const c = (this.controls = new A.OrbitControls(this.camera, r.domElement));
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.minDistance = 3;
      c.maxDistance = 45;
      c.autoRotateSpeed = 1.2;

      const pmrem = new THREE.PMREMGenerator(r);
      scene.environment = pmrem.fromScene(new A.RoomEnvironment(), 0.04).texture;

      scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x30283a, 0.6));
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(5, 8, 6);
      const sc = key.shadow.camera;
      sc.left = sc.bottom = -12; sc.right = sc.top = 12; sc.near = 1; sc.far = 40;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.bias = -0.0005;
      this.keyLight = key;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x9b8fd6, 1.0);
      rim.position.set(-6, 2, -6);
      scene.add(rim);
      this.flash = new THREE.PointLight(0xffd98a, 0, 30, 1.5);
      scene.add(this.flash);

      scene.fog = new THREE.Fog(0x0f1319, 20, 50);
      this.grid = null;

      const comp = (this.composer = new A.EffectComposer(r));
      comp.addPass(new A.RenderPass(scene, this.camera));
      this.bloom = new A.UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.78);
      comp.addPass(this.bloom);
      comp.addPass(new A.OutputPass());

      new ResizeObserver(() => this.resize()).observe(container);
      this.resize();
    }

    resize() {
      const w = Math.max(1, this.container.clientWidth);
      const h = Math.max(1, this.container.clientHeight);
      this.renderer.setSize(w, h);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    applyLook(params) {
      const bg = Lab.backgrounds[params.background] || Lab.backgrounds.dark;
      if (this.bgKey !== params.background) {
        this.bgKey = params.background;
        this.scene.background = new THREE.Color(bg.color);
        this.scene.fog.color.set(bg.color);
        if (this.grid) {
          this.scene.remove(this.grid);
          this.grid.geometry.dispose();
          this.grid.material.dispose();
        }
        this.grid = new THREE.GridHelper(40, 40, bg.grid1, bg.grid2);
        this.grid.position.y = -2.6;
        this.grid.material.transparent = true;
        this.grid.material.opacity = 0.55;
        this.scene.add(this.grid);
      }
      this.grid.visible = params.floor;
      this.bloom.strength = params.glow * 0.8 * bg.bloom;
      const pal = Lab.palettes[params.palette] || Lab.palettes.library;
      this.flash.color.set(pal.glow);
    }

    setShadows(on) {
      this.keyLight.castShadow = on;
    }

    setFlash(v) {
      this.flash.intensity = v * 25;
    }

    resetView() {
      this.camera.position.copy(HOME.pos);
      this.controls.target.copy(HOME.target);
      this.controls.update();
    }

    getView() {
      return { position: this.camera.position.toArray(), target: this.controls.target.toArray() };
    }

    setView(v) {
      if (!v || !Array.isArray(v.position) || !Array.isArray(v.target)) return;
      if (v.position.length !== 3 || v.target.length !== 3) return;
      if (![...v.position, ...v.target].every((x) => typeof x === 'number' && isFinite(x))) return;
      this.camera.position.fromArray(v.position);
      this.controls.target.fromArray(v.target);
      this.controls.update();
    }

    render() {
      this.controls.update();
      this.composer.render();
    }

    // 描画直後に読み出すので preserveDrawingBuffer なしでも取得できる
    capture() {
      this.composer.render();
      return this.renderer.domElement.toDataURL('image/png');
    }
  };
});

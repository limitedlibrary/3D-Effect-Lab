/*
 * シミュレーション：物理ワールド（Rapier）
 *
 * - 1/60秒の固定ステップで進める（描画のフレームレートに左右されない）
 * - 初期状態は「設定＋乱数の種」だけから作るので、リセットすると毎回同じ結果になる
 * - 描画はステップ間を補間して、スロー再生でもなめらかに見せる
 */
Lab.modules.push(function () {
  const RAPIER_URL = 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js';
  const DT = 1 / 60;
  const U = Lab.util;
  let rapierPromise = null;

  // 物理エンジンは、シミュレーションを初めて使うときにだけ読み込む
  Lab.loadRapier = function () {
    if (!rapierPromise) {
      rapierPromise = import(RAPIER_URL).then(async (m) => {
        const R = m.default || m;
        await R.init();
        return R;
      }).catch((e) => { rapierPromise = null; throw e; });
    }
    return rapierPromise;
  };

  Lab.SimWorld = class {
    constructor(R) {
      this.R = R;
      this.world = null;
      this.bodies = [];
      this.step = 0;
    }

    free() {
      if (this.world) this.world.free();
      this.world = null;
      this.bodies = [];
    }

    // 初期状態からワールドを作り直す
    build(params, items, env) {
      const R = this.R;
      this.free();
      this.params = params;
      this.items = items;
      const g = 9.81 * params.simGravity;
      this.gravity = { x: 0, y: -g, z: 0 };
      const world = (this.world = new R.World(this.gravity));
      world.timestep = DT;

      for (const pc of env.pieces) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pc.rotZ || 0);
        const body = world.createRigidBody(R.RigidBodyDesc.fixed()
          .setTranslation(pc.pos[0], pc.pos[1], pc.pos[2])
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
        const cd = pc.kind === 'cylinder' ? R.ColliderDesc.cylinder(pc.hh, pc.r) : R.ColliderDesc.cuboid(pc.hx, pc.hy, pc.hz);
        cd.setFriction(params.simFriction).setRestitution(0);
        world.createCollider(cd, body);
      }

      const over = params.simOverrides || {};
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const o = over[i] || {};
        const mass = o.mass ?? params.simMass;
        const rest = o.restitution ?? params.simRestitution;
        const damp = params.simDamping;
        const body = world.createRigidBody(R.RigidBodyDesc.dynamic()
          .setTranslation(it.spawn.p.x, it.spawn.p.y, it.spawn.p.z)
          .setRotation({ x: it.spawn.q.x, y: it.spawn.q.y, z: it.spawn.q.z, w: it.spawn.q.w })
          .setLinearDamping(damp)
          .setAngularDamping(damp + 0.05)
          .setCcdEnabled(true));
        const density = mass / Math.max(1e-4, it.volume);
        for (const c of it.colliders) {
          const cd = c.kind === 'ball' ? R.ColliderDesc.ball(c.r)
            : c.kind === 'cylinder' ? R.ColliderDesc.cylinder(c.hh, c.r)
            : R.ColliderDesc.cuboid(c.hx, c.hy, c.hz);
          cd.setTranslation(c.offset[0], c.offset[1], c.offset[2])
            .setDensity(density)
            .setFriction(params.simFriction)
            .setRestitution(rest)
            .setRestitutionCombineRule(R.CoefficientCombineRule.Max); // 床ではなく物体側の反発係数を使う
          world.createCollider(cd, body);
        }
        this.bodies.push({
          body, item: it, mass,
          prev: { p: it.spawn.p.clone(), q: it.spawn.q.clone() },
          cur: { p: it.spawn.p.clone(), q: it.spawn.q.clone() },
        });
      }
      this.rule = Lab.simRules[params.simForce] || Lab.simRules.none;
      this.point = new THREE.Vector3(0, params.simForce === 'repel' ? Lab.simEnvironment.FLOOR_Y : params.simTargetHeight, 0);
      this.step = 0;
    }

    get time() {
      return this.step * DT;
    }

    stepOnce() {
      const t = this.time;
      const w = Lab.simRuleWeight(this.rule, t, this.params);
      for (const b of this.bodies) {
        b.body.resetForces(true);
        b.body.resetTorques(true);
        if (w > 0) {
          this.rule.apply({
            body: b.body, item: b.item, mass: b.mass, t, w,
            params: this.params, gravity: this.gravity, point: this.point,
          });
        }
      }
      this.world.step();
      this.step++;
      for (const b of this.bodies) {
        const tmp = b.prev; b.prev = b.cur; b.cur = tmp;
        const p = b.body.translation(), q = b.body.rotation();
        b.cur.p.set(p.x, p.y, p.z);
        b.cur.q.set(q.x, q.y, q.z, q.w);
      }
    }

    // alpha: 前のステップと今のステップの間のどこを描くか（0〜1）
    sync(alpha) {
      const a = U.clamp(alpha, 0, 1);
      for (const b of this.bodies) {
        const o = b.item.object;
        o.position.lerpVectors(b.prev.p, b.cur.p, a);
        o.quaternion.slerpQuaternions(b.prev.q, b.cur.q, a);
      }
    }
  };

  Lab.SimWorld.DT = DT;
});

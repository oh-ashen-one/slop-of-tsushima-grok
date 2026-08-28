import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Staged Mixamo-convention ronin (public/assets/ronin.glb).
 *
 * The GLB is already 1.78 m in vertex space. Armature.scale is 0.01 (cm bones)
 * and the inverse-bind matrices carry the matching ×100, so the skinned figure
 * stands 1.78 m once the skeleton is updated. Measuring the unskinned geometry
 * AABB through the armature scale would read ~1.8 cm — never do that.
 */

const TARGET_H = 1.78;
const IDLE_CUT = 0.08;

const _box = new THREE.Box3();
const _v = new THREE.Vector3();

function smooth01(a, b, x) {
  if (b <= a) return x >= b ? 1 : 0;
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function clipKey(name) {
  return String(name || '').toLowerCase();
}

function findClip(clips, key) {
  const k = key.toLowerCase();
  let hit = clips.find((c) => clipKey(c.name) === k);
  if (hit) return hit;
  hit = clips.find((c) => {
    const n = clipKey(c.name);
    return n === k || n.endsWith('|' + k) || n.endsWith('_' + k) || n.endsWith(' ' + k);
  });
  if (hit) return hit;
  return clips.find((c) => clipKey(c.name).includes(k)) || null;
}

export class RoninHero {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'roninHero';
    this.mesh = null;
    this.mixer = null;
    this.clips = { idle: null, walk: null, mount: null, ride: null };
    this.actions = { idle: null, walk: null, mount: null, ride: null };
    this._hipY = 0.90;
    this._state = 'foot';
    this._mountDone = false;
    this._w = { idle: 1, walk: 0, mount: 0, ride: 0 };
    this._tgt = { idle: 1, walk: 0, mount: 0, ride: 0 };
  }

  async init(ctx) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync('/assets/ronin.glb');
    const scene = gltf.scene;
    scene.name = 'ronin';
    this.root.add(scene);

    const sky = ctx.get('sky');
    scene.traverse((o) => {
      o.frustumCulled = false;
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          /* Blender often dumps the albedo into emission at factor 1; that
           * would un-light the figure and kill the dark-silhouette read. */
          if (m.emissive) m.emissive.setRGB(0, 0, 0);
          if ('emissiveIntensity' in m) m.emissiveIntensity = 0;
          if (sky && sky.injectAerialPerspective && m.isMeshStandardMaterial) {
            sky.injectAerialPerspective(m);
          }
        }
        if (!this.mesh && o.isSkinnedMesh) this.mesh = o;
      }
    });
    if (!this.mesh) {
      scene.traverse((o) => { if (!this.mesh && o.isMesh) this.mesh = o; });
    }
    if (!this.mesh) throw new Error('ronin.glb has no mesh');

    this.root.updateMatrixWorld(true);
    if (this.mesh.skeleton) this.mesh.skeleton.update();
    this._fitToHeight();

    this.mixer = new THREE.AnimationMixer(scene);
    const clips = gltf.animations || [];
    for (const key of ['idle', 'walk', 'mount', 'ride']) {
      const clip = findClip(clips, key);
      this.clips[key] = clip;
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      if (key === 'mount') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      action.setEffectiveWeight(key === 'idle' ? 1 : 0);
      action.play();
      this.actions[key] = action;
    }
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.actions.mount) this._mountDone = true;
    });

    const lighting = ctx.get('lighting');
    if (lighting && lighting.requestShadowCaster) lighting.requestShadowCaster(this.root);
  }

  /**
   * Skinned AABB (bind pose) → uniform scale to 1.78 m, then lift/drop so the
   * soles sit on y = 0 of `root`. Mixamo Hips stay ~0.9 m after this.
   */
  _fitToHeight() {
    const mesh = this.mesh;
    mesh.updateMatrixWorld(true);
    if (mesh.skeleton) mesh.skeleton.update();
    if (typeof mesh.computeBoundingBox === 'function') mesh.computeBoundingBox();
    if (mesh.boundingBox && !mesh.boundingBox.isEmpty()) {
      _box.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld);
    } else {
      _box.setFromObject(this.root);
    }
    const h = _box.max.y - _box.min.y;
    if (h > 0.05 && Math.abs(h - TARGET_H) > 0.02) {
      this.root.scale.multiplyScalar(TARGET_H / h);
      this.root.updateMatrixWorld(true);
      if (mesh.skeleton) mesh.skeleton.update();
      if (typeof mesh.computeBoundingBox === 'function') mesh.computeBoundingBox();
      if (mesh.boundingBox && !mesh.boundingBox.isEmpty()) {
        _box.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld);
      } else {
        _box.setFromObject(this.root);
      }
    }
    this.root.position.y -= _box.min.y;
    this.root.updateMatrixWorld(true);

    const hips = this.root.getObjectByName('Hips') || this.root.getObjectByName('hips');
    if (hips) {
      hips.getWorldPosition(_v);
      this.root.worldToLocal(_v);
      this._hipY = _v.y;
    } else {
      this._hipY = 0.90 * this.root.scale.y;
    }
  }

  getHipY() { return this._hipY; }

  setVisible(v) { this.root.visible = !!v; }

  update(dt, opts = {}) {
    const mode = opts.mode || 'onFoot';
    const speed01 = opts.speed01 || 0;
    const mounting = mode === 'mounting' || !!opts.mounting;
    const saddled = mode === 'mounted' || mode === 'dismounting';

    if (mounting) {
      if (this._state !== 'mounting') {
        this._state = 'mounting';
        this._mountDone = false;
        const m = this.actions.mount;
        if (m) {
          m.reset();
          m.setLoop(THREE.LoopOnce, 1);
          m.clampWhenFinished = true;
          m.play();
        }
      }
      if (this._mountDone || !this.actions.mount) {
        this._want({ idle: 0, walk: 0, mount: 0, ride: 1 });
      } else {
        this._want({ idle: 0, walk: 0, mount: 1, ride: 0 });
      }
    } else if (saddled) {
      if (this._state !== 'saddle') this._state = 'saddle';
      const still = speed01 < IDLE_CUT;
      /* Standing idle in the saddle would put Mixamo's upright legs through
       * the horse. Rest is a slow ride loop (seated), not the on-foot idle. */
      this._want({ idle: 0, walk: 0, mount: 0, ride: 1 });
      if (this.actions.ride) {
        this.actions.ride.setEffectiveTimeScale(still ? 0.18 : 0.55 + speed01 * 0.9);
      }
      void still;
    } else {
      if (this._state !== 'foot') this._state = 'foot';
      const w = speed01 < IDLE_CUT ? 0 : smooth01(IDLE_CUT, 0.32, speed01);
      this._want({ idle: 1 - w, walk: w, mount: 0, ride: 0 });
      if (this.actions.walk) {
        this.actions.walk.setEffectiveTimeScale(0.80 + speed01 * 1.7);
      }
    }

    const fade = 1 - Math.exp(-(dt || 1 / 60) * 12);
    for (const k of ['idle', 'walk', 'mount', 'ride']) {
      this._w[k] += (this._tgt[k] - this._w[k]) * fade;
      const a = this.actions[k];
      if (!a) continue;
      a.enabled = true;
      a.setEffectiveWeight(this._w[k]);
      if (this._w[k] > 0.002 && !a.isRunning()) a.play();
    }
    if (this.mixer) this.mixer.update(dt || 0);
  }

  _want(t) { this._tgt = t; }
}

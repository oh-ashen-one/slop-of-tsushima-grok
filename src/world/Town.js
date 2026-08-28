import * as THREE from 'three';
import { rng } from '../core/Context.js';
import { Builder, Frame } from './town/Builder.js';
import { Street, sunAzimuthAt, streetBearing } from './town/Layout.js';
import { buildPad } from './town/Ground.js';
import { TOWN_PLAN } from './town/Pad.js';
import {
  buildTorii, buildHonden, buildStoneLantern, buildTemizuya,
  buildPrecinctFence, buildSandou, buildStoneStair, buildKura,
} from './town/Buildings.js';
import { pebbleField } from './town/Props.js';
import { injectWear, makeTownMaterials } from './town/Wear.js';
import { buildCampfire, makeFlames } from './town/Campfire.js';
import { Folk, wardrobe } from './town/Folk.js';

const THIN_CULL = 240;
const _dbSize = new THREE.Vector2();
const TAU = Math.PI * 2;

/**
 * Town — a compact shrine compound on the graded pad Terrain already built.
 *
 * The capture harness still aims `town_street` at poi `town` looking at
 * `town_end`, and `night_camp` at `camp` / `camp_fire`. Those names stay.
 */

const M = {
  plank: 'plank',
  weathered: 'weathered',
  painted: 'painted',
  stone: 'stone',
  adobe: 'adobe',
  shingle: 'shingle',
  iron: 'iron',
  rust: 'rust',
  glass: 'glass',
  glassLit: 'glassLit',
  canvas: 'canvas',
  hay: 'hay',
  sign: 'sign',
  rock: 'rock',
  ash: 'ash',
  water: 'water',
  road: 'road',
  rotor: 'rotor',
  thin: 'weathered#thin',
  thinIron: 'rust#thin',
  thinTrim: 'plank#thin',
  wire: 'rust#wire',
};

const MAT_DEFS = [
  ['plank', 'wood_plank', { nrm: 1.25, hex: 2.6, timber: 1 }],
  ['weathered', 'wood_weathered', { nrm: 1.45, hex: 2.6, timber: 1 }],
  ['painted', 'wood_painted', { nrm: 1.1, hex: 2.8, timber: 1 }],
  ['stone', 'stone_block', { nrm: 1.35, hex: 2.4 }],
  ['adobe', 'adobe', { nrm: 1.15, hex: 2.4 }],
  ['shingle', 'shingle', { nrm: 1.5, hex: 2.2 }],
  ['iron', 'corrugated_iron', { nrm: 1.3, metalness: 0.30, roughness: 0.66 }],
  ['rust', 'metal_rusted', { nrm: 1.1, metalness: 0.16, roughness: 0.92 }],
  ['canvas', 'canvas_tent', { nrm: 0.9 }],
  ['hay', 'hay', { nrm: 1.2 }],
  ['rock', 'rock_boulder', { nrm: 1.3, hex: 2.0 }],
  ['ash', 'dirt_dry', { nrm: 0.9 }],
  ['road', 'dirt_packed', { nrm: 1.25, hex: 3.0 }],
  ['rotor', 'wood_painted', { nrm: 0.9 }],
];

export class Town {
  static id = 'town';

  constructor(ctx) {
    this.ctx = ctx;
    this.group = null;
    this.campGroup = null;
    this.mats = new Map();
    this.meshes = [];
    this.flames = null;
    this.fire = null;
    this.rotor = null;
    this.rotorAxis = new THREE.Vector3(1, 0, 0);
    this.rotorAngle = 0;
    this._t = 0;
    this._lamps = [];
    this._glow = null;
    this._glowMat = null;
    this._emitters = [];
    this._litMats = [];
    this.stats = { draws: 0, tris: 0 };
    this.site = null;
  }

  async init() {
    const ctx = this.ctx;
    const rand = rng((ctx.seed ^ 0x7b19a3) >>> 0);
    const proc = ctx.get('procTextures');
    const sky = ctx.get('sky');
    const L = ctx.get('lighting');
    const terrain = ctx.get('terrain');
    const H = ctx.world && ctx.world.ready
      ? ctx.world.getHeight
      : () => 0;

    const { mk } = makeTownMaterials(proc, 16);
    this._wearOpts = new Map();
    for (const [key, tex, over] of MAT_DEFS) {
      const opts = { hex: over.hex || 0, timber: !!over.timber };
      const clean = { ...over };
      delete clean.hex; delete clean.timber;
      this.mats.set(key, mk(key, tex, clean));
      this._wearOpts.set(key, opts);
    }

    const glass = new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0xffffff, roughness: 0.14, metalness: 0.0,
      dithering: true,
    });
    glass.name = 'town_glass';
    this.mats.set('glass', glass);

    const glassLit = new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0xffffff, roughness: 0.30, metalness: 0.0,
      emissive: new THREE.Color(1.0, 0.46, 0.16), emissiveIntensity: 0.0,
      dithering: true,
    });
    glassLit.name = 'town_glassLit';
    this.mats.set('glassLit', glassLit);
    this._litMats.push(glassLit);

    const water = new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0x2b2a24, roughness: 0.075, metalness: 0.0,
      dithering: true,
    });
    water.name = 'town_troughWater';
    this.mats.set('water', water);

    const ashBase = this.mats.get('ash');
    const ashDecal = ashBase.clone();
    ashDecal.name = 'town_ashDecal';
    ashDecal.transparent = true;
    ashDecal.depthWrite = false;
    ashDecal.polygonOffset = true;
    ashDecal.polygonOffsetFactor = -3;
    ashDecal.polygonOffsetUnits = -3;
    ashDecal.roughness = 1.0;
    this.mats.set('ashDecal', ashDecal);
    this._wearOpts.set('ashDecal', { hex: 2.2, timber: false });

    for (const [key, m] of this.mats) {
      injectWear(m, this._wearOpts.get(key) || {});
      if (sky && typeof sky.injectAerialPerspective === 'function') {
        sky.injectAerialPerspective(m);
      }
      if (L && typeof L.registerMaterial === 'function') L.registerMaterial(m);
    }

    const site = (terrain && terrain.townSite) || null;
    const tp = (terrain && terrain.townPad) || null;
    let cx, cz, contour = null, relief = 0;
    if (site) {
      cx = site.x; cz = site.z;
      contour = [site.dir.x, site.dir.z];
      relief = site.relief || 0;
    } else {
      const p = ctx.poi.get('town');
      const q = p ? (p.pos || p) : new THREE.Vector3(-520, 0, -180);
      cx = q.x; cz = q.z;
    }
    const tod = ctx.get('timeOfDay');
    const sunAz = tp ? tp.sunAz : sunAzimuthAt(TOWN_PLAN.hour, ctx.env.dayOfYear || 172,
      tod && tod.latitude != null ? tod.latitude : 38);
    const bearing = tp ? tp.bearing : streetBearing(sunAz, contour, relief);
    this.sunAz = sunAz;
    for (const m of this.mats.values()) {
      if (m.userData.rsSunAz) m.userData.rsSunAz.value.set(sunAz[0], sunAz[1]);
    }
    const len = TOWN_PLAN.length;
    const street = new Street({
      cx, cz, dx: bearing[0], dz: bearing[1], length: len, halfWidth: TOWN_PLAN.corridor,
      getHeight: H, rand, grade: tp ? tp.grade : null,
    });
    this.street = street;

    const B = new Builder();
    const CB = new Builder();
    const out = { glow: [], lamps: [], smoke: [], doors: [] };

    const PLATEAU = TOWN_PLAN.plateau, RIM = TOWN_PLAN.rim;
    const pad = buildPad(B, M.road, street, {
      sMin: -len * 0.5 - TOWN_PLAN.sPad, sMax: len * 0.5 + TOWN_PLAN.sPad,
      plateau: PLATEAU, rim: RIM, getHeight: H, conform: !!tp,
    });
    this.pad = pad;

    const shrine = this._shrine(B, street, pad, rand, out, len);
    this.shrine = shrine;

    const PH = ctx.get('physics');
    if (PH && typeof PH.addCollider === 'function' && shrine.colliders) {
      this._colliders = shrine.colliders.map((c) => PH.addCollider(c));
    }
    if (PH && typeof PH.addBlocker === 'function' && shrine.blockers) {
      this._blockers = shrine.blockers.map((e) => PH.addBlocker({ ...e, radius: 0.08 }));
    }

    const campInfo = this._camp(CB, rand, H);

    this.group = new THREE.Group();
    this.group.name = 'town';
    this.campGroup = new THREE.Group();
    this.campGroup.name = 'camp';

    this._thin = [];
    const emit = (builder, parent) => {
      const geos = builder.build();
      for (const [name, g] of geos) {
        const hash = name.indexOf('#');
        const matName = hash < 0 ? name : name.slice(0, hash);
        const mat = this.mats.get(matName);
        if (!mat) { g.dispose(); continue; }
        g.setAttribute('uv1', g.getAttribute('uv'));
        const mesh = new THREE.Mesh(g, mat);
        mesh.name = 'town_' + name;
        mesh.castShadow = name.indexOf('#wire') < 0;
        if (!mesh.castShadow) mesh.userData.rsNoShadow = true;
        mesh.receiveShadow = true;
        if (hash >= 0) this._thin.push(mesh);
        parent.add(mesh);
        this.meshes.push(mesh);
        this.stats.tris += g.index ? g.index.count / 3 : 0;
      }
    };
    emit(B, this.group);
    emit(CB, this.campGroup);

    if (campInfo && campInfo.ashGeometry) {
      const dm = new THREE.Mesh(campInfo.ashGeometry, this.mats.get('ashDecal'));
      dm.name = 'town_ashDecal';
      dm.castShadow = false;
      dm.receiveShadow = true;
      dm.renderOrder = 1;
      this.campGroup.add(dm);
      this.meshes.push(dm);
      this._ashDecal = dm;
    }
    this.stats.draws = this.meshes.length;

    ctx.scene.add(this.group);
    ctx.scene.add(this.campGroup);

    if (L && typeof L.requestShadowCaster === 'function') {
      for (const m of this.meshes) {
        if (m.material === this.mats.get('road')
          || m.material === this.mats.get('ashDecal')) { m.castShadow = false; continue; }
        if (m.parent === this.campGroup && m.material === this.mats.get('rock')) {
          m.castShadow = false; continue;
        }
        if (!m.castShadow) continue;
        L.requestShadowCaster(m);
      }
    }

    this._folk(street, pad, shrine, rand, proc, sky, L);

    const lampPts = shrine.lampPts || [];
    this._buildGlow(out.glow, lampPts, sky);
    this._campLights(campInfo, L, rand);
    this._townLights(lampPts, L, rand);

    this._smoke = out.smoke.slice(0, 5);
    this._campSmokePos = campInfo ? campInfo.pos.clone() : null;
    this.camp = campInfo ? { pos: campInfo.pos.clone(), radius: 5.5 } : null;

    this._registerPOIs(street, pad, shrine, campInfo);

    const toStreet = tp && tp.toStreet ? tp.toStreet : null;
    const _stScratch = { s: 0, t: 0 };
    const courtS0 = shrine.s0 - 8, courtS1 = shrine.s1 + 8;
    this.site = {
      x: cx, z: cz, radius: RIM + 12,
      onStreet: toStreet
        ? (x, z) => {
          const q = toStreet(x, z, _stScratch);
          return Math.abs(q.t) < 14.0 && q.s > courtS0 && q.s < courtS1;
        }
        : () => false,
      contains: (x, z) => {
        const dxx = x - cx, dzz = z - cz;
        return dxx * dxx + dzz * dzz < (len * 0.6 + RIM) ** 2;
      },
    };

    if (ctx.quality && ctx.quality.name && import.meta.env && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[town]', this.stats.draws, 'draws', Math.round(this.stats.tris), 'tris');
    }
  }

  /* -------------------------------------------------------------- shrine */

  /**
   * Compact precinct along the graded spine: torii → sandō + tōrō → temizuya
   * → stone stair → honden, with a plaster fence and a small kura.
   */
  _shrine(B, street, pad, rand, out, len) {
    const half = len * 0.5;
    const sGate = -half + 16;
    const sHall = sGate + 26;
    const s0 = sGate - 6;
    const s1 = sHall + 11;
    const tL = -10.4, tR = 10.4;

    const frameAt = (s, t, rot = 0) => {
      const n = street.normalRaw(s);
      const p = street.xz(s, t);
      const y = pad.height(s, t);
      const ax = -n[0], az = -n[1];
      const c = Math.cos(rot), si = Math.sin(rot);
      return new Frame(p[0], y, p[1], ax * c - az * si, ax * si + az * c);
    };

    const lampPts = [];
    const colliders = [];
    const blockers = [];

    /* gravel worked into the courtyard — geometry the tiling albedo cannot */
    {
      const spots = [];
      for (let i = 0; i < 70; i++) {
        const u = rand();
        const ss = s0 + u * (s1 - s0);
        const tt = (rand() - 0.5) * 18;
        const p = street.xz(ss, tt);
        const r = rand() < 0.12 ? 0.10 + rand() * 0.07 : 0.045 + rand() * 0.04;
        spots.push({
          x: p[0], y: pad.height(ss, tt) + r * 0.28, z: p[1],
          r, v: 1.05 + rand() * 0.40,
        });
      }
      pebbleField(B, M, spots);
    }

    buildSandou(B, M, street, pad, { s0: sGate + 2.5, s1: sHall - 1.2, half: 1.22, rand });

    /* torii — slightly off the exact crown so the camera sees both pillars */
    const Ftorii = frameAt(sGate, 0);
    buildTorii(B, M, Ftorii, { h: 5.45, span: 4.4, seed: rand() * 6 });

    /* lanterns flanking the sandō */
    const lanternS = [sGate + 6.5, sGate + 13.5, sGate + 20.5, sHall - 2.4];
    for (let i = 0; i < lanternS.length; i++) {
      const ss = lanternS[i];
      for (const side of [-1, 1]) {
        const tt = side * (3.35 + rand() * 0.18);
        const F = frameAt(ss, tt, (rand() - 0.5) * 0.12);
        const p = buildStoneLantern(B, M, F, {
          h: 1.82 + rand() * 0.22,
          tint: 0.88 + rand() * 0.18,
          seed: rand() * 8,
        });
        lampPts.push(p);
        out.glow.push(p);
      }
    }

    /* temizuya, left of the approach */
    buildTemizuya(B, M, frameAt(sGate + 11.5, -5.6, -0.18), {});

    /* stair up onto the hall podium */
    const slope = Math.abs(street.slopeAt(sHall));
    const nStep = slope > 0.03 ? 6 : 4;
    buildStoneStair(B, M, frameAt(sHall - 2.6, 0), {
      n: nStep, rise: 0.155, run: 0.40, w: 4.0, seed: rand() * 4,
    });

    const Fhall = frameAt(sHall, 0);
    const hall = buildHonden(B, M, Fhall, {
      w: 7.6, d: 6.4, h: 3.2, podium: 0.48,
    }, out);
    for (const L of out.lamps) {
      if (L.p) lampPts.push(L.p);
    }

    /* kura, right rear — a second roof so the skyline isn't one hat */
    buildKura(B, M, frameAt(sHall + 3.5, 7.4, 0.35), {
      w: 3.2 + rand() * 0.3, d: 2.6, h: 2.2,
    });

    buildPrecinctFence(B, M, street, pad, {
      s0, s1, t0: tL, t1: tR,
      gateS0: sGate - 3.4, gateS1: sGate + 3.4,
      h: 1.38,
    });

    /* a couple of extra tōrō against the fence for night mass */
    for (const [ss, tt] of [[sGate + 4.2, tL + 1.4], [sHall + 1.0, tR - 1.6]]) {
      const p = buildStoneLantern(B, M, frameAt(ss, tt), { h: 1.7, tint: 0.92, seed: rand() * 5 });
      lampPts.push(p);
      out.glow.push(p);
    }

    /* honden collider */
    {
      const nx = Fhall.bx, nz = Fhall.bz;
      const h = (hall.floor || 0.8) + (hall.wallH || 3.2) + 1.6;
      const y0 = Fhall.oy;
      colliders.push({
        shape: 'box',
        position: new THREE.Vector3(
          Fhall.ox + nx * hall.d * 0.5, y0 + h * 0.5, Fhall.oz + nz * hall.d * 0.5),
        halfExtents: new THREE.Vector3(hall.w * 0.5, h * 0.5, hall.d * 0.5),
        axis: [Fhall.ax, Fhall.az],
        mask: this.ctx.get('physics') ? this.ctx.get('physics').LAYER.WORLD : 1,
        tag: 'building',
        owner: hall,
      });
    }

    /* fence as thin blockers so you don't walk through the plaster */
    const fenceRuns = [
      [s0, s1, tL, tL], [s0, s1, tR, tR], [s0, s0, tL, tR], [s1, s1, tL, tR],
    ];
    for (const [sa, sb, ta, tb] of fenceRuns) {
      const nSeg = 4;
      for (let k = 0; k < nSeg; k++) {
        const u0 = k / nSeg, u1 = (k + 1) / nSeg;
        const sA = sa + (sb - sa) * u0, tA = ta + (tb - ta) * u0;
        const sB = sa + (sb - sa) * u1, tB = ta + (tb - ta) * u1;
        const sm = (sA + sB) * 0.5;
        if (Math.abs(tA - tL) < 0.2 && sm > sGate - 3.4 && sm < sGate + 3.4) continue;
        const A = street.xz(sA, tA), Bp = street.xz(sB, tB);
        const yA = pad.height(sA, tA), yB = pad.height(sB, tB);
        blockers.push({
          ax: A[0], az: A[1], bx: Bp[0], bz: Bp[1],
          yMin: Math.min(yA, yB) - 0.4, yMax: Math.max(yA, yB) + 1.6,
        });
      }
    }

    return {
      sGate, sHall, s0, s1, tL, tR, hall, lampPts, colliders, blockers,
      sCam: sGate - 8.5, tCam: -2.55,
      sLook: sHall + 2.2, tLook: 0.45,
    };
  }

  /* ------------------------------------------------------------------ folk */

  _folk(street, pad, shrine, rand, proc, sky, L) {
    const agents = [];
    const SPEED = 1.05;

    const bake = (pts) => {
      let len = 0;
      for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
      }
      return len;
    };

    const addWalker = (proto, sa, sb, tOf, o = {}) => {
      const n = Math.max(2, Math.round(Math.abs(sb - sa) / 3.0));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const s = sa + ((sb - sa) * u);
        const t = tOf(u);
        const p = street.xz(s, t);
        pts.push([p[0], pad.height(s, t), p[1]]);
      }
      const len = bake(pts);
      const w = wardrobe(rand, !!o.woman);
      agents.push({
        proto, path: pts,
        duration: Math.max(2, len / SPEED),
        dwell: 2.4 + rand() * 5.0,
        tOffset: rand() * 60,
        speedScale: 0.88 + rand() * 0.22,
        walkRate: 0.74 + rand() * 0.16,
        gait: 0.85, phase: rand() * TAU, legBias: 0,
        scale: (o.woman ? 0.955 : 1.0) * (0.96 + rand() * 0.07),
        yaw: 0, tilt: 0, roll: 0,
        coat: w.coat, trou: w.trou, hat: w.hat,
      });
    };

    const addStander = (proto, s, t, o = {}) => {
      const p = street.xz(s, t);
      const tg = street.tangent(s);
      const w = wardrobe(rand, !!o.woman);
      const yaw = o.yaw != null ? o.yaw : Math.atan2(tg[0], tg[1]);
      agents.push({
        proto, path: null,
        x: p[0], y: o.y != null ? o.y : pad.height(s, t), z: p[1],
        duration: 1, dwell: 1, tOffset: 0, speedScale: 1, walkRate: 0,
        gait: 0, phase: rand() * TAU, legBias: o.legBias || 0,
        scale: (o.woman ? 0.955 : 1.0) * (0.96 + rand() * 0.07),
        yaw: yaw + (rand() - 0.5) * 0.4,
        tilt: o.tilt || 0, roll: o.roll || 0,
        coat: w.coat, trou: w.trou, hat: w.hat,
      });
    };

    const { sGate, sHall } = shrine;

    /* two visitors walking the sandō, one returning */
    addWalker(0, sGate - 2, sHall - 1.5, () => -0.6);
    addWalker(1, sHall - 4, sGate + 1, () => 0.9, { woman: true });

    /* temizuya */
    addStander(0, sGate + 11.2, -4.6, { yaw: Math.atan2(
      street.normalRaw(sGate + 11.2)[0], street.normalRaw(sGate + 11.2)[1]) });

    /* pair near the hall steps */
    addStander(0, sHall - 4.2, -1.6);
    addStander(1, sHall - 3.5, -2.4, { woman: true });

    const ctx = this.ctx;
    const W = ctx.world;
    this.folk = new Folk().build({
      proc, sky, lighting: L, rand, agents,
      physics: ctx.get('physics'),
      heightAt: (x, z) => (W && W.ready ? W.getHeight(x, z) : 0),
      emit: (name, payload) => ctx.emit(name, payload),
    });
    this.ctx.scene.add(this.folk.group);
    if (L && typeof L.requestShadowCaster === 'function') {
      for (const m of this.folk.meshes) L.requestShadowCaster(m);
    }

    if (!this._gunHook) {
      this._gunHook = (e) => {
        if (!this.folk) return;
        const p = (e && e.position) || ctx.player.position;
        const loud = (e && e.loudness) || 1;
        this.folk.alarm(p, 62 * loud, 1);
      };
      ctx.on('gunshot', this._gunHook);
    }
    void sky;
  }

  /* ----------------------------------------------------------------- camp */

  _camp(CB, rand, H) {
    const ctx = this.ctx;
    const poi = ctx.poi.get('camp_fire');
    if (!poi) return null;
    const p = poi.pos ? poi.pos : poi;
    const groundY = ctx.world.ready ? ctx.world.getHeight(p.x, p.z) : p.y;
    const res = buildCampfire(CB, M, {
      pos: { x: p.x, z: p.z },
      rand,
      groundY,
      sample: (x, z) => H(x, z),
    });
    return { pos: new THREE.Vector3(p.x, groundY, p.z), ashGeometry: res.ashGeometry };
  }

  _campLights(info, L, rand) {
    if (!info) return;
    const ctx = this.ctx;
    const flames = makeFlames(rand() * 40);
    flames.group.position.copy(info.pos);
    flames.group.position.y += 0.10;
    ctx.scene.add(flames.group);
    this.flames = flames;

    if (L && typeof L.addFireLight === 'function') {
      this.fire = L.addFireLight(info.pos, {
        radius: 22, intensity: 1.5, height: 0.36, flicker: 0.58,
        kelvin: 1980, soot: 0.16, importance: 9, shadow: true,
      });
    } else if (L && typeof L.addLight === 'function') {
      const pl = new THREE.PointLight(0xffffff, 1.4, 26, 2);
      pl.position.set(info.pos.x, info.pos.y + 0.34, info.pos.z);
      ctx.scene.add(pl);
      L.addLight(pl, { fire: true, flicker: 0.58, radius: 26, importance: 8, shadow: true });
      this.fireLight = pl;
    }
  }

  /* --------------------------------------------------------- window glow */

  _buildGlow(glowPts, lampPts, sky) {
    const pts = [];
    for (const p of glowPts) pts.push({ p, s: 1.4, k: 0.55 });
    for (const p of lampPts) {
      pts.push({ p, s: 0.95, k: 1.0 });
      this._lamps.push(p);
    }
    if (!pts.length) return;

    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: /* glsl */`
        attribute float aScale;
        attribute float aK;
        varying vec2 vUv;
        varying float vK;
        void main() {
          vUv = uv;
          vK = aK;
          vec3 c = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          vec3 f = normalize( cameraPosition - c );
          vec3 rt = normalize( cross( vec3( 0.0, 1.0, 0.0 ), f ) );
          vec3 up = cross( f, rt );
          vec3 wp = c + ( rt * position.x + up * position.y ) * aScale;
          gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uOpacity;
        varying vec2 vUv;
        varying float vK;
        void main() {
          vec2 d = vUv * 2.0 - 1.0;
          float r = length( d );
          if ( r > 1.0 ) discard;
          float a = pow( 1.0 - r, 2.6 );
          vec3 col = vec3( 1.00, 0.455, 0.135 );
          gl_FragColor = vec4( col * a * uOpacity * vK, a * uOpacity * vK );
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    mat.userData.rsNoAerial = true;
    const inst = new THREE.InstancedMesh(geo, mat, pts.length);
    const scales = new Float32Array(pts.length);
    const ks = new Float32Array(pts.length);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      m4.makeTranslation(q.p[0], q.p[1], q.p[2]);
      inst.setMatrixAt(i, m4);
      scales[i] = q.s;
      ks[i] = q.k;
    }
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));
    geo.setAttribute('aK', new THREE.InstancedBufferAttribute(ks, 1));
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    inst.renderOrder = 6;
    inst.castShadow = false;
    inst.userData.rsNoAerial = true;
    this.group.add(inst);
    this._glow = inst;
    this._glowMat = mat;
    void sky;
  }

  _townLights(lamps, L, rand) {
    if (!L || typeof L.addLight !== 'function') return;
    const picks = [];
    for (let i = 0; i < lamps.length; i++) if (i % 2 === 0) picks.push(lamps[i]);
    for (const l of picks.slice(0, 10)) {
      const pl = new THREE.PointLight(0xffffff, 0.0, 14, 2);
      pl.color.setRGB(1.0, 0.52, 0.20);
      pl.position.set(l[0], l[1], l[2]);
      this.ctx.scene.add(pl);
      L.addLight(pl, { raw: true, flicker: 0.18, radius: 14, importance: 2, shadow: false });
      this._lampLights = this._lampLights || [];
      this._lampLights.push({ light: pl, base: 0.48 + rand() * 0.22 });
    }
  }

  /* ------------------------------------------------------------------ POI */

  _registerPOIs(street, pad, shrine, campInfo) {
    const ctx = this.ctx;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    /* Stand just outside the torii, a little off the sandō, looking through
     * the gate at the hall. Eye height of a person, not a crane. */
    const sNear = shrine.sCam;
    const tNear = shrine.tCam;
    const sFar = shrine.sLook;
    const tFar = shrine.tLook;
    const a = street.xz(sNear, tNear);
    const b = street.xz(sFar, tFar);
    const ya = pad.height(sNear, tNear);
    const yb = pad.height(sFar, tFar);
    ctx.poi.set('town', { pos: V(a[0], ya + 1.68, a[1]), look: V(b[0], yb + 5.4, b[1]) });
    ctx.poi.set('town_end', { pos: V(b[0], yb + 4.8, b[1]), look: V(a[0], ya + 3.6, a[1]) });

    const cs = street.xz(shrine.sHall, 0);
    ctx.poi.set('town_center', { pos: V(cs[0], pad.height(shrine.sHall, 0) + 1.8, cs[1]) });

    if (campInfo) {
      const p = campInfo.pos;
      const d = new THREE.Vector3(0.82, 0, 0.57).normalize();
      const camX = p.x - d.x * 3.4, camZ = p.z - d.z * 3.4;
      const gy = ctx.world.ready ? ctx.world.getHeight(camX, camZ) : p.y;
      ctx.poi.set('camp', { pos: V(camX, gy + 1.35, camZ), look: V(p.x, p.y + 0.55, p.z) });
      ctx.poi.set('camp_fire', { pos: V(p.x, p.y + 0.45, p.z), look: V(p.x, p.y, p.z) });
    }
  }

  /* --------------------------------------------------------------- update */

  update(dt) {
    const ctx = this.ctx;
    this._t += dt;
    const env = ctx.env;
    const night = Math.min(1, Math.max(0, 1 - (env.daylight != null ? env.daylight : 1) * 1.55));

    if (this.flames) {
      const w = env.windVector;
      const f = this.fire && this.fire.flicker != null ? this.fire.flicker : 0.5;
      for (const m of this.flames.mats) {
        m.uniforms.uTime.value = this._t * (m.userData.speed || 1);
        m.uniforms.uWind.value.set(w ? w.x * 0.06 : 0, 0, w ? w.z * 0.06 : 0);
        m.uniforms.uFlick.value = f;
      }
      this.flames.ember.uniforms.uTime.value = this._t;
      this.flames.ember.uniforms.uFlick.value = f;
      if (this.flames.spark) {
        const su = this.flames.spark.uniforms;
        su.uTime.value = this._t;
        su.uFlick.value = f;
        su.uWind.value.set(w ? w.x * 0.10 : 0, 0, w ? w.z * 0.10 : 0);
        const cam = ctx.camera;
        const rend = ctx.renderer;
        if (cam && rend) {
          const hpx = (rend.getDrawingBufferSize
            ? rend.getDrawingBufferSize(_dbSize).y
            : rend.domElement.height) || 900;
          const fov = (cam.fov || 50) * Math.PI / 180;
          su.uPxPerM.value = hpx / (2 * Math.tan(fov * 0.5));
        }
      }
      if (this.flames.smoke) {
        const amb = env.ambientColor;
        const ai = (env.ambientIntensity != null ? env.ambientIntensity : 0.6);
        for (let i = 0; i < this.flames.smoke.length; i++) {
          const u = this.flames.smoke[i].uniforms;
          u.uTime.value = this._t * (0.8 + i * 0.17);
          u.uFlick.value = f;
          u.uOpacity.value = 0.055 + 0.045 * (1 - night * 0.35);
          u.uWind.value.set(w ? w.x * 0.055 : 0, 0, w ? w.z * 0.055 : 0);
          if (amb) u.uSky.value.setRGB(amb.r * ai * 0.22, amb.g * ai * 0.22, amb.b * ai * 0.24);
        }
      }
    }

    if (this._thin && this._thin.length) {
      const cam = ctx.camera;
      if (cam) {
        for (const m of this._thin) {
          const bs = m.geometry.boundingSphere;
          if (!bs) continue;
          const d = cam.position.distanceTo(bs.center) - bs.radius;
          m.visible = d < THIN_CULL;
        }
      }
    }

    if (this.folk) this.folk.update(dt, ctx.camera ? ctx.camera.position : null);

    const target = night;
    if (this._glowMat) this._glowMat.uniforms.uOpacity.value = target * 0.62;
    for (const m of this._litMats) m.emissiveIntensity = target * 0.55;
    if (this._lampLights) {
      for (const l of this._lampLights) l.light.intensity = target * l.base;
    }

    if (!this._smokeStarted && this._smoke && this._smoke.length) {
      const PT = ctx.get('particles');
      if (PT && typeof PT.emitter === 'function') {
        for (const s of this._smoke) {
          this._emitters.push(PT.emitter('smoke', {
            position: new THREE.Vector3(s.p[0], s.p[1] + 0.3, s.p[2]),
            rate: 1.2 * (0.5 + s.strength), scale: 0.7, radius: 0.14,
          }));
        }
      }
      this._smokeStarted = true;
    }
  }

  resize() {}

  raycastNPC(origin, dir, maxDist = 400) {
    return this.folk ? this.folk.raycastNPC(origin, dir, maxDist) : null;
  }

  applyNPCHit(hit, damage = 1) {
    return this.folk ? this.folk.applyNPCHit(hit, damage) : null;
  }

  killNPC(agentOrIndex, from) {
    return this.folk ? this.folk.killNPC(agentOrIndex, from) : null;
  }

  npcAlarm(position, radius = 55, intensity = 1) {
    if (this.folk) this.folk.alarm(position, radius, intensity);
  }

  raycastNpc(origin, dir, maxDist = 400) {
    const h = this.raycastNPC(origin, dir, maxDist);
    if (h && !h.species) h.species = h.agent && h.agent.woman ? 'townswoman' : 'townsperson';
    return h;
  }

  applyNpcHit(hit, damage = 1) {
    const res = this.applyNPCHit(hit, damage);
    if (res && res.killed && hit && hit.agent) hit.agent.rsDead = 1;
    return res;
  }

  npcStats() {
    if (!this.folk) return { total: 0, alive: 0, dead: 0, alarmed: 0 };
    return {
      total: this.folk.agents.length,
      alive: this.folk.livingCount(),
      dead: this.folk.dead,
      alarmed: this.folk.alarmed,
    };
  }

  dispose() {
    const ctx = this.ctx;
    const L = ctx.get('lighting');
    if (this.fire && this.fire.dispose) this.fire.dispose();
    if (this.fireLight && L) L.removeLight(this.fireLight);
    if (this._lampLights && L) for (const l of this._lampLights) L.removeLight(l.light);
    for (const e of this._emitters) if (e && e.stop) e.stop();
    for (const m of this.meshes) { if (m.geometry) m.geometry.dispose(); }
    for (const m of this.mats.values()) m.dispose();
    if (this.flames) {
      for (const m of this.flames.mats) m.dispose();
      this.flames.ember.dispose();
      if (this.flames.spark) this.flames.spark.dispose();
      if (this.flames.smoke) for (const m of this.flames.smoke) m.dispose();
      this.flames.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      ctx.scene.remove(this.flames.group);
    }
    if (this._glow) { this._glow.geometry.dispose(); this._glowMat.dispose(); }
    if (this.folk) { this.folk.dispose(ctx.scene); this.folk = null; }
    const PH = ctx.get('physics');
    if (this._blockers) {
      if (PH && PH.removeBlocker) for (const b of this._blockers) PH.removeBlocker(b);
      this._blockers = null;
    }
    if (this._colliders) {
      if (PH && PH.removeCollider) for (const c of this._colliders) PH.removeCollider(c);
      this._colliders = null;
    }
    if (this.group) ctx.scene.remove(this.group);
    if (this.campGroup) ctx.scene.remove(this.campGroup);
  }
}

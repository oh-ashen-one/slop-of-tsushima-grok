import { rand2, streamRng, clamp, smoothstep } from './Noise.js';

/**
 * HERO LANDMARKS — the deliberately placed formations that anchor composition.
 * ============================================================================
 *
 * WHY THIS FILE EXISTS
 * ----------------------------------------------------------------------------
 * Pass 9 had a rock butte standing in the midground of `player_third_person`.
 * It anchored the whole frame: the eye measured the plain against it, the horse
 * against the plain, and the distance read. In pass 10 it was GONE and the
 * horizon was empty — and the reason is instructive. Nothing deleted a butte.
 * The butte was a *statistical accident*: `Scatter._emitLandmarks` rolls a coin
 * per 370 m cell against the ecology's `hero` field, and pass 10's vegetation
 * work moved the character's vetted spawn a few hundred metres into a pure
 * GRASSLAND region, where (measured) `hero` runs 0.01-0.12 and `rock` runs
 * 0.001-0.023 for nine hundred metres in front of the lens. A landscape whose
 * landmarks are drawn from a Bernoulli field has no landmarks it can promise.
 *
 * A landmark that only appears when the dice agree is not art direction. So the
 * top of the size hierarchy is now PLANNED, not sampled:
 *
 *   1. A set of viewpoint anchors — the canonical camera poses plus whatever the
 *      POI registry publishes (the character's spawn, the river bend) — declares
 *      "there must be something worth looking at in this cone".
 *   2. For each anchor we search a polar fan in front of the camera for the best
 *      SITE: prominent ground, off the centre line (dead centre is the one place
 *      a landmark reads as a bullseye rather than as composition), clear of
 *      water, town and the other heroes already chosen.
 *   3. The winner gets a formation, not a mesa: a lone pine, a boulder
 *      cluster, or a torii-less stone marker. The creek bridge is placed
 *      separately from hydrology (see `emitBridge`).
 *
 * The procedural field still runs everywhere else — free roam must not be a
 * desert between ten hand-placed props — but its tors are now bigger and rarer,
 * so a planned hero and a found hero belong to the same size class.
 *
 * Everything here is deterministic: integer hashes and `streamRng`, never
 * Math.random, so two boots of the same seed place the same rocks.
 */

/**
 * The fixed canonical camera poses. Duplicated deliberately: `tools/capture.mjs`
 * owns the harness copy, and several render-side modules already keep their own
 * (`src/render/_shot.mjs`, `_profile.mjs`, `lighting/_shots.mjs`). World content
 * cannot import from the harness or from another system's private module, and a
 * frozen five-entry table is cheaper than a new cross-system contract.
 *
 * `up` is the extra height the camera sits above the ground it is looking at —
 * `moonlit_ridge` is 130 m up, so its nearest visible ground is out past 210 m
 * and a landmark placed at 200 m would be under the bottom edge of the frame.
 */
const FIXED_ANCHORS = [
  { name: 'golden_hour_vista', from: [-420, 610], eye: 96, to: [180, -140], near: 180, far: 460, size: [14, 22], kind: 'pine' },
  { name: 'dawn_mist_valley', from: [240, -300], eye: 58, to: [-150, -520], near: 160, far: 380, size: [12, 20], kind: 'pine' },
  { name: 'high_noon_desert', from: [700, 240], eye: 44, to: [1150, 480], near: 90, far: 280, size: [5, 9], kind: 'boulders' },
  { name: 'storm_plains', from: [-900, -680], eye: 52, to: [-400, -240], near: 170, far: 400, size: [13, 21], kind: 'pine' },
  { name: 'moonlit_ridge', from: [-120, 420], eye: 180, to: [420, -80], near: 220, far: 520, size: [16, 24], kind: 'pine' },
];

/** POI pairs (position, aim) that also deserve a landmark in their cone. */
const POI_ANCHORS = [
  { name: 'river', pos: 'river', look: 'river_down', near: 80, far: 280, size: [5, 9], kind: 'boulders' },
];

/**
 * THE CHARACTER'S RING — why `player_third_person` cannot use a single cone.
 *
 * `Player._framing()` derives the over-the-shoulder bearing from the SUN
 * AZIMUTH at the moment the shot resolves (`atan2(-sun.x, -sun.z) + 0.95`, then
 * a seven-way search for the heading with the most terrain depth in it). The
 * character never moves; the camera orbits them, and which way it faces is not
 * knowable at boot, when the plan runs and the clock is still at its default
 * hour. Pass 11's first attempt planned one formation against the boot-time
 * framing and it sat somewhere behind the lens at capture time — the shot came
 * back with the same empty horizon it started with.
 *
 * So the character's spawn gets a RING: seven formations on bearings ~51 degrees
 * apart at 235-420 m, each still chosen inside its own sector by the ordinary
 * scorer, so each one lands on prominent, visible, open ground. The horizontal
 * field of view of the shot is ~76 degrees; with a +/-9 degree jitter the worst
 * case is a landmark ~35 degrees off the view axis, i.e. still in frame. (The
 * five-sector version missed by four degrees: the nearest tor projected to
 * x = 1362 on a 1280-wide frame.)
 *
 * Alternate sectors mix pines, boulder clusters and a stone marker so the
 * ring is not seven identical monuments.
 */
const PLAYER_RING = {
  sectors: 7, near: 70, far: 380,
  size: [[14, 22], [5, 9]],
  kinds: ['pine', 'boulders', 'marker', 'pine', 'boulders', 'pine', 'boulders'],
};

const KIND_SIZE = {
  pine: [12, 22],
  boulders: [4.2, 8.8],
  marker: [1.7, 3.2],
};

/**
 * No two heroes closer than this: a landmark that has a twin is a texture.
 * 175 m rather than 300 because the character's ring puts seven sites on a
 * 235-420 m circle, whose adjacent chord is 204 m at the inner radius. Every
 * other tier is separated by hundreds of metres by construction anyway; this
 * bound exists to stop two anchors electing the same knoll.
 */
const MIN_SEPARATION = 175;

/**
 * Score one candidate site.
 *
 * The terms, in order of how much they matter:
 *   prominence  — does the ground already stand up here? A pine on a knoll
 *                 reads as a landmark; one in a hollow is lost.
 *   off-axis    — 7 to 24 degrees off the look vector. On the centre line the
 *                 formation is a bullseye and it hides the horizon behind it.
 *   openness    — no timber around it, or the silhouette is lost in canopy.
 *   footing     — gentle enough that a 40 m mass is not standing on a cliff.
 *
 * SIGHT LINE is a hard gate, not a term, and it is the one the first attempt
 * missed. The scorer picked a genuinely prominent knoll 240 m in front of the
 * character — nine metres BELOW the local crest at 120 m — and the whole
 * formation rendered behind the horizon. A landmark you cannot see from the
 * viewpoint that asked for it is not a landmark, so the ray from the anchor's
 * eye to the top of the proposed mass is walked against the ground and the
 * candidate is scored on how much of its height clears the skyline.
 */
function sightClearance(ctx, ox, oz, ey, x, z, gy, top, dist) {
  const gh = ctx.world.getHeight;
  const ux = (x - ox) / dist, uz = (z - oz) / dist;
  /* steepest grazing elevation anywhere along the ray — the skyline */
  let eMax = -1e9;
  for (let i = 1; i <= 14; i++) {
    const t = (i / 15) * dist;
    const e = (gh(ox + ux * t, oz + uz * t) - ey) / t;
    if (e > eMax) eMax = e;
  }
  const eTop = (top - ey) / dist;
  const eBase = (gy - ey) / dist;
  const span = Math.max(1e-5, eTop - eBase);
  return { frac: clamp((eTop - eMax) / span, 0, 1), baseVisible: eBase > eMax };
}

function scoreSite(probe, x, z, ctx, ang, dist, band, eco, anchor, size, minSight) {
  if (probe.water) return -1e9;
  const gh = ctx.world.getHeight;
  const y = probe.y;
  if (y < (ctx.world.waterLevel || 0) + 2.0) return -1e9;
  const sight = sightClearance(ctx, anchor.ox, anchor.oz, anchor.ey,
    x, z, y, y + size, dist);
  if (sight.frac < minSight) return -1e9;
  /* prominence over a 90 m neighbourhood */
  let mean = 0;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    mean += gh(x + Math.cos(a) * 90, z + Math.sin(a) * 90);
  }
  mean /= 6;
  const prom = clamp((y - mean) / 26, -1, 1);
  /* off-axis sweet spot */
  const aa = Math.abs(ang);
  const axis = smoothstep(0.045, 0.135, aa) * (1 - smoothstep(0.34, 0.52, aa));
  /* mid-band of the distance window is where a landmark measures best */
  const t = (dist - band[0]) / Math.max(1, band[1] - band[0]);
  const depth = 1 - Math.abs(t - 0.46) * 1.35;
  /* footing: normal.y over ~0.62 is standable ground for a broad base */
  if (probe.slope < 0.58) return -1e9;
  const foot = smoothstep(0.58, 0.80, probe.slope);
  /* keep out of closed timber — a rock inside a canopy is invisible */
  const tree = eco ? eco.sample(eco.tree, x, z) : 0;
  const openK = 1 - smoothstep(0.28, 0.62, tree);
  if (openK < 0.15) return -1e9;
  /* the ecology still gets a vote, it just no longer has a veto */
  const hero = eco ? eco.sample(eco.hero, x, z) : 0.2;
  const rocky = eco ? eco.sample(eco.rock, x, z) : 0.2;

  return sight.frac * 3.40 + (sight.baseVisible ? 0.90 : 0)
    + prom * 1.60 + axis * 1.70 + depth * 1.05 + foot * 0.75
    + openK * 0.85 + hero * 1.15 + rocky * 0.60
    + probe.rock * 0.55 - probe.grass * 0.10;
}

/**
 * Plan the world's hero sites.
 *
 * @param {object} ctx
 * @param {object} probe   a Placement.Probe, reused
 * @param {object|null} eco
 * @param {number} seed
 * @returns {Array<{x:number,z:number,y:number,size:number,seed:number,tag:string}>}
 */
export function planHeroes(ctx, probe, eco, seed) {
  const out = [];
  const townPoi = ctx.poi.get('town');
  const townP = townPoi ? (townPoi.pos || townPoi) : null;

  const anchors = [];
  for (const a of FIXED_ANCHORS) {
    anchors.push({
      name: a.name,
      ox: a.from[0], oz: a.from[1], ey: a.eye,
      tx: a.to[0], tz: a.to[1],
      band: [a.near, a.far], size: a.size, kind: a.kind || 'pine',
    });
  }
  for (const a of POI_ANCHORS) {
    const p = ctx.poi.get(a.pos);
    const l = ctx.poi.get(a.look);
    if (!p || !l) continue;
    const pp = p.pos || p;
    const lp = l.pos || l;
    if (!pp || !lp) continue;
    const dl = Math.hypot(lp.x - pp.x, lp.z - pp.z);
    if (dl < 0.5) continue;
    anchors.push({
      name: a.name,
      ox: pp.x, oz: pp.z,
      ey: pp.y != null ? pp.y : ctx.world.getHeight(pp.x, pp.z) + 2.4,
      tx: lp.x, tz: lp.z,
      band: [a.near, a.far], size: a.size, kind: a.kind || 'boulders',
    });
  }
  /* the character's ring — see PLAYER_RING */
  const pc = ctx.player && ctx.player.position;
  if (pc && (pc.x !== 0 || pc.z !== 0)) {
    const ey = ctx.world.getHeight(pc.x, pc.z) + 1.94;
    for (let k = 0; k < PLAYER_RING.sectors; k++) {
      const a = (k / PLAYER_RING.sectors) * Math.PI * 2
        + (rand2(k, 71, seed + 613) - 0.5) * 0.31;
      const kind = PLAYER_RING.kinds[k % PLAYER_RING.kinds.length];
      anchors.push({
        name: 'player' + k,
        ox: pc.x, oz: pc.z, ey,
        tx: pc.x + Math.cos(a) * 400, tz: pc.z + Math.sin(a) * 400,
        band: kind === 'marker' ? [50, 150] : kind === 'boulders' ? [80, 260] : [180, 380],
        size: KIND_SIZE[kind] || PLAYER_RING.size[k & 1],
        kind,
        fan: 0.052,
      });
    }
  }

  const half = (ctx.world.size || 8192) * 0.5 - 140;

  for (let ai = 0; ai < anchors.length; ai++) {
    const A = anchors[ai];
    const dx = A.tx - A.ox, dz = A.tz - A.oz;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    const base = Math.atan2(uz, ux);

    let best = null;
    /* Two passes. The first insists the formation clears the skyline by 42% of
       its own height; if a sector cannot manage that — the character spawns
       230 m from town, so a third of their ring is inside the settlement
       keep-out and another part faces a rise — the second accepts anything that
       shows a fifth of itself. A landmark half behind a ridge is still a
       landmark; an empty bearing is not. */
    for (const minSight of [0.42, 0.18]) {
      /* Polar fan: 9 bearings x 7 ranges, ~63 terrain probes per anchor. */
      for (let bi = 0; bi < 9; bi++) {
        const jitter = (rand2(ai, bi, seed + 17) - 0.5) * 0.055;
        const ang = (bi - 4) * (A.fan || 0.072) + jitter;
        const ca = Math.cos(base + ang), sa = Math.sin(base + ang);
        for (let ri = 0; ri < 7; ri++) {
          const f = (ri + 0.5 + (rand2(ai * 13 + bi, ri, seed + 29) - 0.5) * 0.7) / 7;
          const dist = A.band[0] + (A.band[1] - A.band[0]) * f;
          const x = A.ox + ca * dist;
          const z = A.oz + sa * dist;
          if (Math.abs(x) > half || Math.abs(z) > half) continue;
          /* never inside the settlement's built area */
          if (townP && Math.hypot(x - townP.x, z - townP.z) < 205) continue;
          /* and never on top of a hero we already placed */
          let clash = false;
          for (const h of out) {
            if ((h.x - x) * (h.x - x) + (h.z - z) * (h.z - z) < MIN_SEPARATION * MIN_SEPARATION) {
              clash = true; break;
            }
          }
          if (clash) continue;
          probe.sample(x, z, true);
          /* score against the SMALLEST formation this anchor might draw, so a
             site that only clears the skyline on a lucky big roll is rejected */
          const s = scoreSite(probe, x, z, ctx, ang, dist, A.band, eco, A,
            A.size[0], minSight);
          if (s <= -1e8) continue;
          if (!best || s > best.s) best = { s, x, z, y: probe.y, ang, dist };
        }
      }
      if (best) break;
    }
    if (!best) continue;
    const r = streamRng((seed ^ (ai * 0x9e3779b1)) | 0);
    const kind = A.kind || 'pine';
    const sz = KIND_SIZE[kind] || A.size;
    const size = sz[0] + (sz[1] - sz[0]) * r();
    out.push({
      x: best.x, z: best.z, y: best.y, size, kind,
      seed: (seed ^ (ai * 0x7feb352d) ^ 0x51ed) | 0,
      tag: A.name,
    });
  }
  return out;
}

/**
 * Seated geometry metrics for one prop variant, cached.
 *
 * `Scatter._seat` normalises a solid so a HORIZONTAL RADIUS of 1 equals 1 unit
 * of instance scale — but only on whichever of x/z was the larger, and the
 * height that falls out of that is whatever the family's aspect gives: the
 * `tall` outcrop comes out 2.36 units high per unit of scaleY, the `bedded` one
 * 0.82. Authoring a formation in raw scale factors therefore means authoring it
 * blind; a scaleY of 1.07*s on the tall family is a mass 2.5*s HIGH, which is
 * exactly how pass 11's first attempt put a 110 m black stele on the moonlit
 * plain. This turns the instance scales back into metres so the sizes below are
 * the sizes you get.
 */
function metrics(S, kind, v) {
  const k = S.kinds.get(kind);
  const g = k.variants[v][0].batch.geom;
  if (!g.userData.rsHeroM) {
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    g.userData.rsHeroM = {
      w: Math.max(1e-3, bb.max.x - bb.min.x),
      h: Math.max(1e-3, bb.max.y - bb.min.y),
      d: Math.max(1e-3, bb.max.z - bb.min.z),
    };
  }
  return g.userData.rsHeroM;
}

/**
 * Emit one prop sized in METRES (width x height x depth of its bounding box).
 */
function putMetres(S, kind, v, x, y, z, W, H, D, o) {
  const m = metrics(S, kind, v);
  S._emit(kind, v, x, y, z, W / m.w, o.yaw, o.tilt, o.nrm, o.align, o.sink,
    o.tint, o.dist, H / m.h, D / m.d, o.bedR, o.bedK);
}

function emitLonePine(S, site, dist, tint, nrm, rnd) {
  const gh = S.ctx.world.getHeight;
  const h = site.size;
  const yaw = rnd() * Math.PI * 2;
  const bole = 0.55 + rnd() * 0.28;
  const spread = h * (0.28 + rnd() * 0.10);
  const pineV = S.kinds.has('pine') ? (rnd() * S.kinds.get('pine').variants.length) | 0 : 0;
  const leafV = S.kinds.has('pineleaf') ? (rnd() * S.kinds.get('pineleaf').variants.length) | 0 : 0;
  const woodTint = [0.72, 0.68, 0.62];
  const leafTint = [0.42 + rnd() * 0.10, 0.50 + rnd() * 0.10, 0.30 + rnd() * 0.08];
  if (S.kinds.has('pine')) {
    putMetres(S, 'pine', pineV, site.x, site.y, site.z,
      bole, h, bole,
      { yaw, tilt: 0.02 + rnd() * 0.04, nrm, align: 0.18, sink: 0.12,
        tint: woodTint, dist, bedR: bole * 1.6, bedK: 0.9 });
  }
  if (S.kinds.has('pineleaf')) {
    putMetres(S, 'pineleaf', leafV, site.x, site.y, site.z,
      spread, h, spread,
      { yaw, tilt: 0, nrm, align: 0, sink: 0.05,
        tint: leafTint, dist, bedR: 0, bedK: 0 });
  }
  const n = 3 + ((rnd() * 4) | 0);
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2;
    const rad = 1.2 + rnd() * (1.4 + h * 0.08);
    const px = site.x + Math.cos(a) * rad, pz = site.z + Math.sin(a) * rad;
    const w = 0.35 + rnd() * 0.85;
    putMetres(S, 'rock', (rnd() * 6) | 0, px, gh(px, pz), pz,
      w, w * (0.50 + rnd() * 0.40), w * (0.72 + rnd() * 0.40),
      { yaw: rnd() * Math.PI * 2, tilt: rnd() * 0.22, nrm, align: 0.48,
        sink: w * 0.18, tint, dist, bedR: w * 0.7, bedK: 0.7 });
  }
}

function emitBoulderCluster(S, site, dist, tint, nrm, rnd) {
  const gh = S.ctx.world.getHeight;
  const s = site.size;
  const n = 4 + ((rnd() * 5) | 0);
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2;
    const rad = k === 0 ? 0 : s * (0.35 + rnd() * 0.85);
    const px = site.x + Math.cos(a) * rad, pz = site.z + Math.sin(a) * rad;
    const w = k === 0 ? s : s * (0.28 + rnd() * 0.55);
    const v = (rnd() * 6) | 0;
    const flat = v === 2 || v === 3;
    putMetres(S, 'rock', v, px, k === 0 ? site.y : gh(px, pz), pz,
      w * (0.85 + rnd() * 0.30), w * (0.48 + rnd() * 0.42), w * (0.72 + rnd() * 0.40),
      { yaw: rnd() * Math.PI * 2, tilt: rnd() * (flat ? 0.08 : 0.22), nrm,
        align: flat ? 0.82 : 0.36, sink: w * (0.18 + rnd() * 0.14),
        tint, dist, bedR: w * 0.85, bedK: 0.85 });
  }
  const grit = 6 + ((rnd() * 6) | 0);
  for (let k = 0; k < grit; k++) {
    const a = rnd() * Math.PI * 2;
    const rad = s * (0.4 + rnd() * 1.4);
    const px = site.x + Math.cos(a) * rad, pz = site.z + Math.sin(a) * rad;
    const w = 0.12 + rnd() * 0.38;
    putMetres(S, 'stone', (rnd() * 2) | 0, px, gh(px, pz), pz,
      w, w * (0.45 + rnd() * 0.5), w,
      { yaw: rnd() * Math.PI * 2, tilt: rnd() * 0.3, nrm, align: 0.8,
        sink: w * 0.3, tint, dist, bedR: w > 0.22 ? w : 0, bedK: 0.45 });
  }
}

function emitStoneMarker(S, site, dist, tint, nrm, rnd) {
  const gh = S.ctx.world.getHeight;
  const h = site.size;
  const yaw = rnd() * Math.PI * 2;
  if (S.kinds.has('marker')) {
    putMetres(S, 'marker', (rnd() * S.kinds.get('marker').variants.length) | 0,
      site.x, site.y, site.z,
      h * (0.28 + rnd() * 0.10), h, h * (0.16 + rnd() * 0.08),
      { yaw, tilt: 0.02 + rnd() * 0.05, nrm, align: 0.22, sink: 0.08,
        tint, dist, bedR: h * 0.45, bedK: 0.9 });
  }
  const n = 2 + ((rnd() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const a = yaw + 0.8 + rnd() * 1.6;
    const rad = 0.55 + rnd() * 1.1;
    const px = site.x + Math.cos(a) * rad, pz = site.z + Math.sin(a) * rad;
    const w = 0.28 + rnd() * 0.55;
    putMetres(S, 'rock', (rnd() * 6) | 0, px, gh(px, pz), pz,
      w, w * (0.5 + rnd() * 0.4), w * (0.7 + rnd() * 0.4),
      { yaw: rnd() * Math.PI * 2, tilt: rnd() * 0.18, nrm, align: 0.5,
        sink: w * 0.2, tint, dist, bedR: w * 0.7, bedK: 0.7 });
  }
}

/**
 * Emit one hero formation through Scatter's `_emit`.
 *
 * Golden-field landmarks are a lone pine, a boulder cluster, or a standing
 * stone marker — never a mesa. Sizes are in metres of finished height.
 *
 * @param {object} S      the Scatter instance (uses _emit, _tintFor, _probe)
 * @param {object} site   from planHeroes
 * @param {number} dist   distance from the streaming origin, for LOD selection
 * @param {Array} tints   ROCK_TINTS
 */
export function emitHeroFormation(S, site, dist, tints) {
  const probe = S._probe;
  probe.sample(site.x, site.z, true);
  const nrm = { x: probe.nx, y: probe.ny, z: probe.nz };
  const rnd = streamRng(site.seed);
  const tint = S._tintFor(site.x, site.z, tints, 3);
  const kind = site.kind || 'pine';
  if (kind === 'boulders') emitBoulderCluster(S, site, dist, tint, nrm, rnd);
  else if (kind === 'marker') emitStoneMarker(S, site, dist, tint, nrm, rnd);
  else emitLonePine(S, site, dist, tint, nrm, rnd);
}

/**
 * Stone-slab creek bridge (field_24). Three overlapping slabs make a 1.8 m+
 * deck; packed-earth ramps are smaller stones at each bank. `site` comes from
 * `findBridgeSite`. Collision is registered via `_emit`; walkability is a
 * terrain height override installed at init.
 */
export function emitBridge(S, site, dist, tints) {
  if (!site || !S.kinds.has('slab')) return;
  const gh = S.ctx.world.getHeight;
  const probe = S._probe;
  probe.sample(site.x, site.z, true);
  const nrm = { x: 0, y: 1, z: 0 };
  const rnd = streamRng((site.seed || S.seed ^ 0x51ed) | 0);
  const tint = S._tintFor(site.x, site.z, tints, 3);
  const yaw = site.yaw || 0;
  const len = site.length || 9;
  const wid = Math.max(1.85, site.width || 2.2);
  const deckY = site.y;
  const ux = Math.cos(yaw), uz = Math.sin(yaw);
  const px = -uz, pz = ux;
  const nSlabs = 3;
  const slabL = len / nSlabs + 0.35;
  for (let i = 0; i < nSlabs; i++) {
    const t = (i + 0.5) / nSlabs - 0.5;
    const x = site.x + ux * t * len + (rnd() - 0.5) * 0.12;
    const z = site.z + uz * t * len + (rnd() - 0.5) * 0.12;
    const v = (rnd() * S.kinds.get('slab').variants.length) | 0;
    putMetres(S, 'slab', v, x, deckY, z,
      slabL, 0.28 + rnd() * 0.10, wid * (0.92 + rnd() * 0.10),
      { yaw: yaw + (rnd() - 0.5) * 0.06, tilt: 0.015, nrm, align: 0,
        sink: 0.04, tint, dist, bedR: wid * 0.45, bedK: 0.55 });
  }
  /* packed-earth / stone ramps at both banks */
  for (const side of [-1, 1]) {
    const bx = site.x + ux * side * (len * 0.5 + 0.4);
    const bz = site.z + uz * side * (len * 0.5 + 0.4);
    for (let k = 0; k < 5; k++) {
      const ox = (rnd() - 0.5) * wid * 1.1 + px * (rnd() - 0.5) * 0.8;
      const oz = (rnd() - 0.5) * wid * 1.1 + pz * (rnd() - 0.5) * 0.8;
      const x = bx + ox, z = bz + oz;
      const w = 0.28 + rnd() * 0.55;
      putMetres(S, k < 2 && S.kinds.has('slab') ? 'slab' : 'rock',
        (rnd() * 2) | 0, x, gh(x, z), z,
        w * 1.4, w * 0.28, w,
        { yaw: yaw + (rnd() - 0.5) * 0.4, tilt: rnd() * 0.08, nrm, align: 0.7,
          sink: w * 0.22, tint, dist, bedR: w * 0.9, bedK: 0.8 });
    }
  }
  /* mossy kerb stones along the edges */
  for (let i = 0; i < 8; i++) {
    const t = (i / 7 - 0.5) * len * 0.9;
    const side = i & 1 ? 1 : -1;
    const x = site.x + ux * t + px * side * (wid * 0.52);
    const z = site.z + uz * t + pz * side * (wid * 0.52);
    const w = 0.16 + rnd() * 0.22;
    putMetres(S, 'stone', (rnd() * 2) | 0, x, gh(x, z), z,
      w, w * 0.45, w,
      { yaw: rnd() * Math.PI * 2, tilt: rnd() * 0.2, nrm, align: 0.75,
        sink: w * 0.28, tint, dist, bedR: 0, bedK: 0 });
  }
}

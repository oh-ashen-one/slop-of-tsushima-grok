import { Frame } from './Builder.js';

/**
 * Shrine masses — a compact jinja, not a western street.
 *
 * Frame convention for every piece: origin on the graded ground, +x to the
 * viewer's right when looking into the compound (+s), +z along the approach
 * (into the precinct), y up. Local y = 0 is the pad under the origin.
 *
 * Palette is vertex colour on the shared town materials. Vermilion lives on
 * the torii only; everything else is dark wood, plaster, stone, bark roof.
 */

export const UV = {
  wall: { us: 1.30, vs: 0.62 },
  wallV: { us: 1.05, vs: 1.30, rot: 1 },
  roof: { us: 1.45, vs: 1.45 },
  iron: { us: 0.85, vs: 1.70 },
  stone: { us: 1.30, vs: 1.30 },
  adobe: { us: 1.55, vs: 1.55 },
  trim: { us: 0.80, vs: 0.34 },
  ground: { us: 2.0, vs: 2.0 },
  metal: { us: 0.55, vs: 0.55 },
};

/* Cinnabar that still reads as painted wood — not candy, not plastic. */
const VERM = [0.58, 0.175, 0.105];
const VERM_DK = [0.38, 0.11, 0.07];
const WOOD = [0.26, 0.19, 0.14];
const WOOD_DK = [0.16, 0.12, 0.09];
const BARK = [0.30, 0.26, 0.22];
const PLASTER = [0.78, 0.72, 0.60];
const STONE = [0.58, 0.54, 0.48];
const DARK = [0.055, 0.046, 0.038];
const ROPE = [0.42, 0.36, 0.26];
const PAPER = [0.86, 0.82, 0.70];

const W = (base, eave, grime, chalk) => [base, eave, grime, chalk];

function jitter(col, k) {
  return [col[0] * k, col[1] * k, col[2] * k];
}

function faceQuad(B, mat, a, b, c, d, want, o) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * want[0] + ny * want[1] + nz * want[2] < 0) B.quad(mat, a, d, c, b, o);
  else B.quad(mat, a, b, c, d, o);
}

/* ------------------------------------------------------------------ torii */

/**
 * Myōjin torii: two inward-leaning hashira, nuki, shimaki, upswept kasagi,
 * gakuzuka tablet, and a shimenawa. Vermilion on painted wood; dark wood
 * end-caps so the silhouette is not a single red slab.
 */
export function buildTorii(B, M, F, o = {}) {
  const h = o.h || 5.35;
  const span = o.span || 4.35;
  const r0 = o.r0 || 0.26;
  const r1 = o.r1 || 0.205;
  const lean = o.lean || 0.055;
  const wear = o.wear || W(F.oy, F.oy + h + 0.8, 0.72, 0.55);
  const col = o.col || VERM;
  const seed = o.seed || 1.7;
  const hx = span * 0.5;

  const post = (sx) => {
    const k = 0.94 + 0.08 * Math.sin(sx * 3.1 + seed);
    const c = jitter(col, k);
    const topX = sx - Math.sign(sx) * lean;
    B.tube(M.painted,
      F.p(sx, 0, -0.08), F.p(topX, 0, h),
      r0, r1, 10,
      { us: 0.7, vs: 1.1, col: c, wear, rings: 3, caps: true, capCol: VERM_DK, wobble: 0.018, phase: seed + sx });
    /* stone bases so the posts don't hover */
    B.box(M.stone, F, sx - 0.42, sx + 0.42, -0.38, 0.38, -0.06, 0.22,
      { us: UV.stone.us, vs: UV.stone.vs, col: jitter(STONE, 0.92 + 0.08 * Math.sin(sx)), wear, skip: 'b' });
  };
  post(-hx);
  post(+hx);

  /* nuki — the tie beam that actually goes THROUGH the pillars */
  const yN = h * 0.62;
  B.box(M.painted, F, -hx - 0.55, hx + 0.55, -0.09, 0.09, yN - 0.11, yN + 0.11,
    { us: 1.4, vs: 0.4, col: jitter(col, 0.96), wear, nv: 1 });

  /* shimaki — secondary lintel just under the kasagi */
  const yS = h - 0.38;
  B.box(M.painted, F, -hx - 0.85, hx + 0.85, -0.13, 0.13, yS - 0.09, yS + 0.10,
    { us: 1.4, vs: 0.4, col: jitter(col, 0.93), wear, nv: 1 });

  /* kasagi — thick top lintel with upswept ends */
  const yK = h + 0.04;
  const half = hx + 1.45;
  const lift = 0.22;
  const kz0 = -0.22, kz1 = 0.22;
  const kh = 0.28;
  const wantF = [-F.bx, 0, -F.bz];
  const wantK = [F.bx, 0, F.bz];
  const kasagiCol = (p, u) => {
    const end = Math.abs(u * 2 - 1);
    const k = 0.92 + 0.10 * Math.sin(u * 17 + seed);
    /* darker toward the tips so the lift reads as a cap, not a glow */
    const t = end > 0.82 ? VERM_DK : col;
    return jitter(t, k);
  };
  const warp = (u, _v, p) => {
    const e = u * 2 - 1;
    p[1] += lift * e * e;
  };
  const oK = { us: 1.6, vs: 0.45, wear, col: kasagiCol, warp, nu: 12, nv: 1 };
  B.quad(M.painted, F.p(-half, kz0, yK), F.p(half, kz0, yK),
    F.p(half, kz0, yK + kh), F.p(-half, kz0, yK + kh), { ...oK, col: kasagiCol });
  B.quad(M.painted, F.p(half, kz1, yK), F.p(-half, kz1, yK),
    F.p(-half, kz1, yK + kh), F.p(half, kz1, yK + kh), { ...oK, col: kasagiCol });
  B.quad(M.painted, F.p(-half, kz0, yK + kh), F.p(half, kz0, yK + kh),
    F.p(half, kz1, yK + kh), F.p(-half, kz1, yK + kh), { ...oK, col: kasagiCol });
  B.quad(M.painted, F.p(-half, kz1, yK), F.p(half, kz1, yK),
    F.p(half, kz0, yK), F.p(-half, kz0, yK), { ...oK, col: kasagiCol });
  /* dark end caps */
  for (const sx of [-half, half]) {
    const e = Math.sign(sx);
    B.box(M.weathered, F, sx - e * 0.02, sx + e * 0.12, kz0 - 0.02, kz1 + 0.02,
      yK + lift - 0.04, yK + kh + lift + 0.04,
      { us: 0.4, vs: 0.4, col: WOOD_DK, wear, nu: 1, nv: 1 });
  }
  void wantF; void wantK;

  /* gakuzuka — the little tablet under the kasagi */
  B.box(M.painted, F, -0.16, 0.16, -0.05, 0.05, yS + 0.10, yK + 0.02,
    { us: 0.4, vs: 0.5, col: jitter(col, 0.88), wear, nu: 1, nv: 1 });
  B.box(M.weathered, F, -0.28, 0.28, -0.06, 0.06, yS + 0.22, yS + 0.62,
    { us: 0.5, vs: 0.4, col: WOOD, wear, nu: 1, nv: 1 });

  buildShimenawa(B, M, F, { y: yN + 0.22, span: span * 0.72, wear });
  return { h, span };
}

/** Thick rice-straw rope with hanging shide zigzags. */
export function buildShimenawa(B, M, F, o = {}) {
  const y = o.y || 3.4;
  const half = (o.span || 3.2) * 0.5;
  const wear = o.wear || W(F.oy, F.oy + y + 1, 0.8, 0.3);
  const sag = o.sag || 0.18;
  const r = o.r || 0.085;
  const segs = 9;
  let prev = null;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = -half + t * half * 2;
    const yy = y - sag * Math.sin(Math.PI * t);
    const p = F.p(x, 0.02, yy);
    if (prev) {
      B.tube(M.hay, prev, p, r * (0.92 + 0.12 * Math.sin(i * 1.7)), r, 7,
        { us: 0.4, vs: 0.5, col: ROPE, wear, rings: 1, wobble: 0.08, phase: i });
    }
    prev = p;
  }
  /* shide — folded white paper streamers */
  for (let i = 1; i < segs; i += 2) {
    const t = i / segs;
    const x = -half + t * half * 2;
    const yy = y - sag * Math.sin(Math.PI * t) - 0.04;
    const SF = F.sub(x, 0.04, yy);
    for (let k = 0; k < 4; k++) {
      const y0 = -0.04 - k * 0.11;
      const x0 = (k % 2 === 0 ? -1 : 1) * 0.045;
      B.box(M.canvas, SF, x0 - 0.035, x0 + 0.035, -0.008, 0.008, y0 - 0.12, y0,
        { us: 0.3, vs: 0.3, col: PAPER, wear, nu: 1, nv: 1 });
    }
  }
}

/* ----------------------------------------------------------- stone lantern */

/**
 * Kasuga-style tōrō. Returns the world-space flame point so Town can hang a
 * halo and a local light in the hibukuro.
 */
export function buildStoneLantern(B, M, F, o = {}) {
  const h = o.h || 1.95;
  const wear = o.wear || W(F.oy, F.oy + h + 0.4, 0.88, 0.22);
  const k = o.tint || 1;
  const col = jitter(STONE, k);
  const colDk = jitter(STONE, k * 0.82);

  /* kiso */
  B.box(M.stone, F, -0.38, 0.38, -0.38, 0.38, 0.0, 0.16,
    { us: UV.stone.us, vs: UV.stone.vs, col: colDk, wear, skip: 'b' });
  B.box(M.stone, F, -0.28, 0.28, -0.28, 0.28, 0.16, 0.28,
    { us: UV.stone.us, vs: UV.stone.vs, col, wear, skip: 'b' });

  /* sao */
  B.tube(M.stone, F.p(0, 0, 0.28), F.p(0, 0, h * 0.52), 0.11, 0.09, 8,
    { us: 0.7, vs: 0.7, col, wear, rings: 2, wobble: 0.04, phase: o.seed || 0 });

  /* chūdai */
  const yC = h * 0.52;
  B.box(M.stone, F, -0.30, 0.30, -0.30, 0.30, yC, yC + 0.10,
    { us: 0.8, vs: 0.4, col: colDk, wear, nu: 1, nv: 1 });

  /* hibukuro — square firebox with four openings and a lit core */
  const yB = yC + 0.10;
  const yT = yB + 0.38;
  const s = 0.18;
  B.box(M.stone, F, -s, s, -s, s, yB, yT,
    { us: 0.5, vs: 0.5, col, wear, nu: 1, nv: 1, skip: 'tb' });
  const hole = 0.09;
  const inset = s - 0.012;
  B.faceZ(M.glassLit, F, -inset, -hole, hole, yB + 0.07, yT - 0.07, -1,
    { us: 0.3, vs: 0.3, col: [1, 0.72, 0.32], wear, nu: 1, nv: 1 });
  B.faceZ(M.glassLit, F, inset, -hole, hole, yB + 0.07, yT - 0.07, +1,
    { us: 0.3, vs: 0.3, col: [1, 0.72, 0.32], wear, nu: 1, nv: 1 });
  B.faceX(M.glassLit, F, -inset, -hole, hole, yB + 0.07, yT - 0.07, -1,
    { us: 0.3, vs: 0.3, col: [1, 0.72, 0.32], wear, nu: 1, nv: 1 });
  B.faceX(M.glassLit, F, inset, -hole, hole, yB + 0.07, yT - 0.07, +1,
    { us: 0.3, vs: 0.3, col: [1, 0.72, 0.32], wear, nu: 1, nv: 1 });

  /* kasa — wide hexagonal-ish roof */
  const yK = yT;
  B.box(M.stone, F, -0.46, 0.46, -0.46, 0.46, yK, yK + 0.06,
    { us: 0.9, vs: 0.9, col: colDk, wear, nu: 1, nv: 1 });
  const peak = yK + 0.22;
  const eaves = [
    F.p(-0.50, -0.50, yK + 0.01), F.p(0.50, -0.50, yK + 0.01),
    F.p(0.50, 0.50, yK + 0.01), F.p(-0.50, 0.50, yK + 0.01),
  ];
  const apex = F.p(0, 0, peak);
  B.tri(M.stone, eaves[0], eaves[1], apex, { us: 0.8, vs: 0.8, col, wear });
  B.tri(M.stone, eaves[1], eaves[2], apex, { us: 0.8, vs: 0.8, col, wear });
  B.tri(M.stone, eaves[2], eaves[3], apex, { us: 0.8, vs: 0.8, col, wear });
  B.tri(M.stone, eaves[3], eaves[0], apex, { us: 0.8, vs: 0.8, col, wear });

  /* hōju */
  B.tube(M.stone, F.p(0, 0, peak), F.p(0, 0, peak + 0.14), 0.055, 0.03, 6,
    { us: 0.3, vs: 0.3, col: jitter(STONE, 0.9), wear, caps: true });

  return F.p(0, 0, yB + 0.19);
}

/* -------------------------------------------------------------- temizuya */

export function buildTemizuya(B, M, F, o = {}) {
  const wear = o.wear || W(F.oy, F.oy + 3.2, 0.7, 0.4);
  const w = o.w || 2.35;
  const d = o.d || 1.65;
  const postH = 2.05;
  const hx = w * 0.5, hz = d * 0.5;
  const wood = WOOD;
  for (const [x, z] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]]) {
    B.tube(M.weathered, F.p(x, z, 0), F.p(x, z, postH), 0.07, 0.055, 6,
      { us: 0.4, vs: 0.7, col: wood, wear, caps: true });
  }
  /* small kirizuma roof, ridge along x */
  const yE = postH, yR = postH + 0.55;
  const oh = 0.32;
  const rcol = BARK;
  const warp = (u, v, p) => {
    const e = u * 2 - 1;
    p[1] += 0.08 * e * e * (1 - v);
  };
  B.quad(M.shingle,
    F.p(-hx - oh, -hz - oh, yE), F.p(hx + oh, -hz - oh, yE),
    F.p(hx + oh, 0, yR), F.p(-hx - oh, 0, yR),
    { us: UV.roof.us, vs: UV.roof.vs, col: rcol, wear, warp, step: 0.8 });
  B.quad(M.shingle,
    F.p(hx + oh, hz + oh, yE), F.p(-hx - oh, hz + oh, yE),
    F.p(-hx - oh, 0, yR), F.p(hx + oh, 0, yR),
    { us: UV.roof.us, vs: UV.roof.vs, col: rcol, wear, warp, step: 0.8 });
  B.box(M.weathered, F, -hx - oh, hx + oh, -0.05, 0.05, yR - 0.03, yR + 0.06,
    { us: 0.8, vs: 0.3, col: WOOD_DK, wear, nv: 1 });

  /* stone basin */
  B.tube(M.stone, F.p(0, 0, 0.02), F.p(0, 0, 0.52), 0.42, 0.48, 10,
    { us: 0.8, vs: 0.6, col: STONE, wear, rings: 1, caps: true, capCol: jitter(STONE, 0.7) });
  B.faceY(M.water, F, 0.48, -0.38, 0.38, -0.38, 0.38, +1,
    { us: 0.6, vs: 0.6, col: [0.55, 0.62, 0.58], wear, nu: 1, nv: 1 });
  /* hishaku — dipper on the rim */
  B.tube(M.weathered, F.p(0.12, 0.10, 0.50), F.p(0.55, 0.18, 0.62), 0.012, 0.012, 5,
    { us: 0.2, vs: 0.3, col: wood, wear });
  B.tube(M.weathered, F.p(0.55, 0.18, 0.62), F.p(0.55, 0.18, 0.52), 0.04, 0.036, 6,
    { us: 0.3, vs: 0.3, col: wood, wear, caps: true });
}

/* ----------------------------------------------------------------- honden */

/**
 * Small raised haiden/honden: stone podium, dark posts, plaster infill,
 * kirizuma roof with a slight eave lift, chigi and katsuogi.
 */
export function buildHonden(B, M, F, o = {}, out = { glow: [], lamps: [], smoke: [], doors: [] }) {
  const w = o.w || 7.4;
  const d = o.d || 6.2;
  const wallH = o.h || 3.15;
  const podium = o.podium || 0.42;
  const floor = podium + 0.38;
  const wear = o.wear || W(F.oy, F.oy + wallH + floor + 3.2, 0.68, 0.42);
  const hx = w * 0.5;
  const z0 = 0, z1 = d;

  /* stone podium */
  B.box(M.stone, F, -hx - 0.45, hx + 0.45, z0 - 0.55, z1 + 0.45, -0.08, podium,
    { us: UV.stone.us, vs: UV.stone.vs, col: jitter(STONE, 0.9), wear, skip: 'b', step: 1.2 });
  /* cap stones */
  B.box(M.stone, F, -hx - 0.52, hx + 0.52, z0 - 0.62, z1 + 0.52, podium - 0.06, podium + 0.08,
    { us: UV.stone.us, vs: 0.5, col: STONE, wear, nv: 1 });

  /* posts — a 3 × 3 grid, the front centre bay is the entrance */
  const xs = [-hx + 0.18, 0, hx - 0.18];
  const zs = [z0 + 0.16, (z0 + z1) * 0.5, z1 - 0.16];
  for (const x of xs) {
    for (const z of zs) {
      B.tube(M.weathered, F.p(x, z, podium - 0.02), F.p(x, z, floor + wallH),
        0.13, 0.11, 8,
        { us: 0.5, vs: 0.9, col: WOOD_DK, wear, caps: true });
    }
  }

  /* raised floor */
  B.faceY(M.plank, F, floor, -hx + 0.05, hx - 0.05, z0 + 0.08, z1 - 0.08, +1,
    { us: 1.2, vs: 0.55, rot: 1, col: WOOD, wear, step: 1.0 });
  /* nuki / floor beam under the deck */
  B.box(M.weathered, F, -hx + 0.04, hx - 0.04, z0 + 0.08, z1 - 0.08, floor - 0.10, floor,
    { us: 1.2, vs: 0.4, col: WOOD_DK, wear, skip: 't' });

  /* plaster panels between posts (skip the front centre bay) */
  const plaster = (x0, x1, za, zb, skipFront) => {
    const thick = 0.08;
    if (!skipFront) {
      B.box(M.adobe, F, x0 + 0.14, x1 - 0.14, za - 0.02, za + thick,
        floor + 0.08, floor + wallH - 0.08,
        { us: UV.adobe.us, vs: UV.adobe.vs, col: PLASTER, wear, step: 1.1 });
    }
    B.box(M.adobe, F, x0 + 0.14, x1 - 0.14, zb - thick, zb + 0.02,
      floor + 0.08, floor + wallH - 0.08,
      { us: UV.adobe.us, vs: UV.adobe.vs, col: jitter(PLASTER, 0.94), wear, step: 1.1 });
  };
  plaster(xs[0], xs[1], zs[0], zs[2], true);
  plaster(xs[1], xs[2], zs[0], zs[2], true);
  /* side walls */
  for (const x of [xs[0], xs[2]]) {
    const outS = x < 0 ? -1 : 1;
    B.box(M.adobe, F,
      x + (outS < 0 ? -0.04 : -0.02), x + (outS < 0 ? 0.02 : 0.04),
      zs[0] + 0.16, zs[2] - 0.16,
      floor + 0.08, floor + wallH - 0.08,
      { us: UV.adobe.us, vs: UV.adobe.vs, col: jitter(PLASTER, 0.96), wear, step: 1.1 });
  }
  /* back wall solid */
  B.box(M.adobe, F, xs[0] + 0.16, xs[2] - 0.16, zs[2] - 0.10, zs[2] + 0.04,
    floor + 0.08, floor + wallH - 0.08,
    { us: UV.adobe.us, vs: UV.adobe.vs, col: jitter(PLASTER, 0.90), wear, step: 1.1 });

  /* lattice / board infill on the front bays flanking the door */
  const lat = (x0, x1) => {
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const x = x0 + 0.22 + ((x1 - x0 - 0.44) * i) / n;
      B.box(M.thin, F, x - 0.018, x + 0.018, z0 + 0.10, z0 + 0.16,
        floor + 0.12, floor + wallH - 0.14,
        { us: 0.3, vs: 0.5, col: WOOD, wear, nu: 1, nv: 2 });
    }
    for (let j = 0; j < 3; j++) {
      const y = floor + 0.35 + j * 0.85;
      B.box(M.thin, F, x0 + 0.20, x1 - 0.20, z0 + 0.10, z0 + 0.16, y, y + 0.03,
        { us: 0.5, vs: 0.2, col: WOOD, wear, nu: 2, nv: 1 });
    }
  };
  lat(xs[0], xs[1]);
  lat(xs[1], xs[2]);

  /* doors — two leaves, slightly ajar, darkness behind */
  const dw = 0.62, dh = 2.05;
  const doorY0 = floor;
  B.faceZ(M.weathered, F, z0 + 0.55, -dw * 1.05, dw * 1.05, doorY0, doorY0 + dh + 0.1, -1,
    { us: 1, vs: 1, col: DARK, wear, nu: 1, nv: 1 });
  const doorCol = WOOD_DK;
  B.box(M.weathered, F, -dw - 0.02, -0.04, z0 - 0.04, z0 + 0.10, doorY0, doorY0 + dh,
    { us: UV.wallV.us, vs: UV.wallV.vs, rot: 1, col: doorCol, wear, nu: 2, nv: 3 });
  /* right leaf cracked open */
  const DF = F.sub(0.08, z0, doorY0, -0.32);
  B.box(M.weathered, DF, 0, dw, -0.04, 0.06, 0, dh,
    { us: UV.wallV.us, vs: UV.wallV.vs, rot: 1, col: doorCol, wear, nu: 2, nv: 3 });
  out.doors.push({ F, open: true });

  /* interior glow so the open door isn't a black hole at dusk */
  out.glow.push(F.p(0, 0.4, floor + 1.4));

  /* roof — kirizuma, ridge along z so the gable faces the approach */
  const yE = floor + wallH + 0.12;
  const yR = yE + 1.85;
  const ohX = 0.95, ohZ = 0.55;
  const lift = 0.18;
  const sag = 0.08;
  const rcol = (p, u, v) => {
    const n = Math.sin(u * 21.3 + p[0] * 0.4) * Math.sin(v * 17.1 + p[2] * 0.5);
    const k = 0.92 + 0.14 * n;
    return [BARK[0] * k, BARK[1] * k, BARK[2] * k];
  };
  const warpL = (u, v, p) => {
    const e = v; /* eave (0) → ridge (1) along this quad's v? depends on corner order */
    p[1] += lift * Math.pow(u * 2 - 1, 2) * (1 - v) - sag * Math.sin(Math.PI * v) * 0.4;
    void e;
  };
  /* left slope (x negative) and right slope */
  B.quad(M.shingle,
    F.p(-hx - ohX, z0 - ohZ, yE), F.p(-hx - ohX, z1 + ohZ, yE),
    F.p(0, z1 + ohZ, yR), F.p(0, z0 - ohZ, yR),
    { us: UV.roof.us, vs: UV.roof.vs, col: rcol, wear, warp: warpL, step: 0.9 });
  B.quad(M.shingle,
    F.p(hx + ohX, z1 + ohZ, yE), F.p(hx + ohX, z0 - ohZ, yE),
    F.p(0, z0 - ohZ, yR), F.p(0, z1 + ohZ, yR),
    { us: UV.roof.us, vs: UV.roof.vs, col: rcol, wear, warp: warpL, step: 0.9 });

  /* gable infill — dark wood triangles on both ends */
  B.tri(M.weathered,
    F.p(-hx, z0, yE), F.p(hx, z0, yE), F.p(0, z0, yR),
    { us: UV.wall.us, vs: UV.wall.vs, col: WOOD, wear, uv: [[0, 0], [w, 0], [w * 0.5, yR - yE]] });
  B.tri(M.weathered,
    F.p(hx, z1, yE), F.p(-hx, z1, yE), F.p(0, z1, yR),
    { us: UV.wall.us, vs: UV.wall.vs, col: WOOD, wear, uv: [[0, 0], [w, 0], [w * 0.5, yR - yE]] });

  /* barge boards */
  const barge = { us: 1.2, vs: 0.32, col: WOOD_DK, wear, nv: 1 };
  for (const z of [z0 - ohZ, z1 + ohZ]) {
    const sgn = z < (z0 + z1) * 0.5 ? -1 : 1;
    faceQuad(B, M.weathered,
      F.p(-hx - ohX, z, yE - 0.12), F.p(0, z, yR - 0.04),
      F.p(0, z + sgn * 0.07, yR - 0.04), F.p(-hx - ohX, z + sgn * 0.07, yE - 0.12),
      [0, 0, sgn * (z < 1 ? -1 : 1)], barge);
    faceQuad(B, M.weathered,
      F.p(0, z, yR - 0.04), F.p(hx + ohX, z, yE - 0.12),
      F.p(hx + ohX, z + sgn * 0.07, yE - 0.12), F.p(0, z + sgn * 0.07, yR - 0.04),
      [0, 0, sgn * (z < 1 ? -1 : 1)], barge);
  }

  /* eave fascia along both long sides */
  B.box(M.weathered, F, -hx - ohX - 0.06, -hx - ohX + 0.04, z0 - ohZ, z1 + ohZ, yE - 0.22, yE + 0.02, barge);
  B.box(M.weathered, F, hx + ohX - 0.04, hx + ohX + 0.06, z0 - ohZ, z1 + ohZ, yE - 0.22, yE + 0.02, barge);

  /* ridge beam */
  B.box(M.weathered, F, -0.10, 0.10, z0 - ohZ, z1 + ohZ, yR - 0.04, yR + 0.08,
    { us: 0.6, vs: 0.4, col: WOOD_DK, wear, nv: 1 });

  /* chigi — forked finials at both gable peaks */
  for (const z of [z0 - ohZ - 0.04, z1 + ohZ + 0.04]) {
    for (const sg of [-1, 1]) {
      const a = F.p(sg * 0.04, z, yR - 0.05);
      const b = F.p(sg * 0.42, z, yR + 0.95);
      B.tube(M.weathered, a, b, 0.04, 0.032, 5,
        { us: 0.3, vs: 0.5, col: WOOD_DK, wear, caps: true });
    }
  }

  /* katsuogi — log billets across the ridge */
  const nKat = 6;
  for (let i = 0; i < nKat; i++) {
    const t = (i + 0.5) / nKat;
    const z = (z0 - ohZ * 0.4) + t * (d + ohZ * 0.8);
    B.tube(M.weathered, F.p(-0.38, z, yR + 0.10), F.p(0.38, z, yR + 0.10),
      0.055, 0.055, 6,
      { us: 0.3, vs: 0.4, col: WOOD, wear, caps: true, capCol: [0.55, 0.46, 0.34] });
  }

  /* saisenbako — offering box in front of the doors */
  const BF = F.sub(0, z0 - 0.85, podium);
  B.box(M.weathered, BF, -0.55, 0.55, -0.28, 0.28, 0.0, 0.72,
    { us: 0.7, vs: 0.5, col: WOOD, wear });
  B.box(M.weathered, BF, -0.42, 0.42, -0.06, 0.06, 0.42, 0.58,
    { us: 0.4, vs: 0.3, col: WOOD_DK, wear, nu: 1, nv: 1 });

  /* a pair of hanging lanterns under the front eave */
  for (const x of [-hx * 0.55, hx * 0.55]) {
    const LF = F.sub(x, z0 - 0.35, yE - 0.15);
    const flame = eaveLantern(B, M, LF, wear);
    out.lamps.push({ F: LF, local: { x: 0, y: 0, z: 0 }, p: flame });
    if (out.glow) out.glow.push(flame);
  }

  return { w, d, floor, yR, podium, wallH };
}

function eaveLantern(B, M, F, wear) {
  B.tube(M.weathered, F.p(0, 0, 0), F.p(0, 0, -0.22), 0.016, 0.016, 5,
    { us: 0.2, vs: 0.3, col: WOOD, wear });
  const s = 0.09;
  B.box(M.weathered, F, -s, s, -s, s, -0.48, -0.22,
    { us: 0.3, vs: 0.3, col: WOOD, wear, nu: 1, nv: 1, skip: 't' });
  B.box(M.glassLit, F, -s * 0.78, s * 0.78, -s * 0.78, s * 0.78, -0.44, -0.26,
    { us: 0.2, vs: 0.2, col: [1, 0.7, 0.3], wear, nu: 1, nv: 1, skip: 'tb' });
  return F.p(0, 0, -0.34);
}

/* ----------------------------------------------------------- stone stairs */

export function buildStoneStair(B, M, F, o = {}) {
  const n = o.n || 5;
  const rise = o.rise || 0.16;
  const run = o.run || 0.38;
  const w = o.w || 3.6;
  const wear = o.wear || W(F.oy, F.oy + n * rise + 0.4, 0.9, 0.2);
  for (let i = 0; i < n; i++) {
    const z0 = i * run;
    const y0 = i * rise;
    const k = 0.90 + 0.12 * Math.sin(i * 2.3 + (o.seed || 0));
    B.box(M.stone, F, -w * 0.5, w * 0.5, z0, z0 + run + 0.04, y0 - 0.04, y0 + rise,
      { us: UV.stone.us, vs: UV.stone.vs, col: jitter(STONE, k), wear, skip: 'b' });
  }
  /* low cheek walls */
  const h = n * rise + 0.18;
  for (const x of [-w * 0.5 - 0.16, w * 0.5]) {
    B.box(M.stone, F, x, x + 0.16, -0.05, n * run + 0.08, -0.04, h,
      { us: UV.stone.us, vs: UV.stone.vs, col: jitter(STONE, 0.86), wear, skip: 'b' });
  }
}

/* ------------------------------------------------------- precinct fence */

/**
 * Low plaster wall with dark-wood coping and posts. `ring` is a list of
 * {s, t} in street coords; `open` is a chainage window on the front (min s)
 * left open for the torii.
 */
export function buildPrecinctFence(B, M, street, pad, o = {}) {
  const s0 = o.s0, s1 = o.s1, t0 = o.t0, t1 = o.t1;
  const gateS0 = o.gateS0, gateS1 = o.gateS1;
  const h = o.h || 1.42;
  const wearOf = (y) => W(y, y + h + 0.5, 0.75, 0.45);

  const run = (sa, sb, ta, tb, skipGate) => {
    const len = Math.hypot(sb - sa, tb - ta);
    const n = Math.max(2, Math.round(len / 2.15));
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      const sA = sa + (sb - sa) * u0, tA = ta + (tb - ta) * u0;
      const sB = sa + (sb - sa) * u1, tB = ta + (tb - ta) * u1;
      if (skipGate) {
        const sm = (sA + sB) * 0.5;
        if (sm > gateS0 && sm < gateS1) continue;
      }
      const pA = street.xz(sA, tA), pB = street.xz(sB, tB);
      const yA = pad.height(sA, tA), yB = pad.height(sB, tB);
      const F = new Frame(pA[0], Math.min(yA, yB), pA[1], pB[0] - pA[0], pB[1] - pA[1]);
      const L = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
      const wear = wearOf(F.oy);
      /* plaster body */
      B.box(M.adobe, F, 0, L, -0.11, 0.11, 0.0, h - 0.08,
        { us: UV.adobe.us, vs: UV.adobe.vs, col: jitter(PLASTER, 0.92 + 0.1 * Math.sin(i * 1.7 + sA)), wear, skip: 'b' });
      /* wood coping */
      B.box(M.weathered, F, -0.04, L + 0.04, -0.16, 0.16, h - 0.10, h + 0.04,
        { us: 0.8, vs: 0.3, col: WOOD_DK, wear, nv: 1 });
      /* post at the start of the segment */
      B.box(M.weathered, F, -0.07, 0.07, -0.09, 0.09, 0.0, h + 0.16,
        { us: 0.4, vs: 0.5, col: WOOD, wear, nu: 1, nv: 2 });
    }
  };

  run(s0, s1, t0, t0, true);   // front, gated
  run(s0, s1, t1, t1, false);  // back
  run(s0, s0, t0, t1, false);  // near side
  run(s1, s1, t0, t1, false);  // far side
}

/* ------------------------------------------------------- stone sandō */

export function buildSandou(B, M, street, pad, o = {}) {
  const { s0, s1, half = 1.15, rand } = o;
  const n = Math.max(4, Math.round((s1 - s0) / 0.92));
  for (let i = 0; i < n; i++) {
    const s = s0 + ((s1 - s0) * (i + 0.5)) / n;
    const w = half * 2 * (0.92 + rand() * 0.12);
    const d = 0.78 + rand() * 0.18;
    const tOff = (rand() - 0.5) * 0.10;
    const p = street.xz(s, tOff);
    const y = pad.height(s, tOff);
    const tg = street.tangent(s);
    const F = new Frame(p[0], y, p[1], -tg[1], tg[0]); /* +x across the path */
    const k = 0.88 + rand() * 0.18;
    B.box(M.stone, F, -w * 0.5, w * 0.5, -d * 0.5, d * 0.5, 0.01, 0.055,
      { us: UV.stone.us, vs: UV.stone.vs, col: jitter(STONE, k), wear: W(y, y + 0.6, 0.95, 0.15), skip: 'b', nu: 2, nv: 1 });
  }
}

/* ------------------------------------------------------- storehouse */

/** Small boarded kura off to the side — a second mass so the compound isn't a single hall. */
export function buildKura(B, M, F, o = {}) {
  const w = o.w || 3.4, d = o.d || 2.8, h = o.h || 2.35;
  const wear = o.wear || W(F.oy, F.oy + h + 1.6, 0.8, 0.35);
  B.box(M.weathered, F, -w * 0.5, w * 0.5, 0, d, 0, h,
    { us: UV.wallV.us, vs: UV.wallV.vs, rot: 1, col: WOOD, wear, step: 1.1, skip: 'b' });
  B.box(M.stone, F, -w * 0.5 - 0.08, w * 0.5 + 0.08, -0.08, d + 0.08, -0.05, 0.22,
    { us: UV.stone.us, vs: UV.stone.vs, col: STONE, wear, skip: 'b' });
  const yE = h, yR = h + 0.85;
  const oh = 0.28;
  B.quad(M.shingle,
    F.p(-w * 0.5 - oh, -oh, yE), F.p(w * 0.5 + oh, -oh, yE),
    F.p(w * 0.5 + oh, d * 0.5, yR), F.p(-w * 0.5 - oh, d * 0.5, yR),
    { us: UV.roof.us, vs: UV.roof.vs, col: BARK, wear, step: 0.8 });
  B.quad(M.shingle,
    F.p(w * 0.5 + oh, d + oh, yE), F.p(-w * 0.5 - oh, d + oh, yE),
    F.p(-w * 0.5 - oh, d * 0.5, yR), F.p(w * 0.5 + oh, d * 0.5, yR),
    { us: UV.roof.us, vs: UV.roof.vs, col: BARK, wear, step: 0.8 });
  B.box(M.weathered, F, -w * 0.5 - oh, w * 0.5 + oh, d * 0.5 - 0.05, d * 0.5 + 0.05, yR - 0.03, yR + 0.05,
    { us: 0.6, vs: 0.3, col: WOOD_DK, wear, nv: 1 });
}

/* Kept so older call sites / Props.js UV import never break. */
export function buildBuilding() { return { F: null }; }
export function buildChurch() { return { F: null }; }
export function buildBarn() { return { F: null }; }

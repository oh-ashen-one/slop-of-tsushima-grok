import {
  noise2, fbm, fbm01, ridged, billow, smoothstep, clamp, mix,
  polylineDist, polylineMetrics,
} from './Noise.js';

/**
 * Landform synthesis.
 *
 * The world is deliberately *composed*, not left to noise:
 *
 *      N (-Z)
 *        ┌──────────────────────────────┐
 *        │  timber   ▲▲▲ MASSIF ▲▲▲     │   far blue ranges stay on the
 *        │  foothills   ▲▲▲▲▲▲          │   horizon; the basin is rolling
 *        │      ~~~ river ~~~           │   grassland. A tributary creek
 *   W    │  ROLLING GRASSLAND  ~~~~     │   crosses the play space south
 *        │     ~creek~     gold field   │   of origin and joins the trunk
 *        │  low basin                   │   further west.
 *        └──────────────────────────────┘
 *
 * Region boundaries are domain-warped so nothing reads as an authored blob, and
 * every channel's long profile is derived from the terrain it actually crosses
 * (sampled, then forced monotonically downhill) so the valley always drains.
 */

export const RIVER_PTS = [
  [1980, -2760], [1560, -2150], [1120, -1620], [700, -1130],
  [250, -760], [-260, -470], [-800, -230], [-1420, 60],
  [-2100, 470], [-2900, 1030], [-3800, 1780], [-5200, 2900],
];
const RIVER_M = polylineMetrics(RIVER_PTS);

/*
 * Grassland tributary. Headwaters sit in the east rolling field (not the NE
 * massif), the channel crosses typical spawn/play space ~200 m SSE of origin,
 * then drains WSW into the trunk at [-2900, 1030]. Every vertex steps west
 * and south so the regional tilt (H += x*0.0032 - z*0.0026) is monotone.
 */
export const STREAM_PTS = [
  [1520, -580], [1180, -340], [900, -160], [680, -20],
  [480, 80], [280, 140], [80, 200], [-140, 250],
  [-400, 330], [-700, 440], [-1040, 580], [-1420, 740],
  [-1860, 900], [-2360, 1000], [-2900, 1030],
];
const STREAM_M = polylineMetrics(STREAM_PTS);

/** Ford on the tributary: ~11 m water, gentle banks, near origin/town. */
export const STREAM_CROSSING = [80, 200];

/* ------------------------------------------------------------------ regions */

function ellipse(x, z, cx, cz, rx, rz, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const dx = x - cx, dz = z - cz;
  const u = (dx * c + dz * s) / rx;
  const v = (-dx * s + dz * c) / rz;
  return Math.sqrt(u * u + v * v);
}

/**
 * Continuous region weights at a world position.
 * @returns {{mount:number, foot:number, bad:number, plain:number, sand:number,
 *            far:number, valley:number, core:number, stream:number,
 *            streamCore:number, arid:number, valleyD:number, valleyT:number,
 *            streamD:number, streamT:number}}
 */
export function regionAt(x, z) {
  const wx = x + fbm(x * 0.00019 + 11.3, z * 0.00019 - 4.7, 3, 1) * 820;
  const wz = z + fbm(x * 0.00019 - 6.1, z * 0.00019 + 9.9, 3, 1) * 820;

  /* --- the massif: three overlapping uplifts in the north-east */
  const eA = ellipse(wx, wz, 2150, -2800, 2050, 1500, -0.50);
  const eB = ellipse(wx, wz, 3450, -1550, 1350, 1050, 0.28);
  const eC = ellipse(wx, wz, 250, -3350, 1550, 1000, 0.22);
  const uplift = Math.min(eA, Math.min(eB, eC));
  let mount = smoothstep(1.08, 0.40, uplift);
  let foot = smoothstep(1.82, 1.02, uplift) * (1 - mount);

  /* --- far-east arid hills only. The outlying butte field (eG/eH) that sat
         in the basin as midground chimney stacks is gone; remaining `bad` is
         faded to zero across the playable ~2.4 km so regionAt() cannot feed
         vegetation/scatter a badlands vote next to spawn. */
  const eD = ellipse(wx, wz, 3900, 2200, 1200, 1000, 0.20);
  const eE = ellipse(wx, wz, 4200, 3400, 1100, 900, -0.35);
  const badRaw = Math.min(eD, eE);
  let bad = smoothstep(1.18, 0.50, badRaw) * (1 - mount) * (1 - foot * 0.7);
  bad *= smoothstep(2400, 4200, Math.hypot(wx - 400, wz - 200));

  /* --- dry flats: only the far southern pan, not a wash through the field */
  let sand = smoothstep(2400, 3600, wz) * (1 - mount) * (1 - bad * 0.5);
  sand *= (1 - mount) * (1 - foot) * smoothstep(2000, 3400, Math.hypot(wx, wz));

  /* --- distant ranges beyond the play area, so the horizon is never empty */
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const far = smoothstep(3900, 7600, edge);

  let plain = clamp(1 - mount - foot - bad - sand, 0, 1);
  const sum = mount + foot + bad + sand + plain || 1;
  mount /= sum; foot /= sum; bad /= sum; sand /= sum; plain /= sum;

  const rv = polylineDist(x, z, RIVER_PTS, RIVER_M.cum, RIVER_M.total);
  const vW = mix(150, 420, Math.pow(rv.t, 0.6));
  const valley = smoothstep(vW * 1.9, vW * 0.50, rv.d);
  const core = smoothstep(vW * 1.00, vW * 0.26, rv.d);

  const sv = polylineDist(x, z, STREAM_PTS, STREAM_M.cum, STREAM_M.total);
  const sW = mix(16, 38, Math.pow(sv.t, 0.5));
  const stream = smoothstep(sW * 2.6, sW * 0.40, sv.d);
  const streamCore = smoothstep(sW * 0.90, sW * 0.16, sv.d);

  const aridN = fbm01(x * 0.00032 + 71.2, z * 0.00032 - 33.8, 3, 1);
  const arid = clamp(
    bad * 0.90 + sand * 0.95 + plain * 0.06 + foot * 0.05 + mount * 0.22
    + (aridN - 0.5) * 0.22 - valley * 0.34 - stream * 0.40,
    0, 1);

  return {
    mount, foot, bad, plain, sand, far, valley, core, stream, streamCore, arid,
    valleyD: rv.d, valleyT: rv.t, streamD: sv.d, streamT: sv.t,
  };
}

/* ------------------------------------------------------------------- heights */

function landformAt(x, z, R) {
  /* second, independent warp for the landform itself */
  const wax = x + fbm(x * 0.00040 + 3.1, z * 0.00040 + 8.4, 4, 1) * 620;
  const waz = z + fbm(x * 0.00040 - 5.6, z * 0.00040 - 2.2, 4, 1) * 620;

  let H = 0;

  if (R.mount > 0.003) {
    const r1 = ridged(wax, waz, 6, 1 / 4100, 0.5, 2.11, 0.95);
    const r2 = ridged(wax * 1.9 + 1200, waz * 1.9 - 800, 4, 1 / 4100);
    const m = Math.pow(clamp(r1 * 0.79 + r2 * 0.21, 0, 1), 1.30);
    H += R.mount * (55 + m * 660);
  }
  if (R.foot > 0.003) {
    const b = billow(wax, waz, 5, 1 / 2400);
    const r = ridged(wax, waz, 4, 1 / 2900);
    H += R.foot * (34 + b * 128 + r * 92);
  }
  if (R.plain > 0.003) {
    const b = billow(wax * 0.85, waz * 0.85, 4, 1 / 3100);
    const s = fbm(x, z, 3, 1 / 4800);
    const lr = ridged(wax * 1.4 - 900, waz * 1.4 + 400, 4, 1 / 1900, 0.5, 2.05);
    H += R.plain * (42 + b * 58 + s * 28 + lr * 18);
  }
  if (R.bad > 0.003) {
    /* Rolling hills, not plateau stacks. Mesa terracing used to live here
       (and in refineCore); that is what put chimney buttes in the basin. */
    const b = billow(wax * 0.9, waz * 0.9, 4, 1 / 2600);
    const s = fbm(wax, waz, 3, 1 / 1800);
    H += R.bad * (40 + b * 72 + s * 28);
  }
  if (R.sand > 0.003) {
    H += R.sand * (20 + billow(wax * 0.85, waz * 1.45, 3, 1 / 2000) * 22);
  }
  if (R.far > 0.002) {
    /* big soft ranges ringing the world — pure silhouette material */
    const f = ridged(wax * 0.62 - 4000, waz * 0.62 + 2500, 5, 1 / 5200, 0.52, 2.05);
    H = mix(H, 30 + Math.pow(f, 1.25) * 520, R.far * 0.92);
  }

  /* Broad structural basin around the drainage axis. Only ~0.5% cross-slope,
     invisible to the eye, but it is what makes the whole region drain into one
     trunk river instead of a hundred disconnected pans. */
  H -= smoothstep(3400, 260, R.valleyD) * 16;

  /* regional tilt: the whole basin drains west-south-west */
  H += x * 0.0032 - z * 0.0026;
  return H;
}

/* ---------------------------------------------------------------- pass one */

/**
 * Coarse landform over `ext` metres at `res`, in two sweeps: the land first,
 * then the river valley cut into it along a profile derived from that land.
 */
export function generateCoarse(res, ext) {
  const N = res * res;
  const h = new Float32Array(N);
  const wMount = new Float32Array(N);
  const wFoot = new Float32Array(N);
  const wBad = new Float32Array(N);
  const wPlain = new Float32Array(N);
  const wSand = new Float32Array(N);
  const wValley = new Float32Array(N);
  const arid = new Float32Array(N);
  const vT = new Float32Array(N);
  const vCore = new Float32Array(N);

  const step = ext / res;
  const half = ext * 0.5;

  for (let j = 0; j < res; j++) {
    const z = -half + (j + 0.5) * step;
    for (let i = 0; i < res; i++) {
      const x = -half + (i + 0.5) * step;
      const k = j * res + i;
      const R = regionAt(x, z);
      h[k] = landformAt(x, z, R);
      wMount[k] = R.mount; wFoot[k] = R.foot; wBad[k] = R.bad;
      wPlain[k] = R.plain; wSand[k] = R.sand;
      wValley[k] = R.valley; vCore[k] = R.core;
      vT[k] = R.valleyT;
      arid[k] = R.arid;
    }
  }

  /* --- long profiles: sample the land, then force each channel downhill */
  const sampleH = (x, z) => {
    let fx = clamp((x + half) / ext * res - 0.5, 0, res - 1.001);
    let fz = clamp((z + half) / ext * res - 0.5, 0, res - 1.001);
    const x0 = fx | 0, z0 = fz | 0, tx = fx - x0, tz = fz - z0;
    const a = h[z0 * res + x0], b = h[z0 * res + x0 + 1];
    const c = h[(z0 + 1) * res + x0], d = h[(z0 + 1) * res + x0 + 1];
    const t0 = a + (b - a) * tx;
    return t0 + ((c + (d - c) * tx) - t0) * tz;
  };
  const pointAt = (pts, metrics, t) => {
    const target = t * metrics.total;
    for (let s = 0; s < pts.length - 1; s++) {
      const c0 = metrics.cum[s], c1 = metrics.cum[s + 1];
      if (target <= c1 || s === pts.length - 2) {
        const u = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
        return [
          pts[s][0] + (pts[s + 1][0] - pts[s][0]) * u,
          pts[s][1] + (pts[s + 1][1] - pts[s][1]) * u,
        ];
      }
    }
    return pts[0];
  };
  const buildProfile = (pts, metrics, cut, maxGouge, drop) => {
    const SAMPLES = 300;
    const prof = new Float32Array(SAMPLES);
    const segLen = metrics.total / (SAMPLES - 1);
    for (let s = 0; s < SAMPLES; s++) {
      const [px, pz] = pointAt(pts, metrics, s / (SAMPLES - 1));
      const land = sampleH(px, pz);
      const wantDrop = segLen * drop;
      prof[s] = s === 0 ? land - cut
        : Math.min(land - cut, prof[s - 1] - wantDrop);
      prof[s] = Math.max(prof[s], land - maxGouge);
    }
    for (let s = 1; s < SAMPLES; s++) {
      if (prof[s] > prof[s - 1] - segLen * 0.0012) {
        prof[s] = prof[s - 1] - segLen * 0.0012;
      }
    }
    return (t) => {
      const f = clamp(t, 0, 1) * (SAMPLES - 1);
      const i0 = f | 0, i1 = Math.min(SAMPLES - 1, i0 + 1);
      return prof[i0] + (prof[i1] - prof[i0]) * (f - i0);
    };
  };

  const profAt = buildProfile(RIVER_PTS, RIVER_M, 11, 40, 0.004);

  /* --- pass two: cut the trunk valley */
  for (let j = 0; j < res; j++) {
    const z = -half + (j + 0.5) * step;
    for (let i = 0; i < res; i++) {
      const k = j * res + i;
      const v = wValley[k];
      if (v < 0.002) continue;
      const x = -half + (i + 0.5) * step;
      const floor = profAt(vT[k]);
      /* flanks: only ever cut down toward the floor */
      const flank = floor + Math.pow(1 - v, 1.35) * 330;
      let H = mix(h[k], Math.min(h[k], flank), v);
      /* axis: force the bed, with a little meander noise */
      const core = vCore[k];
      if (core > 0.002) {
        H = mix(H, floor + fbm(x, z, 2, 1 / 420) * 3.5, core * 0.94);
      }
      h[k] = H;
    }
  }

  /* --- pass three: grassland tributary. Sampled AFTER the trunk cut so the
         confluence meets the river floor instead of hanging above it. */
  const streamAt = buildProfile(STREAM_PTS, STREAM_M, 3.4, 11, 0.0035);
  for (let j = 0; j < res; j++) {
    const z = -half + (j + 0.5) * step;
    for (let i = 0; i < res; i++) {
      const k = j * res + i;
      const x = -half + (i + 0.5) * step;
      const sv = polylineDist(x, z, STREAM_PTS, STREAM_M.cum, STREAM_M.total);
      const sW = mix(16, 38, Math.pow(sv.t, 0.5));
      const v = smoothstep(sW * 2.6, sW * 0.40, sv.d);
      if (v < 0.002) continue;
      const floor = streamAt(sv.t);
      const flank = floor + Math.pow(1 - v, 1.45) * 55;
      let H = mix(h[k], Math.min(h[k], flank), v);
      const core = smoothstep(sW * 0.90, sW * 0.16, sv.d);
      if (core > 0.002) {
        H = mix(H, floor + fbm(x, z, 2, 1 / 280) * 1.15, core * 0.92);
      }
      h[k] = H;
      if (v > wValley[k]) wValley[k] = v;
      if (core > vCore[k]) vCore[k] = core;
      arid[k] = clamp(arid[k] - v * 0.28, 0, 1);
    }
  }

  return { h, wMount, wFoot, wBad, wPlain, wSand, wValley, arid, res, ext, prof: null };
}

/* ---------------------------------------------------------------- pass two */

function bilerpGrid(src, res, u, v) {
  const fx = clamp(u * res - 0.5, 0, res - 1.001);
  const fy = clamp(v * res - 0.5, 0, res - 1.001);
  const x0 = fx | 0, y0 = fy | 0;
  const tx = fx - x0, ty = fy - y0;
  const x1 = x0 + 1 < res ? x0 + 1 : x0;
  const y1 = y0 + 1 < res ? y0 + 1 : y0;
  const a = src[y0 * res + x0], b = src[y0 * res + x1];
  const c = src[y1 * res + x0], d = src[y1 * res + x1];
  return mix(mix(a, b, tx), mix(c, d, tx), ty);
}

/**
 * Refine the core up to `res`, adding the mid and high frequency character each
 * region deserves plus the erosion hardness field (strata + mesa caprock) that
 * the droplet pass honours.
 */
export function refineCore(coarse, res, core) {
  const N = res * res;
  const h = new Float32Array(N);
  const hard = new Float32Array(N);
  const arid = new Float32Array(N);
  const rMount = new Float32Array(N);
  const rBad = new Float32Array(N);
  const rValley = new Float32Array(N);
  const rPlain = new Float32Array(N);
  const rFoot = new Float32Array(N);
  const rSand = new Float32Array(N);

  const step = core / res;
  const half = core * 0.5;
  const u0 = 0.5 - (core * 0.5) / coarse.ext;
  const uspan = core / coarse.ext;

  for (let j = 0; j < res; j++) {
    const z = -half + (j + 0.5) * step;
    const v = u0 + ((j + 0.5) / res) * uspan;
    for (let i = 0; i < res; i++) {
      const x = -half + (i + 0.5) * step;
      const u = u0 + ((i + 0.5) / res) * uspan;
      const k = j * res + i;

      const wm = bilerpGrid(coarse.wMount, coarse.res, u, v);
      const wf = bilerpGrid(coarse.wFoot, coarse.res, u, v);
      const wb = bilerpGrid(coarse.wBad, coarse.res, u, v);
      const wp = bilerpGrid(coarse.wPlain, coarse.res, u, v);
      const ws = bilerpGrid(coarse.wSand, coarse.res, u, v);
      const wv = bilerpGrid(coarse.wValley, coarse.res, u, v);
      let H = bilerpGrid(coarse.h, coarse.res, u, v);

      const wax = x + noise2(x * 0.00090 + 17.7, z * 0.00090 - 3.3) * 200;
      const waz = z + noise2(x * 0.00090 - 8.2, z * 0.00090 + 6.5) * 200;

      let hardness = 0.40;
      const flank = 1 - wv;

      if (wm > 0.006) {
        const r = ridged(wax, waz, 5, 1 / 620, 0.52, 2.09);
        const spur = ridged(wax * 2.3, waz * 2.3, 3, 1 / 620);
        H += wm * flank * ((r - 0.42) * 190 + (spur - 0.45) * 58);
        hardness = mix(hardness, 0.34 + 0.46 * (0.5 + 0.5
          * Math.sin(H * 0.052 + fbm(x, z, 2, 1 / 700) * 3.0)), wm);
      }
      if (wf > 0.006) {
        const b = billow(wax, waz, 4, 1 / 470);
        H += wf * flank * (b - 0.46) * 82;
        hardness = mix(hardness, 0.35, wf);
      }
      if (wp > 0.006) {
        /* Three scales of swell. Without the 130 m band the grassland reads as
           a billiard table from a mile away — there is nothing for the light to
           catch once the texture detail has mipped away. */
        const b = billow(wax * 0.9, waz * 0.9, 4, 1 / 730);
        const g = fbm(x, z, 3, 1 / 230);
        const f = fbm(x + 813, z - 271, 3, 1 / 128);
        const d = fbm(x - 2011, z + 655, 3, 1 / 320);
        H += wp * flank * ((b - 0.47) * 54 + g * 15.0 + d * 11.0 + f * 7.0);
        hardness = mix(hardness, 0.22, wp);
      }
      if (ws > 0.006) {
        H += ws * flank * (fbm(x * 0.55, z * 1.5, 3, 1 / 250) * 7
          + fbm(x - 411, z + 122, 3, 1 / 115) * 3.2);
        hardness = mix(hardness, 0.20, ws);
      }
      if (wb > 0.006) {
        /* Far-east arid hills only — same family as the grassland swell, not
           caprock terraces. Mesa stacks in the basin came from this block. */
        const b = billow(wax * 1.05, waz * 1.05, 4, 1 / 680);
        H += wb * flank * ((b - 0.46) * 38
          + fbm(wax * 1.2 + 400, waz * 1.2 - 250, 3, 1 / 620) * 14);
        hardness = mix(hardness, 0.28, wb);
      }
      if (wv > 0.002) {
        H -= wv * fbm(x, z, 2, 1 / 360) * 4;
        hardness = mix(hardness, 0.18, wv * 0.85);
      }

      h[k] = H;
      hard[k] = clamp(hardness, 0.05, 1);
      arid[k] = bilerpGrid(coarse.arid, coarse.res, u, v);
      rMount[k] = wm; rBad[k] = wb; rValley[k] = wv;
      rPlain[k] = wp; rFoot[k] = wf; rSand[k] = ws;
    }
  }

  return { h, hard, arid, rMount, rBad, rValley, rPlain, rFoot, rSand, res, size: core };
}

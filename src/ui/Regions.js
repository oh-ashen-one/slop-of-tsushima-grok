import { rng } from '../core/Context.js';

/**
 * Named places.
 *
 * The world is procedural, so the names have to be too: a deterministic set of
 * anchors is scattered over the map and each is given a grassland name from a
 * small Japanese vocabulary. POI-derived anchors (the shrine village, the
 * creek, the pine stand) take precedence so the shot names and the title
 * cards agree.
 *
 * Lookup is nearest-anchor with hysteresis, which stops the title card
 * flickering when you ride along a boundary.
 */

const HEAD = [
  '黄金', '薄', '芒', '霧', '暁', '鶴', '楓', '松', '杉', '苔',
  '白', '風', '石', '雲', '稲', '蓮', '竹', '花', '露', '凪',
];
const TAIL = [
  'の野', 'の丘', 'の尾根', 'の里', 'の森', 'の川', 'の峠', 'の沢',
  'の原', 'の浜', 'の岸', 'の畑', 'の道', 'の谷', 'の池', 'の坂',
];
const SHRINES = [
  '稲荷社', '若宮', '石の祠', '杉の社', '霧の宮', '鳥居の里', '山王社',
];
const CREEKS = [
  '小川', '清流', '谷川', '霧の沢', '白川', '芹川',
];
const PINES = [
  '松の尾根', '杉の森', '檜の丘', '松風', '黒松',
];

function pick(arr, r) { return arr[(r() * arr.length) | 0]; }

export class Regions {
  constructor(ctx) {
    this.ctx = ctx;
    this.anchors = [];
    this.current = null;
    this._dist = 1e9;
  }

  build() {
    const ctx = this.ctx;
    const r = rng((ctx.seed ^ 0x9e3779b9) >>> 0);
    const used = new Set();
    const name = () => {
      for (let i = 0; i < 24; i++) {
        const n = `${pick(HEAD, r)}${pick(TAIL, r)}`;
        if (!used.has(n)) { used.add(n); return n; }
      }
      return `${pick(HEAD, r)}${pick(TAIL, r)}`;
    };

    const add = (x, z, label, kind, radius) => {
      this.anchors.push({ x, z, label, kind, radius: radius || 1e9 });
    };

    // --- named POIs first --------------------------------------------------
    const town = ctx.poi.get('town');
    const townEnd = ctx.poi.get('town_end');
    if (town) {
      const a = town.pos || town;
      const b = townEnd ? (townEnd.pos || townEnd) : a;
      add((a.x + b.x) * 0.5, (a.z + b.z) * 0.5, pick(SHRINES, r), 'town', 260);
    }
    const river = ctx.poi.get('river');
    if (river) {
      const p = river.pos || river;
      add(p.x, p.z, pick(CREEKS, r), 'river', 300);
    }
    const forest = ctx.poi.get('forest');
    if (forest) {
      const p = forest.pos || forest;
      add(p.x, p.z, pick(PINES, r), 'forest', 420);
    }

    // --- a jittered lattice over the playable square -----------------------
    const half = (ctx.world && ctx.world.size ? ctx.world.size : 8192) * 0.5;
    const step = half * 0.62;
    for (let gz = -2; gz <= 2; gz++) {
      for (let gx = -2; gx <= 2; gx++) {
        const x = gx * step + (r() - 0.5) * step * 0.55;
        const z = gz * step + (r() - 0.5) * step * 0.55;
        let tooClose = false;
        for (const a of this.anchors) {
          if (a.kind !== 'grid' && Math.hypot(a.x - x, a.z - z) < 420) tooClose = true;
        }
        if (tooClose) continue;
        add(x, z, name(), 'grid');
      }
    }
    return this;
  }

  /** @returns {{label:string, kind:string}|null} the region containing (x,z). */
  at(x, z) {
    let best = null, bd = 1e18;
    for (const a of this.anchors) {
      const d = Math.hypot(a.x - x, a.z - z);
      if (d > a.radius) continue;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /**
   * Update the current region with hysteresis.
   * @returns {object|null} the new region if it changed, else null
   */
  update(x, z) {
    const found = this.at(x, z);
    if (!found) return null;
    if (found === this.current) {
      this._dist = Math.hypot(found.x - x, found.z - z);
      return null;
    }
    const d = Math.hypot(found.x - x, found.z - z);
    if (this.current) {
      const cd = Math.hypot(this.current.x - x, this.current.z - z);
      // must be meaningfully closer before we re-title the frame
      if (!(d < cd * 0.86 || d < cd - 60)) return null;
    }
    this.current = found;
    this._dist = d;
    return found;
  }
}

/* ------------------------------------------------------------------- time */

/** Quiet hour for the title card — ink, not a clock face. */
export function timePhrase(h24) {
  const h = ((h24 % 24) + 24) % 24;
  const hr = Math.floor(h);
  if (hr < 5) return 'before dawn';
  if (hr < 8) return 'at first light';
  if (hr < 11) return 'morning';
  if (hr < 14) return 'midday';
  if (hr < 17) return 'afternoon';
  if (hr < 19) return 'at golden hour';
  if (hr < 21) return 'dusk';
  return 'night';
}

/** Terse clock for the corner readout. */
export function clockString(h24) {
  const h = ((h24 % 24) + 24) % 24;
  let hr = Math.floor(h);
  const m = Math.floor((h % 1) * 60);
  const ap = hr < 12 ? 'AM' : 'PM';
  hr = hr % 12; if (hr === 0) hr = 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ap}`;
}

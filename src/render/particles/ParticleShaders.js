/**
 * Particle shaders.
 *
 *  FIELD_*   stateless GPU-simulated volume fields (rain, snow, motes, petals). Every
 *            particle's position is an analytic function of its seed and the
 *            clock, wrapped into a box that follows the camera, so the CPU
 *            never touches a vertex and the field is instantly "full" the
 *            moment weather changes — no warm-up, which matters because the
 *            capture harness only gives the world 2.5 s to settle.
 *  POOL_*    CPU-simulated pool for events: splashes, embers, smoke, dust
 *            kicked up by hooves, muzzle flashes, fireflies, breath, leaves.
 *  LENS_*    screen-space rain on the lens.
 *
 * Shared traits: soft-particle depth fade against a copy of the scene depth
 * buffer, wrap-diffuse + Henyey-Greenstein forward scatter from ctx.env so
 * everything is genuinely lit by the sun/moon (and goes warm and rim-lit at
 * golden hour), and aerial perspective from Sky.
 */

/* -------------------------------------------------------------- common ---- */

export const PARTICLE_COMMON = /* glsl */`
uniform sampler2D uDepth;
uniform vec4  uDepthParams;   // x = near, y = far, z = 1/width, w = 1/height
uniform float uSoftness;      // metres over which a particle fades into geometry

uniform vec3  uSunDir;
uniform vec3  uSunCol;        // linear HDR radiance
uniform vec3  uSkyCol;
uniform vec3  uGroundCol;

float rsLinearDepth(float d) {
  float n = uDepthParams.x, f = uDepthParams.y;
  float z = d * 2.0 - 1.0;
  return (2.0 * n * f) / (f + n - z * (f - n));
}

/** 0 where the particle is buried in geometry, 1 where it is in free air. */
float rsSoftFade(vec2 screenUv, float viewZ) {
  float d = texture2D(uDepth, screenUv).x;
  if (d >= 0.999999) return 1.0;
  float scene = rsLinearDepth(d);
  return clamp((scene - viewZ) / max(uSoftness, 0.01), 0.0, 1.0);
}

float rsHG(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5);
}

/**
 * Light a particle. n is a fake spherical normal from the billboard uv, so
 * a puff shades like a little ball; cosT is view-vs-sun for the forward
 * scattering lobe that makes dust and mist glow when you look into the light.
 */
uniform float uPhaseGain;

vec3 rsLightParticle(vec3 n, float cosT, float thickness, vec3 albedo) {
  float wrap = dot(n, uSunDir) * 0.5 + 0.5;
  // thick puffs shadow themselves: the lit rim survives, the core goes ambient
  float through = exp(-thickness * 1.6);
  float phase = mix(1.0, min(rsHG(cosT, 0.55), 3.0), 0.55 * uPhaseGain);
  vec3 direct = uSunCol * (0.18 + 0.82 * wrap) * phase * (0.35 + 0.65 * through);
  vec3 ambient = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5);
  return albedo * (direct + ambient);
}
`;

/* ---------------------------------------------------------------- fields -- */

export const FIELD_VERT = /* glsl */`
precision highp float;

attribute vec4 aSeed;         // 4 uncorrelated randoms in 0..1

uniform vec3  uBox;           // half extents of the wrapping volume
uniform float uTime;
uniform vec3  uWind;
uniform float uDensity;       // 0..1 fraction of the pool that is alive
uniform float uSize;
uniform float uFall;
uniform float uStretch;
uniform float uYOffset;
uniform float uAspect;        // width/length of a streak

varying vec2  vUv;
varying float vAlpha;
varying vec3  vWorld;
varying vec3  vNormal;
varying float vSeed;

void main() {
  vUv = uv;
  vSeed = aSeed.w;

  if (aSeed.w > uDensity) {
    // parked off-screen; the rasteriser throws it away for free
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    vWorld = vec3(0.0);
    vNormal = vec3(0.0, 0.0, 1.0);
    return;
  }

  vec3 box2 = uBox * 2.0;
  vec3 p0 = aSeed.xyz * box2;

  vec3 vel;
#ifdef MODE_RAIN
  vel = vec3(uWind.x, -uFall, uWind.z);
  vec3 p = p0 + vel * uTime;
#endif
#ifdef MODE_SNOW
  // tumbling: a flake does not fall, it wanders down
  float t = uTime * (0.6 + aSeed.w * 0.8);
  vel = vec3(uWind.x * 0.9, -uFall, uWind.z * 0.9);
  vec3 p = p0 + vel * uTime;
  p.x += sin(t * 1.7 + aSeed.x * 31.0) * 0.55;
  p.z += cos(t * 1.35 + aSeed.z * 27.0) * 0.55;
  p.y += sin(t * 2.6 + aSeed.y * 19.0) * 0.10;
#endif
#ifdef MODE_MOTE
  // ambient motes: near-neutral buoyancy, pushed about by the same wind
  float t = uTime * (0.25 + aSeed.w * 0.5);
  vel = vec3(uWind.x * 0.30, -uFall, uWind.z * 0.30);
  vec3 p = p0 + vel * uTime;
  p.x += sin(t * 0.9 + aSeed.x * 41.0) * 1.6;
  p.y += sin(t * 0.7 + aSeed.y * 23.0) * 0.9;
  p.z += cos(t * 1.1 + aSeed.z * 37.0) * 1.6;
#endif
#ifdef MODE_PETAL
  // Tsushima drift: slow fall, wind-advected, flutter + long helix. Analytic
  // so the wrapping box is full the instant weather says "petals".
  float t = uTime * (0.20 + aSeed.w * 0.26);
  vel = vec3(uWind.x * 1.12, -uFall, uWind.z * 1.12);
  vec3 p = p0 + vel * uTime;
  float fl = 0.75 + aSeed.y * 1.25;
  p.x += sin(t * 1.38 + aSeed.x * 31.0) * fl;
  p.z += cos(t * 1.14 + aSeed.z * 27.0) * fl;
  p.y += sin(t * 2.08 + aSeed.y * 19.0) * 0.22;
  p.x += sin(t * 0.41 + aSeed.z * 9.1) * 1.25;
  p.z += cos(t * 0.37 + aSeed.x * 11.3) * 1.25;
#endif

  vec3 centre = cameraPosition + vec3(0.0, uYOffset, 0.0);
  p = mod(p - centre + uBox, box2) + centre - uBox;

  vec3 toCam = cameraPosition - p;
  float dist = length(toCam);
  vec3 vdir = toCam / max(dist, 1e-3);

  float sz = uSize * (0.65 + aSeed.x * 0.75);

#ifdef MODE_RAIN
  // velocity-stretched streak, aligned with the drop's actual motion
  vec3 dirV = normalize(vel);
  vec3 side = normalize(cross(dirV, vdir));
  float len = sz * uStretch;
  vec3 world = p + side * (position.x * sz * uAspect) + dirV * (position.y * len);
  vNormal = vdir;
#elif defined(MODE_PETAL)
  // tumbling disc, not a camera-facing puff: spin + precess so a petal
  // catches the sun face-on then goes thin edge-on. A little billboard
  // mix keeps the silhouette from vanishing at grazing angles.
  float kind = fract(aSeed.x * 17.13 + aSeed.z * 9.27);
  vSeed = kind;
  float maple = step(0.85, kind);
  float pw = sz * (1.05 + aSeed.y * 0.50) * (1.0 + maple * 0.38);
  float ph = sz * (0.70 + aSeed.x * 0.28) * uAspect * (1.0 + maple * 0.22);
  float a1 = uTime * (0.58 + aSeed.z * 1.70) + aSeed.y * 6.2831853;
  float a2 = uTime * (0.31 + aSeed.x * 0.72) + aSeed.z * 4.1887902;
  float c1 = cos(a1), s1 = sin(a1);
  float c2 = cos(a2), s2 = sin(a2);
  vec3 ax = normalize(vec3(c1, s1 * 0.38, -s1));
  vec3 ay = normalize(vec3(s2 * 0.48, c2, c1 * 0.28));
  ay = normalize(ay - ax * dot(ay, ax));
  vec3 right = cross(vec3(0.0, 1.0, 0.0), vdir);
  float rlen = length(right);
  right = rlen > 1e-4 ? right / rlen : vec3(1.0, 0.0, 0.0);
  vec3 upb = cross(vdir, right);
  ax = normalize(mix(ax, right, 0.15));
  ay = normalize(mix(ay, upb, 0.15));
  ay = normalize(ay - ax * dot(ay, ax));
  vec3 world = p + ax * (position.x * pw) + ay * (position.y * ph);
  vNormal = cross(ax, ay);
#else
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), vdir));
  vec3 up = cross(vdir, right);
  #ifdef MODE_SNOW
    float rot = uTime * (0.8 + aSeed.z * 2.4) + aSeed.y * 6.28;
    float cr = cos(rot), sr = sin(rot);
    vec2 q = vec2(position.x * cr - position.y * sr, position.x * sr + position.y * cr);
  #else
    vec2 q = position.xy;
  #endif
  vec3 world = p + right * (q.x * sz) + up * (q.y * sz);
  // fake spherical normal so a mote/flake shades like a ball
  vNormal = normalize(vdir + right * (q.x * 1.4) + up * (q.y * 1.4));
#endif

  vWorld = world;

  float a = 1.0;
#ifdef MODE_PETAL
  // readable at 2–20 m; dissolve before they fill the lens or pop at range
  a *= smoothstep(1.35, 2.55, dist);
  a *= 1.0 - smoothstep(16.0, 22.0, dist);
#else
  // never let a particle balloon across the lens
  a *= smoothstep(0.20, 1.10, dist);
#endif
  // dissolve at the edge of the wrapping volume instead of popping
  vec3 rel = abs(world - centre) / uBox;
  a *= 1.0 - smoothstep(0.70, 1.0, max(rel.x, max(rel.y * 0.85, rel.z)));
  vAlpha = a;

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const FIELD_FRAG = /* glsl */`
${PARTICLE_COMMON}

uniform sampler2D uAtlas;
uniform vec4  uTile;          // xy = scale, zw = offset into the atlas
uniform vec3  uTint;
uniform float uOpacity;
uniform float uEmissive;

varying vec2  vUv;
varying float vAlpha;
varying vec3  vWorld;
varying vec3  vNormal;
varying float vSeed;

#ifdef MODE_PETAL
/** One sakura petal (cleft teardrop) or a 5-lobe maple, picked by kind. */
float rsPetalMask(vec2 uv, float kind) {
  vec2 q = uv * 2.0 - 1.0;
  float mask;
  if (kind > 0.85) {
    float ang = atan(q.x, q.y);
    float r = length(q);
    float lobes = 0.40 + 0.30 * pow(abs(cos(ang * 2.5)), 1.32);
    lobes += 0.035 * sin(ang * 5.0 + kind * 9.0);
    mask = 1.0 - smoothstep(lobes * 0.80, lobes * 1.06, r);
    mask *= 1.0 - smoothstep(0.14, 0.0, length(q - vec2(0.0, -0.74))) * 0.65;
  } else {
    q.y += 0.05;
    q.x *= 1.10;
    float d = pow(abs(q.x), 2.12) + pow(abs(q.y * 1.14), 2.32);
    mask = 1.0 - smoothstep(0.50, 0.92, d);
    float cleft = length(q - vec2(0.0, 0.64));
    mask *= 1.0 - (1.0 - smoothstep(0.17, 0.02, cleft)) * 0.90;
    mask *= smoothstep(-0.98, -0.52, q.y);
  }
  return clamp(mask, 0.0, 1.0);
}
#endif

void main() {
  if (vAlpha <= 0.001) discard;

#ifdef MODE_PETAL
  float kind = vSeed;
  float a = rsPetalMask(vUv, kind) * vAlpha * uOpacity;
  if (a < 0.002) discard;

  vec4 vp = viewMatrix * vec4(vWorld, 1.0);
  float viewZ = -vp.z;
  vec2 suv = gl_FragCoord.xy * uDepthParams.zw;
  a *= rsSoftFade(suv, viewZ);
  if (a < 0.002) discard;

  vec3 cream = uTint;
  vec3 blush = mix(uTint, vec3(0.99, 0.84, 0.86), 0.62);
  vec3 mapleA = vec3(0.77, 0.34, 0.14);
  vec3 mapleB = vec3(0.52, 0.50, 0.18);
  vec3 albedo = kind > 0.85
    ? mix(mapleA, mapleB, fract(kind * 11.3))
    : mix(cream, blush, smoothstep(0.16, 0.62, kind));

  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float cosT = dot(-V, uSunDir);
  vec3 col = rsLightParticle(N, cosT, 0.16, albedo);
  // thin sheet: looking into the sun, the petal rims and transmits
  float facing = abs(dot(N, uSunDir));
  float trans = pow(max(cosT, 0.0), 4.0) * (1.0 - facing * 0.45);
  col += uSunCol * albedo * (0.10 + trans * 0.90);
  col += albedo * uEmissive;
#else
  vec4 tex = texture2D(uAtlas, vUv * uTile.xy + uTile.zw);
  float a = tex.a * vAlpha * uOpacity;
  if (a < 0.002) discard;

  vec4 vp = viewMatrix * vec4(vWorld, 1.0);
  float viewZ = -vp.z;
  vec2 suv = gl_FragCoord.xy * uDepthParams.zw;
  a *= rsSoftFade(suv, viewZ);
  if (a < 0.002) discard;

  vec3 V = normalize(cameraPosition - vWorld);
  float cosT = dot(-V, uSunDir);
  vec3 col = rsLightParticle(vNormal, cosT, 0.35, uTint);
  col += uTint * uEmissive;
#endif

#ifdef RS_HAS_AERIAL
  col = rsApplyAerialPerspective(col, vWorld);
#endif

  gl_FragColor = vec4(col * a, a);
}
`;

/* ----------------------------------------------------------------- pool --- */

export const POOL_VERT = /* glsl */`
precision highp float;

attribute vec3 aPos;
attribute vec4 aParams;   // x = size, y = rotation, z = alpha, w = tile index
attribute vec4 aColor;    // rgb = tint, a = emissive

uniform float uStretchY;  // <1 squashes the billboard: flat sheets for mist

varying vec2  vUv;
varying float vAlpha;
varying vec3  vWorld;
varying vec3  vNormal;
varying vec4  vColor;
varying float vTile;

void main() {
  vUv = uv;
  vColor = aColor;
  vTile = aParams.w;

  if (aParams.z <= 0.001 || aParams.x <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0; vWorld = vec3(0.0); vNormal = vec3(0.0, 0.0, 1.0);
    return;
  }

  vec3 toCam = cameraPosition - aPos;
  float dist = length(toCam);
  vec3 vdir = toCam / max(dist, 1e-3);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), vdir));
  vec3 up = cross(vdir, right);

  float cr = cos(aParams.y), sr = sin(aParams.y);
  vec2 q = vec2(position.x * cr - position.y * sr, position.x * sr + position.y * cr);
  vec3 world = aPos + (right * q.x + up * q.y * uStretchY) * aParams.x;

  vWorld = world;
  vNormal = normalize(vdir + right * (q.x * 1.6) + up * (q.y * 1.6));
  vAlpha = aParams.z * smoothstep(0.10, 0.55, dist);

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const POOL_FRAG = /* glsl */`
${PARTICLE_COMMON}

uniform sampler2D uAtlas;
uniform float uOpacity;

varying vec2  vUv;
varying float vAlpha;
varying vec3  vWorld;
varying vec3  vNormal;
varying vec4  vColor;
varying float vTile;

void main() {
  if (vAlpha <= 0.001) discard;
  // 2x2 atlas
  float ti = floor(vTile + 0.5);
  vec2 off = vec2(mod(ti, 2.0), floor(ti * 0.5)) * 0.5;
  vec4 tex = texture2D(uAtlas, vUv * 0.5 + off);
  float a = tex.a * vAlpha * uOpacity;
  if (a < 0.002) discard;

  vec4 vp = viewMatrix * vec4(vWorld, 1.0);
  float viewZ = -vp.z;
  vec2 suv = gl_FragCoord.xy * uDepthParams.zw;
  a *= rsSoftFade(suv, viewZ);
  if (a < 0.002) discard;

  vec3 V = normalize(cameraPosition - vWorld);
  float cosT = dot(-V, uSunDir);
  vec3 col = rsLightParticle(vNormal, cosT, 0.9, vColor.rgb);
  col += vColor.rgb * vColor.a;

#ifdef RS_HAS_AERIAL
  col = rsApplyAerialPerspective(col, vWorld);
#endif

  gl_FragColor = vec4(col * a, a);
}
`;

/* ------------------------------------------------------- rain on the lens - */

export const LENS_VERT = /* glsl */`
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const LENS_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform float uAmount;      // 0..1 how wet the lens is
uniform vec2  uAspect;
uniform vec3  uSkyCol;
uniform vec3  uSunCol;
uniform float uDrift;       // sideways smear from camera motion / wind

float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

/**
 * One layer of droplets on a jittered lattice. Kept DELIBERATELY small: a
 * drop on a lens is a couple of millimetres across on a 35 mm frame, which is
 * a handful of pixels — anything bigger reads as a smeared texture overlay
 * rather than water, and is the fastest way to make a frame look like a mod.
 */
vec2 dropLayer(vec2 uv, float cell, float t, float seed) {
  vec2 g = uv * cell;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float best = 0.0;
  float bestR = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 cid = id + o;
      float r = h21(cid + seed);
      if (r < 0.80) continue;                   // most cells stay empty
      float r2 = h21(cid.yx + seed * 3.7);
      // heavy drops slide down and leave a thin trail
      float slide = fract(r2 * 7.13 + t * (0.06 + r * 0.22));
      vec2 c = o + vec2((r - 0.5) * 0.6 + uDrift * 0.25, (r2 - 0.5) * 0.5 - slide + 0.5);
      vec2 d = f - c;
      d.y *= 0.68;
      float rad = 0.06 + r * 0.10;
      float m = smoothstep(rad, rad * 0.25, length(d));
      if (m > best) { best = m; bestR = length(d) / max(rad, 1e-3); }
    }
  }
  return vec2(best, bestR);
}

void main() {
  if (uAmount < 0.004) discard;
  vec2 uv = (vUv - 0.5) * uAspect + 0.5;

  vec2 a = dropLayer(uv, 26.0, uTime, 1.0);
  vec2 b = dropLayer(uv, 44.0, uTime * 1.35, 7.3);

  float m = max(a.x, b.x * 0.8);
  if (m < 0.01) discard;
  float rn = a.x > b.x ? a.y : b.y;

  // a droplet is a tiny lens: it gathers the sky and goes dark at the rim
  float lens = 1.0 - smoothstep(0.45, 1.0, rn);
  vec3 col = uSkyCol * (0.25 + lens * 0.9) + uSunCol * lens * 0.6;
  // wettest at the edges of the frame, where nothing wipes it
  float edge = smoothstep(0.18, 0.95, length((vUv - 0.5) * vec2(1.0, 0.62)) * 2.0);
  float alpha = m * uAmount * (0.035 + edge * 0.17);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

/* ------------------------------------------------------------ depth copy -- */

export const COPY_VERT = /* glsl */`
precision highp float;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const COPY_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth;
uniform vec2 uTexel;
void main() {
  /* Half-res copy of the scene depth for soft particles. We take the FARTHEST
   * of the four source texels: a particle that fades slightly late against a
   * thin silhouette is invisible, one that fades early leaves a halo. */
  float d = texture2D(tDepth, vUv).x;
  d = max(d, texture2D(tDepth, vUv + vec2( uTexel.x, 0.0)).x);
  d = max(d, texture2D(tDepth, vUv + vec2(0.0,  uTexel.y)).x);
  d = max(d, texture2D(tDepth, vUv + uTexel).x);
  gl_FragColor = vec4(d, d, d, 1.0);
}
`;

# EP-02 Integration Notes — "Golden Field" (manager-staged, read first)

## What you have
- This repo: RED SANDS (MIT) — a fully procedural open world: terrain,
  physical sky, volumetric weather, grass, wildlife, a town, and RIDEABLE
  HORSES (src/player/Horse.js). Boot defaults to golden hour (17.8).
- `public/assets/ronin.glb` — the hero: 1.78 m, 24-bone Mixamo-convention
  skeleton (Hips, Spine01/02, LeftUpLeg...), with FOUR animation tracks:
  `idle`, `walk`, `mount`, `ride`. Pakistani skin, light beard, dark
  lamellar armor, topknot, back cape, twin swords.

## The character system you are replacing
- `src/player/rig/HumanRig.js` + `rig/SkinBuilder.js` build the cowboy
  procedurally. Replace the human with ronin.glb (GLTFLoader); drive its
  clips from the existing movement states.
- `src/player/Horse.js` handles the horse + mount logic — hook `mount`
  (one-shot) and `ride` (loop) into those states; `idle`/`walk` on foot.
- Camera: `src/player/CameraRig.js` — retune framing to sit lower and
  wider behind the character (the reference framing).

## The bar (non-negotiable)
Ghost-of-Tsushima Iki-Island golden field: waist-high waving grass
catching rim light, tall thin pines, god rays through haze, falling
petals/leaves, white wildflowers, a stream with a log bridge, warm gold
against cool shadow. The character is a dark silhouette inside that
light. Compare side-by-side blind against the reference frames and keep
going until ours wins.
- Reference frames: ./references/ (staged by the manager)
- Capture your own progress: `npm run capture:fast` (and `motion`).

## Targets (manager's retune notes — the biggest gaps from stock)
1. Palette: dusty brown → gold/green field. Grass taller, denser,
   pampas-like with white flower specks.
2. Vegetation: western shrubs/pines → tall thin pines + a few maples.
3. Terrain: eroded buttes → rolling grassland hills, keep the mountains
   far and blue. Add a stream + log bridge near spawn.
4. Town: western false-fronts → a small shrine/torii + stone lanterns
   (optional but big points).
5. Particles: add drifting petals/leaves through the light.
6. Boot: already golden hour — keep it, do not regress to noon.

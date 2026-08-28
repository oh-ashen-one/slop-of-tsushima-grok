# GOLDEN FIELD — art law (overrides CONTRACTS.md §5 western palette)

The deliverable is Ghost of Tsushima Iki Island, not RDR2. Keep the engine
contracts (ids, ctx fields, no Math.random, linear HDR, no new deps). Replace
the western look.

## Palette (sRGB authored, convert to linear in shaders)

| Role | Hex | Notes |
|---|---|---|
| sunlit grass | `#C9A84A` `#E0C46A` | warm gold, not sage, not emerald |
| shadow grass | `#2E3A1C` `#3D4A24` | cool dark green, still readable |
| pampas / tips | `#F3E8C8` | cream-white seed heads |
| wildflower | `#F6F1E4` | small white specks, drifts not a carpet |
| soil | `#6A5538` | only in bald patches; never the hero surface |
| pine trunk | `#1A1612` | near-black silhouette against gold |
| maple | `#C45A28` `#7A8A3A` | a few autumn + green, never western scrub |
| haze near | `#E8C99A` | warm gold air |
| haze far | `#9BB0C4` | mountains recede cool blue |
| sun | low, amber, long raking shadows | boot stays 17.8, do not go noon |

## Non-negotiable picture

Waist-high waving grass catching rim light. Tall thin pines. God rays through
haze. Falling petals. White wildflowers. A stream with a log (or stone) bridge
near spawn. Dark ronin silhouette inside that light. Camera sits low and wide,
looking through the grass.

Reference frames: `./references/field_2.png field_9.png field_16.png field_24.png shrine_night.png`

## What stock currently looks like (the gap)

- Dusty brown/blue soil with ankle-high tufts
- Cowboy + rifle + western saddle town
- Eroded buttes as midground landmarks
- Yucca / cactus / skulls
- Orange cloud blobs, not shafts of light through a golden volume

## Ownership (do not edit outside your list)

See the brief you were given. Never edit `src/core/*`, `src/main.js`, or `tools/*`.
Never call `Math.random()`. Never add npm packages.

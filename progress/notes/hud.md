# HUD — Golden Field

Owned: `index.html`, `src/ui/HUD.js`, `src/ui/Regions.js`, `src/ui/PauseMenu.js`.

## Boot
- Title is **Golden Field**. Wordmark is `GOLDEN FIELD` over `黄金の野` on black, with a 1px gold `#d4b45c` bar.
- `#boot`, `#barfill`, `#boottask` ids unchanged (main.js still writes them).
- System mincho stack only. No webfonts.

## Capture
- `?capture=1` / `?hud=0` still returns before any canvas, DOM, listeners, or PauseMenu.

## What is drawn
- Thin compass (narrower strip, 30° ticks, gold cardinals).
- Location title cards (Japanese names, no latin uppercase).
- E prompt: `Mount  馬` / `Dismount  馬`.
- Damage / stamina arcs when they are not full.
- First-run: WASD, Shift, E only.

## What is not drawn
- Wanted stars, bounty, "the law".
- Rifle reticle, ammo ticks, breath bar, pelts / TAKE.
- Skinning ring, carcass / pickup prompts.
- `notify()` swallows wanted / pelt / bounty copy from other systems.

## Places
- Town POI → shrine names (稲荷社, 若宮, 石の祠…).
- River → creek (小川, 清流, 霧の沢…).
- Forest → pine ridge (松の尾根, 杉の森…).
- Lattice: 黄金の野, 薄の丘, 霧の沢, etc.
- Time line is quiet English (`at first light`, `dusk`) not a clock.

## Pause
- Title **Golden Field** / 黄金の野.
- Controls kept: WASD, Shift run, E mount · 馬.
- No spur / bounty / western copy.

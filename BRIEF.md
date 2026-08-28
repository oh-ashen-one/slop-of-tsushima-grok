# EP-02 MAIN — "Golden Field" (gauntlet brief)

Build a Ghost-of-Tsushima-vibes open field from this staged Three.js open
world (RED SANDS, MIT — a complete procedural open world with terrain,
physical sky, volumetric weather, grass, wildlife, and rideable horses).
The player spawns on foot in a golden-hour Japanese grassland, walks,
mounts a horse, and rides. It should be utterly beautiful and atmospheric
at the level of Ghost of Tsushima — from the feel of crossing the field
on horseback to the sunset-lit scenery, with everything done at that
quality: the grass, the light, the trees, the water, the particles, the
character, and anything you could think of.

The hero asset is staged at `public/assets/ronin.glb` (1.78 m,
Mixamo-convention skeleton, animation tracks: idle, walk, mount, ride).
Replace the procedural cowboy with it and drive the clips from the
movement and mount states. Read INTEGRATION.md first — it maps the swap
points, the palette law, and the biggest gaps from stock.

The bar is the reference frames in `./references/` (Ghost of Tsushima
field + shrine frames). Break the work into the smallest pieces that can
be improved and judged on their own — you decide what the pieces are, not
me. Fan out sub-agents and have sub-agents tackle each one individually
so that the game is utterly perfect. You should /loop on each piece and
have a separate sub-agent with fresh context inspect the actual running
game — never the builder's summary — using the project's capture tooling
(`npm run capture:fast`, `npm run motion`, `npm run scout`) to ensure it
looks and feels at the Ghost of Tsushima level. That separate sub-agent
should be a really harsh critic, and if it falls short, it should keep
going.

Don't stop until each critic is utterly wowed with the quality when
compared with the references. It should literally compare them side by
side blind and say which one looks and feels better, and when ours
loses, name the single biggest gap and send the builder back in. No
fixed number of rounds. Between major waves, spawn one fresh agent to
play the whole game and smooth everything into one coherent thing.

Keep a simple live progress page (`progress.html` at project root)
updated with capture shots and notes as you work so the director can
watch it evolve. /loop until it's utterly perfect. Fan out sub-agents
and ultracode.

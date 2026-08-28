# Camera retune — Ghost of Tsushima framing

Stock was RDR2-high: hat-brim pivot, long right-shoulder, 48° FOV looking
down onto the grass. Golden Field wants the lens IN the gold, looking through
waist-high stems. Only `src/player/CameraRig.js` changed. `setFreeCamera()`
untouched (capture harness). Collision sphere-cast, damping, look-hold and
recentre kept.

## Numbers

| | stock | now | why |
|---|---|---|---|
| pivot height, on foot | 1.60 m | **1.18 m** | chest of a 1.78 m man, not hat-brim |
| pivot height, mounted | 2.10 m | **1.44 m** | just above saddle, below cowboy-hat |
| speed rise (foot / mount) | +0.16 / +0.34 | **+0.10 / +0.16** | stay in the grass at a run |
| arm rest, on foot | 4.05 m (ctor 4.2) | **3.75 m** | intimate, Jin-close |
| arm rest, mounted | 5.25 m | **5.60 m** | horse + field both read |
| arm speed add (foot / mount) | +1.35 / +1.55 | **unchanged** | keep the existing lengthen |
| base FOV | 48° | **56°** | wider; more gold in the lower third |
| FOV speed add (foot / mount) | +6.5 / +9.5 | **+5.0 / +7.0** | still widens at gallop, from a wider base |
| shoulder | 0.62 m | **0.42 m** | almost centred, slight left-of-centre rider |
| rest pitch (player −0.06 + bias) | −0.06 | **−0.16 foot / −0.10 mounted** | extra down on foot; look-ahead in the saddle |
| gallop pitch extra | −0.05 / −0.075 | **−0.05 / +0.03** | mounted gaze lifts toward the horizon |

## Rest poses (player.pitch = −0.06, still)

- **On foot.** Pivot 1.18 m, arm 3.75 m, pitch −0.16 (~−9°), FOV 56°, shoulder 0.42 m. Lens sits around 1.7 m looking at the chest, grass fills the lower third.
- **Mounted.** Pivot 1.44 m, arm 5.60 m, pitch −0.10 (~−6°), FOV 56°, shoulder 0.42 m. Rider is a dark silhouette slightly left-of-centre; horizon in the upper third; long view ahead.

## Speed poses (speed01 = 1)

- **Sprint on foot.** Arm 5.10 m, FOV 61°, pitch −0.21. Still low.
- **Gallop.** Arm 7.15 m, FOV 63°, pitch −0.07. Look-ahead Iki Island ride; arm lengthen is the old +1.55 from a longer mounted base.

## Left alone

- `setFreeCamera` / `clearFreeCamera` / `_apply` (harness)
- sphere-cast collision, floor lift, handheld/gait bob, shake
- look-hold latch + auto-recentre
- ADS arm shorten / FOV drop / eyeline lift

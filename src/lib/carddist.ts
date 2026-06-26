import "server-only";
import { getAllCards } from "./data";
import type { HitCardDist, PitchCardDist } from "./seasoncrafter";

function ms(arr: number[]): [number, number] {
  if (arr.length < 5) return [125, 33];
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return [m, Math.max(8, Math.sqrt(v))];
}

// Cache per process; re-computed on next cold start after a data rebuild.
let _hit: HitCardDist | null = null;
let _pitch: PitchCardDist | null = null;

export function getHitCardDist(): HitCardDist | null {
  if (_hit !== null) return _hit;
  try {
    const hitters = getAllCards().filter((c) => !c.isPitcher);
    if (hitters.length < 10) return null;
    _hit = {
      contact:     ms(hitters.map((c) => c.hit.overall.contact)),
      gap:         ms(hitters.map((c) => c.hit.overall.gap)),
      power:       ms(hitters.map((c) => c.hit.overall.power)),
      eye:         ms(hitters.map((c) => c.hit.overall.eye)),
      avoidK:      ms(hitters.map((c) => c.hit.overall.avoidK)),
      babip:       ms(hitters.map((c) => c.hit.overall.babip)),
      speed:       ms(hitters.map((c) => c.baserun.speed)),
      stealing:    ms(hitters.map((c) => c.baserun.stealing)),
      baserunning: ms(hitters.map((c) => c.baserun.baserunning)),
      sacBunt:     ms(hitters.map((c) => c.baserun.sacBunt)),
      buntForHit:  ms(hitters.map((c) => c.baserun.buntForHit)),
      ifRange:     ms(hitters.map((c) => c.field.ifRange)),
      ifError:     ms(hitters.map((c) => c.field.ifError)),
      ifArm:       ms(hitters.map((c) => c.field.ifArm)),
      turnDP:      ms(hitters.map((c) => c.field.turnDP)),
      ofRange:     ms(hitters.map((c) => c.field.ofRange)),
      ofError:     ms(hitters.map((c) => c.field.ofError)),
      ofArm:       ms(hitters.map((c) => c.field.ofArm)),
      cAbility:    ms(hitters.map((c) => c.field.cAbility)),
      cFraming:    ms(hitters.map((c) => c.field.cFraming)),
      cArm:        ms(hitters.map((c) => c.field.cArm)),
    };
    return _hit;
  } catch {
    return null;
  }
}

export function getPitchCardDist(): PitchCardDist | null {
  if (_pitch !== null) return _pitch;
  try {
    const pitchers = getAllCards().filter((c) => c.isPitcher);
    if (pitchers.length < 5) return null;
    _pitch = {
      stuff:    ms(pitchers.map((c) => c.pitch.overall.stuff)),
      movement: ms(pitchers.map((c) => c.pitch.overall.movement)),
      control:  ms(pitchers.map((c) => c.pitch.overall.control)),
      pHR:      ms(pitchers.map((c) => c.pitch.overall.pHR)),
      pBABIP:   ms(pitchers.map((c) => c.pitch.overall.pBABIP)),
      stamina:  ms(pitchers.map((c) => c.pitcherPhysical.stamina)),
      hold:     ms(pitchers.map((c) => c.pitcherPhysical.hold)),
    };
    return _pitch;
  } catch {
    return null;
  }
}

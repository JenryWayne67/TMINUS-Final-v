// Shared expedition coordinates and interactions. All rules stay in expedition-core/science-match.
import { RACKS, SHIP_SCALE } from "./ship-scale.js";
import { partBoxes, hullBoxes,atActorHeight } from "./hull-collision.js";
export const EXPEDITION_BASES = [
  [-65, 58],
  [65, 58],
  [-65, -58],
  [65, -58],
];
export const STOW_POINT = { x: 0, z: 5.5 * SHIP_SCALE };
export const RECEIVER_POINT = { x: 0, z: 40 };
export const CHECK_STATIONS = [
  { id: "engine", role: 0, x: 0, z: 8 * SHIP_SCALE },
  { id: "power", role: 1, x: 3 * SHIP_SCALE, z: 5.7 * SHIP_SCALE },
  { id: "pressure", role: 1, x: -3 * SHIP_SCALE, z: 5.7 * SHIP_SCALE },
];
export const SYSTEM_STATIONS = [
  { id: "reactor", x: -3.8, z: -4.2 },
  { id: "coolant", x: -3.8, z: 3 },
  { id: "scrubber", x: 3.8, z: -4.2 },
  { id: "stores", x: 3.8, z: 3 },
];
export const SURFACE_ROCKS = [
  { x: -12, z: -10, r: 2.2 },
  { x: 11, z: -11, r: 2.4 },
  { x: -14, z: 4, r: 2 },
  { x: 14, z: 5, r: 2.1 },
  { x: -2, z: -8, r: 1.8 },
  { x: 0, z: 6, r: 1.6 },
  { x: -23, z: 15, r: 2.3 },
  { x: 23, z: 17, r: 2.4 },
];
export const shelfPoint = (mission, part) => {
  const slot = mission.parts
    .filter((p) => p.owner === part.owner)
    .findIndex((p) => p.id === part.id);
  return {
    x: RACKS[part.owner][0] + ((slot % 3) - 1) * 1.45,
    z: RACKS[part.owner][1] + 2.25 + Math.floor(slot / 3) * 1.5,
  };
};
export const planetFor = (s) =>
  s.phase === "surface" ? "B" : s.phase === "flight" ? "space" : "A";
export const baseFor = (team) => ({
  x: EXPEDITION_BASES[team][0],
  z: EXPEDITION_BASES[team][1],
});
export function expeditionColliders(mission,{bottom=0,height=2.5}={}) {
  const phase = mission.phase;
  if (phase === "flight")
    return {
      boxes: SYSTEM_STATIONS.map((c) => ({
        x0: c.x - 1.1,
        x1: c.x + 1.1,
        z0: c.z - 0.65,
        z1: c.z + 0.65,
      })),
      circles: [],
    };
  return {
    boxes: atActorHeight(phase === "assembly" ? partBoxes(mission.parts) : hullBoxes(),bottom,height),
    circles: [],
  };
}

export const spaceBaseFor=team=>({x:(team-1.5)*36,z:0});

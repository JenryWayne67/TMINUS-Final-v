// One spacecraft, one size, in every phase.
// The ship is built from the T-MINUS ship interior (six 5 x 3 m rooms, about 33 m end to end), so its exterior,
// assembly parts, launch, flight and landing models all derive from this single scale. The crew stay 2.5 m tall.
// The original models were drawn for a ship about 9 m long, so SHIP_SCALE = 33 / 9.
export const SHIP_SCALE = 3.6;
export const SHIP_Y = .22 + .41 * SHIP_SCALE;                       // ship origin height when it sits on the ground

// Convert an original-scale point on or near the ship (world coordinates, ground at y = 0.6 for the old hull) to the
// shuttle-scale ship. Heights are measured from the old hull baseline so parts stay glued to the hull.
export const shipPoint = ([x, y, z]) => [x * SHIP_SCALE, SHIP_Y + (y - 0.6) * SHIP_SCALE, z * SHIP_SCALE];
export const shipSize = ([x, y, z]) => [x * SHIP_SCALE, y * SHIP_SCALE, z * SHIP_SCALE];
export const shipOffset = ([x, y, z]) => [x * SHIP_SCALE, y * SHIP_SCALE, z * SHIP_SCALE];   // relative to ship.position

// Component racks sit well outside the ship's footprint (about 16 m half-width, 14 m half-length).
export const RACKS = [[-30, -20], [30, -20], [-30, 22], [30, 22]];
// Supply cases and the aft cargo ring, outside the hull but within a short walk of it.
export const CARGO_SPOTS = [[-26, 34], [26, 34], [-26, -32], [26, -32]];

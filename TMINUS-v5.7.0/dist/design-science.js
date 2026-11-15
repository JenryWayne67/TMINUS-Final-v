// Phase 1 — Spacecraft building science.
// Pure functions only (no DOM, no Three.js) so every number can be unit-tested.
// All values are an illustrative teaching model, not flight certification.
import {UPGRADES} from './science-match.js';

export const G0 = 9.80665;          // standard gravity, m/s^2
export const ISP = 360;             // engine specific impulse, s (matches routeBudget)
export const SOLAR_FLUX = 1361;     // W/m^2 near Earth
export const TWR_GO = 1.25;         // at or above: GO
export const TWR_MIN = 1.0;         // below: NO-GO (cannot lift off)
export const CREW = 4;
export const MISSION_DAYS = 3;      // compressed teaching mission length
export const ECLIPSE_MIN = 35;      // minutes in shadow per orbit
export const DEPTH_OF_DISCHARGE = 0.8;
export const O2_KG_PER_PERSON_DAY = 0.84;
export const O2_MARGIN = 1.5;       // 50% contingency
export const DATA_PER_FLAG_MBIT = 240;
export const COMMS_WINDOW_S = 600;  // contact time per pass

// Per-part design stats. mass kg; thrustKN; powerKW (+ generated / - none, loads are in BASE_LOAD_KW);
// capacityKWh for batteries; o2Kg for the scrubber; rateMbps for the antenna.
// The 12 masses plus FIXED_MASS add up to 670 kg dry, so a default ship is 750 kg wet with 80 kg propellant,
// exactly the numbers the original model used.
export const PART_STATS = {
  keel:      {mass: 140, note: 'Structure: the biggest share of dry mass.'},
  port:      {mass: 38,  thrustKN: 5.2},
  bridge:    {mass: 45},
  reactor:   {mass: 60,  generationKW: 9},
  battery:   {mass: 52,  capacityKWh: 6},
  coolant:   {mass: 36},
  cargo:     {mass: 24},
  scrubber:  {mass: 30,  o2Kg: 18},
  stores:    {mass: 40},
  engine:    {mass: 28},
  thruster:  {mass: 38,  thrustKN: 5.2},
  antenna:   {mass: 20,  rateMbps: 2}
};
// Which ship module (rear to nose, from the T-MINUS_Latest ship_interior model) each part lives in.
// 'hull' is the whole structure rather than one room. Names match the glb nodes `module_<room>`.
export const ROOM_ORDER = ['engine_bay', 'power_room', 'life_support', 'workshop', 'lab', 'cockpit'];
export const ROOM_LABEL = {engine_bay: 'Engine bay', power_room: 'Power room', life_support: 'Life support',
  workshop: 'Workshop', lab: 'Lab', cockpit: 'Cockpit', hull: 'Whole hull'};
export const PART_ROOM = {
  keel: 'hull', port: 'engine_bay', thruster: 'engine_bay', engine: 'workshop',
  reactor: 'power_room', battery: 'power_room', coolant: 'power_room',
  scrubber: 'life_support', stores: 'life_support', cargo: 'workshop',
  antenna: 'lab', bridge: 'cockpit'
};
export const CHECK_ROOM = {twr: 'engine_bay', dv: 'engine_bay', power: 'power_room', battery: 'power_room', o2: 'life_support', downlink: 'lab'};
export const FIXED_MASS = 119;     // crew, suits and fixed payload
export const BASE_LOAD_KW = 5.4;    // systems load before options (matches tickSystems)
export const BASE_PROPELLANT = 80;

// ---- Formulas -------------------------------------------------------------
export const thrustToWeight = (thrustN, massKg, g = G0) => thrustN / (massKg * g);
export const deltaV = (isp, m0, m1) => (m1 > 0 && m0 > m1 ? isp * G0 * Math.log(m0 / m1) : 0);
export const solarPower = (areaM2, efficiency = 0.3, angleDeg = 0, flux = SOLAR_FLUX) =>
  Math.max(0, flux * areaM2 * efficiency * Math.cos(angleDeg * Math.PI / 180));        // watts
export const eclipseEnergy = (loadKW, eclipseMin = ECLIPSE_MIN) => loadKW * eclipseMin / 60;   // kWh drawn
export const batteryNeeded = (loadKW, eclipseMin = ECLIPSE_MIN, dod = DEPTH_OF_DISCHARGE) => eclipseEnergy(loadKW, eclipseMin) / dod;
export const oxygenMass = (crew = CREW, days = MISSION_DAYS, rate = O2_KG_PER_PERSON_DAY, margin = O2_MARGIN) => crew * days * rate * margin;
export const downlinkTime = (dataMbit, rateMbps) => (rateMbps > 0 ? dataMbit / rateMbps : Infinity);   // seconds

// ---- Design sheet ---------------------------------------------------------
const status = (ok, caution) => (ok ? 'go' : caution ? 'caution' : 'nogo');

// Builds the live design sheet from an expedition state. Reads only; never mutates state.
export function designSheet(s) {
  const opts = (s.upgrades || []).map(id => UPGRADES.find(u => u.id === id)).filter(Boolean);
  let dry = FIXED_MASS, thrustKN = 0, generationKW = 0, batteryKWh = 0, o2Supply = 0, rateMbps = 0;
  for (const p of s.parts) {
    const st = PART_STATS[p.id];
    if (!st) continue;
    dry += st.mass;
    thrustKN += st.thrustKN || 0;
    generationKW += st.generationKW || 0;
    batteryKWh += st.capacityKWh || 0;
    o2Supply += st.o2Kg || 0;
    rateMbps += st.rateMbps || 0;
  }
  const optMass = opts.reduce((a, u) => a + u.mass, 0);
  const optFuel = opts.reduce((a, u) => a + u.fuel, 0);
  const optLoad = opts.reduce((a, u) => a + u.power, 0);
  const optCargo = opts.reduce((a, u) => a + u.cargo, 0);
  const propellant = BASE_PROPELLANT + optFuel;
  // optMass already includes the reserve tank's own mass AND its 20 kg of fuel, as in setUpgrade (wetMass += mass).
  const wet = dry + BASE_PROPELLANT + optMass;
  const emptyMass = wet - propellant;
  const loadKW = BASE_LOAD_KW + optLoad;
  const twr = thrustToWeight(thrustKN * 1000, wet);
  const dv = deltaV(ISP, wet, emptyMass);
  const eclipseNeed = batteryNeeded(loadKW);
  const o2Need = oxygenMass();
  const flags = 6 + optCargo;
  const dlTime = downlinkTime(flags * DATA_PER_FLAG_MBIT, rateMbps);
  const passes = Math.ceil(dlTime / COMMS_WINDOW_S);
  const powerMargin = generationKW - loadKW;
  const checks = [
    {id: 'twr', label: 'Thrust-to-weight', value: twr, unit: '', limit: `≥ ${TWR_GO}`,
      status: status(twr >= TWR_GO, twr >= TWR_MIN),
      why: 'Thrust ÷ (mass × g). Below 1.0 the ship cannot leave the pad; under 1.25 the climb is slow and wastes fuel.'},
    {id: 'dv', label: 'Delta-v', value: dv, unit: 'm/s', limit: '≥ 215',
      status: status(dv >= 215, dv >= 120),
      why: 'Δv = Isp × g0 × ln(m0 ÷ m1). Heavier options shrink it because the same fuel moves more mass. Routes need 120–215 m/s.'},
    {id: 'power', label: 'Power margin', value: powerMargin, unit: 'kW', limit: '≥ 1.0',
      status: status(powerMargin >= 1, powerMargin >= 0),
      why: 'Reactor output at full rating minus the systems load. Each option adds to the load.'},
    {id: 'battery', label: 'Eclipse battery', value: batteryKWh - eclipseNeed, unit: 'kWh spare', limit: '≥ 0',
      status: status(batteryKWh >= eclipseNeed, batteryKWh >= eclipseNeed * 0.9),
      why: `The ship has no sun for ${ECLIPSE_MIN} min each orbit. Needed = load × time ÷ ${DEPTH_OF_DISCHARGE} depth-of-discharge.`},
    {id: 'o2', label: 'Oxygen supply', value: o2Supply - o2Need, unit: 'kg spare', limit: '≥ 0',
      status: status(o2Supply >= o2Need, o2Supply >= o2Need * 0.9),
      why: `${CREW} crew × ${MISSION_DAYS} days × ${O2_KG_PER_PERSON_DAY} kg/day × ${O2_MARGIN} margin.`},
    {id: 'downlink', label: 'Data downlink', value: dlTime, unit: 's', limit: `${passes} pass${passes === 1 ? '' : 'es'}`,
      status: 'go',
      why: `Data ÷ rate. ${flags} flags × ${DATA_PER_FLAG_MBIT} Mbit at ${rateMbps} Mbps; each contact lasts ${COMMS_WINDOW_S} s.`}
  ];
  for (const c of checks) c.room = CHECK_ROOM[c.id];
  const worst = checks.some(c => c.status === 'nogo') ? 'nogo' : checks.some(c => c.status === 'caution') ? 'caution' : 'go';
  return {
    mass: {dry: emptyMass, propellant, wet},
    thrustKN, twr, deltaV: dv,
    power: {generationKW, loadKW, marginKW: powerMargin},
    battery: {capacityKWh: batteryKWh, eclipseNeedKWh: eclipseNeed},
    oxygen: {suppliedKg: o2Supply, requiredKg: o2Need},
    downlink: {seconds: dlTime, passes, flags, rateMbps},
    installed: s.parts.filter(p => p.stage === 'secured').length,
    checks, overall: worst
  };
}

// ---- Faults that trace back to the build -------------------------------------------------------
// A weak power margin makes reactor faults likelier; a thin oxygen margin makes scrubber faults likelier.
// Cooling stays constant. Calls rand() exactly once so the flight's random sequence is unchanged.
export function faultWeights(sheet) {
  return {
    reactor: 1 + Math.max(0, 3 - sheet.power.marginKW),
    cooling: 1,
    scrubber: 1 + Math.max(0, 4 - (sheet.oxygen.suppliedKg - sheet.oxygen.requiredKg)) * 0.5
  };
}
export function pickFault(sheet, rand) {
  const w = faultWeights(sheet), names = Object.keys(w);
  let x = rand() * names.reduce((a, n) => a + w[n], 0);
  for (const n of names) { x -= w[n]; if (x < 0) return n; }
  return names[names.length - 1];
}

// ---- Slow climb ---------------------------------------------------------------------------------
// Below the GO thrust-to-weight the ship spends longer fighting gravity ("gravity losses"), which costs propellant.
// 0 at or above TWR_GO; grows as thrust-to-weight falls. A teaching model, not a trajectory calculation.
export const SLOW_CLIMB_KG_PER_UNIT = 120;
export const slowClimbKg = twr => (twr >= TWR_GO ? 0 : (1 - twr / TWR_GO) * SLOW_CLIMB_KG_PER_UNIT);

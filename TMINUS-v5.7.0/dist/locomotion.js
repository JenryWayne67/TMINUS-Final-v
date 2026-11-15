// How fast the crew move and which animation that looks like. Pure logic: no THREE, no DOM.
//   W alone      = run
//   W + Shift    = sprint (like Call of Duty / Fortnite)
//   walking      = only when carrying something heavy (a ship part or a supply case)
//   C / Ctrl     = crouch
export const SPEED = {walk: 2.8, run: 6.2, sprint: 9.2, crouch: 3.0};
export const LIGHT_CARRY = 0.85;         // a flag: still runs, a little slower, cannot sprint
export const ADS_FACTOR = 0.6;           // aiming down sights slows you
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// carrying: 'none' | 'light' | 'heavy'. true is treated as 'light'.
export const carryKind = c => (c === 'heavy' ? 'heavy' : (c === true || c === 'light') ? 'light' : 'none');

export function speedFor({sprint = false, crouch = false, ads = false, carrying = 'none', forward = true} = {}) {
  const c = carryKind(carrying);
  if (c === 'heavy') return SPEED.walk;                       // heavy loads: walk, no matter what
  let s = SPEED.run;
  if (crouch) s = SPEED.crouch;
  else if (sprint && forward && !ads && c === 'none') s = SPEED.sprint;
  if (ads) s *= ADS_FACTOR;
  if (c === 'light') s *= LIGHT_CARRY;
  return s;
}

// Which locomotion state a given ground speed is, so the right clip plays.
export function stateFor(speed, {carrying = 'none', crouch = false, interacting=false, airborne=false} = {}) {
  if(airborne)return 'jump';
  if(interacting&&speed<.6)return 'work';
  const c = carryKind(carrying);
  if (speed < 0.3) return crouch ? 'crouchIdle' : c === 'heavy' ? 'carryIdle' : c === 'light' ? 'carrySmallIdle' : 'idle';
  if (c === 'heavy') return 'carryWalk';
  if (crouch) return 'crouchWalk';
  if (c === 'light') return 'carrySmallWalk';     // flags and small tools: held in front, never hidden behind a run cycle
  if (speed < 4.4) return 'walk';
  if (speed < 7.5) return 'run';
  return 'sprint';
}

// Clip names inside the character files. The frog, bee and flamingo share one set; the robot has fewer.
export const CLIPS = {
  animal: {idle: 'UAL_Idle_Loop', walk: 'UAL_Walk_Loop', run: 'Run', sprint: 'UAL_Sprint_Loop', carryIdle: 'Carry_Large_Idle',
    carryWalk: 'Carry_Large_Walk', crouchIdle: 'UAL_Crouch_Idle_Loop', crouchWalk: 'UAL_Crouch_Fwd_Loop',work:'Use_Tool_Loop',jump:'UAL_Jump_Loop',
    carrySmallIdle: 'Carry_Small_Idle', carrySmallWalk: 'Carry_Small_Walk', pickup: 'UAL_PickUp_Table', seated: 'Seated_Hands_Controls', celebrate: 'Celebrate'},
  // Chip has a real walk cycle (Robot_Walking); carrying and crouching reuse it at a slower pace.
  robot: {idle: 'Robot_Idle', walk: 'Robot_Walking', run: 'Robot_Running', sprint: 'Robot_Running', carryIdle: 'Robot_Idle',
    carryWalk: 'Robot_Walking', crouchIdle: 'Robot_Idle', crouchWalk: 'Robot_Walking',work:'Robot_Punch',jump:'Robot_Jump',
    carrySmallIdle: 'Robot_Idle', carrySmallWalk: 'Robot_Walking', pickup: 'Robot_Punch', seated: 'Robot_Sitting', celebrate: 'Robot_ThumbsUp'}
};
export const clipFor = (species, state) => (species === 'robot' ? CLIPS.robot : CLIPS.animal)[state];

// The robot only has a run clip, so walk and sprint are the same clip played slower and faster.
const ROBOT_RATE = {walk: 0.95, run: 1, sprint: 1.5, carryWalk: 0.8, crouchWalk: 0.7, carrySmallWalk: 0.9, work: 0.7};
// Ground speed each animal clip looks right at; feet slide less when the playback rate follows the real speed.
const REF = {walk: SPEED.walk, run: SPEED.run, sprint: SPEED.sprint, carryWalk: SPEED.walk, crouchWalk: SPEED.crouch, carrySmallWalk: SPEED.walk};
export function timeScaleFor(species, state, speed) {
  if (species === 'robot') return ROBOT_RATE[state] ?? 1;
  const ref = REF[state];
  return ref ? clamp(speed / ref, 0.6, 1.4) : 1;
}

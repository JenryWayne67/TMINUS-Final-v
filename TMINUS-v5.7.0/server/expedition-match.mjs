import {ensureOperator,operatorAction,operatorWork,advanceOperator,fireSurface,tickOrdnance,operatorSnapshot,recordCombat} from './expedition-operations.mjs';
import {createMotor,clearMotor} from '../dist/character-motor.js';
import {createVitals} from '../dist/fps-core.js';
// Authoritative integration of the original expedition and finite science rules.
// The server owns every position, timer, part, fastener, resource and delivered flag.
import { randomUUID } from "node:crypto";
import { Match } from "./match.mjs";
import {
  createExpedition,
  pickPart,
  rotateCarried,
  placePart,
  fastenBolt,
  pickCargo,
  stowCargo,
  runCheck,
  launchFlight,
  tickSystems,
  maintainSystem,
  setUpgrade,
  routeBudget,
} from "../dist/expedition-core.js";
import {
  createScienceMatch,
  scanFlag,
  recoverFlag,
  loadFlag,
  deliverFlag,
  dropFlag,
  flagCounts,
  eliminateCrew,
  conservation,
} from "../dist/science-match.js";
import { footprintDistance, boltPosition } from "../dist/build-guide.js";
import { movePlanar, recoverPlanar, blocked } from "../dist/motion-physics.js";
import {
  baseFor,
  spaceBaseFor,
  shelfPoint,
  STOW_POINT,
  RECEIVER_POINT,
  CHECK_STATIONS,
  SYSTEM_STATIONS,
  SURFACE_ROCKS,
  planetFor,
  expeditionColliders,
} from "../dist/expedition-network.js";
import { hullBoxes } from "../dist/hull-collision.js";
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const neutral = () => ({ strafe: 0, forward: 0, buttons: 0 });
const fail = (message) => ({ error: message });
const ok = (message) => ({ ok: true, message });
export class ExpeditionMatch extends Match {
  constructor({ windowSeconds = 1800, onComplete, ...options } = {}) {
    super(options);
    this.kind = "expedition";
    this.matchId = randomUUID();
    this.windowSeconds = windowSeconds;
    this.science = createScienceMatch(42);
    this.science.limit = windowSeconds;
    this.missions = Array.from({ length: 4 }, (_, team) => {
      const s = createExpedition(420 + team);
      s.aiAssist = false;
      s.mode = "play";
      s.match = this.science;
      s.teams = this.science.teams;
      s.shipMotion = { x: 0, z: 0 };
      s.hazards = [];
      s.hazardClock = 10;
      s.finished = false;
      return s;
    });
    this.activeTeams = [];
    this.onComplete = onComplete;
    this.settled = false;
    this.combatEvents=[];this.combatSerial=0;this.grenades=[];
  }
  join(info = {}) {
    if (this.phase !== "lobby" && !this.tokens.has(info.token))
      return fail(
        "Match underway. Reconnect with your reserved session or create a new room.",
      );
    const result = super.join(info);
    if (result.player) {
      const p = result.player;
      p.commandSeq ??= -1;
      p.contribution ??= 0;
      p.profileId ??= null;
      ensureOperator(p);
      p.task = null;
      p.input = neutral();
      clearMotor(p.motor);p.firePressed=p.jumpPressed=false;p.suit.vx=p.suit.vy=p.suit.vz=0;
      if (!result.resumed) {
        this.spawn(p);
        const e = this.events[this.events.length - 1];
        if (e)
          e.text = `${p.name} joined ${this.science.teams[p.team].name} as ${["Pilot", "Engineer", "Gunner", "Raider"][p.role]}`;
      }
    }
    return result;
  }
  spawn(p) {
    const s = this.missions[p.team];
    if (!s) return;
    const flying = s.phase === "flight";
    p.motor=createMotor();p.y=0;p.eva=false;
    p.x = flying ? [-1.8, -2.4, 1.8, 2.4][p.role] : -3 + p.role * 2;
    p.z = flying ? -5.5 : 26;
    const c = this.colliders(p);
    const at = recoverPlanar(p.x, p.z, c.boxes, c.circles);
    p.x = at.x;
    p.z = at.z;
  }
  local(p) {
    return { x: p.x, z: p.z };
  }
  // Actors use coordinates relative to their crew's pad. On B, transform shared rocks and rival hulls.
  world(p) {
    const b = this.missions[p.team].phase==='flight'?spaceBaseFor(p.team):baseFor(p.team);
    return { x: p.x + b.x, z: p.z + b.z };
  }
  colliders(p) {
    const s = this.missions[p.team],
      c = expeditionColliders(s,{bottom:p.motor?.y||0,height:p.input?.crouch?1.3:2.5});
    if (s.phase === "surface") {
      const b = baseFor(p.team);
      c.circles = SURFACE_ROCKS.map((r) => ({
        ...r,
        x: r.x - b.x,
        z: r.z - b.z,
      }));
      for (let team = 0; team < 4; team++)
        if (team !== p.team && this.missions[team].phase === "surface") {
          const other = baseFor(team);
          c.boxes.push(...hullBoxes({ x: other.x - b.x, z: other.z - b.z }));
        }
    }
    return c;
  }
  start(id) {
    if (this.phase !== "lobby") return fail("Match has already started");
    if (id !== this.hostId) return fail("Only the room host can start");
    if (this.participants.length < this.minPlayers)
      return fail(`At least ${this.minPlayers} players required`);
    if (
      this.minPlayers > 1 &&
      new Set(this.participants.map((p) => p.team)).size < 2
    )
      return fail("Players from two opposing teams are required");
    if (this.participants.some((p) => !p.ready))
      return fail("Every player must ready up");
    this.activeTeams = [...new Set(this.participants.map((p) => p.team))];
    this.phase = "expedition";
    this.phaseLeft = this.windowSeconds;
    for (const p of this.players.values()) {
      p.input = neutral();
      this.spawn(p);
    }
    this.sendEvent(
      "Build all twelve modules, stow supplies, verify systems, and choose a route.",
    );
    return ok("Expedition started");
  }
  chooseSeat(id, team, role) {
    const p = this.players.get(id);
    if (
      !p?.connected ||
      !Number.isInteger(role) ||
      role < 0 ||
      role > 3 ||
      !Number.isInteger(team) ||
      team < 0 ||
      team > 3
    )
      return fail("Invalid seat");
    if (this.phase !== "lobby" && team !== p.team)
      return fail("Teams are fixed during a match");
    if (team === p.team && role === p.role) return ok("Seat unchanged");
    if (this.seat(team, role))
      return fail("That specialist is occupied or reserved");
    const s = this.missions[p.team];
    if (
      s.carry[p.role] ||
      this.science.flags.some(
        (f) =>
          f.state === "carried" && f.owner === p.team && f.carrier === p.role,
      )
    )
      return fail("Place or stow your carried item before changing roles");
    if(p.eva)return fail("Board the airlock before changing roles");
    const previous={x:p.x,z:p.z,y:p.y,motor:{...p.motor,vx:0,vz:0,jumpHeld:false}};
    p.team = team;
    p.role = role;
    p.ready = false;
    p.task = null;
    p.input = neutral();
    this.spawn(p);if(this.phase!=="lobby"&&s.phase!=="flight")Object.assign(p,previous);
    return ok("Specialist changed");
  }
  receiveInput(id,packet){
    const p=this.players.get(id),prior=p?.input.buttons||0;
    if(packet.aimPitch!==undefined&&(!Number.isFinite(packet.aimPitch)||Math.abs(packet.aimPitch)>1.4))return false;
    if(packet.vertical!==undefined&&(!Number.isFinite(packet.vertical)||Math.abs(packet.vertical)>1))return false;
    if(!super.receiveInput(id,packet))return false;
    p.firePressed=!!p.firePressed||(!!(packet.buttons&1)&&!(prior&1));p.jumpPressed=!!p.jumpPressed||(!!(packet.buttons&8)&&!(prior&8));p.aimPitch=packet.aimPitch||0;p.input.ads=packet.ads===true;p.input.crouch=packet.crouch===true;p.input.vertical=packet.vertical||0;
    return true;
  }
  leave(id, now = Date.now()) {
    const p = this.players.get(id);
    if (p) p.task = null;
    return super.leave(id, now);
  }
  dropHeld(p) {
    if (!this.science) return super.dropHeld(p);
    const w = this.world(p);
    dropFlag(
      this.science,
      p.team,
      p.role,
      [w.x, 0, w.z],
      planetFor(this.missions[p.team]),
    );
    p.carry = null;
  }
  action(id, m = {}) {
    const p = this.players.get(id);
    if (
      !p?.connected ||
      p.hp <= 0 ||
      this.phase !== "expedition" ||
      this.missions[p.team].finished
    )
      return fail("Not active");
    if (!Number.isSafeInteger(m.commandSeq) || m.commandSeq <= p.commandSeq)
      return fail("Stale command");
    p.commandSeq = m.commandSeq;
    p.commandBudget=Math.min(3,(p.commandBudget??3)+Math.max(0,this.time-(p.commandBudgetAt??this.time))*10);
    p.commandBudgetAt=this.time;
    if(p.commandBudget<1)return fail("Wait for the current interaction");
    p.commandBudget--;
    p.lastAction = this.time;
    const special=operatorAction(this,p,m);if(special.handled)return special.ok?ok(special.message||'Confirmed'):fail(special.error||'Action unavailable');
    const s = this.missions[p.team],
      point = this.local(p),
      part = s.parts.find((q) => q.id === m.part);
    s.selected = p.role;
    let result = false;
    switch (m.op) {
      case "pick":
        result =
          part &&
          dist(point, shelfPoint(s, part)) <= 3 &&
          pickPart(s, part.id, p.role);
        break;
      case "rotate":
        result = rotateCarried(s, p.role);
        break;
      case "place": {
        const q = s.parts.find((q) => q.id === s.carry[p.role]);
        result = q && placePart(s, p.role, footprintDistance(q, p.x, p.z));
        break;
      }
      case "cargo": {
        const c = s.cargo.find((c) => c.id === m.cargo);
        result =
          c &&
          dist(point, { x: c.position[0], z: c.position[2] }) <= 3 &&
          pickCargo(s, c.id, p.role);
        break;
      }
      case "stow":
        result = stowCargo(s, p.role, dist(point, STOW_POINT));
        break;
      case "work": {
        const allowed = ["bolt", "check", "system", "scan", "panel"];
        if (!allowed.includes(m.target?.type))
          return fail("Unknown work target");
        // Work progresses only in fixed ticks, while the held-work input is fresh and in reach.
        p.task = {
          type: m.target.type,
          id: String(m.target.id || "").slice(0, 24),
          bolt: m.target.bolt,
          reading: m.target.reading,
        };
        return ok("Work target acquired");
      }
      case "launch":
        if (p.role !== 0) return fail("The Pilot selects the launch route");
        result = launchFlight(s, m.route);
        if (result) {
          s.flightLeg = "outbound";
          this.stage(p.team);
          this.science.teams[p.team].planet = "space";
        }
        break;
      case "return": {
        if (p.role !== 0 || s.phase !== "surface")
          return fail("The Pilot commits the return from Planet B");
        if (
          this.science.flags.some(
            (f) => f.state === "carried" && f.owner === p.team,
          )
        )
          return fail("Stow or drop every carried sample first");
        if([...this.players.values()].some(q=>q.team===p.team&&q.eva))return fail("Wait for all EVA crew to board");
        const count = flagCounts(this.science, p.team).onboard;
        const reserve =
          (s.wetMass + count * 6) * (1 - Math.exp(-95 / (360 * 9.80665)));
        if (s.propellant < reserve)
          return fail("Insufficient propellant for return");
        s.propellant -= reserve;
        s.flightLeg = "return";
        s.flightTime = 0;
        s.phase = "flight";
        s.faultClock = 17;
        s.hazards = [];
        s.shipMotion = { x: 0, z: 0 };
        this.science.teams[p.team].planet = "space";
        this.stage(p.team);
        result = true;
        break;
      }
      case "recover": {
        const f = this.science.flags.find((f) => f.id === m.sample),
          w = this.world(p);
        result =
          s.phase === "surface" &&
          f &&
          recoverFlag(
            this.science,
            f.id,
            p.team,
            p.role,
            dist(w, { x: f.position[0], z: f.position[2] }),
          );
        if (result) p.carry = f.id;
        break;
      }
      case "load":
        result =
          s.phase === "surface" &&
          loadFlag(this.science, p.team, p.role, dist(point, { x: 0, z: -17 }));
        if (result) p.carry = null;
        break;
      case "drop":
        this.dropHeld(p);
        result = true;
        break;
      case "deliver":
        result =
          s.phase === "delivery" &&
          deliverFlag(this.science, p.team, dist(point, RECEIVER_POINT));
        if (result) {
          p.contribution += 100;
          this.sendEvent(
            `${this.science.teams[p.team].name} delivered science`,
            p.team,
          );
        }
        break;
      case "finish":
        if (s.phase !== "delivery" || flagCounts(this.science, p.team).onboard)
          return fail("Deliver every onboard sample before finishing");
        s.finished = true;
        result = true;
        this.stage(p.team);
        break;
      case "upgrade":
        result =
          ["assembly", "outfit", "route"].includes(s.phase) &&
          setUpgrade(s, m.upgrade, !!m.enabled,p.team);
        break;
      default:
        return fail("Unknown interaction");
    }
    if (result) {
      p.contribution++;
      return ok("Confirmed by mission control");
    }
    return fail("Check your role, distance, alignment and mission stage");
  }
  stage(team) {
    const s = this.missions[team];
    for (const p of this.players.values())
      if (p.team === team) {
        p.task = null;
        p.input = neutral();
        p.hp = 100;p.vitals=createVitals();
        p.reviveAt = 0;
        this.spawn(p);
      }
    this.sendEvent(
      `${this.science.teams[team].name}: ${s.finished ? "MISSION COMPLETE" : s.phase.toUpperCase()}${s.phase === "flight" ? " / " + s.flightLeg : ""}`,
      team,
    );
  }
  work(p, dt) {
    const task = p.task,
      s = this.missions[p.team];
    if (!task || !(p.input.buttons & 4)) return;
    if(task.type==='panel'){operatorWork(this,p,task,dt);return;}
    const point = this.local(p);
    let changed = false;
    if (task.type === "bolt") {
      const part = s.parts.find((q) => q.id === task.id),
        b = task.bolt;
      if (!part || !Number.isInteger(b) || b < 0 || b > 2 || part.bolts[b] >= 1)
        return;
      const [x, y, z] = boltPosition(part, b),
        distance = Math.hypot(x - p.x, y, z - p.z);
      changed = fastenBolt(s, part.id, b, p.role, dt, distance, true, "human");
    } else if (task.type === "check") {
      const station = CHECK_STATIONS.find((c) => c.id === task.id);
      if (station && dist(point, station) <= 3 && Number.isFinite(task.reading))
        changed = runCheck(s, station.id, p.role, dt, task.reading);
    } else if (task.type === "system") {
      const c = SYSTEM_STATIONS.find((c) => c.id === task.id);
      if (c && dist(point, c) <= 3)
        changed = maintainSystem(s, p.role, dt, c.id);
    } else if (task.type === "scan" && s.phase === "surface") {
      const f = this.science.flags.find((f) => String(f.id) === task.id),
        w = this.world(p);
      if (f) {
        const support = this.participants.some(
          (q) =>
            q.team === p.team && q.role === 1 && dist(this.world(q), w) < 6,
        );
        const distance = dist(w, { x: f.position[0], z: f.position[2] });
        const desired = Math.atan2(f.position[0] - w.x, -(f.position[2] - w.z));
        const aligned =
          Math.abs(
            Math.atan2(Math.sin(desired - p.aim), Math.cos(desired - p.aim)),
          ) < 0.45;
        changed = scanFlag(
          this.science,
          f.id,
          p.team,
          p.role,
          dt,
          distance,
          aligned,
          support||s.scanBoost>0,
        );
        if (f.state === "carried" && f.owner === p.team && f.carrier === p.role)
          p.carry = f.id;
      }
    }
    if (changed) p.contribution += dt;
  }
  fire(p) {
    const s = this.missions[p.team];
    if(s.phase==='surface'){fireSurface(this,p);return;}
    if(p.hp<=0||s.phase!=='flight'||p.role!==2||this.time-p.lastFire<(s.overdrive>0?.12:.24))return;
    p.lastFire=this.time;
    const d={x:Math.sin(p.aim),z:-Math.cos(p.aim)},base=spaceBaseFor(p.team),origin={x:base.x+s.shipMotion.x,z:base.z+s.shipMotion.z};
    recordCombat(this,{type:'turret-shot',attacker:p.id,origin:[origin.x,3.6,origin.z],direction:[d.x,0,d.z]});
    let hit=null;
    const consider=(x,z,radius,kind,target)=>{const dx=x-origin.x,dz=z-origin.z,along=dx*d.x+dz*d.z,side=Math.abs(dx*d.z-dz*d.x);if(along>0&&along<140&&side<radius&&(!hit||along<hit.distance))hit={distance:along,kind,target};};
    for(const h of s.hazards)if(h.hp>0)consider(base.x+h.x,base.z+h.z,2.5,'hazard',h);
    for(const team of this.activeTeams){if(team===p.team)continue;const enemy=this.missions[team];if(enemy.phase!=='flight'||enemy.finished)continue;const b=spaceBaseFor(team);consider(b.x+enemy.shipMotion.x,b.z+enemy.shipMotion.z,3.5,'ship',enemy);}
    if(hit?.kind==='hazard'){hit.target.hp-=40;p.contribution++;}
    if(hit?.kind==='ship'){const enemy=hit.target,damage=enemy.shield>0?0:enemy.decoy>0?.5:2;enemy.hull=Math.max(0,enemy.hull-damage);p.contribution+=damage/4;recordCombat(this,{type:'ship-hit',attacker:p.id,damage});}
    return;
    if(s.phase==='surface')fireSurface(this,p);
  }

  tick(dt = 0.05) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.050001)
      throw Error("Invalid fixed timestep");
    this.time += dt;
    this.tickNumber++;
    if (this.phase !== "expedition") return;
    this.phaseLeft = Math.max(0, this.phaseLeft - dt);
    this.science.time += dt;
    const before = this.missions.map((s) => s.phase);
    for (const p of this.players.values()) {
      const s = this.missions[p.team];
      if (!p.connected || s.finished || this.science.teams[p.team].eliminated)
        continue;
      if (p.reviveAt) {
        if (p.reviveAt > this.time) continue;
        p.reviveAt = 0;
        p.hp = 100;p.vitals=createVitals();
        this.spawn(p);
      }
      // A stale packet releases the held tool, but keeps its selected target.
      // Fresh held input can resume after a slow render frame; no work advances while stale.
      const stale=this.time-p.lastInputAt>.5;
      if(stale){p.input=neutral();p.firePressed=false;p.jumpPressed=false;}
      const {strafe,forward,buttons}=p.input,len=Math.max(1,Math.hypot(strafe,forward));
      if(s.phase==='flight'&&p.role===0){s.shipMotion.x=clamp(s.shipMotion.x+strafe/len*dt*(s.boost>0?14:9),-17,17);s.shipMotion.z=clamp(s.shipMotion.z+forward/len*dt*(s.boost>0?14:9),-7,14);}
      else advanceOperator(this,p,dt,stale);
      this.work(p, dt);
      if ((buttons & 1)||p.firePressed) this.fire(p);p.firePressed=false;p.jumpPressed=false;
    }
    tickOrdnance(this,dt);
    for (const team of this.activeTeams) {
      const s = this.missions[team],
        t = this.science.teams[team];
      s.selected = -1;
      if(s.phase!=='flight'&&!s.finished){for(let i=0;i<4;i++){s.abilityCD[i]=Math.max(0,s.abilityCD[i]-dt);s.altCD[i]=Math.max(0,s.altCD[i]-dt);s.ultimate[i]=Math.min(100,s.ultimate[i]+dt*.8);}for(const k of ['shield','boost','decoy','scanBoost','overdrive'])s[k]=Math.max(0,s[k]-dt);}
      if (s.phase === "flight" && !s.finished) {
        tickSystems(s, dt, team,[spaceBaseFor(team).x+s.shipMotion.x,2,s.shipMotion.z],'space');
        s.hazardClock -= dt;
        if (s.hazardClock <= 0) {
          s.hazardClock = 8;
          s.hazards.push({
            id: this.tickNumber,
            x: Math.sin(s.seed + this.tickNumber) * 14,
            z: -90,
            hp: 80,
          });
        }
        for (const h of s.hazards) {
          h.z += dt * 14;
          if (
            h.hp > 0 &&
            Math.hypot(h.x - s.shipMotion.x, h.z - s.shipMotion.z) < 3.8
          ) {
            s.hull = Math.max(0, s.hull - (s.shield>0?0:s.decoy>0?3:12));
            h.hp = 0;
          }
        }
        s.hazards = s.hazards.filter((h) => h.hp > 0 && h.z < 25);
        const duration =
          s.flightLeg === "return"
            ? Math.max(20, (s.route?.duration || 100) * 0.55)
            : s.route?.duration || 100;
        if (s.hull <= 0) {
          eliminateCrew(
            this.science,
            team,
            [baseFor(team).x, 0, baseFor(team).z],
            "B",
          );
          s.phase = "spectator";
          s.finished = true;
        } else if (s.flightTime >= duration) {
          s.phase = s.flightLeg === "return" ? "delivery" : "surface";
          t.planet = s.phase === "surface" ? "B" : "A";
          t.phase = s.phase === "delivery" ? "docked" : "surface";
        }
      }
      if (before[team] !== s.phase) {
        this.stage(team);
      }
      t.capacity = s.cargoCapacity;
      t.hull = s.hull * 20;
      // Installation may add a collider around a stationary crew member. Recover once to its nearest free edge.
      if (s.phase === "assembly")
        for (const p of this.players.values())
          if (p.team === team) {
            const c = this.colliders(p);
            if (blocked(p.x, p.z, c.boxes, c.circles)) {
              const q = recoverPlanar(p.x, p.z, c.boxes, c.circles);
              p.x = q.x;
              p.z = q.z;
            }
          }
    }
    if (!conservation(this.science))
      throw Error("Science conservation violated");
    if (
      this.phaseLeft === 0 ||
      this.activeTeams.every((t) => this.missions[t].finished)
    )
      this.finish();
  }
  finish() {
    if (this.settled) return;
    this.settled = true;
    this.phase = "results";
    this.phaseLeft = 0;
    const scores = this.science.teams.map((t) => t.delivered),
      max = Math.max(...scores),
      leaders = scores
        .map((n, i) => (n === max ? i : -1))
        .filter((i) => i >= 0);
    this.winner = max > 0 && leaders.length === 1 ? leaders[0] : null;
    this.onComplete?.(this);
    this.sendEvent(
      "Mission complete. Only delivered science determines the winner.",
    );
  }
  snapshot() {
    const base = super.snapshot();
    return {
      ...base,
      mode: "expedition",
      combatEvents:(this.combatEvents||[]).map(e=>({...e})),grenades:(this.grenades||[]).map(g=>({id:g.id,team:g.team,pos:[...g.pos]})),
      matchId: this.matchId,
      activeTeams: [...this.activeTeams],
      teams: this.science.teams.map((t, i) => ({
        team: i,
        name: t.name,
        color: t.color,
        delivered: t.delivered,
        cargo: flagCounts(this.science, i).onboard,
        hull: this.missions[i].hull,
        eliminated: t.eliminated,
      })),
      players: base.players.map((p) => ({
        ...p,...operatorSnapshot(this.players.get(p.id)),
        carry:
          this.science.flags.find(
            (f) =>
              f.state === "carried" &&
              f.owner === p.team &&
              f.carrier === p.role,
          )?.id ?? null,
        commandSeq: this.players.get(p.id).commandSeq,working:!!(this.players.get(p.id).task&&(this.players.get(p.id).input.buttons&4)),crouch:!!this.players.get(p.id).input.crouch,
        cosmetic: this.players.get(p.id).cosmetic || "Cadet",
        contribution: Math.floor(this.players.get(p.id).contribution),
      })),
      missions: this.missions.map((s) => ({
        phase: s.phase,
        finished: s.finished,
        parts: s.parts.map((p) => ({
          id: p.id,
          owner: p.owner,
          stage: p.stage,
          purchased: p.purchased,
          bolts: p.bolts.map((n) => (n >= 1 ? 1 : Math.floor(n * 1000) / 1000)),
        })),
        carry: [...s.carry],
        rotation: [...s.rotation],
        cargo: s.cargo.map((c) => ({ id: c.id, stowed: c.stowed })),
        checks: { ...s.checks },
        checkReadings: { ...s.checkReadings },
        credits: s.credits,
        upgrades: [...s.upgrades],
        cargoCapacity: s.cargoCapacity,
        flightLeg: s.flightLeg,
        flightTime: s.flightTime,
        route: s.route,
        shipMotion: { ...s.shipMotion },
        hazards: s.hazards.map((h) => ({ ...h })),
        hull: s.hull,
        power: s.power,
        powerCapacity: s.powerCapacity,
        temperature: s.temperature,
        pressure: s.pressure,
        co2: s.co2,
        propellant: s.propellant,
        wetMass: s.wetMass,
        extraLoad: s.extraLoad,
        fault: s.fault,panels:structuredClone(s.panels),spares:s.spares,oxygenSuit:s.oxygenSuit,abilityCD:[...s.abilityCD],altCD:[...s.altCD],ultimate:[...s.ultimate],shield:s.shield,boost:s.boost,decoy:s.decoy,
      })),
      flags: this.science.flags.map((f) => ({
        ...f,
        position: [...f.position],
      })),
      sites: [],
    };
  }
  exportState() {
    return {
      combatEvents:this.combatEvents,combatSerial:this.combatSerial,grenades:this.grenades,
      code: this.code,
      matchId: this.matchId,
      windowSeconds: this.windowSeconds,
      activeTeams: this.activeTeams,
      phase: this.phase,
      phaseLeft: this.phaseLeft,
      time: this.time,
      tickNumber: this.tickNumber,
      winner: this.winner,
      settled: this.settled,rewardStatus:this.rewardStatus,
      events: this.events,
      science: this.science,
      missions: this.missions.map(({ match, teams, ...s }) => s),
      players: [...this.players.values()],
    };
  }
  static restore(data, options = {}) {
    const room = new ExpeditionMatch({
      ...options,
      code: data.code,
      windowSeconds: data.windowSeconds,
    });
    for (const k of [
      "combatEvents","combatSerial","grenades",
      "matchId",
      "activeTeams",
      "phase",
      "phaseLeft",
      "time",
      "tickNumber",
      "winner",
      "settled",
      "events",
      "science",
    ])
      room[k] = data[k];
    room.missions = data.missions.map((s) => ({
      ...s,
      match: room.science,
      teams: room.science.teams,
    }));
    for (const raw of data.players) {
      const p = {
        ...raw,
        connected: false,
        expireAt: Date.now() + 60000,
        input: neutral(),
        task: null,
      };
      ensureOperator(p);clearMotor(p.motor);p.firePressed=p.jumpPressed=false;p.suit.vx=p.suit.vy=p.suit.vz=0;
      room.players.set(p.id, p);
      room.tokens.set(p.token, p.id);
    }
    return room;
  }
}

import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
// Local durable progression, exactly-once match payouts and recoverable room sessions.
// Mount DATA_DIR on persistent storage in production. Guest keys are bearer credentials.
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const hash = (x) => createHash("sha256").update(x).digest("hex");
export class ProgressionStore {
  constructor(path = ":memory:") {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,xp INTEGER NOT NULL DEFAULT 0,credits INTEGER NOT NULL DEFAULT 0,matches INTEGER NOT NULL DEFAULT 0,cosmetic TEXT NOT NULL DEFAULT 'Cadet');
   CREATE TABLE IF NOT EXISTS rewards(profile_id TEXT NOT NULL,match_id TEXT NOT NULL,xp INTEGER NOT NULL,credits INTEGER NOT NULL,PRIMARY KEY(profile_id,match_id));
   CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY,state TEXT NOT NULL,saved_at INTEGER NOT NULL);`);
    this.migrateAccounts();
  }
  migrateAccounts(){
    const columns=this.db.prepare('PRAGMA table_info(profiles)').all().map(c=>c.name);
    for(const [name,type]of[['username','TEXT'],['password_salt','TEXT'],['password_hash','TEXT'],['recovery_hash','TEXT']])if(!columns.includes(name))this.db.exec(`ALTER TABLE profiles ADD COLUMN ${name} ${type}`);
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS unique_username ON profiles(username);CREATE TABLE IF NOT EXISTS account_sessions(token_hash TEXT PRIMARY KEY,profile_id TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);`);
  }
  authenticate(token){
    if(typeof token!=='string'||token.length!==43)return null;const digest=hash(token);
    const session=this.db.prepare('SELECT profiles.* FROM profiles JOIN account_sessions ON profiles.id=account_sessions.profile_id WHERE account_sessions.token_hash=? AND account_sessions.expires_at>?').get(digest,Date.now());
    if(session)return this.view(session);const guest=this.db.prepare('SELECT * FROM profiles WHERE token_hash=? AND username IS NULL').get(digest);return this.view(guest);
  }
  newSession(id){
    const token=randomBytes(32).toString('base64url');this.db.prepare('DELETE FROM account_sessions WHERE expires_at<=?').run(Date.now());
    this.db.prepare('INSERT INTO account_sessions(token_hash,profile_id,expires_at,created_at) VALUES(?,?,?,?)').run(hash(token),id,Date.now()+30*86400000,Date.now());
    const older=this.db.prepare('SELECT token_hash FROM account_sessions WHERE profile_id=? ORDER BY created_at DESC LIMIT -1 OFFSET 10').all(id);for(const row of older)this.db.prepare('DELETE FROM account_sessions WHERE token_hash=?').run(row.token_hash);
    return token;
  }
  async register(token,username,password){
    const name=String(username||'').trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(name))throw Error('Use 3–24 letters, numbers or underscores');if(typeof password!=='string'||password.length<10||password.length>128)throw Error('Password must contain 10–128 characters');
    const existing=this.authenticate(token);if(existing?.registered)throw Error('This profile already has an account');
    const identity=existing?{profile:existing}:this.identity(),salt=randomBytes(16).toString('hex'),digest=Buffer.from(await scrypt(password,salt,32)).toString('hex'),recoveryCode=randomBytes(32).toString('base64url');
    this.db.exec('BEGIN IMMEDIATE');try{const changed=this.db.prepare('UPDATE profiles SET username=?,password_salt=?,password_hash=?,recovery_hash=?,token_hash=? WHERE id=? AND username IS NULL').run(name,salt,digest,hash(recoveryCode),hash(randomBytes(32).toString('base64url')),identity.profile.id);if(!changed.changes)throw Error('This profile already has an account');const profileToken=this.newSession(identity.profile.id);this.db.exec('COMMIT');return {profile:this.get(identity.profile.id),profileToken,recoveryCode};}catch(e){this.db.exec('ROLLBACK');if(e.message.includes('UNIQUE'))throw Error('That account name is already taken');throw e;}
  }
  async login(username,password){
    const name=String(username||'').trim().toLowerCase(),row=this.db.prepare('SELECT * FROM profiles WHERE username=?').get(name),salt=row?.password_salt||'invalid-account-salt';
    if(typeof password!=='string'||password.length>128)throw Error('Invalid account name or password');const candidate=Buffer.from(await scrypt(password,salt,32)),expected=row?Buffer.from(row.password_hash,'hex'):Buffer.alloc(32);if(!row||!timingSafeEqual(candidate,expected))throw Error('Invalid account name or password');
    const fresh=this.db.prepare('SELECT * FROM profiles WHERE id=?').get(row.id);if(fresh.password_hash!==row.password_hash)throw Error('Credentials changed; sign in again');return {profile:this.view(fresh),profileToken:this.newSession(row.id)};
  }
  async recoverAccount(username,recoveryCode,password){
    const row=this.db.prepare('SELECT * FROM profiles WHERE username=?').get(String(username||'').trim().toLowerCase());
    if(typeof recoveryCode!=='string'||recoveryCode.length!==43||!row?.recovery_hash||!timingSafeEqual(Buffer.from(hash(recoveryCode),'hex'),Buffer.from(row.recovery_hash,'hex')))throw Error('Invalid account name or recovery key');
    if(typeof password!=='string'||password.length<10||password.length>128)throw Error('Password must contain 10–128 characters');
    const salt=randomBytes(16).toString('hex'),digest=Buffer.from(await scrypt(password,salt,32)).toString('hex'),next=randomBytes(32).toString('base64url');
    this.db.exec('BEGIN IMMEDIATE');try{const changed=this.db.prepare('UPDATE profiles SET password_salt=?,password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?').run(salt,digest,hash(next),row.id,row.recovery_hash);if(!changed.changes)throw Error('Recovery key already used');this.db.prepare('DELETE FROM account_sessions WHERE profile_id=?').run(row.id);const profileToken=this.newSession(row.id);this.db.exec('COMMIT');return {profile:this.get(row.id),profileToken,recoveryCode:next};}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  logout(token){if(typeof token==='string')this.db.prepare('DELETE FROM account_sessions WHERE token_hash=?').run(hash(token));return true;}
  view(row) {
    if (!row) return null;
    return {
      id: row.id,username:row.username||null,registered:!!row.username,
      xp: row.xp,
      credits: row.credits,
      matches: row.matches,
      cosmetic: row.cosmetic,
      unlocks: [
        "Cadet",
        ...(row.xp >= 250 ? ["Pathfinder"] : []),
        ...(row.xp >= 750 ? ["Vanguard"] : []),
      ],
    };
  }
  get(id) {
    return this.view(
      this.db.prepare("SELECT * FROM profiles WHERE id=?").get(id),
    );
  }
  identity(token) {
    const profile=this.authenticate(token);if(profile)return {profile,token};
    const next = randomBytes(32).toString("base64url"),
      id = randomUUID();
    this.db
      .prepare("INSERT INTO profiles(id,token_hash) VALUES(?,?)")
      .run(id, hash(next));
    return { profile: this.get(id), token: next };
  }
  settle(room) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const p of room.players.values()) {
        if (!p.profileId || p.contribution < 1) continue;
        const delivered = room.science.teams[p.team].delivered,
          xp = 50 + delivered * 40 + Math.min(100, Math.floor(p.contribution)),
          credits = 25 + delivered * 25;
        const inserted = this.db
          .prepare(
            "INSERT OR IGNORE INTO rewards(profile_id,match_id,xp,credits) VALUES(?,?,?,?)",
          )
          .run(p.profileId, room.matchId, xp, credits);
        if (inserted.changes)
          this.db
            .prepare(
              "UPDATE profiles SET xp=xp+?,credits=credits+?,matches=matches+1 WHERE id=?",
            )
            .run(xp, credits, p.profileId);
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  equip(id, cosmetic) {
    const p = this.get(id);
    if (!p?.unlocks.includes(cosmetic)) return false;
    this.db
      .prepare("UPDATE profiles SET cosmetic=? WHERE id=?")
      .run(cosmetic, id);
    return true;
  }
  save(room) {
    this.db
      .prepare(
        "INSERT INTO rooms(code,state,saved_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET state=excluded.state,saved_at=excluded.saved_at",
      )
      .run(room.code, JSON.stringify(room.exportState()), Date.now());
  }
  removeRoom(code) {
    this.db.prepare("DELETE FROM rooms WHERE code=?").run(code);
  }
  recover() {
    return this.db
      .prepare("SELECT state FROM rooms WHERE saved_at>?")
      .all(Date.now() - 120000)
      .map((r) => JSON.parse(r.state));
  }
  close() {
    this.db.close();
  }
}

// Web Crypto random helpers shared by the Node server and the in-browser offline match.
const c = globalThis.crypto;
export const randomUUID = () => c.randomUUID();
const toHex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
const toB64url = b => { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export function randomBytes(n) { const b = c.getRandomValues(new Uint8Array(n)); return {toString: enc => (enc === 'hex' ? toHex(b) : enc === 'base64url' ? toB64url(b) : toHex(b))}; }

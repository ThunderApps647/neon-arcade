'use strict';
/*
 * NEON ARCADE - zero-dependency multiplayer arcade server (Node 18+)
 * Serves the 3D client from ./public and runs the shared game world over WebSockets.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

// ------------------------------------------------------------------ config
// All money is in cents.
const CFG = {
  startCredits: 2000,
  refillAmount: 1000,
  refillBelow: 100,
  refillCooldownMs: 90 * 1000,
  price: { pusher: 25, claw: 100, key: 200, stacker: 100, wheel: 100 },
  pusherCoinTickets: 2,
  pusherGoldTickets: 30,
  pusherBonusChance: 1 / 16,
  pusherIdleMs: 15000,
  clawChance: [0.5, 0.28, 0.1], // by grab accuracy: dead-center, close, edge
  keyChance: 0.25,
};

// ------------------------------------------------------------------ items
const ITEMS = {};
const def = (id, name, color, extra = {}) => ((ITEMS[id] = { id, name, color, ...extra }), id);
const ensure = (id, name, color) => (ITEMS[id] ? id : def(id, name, color));

const CATALOG = [
  ['sticker', 'Holo Sticker', '#9be7ff', 10],
  ['candy', 'Candy Rope', '#ff5fa2', 25],
  ['ball', 'Bouncy Ball', '#ffe03d', 50],
  ['slime', 'Glow Slime', '#7dff5a', 100],
  ['yoyo', 'Light-up Yo-yo', '#3df2ff', 200],
  ['plush_s', 'Mini Plush', '#f5b8d2', 350],
  ['shades', 'Neon Shades', '#ff3db8', 600],
  ['blaster', 'Foam Blaster', '#ff8a3d', 1000],
  ['plush_l', 'Giant Plush', '#c8874a', 2000],
  ['speaker', 'BT Speaker', '#2a7fff', 3500],
  ['headphones', 'Headphones', '#e0e0e0', 5000],
  ['console', 'Game Console', '#ff2030', 10000],
].map(([id, name, color, cost]) => def(id, name, color, { cost }));

const CLAW_POOL = [
  ['plush_bear', 'Bear Plush', '#c8874a'],
  ['plush_bunny', 'Bunny Plush', '#f5b8d2'],
  ['plush_alien', 'Alien Plush', '#7dff5a'],
  ['plush_duck', 'Duck Plush', '#ffe03d'],
  ['plush_shark', 'Shark Plush', '#6aa8ff'],
  ['plush_cat', 'Cat Plush', '#b07cff'],
  ['plush_frog', 'Frog Plush', '#39c46b'],
].map(([i, n, c]) => def(i, n, c, { plush: true }));

const KEY_POOL = [
  ensure('giftcard', '$50 Gift Card', '#3dff9e'),
  ensure('watch', 'Smartwatch', '#ff8a3d'),
  ensure('drone', 'Mini Drone', '#b07cff'),
  ensure('tablet', 'Tablet', '#ffffff'),
  ensure('vr', 'VR Headset', '#ff3db8'),
  'headphones', 'speaker', 'console',
];
const STACK_MINOR = ['speaker', 'giftcard', 'watch', 'drone'];
const STACK_MAJOR = ['console', 'tablet', 'vr'];

const WHEEL = [5, 10, 25, 5, 50, 10, 100, 5, 15, 10, 250, 5, 20, 10, 500, 15];
const WHEEL_W = { 5: 10, 10: 8, 15: 6, 20: 5, 25: 4, 50: 2.2, 100: 1, 250: 0.35, 500: 0.12 };

// ------------------------------------------------------------------ world layout
const PI = Math.PI;
const MACHINES = [
  { id: 'pusher1', type: 'pusher', name: "Mermaid's Space Pusher", x: -8.6, z: -10.1, ry: 0, color: '#ff3db8' },
  { id: 'pusher2', type: 'pusher', name: 'Galaxy Coin Pusher', x: -5.3, z: -10.1, ry: 0, color: '#3df2ff' },
  { id: 'claw1', type: 'claw', name: 'Claw Mania', x: -2.5, z: -10.9, ry: 0, color: '#39ff6a' },
  { id: 'claw2', type: 'claw', name: 'Plush Grabber', x: -0.6, z: -10.9, ry: 0, color: '#ffe03d' },
  { id: 'claw3', type: 'claw', name: 'Alien Claw', x: 1.3, z: -10.9, ry: 0, color: '#b07cff' },
  { id: 'key1', type: 'key', name: 'Key Master', x: 3.4, z: -11.2, ry: 0, color: '#2a7fff' },
  { id: 'stack1', type: 'stacker', name: 'Stackem Up', x: 5.4, z: -11.2, ry: 0, color: '#ff2030' },
  { id: 'claw4', type: 'claw', name: 'Claw Mania XL', x: 8.0, z: -10.9, ry: 0, color: '#ff8a3d' },
  { id: 'wheel1', type: 'wheel', name: 'Big Bass Wheel', x: 10.9, z: -5.2, ry: -PI / 2, color: '#27c46b' },
  { id: 'key2', type: 'key', name: 'Key Master Gold', x: 11.2, z: -1.6, ry: -PI / 2, color: '#ffb000' },
  { id: 'stack2', type: 'stacker', name: 'Stackem Up', x: 11.2, z: 0.6, ry: -PI / 2, color: '#ff2030' },
  { id: 'pusher3', type: 'pusher', name: 'Treasure Pusher', x: -10.1, z: -3.6, ry: PI / 2, color: '#ffb000' },
  { id: 'change1', type: 'change', name: 'Change Machine', x: -11.4, z: 1.2, ry: PI / 2, color: '#3dff9e' },
  { id: 'counter', type: 'counter', name: 'Prize Counter', x: 0, z: 10.8, ry: PI, color: '#ff3db8' },
];
const SHARED_TYPES = new Set(['counter', 'change']);
const byId = Object.fromEntries(MACHINES.map((m) => [m.id, m]));

// ------------------------------------------------------------------ persistence
let db = { players: {} };
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!db.players) db.players = {};
} catch { /* fresh start */ }
let dirty = false;
function save(sync = false) {
  if (!dirty) return;
  dirty = false;
  const data = JSON.stringify(db);
  if (sync) { try { fs.writeFileSync(DATA_FILE, data); } catch (e) { console.error(e); } return; }
  fs.writeFile(DATA_FILE + '.tmp', data, (err) => {
    if (err) return console.error('save failed', err.message);
    fs.rename(DATA_FILE + '.tmp', DATA_FILE, () => {});
  });
}
setInterval(save, 5000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { dirty = true; save(true); process.exit(0); });

// ------------------------------------------------------------------ helpers
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// ------------------------------------------------------------------ minimal WebSocket (RFC 6455)
class WS {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.frags = []; this.open = true;
    sock.on('data', (d) => this.onData(d));
    sock.on('close', () => this.close());
    sock.on('error', () => this.close());
  }
  onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.open) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = b0 & 0x80, op = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 64 * 1024) return this.close();
      const maskOff = off; if (masked) off += 4;
      if (this.buf.length < off + len) return;
      let payload = Buffer.from(this.buf.subarray(off, off + len));
      if (masked) { const mk = this.buf.subarray(maskOff, maskOff + 4); for (let i = 0; i < payload.length; i++) payload[i] ^= mk[i & 3]; }
      this.buf = this.buf.subarray(off + len);
      if (op === 8) return this.close();
      if (op === 9) { this.frame(10, payload); continue; }
      if (op === 10) continue;
      this.frags.push(payload);
      if (fin) { const msg = Buffer.concat(this.frags).toString('utf8'); this.frags = []; if (this.onmessage) this.onmessage(msg); }
    }
  }
  frame(op, data) {
    if (!this.open) return;
    if (this.sock.writableLength > 2 * 1024 * 1024) return this.close(); // too slow, drop
    const len = data.length; let h;
    if (len < 126) h = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
    try { this.sock.write(Buffer.concat([h, data])); } catch { this.close(); }
  }
  sendRaw(str) { this.frame(1, Buffer.from(str)); }
  send(obj) { this.sendRaw(JSON.stringify(obj)); }
  close() {
    if (!this.open) return; this.open = false;
    try { this.sock.end(Buffer.from([0x88, 0])); } catch {}
    setTimeout(() => this.sock.destroy(), 200);
    if (this.onclose) this.onclose();
  }
}

// ------------------------------------------------------------------ connections
const conns = new Map(); // id -> conn
let nextConnId = 1;
function broadcast(obj, except) {
  const s = JSON.stringify(obj);
  for (const c of conns.values()) if (c !== except && c.prof) c.ws.sendRaw(s);
}
const announce = (text, kind = 'win') => broadcast({ t: 'ann', text, kind });

function meView(p) { return { name: p.name, color: p.color, credits: p.credits, tickets: p.tickets, total: p.total, inv: p.inv }; }
function sendMe(c) { c.ws.send({ t: 'me', me: meView(c.prof) }); dirty = true; }
let lbDirty = true;
function addTickets(c, n, src) {
  if (!n) return;
  c.prof.tickets += n; c.prof.total += n; lbDirty = true;
  c.ws.send({ t: 'tk', n, src }); sendMe(c);
}
function giveItem(c, id) { c.prof.inv[id] = (c.prof.inv[id] || 0) + 1; sendMe(c); }
function charge(c, cents) {
  if (c.prof.credits < cents) { c.ws.send({ t: 'err', text: 'Not enough credits. Visit the Change Machine!' }); return false; }
  c.prof.credits -= cents; sendMe(c); return true;
}

// ------------------------------------------------------------------ coin pusher physics (2D, top-down, server authoritative)
const PF = { HW: 1.0, FRONT: 0.95, GAP_Z: 0.55, R: 0.11, GR: 0.14, PZ0: -1.05, STROKE: 0.3, SPEED: 1.7 };
const pzAt = (t) => PF.PZ0 + PF.STROKE * (0.5 - 0.5 * Math.cos(t * PF.SPEED));
const BONUSES = [
  { label: '+5 COINS', coins: 5, w: 30 },
  { label: '+10 COINS', coins: 10, w: 18 },
  { label: 'GOLD TOKEN', gold: 1, w: 18 },
  { label: '+25 TICKETS', tickets: 25, w: 18 },
  { label: 'PAYLOAD! +25 COINS', coins: 25, w: 6 },
  { label: 'JACKPOT 250 TICKETS', tickets: 250, w: 1 },
];
function weighted(list, wf) { let t = 0; for (const x of list) t += wf(x); let r = Math.random() * t; for (const x of list) { r -= wf(x); if (r <= 0) return x; } return list[list.length - 1]; }

function addCoin(st, x, z, y, kind) {
  const c = { id: st.nextId++, x, z, y, vy: 0, kind, r: kind ? PF.GR : PF.R };
  st.coins.push(c); return c;
}
function fillPusher(st, n, gold = 0) {
  let tries = 0;
  while ((n > 0 || gold > 0) && tries++ < 6000) {
    const isGold = gold > 0 && (n === 0 || Math.random() < 0.3);
    const r = isGold ? PF.GR : PF.R;
    const x = rand(-PF.HW + r, PF.HW - r), z = rand(-0.65, PF.FRONT - 0.18);
    if (st.coins.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + r - 0.02) ** 2)) continue;
    addCoin(st, x, z, 0, isGold ? 1 : 0);
    if (isGold) gold--; else n--;
  }
}
function initPusher(m) {
  m.st = { coins: [], nextId: 1, t: 0, pz: PF.PZ0, lastDrop: 0, removed: [], pending: [], lastP: null };
  fillPusher(m.st, 58, 3);
}
function constrain(c, pz) {
  const minZ = pz + c.r; if (c.z < minZ) c.z = minZ;
  if (c.z < PF.GAP_Z) { const lim = PF.HW - c.r; if (c.x > lim) c.x = lim; else if (c.x < -lim) c.x = -lim; }
}
function stepPusher(m, dt, now) {
  const st = m.st;
  if (m.occupant && now - st.lastDrop < CFG.pusherIdleMs) st.t += dt;
  st.pz = pzAt(st.t);
  // scheduled bonus coins
  if (st.pending.length) {
    st.pending = st.pending.filter((p) => {
      if (now < p.at) return true;
      addCoin(st, p.x, st.pz + PF.R + rand(0.02, 0.45), rand(0.8, 1.1), p.kind); return false;
    });
  }
  const live = [];
  for (const c of st.coins) {
    if (c.y > 0) { c.vy -= 9.8 * dt; c.y = Math.max(0, c.y + c.vy * dt); if (c.y === 0) c.vy = 0; }
    if (c.y < 0.04) live.push(c);
  }
  const n = live.length;
  for (let it = 0; it < 5; it++) {
    for (let i = 0; i < n; i++) constrain(live[i], st.pz);
    for (let i = 0; i < n; i++) {
      const a = live[i];
      for (let j = i + 1; j < n; j++) {
        const b = live[j];
        const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r;
        if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
        const d2 = dx * dx + dz * dz; if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4, ov = (rr - d) * 0.5;
        const nx = d2 ? dx / d : 1, nz = d2 ? dz / d : 0;
        a.x -= nx * ov; a.z -= nz * ov; b.x += nx * ov; b.z += nz * ov;
      }
    }
  }
  for (let i = 0; i < n; i++) constrain(live[i], st.pz);
  // falls
  const occ = m.occupant ? conns.get(m.occupant) : null;
  let tix = 0;
  st.coins = st.coins.filter((c) => {
    if (c.z > PF.FRONT) { st.removed.push(c.id, 1); tix += c.kind ? CFG.pusherGoldTickets : CFG.pusherCoinTickets; return false; }
    if (Math.abs(c.x) > PF.HW + 0.02) { st.removed.push(c.id, 2); return false; }
    return true;
  });
  if (tix && occ) addTickets(occ, tix, m.id);
  // house restock when quiet
  if (!m.occupant && st.coins.length < 40 && Math.random() < 0.02) fillPusher(st, 12, st.coins.some((c) => c.kind) ? 0 : 1);
}
function pusherSnapshot(m) {
  const c = [];
  for (const k of m.st.coins) c.push(k.id, Math.round(k.x * 1000), Math.round(k.z * 1000), Math.round(k.y * 1000), k.kind);
  return { t: 'pfull', m: m.id, p: Math.round(m.st.pz * 1000), c };
}
function pusherDelta(m) {
  const st = m.st, u = [];
  for (const k of st.coins) {
    const x = Math.round(k.x * 1000), z = Math.round(k.z * 1000), y = Math.round(k.y * 1000);
    if (k.sx === undefined || Math.abs(k.sx - x) > 2 || Math.abs(k.sz - z) > 2 || k.sy !== y) {
      k.sx = x; k.sz = z; k.sy = y; u.push(k.id, x, z, y, k.kind);
    }
  }
  const p = Math.round(st.pz * 1000);
  if (!u.length && !st.removed.length && p === st.lastP) return;
  const msg = { t: 'pz', m: m.id, p };
  if (u.length) msg.u = u;
  if (st.removed.length) { msg.r = st.removed; st.removed = []; }
  st.lastP = p;
  broadcast(msg);
}
function pusherDrop(c, m, x) {
  const st = m.st, now = Date.now();
  if (now - (c.lastDrop || 0) < 220) return;
  if (st.coins.length > 220) return c.ws.send({ t: 'err', text: 'Machine is full, let it push!' });
  if (!charge(c, CFG.price.pusher)) return;
  c.lastDrop = now; st.lastDrop = now;
  x = Math.max(-0.86, Math.min(0.86, num(x)));
  addCoin(st, x, st.pz + PF.R + rand(0.02, 0.12), 0.9, 0);
  if (Math.random() < CFG.pusherBonusChance) {
    const b = weighted(BONUSES, (q) => q.w);
    broadcast({ t: 'bonus', m: m.id, label: b.label, by: c.prof.name });
    if (b.coins) for (let i = 0; i < b.coins; i++) st.pending.push({ at: now + 900 + i * 140, x: rand(-0.85, 0.85), kind: 0 });
    if (b.gold) st.pending.push({ at: now + 900, x: rand(-0.6, 0.6), kind: 1 });
    if (b.tickets) setTimeout(() => { if (c.ws.open) addTickets(c, b.tickets, m.id); }, 1200);
    if (b.tickets >= 250 || b.coins >= 25) announce(`${c.prof.name} hit ${b.label} on ${m.name}!`);
  }
}

// ------------------------------------------------------------------ other machines
function restockClaw(m, target = 11) {
  const st = m.st;
  let tries = 0;
  while (st.prizes.length < target && tries++ < 500) {
    const x = rand(-0.58, 0.58), z = rand(-0.52, 0.4);
    if (x < -0.3 && z > 0.2) continue; // keep chute clear
    if (st.prizes.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 0.21 ** 2)) continue;
    st.prizes.push({ pid: st.nextId++, item: pick(CLAW_POOL), x: +x.toFixed(3), z: +z.toFixed(3), r: +rand(0, 6.28).toFixed(2) });
  }
}
function restockKeys(m, max = 9) {
  const empty = m.st.slots.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
  let filled = 15 - empty.length;
  while (filled < max && empty.length) { const i = empty.splice(Math.floor(Math.random() * empty.length), 1)[0]; m.st.slots[i] = pick(KEY_POOL); filled++; }
}
for (const m of MACHINES) {
  m.occupant = null;
  if (m.type === 'pusher') initPusher(m);
  if (m.type === 'claw') { m.st = { prizes: [], nextId: 1 }; restockClaw(m); }
  if (m.type === 'key') { m.st = { slots: Array(15).fill(null) }; restockKeys(m); }
}
function machineView(m) {
  const v = { id: m.id, type: m.type, name: m.name, x: m.x, z: m.z, ry: m.ry, color: m.color, occupant: m.occupant, price: CFG.price[m.type] || 0 };
  if (m.type === 'claw') v.prizes = m.st.prizes;
  if (m.type === 'key') v.slots = m.st.slots;
  return v;
}

// ------------------------------------------------------------------ message handlers
function hello(c, msg) {
  if (c.prof) return;
  let token = typeof msg.token === 'string' && /^[a-zA-Z0-9]{8,64}$/.test(msg.token) ? msg.token : crypto.randomBytes(16).toString('hex');
  for (const o of conns.values()) if (o.token === token && o !== c) { o.ws.send({ t: 'err', text: 'Signed in from another tab.' }); o.ws.close(); }
  const name = clean(msg.name, 16) || 'Player' + c.id;
  const color = /^#[0-9a-fA-F]{6}$/.test(msg.color || '') ? msg.color : '#3df2ff';
  const prof = db.players[token] || (db.players[token] = { credits: CFG.startCredits, tickets: 0, total: 0, inv: {}, lastRefill: 0, created: Date.now() });
  prof.name = name; prof.color = color; prof.seen = Date.now(); dirty = true; lbDirty = true;
  c.token = token; c.prof = prof; c.x = rand(-1.5, 1.5); c.z = rand(2, 4); c.ry = PI; c.moved = true;
  const players = [];
  for (const o of conns.values()) if (o.prof && o !== c) players.push({ id: o.id, name: o.prof.name, color: o.prof.color, x: o.x, z: o.z, ry: o.ry, mach: o.mach || null });
  c.ws.send({
    t: 'welcome', id: c.id, token, me: meView(prof), x: c.x, z: c.z,
    machines: MACHINES.map(machineView), players, items: ITEMS, catalog: CATALOG, wheel: WHEEL,
    cfg: { price: CFG.price, refillAmount: CFG.refillAmount, refillBelow: CFG.refillBelow, refillCooldownMs: CFG.refillCooldownMs, coinTickets: CFG.pusherCoinTickets, goldTickets: CFG.pusherGoldTickets, lastRefill: prof.lastRefill },
    lb: leaderboard(),
  });
  for (const m of MACHINES) if (m.type === 'pusher') c.ws.send(pusherSnapshot(m));
  broadcast({ t: 'pj', p: { id: c.id, name, color, x: c.x, z: c.z, ry: c.ry, mach: null } }, c);
  announce(`${name} entered the arcade`, 'info');
}
function leaveMachine(c) {
  const m = c.mach && byId[c.mach];
  c.mach = null; c.round = null;
  if (m && m.occupant === c.id) { m.occupant = null; broadcast({ t: 'occ', m: m.id, by: null }); }
}
function enter(c, id) {
  const m = byId[id]; if (!m) return;
  if (SHARED_TYPES.has(m.type)) { if (c.mach && c.mach !== id) leaveMachine(c); c.mach = id; return c.ws.send({ t: 'enterres', ok: true, m: id }); }
  if (m.occupant && m.occupant !== c.id) { const o = conns.get(m.occupant); return c.ws.send({ t: 'enterres', ok: false, m: id, by: o ? o.prof.name : 'someone' }); }
  if (c.mach && c.mach !== id) leaveMachine(c);
  m.occupant = c.id; c.mach = id;
  broadcast({ t: 'occ', m: id, by: c.id });
  c.ws.send({ t: 'enterres', ok: true, m: id });
}
function myMachine(c, type) {
  const m = c.mach && byId[c.mach];
  if (!m || m.type !== type || (!SHARED_TYPES.has(type) && m.occupant !== c.id)) return null;
  return m;
}
function play(c) {
  const m = c.mach && byId[c.mach];
  if (!m || m.occupant !== c.id || !['claw', 'key', 'stacker', 'wheel'].includes(m.type)) return;
  const now = Date.now();
  if (c.round && now - c.round.start < 45000 && m.type !== 'wheel') return c.ws.send({ t: 'err', text: 'Finish your current game first.' });
  if (m.type === 'wheel' && c.round && now - c.round.start < 5500) return;
  if (!charge(c, CFG.price[m.type])) return c.ws.send({ t: 'playres', ok: false, m: m.id });
  c.round = { m: m.id, start: now };
  if (m.type === 'wheel') {
    const seg = weighted(WHEEL.map((v, i) => i), (i) => WHEEL_W[WHEEL[i]]);
    const val = WHEEL[seg];
    broadcast({ t: 'wheel', m: m.id, seg, by: c.id });
    c.ws.send({ t: 'playres', ok: true, m: m.id, seg });
    setTimeout(() => { if (c.ws.open) { addTickets(c, val, m.id); if (val >= 250) announce(`${c.prof.name} spun ${val} tickets on the ${m.name}!`); } }, 5600);
    return;
  }
  c.ws.send({ t: 'playres', ok: true, m: m.id });
}
function grab(c, msg) {
  const m = myMachine(c, 'claw'); if (!m || !c.round || c.round.m !== m.id) return;
  c.round = null;
  const prize = m.st.prizes.find((p) => p.pid === msg.pid);
  const d = num(msg.d, 1);
  let won = false;
  if (prize) { const ch = d < 0.05 ? CFG.clawChance[0] : d < 0.1 ? CFG.clawChance[1] : d < 0.17 ? CFG.clawChance[2] : 0; won = Math.random() < ch; }
  c.ws.send({ t: 'grabres', m: m.id, won, pid: prize ? prize.pid : null, item: prize ? prize.item : null });
  if (won) {
    m.st.prizes = m.st.prizes.filter((p) => p !== prize);
    setTimeout(() => {
      if (c.ws.open) giveItem(c, prize.item);
      announce(`${c.prof.name} won a ${ITEMS[prize.item].name} from ${m.name}!`);
      if (m.st.prizes.length < 7) restockClaw(m);
      broadcast({ t: 'claw', m: m.id, prizes: m.st.prizes });
    }, 3200);
  }
}
function keyStop(c, msg) {
  const m = myMachine(c, 'key'); if (!m || !c.round || c.round.m !== m.id) return;
  c.round = null;
  const slot = Math.floor(num(msg.slot, -1));
  if (slot < 0 || slot > 14) return;
  const item = m.st.slots[slot];
  const won = !!(msg.aligned && item && Math.random() < CFG.keyChance);
  c.ws.send({ t: 'keyres', m: m.id, slot, won, item, aligned: !!msg.aligned });
  if (won) {
    m.st.slots[slot] = null;
    giveItem(c, item);
    announce(`${c.prof.name} unlocked a ${ITEMS[item].name} on ${m.name}!`);
    broadcast({ t: 'keys', m: m.id, slots: m.st.slots });
    setTimeout(() => { restockKeys(m); broadcast({ t: 'keys', m: m.id, slots: m.st.slots }); }, 20000);
  }
}
function stackEnd(c, msg) {
  const m = myMachine(c, 'stacker'); if (!m || !c.round || c.round.m !== m.id) return;
  const elapsed = Date.now() - c.round.start; c.round = null;
  const row = Math.max(0, Math.min(15, Math.floor(num(msg.row))));
  if (elapsed < row * 150) return; // impossible speed
  let item = null, tickets = 0;
  if (msg.take === 'major' && row >= 15) item = pick(STACK_MAJOR);
  else if (msg.take === 'minor' && row >= 11) item = pick(STACK_MINOR);
  else tickets = row * 2;
  c.ws.send({ t: 'stackres', m: m.id, item, tickets });
  if (item) { giveItem(c, item); announce(`${c.prof.name} stacked to the ${row >= 15 ? 'MAJOR' : 'MINOR'} prize: ${ITEMS[item].name}!`); }
  if (tickets) addTickets(c, tickets, m.id);
}
function redeem(c, msg) {
  const id = msg.item; const it = ITEMS[id];
  if (!it || !it.cost) return;
  if (c.prof.tickets < it.cost) return c.ws.send({ t: 'err', text: 'Not enough tickets.' });
  c.prof.tickets -= it.cost; giveItem(c, id);
  c.ws.send({ t: 'toast', text: `Redeemed ${it.name}!` });
  if (it.cost >= 2000) announce(`${c.prof.name} redeemed a ${it.name} at the Prize Counter!`);
}
function refill(c) {
  const now = Date.now(), p = c.prof;
  if (p.credits >= CFG.refillBelow) return c.ws.send({ t: 'err', text: `Refill is only for players under ${'$' + (CFG.refillBelow / 100).toFixed(2)}.` });
  const wait = CFG.refillCooldownMs - (now - (p.lastRefill || 0));
  if (wait > 0) return c.ws.send({ t: 'err', text: `Change machine refilling... ${Math.ceil(wait / 1000)}s` });
  p.credits += CFG.refillAmount; p.lastRefill = now; sendMe(c);
  c.ws.send({ t: 'refilled', lastRefill: now });
}
function chat(c, msg) {
  const now = Date.now(); if (now - (c.lastChat || 0) < 700) return; c.lastChat = now;
  const text = clean(msg.text, 120); if (!text) return;
  broadcast({ t: 'chat', id: c.id, name: c.prof.name, color: c.prof.color, text });
}
function leaderboard() {
  return Object.values(db.players).filter((p) => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 10).map((p) => ({ name: p.name, color: p.color, total: p.total }));
}

function onMessage(c, raw) {
  let msg; try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg.t !== 'string') return;
  if (!c.prof && msg.t !== 'hello') return;
  switch (msg.t) {
    case 'hello': return hello(c, msg);
    case 'mv': {
      c.x = Math.max(-12, Math.min(12, num(msg.x, c.x))); c.z = Math.max(-12, Math.min(12, num(msg.z, c.z))); c.ry = num(msg.ry, c.ry); c.moved = true; return;
    }
    case 'enter': return enter(c, msg.m);
    case 'leave': c.moved = true; return leaveMachine(c);
    case 'drop': { const m = myMachine(c, 'pusher'); if (m) pusherDrop(c, m, msg.x); return; }
    case 'play': return play(c);
    case 'grab': return grab(c, msg);
    case 'keystop': return keyStop(c, msg);
    case 'stackend': return stackEnd(c, msg);
    case 'ms': {
      const m = c.mach && byId[c.mach];
      if (!m || m.occupant !== c.id || msg.m !== m.id) return;
      const now = Date.now(); if (now - (c.lastMs || 0) < 50) return; c.lastMs = now;
      const s = JSON.stringify({ t: 'ms', m: m.id, s: msg.s });
      if (s.length > 800) return;
      for (const o of conns.values()) if (o !== c && o.prof) o.ws.sendRaw(s);
      return;
    }
    case 'redeem': return redeem(c, msg);
    case 'refill': return refill(c);
    case 'chat': return chat(c, msg);
    case 'p': return c.ws.send({ t: 'p' });
  }
}

// ------------------------------------------------------------------ main loop
let tick = 0;
setInterval(() => {
  const now = Date.now(); tick++;
  for (const m of MACHINES) if (m.type === 'pusher') stepPusher(m, 1 / 30, now);
  if (tick % 2 === 0) for (const m of MACHINES) if (m.type === 'pusher') pusherDelta(m);
  if (tick % 3 === 0) {
    const p = [];
    for (const c of conns.values()) if (c.prof && c.moved) { c.moved = false; p.push(c.id, +c.x.toFixed(2), +c.z.toFixed(2), +c.ry.toFixed(2), c.mach || 0); }
    if (p.length) broadcast({ t: 'pl', p });
  }
  if (tick % 60 === 0 && lbDirty) { lbDirty = false; broadcast({ t: 'lb', lb: leaderboard(), online: [...conns.values()].filter((c) => c.prof).length }); }
}, 1000 / 30);

// ------------------------------------------------------------------ http + upgrade
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, online: conns.size })); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  const file = path.normalize(path.join(PUBLIC_DIR, url === '/' ? 'index.html' : url));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') return sock.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const ws = new WS(sock);
  const c = { id: nextConnId++, ws, prof: null, x: 0, z: 0, ry: 0, mach: null };
  conns.set(c.id, c);
  ws.onmessage = (m) => onMessage(c, m);
  ws.onclose = () => {
    conns.delete(c.id);
    if (c.prof) { leaveMachine(c); broadcast({ t: 'pq', id: c.id }); dirty = true; lbDirty = true; }
  };
});
setInterval(() => { for (const c of conns.values()) c.ws.frame(9, Buffer.alloc(0)); }, 25000);

server.listen(PORT, HOST, () => console.log(`NEON ARCADE running on http://localhost:${PORT}`));

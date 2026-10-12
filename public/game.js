// NEON ARCADE - 3D multiplayer arcade client (three.js)
import * as THREE from 'three';
window.__gameLoaded = true;

// ================================================================ utils
const $ = (s) => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const money = (c) => '$' + (c / 100).toFixed(2);
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const TAU = Math.PI * 2;

// ================================================================ audio (tiny synth)
let actx = null;
function initAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch { actx = null; } }
function beep(freq = 600, dur = 0.08, type = 'square', vol = 0.05, slide = 0) {
  if (!actx) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  coin: () => { beep(1200, 0.05, 'square', 0.03); setTimeout(() => beep(1800, 0.08, 'square', 0.03), 50); },
  ticket: () => beep(2200, 0.03, 'triangle', 0.025),
  win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'square', 0.05), i * 110)),
  lose: () => beep(300, 0.35, 'sawtooth', 0.04, -200),
  click: () => beep(800, 0.03, 'square', 0.03),
  tick: () => beep(1500, 0.015, 'square', 0.02),
};

// ================================================================ renderer / scene
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#07040e');
scene.fog = new THREE.Fog('#07040e', 18, 42);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 90);
camera.position.set(0, 3, 8);
function onResize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 72 : 62; camera.updateProjectionMatrix(); }
addEventListener('resize', onResize); onResize();

scene.add(new THREE.HemisphereLight('#9a8dff', '#3a1828', 1.5));
scene.add(new THREE.AmbientLight('#ffffff', 0.35));
const sun = new THREE.DirectionalLight('#ffffff', 1.3); sun.position.set(3, 9, 6); scene.add(sun);
for (const [c, x, z] of [['#ff2bd6', -7, -7], ['#2bd9ff', 6, -7], ['#ffd02b', 0, 6], ['#7d2bff', -8, 4], ['#2bff8a', 9, 2]]) {
  const p = new THREE.PointLight(c, 14, 14, 1.4); p.position.set(x, 3.4, z); scene.add(p);
}

// ================================================================ materials / mesh helpers
const matCache = new Map();
const cached = (k, f) => { if (!matCache.has(k)) matCache.set(k, f()); return matCache.get(k); };
const matStd = (color, rough = 0.55, metal = 0.1) => cached(`s${color}${rough}${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
const matNeon = (color, i = 2.2) => cached(`n${color}${i}`, () => new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, emissiveIntensity: i }));
const matBasic = (color) => cached(`b${color}`, () => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
const glassMat = new THREE.MeshStandardMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.2, depthWrite: false });
function box(parent, w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; }
function plane(parent, w, h, mat, x = 0, y = 0, z = 0, ry = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; }
function neonFrame(parent, w, h, color, x, y, z, t = 0.035) {
  const m = matNeon(color);
  box(parent, w, t, t, m, x, y + h / 2, z); box(parent, w, t, t, m, x, y - h / 2, z);
  box(parent, t, h, t, m, x - w / 2, y, z); box(parent, t, h, t, m, x + w / 2, y, z);
}

// ================================================================ canvas textures
function textCanvas(lines, o = {}) {
  const w = o.w || 512, h = o.h || 128;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = o.bw || 8; g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth); }
  lines = Array.isArray(lines) ? lines : [lines];
  const lh = h / lines.length;
  lines.forEach((t, i) => {
    let size = o.size || Math.floor(lh * 0.68);
    const font = () => `${o.weight || 900} ${size}px ${o.font || '"Arial Black", Impact, system-ui, sans-serif'}`;
    g.font = font();
    while (g.measureText(t).width > w * 0.9 && size > 8) { size -= 2; g.font = font(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fg = Array.isArray(o.fg) ? o.fg[i % o.fg.length] : (o.fg || '#fff');
    if (o.glow) { g.shadowColor = o.glow === true ? fg : o.glow; g.shadowBlur = o.blur || 22; g.fillStyle = fg; g.fillText(t, w / 2, lh * i + lh / 2 + 2); }
    g.shadowBlur = 0; g.fillStyle = fg; g.fillText(t, w / 2, lh * i + lh / 2 + 2);
  });
  return c;
}
function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const textTex = (lines, o) => canvasTex(textCanvas(lines, o));
function sign(parent, lines, w, h, o, x, y, z, ry = 0) {
  const cw = o.cw || 512;
  const tex = textTex(lines, { ...o, w: cw, h: Math.round(cw * h / w) });
  const m = plane(parent, w, h, new THREE.MeshBasicMaterial({ map: tex, transparent: !o.bg, toneMapped: false, depthWrite: !!o.bg }), x, y, z, ry);
  return m;
}
function patternTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = canvasTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); return t;
}
const carpetTex = patternTex(512, (g, s) => {
  g.fillStyle = '#120a2a'; g.fillRect(0, 0, s, s);
  const cols = ['#ff3db8', '#3df2ff', '#ffe03d', '#7dff5a', '#b07cff'];
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = g.fillStyle = cols[i % cols.length]; g.lineWidth = 5; g.globalAlpha = 0.75;
    const x = Math.random() * s, y = Math.random() * s, r = 8 + Math.random() * 16, k = i % 4;
    g.beginPath();
    if (k === 0) { g.arc(x, y, r, 0, TAU); g.stroke(); }
    else if (k === 1) { g.moveTo(x, y - r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.closePath(); g.stroke(); }
    else if (k === 2) { g.moveTo(x - r, y); for (let j = 0; j < 4; j++) g.quadraticCurveTo(x - r + j * r * 0.6 + r * 0.3, y + (j % 2 ? r : -r), x - r + (j + 1) * r * 0.6, y); g.stroke(); }
    else { g.fillRect(x, y, r * 0.6, r * 0.6); }
  }
  g.globalAlpha = 1;
}, 6);
const brickTex = patternTex(256, (g, s) => {
  g.fillStyle = '#1a0d0d'; g.fillRect(0, 0, s, s);
  const bh = 32, bw = 64;
  for (let r = 0; r < s / bh; r++) for (let c = -1; c < s / bw + 1; c++) {
    const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh;
    const v = 40 + Math.random() * 25; g.fillStyle = `rgb(${v + 30},${v * 0.45},${v * 0.4})`;
    g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
  }
}, 1);
brickTex.repeat.set(8, 1.5);
function spaceTex(accent) {
  return patternTex(512, (g, s) => {
    const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#0b0630'); gr.addColorStop(1, '#1c0b45'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
    g.fillStyle = accent; g.globalAlpha = 0.35; g.beginPath(); g.arc(s * 0.7, s * 0.35, 60, 0, TAU); g.fill();
    g.fillStyle = '#3df2ff'; g.beginPath(); g.arc(s * 0.25, s * 0.6, 34, 0, TAU); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = accent; g.lineWidth = 6; g.setLineDash([24, 14]); g.beginPath(); g.moveTo(0, s - 10); g.lineTo(s, s - 10); g.stroke();
  }, 1);
}

// ================================================================ room
const ROOM = 12;
function buildRoom() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2), new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 });
  const H = 4.2;
  for (const [x, z, ry] of [[0, -ROOM, 0], [0, ROOM, Math.PI], [-ROOM, 0, Math.PI / 2], [ROOM, 0, -Math.PI / 2]]) {
    const w = plane(scene, ROOM * 2, H, wallMat, x, H / 2, z, ry);
    w.receiveShadow = false;
    // neon tubes along the walls like a real arcade
    const tube = new THREE.Mesh(new THREE.BoxGeometry(ROOM * 2, 0.05, 0.05), matNeon('#ff2040', 2.5));
    tube.position.set(x * 0.995, 3.7, z * 0.995); tube.rotation.y = ry; scene.add(tube);
    const tube2 = tube.clone(); tube2.position.y = 3.55; tube2.material = matNeon('#ff2bd6', 2); scene.add(tube2);
  }
  const ceil = plane(scene, ROOM * 2, ROOM * 2, matStd('#0d0818', 1), 0, H, 0); ceil.rotation.x = Math.PI / 2;
  for (let x = -8; x <= 8; x += 8) for (let z = -8; z <= 8; z += 5.3) box(scene, 2.4, 0.05, 0.5, matNeon('#e8e0ff', 1.4), x, H - 0.03, z);
  sign(scene, ['COINS', 'COINS'], 2.4, 1.8, { fg: '#ffe03d', glow: true }, -ROOM + 0.03, 2.7, 6.2, Math.PI / 2);
  sign(scene, ['NEON ARCADE'], 6.5, 1.0, { fg: '#ff3db8', glow: true }, -1.5, 3.05, -ROOM + 0.03);
  sign(scene, ['TICKETS'], 3, 0.8, { fg: '#3df2ff', glow: true }, ROOM - 0.03, 2.95, -2, -Math.PI / 2);
  sign(scene, ['WIN BIG'], 2.6, 0.8, { fg: '#7dff5a', glow: true }, -ROOM + 0.03, 3.0, -3.6, Math.PI / 2);
  sign(scene, ['PRIZES PRIZES PRIZES'], 7, 0.75, { fg: '#ffe03d', glow: true }, 0, 3.35, ROOM - 0.03, Math.PI);
  // benches / decor
  const pillarMat = matStd('#1d1236');
  for (const [x, z] of [[-4, 0], [4, 0], [-4, 5.5], [4, 5.5]]) {
    box(scene, 0.5, 4.2, 0.5, pillarMat, x, 2.1, z);
    box(scene, 0.52, 0.05, 0.52, matNeon(['#ff3db8', '#3df2ff'][(x > 0) | 0]), x, 2.6, z);
  }
}
buildRoom();
const PILLARS = [[-4, 0], [4, 0], [-4, 5.5], [4, 5.5]];

// ================================================================ machine views
const MTYPE = {
  pusher: { hw: 1.3, hd: 1.5, cz: -0.15, stand: 2.0, cam: [0, 2.55, 2.1], look: [0, 1.0, -0.3] },
  claw: { hw: 0.8, hd: 0.7, cz: 0, stand: 1.4, cam: [0, 2.3, 1.65], look: [0, 1.2, -0.05] },
  key: { hw: 0.75, hd: 0.5, cz: 0, stand: 1.3, cam: [0, 1.65, 2.0], look: [0, 1.55, 0] },
  stacker: { hw: 0.75, hd: 0.5, cz: 0, stand: 1.3, cam: [0, 1.65, 2.5], look: [0, 1.6, 0] },
  wheel: { hw: 1.35, hd: 0.45, cz: 0, stand: 2.0, cam: [0, 1.95, 3.9], look: [0, 1.95, 0] },
  counter: { hw: 3.2, hd: 0.5, cz: 0, stand: 1.4, cam: [0, 1.9, 2.8], look: [0, 1.4, -0.6] },
  change: { hw: 0.45, hd: 0.35, cz: 0, stand: 1.1, cam: [0, 1.5, 1.7], look: [0, 1.25, 0] },
};
const PF = { FRONT: 0.95, PZ0: -1.05 };
const views = new Map();
const BUILD = {};
let ITEMS = {}, CATALOG = [], WHEELV = [], CFG = {};

class MView {
  constructor(d) {
    this.def = d; this.t = MTYPE[d.type]; this.occupant = d.occupant || null;
    this.g = new THREE.Group(); this.g.position.set(d.x, 0, d.z); this.g.rotation.y = d.ry; scene.add(this.g);
    BUILD[d.type](this, d);
    this.g.updateMatrixWorld(true);
    this.standW = this.toW(0, 0, this.t.stand);
  }
  toW(x, y, z) { return this.g.localToWorld(new THREE.Vector3(x, y, z)); }
  update() {}
  applyRemote() {}
  reset() {}
}

// ---------------------------------------------------------------- coin pusher
const coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.028, 18);
const coinMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.55, roughness: 0.32, emissive: '#2a1a00' });
const COL_GOLD = new THREE.Color('#ffc83a'), COL_TOKEN = new THREE.Color('#ff5fd2');
const tmpObj = new THREE.Object3D();
BUILD.pusher = (v, d) => {
  const g = v.g, FY = 1.0, ac = d.color; v.FY = FY;
  box(g, 2.6, FY, 2.6, matStd('#1a1030'), 0, FY / 2, -0.35);
  box(g, 2.6, FY - 0.38, 0.42, matStd('#140c26'), 0, (FY - 0.38) / 2, 1.16);
  box(g, 2.62, 0.05, 0.05, matNeon(ac), 0, FY - 0.38, 1.38);
  box(g, 0.05, FY, 0.05, matNeon(ac), -1.3, FY / 2, 0.95); box(g, 0.05, FY, 0.05, matNeon(ac), 1.3, FY / 2, 0.95);
  sign(g, [money(d.price) + ' PER COIN'], 1.1, 0.2, { fg: '#ffe03d', bg: '#120a24' }, -0.45, 0.4, 1.372);
  box(g, 0.5, 0.1, 0.03, matNeon('#3df2ff', 1.2), 0.75, 0.42, 1.38);
  v.field = box(g, 2.04, 0.04, 2.3, new THREE.MeshStandardMaterial({ map: spaceTex(ac), roughness: 0.5 }), 0, FY - 0.02, -0.15);
  for (const s of [-1, 1]) {
    box(g, 0.04, 0.18, 1.8, matStd('#c0c6d8', 0.3, 0.6), s * 1.04, FY + 0.09, -0.35);
    box(g, 0.02, 0.85, 2.0, glassMat, s * 1.1, FY + 0.43, -0.45);
    box(g, 0.04, 0.04, 2.0, matNeon(ac, 1.5), s * 1.1, FY + 0.86, -0.45);
  }
  box(g, 2.6, 1.95, 0.45, matStd('#221040'), 0, FY + 0.97, -1.47);
  neonFrame(g, 2.5, 1.85, ac, 0, FY + 0.97, -1.235);
  sign(g, [d.name.toUpperCase()], 2.3, 0.42, { fg: ac, glow: true, bg: '#0a0418' }, 0, FY + 1.6, -1.24);
  v.screenC = document.createElement('canvas'); v.screenC.width = 512; v.screenC.height = 192;
  v.screenT = canvasTex(v.screenC);
  plane(g, 1.3, 0.49, new THREE.MeshBasicMaterial({ map: v.screenT, toneMapped: false }), 0, FY + 1.02, -1.24);
  v.setScreen = (lines, color = '#3df2ff') => {
    const c = textCanvas(lines, { w: 512, h: 192, fg: color, glow: true, bg: '#05020c', border: color, bw: 6 });
    const ctx = v.screenC.getContext('2d'); ctx.clearRect(0, 0, 512, 192); ctx.drawImage(c, 0, 0); v.screenT.needsUpdate = true;
  };
  v.setScreen(['BONUS SLOT', 'DROP TO WIN'], ac);
  v.screenTimer = 0;
  box(g, 2.0, 0.05, 0.1, matStd('#9aa3bd', 0.3, 0.7), 0, FY + 0.6, -0.9);
  v.aim = new THREE.Mesh(coinGeo, new THREE.MeshBasicMaterial({ color: '#ffe03d', transparent: true, opacity: 0.7 }));
  v.aim.position.set(0, FY + 0.66, -0.9); v.aim.rotation.x = Math.PI / 2; v.aim.visible = false; g.add(v.aim);
  v.pusher = box(g, 2.0, 0.16, 0.7, matStd('#b8bfd6', 0.3, 0.7), 0, FY + 0.08, PF.PZ0 - 0.35);
  box(v.pusher, 2.0, 0.02, 0.04, matNeon(ac, 1.5), 0, 0.08, 0.34);
  v.pzT = PF.PZ0; v.pzC = PF.PZ0;
  v.coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, 320);
  for (let i = 0; i < 320; i++) v.coinMesh.setColorAt(i, COL_GOLD);
  v.coinMesh.count = 0; v.coinMesh.frustumCulled = false; g.add(v.coinMesh);
  v.coins = new Map(); v.falling = [];
  v.snapshot = (msg) => {
    v.coins.clear(); v.pzT = v.pzC = msg.p / 1000;
    const c = msg.c; for (let i = 0; i < c.length; i += 5) { const x = c[i + 1] / 1000, z = c[i + 2] / 1000, y = c[i + 3] / 1000; v.coins.set(c[i], { x, z, y, tx: x, tz: z, ty: y, k: c[i + 4] }); }
  };
  v.delta = (msg) => {
    v.pzT = msg.p / 1000;
    const u = msg.u;
    if (u) for (let i = 0; i < u.length; i += 5) {
      const id = u[i], x = u[i + 1] / 1000, z = u[i + 2] / 1000, y = u[i + 3] / 1000;
      const c = v.coins.get(id);
      if (c) { c.tx = x; c.tz = z; c.ty = y; } else v.coins.set(id, { x, z, y, tx: x, tz: z, ty: y, k: u[i + 4] });
    }
    const r = msg.r;
    if (r) for (let i = 0; i < r.length; i += 2) {
      const c = v.coins.get(r[i]); if (!c) continue; v.coins.delete(r[i]);
      v.falling.push({ x: c.x, y: c.y, z: c.z, k: c.k, vx: r[i + 1] === 2 ? Math.sign(c.x) * 0.7 : 0, vy: 0, vz: r[i + 1] === 1 ? 0.7 : 0.1 });
    }
  };
  v.update = (dt) => {
    const k = damp(14, dt);
    v.pzC = lerp(v.pzC, v.pzT, damp(10, dt)); v.pusher.position.z = v.pzC - 0.35;
    let i = 0; const m = v.coinMesh;
    for (const c of v.coins.values()) {
      c.x = lerp(c.x, c.tx, k); c.z = lerp(c.z, c.tz, k); c.y = c.ty > c.y ? c.ty : lerp(c.y, c.ty, damp(20, dt));
      if (i >= 320) break;
      tmpObj.position.set(c.x, FY + 0.015 + c.y, c.z); tmpObj.rotation.set(0, 0, 0);
      const s = c.k ? 1.27 : 1; tmpObj.scale.set(s, 1, s); tmpObj.updateMatrix();
      m.setMatrixAt(i, tmpObj.matrix); m.setColorAt(i, c.k ? COL_TOKEN : COL_GOLD); i++;
    }
    v.falling = v.falling.filter((f) => {
      f.vy -= 9.8 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      if (f.y < -0.4 || i >= 320) return false;
      tmpObj.position.set(f.x, FY + 0.015 + f.y, f.z); tmpObj.rotation.set(f.y * 3, 0, 0);
      const s = f.k ? 1.27 : 1; tmpObj.scale.set(s, 1, s); tmpObj.updateMatrix();
      m.setMatrixAt(i, tmpObj.matrix); m.setColorAt(i, f.k ? COL_TOKEN : COL_GOLD); i++;
      return true;
    });
    m.count = i; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (v.screenTimer > 0) { v.screenTimer -= dt; if (v.screenTimer <= 0) v.setScreen(['BONUS SLOT', 'DROP TO WIN'], ac); }
  };
  v.bonus = (label, by) => { v.setScreen([label, by], '#ffe03d'); v.screenTimer = 4; };
};

// ---------------------------------------------------------------- claw machine
function makePlush(color) {
  const g = new THREE.Group(), m = matStd(color, 0.9);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), m); body.scale.set(1, 0.9, 0.95); g.add(body);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), m); ear.position.set(s * 0.065, 0.075, 0); g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), matStd('#111111')); eye.position.set(s * 0.035, 0.02, 0.088); g.add(eye);
  }
  return g;
}
BUILD.claw = (v, d) => {
  const g = v.g, ac = d.color;
  box(g, 1.6, 0.9, 1.4, matStd('#1a1030'), 0, 0.45, 0);
  box(g, 1.5, 0.62, 0.02, matStd(ac, 0.5), 0, 0.47, 0.705);
  sign(g, [money(d.price) + ' PLAY'], 0.7, 0.18, { fg: '#ffffff', bg: '#000000' }, 0.3, 0.62, 0.717);
  box(g, 0.34, 0.3, 0.03, matStd('#0a0a0a'), -0.5, 0.32, 0.715);
  box(g, 1.56, 1.3, 1.36, glassMat, 0, 1.55, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.06, 1.3, 0.06, matNeon(ac, 1.6), sx * 0.78, 1.55, sz * 0.68);
  box(g, 1.6, 0.38, 1.4, matStd('#120a24'), 0, 2.39, 0);
  sign(g, [d.name.toUpperCase()], 1.5, 0.32, { fg: ac, glow: true, bg: '#0a0418' }, 0, 2.39, 0.705);
  sign(g, ['GRAB A', 'PRIZE!'], 1.5, 1.0, { fg: [ac, '#ffffff'], glow: true, bg: '#140a28' }, 0, 1.6, -0.675);
  box(g, 1.5, 0.02, 1.3, matStd('#2b1b4a'), 0, 0.91, 0);
  box(g, 0.36, 0.02, 0.32, matNeon('#ffffff', 0.5), -0.55, 0.925, 0.45);
  box(g, 0.38, 0.14, 0.02, glassMat, -0.55, 0.99, 0.29);
  v.rail = box(g, 1.5, 0.03, 0.03, matStd('#9aa3bd', 0.3, 0.8), 0, 2.17, 0);
  const metal = matStd('#d8dde8', 0.25, 0.85);
  v.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 1, 6), metal); g.add(v.cable);
  v.head = new THREE.Group(); g.add(v.head);
  const hc = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.1, 12), metal); v.head.add(hc);
  v.prongs = [];
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group(); pivot.rotation.y = (i * TAU) / 3; v.head.add(pivot);
    const arm = new THREE.Group(); arm.position.set(0, -0.04, 0.04); pivot.add(arm);
    box(arm, 0.018, 0.17, 0.018, metal, 0, -0.085, 0);
    box(arm, 0.018, 0.018, 0.05, metal, 0, -0.17, -0.02);
    v.prongs.push(arm);
  }
  v.ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, toneMapped: false }));
  v.ring.rotation.x = -Math.PI / 2; g.add(v.ring);
  v.prizeG = new THREE.Group(); g.add(v.prizeG);
  v.prizes = new Map();
  v.cs = { x: 0, z: 0.3, y: 0, o: 1, h: null, w: null };
  v.rs = null; v.local = false; v.chuting = [];
  v.setPrizes = (list) => {
    v.prizeG.clear(); v.prizes.clear();
    for (const p of list) {
      const it = ITEMS[p.item] || { color: '#ff00ff' };
      const mesh = makePlush(it.color); mesh.position.set(p.x, 1.01, p.z); mesh.rotation.y = p.r;
      mesh.userData = { home: new THREE.Vector3(p.x, 1.01, p.z), vy: 0, pid: p.pid, item: p.item };
      v.prizeG.add(mesh); v.prizes.set(p.pid, mesh);
    }
  };
  v.setPrizes(d.prizes || []);
  v.chuteDrop = (pid) => { const m = v.prizes.get(pid); if (m) { m.userData.gone = true; v.chuting.push(m); } };
  v.reset = () => { v.cs = { x: 0, z: 0.3, y: 0, o: 1, h: null, w: null }; v.rs = null; };
  v.applyRemote = (s) => {
    if (v.rs && v.rs.h != null && s.h == null && s.w === v.rs.h) v.chuteDrop(s.w);
    v.rs = s;
  };
  v.update = (dt) => {
    const cs = v.cs;
    if (!v.local && v.rs) { const k = damp(12, dt), r = v.rs; cs.x = lerp(cs.x, r.x, k); cs.z = lerp(cs.z, r.z, k); cs.y = lerp(cs.y, r.y, k); cs.o = lerp(cs.o, r.o, k); cs.h = r.h; }
    const hy = 2.03 - cs.y * 0.8;
    v.head.position.set(cs.x, hy, cs.z);
    v.cable.position.set(cs.x, (2.17 + hy) / 2, cs.z); v.cable.scale.y = Math.max(0.01, 2.17 - hy);
    v.rail.position.z = cs.z;
    for (const a of v.prongs) a.rotation.x = lerp(0.35, -0.6, cs.o);
    v.ring.position.set(cs.x, 0.93, cs.z);
    for (const m of v.prizes.values()) {
      const u = m.userData;
      if (u.gone) continue;
      if (cs.h === u.pid) { m.position.set(cs.x, hy - 0.2, cs.z); u.vy = 0; continue; }
      if (m.position.y > u.home.y + 0.001) {
        u.vy -= 9.8 * dt; m.position.y = Math.max(u.home.y, m.position.y + u.vy * dt);
        m.position.x = lerp(m.position.x, u.home.x, damp(3, dt)); m.position.z = lerp(m.position.z, u.home.z, damp(3, dt));
      } else { u.vy = 0; m.position.copy(u.home); }
    }
    v.chuting = v.chuting.filter((m) => {
      m.userData.vy -= 9.8 * dt; m.position.y += m.userData.vy * dt;
      m.position.x = lerp(m.position.x, -0.55, damp(8, dt)); m.position.z = lerp(m.position.z, 0.45, damp(8, dt));
      if (m.position.y < 0.4) { m.visible = false; return false; }
      return true;
    });
  };
};

// ---------------------------------------------------------------- key master
const slotTexCache = new Map();
function slotTex(id) {
  const k = id || '_';
  if (!slotTexCache.has(k)) {
    const it = id ? ITEMS[id] : null;
    slotTexCache.set(k, textTex(it ? it.name.split(' ').slice(0, 2) : ['EMPTY'], { w: 128, h: 160, bg: it ? it.color : '#151020', fg: it ? '#000000' : '#555555', border: '#d4af37', bw: 6, font: 'system-ui, sans-serif', weight: 800 }));
  }
  return slotTexCache.get(k);
}
function keyPath(s) {
  s = clamp(s, 0, 14.999);
  const seg = Math.floor(s), frac = s - seg, row = Math.floor(seg / 5), ci = seg % 5, dir = row % 2 === 0 ? 1 : -1;
  const col = dir > 0 ? ci : 4 - ci;
  return { x: (col - 2) * 0.23 + (frac - 0.5) * 0.23 * dir, y: 1.25 + row * 0.3, slot: row * 5 + col, frac };
}
BUILD.key = (v, d) => {
  const g = v.g, ac = d.color;
  box(g, 1.5, 2.6, 1.0, matStd('#0b1230'), 0, 1.3, 0);
  for (const s of [-1, 1]) box(g, 0.05, 2.6, 0.05, matNeon(ac), s * 0.75, 1.3, 0.5);
  sign(g, [d.name.toUpperCase()], 1.4, 0.36, { fg: ac, glow: true, bg: '#05030c' }, 0, 2.35, 0.505);
  plane(g, 1.24, 0.95, matStd('#06040c'), 0, 1.55, 0.503);
  neonFrame(g, 1.26, 0.97, ac, 0, 1.55, 0.51, 0.025);
  const gold = matStd('#d4af37', 0.3, 0.85);
  v.doors = [];
  for (let i = 0; i < 15; i++) {
    const row = Math.floor(i / 5), col = i % 5, x = (col - 2) * 0.23, y = 1.25 + row * 0.3;
    const pivot = new THREE.Group(); pivot.position.set(x - 0.095, y + 0.02, 0.506); g.add(pivot);
    const door = plane(pivot, 0.19, 0.24, new THREE.MeshBasicMaterial({ map: slotTex(null), toneMapped: false }), 0.095, 0, 0);
    box(g, 0.035, 0.035, 0.01, gold, x, y - 0.12, 0.51);
    v.doors.push({ pivot, door, open: 0 });
  }
  v.keyG = new THREE.Group(); g.add(v.keyG);
  box(v.keyG, 0.016, 0.016, 0.12, gold, 0, 0, -0.05);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 8, 16), gold); bow.position.z = 0.03; v.keyG.add(bow);
  box(v.keyG, 0.01, 0.03, 0.02, gold, 0, -0.015, -0.1);
  box(g, 1.3, 0.12, 0.3, matStd('#151515'), 0, 0.92, 0.62);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), matNeon('#ff2030', 1.6)); btn.position.set(0.35, 1.0, 0.64); g.add(btn);
  sign(g, [money(d.price) + ' PER PLAY'], 0.9, 0.18, { fg: '#ffe03d', bg: '#000000' }, 0, 0.7, 0.505);
  v.keyS = 0; v.keyST = 0; v.keyPush = 0; v.local = false;
  v.setSlots = (slots) => { v.slots = slots; slots.forEach((it, i) => { v.doors[i].door.material.map = slotTex(it); v.doors[i].door.material.needsUpdate = true; v.doors[i].open = 0; }); };
  v.setSlots(d.slots || Array(15).fill(null));
  v.openSlot = (i) => { if (v.doors[i]) v.doors[i].open = 1; };
  v.reset = () => { v.keyS = v.keyST = 0; v.keyPush = 0; };
  v.applyRemote = (s) => { v.keyST = s.s; v.keyPush = s.p; };
  v.update = (dt) => {
    if (!v.local) v.keyS = lerp(v.keyS, v.keyST, damp(14, dt));
    const p = keyPath(v.keyS);
    v.keyG.position.set(p.x, p.y - 0.12, 0.66 - v.keyPush * 0.12);
    for (const dr of v.doors) dr.pivot.rotation.y = lerp(dr.pivot.rotation.y, -dr.open * 1.9, damp(6, dt));
  };
};

// ---------------------------------------------------------------- stacker
BUILD.stacker = (v, d) => {
  const g = v.g;
  box(g, 1.5, 2.7, 1.0, matStd('#c00f19', 0.5), 0, 1.35, 0);
  sign(g, ['STACKEM UP'], 1.44, 0.34, { fg: '#ffffff', glow: '#ff3030', bg: '#7a0008' }, 0, 2.5, 0.505);
  plane(g, 0.9, 1.7, matStd('#140306'), 0, 1.5, 0.503);
  plane(g, 0.66, 1.52, matBasic('#050000'), 0, 1.5, 0.506);
  v.cells = []; v.cellState = [];
  for (let r = 0; r < 15; r++) for (let c = 0; c < 7; c++) {
    const m = plane(g, 0.07, 0.08, new THREE.MeshBasicMaterial({ color: '#2a0306', toneMapped: false }), (c - 3) * 0.085, 0.82 + r * 0.097, 0.508);
    v.cells.push(m); v.cellState.push(false);
  }
  box(g, 0.7, 0.012, 0.01, matNeon('#ffe03d'), 0, 0.82 + 10.5 * 0.097, 0.511);
  sign(g, ['MINOR', 'PRIZE'], 0.24, 0.24, { fg: '#ffe03d', bg: '#200004' }, -0.6, 0.82 + 10.5 * 0.097, 0.505);
  sign(g, ['MAJOR', 'PRIZE'], 0.24, 0.24, { fg: '#3df2ff', bg: '#200004' }, 0.6, 0.82 + 14 * 0.097, 0.505);
  box(g, 1.3, 0.12, 0.3, matStd('#1a1a1a'), 0, 0.72, 0.62);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), matNeon('#ff2030', 1.8)); btn.position.set(0, 0.8, 0.64); g.add(btn);
  sign(g, [money(d.price) + ' PER PLAY'], 0.9, 0.16, { fg: '#ffffff', bg: '#000000' }, 0, 0.5, 0.505);
  v.grid = Array(15).fill(0); v.cur = { row: -1, mask: 0 }; v.flash = 0;
  v.render = () => {
    for (let r = 0; r < 15; r++) for (let c = 0; c < 7; c++) {
      const i = r * 7 + c;
      let lit = !!((v.grid[r] >> c) & 1) || (r === v.cur.row && !!((v.cur.mask >> c) & 1));
      if (v.flash > 0 && Math.floor(v.flash * 8) % 2) lit = !lit && v.grid[r] > 0;
      if (lit !== v.cellState[i]) { v.cellState[i] = lit; v.cells[i].material.color.set(lit ? '#ff2a3a' : '#2a0306'); }
    }
  };
  v.reset = () => { v.grid = Array(15).fill(0); v.cur = { row: -1, mask: 0 }; v.render(); };
  v.applyRemote = (s) => { v.grid = s.g; v.cur = { row: s.r, mask: s.k }; v.render(); };
  v.update = (dt) => { if (v.flash > 0) { v.flash -= dt; v.render(); } };
};

// ---------------------------------------------------------------- big wheel
const WHEEL_COLORS = { 5: '#7d2bff', 10: '#2a7fff', 15: '#27c46b', 20: '#ff8a3d', 25: '#ff3db8', 50: '#3df2ff', 100: '#7dff5a', 250: '#ff2030', 500: '#ffe03d' };
BUILD.wheel = (v, d) => {
  const g = v.g;
  box(g, 2.5, 0.9, 0.8, matStd('#0f5a35'), 0, 0.45, 0);
  sign(g, [money(d.price) + ' PER SPIN'], 1.2, 0.22, { fg: '#ffe03d', bg: '#062a18' }, 0, 0.55, 0.405);
  box(g, 2.7, 2.7, 0.1, matStd('#0b2a1c'), 0, 1.98, -0.05);
  sign(g, ['BIG BASS', 'WHEEL'], 2.3, 0.75, { fg: ['#ffe03d', '#3dff9e'], glow: true }, 0, 3.6, 0.05);
  const n = WHEELV.length || 16, a = TAU / n;
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const val = WHEELV[i];
    x.beginPath(); x.moveTo(256, 256); x.arc(256, 256, 250, (i - 0.5) * a, (i + 0.5) * a); x.closePath();
    x.fillStyle = WHEEL_COLORS[val] || '#444'; x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 3; x.stroke();
    x.save(); x.translate(256, 256); x.rotate(i * a); x.fillStyle = val >= 250 ? '#000' : '#fff'; x.font = '900 40px "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(val), 175, 0); x.restore();
  }
  x.beginPath(); x.arc(256, 256, 46, 0, TAU); x.fillStyle = '#111'; x.fill(); x.strokeStyle = '#ffe03d'; x.lineWidth = 6; x.stroke();
  v.disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 64), new THREE.MeshBasicMaterial({ map: canvasTex(c), toneMapped: false }));
  v.disc.position.set(0, 1.98, 0.03); g.add(v.disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.17, 0.045, 8, 64), matNeon('#ffe03d', 1.4)); rim.position.copy(v.disc.position); g.add(rim);
  v.bulbs = [];
  for (let i = 0; i < 24; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
    b.position.set(Math.cos((i / 24) * TAU) * 1.27, 1.98 + Math.sin((i / 24) * TAU) * 1.27, 0.04); g.add(b); v.bulbs.push(b);
  }
  const ptr = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 8), matNeon('#ff3db8', 2)); ptr.rotation.z = Math.PI; ptr.position.set(0, 1.98 + 1.25, 0.12); g.add(ptr);
  v.spin = null; v.time = 0;
  v.startSpin = (seg, done) => {
    const cur = v.disc.rotation.z, want = Math.PI / 2 + seg * a;
    const delta = (((want - cur) % TAU) + TAU) % TAU;
    v.spin = { from: cur, to: cur + delta + TAU * 5, t: 0, dur: 5.2, done, lastSeg: -1 };
  };
  v.update = (dt) => {
    v.time += dt;
    if (v.spin) {
      const s = v.spin; s.t += dt; const p = Math.min(1, s.t / s.dur), e = 1 - Math.pow(1 - p, 3);
      v.disc.rotation.z = lerp(s.from, s.to, e);
      const segNow = Math.floor(v.disc.rotation.z / a); if (segNow !== s.lastSeg) { s.lastSeg = segNow; if (s.mine) sfx.tick(); }
      if (p >= 1) { v.spin = null; if (s.done) s.done(); }
    }
    const fast = v.spin ? 14 : 3;
    v.bulbs.forEach((b, i) => b.material.color.set(((Math.floor(v.time * fast) + i) % 3 === 0) ? '#ffe03d' : '#553300'));
  };
};

// ---------------------------------------------------------------- prize counter & change machine
BUILD.counter = (v) => {
  const g = v.g;
  box(g, 6.2, 1.0, 0.8, matStd('#1b0f33'), 0, 0.5, 0);
  box(g, 6.3, 0.06, 0.9, matStd('#d8d0ff', 0.2, 0.3), 0, 1.03, 0);
  box(g, 6.2, 0.05, 0.05, matNeon('#ff3db8'), 0, 0.85, 0.41); box(g, 6.2, 0.05, 0.05, matNeon('#3df2ff'), 0, 0.15, 0.41);
  sign(g, ['PRIZE COUNTER'], 4, 0.7, { fg: '#ff3db8', glow: true }, 0, 3.0, -1.15);
  const items = CATALOG.map((id) => ITEMS[id]).filter(Boolean);
  for (let k = 0; k < 3; k++) {
    box(g, 6, 0.05, 0.4, matStd('#3a2a5a'), 0, 1.3 + k * 0.55, -0.95);
    for (let j = 0; j < 10; j++) {
      const it = items[(k * 10 + j) % items.length]; const px = -2.7 + j * 0.6, py = 1.3 + k * 0.55;
      if ((j + k) % 3 === 0) { const p = makePlush(it.color); p.scale.setScalar(1.6); p.position.set(px, py + 0.17, -0.95); g.add(p); }
      else box(g, 0.28, 0.32 - (j % 2) * 0.1, 0.22, matStd(it.color, 0.6), px, py + 0.18 - (j % 2) * 0.05, -0.95);
    }
  }
  box(g, 2, 0.4, 0.5, glassMat, 1.5, 1.26, 0);
  for (let i = 0; i < 5; i++) { const p = makePlush(['#ff3db8', '#3df2ff', '#ffe03d', '#7dff5a', '#b07cff'][i]); p.position.set(0.8 + i * 0.35, 1.16, 0); g.add(p); }
  box(g, 0.55, 0.55, 0.5, matStd('#2a7fff'), -2.6, 1.33, 0);
  sign(g, ['TICKET', 'EATER'], 0.5, 0.3, { fg: '#ffffff', bg: '#0b3a8a' }, -2.6, 1.4, 0.255);
};
BUILD.change = (v) => {
  const g = v.g;
  box(g, 0.85, 1.9, 0.65, matStd('#0f6b45'), 0, 0.95, 0);
  sign(g, ['CHANGE'], 0.8, 0.25, { fg: '#ffffff', glow: '#3dff9e', bg: '#063d26' }, 0, 1.75, 0.327);
  sign(g, ['FREE REFILL', 'WHEN BROKE'], 0.62, 0.34, { fg: ['#ffe03d', '#3dff9e'], bg: '#000000' }, 0, 1.35, 0.327);
  box(g, 0.3, 0.05, 0.05, matNeon('#3dff9e', 1.2), 0, 1.05, 0.33);
  box(g, 0.4, 0.12, 0.12, matStd('#111111'), 0, 0.6, 0.36);
};

// ================================================================ avatars
function labelSprite(text, color) {
  const c = textCanvas([text], { w: 256, h: 64, fg: color, bg: 'rgba(10,5,20,0.6)', size: 32, weight: 800, font: 'system-ui, sans-serif' });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false }));
  s.scale.set(1.3, 0.33, 1); return s;
}
function wrap(text, n = 26) { const words = text.split(' '); const lines = ['']; for (const w of words) { if ((lines[lines.length - 1] + ' ' + w).trim().length > n && lines.length < 3) lines.push(''); lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + w).trim(); } return lines; }
const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };
class Avatar {
  constructor(p) {
    this.id = p.id; this.name = p.name; this.color = p.color; this.mach = p.mach || null;
    const g = this.g = new THREE.Group(); scene.add(g);
    const mat = matStd(p.color, 0.5), skin = matStd('#ffd9b8', 0.7), dark = matStd('#1b1530', 0.8);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.5, 4, 10), mat); body.position.y = 1.0; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin); head.position.y = 1.55; g.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.205, 16, 8, 0, TAU, 0, Math.PI / 2), mat); cap.position.y = 1.57; g.add(cap);
    box(g, 0.24, 0.025, 0.16, mat, 0, 1.59, 0.17);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), matStd('#111111')); e.position.set(s * 0.07, 1.54, 0.18); g.add(e); }
    this.legs = []; this.arms = [];
    for (const s of [-1, 1]) {
      const l = new THREE.Group(); l.position.set(s * 0.1, 0.62, 0); box(l, 0.12, 0.6, 0.14, dark, 0, -0.3, 0); g.add(l); this.legs.push(l);
      const a = new THREE.Group(); a.position.set(s * 0.3, 1.25, 0); box(a, 0.09, 0.5, 0.1, mat, 0, -0.25, 0); g.add(a); this.arms.push(a);
    }
    this.label = labelSprite(p.name, p.color); this.label.position.y = 2.0; g.add(this.label);
    this.x = this.tx = p.x; this.z = this.tz = p.z; this.ry = this.tr = p.ry || 0; this.walk = 0; this.speed = 0;
    this.bubble = null; this.bubbleT = 0; this.place();
  }
  place() { this.g.position.set(this.x, 0, this.z); this.g.rotation.y = this.ry; }
  say(text) {
    if (this.bubble) { this.g.remove(this.bubble); this.bubble.material.map.dispose(); }
    const lines = wrap(text);
    const c = textCanvas(lines, { w: 512, h: 72 * lines.length, fg: '#111111', bg: '#ffffff', size: 40, weight: 700, font: 'system-ui, sans-serif', border: this.color, bw: 6 });
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), depthWrite: false }));
    this.bubble.scale.set(1.9, 0.27 * lines.length, 1); this.bubble.position.y = 2.35 + 0.12 * lines.length; this.g.add(this.bubble); this.bubbleT = 6;
  }
  update(dt, remote = true) {
    if (remote) {
      const k = damp(10, dt), ox = this.x, oz = this.z;
      this.x = lerp(this.x, this.tx, k); this.z = lerp(this.z, this.tz, k); this.ry = angLerp(this.ry, this.tr, k);
      this.speed = Math.hypot(this.x - ox, this.z - oz) / Math.max(dt, 1e-3);
    }
    const moving = this.speed > 0.3;
    this.walk += dt * (moving ? 10 : 0);
    const sw = moving ? Math.sin(this.walk) * 0.6 : lerp(this.legs[0].rotation.x, 0, damp(10, dt));
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw; this.arms[0].rotation.x = -sw * 0.8; this.arms[1].rotation.x = sw * 0.8;
    if (this.mach && !moving) { this.arms[0].rotation.x = this.arms[1].rotation.x = -1.1; }
    this.place();
    if (this.bubble) { this.bubbleT -= dt; if (this.bubbleT <= 0) { this.g.remove(this.bubble); this.bubble = null; } }
  }
  dispose() { scene.remove(this.g); }
}

// ================================================================ state
let token = localStorage.getItem('na_token');
if (!token) { token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('na_token', token); }
const COLORS = ['#ff3db8', '#3df2ff', '#ffe03d', '#7dff5a', '#b07cff', '#ff8a3d', '#ffffff', '#ff4d4d'];
let myName = localStorage.getItem('na_name') || '', myColor = localStorage.getItem('na_color') || COLORS[Math.floor(Math.random() * COLORS.length)];
let ws = null, myId = null, ME = null, built = false, LB = [], ONLINE = 1;
const players = new Map();
let myAv = null;
const P = { x: 0, z: 3, ry: Math.PI, speed: 0 };
let mode = 'walk'; // walk | machine | watch
let active = null; // { view, ctrl, watching }
let camYaw = 0, camPitch = 0.4;
const camLook = new THREE.Vector3(0, 1.3, 0);
let dispTix = 0;

// ================================================================ UI helpers
function toast(text, cls = '', ms = 2200) { const d = el('div', cls, text); $('#toasts').appendChild(d); setTimeout(() => d.remove(), ms); }
function annAdd(text, kind = 'win') { const box = $('#ann'); const d = el('div', kind, text); box.appendChild(d); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => d.remove(), 6000); }
function chatAdd(name, color, text) {
  const log = $('#chatlog'); const d = el('div'); const b = el('b', null, name + ':'); b.style.color = color; d.append(b, document.createTextNode(text)); log.appendChild(d);
  while (log.children.length > 5) log.firstChild.remove(); setTimeout(() => d.remove(), 15000);
}
function panel(html) { const p = $('#panel'); p.innerHTML = html; p.classList.remove('hidden'); }
function hidePanel() { $('#panel').classList.add('hidden'); $('#panel').innerHTML = ''; }
function openModal(build) { const b = $('#modalBody'); b.innerHTML = ''; build(b); $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modalClose').onclick = closeModal;
function updateWallet(dt) {
  if (!ME) return;
  $('#credits').textContent = money(ME.credits);
  if (dispTix !== ME.tickets) {
    const diff = ME.tickets - dispTix;
    const stepN = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * dt * 4));
    dispTix = Math.abs(stepN) >= Math.abs(diff) ? ME.tickets : dispTix + stepN;
    if (diff > 0 && Math.random() < 0.4) sfx.ticket();
  }
  $('#tickets').textContent = dispTix.toLocaleString();
}
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

// ================================================================ login
(function setupLogin() {
  $('#loading').classList.add('hidden');
  const nameIn = $('#nameIn'); nameIn.value = myName;
  const cbox = $('#colors');
  for (const c of COLORS) {
    const d = el('div'); d.style.background = c; if (c === myColor) d.classList.add('sel');
    d.onclick = () => { myColor = c; [...cbox.children].forEach((x) => x.classList.remove('sel')); d.classList.add('sel'); };
    cbox.appendChild(d);
  }
  const go = () => {
    myName = nameIn.value.trim().slice(0, 16) || 'Player' + Math.floor(Math.random() * 1000);
    localStorage.setItem('na_name', myName); localStorage.setItem('na_color', myColor);
    initAudio(); $('#loginMsg').textContent = 'Connecting...'; $('#goBtn').disabled = true; connect();
  };
  $('#goBtn').onclick = go;
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
})();

// ================================================================ networking
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => send({ t: 'hello', token, name: myName, color: myColor });
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(m); };
  ws.onclose = () => {
    if (built) { toast('Connection lost, reconnecting...', 'bad'); if (mode !== 'walk') exitMachine(true); }
    else { $('#loginMsg').textContent = 'Could not connect to server. Retrying...'; }
    setTimeout(connect, 2000);
  };
}
setInterval(() => send({ t: 'p' }), 20000);

function handle(m) {
  switch (m.t) {
    case 'welcome': {
      myId = m.id; ME = m.me; ITEMS = m.items; CATALOG = m.catalog; WHEELV = m.wheel; CFG = m.cfg; LB = m.lb || [];
      dispTix = ME.tickets;
      if (m.token && m.token !== token) { token = m.token; localStorage.setItem('na_token', token); }
      if (!built) {
        for (const d of m.machines) views.set(d.id, new MView(d));
        P.x = m.x; P.z = m.z; P.ry = Math.PI; camYaw = 0;
        myAv = new Avatar({ id: myId, name: ME.name, color: ME.color, x: P.x, z: P.z, ry: P.ry });
        built = true;
        $('#login').classList.add('hidden'); $('#hud').classList.remove('hidden');
        setTimeout(() => { $('#hint').style.opacity = 0; }, 9000);
      } else {
        for (const d of m.machines) { const v = views.get(d.id); if (!v) continue; v.occupant = d.occupant; if (d.prizes && v.setPrizes) v.setPrizes(d.prizes); if (d.slots && v.setSlots) v.setSlots(d.slots); }
      }
      for (const a of players.values()) a.dispose(); players.clear();
      for (const p of m.players) players.set(p.id, new Avatar(p));
      ONLINE = m.players.length + 1; $('#online').textContent = `${ONLINE} online`;
      break;
    }
    case 'pj': if (!players.has(m.p.id) && m.p.id !== myId) players.set(m.p.id, new Avatar(m.p)); ONLINE++; $('#online').textContent = `${ONLINE} online`; break;
    case 'pq': { const a = players.get(m.id); if (a) { a.dispose(); players.delete(m.id); } ONLINE = Math.max(1, ONLINE - 1); $('#online').textContent = `${ONLINE} online`; break; }
    case 'pl': { const p = m.p; for (let i = 0; i < p.length; i += 5) { if (p[i] === myId) continue; const a = players.get(p[i]); if (a) { a.tx = p[i + 1]; a.tz = p[i + 2]; a.tr = p[i + 3]; a.mach = p[i + 4] || null; } } break; }
    case 'me': ME = m.me; break;
    case 'tk': if (m.n > 0) { const v = views.get(m.src); if (v && v.def.type === 'pusher' && active && active.view === v) { /* small feedback */ if (m.n >= 25) toast(`+${m.n} TICKETS`, 'win', 1400); } } break;
    case 'pfull': { const v = views.get(m.m); if (v) v.snapshot(m); break; }
    case 'pz': { const v = views.get(m.m); if (v) v.delta(m); break; }
    case 'bonus': { const v = views.get(m.m); if (v) v.bonus(m.label, m.by); if (active && active.view === v) { toast(m.label, 'win', 2500); sfx.win(); } break; }
    case 'occ': {
      const v = views.get(m.m); if (!v) break; v.occupant = m.by;
      if (!m.by) { v.reset(); if (active && active.watching && active.view === v) { toast('Player left the machine'); } }
      break;
    }
    case 'enterres': {
      const v = views.get(m.m); if (!v) break;
      if (m.ok) startMachine(v, false); else { toast(`In use by ${m.by}. You can watch!`, 'bad'); }
      break;
    }
    case 'playres': if (active && active.ctrl.onPlay) active.ctrl.onPlay(m); break;
    case 'grabres': if (active && active.ctrl.onGrab) active.ctrl.onGrab(m); break;
    case 'keyres': if (active && active.ctrl.onRes) active.ctrl.onRes(m); break;
    case 'stackres': if (active && active.ctrl.onRes) active.ctrl.onRes(m); break;
    case 'wheel': {
      const v = views.get(m.m); if (!v) break;
      const mine = m.by === myId;
      v.startSpin(m.seg, () => { if (mine && active && active.ctrl.onSpinDone) active.ctrl.onSpinDone(WHEELV[m.seg]); });
      if (v.spin) v.spin.mine = mine || (active && active.view === v);
      break;
    }
    case 'claw': { const v = views.get(m.m); if (v) v.setPrizes(m.prizes); break; }
    case 'keys': { const v = views.get(m.m); if (v && !(active && active.view === v && !active.watching && active.ctrl.busy)) v.setSlots(m.slots); else if (v) v.pendingSlots = m.slots; break; }
    case 'ms': { if (active && !active.watching && active.view.def.id === m.m) break; const v = views.get(m.m); if (v) v.applyRemote(m.s); break; }
    case 'ann': annAdd(m.text, m.kind); break;
    case 'chat': { chatAdd(m.name, m.color, m.text); const a = m.id === myId ? myAv : players.get(m.id); if (a) a.say(m.text); break; }
    case 'lb': LB = m.lb; if (m.online) { ONLINE = m.online; $('#online').textContent = `${ONLINE} online`; } break;
    case 'err': toast(m.text, 'bad'); break;
    case 'toast': toast(m.text, 'win'); sfx.win(); break;
    case 'refilled': CFG.lastRefill = m.lastRefill; toast('+' + money(CFG.refillAmount) + ' credits!', 'win'); sfx.coin(); if (active && active.ctrl.refresh) active.ctrl.refresh(); break;
  }
}

// ================================================================ machine mode
function startMachine(v, watching) {
  closeModal();
  mode = watching ? 'watch' : 'machine';
  const ctrl = watching ? WatchCtrl : (CTRL[v.def.type] || WatchCtrl);
  active = { view: v, ctrl, watching };
  P.x = v.standW.x; P.z = v.standW.z; P.ry = v.def.ry + Math.PI;
  if (!watching) sendMove(true);
  myAv.g.visible = false;
  $('#prompt').classList.add('hidden'); $('#exitBtn').classList.remove('hidden'); $('#hint').style.opacity = 0;
  ctrl.open(v);
}
function exitMachine(silent) {
  if (!active) return;
  const v = active.view;
  if (active.ctrl.close) active.ctrl.close();
  if (!active.watching && !silent) send({ t: 'leave' });
  if (v.local !== undefined) v.local = false;
  active = null; mode = 'walk';
  myAv.g.visible = true; hidePanel(); $('#exitBtn').classList.add('hidden');
  camYaw = v.def.ry; camPitch = 0.4;
}
$('#exitBtn').onclick = () => exitMachine(false);

function machineCamera() {
  const v = active.view, t = v.t;
  const aspect = camera.aspect;
  const f = aspect < 1 ? clamp(0.62 / aspect, 1, 1.75) : 1;
  const look = v.toW(...t.look);
  const pos = v.toW(t.look[0] + (t.cam[0] - t.look[0]) * f, t.look[1] + (t.cam[1] - t.look[1]) * f, t.look[2] + (t.cam[2] - t.look[2]) * f);
  return { pos, look };
}

// ---------------------------------------------------------------- controllers
const WatchCtrl = {
  open(v) {
    const who = players.get(v.occupant);
    panel(`<div class="status">Watching ${who ? escapeHtml(who.name) : 'this machine'}</div><div class="sub2">You will see every move live.</div>`);
  },
};
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const PusherCtrl = {
  open(v) {
    this.v = v; this.aim = 0; this.auto = false; this.autoT = 0; this.last = 0; v.aim.visible = true;
    panel(`<div class="status">Tap the playfield or drag the bar to aim</div>
      <div class="aimbar" id="aimbar"><div class="knob" id="aimKnob"></div></div>
      <div class="row"><button class="big huge" id="dropBtn">DROP ${money(v.def.price)}</button><button class="alt" id="autoBtn">AUTO: OFF</button></div>
      <div class="sub2">Coin off the edge = ${CFG.coinTickets} tix &middot; Pink token = ${CFG.goldTickets} tix &middot; Bonus slot hits randomly</div>`);
    const bar = $('#aimbar');
    const setAim = (e) => { const r = bar.getBoundingClientRect(); this.aim = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1) * 0.86; this.syncKnob(); };
    bar.addEventListener('pointerdown', (e) => { bar.setPointerCapture(e.pointerId); setAim(e); });
    bar.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') setAim(e); });
    $('#dropBtn').onclick = () => this.drop();
    $('#autoBtn').onclick = () => { this.auto = !this.auto; $('#autoBtn').textContent = 'AUTO: ' + (this.auto ? 'ON' : 'OFF'); };
    this.syncKnob();
  },
  syncKnob() { const k = $('#aimKnob'); if (k) k.style.left = ((this.aim / 0.86 + 1) / 2) * 100 + '%'; },
  drop() {
    const now = performance.now(); if (now - this.last < 260) return; this.last = now;
    if (ME.credits < this.v.def.price) { toast('Out of credits! Visit the Change Machine.', 'bad'); this.auto = false; const b = $('#autoBtn'); if (b) b.textContent = 'AUTO: OFF'; return; }
    send({ t: 'drop', m: this.v.def.id, x: this.aim }); sfx.coin();
  },
  tap(e, kb) {
    if (kb) return this.drop();
    const hit = pickPoint(e, this.v.field); if (!hit) return;
    const l = this.v.g.worldToLocal(hit.clone()); this.aim = clamp(l.x, -0.86, 0.86); this.syncKnob(); this.drop();
  },
  update(dt) {
    this.v.aim.position.x = lerp(this.v.aim.position.x, this.aim, damp(18, dt));
    if (this.auto) { this.autoT -= dt; if (this.autoT <= 0) { this.autoT = 0.55; this.drop(); } }
  },
  close() { this.v.aim.visible = false; this.auto = false; },
};

const ClawCtrl = {
  open(v) { this.v = v; v.local = true; v.reset(); this.phase = 'idle'; this.msT = 0; this.idle(); },
  idle() {
    this.phase = 'idle';
    panel(`<div class="status">${money(this.v.def.price)} per try &middot; 20 seconds to aim</div><div class="row"><button class="big huge" id="startBtn">START</button></div><div class="sub2">Aim with the arrows, then DROP. Dead-center grabs hold best.</div>`);
    $('#startBtn').onclick = () => { $('#startBtn').disabled = true; send({ t: 'play' }); };
  },
  onPlay(m) {
    if (!m.ok) return this.idle();
    sfx.click(); this.phase = 'move'; this.time = 20; this.dir = { x: 0, z: 0 }; this.v.cs.w = null;
    panel(`<div class="status" id="cStatus">20</div><div class="row" style="gap:18px">
      <div class="dpad"><button class="up" data-d="0,-1">&#9650;</button><button class="left" data-d="-1,0">&#9664;</button><button class="down" data-d="0,1">&#9660;</button><button class="right" data-d="1,0">&#9654;</button></div>
      <button class="big huge" id="grabBtn">DROP</button></div>`);
    for (const b of document.querySelectorAll('.dpad button')) {
      const [dx, dz] = b.dataset.d.split(',').map(Number);
      const on = (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); this.dir = { x: dx, z: dz }; };
      const off = () => { this.dir = { x: 0, z: 0 }; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    }
    $('#grabBtn').onclick = () => this.startDrop();
  },
  startDrop() { if (this.phase !== 'move') return; this.phase = 'drop'; this.dir = { x: 0, z: 0 }; const s = $('#cStatus'); if (s) s.textContent = 'Dropping...'; sfx.click(); },
  doGrab() {
    const cs = this.v.cs; let best = null, bd = 9;
    for (const m of this.v.prizes.values()) { if (m.userData.gone) continue; const d = Math.hypot(m.userData.home.x - cs.x, m.userData.home.z - cs.z); if (d < bd) { bd = d; best = m; } }
    this.pid = best && bd < 0.17 ? best.userData.pid : null;
    send({ t: 'grab', pid: this.pid, d: bd }); this.waitT = 3;
  },
  onGrab(m) { this.won = m.won; this.wonItem = m.item; if (this.pid != null) this.v.cs.h = this.pid; this.phase = 'lift'; },
  update(dt) {
    const cs = this.v.cs;
    switch (this.phase) {
      case 'move': {
        cs.x = clamp(cs.x + this.dir.x * 0.5 * dt, -0.62, 0.62); cs.z = clamp(cs.z + this.dir.z * 0.5 * dt, -0.55, 0.5);
        this.time -= dt; const s = $('#cStatus'); if (s) s.textContent = Math.ceil(this.time) + 's';
        if (this.time <= 0) this.startDrop(); break;
      }
      case 'drop': cs.y = Math.min(1, cs.y + dt * 0.85); if (cs.y >= 1) this.phase = 'close'; break;
      case 'close': cs.o = Math.max(0, cs.o - dt * 2.2); if (cs.o <= 0) { this.phase = 'wait'; this.doGrab(); } break;
      case 'wait': this.waitT -= dt; if (this.waitT <= 0) { this.won = false; this.phase = 'lift'; } break;
      case 'lift':
        cs.y = Math.max(0, cs.y - dt * 0.7);
        if (!this.won && cs.h != null && cs.y < 0.5) { cs.h = null; cs.o = 0.5; sfx.lose(); }
        if (cs.y <= 0) this.phase = 'return'; break;
      case 'return': {
        const dx = -0.55 - cs.x, dz = 0.45 - cs.z, d = Math.hypot(dx, dz), st = 0.6 * dt;
        if (d <= st) { cs.x = -0.55; cs.z = 0.45; this.phase = 'release'; } else { cs.x += (dx / d) * st; cs.z += (dz / d) * st; }
        break;
      }
      case 'release':
        cs.o = Math.min(1, cs.o + dt * 2.5);
        if (cs.o >= 1) {
          if (cs.h != null && this.won) { this.v.chuteDrop(cs.h); cs.w = cs.h; cs.h = null; toast(`YOU WON: ${ITEMS[this.wonItem]?.name || 'a prize'}!`, 'win', 3000); sfx.win(); }
          else toast(this.pid != null ? 'It slipped! So close...' : 'Missed!', 'bad');
          this.phase = 'done'; this.doneT = 1.2;
        }
        break;
      case 'done': this.doneT -= dt; if (this.doneT <= 0) { cs.w = null; this.idle(); } break;
    }
    this.msT -= dt;
    if (this.msT <= 0 && this.phase !== 'idle') { this.msT = 0.1; send({ t: 'ms', m: this.v.def.id, s: { x: +cs.x.toFixed(3), z: +cs.z.toFixed(3), y: +cs.y.toFixed(3), o: +cs.o.toFixed(2), h: cs.h, w: cs.w } }); }
  },
  close() { this.v.local = false; this.phase = 'idle'; },
};

const KeyCtrl = {
  open(v) { this.v = v; v.local = true; v.reset(); this.busy = false; this.msT = 0; this.idle(); },
  idle() {
    this.phase = 'idle'; this.busy = false;
    if (this.v.pendingSlots) { this.v.setSlots(this.v.pendingSlots); this.v.pendingSlots = null; }
    panel(`<div class="status">${money(this.v.def.price)} per play</div><div class="row"><button class="big huge" id="startBtn">START</button></div><div class="sub2">Stop the key dead-center on a prize lock. Then pray it turns.</div>`);
    $('#startBtn').onclick = () => { $('#startBtn').disabled = true; send({ t: 'play' }); };
  },
  onPlay(m) {
    if (!m.ok) return this.idle();
    this.phase = 'run'; this.busy = true; this.s = 0; this.dir = 1; this.speed = 3.4; this.lastSlot = -1;
    panel(`<div class="status" id="kStatus">Tap STOP (or the screen)</div><div class="row"><button class="big huge" id="stopBtn">STOP</button></div>`);
    $('#stopBtn').onclick = () => this.stop();
  },
  tap() { this.stop(); },
  stop() {
    if (this.phase !== 'run') return;
    this.phase = 'push'; this.pushT = 0;
    const p = keyPath(this.s); this.slot = p.slot; this.aligned = Math.abs(p.frac - 0.5) < 0.18;
    send({ t: 'keystop', slot: p.slot, aligned: this.aligned }); sfx.click();
  },
  onRes(m) {
    this.res = m;
    setTimeout(() => {
      if (m.won) { this.v.openSlot(m.slot); toast(`UNLOCKED: ${ITEMS[m.item]?.name}!`, 'win', 3200); sfx.win(); }
      else { toast(!m.aligned ? 'Missed the lock!' : m.item ? "SO CLOSE! The key didn't turn..." : 'Empty slot!', 'bad'); sfx.lose(); }
      setTimeout(() => { this.v.keyPush = 0; if (m.won && this.v.slots) { this.v.slots[m.slot] = null; } this.idle(); }, 1600);
    }, 450);
  },
  update(dt) {
    const v = this.v;
    if (this.phase === 'run') {
      this.s += this.dir * this.speed * dt;
      if (this.s >= 14.999) { this.s = 14.999; this.dir = -1; } if (this.s <= 0) { this.s = 0; this.dir = 1; }
      const sl = keyPath(this.s).slot; if (sl !== this.lastSlot) { this.lastSlot = sl; sfx.tick(); }
      v.keyS = this.s;
    } else if (this.phase === 'push') { this.pushT += dt; v.keyPush = Math.min(1, this.pushT / 0.35); }
    this.msT -= dt;
    if (this.msT <= 0 && this.phase !== 'idle') { this.msT = 0.1; send({ t: 'ms', m: v.def.id, s: { s: +v.keyS.toFixed(3), p: +v.keyPush.toFixed(2) } }); }
  },
  close() { this.v.local = false; },
};

const StackCtrl = {
  W: 7,
  open(v) { this.v = v; v.reset(); this.msT = 0; this.idle(); },
  idle() {
    this.phase = 'idle';
    panel(`<div class="status">${money(this.v.def.price)} per play</div><div class="row"><button class="big huge" id="startBtn">START</button></div><div class="sub2">Stack 11 rows for a MINOR prize, all 15 for the MAJOR. Gets faster every row!</div>`);
    $('#startBtn').onclick = () => { $('#startBtn').disabled = true; send({ t: 'play' }); };
  },
  cap(row) { return row < 4 ? 3 : row < 9 ? 2 : 1; },
  interval(row) { return Math.max(0.045, 0.15 - row * 0.0072); },
  onPlay(m) {
    if (!m.ok) return this.idle();
    const v = this.v; v.grid = Array(15).fill(0);
    this.row = 0; this.width = 3; this.pos = 0; this.dir = 1; this.stepT = 0; this.phase = 'run';
    this.runPanel();
  },
  runPanel() { panel(`<div class="status" id="sStatus">Row ${this.row + 1} / 15</div><div class="row"><button class="big huge" id="stopBtn">STOP</button></div>`); $('#stopBtn').onclick = () => this.stop(); },
  tap() { this.stop(); },
  mask() { return ((1 << this.width) - 1) << this.pos; },
  stop() {
    if (this.phase !== 'run') return;
    const v = this.v; let mk = this.mask();
    if (this.row > 0) mk &= v.grid[this.row - 1];
    sfx.click();
    if (!mk) { this.phase = 'over'; v.cur = { row: -1, mask: 0 }; v.flash = 1.2; sfx.lose(); this.finish(this.row, 'none'); return; }
    v.grid[this.row] = mk; this.row++;
    const bits = mk.toString(2).replace(/0/g, '').length;
    this.width = Math.min(bits, this.cap(this.row)); this.pos = 0; this.dir = 1; this.stepT = 0;
    v.cur = { row: -1, mask: 0 }; v.render();
    if (this.row === 15) { this.phase = 'over'; v.flash = 2; this.finish(15, 'major'); return; }
    if (this.row === 11) {
      this.phase = 'decide';
      panel(`<div class="status">MINOR PRIZE REACHED!</div><div class="row"><button class="big go" id="takeBtn">TAKE MINOR</button><button class="big" id="goOnBtn">GO FOR MAJOR</button></div>`);
      $('#takeBtn').onclick = () => { this.phase = 'over'; this.finish(11, 'minor'); };
      $('#goOnBtn').onclick = () => { this.phase = 'run'; this.runPanel(); };
      return;
    }
    const s = $('#sStatus'); if (s) s.textContent = `Row ${this.row + 1} / 15`;
  },
  finish(row, take) { send({ t: 'stackend', row, take }); panel(`<div class="status">${take === 'none' ? 'GAME OVER' : 'WINNER!'}</div>`); },
  onRes(m) {
    if (m.item) { toast(`YOU WON: ${ITEMS[m.item]?.name}!`, 'win', 3500); sfx.win(); }
    else if (m.tickets) toast(`+${m.tickets} tickets`, '', 1800);
    setTimeout(() => { this.v.reset(); this.sendState(); this.idle(); }, 2200);
  },
  sendState() { const v = this.v; send({ t: 'ms', m: v.def.id, s: { g: v.grid, r: v.cur.row, k: v.cur.mask } }); },
  update(dt) {
    const v = this.v;
    if (this.phase === 'run') {
      this.stepT += dt;
      while (this.stepT >= this.interval(this.row)) {
        this.stepT -= this.interval(this.row);
        this.pos += this.dir;
        if (this.pos + this.width > this.W) { this.pos = this.W - this.width - 1; this.dir = -1; }
        if (this.pos < 0) { this.pos = 1; this.dir = 1; }
      }
      v.cur = { row: this.row, mask: this.mask() }; v.render();
    }
    this.msT -= dt;
    if (this.msT <= 0 && this.phase !== 'idle') { this.msT = 0.08; this.sendState(); }
  },
};

const WheelCtrl = {
  open(v) { this.v = v; this.idle(); },
  idle() {
    panel(`<div class="status">${money(this.v.def.price)} per spin &middot; up to 500 tickets</div><div class="row"><button class="big huge" id="spinBtn">SPIN</button></div>`);
    $('#spinBtn').onclick = () => { $('#spinBtn').disabled = true; send({ t: 'play' }); };
    if (this.v.spin) $('#spinBtn').disabled = true;
  },
  onPlay(m) { if (!m.ok) { const b = $('#spinBtn'); if (b) b.disabled = false; } },
  onSpinDone(val) { toast(`+${val} TICKETS`, val >= 100 ? 'win' : '', 2200); if (val >= 100) sfx.win(); this.idle(); },
};

const CounterCtrl = {
  open() { panel(`<div class="row"><button class="big huge" id="menuBtn">PRIZE MENU</button></div>`); $('#menuBtn').onclick = () => showPrizes(); showPrizes(); },
};
function showPrizes(tab = 'redeem') {
  openModal((b) => {
    b.appendChild(el('h2', null, 'Prize Counter'));
    b.appendChild(el('div', 'sub', `You have ${ME.tickets.toLocaleString()} tickets`));
    const tabs = el('div', 'tabs');
    const t1 = el('button', tab === 'redeem' ? 'sel' : '', 'Redeem'), t2 = el('button', tab === 'bag' ? 'sel' : '', 'My Bag');
    t1.onclick = () => showPrizes('redeem'); t2.onclick = () => showPrizes('bag'); tabs.append(t1, t2); b.appendChild(tabs);
    const grid = el('div', 'grid'); b.appendChild(grid);
    if (tab === 'redeem') {
      for (const id of CATALOG) {
        const it = ITEMS[id]; const c = el('div', 'prize');
        const sw = el('div', 'sw', ''); sw.style.background = it.color; c.appendChild(sw);
        c.appendChild(el('div', 'nm', it.name)); c.appendChild(el('div', 'ct', it.cost.toLocaleString() + ' tix'));
        const btn = el('button', 'go', 'Redeem'); btn.disabled = ME.tickets < it.cost;
        btn.onclick = () => { send({ t: 'redeem', item: id }); setTimeout(() => showPrizes('redeem'), 300); };
        c.appendChild(btn); grid.appendChild(c);
      }
    } else fillBag(grid);
  });
}
function fillBag(grid) {
  const entries = Object.entries(ME.inv || {}).filter(([, n]) => n > 0);
  if (!entries.length) { grid.appendChild(el('div', 'sub', 'No prizes yet. Go win some!')); return; }
  for (const [id, n] of entries) {
    const it = ITEMS[id] || { name: id, color: '#888' }; const c = el('div', 'prize');
    const sw = el('div', 'sw', 'x' + n); sw.style.background = it.color; c.appendChild(sw); c.appendChild(el('div', 'nm', it.name)); grid.appendChild(c);
  }
}
const ChangeCtrl = {
  open() { this.refresh(); },
  refresh() {
    const wait = Math.max(0, CFG.refillCooldownMs - (Date.now() - (CFG.lastRefill || 0)));
    const eligible = ME.credits < CFG.refillBelow;
    panel(`<div class="status">Balance: ${money(ME.credits)}</div><div class="row"><button class="big go huge" id="refillBtn">GET ${money(CFG.refillAmount)}</button></div>
      <div class="sub2">${eligible ? (wait > 0 ? `Refilling... ready in ${Math.ceil(wait / 1000)}s` : 'Free refill ready!') : `Free refills unlock when you drop below ${money(CFG.refillBelow)}.`}</div>`);
    $('#refillBtn').disabled = !eligible || wait > 0;
    $('#refillBtn').onclick = () => send({ t: 'refill' });
  },
  update(dt) { this.t = (this.t || 0) - dt; if (this.t <= 0) { this.t = 1; this.refresh(); } },
};
const CTRL = { pusher: PusherCtrl, claw: ClawCtrl, key: KeyCtrl, stacker: StackCtrl, wheel: WheelCtrl, counter: CounterCtrl, change: ChangeCtrl };

// ================================================================ HUD buttons
$('#invBtn').onclick = () => openModal((b) => { b.appendChild(el('h2', null, 'My Bag')); b.appendChild(el('div', 'sub', `${ME.tickets.toLocaleString()} tickets · ${money(ME.credits)} · lifetime ${ME.total.toLocaleString()} tix`)); const g = el('div', 'grid'); b.appendChild(g); fillBag(g); });
$('#lbBtn').onclick = () => openModal((b) => {
  b.appendChild(el('h2', null, 'Top Ticket Winners'));
  const t = el('table', 'lb');
  if (!LB.length) b.appendChild(el('div', 'sub', 'No winners yet. Be the first!'));
  LB.forEach((r, i) => { const tr = el('tr'); const n = el('td', null, `${i + 1}. ${r.name}`); n.style.color = r.color; tr.append(n, el('td', null, r.total.toLocaleString())); t.appendChild(tr); });
  b.appendChild(t);
});
$('#chatBtn').onclick = () => openModal((b) => {
  b.appendChild(el('h2', null, 'Chat'));
  const inp = el('input'); inp.maxLength = 120; inp.placeholder = 'Say something...'; b.appendChild(inp);
  const sendIt = (txt) => { const v = (txt ?? inp.value).trim(); if (v) send({ t: 'chat', text: v }); closeModal(); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendIt(); });
  const row = el('div', 'row'); const sb = el('button', 'big', 'Send'); sb.onclick = () => sendIt(); row.appendChild(sb); b.appendChild(row);
  const q = el('div', 'row'); q.style.marginTop = '10px';
  for (const s of ['GG!', 'Nice win!', 'JACKPOT!', 'So close...', 'Come watch!', 'lol']) { const x = el('button', null, s); x.onclick = () => sendIt(s); q.appendChild(x); }
  b.appendChild(q); setTimeout(() => inp.focus(), 50);
});

// ================================================================ input
const keys = {};
addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; keys[e.code] = true; if (e.code === 'Escape' && active) exitMachine(false); if ((e.code === 'Space' || e.code === 'Enter') && active && active.ctrl.tap) { e.preventDefault(); active.ctrl.tap(e, true); } if (e.code === 'KeyE' && mode === 'walk' && nearMachine) $('#promptBtn').click(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; const look = { id: null, lx: 0, ly: 0 };
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickPoint(e, mesh) {
  if (!e || e.clientX === undefined) return null;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); raycaster.setFromCamera(ndc, camera);
  const h = raycaster.intersectObject(mesh, false); return h.length ? h[0].point : null;
}
canvas.addEventListener('pointerdown', (e) => {
  if (!built) return;
  if (mode !== 'walk') { if (active && active.ctrl.tap) active.ctrl.tap(e); return; }
  canvas.setPointerCapture(e.pointerId);
  if (e.clientX < innerWidth * 0.45 && joy.id === null) {
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
    const jb = $('#joyBase'); jb.style.left = e.clientX + 'px'; jb.style.top = e.clientY + 'px'; jb.classList.remove('hidden'); $('#joyKnob').style.transform = '';
    $('#hint').style.opacity = 0;
  } else if (look.id === null) { look.id = e.pointerId; look.lx = e.clientX; look.ly = e.clientY; }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const d = Math.hypot(dx, dy), R = 55;
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    joy.x = dx / R; joy.y = dy / R; $('#joyKnob').style.transform = `translate(${dx}px,${dy}px)`;
  } else if (e.pointerId === look.id) {
    camYaw -= (e.clientX - look.lx) * 0.006; camPitch = clamp(camPitch + (e.clientY - look.ly) * 0.004, 0.05, 1.1);
    look.lx = e.clientX; look.ly = e.clientY;
  }
});
const endPtr = (e) => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; $('#joyBase').classList.add('hidden'); } if (e.pointerId === look.id) look.id = null; };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ================================================================ walking, collisions, proximity
let nearMachine = null, lastSent = { x: 0, z: 0, ry: 0, t: 0 };
function collide() {
  const R = 0.3;
  P.x = clamp(P.x, -ROOM + R, ROOM - R); P.z = clamp(P.z, -ROOM + R, ROOM - R);
  for (const v of views.values()) {
    const d = v.def, t = v.t, c = Math.cos(d.ry), s = Math.sin(d.ry);
    const wx = P.x - d.x, wz = P.z - d.z;
    let lx = wx * c - wz * s, lz = wx * s + wz * c - t.cz;
    const ex = t.hw + R, ez = t.hd + R;
    if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
      const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
      if (px < pz) lx = Math.sign(lx || 1) * ex; else lz = Math.sign(lz || 1) * ez;
      lz += t.cz;
      P.x = d.x + lx * c + lz * s; P.z = d.z - lx * s + lz * c;
    }
  }
  for (const [x, z] of PILLARS) { const dx = P.x - x, dz = P.z - z, d = Math.hypot(dx, dz), m = 0.25 + R; if (d < m && d > 0) { P.x = x + (dx / d) * m; P.z = z + (dz / d) * m; } }
}
function sendMove(force) {
  const now = performance.now();
  if (!force && now - lastSent.t < 100) return;
  if (!force && Math.abs(P.x - lastSent.x) < 0.01 && Math.abs(P.z - lastSent.z) < 0.01 && Math.abs(P.ry - lastSent.ry) < 0.02) return;
  lastSent = { x: P.x, z: P.z, ry: P.ry, t: now };
  send({ t: 'mv', x: +P.x.toFixed(2), z: +P.z.toFixed(2), ry: +P.ry.toFixed(2) });
}
function updateWalk(dt) {
  let mx = joy.x, mz = joy.y;
  if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  const len = Math.hypot(mx, mz);
  if (len > 0.08) {
    const n = Math.min(1, len), fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const dx = (rx * mx - fx * mz) / len, dz = (rz * mx - fz * mz) / len;
    const sp = 3.4 * n;
    P.x += dx * sp * dt; P.z += dz * sp * dt; P.ry = angLerp(P.ry, Math.atan2(dx, dz), damp(12, dt)); P.speed = sp;
  } else P.speed = 0;
  collide();
  // proximity
  let best = null, bd = 1.5;
  for (const v of views.values()) { const d = Math.hypot(P.x - v.standW.x, P.z - v.standW.z); if (d < bd) { bd = d; best = v; } }
  if (best !== nearMachine || (best && best.occupant !== nearMachine?._lastOcc)) {
    nearMachine = best;
    const pr = $('#prompt');
    if (!best) pr.classList.add('hidden');
    else {
      best._lastOcc = best.occupant;
      const shared = best.def.type === 'counter' || best.def.type === 'change';
      const busy = !shared && best.occupant && best.occupant !== myId;
      const who = busy ? players.get(best.occupant) : null;
      $('#promptLabel').textContent = busy ? `${best.def.name}: ${who ? who.name : 'someone'} is playing` : best.def.name + (best.def.price ? ` · ${money(best.def.price)}` : '');
      $('#promptBtn').textContent = shared ? (best.def.type === 'counter' ? 'OPEN COUNTER' : 'USE MACHINE') : busy ? 'IN USE' : 'PLAY';
      $('#promptBtn').disabled = !!busy;
      $('#watchBtn').classList.toggle('hidden', !busy);
      pr.classList.remove('hidden');
    }
  }
}
$('#promptBtn').onclick = () => { if (nearMachine && mode === 'walk') { sfx.click(); send({ t: 'enter', m: nearMachine.def.id }); } };
$('#watchBtn').onclick = () => { if (nearMachine && mode === 'walk') startMachine(nearMachine, true); };

function updateCamera(dt) {
  let pos, lookAt;
  if (active) { const mc = machineCamera(); pos = mc.pos; lookAt = mc.look; }
  else {
    const D = 4.4;
    pos = new THREE.Vector3(P.x + Math.sin(camYaw) * Math.cos(camPitch) * D, 1.4 + Math.sin(camPitch) * D, P.z + Math.cos(camYaw) * Math.cos(camPitch) * D);
    pos.x = clamp(pos.x, -ROOM + 0.3, ROOM - 0.3); pos.z = clamp(pos.z, -ROOM + 0.3, ROOM - 0.3); pos.y = Math.min(pos.y, 3.9);
    lookAt = new THREE.Vector3(P.x, 1.35, P.z);
  }
  const k = damp(active ? 6 : 10, dt);
  camera.position.lerp(pos, k); camLook.lerp(lookAt, k); camera.lookAt(camLook);
}

// ================================================================ main loop
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (built) {
    if (mode === 'walk') updateWalk(dt);
    myAv.x = P.x; myAv.z = P.z; myAv.ry = P.ry; myAv.speed = P.speed; myAv.mach = active ? active.view.def.id : null; myAv.update(dt, false);
    sendMove(false);
    for (const v of views.values()) v.update(dt);
    for (const a of players.values()) a.update(dt);
    if (active && active.ctrl.update) active.ctrl.update(dt);
    updateCamera(dt); updateWallet(dt);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Draws the minimap into a canvas card in the top-right corner. The rules live in minimap.js.
import {worldToMap, clampToRim, rangeFor, ZOOMS, objectiveLine} from './minimap.js';

const SIZE = 184;
const PHASE_LABEL = {assembly: 'PLANET A · BUILD', outfit: 'PLANET A · CHECKS', route: 'PLANET A · ROUTE', gonogo: 'PLANET A · GO / NO-GO',
  flight: 'IN FLIGHT', surface: 'PLANET B', delivery: 'PLANET A · DELIVERY'};

export function createMinimapView() {
  const el = document.createElement('div');
  el.id = 'ag-map'; el.hidden = true;
  el.innerHTML = '<div class="map-title"></div><canvas></canvas><div class="map-legend"></div><div class="map-counts"></div><div class="map-hint">M · ZOOM</div>';
  document.body.appendChild(el);
  const canvas = el.querySelector('canvas'), dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = SIZE * dpr; canvas.style.width = canvas.style.height = SIZE + 'px';
  const g = canvas.getContext('2d'); g.scale(dpr, dpr);
  let zoom = 1, t = 0;

  function draw(m) {
    // m = {phase, center:{x,z}, yaw, entities, ctx(for legend), counts}
    t += 0.05;
    const range = rangeFor(m.phase, zoom), k = SIZE / 2 / range, c = SIZE / 2;
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath(); g.arc(c, c, c - 1, 0, Math.PI * 2); g.clip();
    const bg = g.createRadialGradient(c, c, 8, c, c, c); bg.addColorStop(0, '#2a2236'); bg.addColorStop(1, '#14101c'); g.fillStyle = bg; g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = '#ffffff1c'; g.lineWidth = 1;
    for (const f of [1 / 3, 2 / 3]) { g.beginPath(); g.arc(c, c, c * f, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(c, 0); g.lineTo(c, SIZE); g.moveTo(0, c); g.lineTo(SIZE, c); g.stroke();
    const project = (x, z) => worldToMap(x, z, m.center.x, m.center.z, m.yaw, range, SIZE);
    for (const e of m.entities) {
      const p = project(e.x, e.z);
      g.fillStyle = e.color; g.strokeStyle = e.color;
      if (e.kind === 'ship' || e.kind === 'rivalShip' || e.kind === 'outline') {
        if (!p.inside && Math.hypot(p.x - c, p.y - c) > c + 60) continue;
        g.save(); g.translate(p.x, p.y); g.rotate(-m.yaw);
        g.globalAlpha = e.kind === 'outline' ? 0.9 : 0.35;
        if (e.shape === 'circle') { g.beginPath(); g.arc(0, 0, e.r * k, 0, Math.PI * 2); g.fill(); g.globalAlpha = 0.9; g.stroke(); }
        else { const hx = (e.hx ?? 8) * k, hz = (e.hz ?? 16) * k; g.fillRect(-hx, -hz, hx * 2, hz * 2); g.globalAlpha = 0.9; g.lineWidth = 1.5; g.strokeRect(-hx, -hz, hx * 2, hz * 2); }
        g.restore(); continue;
      }
      if (e.kind === 'objective') {
        const q = clampToRim(p, SIZE, 9), pulse = 5 + Math.sin(t * 3) * 1.5;
        g.lineWidth = 2; g.globalAlpha = 0.95; g.beginPath(); g.arc(q.x, q.y, p.inside ? pulse + 2 : 5, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(q.x, q.y, 2, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; continue;
      }
      if (!p.inside) continue;
      g.globalAlpha = 1;
      if (e.kind === 'mate') { g.beginPath(); g.arc(p.x, p.y, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1c1424'; g.font = '700 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e.label, p.x, p.y + 0.5); }
      else if (e.kind === 'flag') { g.beginPath(); g.moveTo(p.x, p.y - 4.5); g.lineTo(p.x + 3.5, p.y); g.lineTo(p.x, p.y + 4.5); g.lineTo(p.x - 3.5, p.y); g.closePath(); g.fill(); }
      else if (e.kind === 'enemy') { g.beginPath(); g.arc(p.x, p.y, 3.5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#0008'; g.stroke(); }
      else if (e.kind === 'hazard') { g.beginPath(); g.arc(p.x, p.y, 2.5, 0, Math.PI * 2); g.fill(); }
      else { g.fillRect(p.x - 3, p.y - 3, 6, 6); }                       // racks, supplies, tests, stow, receiver
    }
    // you: an arrow in the middle, pointing up (heading-up map)
    g.globalAlpha = 1; g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(c, c - 8); g.lineTo(c + 5.5, c + 6); g.lineTo(c, c + 3); g.lineTo(c - 5.5, c + 6); g.closePath(); g.fill();
    g.restore();
    // north marker on the rim
    const nx = -Math.sin(m.yaw), ny = -Math.cos(m.yaw);                      // direction of world north (-Z) on the map
    g.fillStyle = '#f7ce59'; g.font = '700 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', c + nx * (c - 9), c + ny * (c - 9));
    g.strokeStyle = '#ffffff55'; g.lineWidth = 1.5; g.beginPath(); g.arc(c, c, c - 1, 0, Math.PI * 2); g.stroke();
    el.querySelector('.map-title').textContent = PHASE_LABEL[m.phase] || 'MAP';
    el.querySelector('.map-legend').textContent = objectiveLine(m.legend);
    el.querySelector('.map-counts').textContent = m.counts;
  }
  return {draw, setVisible(v) { el.hidden = !v; }, cycleZoom() { zoom = (zoom + 1) % ZOOMS.length; return zoom; }, get zoom() { return zoom; }, el};
}

// Repair minigame modal. Pure DOM; all rules live in repairs-core.js.
import {createJob, REPAIR_TITLE, rotatePipe, flow, tryFuse, tryTiming, timingPosition, explain, pieceMask} from './repairs-core.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const GLYPH = {5: '┃', 10: '━', 3: '┗', 6: '┏', 12: '┓', 9: '┛'};      // N|S, E|W, N|E, E|S, S|W, W|N

// Opens a repair on top of `host`. onDone receives {kind, ok, seconds, attempts}; onClose fires when the
// modal goes away for any reason. Returns a close function.
export function openRepair(host, kind, sheet, seed, onDone, onClose) {
  const job = createJob(kind, sheet, seed);
  const started = performance.now();
  const box = document.createElement('div');
  box.className = 'ag-repair';
  box.innerHTML = `<div class="ag-repair-card"><div class="ce-overline">REPAIR · ${esc(REPAIR_TITLE[kind])}</div><div class="ag-repair-body"></div><p class="ag-repair-msg" aria-live="polite"></p><div class="ag-repair-why" hidden></div><div class="ag-repair-actions"><button type="button" class="ag-repair-cancel">LEAVE THE REPAIR</button></div></div>`;
  host.appendChild(box);
  const body = box.querySelector('.ag-repair-body'), msg = box.querySelector('.ag-repair-msg'), why = box.querySelector('.ag-repair-why');
  let raf = 0, closed = false, finished = false;

  const say = (t, tone = '') => { msg.textContent = t; msg.dataset.tone = tone; };
  function finish(ok) {
    if (finished) return;
    finished = true;
    const result = {kind, ok, seconds: (performance.now() - started) / 1000, attempts: job.attempts ?? job.moves ?? 0};
    why.hidden = false;
    why.textContent = explain(job, sheet);
    box.querySelector('.ag-repair-cancel').textContent = 'BACK TO THE SHIP ↩';
    onDone?.(result);
  }

  if (kind === 'fuse') {
    body.innerHTML = `<p>The fuse is burnt. Your ship's systems draw <b>${job.loadKW.toFixed(2)} kW</b> on a <b>${job.volts} V</b> bus. Pick the spare that fits.</p><div class="ag-fuse-row">${job.options.map(o => `<button type="button" data-fuse="${o}"><b>${o} A</b><small>spare fuse</small></button>`).join('')}</div>`;
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-fuse]');
      if (!b || finished) return;
      job.attempts = (job.attempts || 0) + 1;
      const out = tryFuse(job, Number(b.dataset.fuse));
      if (out === 'ok') { say('Fuse seated. Power restored.', 'good'); b.dataset.state = 'ok'; finish(true); }
      else if (out === 'blows') { say(`${b.dataset.fuse} A is too small: it blows on the first surge. Try another.`, 'bad'); b.dataset.state = 'bad'; b.disabled = true; }
      else { say(`${b.dataset.fuse} A is too large: the wire would overheat before it trips. Try another.`, 'bad'); b.dataset.state = 'bad'; b.disabled = true; }
    });
  } else if (kind === 'fuel') {
    const paint = () => {
      const {wet, solved} = flow(job);
      body.querySelector('.ag-pipes').innerHTML = job.grid.map((row, r) => row.map((cell, c) =>
        `<button type="button" class="ag-pipe" data-r="${r}" data-c="${c}" data-wet="${wet.has(`${r},${c}`)}" aria-label="pipe row ${r + 1} column ${c + 1}">${GLYPH[pieceMask(cell.type, cell.rot)]}</button>`).join('')).join('');
      if (solved && !finished) { say('Fuel is flowing to the engine.', 'good'); finish(true); }
    };
    body.innerHTML = `<p>Click a pipe to turn it. Connect the <b>tank</b> on the left to the <b>engine</b> on the right.</p><div class="ag-pipe-wrap"><span>TANK →</span><div class="ag-pipes" style="--cols:${job.cols}"></div><span>→ ENGINE</span></div>`;
    body.addEventListener('click', e => {
      const b = e.target.closest('.ag-pipe');
      if (!b || finished) return;
      rotatePipe(job, Number(b.dataset.r), Number(b.dataset.c));
      paint();
    });
    paint();
  } else {
    body.innerHTML = `<p>Slide the new cartridge in when the marker is inside the green window. Press <b>Space</b> or the button.</p><div class="ag-timing"><i class="ag-timing-window" style="left:${(job.target - job.width / 2) * 100}%;width:${job.width * 100}%"></i><i class="ag-timing-marker"></i></div><button type="button" class="ag-timing-stop">INSERT CARTRIDGE</button>`;
    const marker = body.querySelector('.ag-timing-marker');
    const tick = now => { if (closed || finished) return; marker.style.left = timingPosition((now - started) / 1000) * 100 + '%'; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const stop = () => {
      if (finished) return;
      const r = tryTiming(job, (performance.now() - started) / 1000);
      if (r.hit) { say('Cartridge seated. CO₂ is scrubbing again.', 'good'); finish(true); }
      else say('Missed the window. Wait for the marker and try again.', 'bad');
    };
    body.querySelector('.ag-timing-stop').addEventListener('click', stop);
    box._space = e => { if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); stop(); } };
    addEventListener('keydown', box._space, true);
  }

  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    if (box._space) removeEventListener('keydown', box._space, true);
    box.remove();
    onClose?.();
  }
  box.querySelector('.ag-repair-cancel').addEventListener('click', close);
  return close;
}

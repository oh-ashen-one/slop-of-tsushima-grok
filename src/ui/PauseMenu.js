/**
 * Pause / settings overlay.
 *
 * DOM rather than canvas, because sliders and buttons want to be real controls.
 * It is created lazily the first time Escape is pressed, so a session that never
 * opens it pays nothing, and it is never created at all in capture mode (the
 * HUD does not construct it there).
 *
 * Quality changes reload the page with `?quality=`, which is the only honest way
 * to switch preset: half the systems bake their preset into buffers and
 * geometry at init() and cannot be re-specced live.
 */

const CSS = `
#rs-menu{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at 50% 42%,rgba(8,7,5,.7),rgba(0,0,0,.92));
  font-family:"Hiragino Mincho ProN","Hiragino Mincho Pro","Yu Mincho","YuMincho","MS PMincho","Songti SC","Times New Roman",Georgia,serif;color:#e8dcc0;
  opacity:0;transition:opacity .36s ease}
#rs-menu.on{opacity:1}
#rs-menu .panel{width:min(420px,82vw);padding:36px 42px 28px;border:none;
  background:transparent}
#rs-menu h2{margin:0;font-weight:400;font-size:12px;letter-spacing:.58em;
  text-transform:uppercase;color:#d4b45c;text-indent:.58em;text-align:center}
#rs-menu .kana{margin:8px 0 0;font-size:13px;letter-spacing:.46em;color:#8a7340;
  text-indent:.46em;text-align:center}
#rs-menu .rule{height:1px;margin:18px auto 26px;width:72px;
  background:#d4b45c;opacity:.55}
#rs-menu .row{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 16px}
#rs-menu .lbl{font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#8a8070}
#rs-menu .val{font-size:11px;letter-spacing:.16em;color:#c4b48a;min-width:44px;text-align:right}
#rs-menu input[type=range]{-webkit-appearance:none;appearance:none;width:180px;height:1px;
  background:rgba(212,180,92,.28);outline:none;cursor:pointer}
#rs-menu input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:8px;height:8px;
  border-radius:50%;background:#d4b45c;cursor:pointer}
#rs-menu input[type=range]::-moz-range-thumb{width:8px;height:8px;border:0;border-radius:50%;background:#d4b45c}
#rs-menu .seg{display:flex;gap:0}
#rs-menu .seg button{font-family:inherit;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;
  padding:5px 9px;background:none;color:#7a7060;border:1px solid rgba(212,180,92,.18);
  border-right:none;cursor:pointer;transition:color .2s,background .2s}
#rs-menu .seg button:last-child{border-right:1px solid rgba(212,180,92,.18)}
#rs-menu .seg button:hover{color:#e8dcc0}
#rs-menu .seg button.on{color:#0c0a07;background:#d4b45c}
#rs-menu .keys{margin-top:22px;border-top:1px solid rgba(212,180,92,.14);padding-top:16px;
  display:grid;grid-template-columns:auto 1fr;gap:7px 16px;font-size:10px;letter-spacing:.12em;color:#6e6658}
#rs-menu .keys b{font-weight:400;color:#c4b48a;letter-spacing:.2em}
#rs-menu .foot{margin-top:22px;font-size:9px;letter-spacing:.32em;text-transform:uppercase;
  color:#5a5346;text-align:center}
`;

const QUALITIES = ['low', 'medium', 'high', 'ultra'];

export class PauseMenu {
  constructor(ctx, hud) {
    this.ctx = ctx;
    this.hud = hud;
    this.el = null;
    this.open = false;
  }

  _build() {
    if (this.el) return;
    const style = document.createElement('style');
    style.id = 'rs-menu-css';
    style.textContent = CSS;
    document.head.appendChild(style);
    this._style = style;

    const el = document.createElement('div');
    el.id = 'rs-menu';
    const q = (this.ctx.quality && this.ctx.quality.name) || 'high';
    const A = this.ctx.get('audio');
    const vol = A && A.getMasterVolume ? A.getMasterVolume() : 0.85;

    el.innerHTML = `
      <div class="panel">
        <h2>Golden Field</h2>
        <div class="kana">黄金の野</div>
        <div class="rule"></div>
        <div class="row">
          <span class="lbl">Sound</span>
          <input id="rs-vol" type="range" min="0" max="100" value="${Math.round(vol * 100)}">
          <span class="val" id="rs-vol-v">${Math.round(vol * 100)}</span>
        </div>
        <div class="row">
          <span class="lbl">Quality</span>
          <span class="seg" id="rs-q">${QUALITIES.map((n) => `<button data-q="${n}"${n === q ? ' class="on"' : ''}>${n}</button>`).join('')}</span>
        </div>
        <div class="row">
          <span class="lbl">Interface</span>
          <span class="seg" id="rs-hud">
            <button data-h="1" class="on">Shown</button><button data-h="0">Hidden</button>
          </span>
        </div>
        <div class="keys">
          <b>W A S D</b><span>walk &amp; ride</span>
          <b>Shift</b><span>run</span>
          <b>Mouse</b><span>look — click to capture the pointer</span>
          <b>E</b><span>mount · 馬</span>
          <b>Space</b><span>jump</span>
          <b>Ctrl</b><span>crouch</span>
          <b>H</b><span>hide the interface</span>
          <b>M</b><span>mute</span>
          <b>Esc</b><span>pause</span>
        </div>
        <div class="foot">press escape to return</div>
      </div>`;
    (document.getElementById('app') || document.body).appendChild(el);
    this.el = el;

    const vslider = el.querySelector('#rs-vol');
    const vlabel = el.querySelector('#rs-vol-v');
    vslider.addEventListener('input', () => {
      const v = parseInt(vslider.value, 10) / 100;
      vlabel.textContent = String(Math.round(v * 100));
      const a = this.ctx.get('audio');
      if (a && a.setMasterVolume) { a.setMasterVolume(v); if (a.resume) a.resume(); }
    });

    el.querySelector('#rs-q').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const u = new URL(location.href);
      u.searchParams.set('quality', b.dataset.q);
      location.href = u.toString();
    });

    el.querySelector('#rs-hud').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const on = b.dataset.h === '1';
      this.hud.setVisible(on);
      for (const s of el.querySelectorAll('#rs-hud button')) s.classList.toggle('on', s === b);
    });
  }

  toggle() { return this.open ? this.close() : this.show(); }

  show() {
    this._build();
    this.open = true;
    this.el.style.display = 'flex';
    this.el.style.pointerEvents = 'auto';
    requestAnimationFrame(() => this.el && this.el.classList.add('on'));
    const a = this.ctx.get('audio');
    if (a && a.resume) a.resume();
    return true;
  }

  close() {
    this.open = false;
    if (!this.el) return false;
    this.el.classList.remove('on');
    this.el.style.pointerEvents = 'none';
    setTimeout(() => { if (this.el && !this.open) this.el.style.display = 'none'; }, 340);
    return false;
  }

  dispose() {
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    if (this._style && this._style.parentNode) this._style.parentNode.removeChild(this._style);
    this.el = null;
  }
}

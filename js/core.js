/* ===========================================================
   core.js — 工具 / 输入 / 时间
   =========================================================== */
window.RB = window.RB || {};

(function (RB) {
  'use strict';

  /* ---------------- 数学工具 ---------------- */
  const U = RB.U = {
    clamp: (v, a, b) => v < a ? a : (v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    /** 帧率无关的指数逼近 */
    damp: (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt)),
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: arr => arr[Math.floor(Math.random() * arr.length)],
    sign: v => v < 0 ? -1 : (v > 0 ? 1 : 0),
    /** 角度插值 */
    approach: (a, b, step) => a < b ? Math.min(a + step, b) : Math.max(a - step, b),
    smoothstep: t => t * t * (3 - 2 * t),
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    /** 矩形相交 */
    hit: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
    /** 把值格式化成分数样式 */
    pad: (n, l) => String(n).padStart(l, '0'),
  };

  /* ---------------- 输入 ---------------- */
  const KEYMAP = {
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    Space: 'jump',
    KeyJ: 'light',
    KeyK: 'skill',
    KeyL: 'guard',
    KeyU: 'ultra',
    ShiftLeft: 'dash', ShiftRight: 'dash',
    KeyP: 'pause', Escape: 'pause',
    Enter: 'confirm',
  };

  class Input {
    constructor() {
      this.down = {};        // 当前按住
      this.pressed = {};     // 本帧刚按下
      this.released = {};    // 本帧刚抬起
      this._queued = {};     // 帧内累积的按下
      this._qrelease = {};
      this.anyKey = false;
      this.gamepadIndex = null;
      this._gpPrev = {};
    }

    attach(target) {
      target = target || window;
      target.addEventListener('keydown', e => {
        const a = KEYMAP[e.code];
        if (!a) return;
        if (e.repeat) { e.preventDefault(); return; }
        e.preventDefault();
        this._queued[a] = true;
        this.anyKey = true;
      });
      target.addEventListener('keyup', e => {
        const a = KEYMAP[e.code];
        if (!a) return;
        e.preventDefault();
        this._qrelease[a] = true;
      });
      window.addEventListener('blur', () => this.clear());
      window.addEventListener('gamepadconnected', e => { this.gamepadIndex = e.gamepad.index; });
    }

    /** 每帧开始：把队列转成 down/pressed */
    beginFrame() {
      this.pressed = {};
      this.released = {};
      for (const k in this._queued) {
        if (!this.down[k]) this.pressed[k] = true;
        this.down[k] = true;
      }
      for (const k in this._qrelease) {
        if (this.down[k]) this.released[k] = true;
        this.down[k] = false;
      }
      this._queued = {}; this._qrelease = {};
      this._pollGamepad();
    }

    _pollGamepad() {
      if (this.gamepadIndex === null || !navigator.getGamepads) return;
      const gp = navigator.getGamepads()[this.gamepadIndex];
      if (!gp) return;
      const map = { 0: 'light', 1: 'skill', 2: 'guard', 3: 'ultra', 4: 'dash', 5: 'dash',
                    12: 'up', 13: 'down', 14: 'left', 15: 'right' };
      const states = {};
      gp.buttons.forEach((b, i) => {
        const a = map[i]; if (!a) return;
        states[a] = states[a] || b.pressed || b.value > .5;
      });
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (ax < -.35) states.left = true;
      if (ax > .35) states.right = true;
      if (ay < -.4) states.up = true;
      if (ay > .4) states.down = true;
      for (const k in states) {
        const was = !!this._gpPrev[k];
        if (states[k] && !was) this.pressed[k] = true;
        if (!states[k] && was) this.released[k] = true;
        this.down[k] = states[k];
      }
    }

    /** 消费某个按键的 pressed（防止一处触发多处响应） */
    consume(a) { if (this.pressed[a]) { this.pressed[a] = false; return true; } return false; }
    clear() { this.down = {}; this.pressed = {}; this.released = {}; this._queued = {}; this._qrelease = {}; }
  }
  RB.Input = new Input();

  /* ---------------- 固定步长循环 ---------------- */
  class Loop {
    constructor(fps, update, render) {
      this.step = 1000 / fps;
      this.update = update;
      this.render = render;
      this.acc = 0;
      this.last = 0;
      this.running = false;
      this.frame = 0;
      this.fpsSample = 60;
      this._smoothFps = 60;
    }
    start() {
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      const tick = (now) => {
        if (!this.running) return;
        let dt = now - this.last;
        this.last = now;
        // 防止切标签回来时爆炸
        if (dt > 250) dt = this.step;
        this.acc += dt;
        let guard = 0;
        while (this.acc >= this.step && guard < 5) {
          this.update(this.step / 1000);
          this.acc -= this.step;
          this.frame++;
          guard++;
        }
        if (guard >= 5) this.acc = 0;
        this._smoothFps += ((1000 / Math.max(dt, 1)) - this._smoothFps) * .05;
        this.fpsSample = this._smoothFps;
        this.render();
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }
    stop() { this.running = false; if (this._raf) cancelAnimationFrame(this._raf); }
  }
  RB.Loop = Loop;

  /* ---------------- 简易事件总线 ---------------- */
  RB.bus = {
    _h: {},
    on(k, f) { (this._h[k] = this._h[k] || []).push(f); },
    emit(k, d) { const l = this._h[k]; if (l) for (const f of l) f(d); },
  };

})(window.RB);

/* ===========================================================
   audio.js — 程序化音效（无音频素材，全部合成）
   风格：刀风 / 骨裂 / 金铁 / 太鼓 / 尺八氛围
   =========================================================== */
(function (RB) {
  'use strict';

  const A = RB.Audio = {
    ctx: null, master: null, sfxGain: null, musGain: null,
    enabled: true, ready: false,
    _noiseBuf: null,

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = .55;
      // 轻微压缩，避免爆音
      let out = this.master;
      if (this.ctx.createDynamicsCompressor) {
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 10;
        comp.ratio.value = 8; comp.attack.value = .002; comp.release.value = .2;
        this.master.connect(comp); comp.connect(this.ctx.destination); out = null;
        this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = .9; this.sfxGain.connect(this.master);
        this.musGain = this.ctx.createGain(); this.musGain.gain.value = .34; this.musGain.connect(this.master);
      } else {
        this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
        this.musGain = this.ctx.createGain(); this.musGain.connect(this.master);
      }
      // 预生成噪声缓冲
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
      this.ready = true;
    },

    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setVolume(v) { if (this.master) this.master.gain.value = RB.U.clamp(v, 0, 1) * .55; },

    /* ---------- 底层构件 ---------- */
    _noise(t0, dur, vol, type, freq, q, sweepTo) {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this._noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type || 'bandpass';
      f.frequency.setValueAtTime(freq, t0);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
      f.Q.value = q || 1;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + Math.min(.008, dur * .18));
      g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t0); src.stop(t0 + dur + .02);
      return { g, f, src };
    },

    _tone(t0, dur, vol, f0, f1, type, dest) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + Math.min(.01, dur * .2));
      g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(t0); o.stop(t0 + dur + .02);
      return { o, g };
    },

    /* ---------- 音效库 ---------- */
    play(name, opt) {
      if (!this.enabled) return;
      this.init();
      if (!this.ready || !this.ctx || this.ctx.state === 'suspended') return;
      opt = opt || {};
      const t = this.ctx.currentTime + .001;
      const v = opt.vol === undefined ? 1 : opt.vol;
      switch (name) {
        case 'slash':   // 刀风
          this._noise(t, .16, .34 * v, 'bandpass', 2600, 1.6, 900);
          this._noise(t + .01, .1, .16 * v, 'highpass', 4200, .9, 2400);
          break;
        case 'slashhvy': // 重刀风
          this._noise(t, .3, .42 * v, 'bandpass', 1500, 1.2, 420);
          this._noise(t, .12, .2 * v, 'lowpass', 900, .8);
          break;
        case 'hit':      // 命中：低频冲击 + 骨裂
          this._tone(t, .13, .5 * v, 170, 52, 'sine');
          this._noise(t, .11, .3 * v, 'bandpass', 900, 1.1, 300);
          this._noise(t + .005, .05, .17 * v, 'highpass', 2400, .8);
          break;
        case 'hitbig':
          this._tone(t, .34, .74 * v, 130, 34, 'sine');
          this._tone(t + .01, .2, .3 * v, 96, 40, 'triangle');
          this._noise(t, .28, .42 * v, 'lowpass', 1400, .7, 260);
          this._noise(t, .06, .24 * v, 'highpass', 3200, .8);
          break;
        case 'crit':
          this._tone(t, .2, .5 * v, 420, 90, 'square');
          this._noise(t, .3, .4 * v, 'bandpass', 3200, 1.4, 700);
          break;
        case 'guard':    // 格挡：金铁
          this._tone(t, .22, .3 * v, 1750, 1180, 'triangle');
          this._noise(t, .2, .3 * v, 'bandpass', 3400, 3.2, 1600);
          break;
        case 'parry':    // 弹反：清脆
          this._tone(t, .34, .38 * v, 2600, 3400, 'triangle');
          this._tone(t + .02, .3, .22 * v, 3900, 2600, 'sine');
          this._noise(t, .26, .3 * v, 'bandpass', 5200, 4, 2400);
          break;
        case 'step':
          this._noise(t, .06, .11 * v, 'bandpass', 420, 1.2, 180);
          break;
        case 'dash':
          this._noise(t, .22, .24 * v, 'bandpass', 1100, .9, 4200);
          break;
        case 'jump':
          this._noise(t, .12, .18 * v, 'bandpass', 800, 1, 2200);
          break;
        case 'charge':   // 蓄力
          this._tone(t, .6, .22 * v, 190, 900, 'sawtooth');
          this._noise(t, .6, .2 * v, 'bandpass', 500, 2.4, 3000);
          break;
        case 'skill':    // 居合出刀
          this._tone(t, .5, .3 * v, 1600, 320, 'sawtooth');
          this._noise(t + .06, .42, .38 * v, 'bandpass', 3600, 1.3, 500);
          break;
        case 'ultra':    // 奥义
          this._tone(t, 1.1, .4 * v, 90, 700, 'sawtooth');
          this._noise(t, 1.3, .34 * v, 'bandpass', 700, 1.1, 5200);
          this._tone(t + .5, .8, .3 * v, 320, 80, 'triangle');
          break;
        case 'explode':
          this._tone(t, .7, .6 * v, 110, 26, 'sine');
          this._noise(t, .6, .5 * v, 'lowpass', 2200, .6, 160);
          break;
        case 'hurt':
          this._tone(t, .24, .42 * v, 300, 90, 'sawtooth');
          this._noise(t, .16, .3 * v, 'bandpass', 1300, 1, 400);
          break;
        case 'die':
          this._tone(t, .85, .4 * v, 240, 40, 'triangle');
          this._noise(t, .6, .3 * v, 'lowpass', 1100, .8, 180);
          break;
        case 'ui':
          this._tone(t, .09, .18 * v, 900, 1300, 'triangle');
          break;
        case 'uiok':
          this._tone(t, .14, .22 * v, 700, 1500, 'triangle');
          this._tone(t + .06, .2, .18 * v, 1200, 1900, 'sine');
          break;
        case 'pressure': // 血雨滴落氛围
          this._tone(t, .3, .12 * v, 1400, 600, 'sine');
          break;
        case 'tong':     // 太鼓
          this._tone(t, .8, .7 * v, 92, 44, 'sine');
          this._noise(t, .3, .22 * v, 'lowpass', 700, .7, 120);
          break;
      }
    },

    /* ---------- 氛围音垫（持续 drone） ---------- */
    startAmbience() {
      this.init();
      if (!this.ready || this._amb) return;
      const c = this.ctx, t = c.currentTime;
      const g = c.createGain(); g.gain.value = 0; g.connect(this.musGain);
      // 低频 drone
      const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.4;
      const o3 = c.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 110;
      const og = c.createGain(); og.gain.value = .5;
      // 缓慢颤动
      const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = .07;
      const lfoG = c.createGain(); lfoG.gain.value = .28;
      lfo.connect(lfoG); lfoG.connect(og.gain);
      // 风声
      const nz = c.createBufferSource(); nz.buffer = this._noiseBuf; nz.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 480; nf.Q.value = .6;
      const ng = c.createGain(); ng.gain.value = .05;
      nz.connect(nf); nf.connect(ng); ng.connect(g);
      o1.connect(og); o2.connect(og); o3.connect(og); og.connect(g);
      o1.start(t); o2.start(t); o3.start(t); lfo.start(t); nz.start(t);
      g.gain.setTargetAtTime(.5, t, 3);
      this._amb = { g, o1, o2, o3, nz, lfo };
    },

    stopAmbience() {
      if (!this._amb) return;
      const t = this.ctx.currentTime;
      this._amb.g.gain.setTargetAtTime(0, t, .6);
      const amb = this._amb;
      setTimeout(() => {
        try { amb.o1.stop(); amb.o2.stop(); amb.o3.stop(); amb.nz.stop(); amb.lfo.stop(); } catch (e) {}
      }, 2600);
      this._amb = null;
    },

    /** 战斗紧张度 0..1 — 影响 drone 音量与音高 */
    setIntensity(v) {
      if (!this._amb) return;
      const t = this.ctx.currentTime;
      this._amb.g.gain.setTargetAtTime(.32 + v * .5, t, .8);
      this._amb.o1.frequency.setTargetAtTime(55 + v * 26, t, 1.2);
      this._amb.o2.frequency.setTargetAtTime(82.4 + v * 39, t, 1.2);
    },
  };

})(window.RB);

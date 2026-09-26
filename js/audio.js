(function (RB) {
  'use strict';

  const SE = 'assets/se/';

  /* 逻辑音效 -> 素材表（多个素材随机取一，音量可按手感微调）
     f: 文件名  v: 基础音量  nj: 不做随机音高抖动（用于完整乐句） */
  const BANK = {
    ui:       { f: ['032-Switch01.ogg', '036-Switch05.ogg'], v: .50 },
    uiok:     { f: ['004-System04.ogg', '005-System05.ogg'], v: .55 },
    step:     { f: ['pat1.wav', 'pat2.wav', 'pat3.wav'], v: .38 },
    jump:     { f: ['015-Jump01.ogg', '016-Jump02.ogg'], v: .42 },
    dash:     { f: ['021-Dive01.ogg', 'disappear.wav'], v: .52 },
    slash:    { f: ['062-Swing01.ogg', '063-Swing02.ogg', '064-Swing03.ogg', 'atk.wav'], v: .60 },
    slashhvy: { f: ['065-Swing04.ogg', 'bianzi.wav'], v: .70 },
    hit:      { f: ['hit.wav', 'Fight43.wav', 'Fight229.wav'], v: .60 },
    hitbig:   { f: ['Fight16.wav', '093-Attack05.ogg'], v: .80 },
    crit:     { f: ['sharpcut.wav', 'glasscrash.wav'], v: .50 },
    guard:    { f: ['block.wav', 'defence.wav'], v: .60 },
    parry:    { f: ['metalcrash.wav', 'reflection.WAV'], v: .80 },
    charge:   { f: ['141-Burst01.ogg', '142-Burst02.ogg'], v: .45 },
    skill:    { f: ['atks.WAV', '157-Skill01.ogg'], v: .75 },
    ultra:    { f: ['baofa.ogg', '050-Explosion03.ogg'], v: .85 },
    explode:  { f: ['048-Explosion01.ogg', '050-Explosion03.ogg'], v: .70 },
    hurt:     { f: ['blood.wav', 'bloods.wav'], v: .60 },
    die:      { f: ['deadbreath.wav', 'mourn.wav'], v: .80, nj: true },
    pressure: { f: ['water.wav', '126-Water01.ogg'], v: .30 },
    tong:     { f: ['052-Cannon01.ogg', '053-Cannon02.ogg'], v: .50 },   // 波次来袭 / Boss 登场
    sting:    { f: ['samurai_stinger.wav'], v: .85, nj: true },          // 过章乐句
  };

  /* 常驻环境音层（循环） */
  const AMBIENCE = [
    { f: '005-Rain01.ogg', v: .90 },   // 雨
    { f: '001-Wind01.ogg', v: .50 },   // 风
    { f: '016-Drips01.ogg', v: .34 },  // 滴水
  ];

  const A = RB.Audio = {
    ctx: null, master: null, sfxGain: null, musGain: null, ambGain: null,
    enabled: true, ready: false, loaded: false,
    buf: {},          // 文件名 -> AudioBuffer

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
        // 环境音走独立总线，不跟着 musGain 一起被压低
        this.ambGain = this.ctx.createGain(); this.ambGain.gain.value = .85; this.ambGain.connect(this.master);
      } else {
        this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = .9; this.sfxGain.connect(this.master);
        this.musGain = this.ctx.createGain(); this.musGain.gain.value = .34; this.musGain.connect(this.master);
        this.ambGain = this.ctx.createGain(); this.ambGain.gain.value = .85; this.ambGain.connect(this.master);
      }
      this.ready = true;
    },

    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setVolume(v) { if (this.master) this.master.gain.value = RB.U.clamp(v, 0, 1) * .55; },

    /* ---------- 素材预解码 ---------- */
    /** 汇总去重后的文件清单 */
    _fileList() {
      const seen = {}, list = [];
      const add = f => { if (f && !seen[f]) { seen[f] = 1; list.push(f); } };
      for (const k in BANK) BANK[k].f.forEach(add);
      AMBIENCE.forEach(a => add(a.f));
      return list;
    },

    /** 加载并解码全部素材，onProgress(done, total) */
    async load(onProgress) {
      this.init();
      const list = this._fileList();
      if (!this.ready) { if (onProgress) onProgress(list.length, list.length); return; }
      let done = 0;
      await Promise.all(list.map(async f => {
        try {
          const res = await fetch(SE + f);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          this.buf[f] = await this.ctx.decodeAudioData(await res.arrayBuffer());
        } catch (e) {
          console.warn('[audio fail]', f, e && e.message);
        }
        done++;
        if (onProgress) onProgress(done, list.length);
      }));
      this.loaded = true;
      const miss = list.filter(f => !this.buf[f]);
      console.info('[audio] 已载入 ' + (list.length - miss.length) + '/' + list.length +
        (miss.length ? '；失败: ' + miss.join(', ') : ''));
    },

    /** 从素材组里取一个已解码的 buffer */
    _pick(files) {
      const ok = files.filter(f => this.buf[f]);
      return ok.length ? this.buf[ok[Math.floor(Math.random() * ok.length)]] : null;
    },

    /* ---------- 播放 ---------- */
    play(name, opt) {
      if (!this.enabled) return;
      this.init();
      if (!this.ready || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      opt = opt || {};
      const v = opt.vol === undefined ? 1 : opt.vol;
      const e = BANK[name];
      const buf = e && this._pick(e.f);
      if (!buf) return;   // 素材缺失则静默
      const t = this.ctx.currentTime + .001;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opt.rate || (e.nj ? 1 : RB.U.rand(.94, 1.06));
      const g = this.ctx.createGain();
      g.gain.value = (e.v === undefined ? .7 : e.v) * v;
      src.connect(g); g.connect(this.sfxGain);
      src.start(t);
      return src;
    },

    /* ---------- 环境音（雨 / 风 / 滴水 循环采样） ---------- */
    startAmbience() {
      this.init();
      if (!this.ready || this._amb) return;
      const c = this.ctx, t = c.currentTime;
      const layers = AMBIENCE.filter(a => this.buf[a.f]);
      if (!layers.length) { console.warn('[audio] 环境音素材未加载'); return; }
      const g = c.createGain(); g.gain.value = 0; g.connect(this.ambGain);
      const list = [];
      for (const a of layers) {
        const src = c.createBufferSource();
        src.buffer = this.buf[a.f];
        src.loop = true;
        const gg = c.createGain(); gg.gain.value = a.v;
        src.connect(gg); gg.connect(g);
        src.start(t + Math.random() * .4);   // 错开循环相位
        list.push(src);
      }
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 1.5);   // 1.5s 淡入，进入即可听见
      this._amb = { g, list, drone: false };
      console.info('[audio] 环境音启动，层数 =', layers.length);
    },

    stopAmbience() {
      if (!this._amb) return;
      const amb = this._amb, t = this.ctx.currentTime;
      amb.g.gain.setTargetAtTime(0, t, .6);
      setTimeout(() => { for (const s of amb.list) { try { s.stop(); } catch (e) {} } }, 2600);
      this._amb = null;
    },

    /** 战斗紧张度 0..1 — 推高环境音 */
    setIntensity(v) {
      if (!this._amb) return;
      const t = this.ctx.currentTime;
      this._amb.g.gain.setTargetAtTime(.8 + v * .35, t, .8);
    },
  };

})(window.RB);

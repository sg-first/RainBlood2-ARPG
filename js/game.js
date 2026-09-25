/* ===========================================================
   game.js — 主循环 / 世界 / 相机 / 流程
   =========================================================== */
(function (RB) {
  'use strict';
  const U = RB.U, Fx = RB.Fx, C = RB.CFG, Snd = RB.Audio, Post = RB.Post, UI = RB.UI;

  const Game = RB.Game = {
    canvas: null, ctx: null,
    dpr: 1,
    mode: 'load',          // load | title | playing | paused | over
    world: null,
    level: null,
    player: null,
    enemies: [],
    cam: { x: 0, y: 0, shakeAt: 0, t: 0 },
    stats: null,
    loop: null,
    lastHp: 0,
    deadT: 0,
    winT: 0,
    time: 0,
    slowmo: 0,
    introT: 0,
    _waveClearT: 0,

    /* ================= 初始化 ================= */
    init() {
      this.canvas = document.getElementById('game');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      RB.Input.attach(window);
      this._resize();
      window.addEventListener('resize', () => this._resize());
      Post.init(C.VIEW_W, C.VIEW_H, 1);
      this._bindUI();
    },

    _resize() {
      const cv = this.canvas;
      const wrap = document.getElementById('stage');
      const availW = wrap.clientWidth, availH = wrap.clientHeight;
      const s = Math.min(availW / C.VIEW_W, availH / C.VIEW_H);
      cv.style.width = Math.floor(C.VIEW_W * s) + 'px';
      cv.style.height = Math.floor(C.VIEW_H * s) + 'px';
      // 内部分辨率固定 1280x720，保证画面一致
      cv.width = C.VIEW_W; cv.height = C.VIEW_H;
      this.dpr = 1;
    },

    _bindUI() {
      const $ = id => document.getElementById(id);
      this.el = {
        loader: $('loader'), loadBar: $('loadBar'), loadTip: $('loadTip'),
        title: $('title'), help: $('help'), pause: $('pause'), over: $('over'),
        overTitle: $('overTitle'), overQuote: $('overQuote'), overStats: $('overStats'),
        banner: $('sceneBanner'), bannerText: $('bannerText'), bannerSub: $('bannerSub'),
      };
      $('btnStart').onclick = () => { Snd.resume(); Snd.play('uiok'); this.startRun(); };
      $('btnHelp').onclick = () => { Snd.play('ui'); this.el.title.classList.add('hidden'); this.el.help.classList.remove('hidden'); };
      $('btnHelpBack').onclick = () => { Snd.play('ui'); this.el.help.classList.add('hidden'); this.el.title.classList.remove('hidden'); };
      $('btnResume').onclick = () => { Snd.play('ui'); this.resume(); };
      $('btnRestart').onclick = () => { Snd.play('uiok'); this.startRun(); };
      $('btnQuit').onclick = () => { Snd.play('ui'); this.toTitle(); };
      $('btnAgain').onclick = () => { Snd.play('uiok'); this.startRun(); };
      $('btnTitle').onclick = () => { Snd.play('ui'); this.toTitle(); };
    },

    /* ================= 资源加载 ================= */
    async boot() {
      this.init();
      const el = this.el;
      /* 调试 / 演示参数：?auto=1 直接开始，&demo=1 自动战斗，&chapter=2 跳章 */
      const q = new URLSearchParams(location.search);
      this.demo = q.has('demo');
      this.autoStart = q.has('auto');
      const chapterJump = parseInt(q.get('chapter') || '0', 10);

      const tips = ['研墨中…', '铺陈长卷…', '磨砺刀锋…', '召唤群鬼…', '血已备好…'];
      let ti = 0;
      await RB.Assets.init();
      await RB.Assets.load((done, total) => {
        const r = done / total;
        el.loadBar.style.width = (r * 100).toFixed(1) + '%';
        const nt = Math.min(tips.length - 1, Math.floor(r * tips.length));
        if (nt !== ti) { ti = nt; el.loadTip.textContent = tips[ti]; }
      });
      el.loadTip.textContent = '准备就绪';
      this.loop = new RB.Loop(60, dt => this.update(dt), () => this.render());
      this.loop.start();

      if (this.autoStart) {
        el.loader.classList.add('hidden');
        this.startRun();
        for (let i = 0; i < chapterJump; i++) this._nextChapter();
        this.introT = 0;
      } else {
        setTimeout(() => {
          el.loader.classList.add('hidden');
          el.title.classList.remove('hidden');
          this.mode = 'title';
        }, 380);
      }
    },

    /** 进入下一章（肃清后抵达尽头 / 调试跳章共用） */
    _advanceChapter() {
      const i = this.level.chapterIdx;
      if (i >= RB.CHAPTERS.length - 1) return;
      this.enemies.length = 0;
      Fx.clear();
      Fx.screenFlash(.42, '#e8e4da');
      Snd.play('tong', { vol: 1 });
      this.level.loadChapter(i + 1);
      const p = this.player;
      p.x = 240; p.y = C.GROUND_Y; p.vx = 0; p.vy = 0;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .25);   // 过章回 25% 血
      p.state = 'idle'; p.dead = false;
      this.cam.x = 0;
      this.introT = .4;
      this.stats.chapter = i + 1;
      this._chT = undefined;
    },

    /** 跳过当前章节（调试用） */
    _nextChapter() { this._advanceChapter(); },

    /* ================= 流程 ================= */
    startRun() {
      this.el.title.classList.add('hidden');
      this.el.help.classList.add('hidden');
      this.el.pause.classList.add('hidden');
      this.el.over.classList.add('hidden');
      Fx.clear();
      this.enemies = [];
      this.level = new RB.Level();
      this.player = new RB.Player(300);
      this.player.invuln = 1.4;
      this.cam.x = 0;
      this.cam.y = 0;
      this.stats = {
        kills: 0, dmg: 0, best: 0, time: 0, chapter: 0,
        parries: 0, ultras: 0,
      };
      this.deadT = 0; this.winT = 0;
      this._chT = undefined;
      this.time = 0;
      this.introT = 2.6;
      this.mode = 'playing';
      Snd.resume();
      Snd.startAmbience();
      Snd.setIntensity(.2);
      UI.comboShow = 0; UI.marquee = [];
      UI.tip('按 J 挥刀 · Shift 冲刺 · L 格挡', 6);
      this._syncBanner();
    },

    toTitle() {
      this.mode = 'title';
      this.el.pause.classList.add('hidden');
      this.el.over.classList.add('hidden');
      this.el.title.classList.remove('hidden');
      Snd.stopAmbience();
    },

    pause() {
      if (this.mode !== 'playing') return;
      this.mode = 'paused';
      this.el.pause.classList.remove('hidden');
      Snd.setIntensity(0);
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      this.el.pause.classList.add('hidden');
      RB.Input.clear();
    },

    gameOver(win) {
      this.mode = 'over';
      const s = this.stats;
      const p = this.player;
      this.el.overTitle.textContent = win ? '屠 尽' : '死 了';
      this.el.overTitle.className = 'oTitle' + (win ? ' win' : '');
      const quotes = win
        ? ['血落成雨，刀下无人。', '长夜终有尽时。', '这一剑，够了。']
        : ['刀还在响，人却听不见了。', '雨落了整夜，你没能走出去。', '再快一点。再狠一点。'];
      this.el.overQuote.textContent = U.pick(quotes);
      this.el.overStats.innerHTML =
        '击杀 <b>' + s.kills + '</b><br>' +
        '总伤害 <b>' + s.dmg + '</b><br>' +
        '最高连击 <b>' + s.best + '</b><br>' +
        '弹反 <b>' + s.parries + '</b> · 奥义 <b>' + s.ultras + '</b><br>' +
        '用时 <b>' + this._fmtTime(s.time) + '</b>';
      this.el.over.classList.remove('hidden');
      Snd.stopAmbience();
    },

    _fmtTime(t) {
      const m = Math.floor(t / 60), sec = Math.floor(t % 60);
      return m + ':' + U.pad(sec, 2);
    },

    /* ================= 事件 ================= */
    _hookEvents() {
      RB.bus.on('combo', n => UI.onCombo(n));
      RB.bus.on('kill', ({ ent, by }) => {
        if (ent.team !== 1) return;          // 只统计敌人
        this.stats.kills++;
        UI.push('· 斩 ' + ent.label, '#c8776a');
        if (ent.boss) this.winT = .01;
      });
      RB.bus.on('wave', d => UI.onWave(d));
      RB.bus.on('waveClear', i => { this._waveClearT = 1.2; });
      RB.bus.on('chapter', () => { this._syncBanner(); Snd.play('tong', { vol: .8 }); });
      RB.bus.on('parry', () => { this.stats.parries++; UI.push('· 弹反！', '#9fd8ff'); });
      RB.bus.on('ultra', () => { this.stats.ultras++; UI.push('· 奥义 十方俱灭', '#ffd764'); });
      RB.bus.on('skill', () => { UI.push('· 拔刀术 居合', '#ffb0b0'); });
      RB.bus.on('chapterClear', ch => {
        if (this.level.isLastChapter) return;
        UI.tip('前路已通 · 继续深入 →', 4);
        UI.push('· ' + ch.title + ' 肃清', '#e8dcc8');
      });
    },

    _syncBanner() {
      if (!this.level || !this.level.chapter || !this.el) return;   // Level 构造期 emit 时 level 尚未赋值
      const ch = this.level.chapter;
      const b = this.el.banner;
      this.el.bannerText.textContent = ch.title;
      this.el.bannerSub.textContent = ch.sub;
      b.classList.remove('hidden');
      b.classList.remove('show');
      void b.offsetWidth;
      b.classList.add('show');
      clearTimeout(this._bannerTO);
      this._bannerTO = setTimeout(() => b.classList.add('hidden'), 2700);
    },

    /* ================= 更新 ================= */
    update(dt) {
      RB.Input.beginFrame();
      let inp = RB.Input;
      if (this.demo && this.mode === 'playing') inp = this._demoInput(dt);

      // 暂停键全局响应
      if (RB.Input.pressed.pause) {
        if (this.mode === 'playing') this.pause();
        else if (this.mode === 'paused') this.resume();
      }
      if (this.mode === 'title') {
        Post.update(dt);
        if (RB.Input.pressed.confirm || RB.Input.pressed.light) this.startRun();
        return;
      }
      if (this.mode === 'over') {
        Post.update(dt);
        if (RB.Input.pressed.confirm || RB.Input.pressed.light) this.startRun();
        return;
      }
      if (this.mode !== 'playing') { Post.update(dt); return; }

      this.time += dt;
      this.stats.time += dt;

      // 命中停顿：冻结世界
      let worldDt = dt;
      if (Fx.hitstop > 0) {
        Fx.hitstop -= dt * 60;
        worldDt = dt * .045;
      }
      // 慢镜（死亡/胜利）
      if (this.slowmo > 0) { this.slowmo -= dt; worldDt *= .32; }

      const w = this.world = {
        player: this.player,
        enemies: this.enemies,
        bounds: this.level.bounds,
        nearestEnemy: (x, maxD) => this._nearest(x, maxD),
      };

      // 主角
      this.player.update(worldDt, inp, w);
      this.player.updateHitsAndDamage(worldDt, this.enemies);

      // 敌人
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.update(worldDt, w);
        e.updateHits(worldDt, [this.player], (atk, target) => {
          target.receiveHit(atk);
        });
        if (e.remove) this.enemies.splice(i, 1);
      }

      // 关卡
      this.level.update(worldDt, w);
      this.level.checkWaveClear(w);

      // 统计同步（伤害由 player.totalDmg 累计）
      this.stats.dmg = this.player.totalDmg;
      if (this.player.comboBest > this.stats.best) this.stats.best = this.player.comboBest;

      // ============ 章节推进：肃清后走到长街尽头进入下一章 ============
      if (this.level.finished && !this.level.isLastChapter && this._chT === undefined) {
        if (this.player.x >= this.level.length - 150) {
          this._chT = 0;
          this._advanceChapter();
        }
      }

      // 相机
      this._updateCamera(dt);

      // 特效
      Fx.update(dt);
      Post.update(dt);
      UI.update(dt, { player: this.player, enemies: this.enemies, level: this.level });

      // 音效强度
      Snd.setIntensity(U.clamp(this.enemies.filter(e => !e.dead).length / 5, 0, 1));

      // 死亡 / 胜利
      if (this.player.dead) {
        this.deadT += dt;
        if (this.deadT > 2.2 && this.mode === 'playing') this.gameOver(false);
      }
      if (this.winT > 0) {
        this.winT += dt;
        this.slowmo = Math.max(this.slowmo, .2);
        if (this.winT > 3.2 && this.mode === 'playing') this.gameOver(true);
      }
      // 最终章清完也判定胜利
      if (this.level.isLastChapter && this.level.finished && this.winT <= 0) {
        this.winT = .01;
      }
      if (this.introT > 0) this.introT -= dt;
    },

    /* ================= 演示模式（自动战斗，用于录屏与验证） ================= */
    _demoInput(dt) {
      const p = this.player;
      const foe = this._nearest(p.x, 520);
      const d = { down: {}, pressed: {}, released: {} };
      this._demoT = (this._demoT || 0) + dt;
      this._demoCD = (this._demoCD || 0) - dt;
      if (!foe || p.dead) {
        d.down.right = true;
        return d;
      }
      const dx = foe.x - p.x, adx = Math.abs(dx), dir = U.sign(dx) || 1;
      if (Math.abs(p.mp) >= p.maxMp) d.pressed.ultra = true;
      else if (adx < 240 && this._demoCD <= 0 && p.mp >= 30) {
        d.pressed.skill = true; this._demoCD = 1.6;
      }
      if (adx > 168) {
        d.down[dir > 0 ? 'right' : 'left'] = true;
      } else if (adx < 92) {
        d.down[dir > 0 ? 'left' : 'right'] = true;
      } else {
        d.down.guard = Math.random() < .22;
      }
      this._demoATK = (this._demoATK || 0) - dt;
      if (adx < 200 && this._demoATK <= 0) {
        d.pressed.light = true;
        this._demoATK = U.rand(.2, .42);
      }
      // 偶尔冲刺
      if (adx > 320 && Math.random() < .012) { d.down[dir > 0 ? 'right' : 'left'] = true; d.pressed.dash = true; }
      // 偶尔跳跃
      if (Math.random() < .006) d.pressed.jump = true;
      return d;
    },

    _nearest(x, maxD) {
      let best = null, bd = maxD === undefined ? 1e9 : maxD;
      for (const e of this.enemies) {
        if (e.dead || e.remove || e.spawnT > 0) continue;
        const d = Math.abs(e.x - x);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },

    _updateCamera(dt) {
      const p = this.player;
      const cam = this.cam;
      // 前瞻：朝向 + 战斗时居中
      const inBattle = this.level.battleOn;
      let look = p.face * (inBattle ? 96 : 148);
      // 战斗中把镜头往敌人群中心拉
      if (inBattle && this.enemies.length) {
        let sx = 0, n = 0;
        for (const e of this.enemies) { if (!e.dead && !e.remove) { sx += e.x; n++; } }
        if (n) look = U.clamp((sx / n) - p.x, -260, 260) * .42 + p.face * 40;
      }
      const targetX = p.x + look - C.VIEW_W * .5;
      cam.x = U.damp(cam.x, targetX, 6.2, dt);
      const maxX = Math.max(0, this.level.length - C.VIEW_W);
      cam.x = U.clamp(cam.x, -40, maxX + 40);
      // 微幅垂直跟随跳跃
      const cy = U.clamp((C.GROUND_Y - p.y) * .12, 0, 34);
      cam.y = U.damp(cam.y, cy, 4, dt);
    },

    /* ================= 渲染 ================= */
    render() {
      const ctx = this.ctx, cv = this.canvas;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';

      if (this.mode === 'title' || this.mode === 'load') {
        this._renderTitleBg(ctx);
        ctx.restore();
        return;
      }

      const cam = this.cam;
      const sx = Fx.shakeX, sy = Fx.shakeY;

      /* --- 1. 背景（视差，屏幕空间） --- */
      ctx.save();
      ctx.translate(sx * .22, sy * .22);
      this.level.drawBackground(ctx, cam.x);
      Post.drawRain(ctx, .55);
      ctx.restore();

      /* --- 2. 地面（屏幕空间，水平地面） --- */
      ctx.save();
      ctx.translate(sx, sy);
      this.level.drawGround(ctx, cam.x);
      ctx.restore();

      /* --- 3. 世界层（相机变换 + 震屏） --- */
      ctx.save();
      ctx.translate(-cam.x + sx, cam.y + sy);

      // 关卡提示（世界坐标）
      this.level.drawProgress(ctx, cam.x, this.player.x);

      // 阴影
      for (const e of this.enemies) if (!e.remove) e.drawShadow(ctx);
      if (!this.player.dead || this.deadT < 1.4) this.player.drawShadow(ctx);

      // 背后特效
      Fx.drawBack(ctx);

      // 实体（按脚底 y 排序 → 近大远小的遮挡关系）
      const ents = [];
      for (const e of this.enemies) if (!e.remove) ents.push(e);
      ents.push(this.player);
      ents.sort((a, b) => (a.y - b.y) || (a.x - b.x));
      for (const e of ents) {
        if (e === this.player && e.dead && this.deadT > 1.4) continue;
        e.draw(ctx);
      }

      // 前方特效
      Fx.drawFront(ctx);

      // 血条
      for (const e of this.enemies) if (!e.remove) e.drawHpBar(ctx);

      ctx.restore();

      /* --- 3. 前景雨（更快、更亮） --- */
      ctx.save();
      ctx.translate(sx * .5, sy * .5);
      Post.drawRain(ctx, .9);
      ctx.restore();

      /* --- 4. 速度线 --- */
      Post.drawSpeedLines(ctx, this.player.face);

      /* --- 5. HUD --- */
      UI.draw(ctx, { player: this.player, enemies: this.enemies, level: this.level });

      /* --- 6. 后期 --- */
      const dying = this.player.dead ? U.clamp(this.deadT / 2.2, 0, 1) : 0;
      const winning = this.winT > 0 ? U.clamp(this.winT / 3.2, 0, 1) : 0;
      Post.compose(ctx, {});
      if (dying > 0) Post.monochrome(ctx, dying, dying * .55);
      if (winning > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = winning * .3;
        const g = ctx.createRadialGradient(C.VIEW_W / 2, C.VIEW_H / 2, 40, C.VIEW_W / 2, C.VIEW_H / 2, 760);
        g.addColorStop(0, 'rgba(255,236,200,.9)');
        g.addColorStop(1, 'rgba(255,236,200,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
        ctx.restore();
      }
      // 开场淡入
      if (this.introT > 0) {
        ctx.save();
        ctx.globalAlpha = U.clamp(this.introT / 2.6, 0, 1);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
        ctx.restore();
      }

      ctx.restore();
    },

    /** 标题界面的动态背景 */
    _renderTitleBg(ctx) {
      const t = performance.now() / 1000;
      const W = C.VIEW_W, H = C.VIEW_H;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0a0a10'); g.addColorStop(.6, '#16141c'); g.addColorStop(1, '#07070a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // 墨迹
      ctx.save();
      ctx.globalAlpha = .16;
      for (let i = 0; i < 7; i++) {
        const x = W * (.1 + i * .13) + Math.sin(t * .2 + i) * 40;
        const y = H * .5 + Math.cos(t * .17 + i * 1.7) * 60;
        const r = 130 + Math.sin(t * .3 + i) * 40;
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, 'rgba(60,54,70,.8)');
        rg.addColorStop(1, 'rgba(20,18,26,0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
      // 血月
      ctx.save();
      const mx = W * .74, my = H * .3, r = 96;
      const rg = ctx.createRadialGradient(mx, my, r * .2, mx, my, r * 3.4);
      rg.addColorStop(0, 'rgba(220,40,44,.4)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(mx, my, r * 3.4, 0, 6.2832); ctx.fill();
      const g2 = ctx.createRadialGradient(mx - r * .3, my - r * .3, r * .1, mx, my, r);
      g2.addColorStop(0, 'rgba(255,96,90,.92)');
      g2.addColorStop(.7, 'rgba(190,26,32,.7)');
      g2.addColorStop(1, 'rgba(80,20,24,.4)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, 6.2832); ctx.fill();
      ctx.restore();
      // 雨
      ctx.save();
      for (let i = 0; i < 130; i++) {
        const seed = i * 137.5;
        const x = ((seed * 3.7 + t * 120) % (W + 300)) - 150;
        const y = ((seed * 7.3 + t * 900) % (H + 200)) - 100;
        ctx.strokeStyle = i % 5 === 0 ? 'rgba(190,26,32,.22)' : 'rgba(200,200,212,.11)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9, y + 46); ctx.stroke();
      }
      ctx.restore();
      // 暗角
      if (Post.vignette) ctx.drawImage(Post.vignette, 0, 0, W, H);
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = .08;
      if (Post.grain[Post.grainIdx]) ctx.drawImage(Post.grain[Post.grainIdx], 0, 0, W, H);
      ctx.restore();
    },
  };

  /* ================= 启动 ================= */
  function boot() {
    Game._hookEvents();
    Game.boot().catch(err => {
      console.error(err);
      const tip = document.getElementById('loadTip');
      if (tip) tip.textContent = '加载失败：' + err.message;
    });
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(boot, 0);
  else window.addEventListener('DOMContentLoaded', boot);

})(window.RB);

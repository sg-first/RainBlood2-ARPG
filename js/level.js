/* ===========================================================
   level.js — 关卡 / 视差背景 / 波次推进
   =========================================================== */
(function (RB) {
  'use strict';
  const U = RB.U, Fx = RB.Fx, C = RB.CFG, Snd = RB.Audio;

  /* ============ 章节定义 ============
     每章：背景层 + 波次序列 + 世界长度
  */
  const CHAPTERS = [
    {
      id: 'street',
      title: '第一章 · 雨落长街',
      sub: 'RAIN OVER THE LONG STREET',
      length: 3600,
      layers: [
        // { img: 'bb_mountainnight', par: .10, y: 0, hs: 1.0, alpha: 1 },
        { img: 'mountain3', par: .22, y: 40, hs: .78, alpha: 1 },
        { img: 'city_night', par: .48, y: 176, hs: .66, alpha: .95 },
      ],
      ground: { c1: '#101014', c2: '#050508', line: 'rgba(150,20,26,.5)' },
      waves: [
        { gateAt: 620, trigger: 180, list: [['shanzei', 1180], ['shanzei', 1520]] },
        { gateAt: 1560, trigger: 1220, list: [['shanzei', 1980], ['yingmei', 2320], ['shanzei2', 2520]] },
        { gateAt: 2680, trigger: 2380, list: [['blader', 3060], ['shanzei2', 3280], ['yingmei', 3400]] },
      ],
    },
    {
      id: 'tunnel',
      title: '第二章 · 鬼差血径',
      sub: 'THE BLOOD TUNNEL',
      length: 4200,
      layers: [
        { img: 'bb_tombroad', par: .08, y: 100, hs: 1, alpha: 1 },
        { img: 'tombroad2', par: .7, y: 100, hs: 1, alpha: 1 },
      ],
      ground: { c1: '#120e18', c2: '#06040a', line: 'rgba(180,30,36,.55)' },
      waves: [
        { gateAt: 700, trigger: 200, list: [['muxiaokui', 1240], ['muxiaokui', 1560], ['yingmei', 1780]] },
        { gateAt: 1800, trigger: 1420, list: [['triyingmei', 2240], ['muxiaokui', 2440], ['shanzei2', 2640], ['triyingmei', 2820]] },
        { gateAt: 3000, trigger: 2760, list: [['slashguichai', 3420], ['muxiaokui', 3640], ['muxiaokui', 3760]] },
      ],
    },
    {
      id: 'bridge',
      title: '第三章 · 断桥星芒',
      sub: 'STARLIGHT ON THE BROKEN BRIDGE',
      length: 3800,
      layers: [
        { img: 'bb_bridge', par: .07, y: -10, hs: 1.02, alpha: .55, tint: '#1c1a24' },
        { img: 'lastbridge1', par: .26, y: 160, hs: .62, alpha: .92 },
        { img: 'gate', par: .5, y: 190, hs: .5, alpha: .5, tint: '#18161e' },
        { img: 'rift', par: .78, y: 330, hs: .44, alpha: .45, tint: '#0e0c14' },
      ],
      ground: { c1: '#0e1016', c2: '#04050a', line: 'rgba(160,26,32,.5)' },
      waves: [
        { gateAt: 640, trigger: 180, list: [['xingmang', 1180], ['baijianke', 1420]] },
        { gateAt: 1620, trigger: 1300, list: [['xingmang', 2020], ['baijianke', 2220], ['yingmei', 2400]] },
        { gateAt: 2760, trigger: 2520, list: [['zuoshang', 3180], ['xingmang', 3380], ['baijianke', 3520]] },
      ],
    },
    {
      id: 'boss',
      title: '终章 · 葬 无 敌',
      sub: 'THE FINAL REQUIEM',
      length: 1800,
      layers: [
        { img: 'bb_secretroad', par: .06, y: -20, hs: 1.1, alpha: .5, tint: '#120c14' },
        { img: 'deep1', par: .24, y: 90, hs: .62, alpha: .7, tint: '#1a121c' },
        { img: 'rift', par: .55, y: 200, hs: .6, alpha: .8 },
        { img: 'waterduct5', par: .8, y: 340, hs: .42, alpha: .4, tint: '#08060c' },
      ],
      ground: { c1: '#0c0810', c2: '#030206', line: 'rgba(200,26,32,.62)' },
      waves: [
        { gateAt: 1400, trigger: 260, list: [['zangwudi', 1180]], boss: true },
      ],
    },
  ];

  /* 过滤掉不存在的敌人类型 */
  function validType(t) { return !!RB.ENEMY_TYPES[t]; }

  class Level {
    constructor() {
      this.chapterIdx = 0;
      this.data = CHAPTERS[0];
      this.length = this.data.length;
      this.bounds = [80, this.length - 80];
      this.waveIdx = 0;
      this.battleOn = false;
      this.gateX = 0;
      this.spawned = [];
      this.finished = false;
      this.bossHpShown = 0;
      this.time = 0;
      this.loadChapter(0);
    }

    loadChapter(i) {
      this.chapterIdx = i;
      this.data = CHAPTERS[i];
      this.length = this.data.length;
      this.bounds = [80, this.length - 80];
      this.waveIdx = 0;
      this.battleOn = false;
      this.gateX = 0;
      this.spawned = [];
      this.finished = false;
      this.time = 0;
      RB.bus.emit('chapter', this.data);
    }

    get chapter() { return this.data; }

    /** 当前是否全部章节结束 */
    get isLastChapter() { return this.chapterIdx >= CHAPTERS.length - 1; }

    update(dt, world) {
      this.time += dt;
      const p = world.player;
      if (p.dead) return;

      // 触发波次
      if (!this.battleOn && this.waveIdx < this.data.waves.length) {
        const w = this.data.waves[this.waveIdx];
        if (p.x > w.trigger) this._startWave(w, world);
      }
      // 战斗中：限制行动范围
      if (this.battleOn) {
        this.bounds[1] = Math.min(this.length - 80, this.gateX + 640);
      } else {
        // 波次间隙必须放行，否则玩家被卡在上一波的门后，无法触发下一波
        this.bounds[1] = this.length - 80;
      }

      // 章节结束判定
      if (!this.finished && this.waveIdx >= this.data.waves.length && !this.battleOn) {
        const alive = this.spawned.filter(e => !e.remove && !e.dead);
        if (alive.length === 0 && p.x > this.length - 460) {
          this.finished = true;
          RB.bus.emit('chapterClear', this.data);
        }
      }
    }

    _startWave(w, world) {
      this.battleOn = true;
      this.gateX = Math.max(w.gateAt, world.player.x + 380);
      this.spawned = [];
      const hpMul = w.boss ? 1 : 1 + this.chapterIdx * .16;   // BOSS 自身血量已按终章设计，不再叠章节加成
      w.list.forEach(([type, x]) => {
        if (!validType(type)) return;
        if (x <= 0) x = world.player.x + U.rand(420, 760) * (Math.random() < .5 ? -1 : 1);
        const e = new RB.Enemy(type, U.clamp(x, this.bounds[0] + 60, this.length - 60), {
          hpMul: hpMul,
        });
        e.slotT = this.spawned.length * .55;
        world.enemies.push(e);
        this.spawned.push(e);
      });
      const isBoss = !!w.boss;
      const bossLabel = isBoss && this.spawned[0] ? this.spawned[0].label : '';
      RB.bus.emit('wave', { index: this.waveIdx, boss: isBoss, count: this.spawned.length, label: bossLabel });
      if (isBoss) {
        Snd.play('tong', { vol: 1 });
        Fx.screenFlash(.3, '#8b1018');
        Fx.shake(12, 1.2);
      } else {
        Snd.play('tong', { vol: .6 });
      }
    }

    /** 敌人清空检测（由 world 每帧调用） */
    checkWaveClear(world) {
      if (!this.battleOn) return;
      const alive = this.spawned.filter(e => !e.remove && !e.dead);
      if (alive.length === 0) {
        this.battleOn = false;
        this.waveIdx++;
        RB.bus.emit('waveClear', this.waveIdx);
        Fx.text(world.player.x, C.GROUND_Y - 300, '肃 清', {
          color: '#e8e4da', size: 38, life: 1.2, scalePop: 1.6,
        });
        Snd.play('uiok', { vol: .8 });
      }
    }

    /* ================= 绘制 ================= */
    /** 背景（在相机变换下调用，传入相机 x） */
    drawBackground(ctx, camX) {
      const W = C.VIEW_W, H = C.VIEW_H;
      // 天幕渐变
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#0a0a10');
      sky.addColorStop(.52, '#15141c');
      sky.addColorStop(.8, '#1c1a22');
      sky.addColorStop(1, '#0a090e');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      for (const L of this.data.layers) {
        const img = RB.Assets.bg(L.img);
        if (!img) continue;
        const s = (H * L.hs) / img.height;
        const w = img.width * s, h = img.height * s;
        const y = L.y;
        // 视差偏移
        let ox = -(camX * L.par) % w;
        if (ox > 0) ox -= w;
        ctx.save();
        ctx.globalAlpha = L.alpha === undefined ? 1 : L.alpha;
        if (L.tint) {
          ctx.filter = 'brightness(.7) contrast(1.06)';
        }
        for (let x = ox; x < W; x += w) {
          ctx.drawImage(img, x, y, w, h);
        }
        if (L.tint) {
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = (L.alpha === undefined ? 1 : L.alpha) * .78;
          ctx.fillStyle = L.tint;
          for (let x = ox; x < W; x += w) ctx.fillRect(x, y, w, h);
        }
        ctx.restore();
      }

      // 血月
      this._drawMoon(ctx, camX);
    }

    _drawMoon(ctx, camX) {
      const mx = 980 - camX * .04;
      const my = 128;
      ctx.save();
      const isBoss = this.chapterIdx === CHAPTERS.length - 1;
      const r = isBoss ? 118 : 74;
      const grd = ctx.createRadialGradient(mx, my, r * .2, mx, my, r * 3.1);
      grd.addColorStop(0, isBoss ? 'rgba(230,40,44,.5)' : 'rgba(210,60,60,.22)');
      grd.addColorStop(.35, isBoss ? 'rgba(170,20,26,.24)' : 'rgba(140,30,36,.1)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(mx, my, r * 3.1, 0, 6.2832); ctx.fill();

      ctx.globalAlpha = .9;
      const g2 = ctx.createRadialGradient(mx - r * .3, my - r * .3, r * .1, mx, my, r);
      g2.addColorStop(0, isBoss ? 'rgba(255,90,86,.9)' : 'rgba(226,214,200,.82)');
      g2.addColorStop(.65, isBoss ? 'rgba(190,26,32,.72)' : 'rgba(178,166,158,.6)');
      g2.addColorStop(1, 'rgba(70,60,60,.35)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, 6.2832); ctx.fill();
      // 月面纹理
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = .12;
      ctx.fillStyle = '#3a3038';
      for (let i = 0; i < 9; i++) {
        const a = i * 2.1, rr = r * (.24 + (i % 3) * .2);
        ctx.beginPath();
        ctx.arc(mx + Math.cos(a) * rr, my + Math.sin(a) * rr * .8, r * (.07 + (i % 4) * .035), 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();
    }

    /** 地面（屏幕坐标绘制，因为地面基本水平） */
    drawGround(ctx, camX) {
      const W = C.VIEW_W, H = C.VIEW_H, gy = C.GROUND_Y, g = this.data.ground;
      const grd = ctx.createLinearGradient(0, gy - 10, 0, H);
      grd.addColorStop(0, g.c1);
      grd.addColorStop(.18, g.c2);
      grd.addColorStop(1, '#000');
      ctx.fillStyle = grd;
      ctx.fillRect(0, gy, W, H - gy);

      // 地面湿光反光
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .1;
      const gl = ctx.createLinearGradient(0, gy, 0, gy + 90);
      gl.addColorStop(0, 'rgba(190,180,190,.8)');
      gl.addColorStop(1, 'rgba(190,180,190,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(0, gy, W, 90);
      ctx.restore();

      // 血线
      ctx.save();
      ctx.strokeStyle = g.line;
      ctx.lineWidth = 2;
      ctx.globalAlpha = .75;
      ctx.beginPath();
      ctx.moveTo(0, gy + 1);
      ctx.lineTo(W, gy + 1);
      ctx.stroke();
      ctx.restore();

      // 地面石板纹理（随相机滚动）
      ctx.save();
      ctx.globalAlpha = .1;
      ctx.strokeStyle = '#8a8290';
      ctx.lineWidth = 1;
      const tile = 168;
      const off = -(camX % tile);
      for (let i = 0; i < 9; i++) {
        const x = off + i * tile;
        ctx.beginPath();
        ctx.moveTo(x, gy + 16);
        ctx.lineTo(x - 26, H);
        ctx.stroke();
      }
      for (let r = 1; r < 5; r++) {
        const y = gy + r * r * 15;
        if (y > H) break;
        ctx.globalAlpha = .07 - r * .01;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.restore();
    }

    /** 关卡推进提示（世界坐标系下绘制） */
    drawProgress(ctx, camX, playerX) {
      // 战斗屏障
      if (this.battleOn) {
        const bx = this.gateX + 640;
        if (bx > camX - 160 && bx < camX + C.VIEW_W + 160) {
          ctx.save();
          const grd = ctx.createLinearGradient(bx - 46, 0, bx + 46, 0);
          grd.addColorStop(0, 'rgba(150,20,26,0)');
          grd.addColorStop(.5, 'rgba(200,26,32,.3)');
          grd.addColorStop(1, 'rgba(150,20,26,0)');
          ctx.fillStyle = grd;
          ctx.fillRect(bx - 46, 60, 92, C.GROUND_Y - 60);
          // 血帘
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 26; i++) {
            const y = 70 + ((i * 53 + this.time * 110) % (C.GROUND_Y - 80));
            const fade = 1 - (y - 70) / (C.GROUND_Y - 80);
            ctx.globalAlpha = .3 * fade;
            ctx.fillStyle = '#c31a22';
            ctx.fillRect(bx - 28 + Math.sin(i * 2.1 + this.time * 2.2) * 24, y, 2.6, 12 + (i % 5) * 6);
          }
          ctx.restore();
        }
      }
      // 前行指引
      if (!this.battleOn && this.waveIdx < this.data.waves.length) {
        const tx = this.data.waves[this.waveIdx].trigger;
        if (tx > playerX + 300 && tx < camX + C.VIEW_W - 60) {
          ctx.save();
          ctx.globalAlpha = .3 + Math.sin(this.time * 4) * .18;
          ctx.fillStyle = '#d8d3c8';
          const y0 = C.GROUND_Y - 210 + Math.sin(this.time * 3) * 8;
          ctx.beginPath();
          ctx.moveTo(tx - 15, y0);
          ctx.lineTo(tx + 15, y0);
          ctx.lineTo(tx, y0 + 34);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  RB.Level = Level;
  RB.CHAPTERS = CHAPTERS;

})(window.RB);

/* ===========================================================
   enemy.js — 敌人 / AI / BOSS
   =========================================================== */
(function (RB) {
  'use strict';
  const U = RB.U, Fx = RB.Fx, Snd = RB.Audio, C = RB.CFG;

  /* 敌人档案 */
  const TYPES = {
    tiegui: {
      label: '铁鬼', hp: 120, speed: 118, scale: 2.25, hurtH: 214,
      range: 132, dmg: 20, windup: .62, active: .12, recover: .58, cd: .55,
      body: 118, kbRes: .62, mpGain: 7,
      hit: { w: 150, h: 150, ox: 76, oy: 96 },
      sheets: { idle: 'tiegui_idle', atk: 'tiegui_atk', miss: 'tiegui_miss' },
      idleFps: 5, atkFps: 15,
      fx: 'e_tieguizhenlie', fxDelay: .58, fxScale: 1.5,
      shadow: 1.35,
    },
    shanzei: {
      label: '山贼', hp: 68, speed: 196, scale: 1.85, hurtH: 176,
      range: 122, dmg: 13, windup: .42, active: .1, recover: .34, cd: .38,
      body: 96, kbRes: .95, mpGain: 6,
      hit: { w: 122, h: 132, ox: 62, oy: 88 },
      sheets: { idle: 'shanzei1_idle', atk: 'shanzei1_atk', miss: 'shanzei1_miss' },
      idleFps: 6, atkFps: 17,
      fx: 'e_shanzeiaction', fxDelay: .38, fxScale: 1.35,
      shadow: .95,
    },
    shanzei2: {
      label: '悍匪', hp: 84, speed: 176, scale: 1.95, hurtH: 184,
      range: 132, dmg: 15, windup: .48, active: .11, recover: .4, cd: .42,
      body: 104, kbRes: .86, mpGain: 6,
      hit: { w: 132, h: 140, ox: 66, oy: 92 },
      sheets: { idle: 'shanzei2_idle', atk: 'shanzei2_atk', miss: 'shanzei2_miss' },
      idleFps: 6, atkFps: 16,
      fx: 'e_shanzeiaction2', fxDelay: .4, fxScale: 1.4,
      shadow: 1.0,
    },
    muxiaokui: {
      label: '鬼差', hp: 88, speed: 146, scale: 1.95, hurtH: 184,
      range: 196, dmg: 16, windup: .56, active: .13, recover: .46, cd: .5,
      body: 100, kbRes: .7, mpGain: 7,
      hit: { w: 210, h: 128, ox: 116, oy: 96 },
      sheets: { idle: 'muxiaokui_idle', atk: 'muxiaokui_atk', miss: 'muxiaokui_miss' },
      idleFps: 5.5, atkFps: 15,
      fx: 'e_muxiaokuiaction', fxDelay: .52, fxScale: 1.5,
      shadow: 1.15,
    },
    yingmei: {
      label: '影魅', hp: 74, speed: 262, scale: 1.9, hurtH: 150,
      range: 118, dmg: 14, windup: .34, active: .09, recover: .3, cd: .34,
      body: 88, kbRes: 1.0, mpGain: 6,
      hit: { w: 128, h: 130, ox: 62, oy: 84 },
      sheets: { idle: 'yingmei_idle', atk: 'yingmei_atk', miss: 'yingmei_miss' },
      idleFps: 7, atkFps: 20,
      fx: 'e_yingmeiaction', fxDelay: .3, fxScale: 1.35,
      shadow: .62, dash: true,
    },
    slashguichai: {
      label: '斩鬼差', hp: 190, speed: 138, scale: 2.5, hurtH: 268,
      range: 218, dmg: 26, windup: .72, active: .15, recover: .66, cd: .7,
      body: 160, kbRes: .5, mpGain: 10,
      hit: { w: 246, h: 200, ox: 128, oy: 130 },
      sheets: { idle: 'slashguichai_idle', atk: 'slashguichai_atk', miss: 'slashguichai_miss' },
      idleFps: 4.6, atkFps: 13,
      fx: 'e_slashguichaiaction', fxDelay: .68, fxScale: 2.0,
      shadow: 1.95, elite: true,
    },
    blader: {
      label: '黑甲客', hp: 104, speed: 172, scale: 2.0, hurtH: 206,
      range: 140, dmg: 17, windup: .5, active: .11, recover: .4, cd: .44,
      body: 112, kbRes: .82, mpGain: 7,
      hit: { w: 148, h: 152, ox: 74, oy: 100 },
      sheets: { idle: 'blader_idle', atk: 'blader_atk', miss: 'blader_miss' },
      idleFps: 5.4, atkFps: 15,
      fx: 'e_bladeraction', fxDelay: .46, fxScale: 1.5,
      shadow: 1.4,
    },
    baijianke: {
      label: '白剑客', hp: 92, speed: 214, scale: 1.92, hurtH: 180,
      range: 152, dmg: 15, windup: .4, active: .1, recover: .33, cd: .36,
      body: 96, kbRes: .9, mpGain: 7,
      hit: { w: 168, h: 140, ox: 84, oy: 94 },
      sheets: { idle: 'baijiankeb_idle', atk: 'baijiankeb_atk', miss: 'baijiankeb_miss' },
      idleFps: 6.4, atkFps: 18,
      fx: 'e_baijianke_action', fxDelay: .36, fxScale: 1.4,
      shadow: .9,
    },
    xingmang: {
      label: '星芒', hp: 96, speed: 232, scale: 1.98, hurtH: 190,
      range: 146, dmg: 16, windup: .38, active: .1, recover: .32, cd: .34,
      body: 98, kbRes: .92, mpGain: 7,
      hit: { w: 156, h: 148, ox: 78, oy: 100 },
      sheets: { idle: 'xingmang_idle', atk: 'xingmang_atk', miss: 'xingmang_miss' },
      idleFps: 6.6, atkFps: 18,
      fx: 'e_xingmang-fangxing-jian', fxDelay: .34, fxScale: 1.5,
      shadow: .95,
    },
    triyingmei: {
      label: '三影', hp: 86, speed: 246, scale: 1.94, hurtH: 158,
      range: 126, dmg: 15, windup: .36, active: .1, recover: .32, cd: .36,
      body: 92, kbRes: .98, mpGain: 7,
      hit: { w: 136, h: 136, ox: 64, oy: 84 },
      sheets: { idle: 'triyingmei_idle', atk: 'triyingmei_atk', miss: 'triyingmei_miss' },
      idleFps: 7, atkFps: 19,
      fx: 'e_yingmeiaction', fxDelay: .32, fxScale: 1.35,
      shadow: .66, dash: true,
    },
    zuoshang: {
      label: '左殇', hp: 150, speed: 168, scale: 2.1, hurtH: 214,
      range: 168, dmg: 21, windup: .58, active: .12, recover: .5, cd: .55,
      body: 120, kbRes: .66, mpGain: 9,
      hit: { w: 184, h: 170, ox: 92, oy: 116 },
      sheets: { idle: 'zuoshang_idle', atk: 'zuoshang_atk', miss: 'zuoshang_miss' },
      idleFps: 5, atkFps: 14,
      fx: 'e_e_shangskill2', fxDelay: .54, fxScale: 1.7,
      shadow: 1.45, elite: true,
    },
    zangwudi: {
      label: '葬 无 敌', hp: 900, speed: 152, scale: 3.0, hurtH: 330,
      range: 250, dmg: 30, windup: .78, active: .16, recover: .62, cd: .5,
      body: 230, kbRes: .12, mpGain: 14,
      hit: { w: 300, h: 320, ox: 148, oy: 175 },
      sheets: { idle: 'zangwudi_idle', atk: 'zangwudi_skill', miss: 'zangwudi_miss' },
      idleFps: 4.2, atkFps: 12,
      fx: 'e_zangwudiaction', fxDelay: .72, fxScale: 2.8,
      shadow: 2.9, boss: true,
    },
  };

  class Enemy extends RB.Entity {
    constructor(typeKey, x, opt) {
      opt = opt || {};
      const T = TYPES[typeKey] || TYPES.shanzei;
      super({
        x: x, hp: Math.round(T.hp * (opt.hpMul || 1)),
        hurtW: T.body * .58, hurtH: T.hurtH,
        team: 1, scale: T.scale, face: -1,
      });
      this.T = T;
      this.kind = typeKey;
      this.label = T.label;
      this.mpGain = T.mpGain;
      this.kbRes = T.kbRes;
      this.shadowScale = T.shadow || 1;
      this.ai = 'idle';
      this.aiT = 0;
      this.cd = U.rand(.2, .8);
      this.windupT = 0;
      this.staggerT = 0;
      this.enraged = false;
      this.atkIndex = 0;
      this.hpBarT = 0;
      this.spawnT = .5;
      this.invuln = .25;
      this.aggro = 1;
      this.boss = !!T.boss;
      if (this.boss) { this.phase = 1; this.specialCD = 4; }
      this._buildClips();
      this.setState('idle');
      this.play('idle');
      // 出场特效
      Fx.ink(x, C.GROUND_Y - 40, 12, 260, 13);
      Snd.play('pressure', { vol: .6 });
    }

    _buildClips() {
      const S = this.T.sheets;
      this.clip('idle', S.idle, [0, 1, 2, 3], this.T.idleFps, { loop: true });
      this.clip('walk', S.idle, [0, 1, 2, 3], this.T.idleFps * .8, { loop: true });
      this.clip('atk', S.atk, [0, 1, 2, 3], this.T.atkFps, { loop: false, hold: 1 });
      this.clip('windup', S.idle, [0, 1, 0, 1], 9, { loop: true });
      this.clip('hurt', S.miss || S.idle, [0, 1, 2, 3], 14, { loop: false });
      this.clip('stagger', S.miss || S.idle, [0, 1, 2, 3], 12, { loop: false });
      // 敌人素材（c_* 系列）均为朝右绘制：显式声明基线朝向
      for (const k in this.clips) this.clips[k].baseFace = 1;
    }

    /* =================== 更新 =================== */
    update(dt, world) {
      if (this.dead) { this._dying(dt); return; }
      this.world = world;
      this.baseUpdate(dt);
      if (this.spawnT > 0) this.spawnT -= dt;
      if (this.staggerT > 0) this.staggerT -= dt;
      const p = world.player;

      // BOSS 狂暴
      if (this.boss && !this.enraged && this.hp < this.maxHp * .5) {
        this.enraged = true;
        this.mpGain = 18;
        Snd.play('ultra', { vol: .6 });
        Fx.screenFlash(.5, '#ff2020');
        Fx.shake(16, .8);
        Fx.text(this.x, this.y - 300, '狂 暴', { color: '#ff3020', size: 54, life: 1.6, scalePop: 2 });
        Fx.ring(this.x, this.y - 140, 120, 'rgba(255,40,40,.95)');
        this.T = Object.assign({}, this.T, { speed: this.T.speed * 1.34, windup: this.T.windup * .78, dmg: this.T.dmg * 1.22 });
        this.clip('atk', this.T.sheets.atk, [0, 1, 2, 3], this.T.atkFps * 1.25, { loop: false, hold: 1 });
      }

      this._ai(dt, p, world);
      this.physics(dt);
      this.x = U.clamp(this.x, world.bounds[0] - 40, world.bounds[1] + 40);
    }

    _ai(dt, p, world) {
      if (!p || p.dead) { this.vx = U.approach(this.vx, 0, 900 * dt); this.play('idle'); return; }
      this.aiT += dt;
      const dx = p.x - this.x;
      const adx = Math.abs(dx);
      const dirToP = U.sign(dx) || 1;
      const T = this.T;
      const spd = T.speed * (this.enraged ? 1.2 : 1);

      switch (this.ai) {
        case 'idle': {
          this.vx = U.approach(this.vx, 0, 1400 * dt);
          this.play('idle');
          if (this.cd > 0) this.cd -= dt;
          // 多个敌人错开进攻
          const slot = (this.slotT || 0) > 0;
          if (this.cd <= 0 && adx < 900 && !slot) { this.ai = 'chase'; this.aiT = 0; }
          break;
        }
        case 'chase': {
          this.face = dirToP;
          if (adx > T.range * .86) {
            this.vx = U.approach(this.vx, dirToP * spd, 1500 * dt);
            this.play('walk');
            this.anim.speed = U.clamp(spd / 170, .6, 1.5);
            // 影子步
            if (this.T.dash && Math.random() < .012) {
              this.vx = dirToP * spd * 2.1;
              Fx.ghost('c_' + T.sheets.idle, 0, this.x, this.y, this.scale, this.spriteFlip, .26, .7);
            }
          } else {
            this.vx = U.approach(this.vx, 0, 2200 * dt);
            // 侧移绕圈
            if (Math.random() < .02) this._strafe = U.rand(-1, 1) > 0 ? 1 : -1;
            if (this._strafe) this.vx += this._strafe * 40;
            if (this.aiT > .12 && adx < T.range * 1.05) {
              this._startWindup();
            }
          }
          if (this.aiT > 3.4) { this.ai = 'idle'; this.aiT = 0; this.cd = U.rand(.3, .9); }
          break;
        }
        case 'windup': {
          this.vx = U.approach(this.vx, 0, 1800 * dt);
          this.face = dirToP;
          this.play('windup');
          if (this.aiT >= T.windup) {
            this.ai = 'attack'; this.aiT = 0;
            this.play('atk', true);
            this._fired = false;
            Snd.play(this.T.boss ? 'slashhvy' : 'slash', { vol: .5 });
          }
          break;
        }
        case 'attack': {
          if (this.aiT > T.windup * .55) this.vx = U.approach(this.vx, 0, 2600 * dt);
          if (!this._fired && this.aiT >= T.active * .35) {
            this._fired = true;
            this._strike(p);
          }
          if (this.aiT >= T.active + T.recover) {
            this.ai = 'idle'; this.aiT = 0;
            this.cd = T.cd * U.rand(.85, 1.3) / (this.enraged ? 1.5 : 1);
            this.vx = 0;
          }
          break;
        }
        case 'stagger': {
          this.vx = U.approach(this.vx, 0, 1200 * dt);
          this.play('stagger');
          if (this.aiT > 1.25) { this.ai = 'idle'; this.aiT = 0; this.cd = .3; }
          break;
        }
      }
      if (this.boss) this._bossExtra(dt, p, world);
    }

    _startWindup() {
      this.ai = 'windup'; this.aiT = 0;
      const T = this.T;
      this.play('windup', true);
      // 预警红光
      this.tintColor = 'brightness(1.35) sepia(1) saturate(6) hue-rotate(-28deg)';
      this.tintT = T.windup + .1;
      Fx.add(new RB.Particle(this.x, this.y - this.hurtH * .55, {
        life: T.windup, size: 26, size2: 46, g: 0, drag: .99,
        color: 'rgba(220,30,30,.5)', shape: 'ring', blend: 'lighter', z: 12,
      }));
      Fx.text(this.x, this.y - this.hurtH - 34, '!', { color: '#ff3a2a', size: 34, life: T.windup * .9, vy: -34 });
      Snd.play('charge', { vol: .22 });
    }

    _strike(p) {
      const T = this.T, h = T.hit;
      const facing = this.face;
      this.makeHit({
        w: h.w, h: h.h, ox: h.ox, oy: h.oy,
        dmg: T.dmg, kb: 260 + T.dmg * 8, kbY: this.boss ? 180 : 0,
        hitstop: 4, shake: this.boss ? 10 : 5, stun: .42,
        life: .14, pierce: true, type: 'enemy',
      });
      // 挥击特效
      if (T.fx && RB.Assets.sheet('e_' + T.fx.replace(/^e_/, ''))) {
        Fx.add(new RB.SpriteFx(T.fx.replace(/^e_/, ''), this.x + facing * h.ox * .6, this.y - h.oy, {
          scale: T.fxScale, flip: facing, alpha: .92, z: 54, fps: 24,
        }));
      } else {
        Fx.add(new RB.SpriteFx('atk_combo', this.x + facing * h.ox * .6, this.y - h.oy, {
          frames: [1, 2, 3], fps: 26, scale: T.fxScale || 1.4, flip: facing, alpha: .9, z: 54,
        }));
      }
      Fx.dust(this.x + facing * 40, C.GROUND_Y, 4, -facing);
      Snd.play('slash', { vol: .45 });
    }

    /* ---------------- BOSS 专属 ---------------- */
    _bossExtra(dt, p, world) {
      this.specialCD -= dt;
      if (this.specialCD > 0 || this.ai === 'attack' || this.ai === 'windup') return;
      // 特殊技：突进冲击 / 地面裂斩
      this.specialCD = this.enraged ? U.rand(2.6, 4) : U.rand(4.5, 6.5);
      const choice = Math.random();
      if (choice < .5) {
        // 突进撞击
        this.ai = 'attack'; this.aiT = 0; this._fired = true;
        this.play('atk', true);
        const dir = U.sign(p.x - this.x) || 1;
        this.face = dir;
        this.vx = dir * 720;
        this._chargeDir = dir; this._chargeN = 0;
        Fx.text(this.x, this.y - 340, '怒 冲', { color: '#ff3a2a', size: 30, life: .9 });
        Snd.play('dash', { vol: .8 });
        const t0 = setTimeout(() => {
          if (this.dead) return;
          this.makeHit({ w: 240, h: 300, ox: 60, oy: 150, dmg: 34, kb: 700, kbY: 380, hitstop: 9, shake: 14, stun: .7, life: .5, pierce: true });
          Fx.shake(14, .5); Fx.screenFlash(.3, '#ff4040');
          for (let i = 0; i < 12; i++) Fx.dust(this.x - dir * i * 40, C.GROUND_Y, 3, -dir);
        }, 120);
        setTimeout(() => { if (!this.dead) { this.vx = 0; this.ai = 'idle'; this.aiT = 0; this.cd = .6; } }, 620);
      } else {
        // 地面裂斩：范围爆炸
        const tx = p.x;
        Fx.text(tx, C.GROUND_Y - 260, '裂 地', { color: '#ff3a2a', size: 30, life: 1 });
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            if (this.dead) return;
            Fx.add(new RB.SpriteFx('e_tieguizhenlie', tx + U.rand(-60, 60), C.GROUND_Y, { scale: 1.7, alpha: .9, z: 30 }));
            Fx.shake(9, .3);
            Fx.dust(tx + U.rand(-70, 70), C.GROUND_Y, 12, 0);
            Snd.play('explode', { vol: .5 });
            const hb = { owner: this, team: 1, box: { x: tx - 130, y: C.GROUND_Y - 170, w: 260, h: 170 }, dmg: 26, kb: 500, kbY: 420, hitstop: 6, shake: 8, stun: .6, life: .1, hitSet: new Set(), pierce: true, t: 0, type: 'enemy' };
            this.activeHits.push(hb);
          }, i * 130);
        }
      }
    }

    onParried(player) {
      // 被弹反：大硬直 + 破防
      this.ai = 'stagger'; this.aiT = 0;
      this.staggerT = 1.25;
      this.play('stagger', true);
      this.vx = -this.face * 320;
      this.invuln = 0;
      this.tintColor = null; this.tintT = 0;
      Fx.text(this.x, this.y - this.hurtH - 20, '破绽', { color: '#9fd8ff', size: 28, life: .9 });
      this.activeHits.length = 0;
    }

    onHurt(atk, dmg, fromBehind, dir) {
      // 打断当前动作
      if (this.ai === 'windup' || this.ai === 'attack') {
        if (dmg > this.maxHp * .06 || fromBehind || atk.type === 'skill' || atk.type === 'heavy') {
          this.ai = 'idle'; this.aiT = 0; this.cd = U.rand(.25, .7);
          this.activeHits.length = 0;
          this.tintColor = null; this.tintT = 0;
        }
      }
      this.vx = dir * (atk.kb || 200) * this.kbRes;
      if (atk.kbY) { this.vy = -atk.kbY * this.kbRes; this.onGround = false; }
      const stun = (atk.stun || .3) * this.kbRes;
      this.setState('hurt', stun);
      if (this.stateT === 0 || this.state !== 'hurt') this.play('hurt', true);
      else this.play('hurt', true);
      this.squashTo(.9, .1);
      // 精英抵抗击退
      if (this.kbRes < .35) this.vx *= .5;
    }

    _dying(dt) {
      this.deadT = (this.deadT || 0) + dt;
      this.vx = U.approach(this.vx, 0, 700 * dt);
      this.physics(dt);
      this.anim.update(dt);
      this.flashT = Math.max(0, this.flashT - dt);
      if (this.deadT > .28 && !this._fadeStarted) {
        this._fadeStarted = true;
        Fx.ink(this.x, this.y - 60, 20, 320, 15);
        Fx.blood(this.x, this.y - 70, U.sign(this.vx) || 1, 20, 1.2);
        for (let i = 0; i < 4; i++) {
          Fx.add(new RB.SpriteFx('e_guichaiaction', this.x + U.rand(-30, 30), this.y - U.rand(0, 60), { scale: 1, alpha: .6, z: 30 }));
        }
      }
      if (this.deadT > .38) this.remove = true;
      this._deathAlpha = U.clamp(1 - (this.deadT - .28) / .5, 0, 1);
    }

    draw(ctx) {
      if (this.spawnT > 0) {
        ctx.save();
        ctx.globalAlpha = U.clamp(1 - this.spawnT / .5, 0, 1);
        super.draw(ctx);
        ctx.restore();
        return;
      }
      if (this.dead) {
        const a = this._deathAlpha === undefined ? 1 : this._deathAlpha;
        ctx.save();
        ctx.filter = 'blur(1.5px) brightness(1.4)';
        super.drawSprite(ctx, RB.Assets.sheet(this.anim.clip ? this.anim.clip.key : null), this.anim.frameIndex, a);
        ctx.restore();
        return;
      }
      super.draw(ctx);
    }
  }

  RB.Enemy = Enemy;
  RB.ENEMY_TYPES = TYPES;

})(window.RB);

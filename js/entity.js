/* ===========================================================
   entity.js — 实体基类 / 物理 / 判定框
   坐标约定：x = 脚底中心水平位置, y = 脚底垂直位置（向下为正）
   锚点：精灵单元格底部中心
   =========================================================== */
(function (RB) {
  'use strict';
  const U = RB.U, Fx = RB.Fx, Snd = RB.Audio;

  /** 世界常量 */
  const CFG = RB.CFG = {
    FRAME: 192,
    SCALE: 1.9,               // 精灵缩放：角色显示高约 213px
    GRAVITY: 2650,
    GROUND_Y: 596,            // 地面线
    VIEW_W: 1280,
    VIEW_H: 720,
    MAX_FALL: 1800,
  };

  class Entity {
    constructor(o) {
      o = o || {};
      this.x = o.x || 0;
      this.y = o.y === undefined ? CFG.GROUND_Y : o.y;
      this.vx = 0; this.vy = 0;
      this.face = o.face || 1;            // 1 右, -1 左
      this.scale = o.scale || CFG.SCALE;
      this.onGround = true;
      this.hp = o.hp || 100; this.maxHp = this.hp;
      this.dead = false;
      this.remove = false;
      this.state = 'idle';
      this.stateT = 0;
      this.anim = new RB.Anim();
      this.clips = {};
      this.hurtW = o.hurtW || 66;
      this.hurtH = o.hurtH || 148;
      this.team = o.team || 0;            // 0 player, 1 enemy
      this.invuln = 0;
      this.hitstopT = 0;
      this.flashT = 0;
      this.stunT = 0;
      this.applyGravity = true;
      this.z = 0;                          // 绘制排序用
      this.squash = 1;                     // 竖向挤压（落地/受击反馈）
      this.squashT = 0;
      this.shadowScale = 1;
      this.tintColor = null;
      this.tintT = 0;
      this.hpBarT = 0;
      this.lastHitBy = null;
      // 攻击判定登记：当前活跃的 hitbox
      this.activeHits = [];
    }

    /* ---------- 精灵 ---------- */
    clip(name, sheetKey, frames, fps, opts) {
      this.clips[name] = new RB.Clip(sheetKey, frames, fps, opts);
      return this.clips[name];
    }
    play(name, restart) {
      const c = this.clips[name];
      if (!c) return;
      if (this._curClip !== c || restart) {
        this.anim.play(c, restart);
        this._curClip = c;
        this._clipName = name;
      }
    }
    get curClipName() { return this._clipName; }
    get animDone() { return this.anim.done; }
    /** 当前动画播放到第几帧（基于自身计时，用于精确判定） */
    frameAt(fps, frames, t) {
      const i = Math.floor(t * fps);
      return frames[Math.min(i, frames.length - 1)];
    }

    /* ---------- 状态机 ---------- */
    setState(s, dur) {
      this.state = s;
      this.stateT = 0;
      this.stateDur = dur || 0;
      this.onStateEnter(s);
    }
    onStateEnter() {}

    /* ---------- 判定框 ---------- */
    hurtbox() {
      const h = this.hurtH * this.squash;
      return { x: this.x - this.hurtW / 2, y: this.y - h, w: this.hurtW, h: h };
    }

    /** 生成一个攻击判定 */
    makeHit(o) {
      const facing = o.face === undefined ? this.face : o.face;
      const w = o.w, h = o.h;
      const cx = this.x + facing * o.ox;
      const cy = this.y - o.oy;
      const hb = { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
      const atk = {
        owner: this, team: this.team,
        box: hb, dmg: o.dmg, kb: o.kb || 0, kbY: o.kbY || 0,
        hitstop: o.hitstop === undefined ? 5 : o.hitstop,
        shake: o.shake || 3,
        stun: o.stun || .3, life: o.life || .1, t: 0,
        hitSet: new Set(),          // 已命中目标
        pierce: !!o.pierce,         // 是否穿透（不消失）
        onHit: o.onHit || null,
        type: o.type || 'slash',
        crit: !!o.crit,
        fromBehind: null,
        fx: o.fx || null,
      };
      this.activeHits.push(atk);
      return atk;
    }

    updateHits(dt, targets, onHitCb) {
      for (let i = this.activeHits.length - 1; i >= 0; i--) {
        const a = this.activeHits[i];
        a.t += dt;
        if (a.t > a.life) { this.activeHits.splice(i, 1); continue; }
        // 跟随施法者朝向的判定框
        if (a.follow !== false) {
          // 让判定框随实体移动（更符合动作游戏手感）
          const dx = this.x - a._lastX || 0;
          a.box.x += dx;
          a._lastX = this.x;
        }
        for (const t of targets) {
          if (!t || t.dead || t.remove) continue;
          if (t.invuln > 0) continue;
          if (a.hitSet.has(t)) continue;
          if (U.hit(a.box, t.hurtbox())) {
            a.hitSet.add(t);
            onHitCb(a, t);
            if (!a.pierce) { this.activeHits.splice(i, 1); break; }
          }
        }
      }
    }

    /* ---------- 物理 ---------- */
    physics(dt) {
      if (this.applyGravity) {
        this.vy += CFG.GRAVITY * dt;
        if (this.vy > CFG.MAX_FALL) this.vy = CFG.MAX_FALL;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y >= CFG.GROUND_Y) {
        if (!this.onGround) this.onLand();
        this.y = CFG.GROUND_Y;
        this.vy = 0;
        this.onGround = true;
      } else this.onGround = false;
    }
    onLand() {}

    /* ---------- 通用更新 ---------- */
    baseUpdate(dt) {
      this.stateT += dt;
      this.anim.update(dt);
      if (this.invuln > 0) this.invuln -= dt;
      if (this.stunT > 0) this.stunT -= dt;
      if (this.hitstopT > 0) this.hitstopT -= dt;
      if (this.flashT > 0) this.flashT -= dt;
      if (this.tintT > 0) this.tintT -= dt;
      if (this.hpBarT > 0) this.hpBarT -= dt;
      if (this.squashT > 0) {
        this.squashT -= dt;
        if (this.squashT <= 0) this.squash = 1;
      }
    }

    squashTo(v, dur) { this.squash = v; this.squashT = dur || .12; }

    /* ---------- 绘制 ---------- */
    draw(ctx) {
      const s = RB.Assets.sheet(this.anim.clip ? this.anim.clip.key : null);
      if (!s) return;
      const fi = this.anim.frameIndex;
      this.drawSprite(ctx, s, fi);
    }

    /**
     * 朝向机制只有两个参数：
     *   face     — 逻辑朝向（+1 右 / -1 左），驱动物理、判定、特效位置等一切方向逻辑
     *   baseFace — 素材基线朝向（+1 素材画的是朝右 / -1 朝左），定义于各实体 _buildClips 的 BASE_FACE 表
     * 本 getter 是唯一合成点：flip = face × baseFace；所有绘制处只做"flip < 0 则镜像"这一种判定。
     */
    get spriteFlip() {
      const base = (this.anim.clip && this.anim.clip.baseFace) || 1;
      return this.face * base;
    }

    drawSprite(ctx, s, fi, extraAlpha) {
      const S = this.scale;
      const w = 192 * S, h = 192 * S;
      const dx = this.x - w / 2;
      const dy = this.y - h;
      ctx.save();
      if (extraAlpha !== undefined) ctx.globalAlpha *= extraAlpha;
      // 受击白闪
      if (this.flashT > 0) {
        const k = this.flashT / .1;
        if (k > .5) ctx.filter = 'brightness(3.4) saturate(0)';
        else ctx.filter = 'brightness(1.9)';
      } else if (this.tintT > 0 && this.tintColor) {
        ctx.filter = this.tintColor;
      }
      // 唯一镜像判定：flip = 逻辑朝向 × 素材基线朝向，<0 即水平镜像
      if (this.spriteFlip < 0) {
        ctx.translate(this.x, this.y);
        ctx.scale(-1, 1);
        const col = fi % s.cols, r = Math.floor(fi / s.cols);
        const sh = 192 * S * this.squash;
        ctx.drawImage(s.img, col * 192, r * 192, 192, 192,
          -w / 2, -h + (h - sh), w, sh);
      } else {
        const col = fi % s.cols, r = Math.floor(fi / s.cols);
        const sh = 192 * S * this.squash;
        ctx.drawImage(s.img, col * 192, r * 192, 192, 192,
          dx, dy + (h - sh), w, sh);
      }
      ctx.restore();
    }

    /** 地面阴影 */
    drawShadow(ctx) {
      const a = U.clamp(1 - (CFG.GROUND_Y - this.y) / 460, 0, 1);
      if (a <= .02) return;
      const w = 62 * this.scale * this.shadowScale * (.55 + a * .45);
      const h = w * .26;
      ctx.save();
      ctx.globalAlpha = .5 * a;
      const g = ctx.createRadialGradient(this.x, CFG.GROUND_Y, 1, this.x, CFG.GROUND_Y, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,.72)');
      g.addColorStop(.7, 'rgba(0,0,0,.34)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(this.x, CFG.GROUND_Y, w / 2, h / 2, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    /** 头顶血条（敌人用） */
    drawHpBar(ctx) {
      if (this.hpBarT <= 0 || this.dead) return;
      const w = 76, h = 5;
      const x = this.x - w / 2;
      const y = this.y - 178 * (this.scale / CFG.SCALE) - 16;
      const a = U.clamp(this.hpBarT, 0, 1);
      ctx.save();
      ctx.globalAlpha = a * .92;
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#c0202a';
      ctx.fillRect(x, y, w * U.clamp(this.hp / this.maxHp, 0, 1), h);
      ctx.fillStyle = 'rgba(255,140,140,.7)';
      ctx.fillRect(x, y, w * U.clamp(this.hp / this.maxHp, 0, 1), 1.5);
      ctx.restore();
    }

    /* ---------- 受击 ---------- */
    takeHit(atk, o) {
      o = o || {};
      const fromBehind = U.sign(atk.owner.x - this.x) === this.face;
      let dmg = atk.dmg;
      if (fromBehind) dmg *= 1.5;
      if (atk.crit) dmg *= 1.35;
      dmg = Math.round(dmg);
      this.hp -= dmg;
      this.hpBarT = 3;
      this.flashT = .1;
      this.invuln = Math.max(this.invuln, o.invuln || .06);
      this.lastHitBy = atk.owner;

      const dir = U.sign(this.x - atk.owner.x) || -atk.owner.face;
      const kb = atk.kb * (fromBehind ? 1.25 : 1);
      if (!o.noKnockback) {
        this.vx = dir * kb;
        if (atk.kbY) { this.vy = -atk.kbY; this.onGround = false; }
      }
      this.onHurt(atk, dmg, fromBehind, dir);
      if (this.hp <= 0 && !this.dead) this.die(atk);
      return { dmg, fromBehind };
    }

    onHurt(atk, dmg, fromBehind, dir) {
      // 受击特效
      const hy = this.y - this.hurtH * .58 * this.squash;
      RB.Fx.blood(this.x, hy, dir, dmg > 26 ? 20 : 11, dmg > 26 ? 1.3 : 1);
      RB.Fx.sparks(this.x + dir * 10, hy, dmg > 26 ? 14 : 7, -dir * 0);
      RB.Fx.text(this.x + U.rand(-8, 8), hy - 30, String(dmg), {
        color: fromBehind ? '#ff5a4a' : (dmg > 26 ? '#ffd24a' : '#ffffff'),
        size: dmg > 26 ? 42 : 30,
        life: .9,
      });
      if (fromBehind) {
        RB.Fx.text(this.x, hy - 66, '背刺', { color: '#ff4a3a', size: 24, life: .8, vy: -70 });
      }
      RB.Fx.stop(atk.hitstop);
      RB.Fx.shake(atk.shake, .3);
      RB.Fx.screenFlash(dmg > 26 ? .22 : .1, '#ffffff');
      Snd.play(dmg > 26 ? 'hitbig' : 'hit', { vol: .8 });
      if (fromBehind) Snd.play('crit', { vol: .5 });
      RB.bus.emit('hit', { target: this, dmg, fromBehind });
    }

    die(atk) {
      this.dead = true;
      RB.Fx.blood(this.x, this.y - 80, U.sign(this.x - (atk ? atk.owner.x : 0)) || 1, 34, 1.6);
      RB.Fx.shake(9, .5);
      Snd.play('die', { vol: .8 });
      RB.bus.emit('kill', { ent: this, by: atk ? atk.owner : null });
    }
  }

  RB.Entity = Entity;
  RB.CFG = CFG;

})(window.RB);

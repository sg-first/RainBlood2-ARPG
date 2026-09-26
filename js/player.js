/* ===========================================================
   player.js — 主角「魂」
   动作以时间轴驱动（前摇/判定/后摇），保证手感精确
   =========================================================== */
(function (RB) {
  'use strict';
  const U = RB.U, Fx = RB.Fx, Snd = RB.Audio, C = RB.CFG;

  const HERO = {
    MAX_HP: 320,
    MAX_MP: 100,

    /* 各动作时间轴（秒）
       攻击本体动画取自 assets/fx/soulaction-attack.png（key: atk_combo）：
         帧 0 = 待机姿态，帧 4/5/6 = 三个挥砍姿势；
         帧 1~3 / 7~9 / 10~11 是刀光弧，留给各段的 slashClip 叠加，故不放进本体帧。
       刀光按本体的位置与缩放绘制（同一格坐标系），弧光才会落在素材里刀的位置。
       帧率决定了「挥砍姿势落在判定帧上」：例如 a1 判定在 .12s，10fps 时第 2 帧(4)正好在 .10s。 */
    A: {
      /* 连段 1：横斩 */
      a1: {
        total: .40, clip: ['atk_combo', [0, 4, 5, 6], 10],
        hits: [{ t: .12, w: 140, h: 130, ox: 88, oy: 104, dmg: 11, kb: 230, kbY: 0, hitstop: 4, shake: 3.2, stun: .26 }],
        lunge: { t0: .10, t1: .22, v: 235 },
        cancel: .22, sfx: 'slash',
        slashClip: ['atk_combo', [1, 2, 3], 30],
        slash: { delay: .10 },
      },
      /* 连段 2：撩斩 */
      a2: {
        total: .44, clip: ['atk_combo', [0, 4, 5, 6], 9],
        hits: [{ t: .11, w: 148, h: 150, ox: 92, oy: 118, dmg: 14, kb: 250, kbY: 120, hitstop: 5, shake: 4, stun: .3 }],
        lunge: { t0: .09, t1: .21, v: 265 },
        cancel: .24, sfx: 'slash',
        // 刀光只取纯弧光帧（第 6 帧含角色，放进来会跟本体叠出幻影）
        slashClip: ['atk_combo', [7, 8, 9], 30],
        slash: { delay: .09, rot: -.4 },
      },
      /* 连段 3：终结斩 */
      a3: {
        total: .72, clip: ['atk_combo', [0, 4, 5, 6], 5.5],
        hits: [{ t: .19, w: 190, h: 190, ox: 104, oy: 122, dmg: 26, kb: 430, kbY: 330, hitstop: 9, shake: 9, stun: .62, crit: false }],
        lunge: { t0: .16, t1: .30, v: 320 },
        cancel: .52, sfx: 'slashhvy',
        slashClip: ['atk_combo', [10, 11], 24],
        slash: { delay: .17, rot: .3 },
        heavy: true,
      },
      /* 冲刺斩 */
      adash: {
        total: .48, clip: ['atk_combo', [0, 4, 5, 6, 6], 10.4],
        hits: [{ t: .09, w: 210, h: 160, ox: 118, oy: 106, dmg: 20, kb: 400, kbY: 60, hitstop: 7, shake: 6, stun: .45 }],
        lunge: { t0: .06, t1: .26, v: 520 },
        cancel: .3, sfx: 'slashhvy',
        slashClip: ['atk_combo', [1, 2, 3], 32],
        slash: { delay: .07 },
      },
      /* 空中斩 */
      aair: {
        total: .44, clip: ['atk_combo', [0, 4, 5, 6, 6], 11.4],
        hits: [{ t: .08, w: 170, h: 170, ox: 80, oy: 92, dmg: 17, kb: 200, kbY: -140, hitstop: 6, shake: 5, stun: .4 }],
        cancel: .3, sfx: 'slash',
        slashClip: ['atk_combo', [7, 8, 9], 30],
        slash: { delay: .06, rot: .5 },
      },
      /* 上挑（对空） */
      aup: {
        total: .5, clip: ['atk_combo', [0, 4, 5, 6], 8],
        hits: [{ t: .13, w: 130, h: 230, ox: 66, oy: 170, dmg: 18, kb: 150, kbY: 520, hitstop: 7, shake: 5, stun: .5 }],
        cancel: .38, sfx: 'slashhvy',
        slashClip: ['atk_combo', [7, 8, 9], 26],
        slash: { delay: .11, rot: -1.2 },
      },
    },
  };

  class Player extends RB.Entity {
    constructor(x) {
      super({ x: x, hp: HERO.MAX_HP, hurtW: 72, hurtH: 186, team: 0, scale: C.SCALE });
      this.mp = 0;
      this.maxMp = HERO.MAX_MP;
      this.combo = 0;
      this.comboT = 0;
      this.comboBest = 0;
      this.hitCount = 0;
      this.totalDmg = 0;
      this.chain = 0;              // 当前连段序号
      this.buffer = {};            // 输入缓冲
      this.bufferT = {};
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.dashCD = 0;
      this.skillCD = 0;
      this.guardHold = 0;
      this.parryWindow = 0;
      this.guardBreakT = 0;
      this.airActions = 0;
      this.ultraCharge = 0;
      this.deadT = 0;
      this.spawnProtect = 1.2;
      this.invuln = 1.2;
      this.walkPhase = 0;

      this._buildClips();
      this.setState('idle');
    }

    _buildClips() {
      const A = HERO.A;
      // AnimUtil.seq 的签名是 seq(cols, from, to)，技能动作条均为 5 列
      const R = (from, to) => RB.AnimUtil.seq(5, from, to);
      // 基础
      this.clip('idle', 'hero_idle', [0, 1, 2, 3], 5.5, { loop: true });
      // 行走图：RPG Maker 标准布局 row0=正面 row1=朝左 row2=朝右 row3=背面
      // 基础精灵必须朝右（face=1 时不翻转），朝左靠镜像
      this.clip('run', 'hero_walk', RB.AnimUtil.row(8, 2, 8), 15, { loop: true });
      this.clip('runSlow', 'hero_walk', RB.AnimUtil.row(8, 2, 4), 8, { loop: true });
      this.clip('stand', 'hero_walk2', RB.AnimUtil.row(8, 2, 4), 5, { loop: true });
      this.clip('guard', 'hero_guard', [0, 1, 2, 3], 7, { loop: true });
      // 受击：chara 里的 soulbattler_attackone.png 才是「受击」姿势（下蹲脱刀），不是攻击图
      this.clip('hurt', 'hero_atk', [0, 1, 2, 3], 14, { loop: false, hold: 3 });
      this.clip('miss', 'hero_miss', [0, 1, 2, 3], 16, { loop: false });
      // 在空中的动画，现在没有合适的
      this.clip('jump', 'hero_guard', [0], 1, { loop: false });
      this.clip('jumpup', 'hero_atk', [1], 1, { loop: false });
      this.clip('air', 'hero_atk', [2], 1, { loop: false });
      this.clip('fall', 'hero_atk', [2, 3], 6, { loop: true });
      this.clip('land', 'hero_guard', [0, 3], 14, { loop: false, hold: 2 });
      
      this.clip('dodgeUp', 'hero_miss', [2, 3], 18, { loop: false });
      this.clip('dodgeDown', 'hero_guard', [0, 1], 12, { loop: false });
      // 攻击
      for (const k in A) {
        const a = A[k];
        this.clip(k, a.clip[0], a.clip[1], a.clip[2], { loop: false, hold: 1 });
      }
      // 技能演出序列（角色+特效一体）。帧范围按逐格像素扫描裁定：
      //   居合 0~28 为角色帧；29~32 是纯特效（30 悬空、31 只占上半格、32 是整块纯色矩形），33~34 全空
      //   —— 放进本体帧会让结尾角色消失、并僵在白块上
      //   奥义 0~51 为含角色的演出帧；52~55 悬空、56~59 全空
      this.clip('skill_hideslash', 'skill_hideslash', R(0, 28), 26, { loop: false });
      this.clip('skill_powerslash', 'skill_powerslash', R(0, 53), 26, { loop: false });
      this.clip('skill_omnislash', 'skill_omnislash', R(0, 51), 30, { loop: false });
      this.clip('skill_draw', 'atk_draw', R(0, 7), 22, { loop: false });
      this.clip('skill_twilight', 'skill_twilight', [0, 1, 2, 3, 4, 5, 6, 7, 9], 20, { loop: false });
      // 刀光（只取纯特效帧）
      this.slashClips = {};
      for (const k in A) {
        if (A[k].slashClip) {
          this.slashClips[k] = new RB.Clip(A[k].slashClip[0], A[k].slashClip[1], A[k].slashClip[2], { loop: false });
        }
      }
      // 素材基线朝向表（唯一定义处）：+1=素材本身朝右，-1=素材本身朝左。
      // 只有行走/站立图（soul.png / soulstand*.png 取 row2）是朝右；
      // 其余战斗立绘 soulbattler*.png（idle/attackone/guard/hurt/miss）与 fx 动作条
      // （soulaction-*.png / soul-*.png）经逐像素比对都是朝左，故默认按 -1 处理。
      const FACE_RIGHT = { hero_walk: 1, hero_walk2: 1, hero_stand: 1 };
      for (const k in this.clips) {
        const c = this.clips[k];
        c.baseFace = FACE_RIGHT[c.key] === 1 ? 1 : -1;
      }
    }

    /* =================== 输入 =================== */
    _bufferInput(inp) {
      const keys = ['light', 'skill', 'ultra', 'jump', 'dash', 'guard', 'up', 'down'];
      for (const k of keys) {
        if (inp.pressed[k]) { this.buffer[k] = true; this.bufferT[k] = .16; }
      }
    }
    _consume(k) {
      if (this.buffer[k]) { this.buffer[k] = false; this.bufferT[k] = 0; return true; }
      return false;
    }
    _decayBuffer(dt) {
      for (const k in this.bufferT) {
        if (this.bufferT[k] > 0) { this.bufferT[k] -= dt; if (this.bufferT[k] <= 0) this.buffer[k] = false; }
      }
    }

    /* =================== 主更新 =================== */
    update(dt, inp, world) {
      this.world = world;
      if (this.dead) { this._updateDead(dt); return; }
      this._bufferInput(inp);
      this.baseUpdate(dt);
      this._decayBuffer(dt);
      if (this.dashCD > 0) this.dashCD -= dt;
      if (this.skillCD > 0) this.skillCD -= dt;
      if (this.spawnProtect > 0) this.spawnProtect -= dt;
      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) { this.combo = 0; this.chain = 0; }
      }

      const grounded = this.onGround;
      if (grounded) this.coyote = .1; else if (this.coyote > 0) this.coyote -= dt;

      this._dispatch(dt, inp);
      this._applyLunge(dt);
      this.physics(dt);
      this._bounds(world);
      this._blockedByBodies(world);
      this._emitGhost(dt);
    }

    _bounds(world) {
      const lo = world.bounds ? world.bounds[0] : 60;
      const hi = world.bounds ? world.bounds[1] : 20000;
      this.x = U.clamp(this.x, lo, hi);
    }

    /**
     * 身体碰撞：被敌人身体挡住，攻击突进 / 位移不会穿到敌人背后
     * （否则连打时位移会越过敌人，后续攻击全部打空）
     */
    _blockedByBodies(world) {
      const list = world && world.enemies;
      if (!list || !list.length) return;
      // 想让冲刺（Shift）能穿过敌人身体时，取消下面一行的注释：
      // if (this.state === 'dash') return;
      for (const e of list) {
        if (!e || e.dead || e.remove || e.spawnT > 0) continue;
        const pb = this.hurtbox();
        const eb = e.hurtbox();
        // 垂直方向没有交叠就不挡（跳到头顶、或敌人被挑空时可以通过）
        if (pb.y + pb.h <= eb.y || pb.y >= eb.y + eb.h) continue;
        const pushL = (pb.x + pb.w) - eb.x;   // 在敌人左侧 → 往左推出
        const pushR = (eb.x + eb.w) - pb.x;   // 在敌人右侧 → 往右推出
        if (pushL <= 0 || pushR <= 0) continue;
        if (pushL < pushR) {
          this.x -= pushL;
          if (this.vx > 0) this.vx = 0;
        } else {
          this.x += pushR;
          if (this.vx < 0) this.vx = 0;
        }
      }
      this._bounds(world);   // 被顶到关卡边界外时兜底夹回来
    }

    /* ---------------- 状态分发 ---------------- */
    _dispatch(dt, inp) {
      const st = this.state;
      switch (st) {
        case 'idle': case 'run': this._groundedNeutral(dt, inp); break;
        case 'jump': case 'fall': this._airborne(dt, inp); break;
        case 'guard': this._guardState(dt, inp); break;
        case 'dash': this._dashState(dt, inp); break;
        case 'dodge': this._dodgeState(dt, inp); break;
        case 'land': this._simpleState(dt, inp, 'land', .12); break;
        case 'hurt': this._hurtState(dt, inp); break;
        case 'skill': this._skillState(dt, inp); break;
        case 'ultra': this._ultraState(dt, inp); break;
        case 'attack': this._attackState(dt, inp); break;
      }
    }

    /* ---------------- 地面自由态 ---------------- */
    _groundedNeutral(dt, inp) {
      const ax = this._moveInput(inp);
      const wantRun = ax !== 0;

      // 面向
      if (wantRun && !this._lockedFace) this.face = U.sign(ax);

      // 速度
      const target = wantRun ? ax * 330 : 0;
      const accel = this.onGround ? (wantRun ? 2400 : 3000) : 900;
      this.vx = U.approach(this.vx, target, accel * dt);
      if (Math.abs(this.vx) < 6) this.vx = 0;

      // 动作优先级：奥义 > 技能 > 冲刺 > 攻击 > 跳跃 > 格挡
      if (this._consume('ultra') && this.mp >= this.maxMp) return this._startUltra();
      if (this._consume('skill') && this.mp >= 30 && this.skillCD <= 0) return this._startSkill();
      if (this._consume('dash') && this.dashCD <= 0 && wantRun) return this._startDash(U.sign(ax));
      if (this._consume('light')) return this._startAttack(this.onGround ? 'a1' : 'aair');
      if (this._consume('jump') || this.jumpBuffer > 0) {
        this.jumpBuffer = 0;
        if (this.coyote > 0) return this._jump(inp);
      }
      if (this._consume('up')) return this._startDodge(-1);
      if (this._consume('down')) return this._startDodge(1);
      if (inp.down.guard) return this._enterGuard();

      // 动画
      if (this.onGround) {
        if (Math.abs(this.vx) > 40) {
          this.play('run');
          this.anim.speed = U.clamp(Math.abs(this.vx) / 300, .55, 1.35);
          this.walkPhase += dt * Math.abs(this.vx) * .012;
          if (this._stepAcc === undefined) this._stepAcc = 0;
          this._stepAcc += Math.abs(this.vx) * dt;
          if (this._stepAcc > 78) { this._stepAcc = 0; Snd.play('step', { vol: .5 }); Fx.dust(this.x, C.GROUND_Y, 2, -U.sign(this.vx)); }
        } else {
          this.play('idle');
        }
      }
    }

    _moveInput(inp) {
      let a = 0;
      if (inp.down.left) a -= 1;
      if (inp.down.right) a += 1;
      return a;
    }

    /* ---------------- 跳跃/空中 ---------------- */
    _jump(inp) {
      this.vy = -905;
      this.onGround = false;
      this.setState('jump');
      this.play('jumpup', true);
      Snd.play('jump', { vol: .5 });
      Fx.dust(this.x, C.GROUND_Y, 7, 0);
      Fx.ring(this.x, C.GROUND_Y - 4, 18, 'rgba(200,196,190,.4)');
      const ax = this._moveInput(inp);
      if (ax !== 0) { this.face = U.sign(ax); this.vx = ax * 300; }
      this.airActions = 0;
    }

    _airborne(dt, inp) {
      const ax = this._moveInput(inp);
      const target = ax * 315;
      const ctrl = this.airActions > 0 ? 700 : 1250;
      this.vx = U.approach(this.vx, target, ctrl * dt);
      if (ax !== 0 && this.airActions === 0) this.face = U.sign(ax);

      if (this.vy > 60) this.play('fall');
      else this.play('jumpup');

      // 空中动作
      if (this._consume('ultra') && this.mp >= this.maxMp) return this._startUltra();
      if (this._consume('light')) return this._startAttack(this.onGround ? 'a1' : 'aair');
      if (this._consume('dash') && this.dashCD <= 0 && this.airActions === 0) {
        this.airActions = 1;
        this.vx = this.face * 470; this.vy = -230;
        this.dashCD = .3;
        Snd.play('dash', { vol: .5 });
      }
      if (inp.released.jump && this.vy < -260) this.vy = -260;   // 短按小跳
    }

    onLand() {
      if (this.state === 'attack' || this.state === 'skill') return;
      this.setState('land', .1);
      this.play('land', true);
      this.squashTo(.86, .1);
      Fx.dust(this.x, C.GROUND_Y, 9, U.sign(this.vx));
      if (Math.abs(this.vx) > 240) Fx.ring(this.x, C.GROUND_Y - 4, 22, 'rgba(210,205,198,.45)');
      Snd.play('step', { vol: .7 });
      this.airActions = 0;
    }

    /* ---------------- 冲刺 ---------------- */
    _startDash(dir) {
      this.setState('dash', .3);
      this.dashCD = .42;
      this.face = dir;
      this.vx = dir * 790;
      this.invuln = Math.max(this.invuln, .16);
      this.play('run', true);
      this.anim.speed = 1.4;
      Snd.play('dash', { vol: .62 });
      Fx.dust(this.x, C.GROUND_Y, 10, -dir);
      Fx.ring(this.x, C.GROUND_Y - 30, 26, 'rgba(220,214,206,.5)');
      RB.Post.speedLines = 1;
    }
    _dashState(dt, inp) {
      this.vx = U.approach(this.vx, 0, 2400 * dt);
      this.anim.speed = 1.35;
      // 冲刺取消
      if (this.stateT > .08 && this._consume('light')) return this._startAttack('adash');
      if (this.stateT > .1 && this._consume('jump')) { this._jump(inp); return; }
      if (this.stateT >= .3) this._toNeutral();
    }

    /* ---------------- 闪避（上/下） ---------------- */
    _startDodge(dir) {
      this.setState('dodge', .3);
      this.dodgeDir = dir;
      if (dir < 0) {
        this.vy = -640; this.vx = -this.face * 300; this.onGround = false;
        this.play('dodgeUp', true);
        this.invuln = Math.max(this.invuln, .26);
      } else {
        this.vx = this.face * 210;
        this.play('dodgeDown', true);
        this.invuln = Math.max(this.invuln, .18);
      }
      Snd.play('dash', { vol: .4 });
      Fx.dust(this.x, C.GROUND_Y, 5, -this.face);
    }
    _dodgeState(dt, inp) {
      if (this.dodgeDir < 0) { this.vx = U.approach(this.vx, 0, 900 * dt); }
      else { this.vx = U.approach(this.vx, 0, 1500 * dt); }
      if (this.stateT > .1 && this._consume('light')) return this._startAttack(this.onGround ? 'a1' : 'aair');
      if (this.stateT >= .3) this._toNeutral();
    }

    /* ---------------- 格挡 ---------------- */
    _enterGuard() {
      this.setState('guard');
      this.play('guard', true);
      this.vx = 0;
      this.parryWindow = .0;
      Snd.play('guard', { vol: .25 });
    }
    _guardState(dt, inp) {
      this.guardHold = this.stateT;
      this.parryWindow = Math.max(0, .16 - this.stateT);   // 开场 0.16s 内为弹反窗口
      this.vx = U.approach(this.vx, 0, 2600 * dt);
      if (!inp.down.guard) { this._toNeutral(); return; }
      // 格挡中可被击中 → 由 takeHit 处理（覆写 onHurt）
      if (this._consume('light')) return this._startAttack('a1');
      if (this._consume('dash') && this.dashCD <= 0) return this._startDash(-this.face);
    }

    /** 格挡结算：返回 true 表示已处理，不再走普通受击 */
    tryGuard(atk) {
      if (this.state !== 'guard') return false;
      // 判定攻击来自正面
      const fromFront = U.sign(atk.owner.x - this.x) === this.face;
      if (this.parryWindow > 0 && fromFront) {
        // 弹反！
        this._parrySuccess(atk);
        return true;
      }
      if (fromFront) {
        // 普通格挡
        const dmg = Math.max(1, Math.round(atk.dmg * .16));
        this.hp -= dmg;
        this.guardHp = (this.guardHp === undefined ? 100 : this.guardHp) - atk.dmg * .55;
        this.vx = -this.face * atk.kb * .28;
        this.flashT = .06;
        Fx.sparks(this.x + this.face * 40, this.y - 120, 12, -this.face);
        Fx.stop(4); Fx.shake(4, .2);
        Fx.text(this.x, this.y - 160, '格挡', { color: '#9fd8ff', size: 24, life: .6 });
        Snd.play('guard', { vol: .8 });
        this.lastHitBy = atk.owner;
        if (this.guardHp !== undefined && this.guardHp <= 0) {
          this.guardHp = 100;
          this.guardBreakT = .8;
          this.setState('hurt', .8);
          this.play('hurt', true);
          Fx.text(this.x, this.y - 200, '破防!', { color: '#ff6a4a', size: 34, life: 1 });
        }
        return true;
      }
      return false;
    }

    _parrySuccess(atk) {
      const foe = atk.owner;
      this.mp = Math.min(this.maxMp, this.mp + 22);
      Snd.play('parry', { vol: 1 });
      Fx.stop(11);
      Fx.shake(8, .4);
      Fx.screenFlash(.42, '#ffffff');
      Fx.sparks(this.x + this.face * 46, this.y - 120, 26, -this.face);
      Fx.ring(this.x + this.face * 44, this.y - 120, 30, 'rgba(255,240,220,.95)');
      Fx.text(this.x, this.y - 176, '弹 反', { color: '#ffffff', size: 40, life: 1, scalePop: 2 });
      RB.Post.chroma = 1;
      RB.bus.emit('parry');
      if (foe && typeof foe.onParried === 'function') foe.onParried(this);
    }

    /* ---------------- 受击 ---------------- */
    onHurt(atk, dmg, fromBehind, dir) {
      this.setState('hurt', Math.max(.26, atk.stun || .3));
      this.play('hurt', true);
      this.combo = 0; this.chain = 0;
      this.buffer = {};
      RB.Post.chroma = .8;
      // 主角被击中同样要溅血
      super.onHurt(atk, dmg, fromBehind, dir);
    }
    _hurtState(dt) {
      this.vx = U.approach(this.vx, 0, (this.onGround ? 1800 : 500) * dt);
      if (this.stateT >= (this.stateDur || .3)) this._toNeutral();
    }

    /* ---------------- 攻击 ---------------- */
    _startAttack(name) {
      const a = HERO.A[name];
      if (!a) return;
      this.setState('attack', a.total);
      this.act = a; this.actName = name; this.actHitDone = 0;
      this.play(name, true);
      this._slashFired = false;
      this.hitCount++;
      if (a.sfx) Snd.play(a.sfx, { vol: name === 'a3' || name === 'adash' ? .85 : .6 });
      // 起手向前微移
      if (this.onGround && (name === 'a1' || name === 'a2')) {
        this.vx = this.face * 130;
      }
      return true;
    }

    _attackState(dt, inp) {
      const a = this.act;
      const t = this.stateT;

      // 生成判定
      for (let i = 0; i < a.hits.length; i++) {
        const h = a.hits[i];
        if (t >= h.t && !(this._fired || (this._fired = {}))[i]) {
          this._fired[i] = true;
          this.makeHit({
            w: h.w, h: h.h, ox: h.ox, oy: h.oy,
            dmg: h.dmg, kb: h.kb, kbY: h.kbY,
            hitstop: h.hitstop, shake: h.shake, stun: h.stun,
            life: .09, pierce: false,
            type: a.heavy ? 'heavy' : 'slash',
          });
        }
      }
      // 刀光
      if (a.slash && t >= a.slash.delay && !this._slashFired && this.slashClips[this.actName]) {
        this._slashFired = true;
        const clip = this.slashClips[this.actName];
        // 刀光与本体取自同一张表、共用同一格坐标系：必须按本体的位置与缩放绘制
        Fx.add(new RB.SpriteFx(clip.key, this.x, this.y, {
          frames: clip.frames, fps: clip.fps, scale: this.scale,
          // baseFace:-1 —— soulaction-attack.png 与本体立绘一样是朝左绘制，必须跟本体一起镜像
          flip: this.face, baseFace: -1, blend: 'source-over', alpha: .98, z: 55,
        }));
      }

      // 连段取消
      if (t >= a.cancel) {
        if (this._consume('light')) {
          const nx = this.actName === 'a1' ? 'a2' : (this.actName === 'a2' ? 'a3' : null);
          if (nx) { this._fired = {}; return this._startAttack(nx); }
        }
        if (this._consume('dash') && this.dashCD <= 0 && this.onGround) return this._startDash(this.face);
        if (this._consume('skill') && this.mp >= 30 && this.skillCD <= 0) return this._startSkill();
        if (this._consume('jump') && this.onGround) { this._fired = {}; this._jump(inp); return; }
      }
      // 移动取消：判定帧之后可以用方向键打断后摇，避免进入攻击后长时间不受控。
      // 默认从最后一次判定帧起可取消（收招段全部可打断）；各段可用 mc 字段覆写。
      // 若已缓冲攻击输入则不打断，否则按住方向键会打断连段（a1→a2→a3）。
      const mc = a.mc === undefined ? a.hits[a.hits.length - 1].t : a.mc;
      if (t >= mc && !this.buffer['light']) {
        const ax = this._moveInput(inp);
        if (ax !== 0) { this._fired = {}; this._toNeutral(); return; }
      }
      if (t >= a.total) { this._fired = {}; this._toNeutral(); }
    }

    /* ---------------- 技能：居合斩 ---------------- */
    _startSkill() {
      this.mp -= 30;
      this.skillCD = .9;
      this.setState('skill', 1.35);
      this.play('skill_hideslash', true);
      this.invuln = Math.max(this.invuln, 1.15);
      this.vx = 0;
      this.faceLock = true;
      Snd.play('skill', { vol: 1 });
      Snd.play('charge', { vol: .55 });
      Fx.screenFlash(.2, '#ffffff');
      RB.Post.chroma = 1.2;
      RB.bus.emit('skill');
      this._skillHit = false;
      this._skillBlades = 0;
    }

    _skillState(dt, inp) {
      const t = this.stateT;
      this.vx = U.approach(this.vx, 0, 3000 * dt);
      // 序列时间轴（soul-hideslash 本体帧 0~28 @26fps ≈ 1.12s，之后保持收刀姿势到 1.35s）
      // 判定窗口：对齐动作条里的拔刀斩（帧 6~10 ≈ 0.23~0.42s，弧光峰值在帧 8 ≈ 0.31s）
      if (!this._skillHit && t >= .31 && t <= .5) {
        this._skillHit = true;
        // 大范围斩击
        this.makeHit({
          w: 560, h: 320, ox: 150, oy: 118,
          dmg: 58, kb: 700, kbY: 480, hitstop: 13, shake: 15, stun: .9,
          life: .1, pierce: true, crit: true,
          type: 'skill',
        });
        Fx.shake(22, .8);
        Fx.screenFlash(.85, '#ffffff');
        Fx.ring(this.x + this.face * 140, this.y - 118, 90, 'rgba(255,60,60,.9)');
        Fx.bloodMist = 1.4;
        RB.Post.speedLines = 1.6;
        RB.Post.chroma = 2;
        Snd.play('hitbig', { vol: 1 });
        Snd.play('explode', { vol: .6 });
        for (let i = 1; i <= 3; i++) {
          setTimeout(() => { if (!this.remove) Fx.shake(12, .3); }, i * 70);
        }
      }
      if (t >= 1.35) { this.faceLock = false; this._toNeutral(); }
    }

    /* ---------------- 奥义：十方俱灭 ---------------- */
    _startUltra() {
      this.mp = 0;
      this.setState('ultra', 2.9);
      this.play('skill_omnislash', true);
      this.invuln = 99;
      this.vx = 0; this.vy = 0;
      this.faceLock = true;
      Snd.play('ultra', { vol: 1 });
      Fx.screenFlash(.6, '#ffffff');
      RB.Post.chroma = 2;
      RB.bus.emit('ultra');
      this._ultraHits = 0;
      this._ultraTimeouts = [];
    }

    _ultraState(dt, inp) {
      const t = this.stateT;
      this.vx = 0; this.vy = 0;
      // 在 0.4s ~ 1.9s 之间连续多段命中
      const step = .1;
      const wantHits = Math.floor(U.clamp((t - .35) / step, 0, 16));
      while (this._ultraHits < wantHits) {
        this._ultraHits++;
        const foe = this.world ? this.world.nearestEnemy(this.x, 620) : null;
        const tx = foe ? foe.x : this.x + this.face * U.rand(90, 260);
        const ty = foe ? foe.y : this.y - U.rand(60, 180);
        const fx = (this._ultraHits % 2 === 0) ? this.face : -this.face;
        Fx.add(new RB.SpriteFx('atk_combo', tx, ty, {
          frames: [1, 2, 3], fps: 34, scale: U.rand(1.5, 2.2),
          flip: fx, alpha: .95, z: 62,
        }));
        Fx.ring(tx, ty - 90, U.rand(24, 46), 'rgba(255,50,50,.8)');
        Fx.sparks(tx, ty - 90, 12, fx);
        Fx.shake(6, .16);
        if (foe && !foe.dead) {
          this.makeHit({
            w: 240, h: 260, ox: 0, oy: 0, dmg: 8, kb: 40, kbY: 0,
            hitstop: 2, shake: 0, stun: .01, life: .05, pierce: true, type: 'ultra',
            fixed: { x: tx, y: ty - 100 },
          });
          // 直接把判定框移到目标身上
          const a = this.activeHits[this.activeHits.length - 1];
          if (a) { a.box.x = tx - 120; a.box.y = ty - 230; a.follow = false; }
        }
        Snd.play('slash', { vol: .5 });
      }
      if (t >= 2.55 && !this._ultraFin) {
        this._ultraFin = true;
        // 终结一击
        Fx.screenFlash(1, '#ffffff');
        Fx.shake(30, 1.1);
        Fx.bloodMist = 1.8;
        Fx.ring(this.x, this.y - 120, 160, 'rgba(255,70,70,1)');
        RB.Post.speedLines = 2;
        Snd.play('explode', { vol: 1 });
        this.makeHit({
          w: 900, h: 460, ox: 0, oy: 0, dmg: 90, kb: 900, kbY: 620,
          hitstop: 18, shake: 0, stun: 1.2, life: .12, pierce: true, crit: true, type: 'ultra',
        });
        const a2 = this.activeHits[this.activeHits.length - 1];
        if (a2) { a2.box.x = this.x - 450; a2.box.y = this.y - 460; a2.follow = false; }
      }
      if (t >= 2.9) {
        this.invuln = .9; this.faceLock = false; this._ultraFin = false;
        this._toNeutral();
      }
    }

    /* ---------------- 位移冲量 ---------------- */
    _applyLunge(dt) {
      const a = this.act;
      if (this.state !== 'attack' || !a || !a.lunge) return;
      const t = this.stateT;
      if (t >= a.lunge.t0 && t <= a.lunge.t1) {
        if (!this._lungeApplied) {
          this.vx = this.face * a.lunge.v;
          this._lungeApplied = true;
          Fx.dust(this.x, C.GROUND_Y, 6, -this.face);
        }
      } else {
        this._lungeApplied = false;
      }
    }

    /* ---------------- 残影 ---------------- */
    _emitGhost(dt) {
      const fast = Math.abs(this.vx) > 520 || this.state === 'dash' || this.state === 'ultra';
      if (!fast) { this._ghostT = 0; return; }
      this._ghostT = (this._ghostT || 0) + dt;
      if (this._ghostT < .035) return;
      this._ghostT = 0;
      const s = RB.Assets.sheet(this.anim.clip ? this.anim.clip.key : null);
      if (!s) return;
      Fx.ghost(this.anim.clip.key, this.anim.frameIndex, this.x, this.y, this.scale, this.spriteFlip, .3, .8);
    }

    /* ---------------- 收尾 ---------------- */
    _toNeutral() {
      if (this.onGround) { this.setState('idle'); }
      else this.setState('fall');
      this.faceLock = false;
      this._fired = {};
      this.act = null;
    }
    _simpleState(dt, inp, name, dur) {
      this.vx = U.approach(this.vx, 0, 2000 * dt);
      if (this.stateT > .06 && this._consume('light')) return this._startAttack(this.onGround ? 'a1' : 'aair');
      if (this.stateT >= dur) this._toNeutral();
    }

    _updateDead(dt) {
      this.deadT += dt;
      this.vx = U.approach(this.vx, 0, 900 * dt);
      this.physics(dt);
      this.baseUpdate(dt);
      if (this.deadT < .1) { this.play('hurt', true); Fx.stop(14); }
      if (this.deadT > .2 && this.deadT < .24) {
        Fx.blood(this.x, this.y - 100, this.face, 46, 1.8);
        Fx.shake(14, .8);
        Snd.play('die', { vol: 1 });
      }
    }

    /* ---------------- 受伤整合（含格挡） ---------------- */
    updateHitsAndDamage(dt, enemies) {
      this.updateHits(dt, enemies, (atk, target) => {
        this._onHitLanded(atk, target);
      });
    }

    _onHitLanded(atk, target) {
      const r = target.takeHit(atk);
      this.totalDmg += r.dmg;
      const gained = 4 + Math.min(6, this.combo * .5);
      this.mp = Math.min(this.maxMp, this.mp + gained);
      this.combo++;
      this.comboT = 2.6;
      if (this.combo > this.comboBest) this.comboBest = this.combo;
      RB.bus.emit('combo', this.combo);
      if (atk.type === 'heavy' || atk.type === 'skill' || atk.type === 'ultra') {
        Fx.ring(target.x, target.y - 110, 30, 'rgba(255,90,80,.8)');
      }
    }

    /** 被敌人击中时的入口（由 world 调用） */
    receiveHit(atk) {
      if (this.dead) return;
      if (this.invuln > 0) return;
      if (this.tryGuard(atk)) return;
      this.takeHit(atk);
    }

    draw(ctx) {
      // 冲刺残影额外加强
      super.draw(ctx);
    }
  }

  RB.Player = Player;
  RB.HERO = HERO;

})(window.RB);

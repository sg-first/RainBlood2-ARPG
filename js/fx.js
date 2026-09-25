/* ===========================================================
   fx.js — 特效层：精灵动画 / 粒子 / 飘字 / 震屏
   =========================================================== */
(function (RB) {
  'use strict';
  const U = RB.U, A = RB.Assets, AU = RB.AnimUtil;

  /* ---------- 精灵动画特效（播放 Animations 里的序列） ---------- */
  class SpriteFx {
    constructor(sheetKey, x, y, o) {
      o = o || {};
      this.type = 'sprite';
      this.clip = new RB.Clip(sheetKey, o.frames || null, o.fps || 22, { loop: !!o.loop });
      this.x = x; this.y = y;
      this.scale = o.scale === undefined ? 1.9 : o.scale;
      // flip = 逻辑朝向 × 特效素材基线朝向（默认朝右 +1）；素材朝左时传 baseFace:-1
      this.flip = (o.flip || 1) * (o.baseFace === -1 ? -1 : 1);
      this.alpha = o.alpha === undefined ? 1 : o.alpha;
      this.fadeOut = o.fadeOut || 0;
      this.blend = o.blend || 'source-over';
      this.follow = o.follow || null;      // 跟随实体
      this.offX = o.offX || 0; this.offY = o.offY || 0;
      this.rot = o.rot || 0;
      this.speed = o.speed || 1;
      this.drift = o.drift || null;        // {vx,vy}
      this.vx = 0; this.vy = 0;
      if (this.drift) { this.vx = this.drift.vx || 0; this.vy = this.drift.vy || 0; }
      this._t = 0;
      this.dead = false;
      // 播放两遍：这里用一次性播放
      this.anim = new RB.Anim();
      this._started = false;
      this.z = o.z === undefined ? 50 : o.z;
    }
    _frameCount() {
      const s = A.sheet(this.clip.key);
      if (!s) return 0;
      const n = this.clip.frames ? this.clip.frames.length : s.cols * s.rows;
      return n;
    }
    start() {
      const s = A.sheet(this.clip.key);
      if (!s) { this.dead = true; return; }
      this.clip.ensure();
      this.anim.play(this.clip);
      this._started = true;
    }
    update(dt) {
      if (!this._started) this.start();
      if (this.dead) return;
      this._t += dt;
      this.anim.speed = this.speed;
      this.anim.update(dt);
      if (this.follow) { this.x = this.follow.x + this.offX * this.follow.face; this.y = this.follow.y + this.offY; }
      if (this.drift) { this.x += this.vx * dt; this.y += this.vy * dt; }
      if (this.anim.done) this.dead = true;
      if (this.fadeOut > 0) {
        const d = this.clip.duration;
        if (this._t > d - this.fadeOut) this.alpha = U.clamp((d - this._t) / this.fadeOut, 0, 1) * (this.alpha || 1);
      }
    }
    draw(ctx) {
      if (this.dead) return;
      const s = A.sheet(this.clip.key);
      if (!s) return;
      const fi = this.anim.frameIndex;
      ctx.save();
      ctx.globalCompositeOperation = this.blend;
      ctx.globalAlpha *= this.alpha;
      if (this.rot) {
        const w = 192 * this.scale, h = 192 * this.scale;
        ctx.translate(this.x, this.y - h / 2);
        ctx.rotate(this.rot);
        AU.drawFrame(ctx, s.img, fi, s.cols, s.rows, 0, h / 2, this.scale, this.flip, 192);
      } else {
        AU.drawFrame(ctx, s.img, fi, s.cols, s.rows, this.x, this.y, this.scale, this.flip, 192);
      }
      ctx.restore();
    }
  }

  /* ---------- 粒子 ---------- */
  // 像素血点：统一尺寸 + 鲜红调色板（像素颗粒感）
  const DOT = 4;                 // 每个血点的边长（px，2 的倍数）
  const BLOOD_DOTS = ['#ff2b26', '#f0141e', '#ff4436', '#e00d1a', '#ff6a52'];
  const bloodDotColor = () => (Math.random() < .5 ? '#ff2b26' : U.pick(BLOOD_DOTS));

  class Particle {
    constructor(x, y, o) {
      this.type = 'p';
      this.x = x; this.y = y;
      this.vx = o.vx || 0; this.vy = o.vy || 0;
      this.g = o.g === undefined ? 1400 : o.g;
      this.drag = o.drag === undefined ? .9 : o.drag;
      this.life = o.life || .6; this.max = this.life;
      this.size = o.size || 4;
      this.size2 = o.size2 === undefined ? this.size * .2 : o.size2;
      this.color = o.color || '#c5121f';
      this.shape = o.shape || 'blood';     // blood | ink | spark | dust | ring | shard
      this.rot = o.rot || Math.random() * 6.28;
      this.vr = o.vr || U.rand(-8, 8);
      this.blend = o.blend || 'source-over';
      this.stretch = o.stretch || 0;
      this.grid = o.grid || 0;         // >0：像素网格（尺寸/坐标按此对齐）
      this.splat = !!o.splat;          // 落地留下像素血迹
      this.dead = false;
      this.alpha = o.alpha === undefined ? 1 : o.alpha;
      this.z = o.z === undefined ? 40 : o.z;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.vy += this.g * dt;
      const d = Math.pow(this.drag, dt * 60);
      this.vx *= d; this.vy *= d;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.rot += this.vr * dt;
      if (this.splat) {
        const gy = RB.CFG ? RB.CFG.GROUND_Y : 596;
        if (this.y >= gy) {
          if (Math.random() < .55) Fx.groundBlood(this.x, gy, this.size, this.color);
          this.dead = true;
        }
      }
    }
    draw(ctx) {
      const t = this.life / this.max;
      const a = U.clamp(t * 1.4, 0, 1) * this.alpha;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.globalCompositeOperation = this.blend;
      const sz = U.lerp(this.size2, this.size, U.clamp(t * 1.6, 0, 1));
      switch (this.shape) {
        case 'blood': {
          // 拉长的血滴
          const sp = Math.hypot(this.vx, this.vy);
          const ang = Math.atan2(this.vy, this.vx);
          ctx.translate(this.x, this.y); ctx.rotate(ang);
          const L = sz * (1 + Math.min(sp / 130, 3.2));
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, L, sz * .55, 0, 0, 6.2832);
          ctx.fill();
          break;
        }
        case 'pixel': {
          // 点状像素：整数方块 + 网格对齐，硬边无抗锯齿
          const g = this.grid || 2;
          const s = Math.max(g, Math.round(sz / g) * g);
          const px = Math.floor(this.x / g) * g - (s >> 1);
          const py = Math.floor(this.y / g) * g - (s >> 1);
          ctx.fillStyle = this.color;
          ctx.fillRect(px, py, s, s);
          // 高速时向后补一个同尺寸的拖尾点（保持颗粒一致）
          if (Math.hypot(this.vx, this.vy) > 300) {
            ctx.globalAlpha = a * .5;
            ctx.fillRect(
              Math.floor((this.x - this.vx * .014) / g) * g - (s >> 1),
              Math.floor((this.y - this.vy * .014) / g) * g - (s >> 1),
              s, s);
          }
          break;
        }
        case 'ink': {
          ctx.translate(this.x, this.y); ctx.rotate(this.rot);
          ctx.fillStyle = this.color;
          ctx.beginPath();
          const n = 7;
          for (let i = 0; i < n; i++) {
            const an = i / n * 6.2832;
            const r = sz * (.62 + Math.sin(i * 2.7 + this.rot) * .38);
            if (i === 0) ctx.moveTo(Math.cos(an) * r, Math.sin(an) * r);
            else ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r);
          }
          ctx.closePath(); ctx.fill();
          break;
        }
        case 'shard': {
          ctx.translate(this.x, this.y); ctx.rotate(this.rot);
          ctx.fillStyle = this.color;
          ctx.fillRect(-sz * .3, -sz * 1.6, sz * .6, sz * 3.2);
          break;
        }
        case 'spark': {
          const sp = Math.hypot(this.vx, this.vy);
          const ang = Math.atan2(this.vy, this.vx);
          ctx.translate(this.x, this.y); ctx.rotate(ang);
          const L = sz * (1 + Math.min(sp / 90, 5));
          const grd = ctx.createLinearGradient(-L, 0, L, 0);
          grd.addColorStop(0, 'rgba(255,255,255,0)');
          grd.addColorStop(.5, this.color);
          grd.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grd;
          ctx.fillRect(-L, -sz * .22, L * 2, sz * .44);
          break;
        }
        case 'dust': {
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.arc(this.x, this.y, sz, 0, 6.2832);
          ctx.fill();
          break;
        }
        case 'ring': {
          const p = 1 - t;
          ctx.translate(this.x, this.y);
          ctx.scale(1, .38);
          ctx.strokeStyle = this.color;
          ctx.lineWidth = Math.max(1, sz * .16 * t);
          ctx.beginPath();
          ctx.arc(0, 0, sz * (1.2 + p * 4.4), 0, 6.2832);
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    }
  }

  /* ---------- 飘字 ---------- */
  class FloatText {
    constructor(x, y, text, o) {
      o = o || {};
      this.type = 'text';
      this.x = x; this.y = y;
      this.text = text;
      this.vy = o.vy === undefined ? -110 : o.vy;
      this.vx = o.vx || U.rand(-22, 22);
      this.life = o.life || .85; this.max = this.life;
      this.color = o.color || '#ffffff';
      this.size = o.size || 34;
      this.bold = o.bold !== false;
      this.stroke = o.stroke || 'rgba(0,0,0,.92)';
      this.scalePop = o.scalePop === undefined ? 1.5 : o.scalePop;
      this.z = o.z === undefined ? 90 : o.z;
      this.dead = false;
      this._t = 0;
    }
    update(dt) {
      this._t += dt;
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 150 * dt;
      this.vx *= Math.pow(.9, dt * 60);
    }
    draw(ctx) {
      const t = 1 - this.life / this.max;
      const pop = t < .18 ? U.lerp(this.scalePop, 1, t / .18) : 1;
      const a = t > .66 ? (1 - t) / .34 : 1;
      ctx.save();
      ctx.globalAlpha = U.clamp(a, 0, 1);
      ctx.translate(this.x, this.y);
      ctx.scale(pop, pop);
      ctx.font = (this.bold ? '700 ' : '') + this.size + 'px "Noto Serif SC",Georgia,serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = this.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(this.text, 0, 0);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, 0, 0);
      ctx.restore();
    }
  }

  /* ---------- 残影 ---------- */
  class AfterImage {
    constructor(sheetKey, frame, x, y, scale, flip, alpha, life) {
      this.type = 'ghost';
      this.sheetKey = sheetKey; this.frame = frame;
      this.x = x; this.y = y; this.scale = scale; this.flip = flip;
      this.alpha = alpha; this.life = life; this.max = life;
      this.z = -10;
      this.dead = false;
    }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx) {
      const s = A.sheet(this.sheetKey);
      if (!s) return;
      const t = this.life / this.max;
      ctx.save();
      ctx.globalAlpha = this.alpha * t * .55;
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'grayscale(1) brightness(1.5)';
      AU.drawFrame(ctx, s.img, this.frame, s.cols, s.rows, this.x, this.y, this.scale, this.flip, 192);
      ctx.restore();
    }
  }

  /* ---------- 特效管理器 ---------- */
  const Fx = RB.Fx = {
    list: [],
    decals: [],               // 地面像素血迹（世界坐标）
    shakeAmt: 0, shakeT: 0, shakeDur: 0,
    shakeX: 0, shakeY: 0,
    flash: 0, flashColor: '#fff',
    hitstop: 0,
    bloodMist: 0,

    clear() { this.list.length = 0; this.decals.length = 0; this.shakeAmt = 0; this.shakeX = this.shakeY = 0; this.flash = 0; this.hitstop = 0; this.bloodMist = 0; },

    add(o) { this.list.push(o); return o; },

    /* --- 精灵特效 --- */
    sprite(sheetKey, x, y, o) { return this.add(new SpriteFx(sheetKey, x, y, o)); },
    /** 在实体身上播放（跟随并自动朝向） */
    on(sheetKey, ent, o) {
      o = o || {};
      o.follow = ent;
      // flip = 实体逻辑朝向 × 特效素材基线朝向（默认朝右 +1）
      o.flip = ent.face * (o.baseFace === -1 ? -1 : 1);
      return this.add(new SpriteFx(sheetKey, ent.x, ent.y, o));
    },

    /* --- 粒子 --- */
    /**
     * 受击溅血：大量点状像素血点（默认 2px 网格对齐），落地会留下像素血迹
     */
    blood(x, y, dirX, amount, power) {
      amount = amount || 12; power = power || 1;
      const sgn = dirX < 0 ? -1 : 1;
      const n = Math.round(amount * 2.8);          // 大量小点
      const grid = 2;
      for (let i = 0; i < n; i++) {
        const far = Math.random() < .32;           // 少量溅得更远的散点
        const a = U.rand(-1.45, .7) * sgn + (sgn < 0 ? Math.PI : 0);
        const sp = U.rand(150, 620) * power * (far ? 1.45 : 1);
        this.add(new Particle(x + U.rand(-10, 10), y + U.rand(-20, 8), {
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - U.rand(50, 250) * power,
          g: 1650, drag: .9,
          life: U.rand(.3, 1) * (far ? 1.25 : 1),
          size: DOT, size2: DOT,                   // 所有血点一样大
          color: bloodDotColor(),
          shape: 'pixel', grid: grid, splat: true, z: 44,
        }));
      }
      // 少量血雾（保留一点体积感）
      for (let i = 0; i < Math.max(2, amount / 4); i++) {
        this.add(new Particle(x + U.rand(-14, 14), y + U.rand(-22, 4), {
          vx: U.rand(-70, 70), vy: U.rand(-130, -20), g: -30, drag: .9,
          life: U.rand(.4, .9), size: U.rand(9, 20), size2: 2,
          color: 'rgba(226,20,30,.4)', shape: 'dust', alpha: .45, z: 45,
        }));
      }
      this.bloodMist = Math.min(1.4, this.bloodMist + .12 * power);
    },

    /** 地面像素血迹：一簇对齐网格的小方块，缓慢淡出 */
    groundBlood(x, y, size, color) {
      const ds = this.decals;
      if (ds.length > 240) ds.splice(0, ds.length - 240);
      const g = 2;
      const s = Math.max(g, Math.round(DOT / g) * g);   // 与溅血点同尺寸
      const dots = [];
      const n = U.randInt(3, 6);
      for (let i = 0; i < n; i++) {
        const an = Math.random() * 6.2832, r = U.rand(0, s * 2.4);
        dots.push({
          ox: Math.round(Math.cos(an) * r / g) * g,
          oy: Math.round(Math.sin(an) * r * .45 / g) * g,   // 压扁，贴地
          s,
        });
      }
      const life = U.rand(11, 20);
      ds.push({
        x: Math.round(x / g) * g, y: Math.round(y / g) * g,
        dots, color: color || '#f0141e',
        alpha: U.rand(.78, .95), life, max: life,
      });
    },

    _drawDecals(ctx) {
      const ds = this.decals;
      if (!ds.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (const d of ds) {
        ctx.globalAlpha = d.alpha * U.clamp(d.life / 1.6, 0, 1);
        ctx.fillStyle = d.color;
        for (const p of d.dots) ctx.fillRect(d.x + p.ox - (p.s >> 1), d.y + p.oy - (p.s >> 1), p.s, p.s);
      }
      ctx.restore();
    },

    ink(x, y, amount, spread, size) {
      amount = amount || 8; spread = spread || 260;
      for (let i = 0; i < amount; i++) {
        const a = Math.random() * 6.2832;
        const sp = U.rand(spread * .3, spread);
        this.add(new Particle(x, y, {
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .7 - U.rand(0, 160),
          g: 620, drag: .9,
          life: U.rand(.5, 1.3),
          size: U.rand(3, (size || 11)), size2: .6,
          color: 'rgba(20,18,26,.72)', shape: 'ink', z: 30,
        }));
      }
    },

    sparks(x, y, amount, dirX) {
      amount = amount || 10;
      for (let i = 0; i < amount; i++) {
        const a = U.rand(-1.1, 1.1) + (dirX < 0 ? Math.PI : 0);
        const sp = U.rand(280, 780);
        this.add(new Particle(x, y, {
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - U.rand(0, 180),
          g: 700, drag: .88,
          life: U.rand(.16, .4),
          size: U.rand(2, 5), size2: .5,
          color: Math.random() < .5 ? '#ffe9c4' : '#ff9b6a',
          shape: 'spark', blend: 'lighter', z: 60,
        }));
      }
    },

    dust(x, y, amount, dirX) {
      amount = amount || 5;
      for (let i = 0; i < amount; i++) {
        this.add(new Particle(x + U.rand(-14, 14), y - U.rand(0, 12), {
          vx: U.rand(-110, 110) - (dirX || 0) * 90,
          vy: U.rand(-150, -30), g: 340, drag: .9,
          life: U.rand(.3, .7),
          size: U.rand(5, 14), size2: 1,
          color: 'rgba(196,190,180,.34)', shape: 'dust', z: 20,
        }));
      }
    },

    ring(x, y, r, color) {
      this.add(new Particle(x, y, {
        life: .42, size: r || 26, size2: r || 26, g: 0, drag: .99,
        color: color || 'rgba(220,40,44,.85)', shape: 'ring', blend: 'lighter', z: 58,
      }));
    },

    shards(x, y, amount, color) {
      amount = amount || 8;
      for (let i = 0; i < amount; i++) {
        const a = U.rand(-2.6, -.5);
        const sp = U.rand(150, 520);
        this.add(new Particle(x, y, {
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          g: 1300, drag: .94,
          life: U.rand(.5, 1.1),
          size: U.rand(3, 8), size2: 1,
          color: color || 'rgba(24,20,30,.9)', shape: 'shard', z: 42,
        }));
      }
    },

    text(x, y, str, o) { return this.add(new FloatText(x, y, str, o)); },

    ghost(sheetKey, frame, x, y, scale, flip, life, alpha) {
      return this.add(new AfterImage(sheetKey, frame, x, y, scale, flip, alpha === undefined ? 1 : alpha, life || .26));
    },

    /* --- 屏幕级 --- */
    shake(amount, dur) {
      if (amount > this.shakeAmt) {
        this.shakeAmt = amount; this.shakeDur = dur || .34; this.shakeT = this.shakeDur;
      }
    },
    smallShake(a) { this.shake(a === undefined ? 4 : a, .18); },
    bigShake(a) { this.shake(a === undefined ? 17 : a, .48); },
    screenFlash(a, color) { this.flash = Math.max(this.flash, a); this.flashColor = color || '#ffffff'; },
    /** 命中停顿：冻结世界若干帧 */
    stop(frames) { this.hitstop = Math.max(this.hitstop, frames); },

    update(dt) {
      const list = this.list;
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        e.update(dt);
        if (e.dead) list.splice(i, 1);
      }
      // 地面血迹缓慢淡出
      const ds = this.decals;
      for (let i = ds.length - 1; i >= 0; i--) {
        ds[i].life -= dt;
        if (ds[i].life <= 0) ds.splice(i, 1);
      }
      // 震屏衰减
      if (this.shakeT > 0) {
        this.shakeT -= dt;
        const k = Math.max(0, this.shakeT / this.shakeDur);
        const amp = this.shakeAmt * k * k;
        this.shakeX = (Math.random() * 2 - 1) * amp;
        this.shakeY = (Math.random() * 2 - 1) * amp * .62;
        if (this.shakeT <= 0) { this.shakeAmt = 0; this.shakeX = this.shakeY = 0; }
      } else { this.shakeX = this.shakeY = 0; }
      this.flash = Math.max(0, this.flash - dt * 3.6);
      this.bloodMist = Math.max(0, this.bloodMist - dt * .34);
    },

    /** 按 z 排序绘制 */
    draw(ctx) {
      this._drawDecals(ctx);
      this.list.sort((a, b) => (a.z || 0) - (b.z || 0));
      for (const e of this.list) e.draw(ctx);
    },

    /** 只绘制 z < 0 的（角色身后的层） */
    drawBack(ctx) {
      this._drawDecals(ctx);
      for (const e of this.list) if ((e.z || 0) < 0) e.draw(ctx);
    },
    drawFront(ctx) {
      for (const e of this.list) if ((e.z || 0) >= 0) e.draw(ctx);
    },
  };

  RB.SpriteFx = SpriteFx; RB.Particle = Particle;

})(window.RB);

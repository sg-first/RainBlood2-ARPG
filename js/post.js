/* ===========================================================
   post.js — 后期与氛围：暗角 / 颗粒 / 血雨 / 速度线 / 色差
   =========================================================== */
(function (RB) {
  'use strict';
  const U = RB.U;

  const Post = RB.Post = {
    vignette: null,        // 离屏暗角
    grain: [],             // 离屏颗粒帧
    grainIdx: 0, grainT: 0,
    rain: [],
    rainOn: true,
    W: 1280, H: 720,
    speedLines: 0,
    chroma: 0,
    paper: null,
    _dpr: 1,

    init(W, H, dpr) {
      this.W = W; this.H = H; this._dpr = dpr || 1;
      this._buildVignette(W, H);
      this._buildGrain(W, H);
      this._buildPaper(W, H);
      this._buildRain();
    },

    _buildVignette(W, H) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(W * .5, H * .48, Math.min(W, H) * .18, W * .5, H * .5, Math.max(W, H) * .78);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(.55, 'rgba(0,0,0,.14)');
      grd.addColorStop(.82, 'rgba(0,0,0,.44)');
      grd.addColorStop(1, 'rgba(0,0,0,.86)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      this.vignette = c;
    },

    _buildGrain(W, H) {
      // 4 帧循环颗粒，降低重复感
      const size = Math.max(1, Math.round(W / 2));
      const sizeH = Math.max(1, Math.round(H / 2));
      for (let k = 0; k < 4; k++) {
        const c = document.createElement('canvas'); c.width = size; c.height = sizeH;
        const g = c.getContext('2d');
        const img = g.createImageData(size, sizeH);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = 118 + (Math.random() * 2 - 1) * 78;
          d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        this.grain.push(c);
      }
    },

    /** 宣纸纹理：极淡的纤维噪点 */
    _buildPaper(W, H) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.globalAlpha = .16;
      for (let i = 0; i < 1400; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        g.strokeStyle = Math.random() < .5 ? 'rgba(120,110,100,.25)' : 'rgba(40,38,44,.2)';
        g.lineWidth = Math.random() * 1.4;
        g.beginPath(); g.moveTo(x, y);
        g.lineTo(x + (Math.random() * 2 - 1) * 40, y + (Math.random() * 2 - 1) * 8);
        g.stroke();
      }
      this.paper = c;
    },

    _buildRain() {
      this.rain = [];
      for (let i = 0; i < 170; i++) {
        this.rain.push({
          x: Math.random() * (this.W + 400) - 200,
          y: Math.random() * this.H,
          len: U.rand(24, 96),
          sp: U.rand(760, 1560),
          a: U.rand(.06, .26),
          w: U.rand(.6, 1.7),
          red: Math.random() < .22,
          sway: U.rand(-.16, -.06),
        });
      }
    },

    update(dt) {
      this.grainT += dt;
      if (this.grainT > .045) { this.grainT = 0; this.grainIdx = (this.grainIdx + 1) % this.grain.length; }
      if (this.rainOn) {
        for (const r of this.rain) {
          r.y += r.sp * dt;
          r.x += r.sp * r.sway * dt;
          if (r.y > this.H + 40) {
            r.y = -U.rand(30, 200);
            r.x = Math.random() * (this.W + 400) - 200;
          }
        }
      }
      this.speedLines = Math.max(0, this.speedLines - dt * 1.7);
      this.chroma = Math.max(0, this.chroma - dt * 2.4);
    },

    /** 世界层之前：远景雨（细，暗） */
    drawRain(ctx, alpha) {
      if (!this.rainOn) return;
      const a0 = alpha === undefined ? 1 : alpha;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (const r of this.rain) {
        ctx.strokeStyle = r.red
          ? 'rgba(190,26,32,' + (r.a * a0) + ')'
          : 'rgba(205,205,215,' + (r.a * a0) + ')';
        ctx.lineWidth = r.w;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + r.len * r.sway * 2.2, r.y + r.len);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawSpeedLines(ctx, dir) {
      const v = this.speedLines;
      if (v <= .02) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const W = this.W, H = this.H;
      const cx = dir < 0 ? W * .82 : W * .18;
      for (let i = 0; i < 26; i++) {
        const t = i / 26;
        const y = H * (.06 + t * .88) + Math.sin(i * 7.3) * 20;
        const len = (90 + Math.abs(Math.sin(i * 3.1)) * 340) * v;
        const a = v * .3 * (.4 + Math.abs(Math.cos(i * 2.2)) * .6);
        const grd = ctx.createLinearGradient(cx, y, cx + (dir < 0 ? -len : len), y);
        grd.addColorStop(0, 'rgba(255,255,255,' + a + ')');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = grd;
        ctx.lineWidth = U.rand(1, 2.6);
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx + (dir < 0 ? -len : len), y + U.rand(-4, 4));
        ctx.stroke();
      }
      ctx.restore();
    },

    /** 屏幕级色散重影：复制当前帧，偏移 + 红色染色后叠加 */
    _chromaBuf: null,
    _copyFrame(src) {
      const W = this.W, H = this.H;
      if (!this._chromaBuf) {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        this._chromaBuf = c;
      }
      const g = this._chromaBuf.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
      g.clearRect(0, 0, W, H);
      g.drawImage(src, 0, 0, W, H);
      return this._chromaBuf;
    },

    /** 全屏后期：在 render 的最后调用 */
    compose(ctx, o) {
      o = o || {};
      const W = this.W, H = this.H;
      // 1) 色散重影（受击 / 弹反 / 重击时）
      if (this.chroma > .02) {
        const buf = this._copyFrame(ctx.canvas);
        const d = this.chroma * 7;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.chroma * .2;
        try { ctx.filter = 'grayscale(1) sepia(1) saturate(9) hue-rotate(-32deg)'; } catch (e) {}
        ctx.drawImage(buf, -d, 0, W, H);
        ctx.drawImage(buf, d, 0, W, H);
        ctx.restore();
      }
      // 2) 暗角
      if (this.vignette) {
        ctx.save();
        ctx.globalAlpha = o.vignette === undefined ? 1 : o.vignette;
        ctx.drawImage(this.vignette, 0, 0, W, H);
        ctx.restore();
      }
      // 3) 宣纸纹理
      if (this.paper) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = .3;
        ctx.drawImage(this.paper, 0, 0, W, H);
        ctx.restore();
      }
      // 4) 胶片颗粒
      const gf = this.grain[this.grainIdx];
      if (gf) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = o.grain === undefined ? .085 : o.grain;
        ctx.drawImage(gf, 0, 0, W, H);
        ctx.restore();
      }
      // 5) 血色氛围（血雾）
      if (RB.Fx.bloodMist > .01) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = Math.min(.5, RB.Fx.bloodMist * .28);
        ctx.fillStyle = '#5a0810';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      // 6) 白/红闪
      if (RB.Fx.flash > .01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(.9, RB.Fx.flash * .5);
        ctx.fillStyle = RB.Fx.flashColor;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    },

    /** 死亡/胜利时的黑白化 + 压暗 */
    monochrome(ctx, amount, dark) {
      if (amount <= .01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = amount;
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.restore();
      if (dark > 0) {
        ctx.save();
        ctx.globalAlpha = dark;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.restore();
      }
    },
  };

})(window.RB);

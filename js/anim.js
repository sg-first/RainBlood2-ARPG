/* ===========================================================
   anim.js — 精灵表帧动画
   =========================================================== */
(function (RB) {
  'use strict';
  const A = RB.Assets;

  /** 生成行优先帧索引数组 */
  function seq(cols, from, to) {
    const a = [];
    for (let i = from; i <= to; i++) a.push(i);
    return a;
  }
  /** 取某一行的所有帧 */
  function row(cols, r, count) { return seq(cols, r * cols, r * cols + (count || cols) - 1); }
  /** 取某行的连续若干帧 */
  function rowRange(cols, r, c0, c1) { return seq(cols, r * cols + c0, r * cols + c1); }

  /**
   * 动画剪辑
   * @param sheetKey 资源 key
   * @param frames   帧索引数组
   * @param fps      帧率
   * @param opts     {loop, pingpong, hold(末尾停留帧数倍率),
   *                  baseFace 素材基线朝向：+1=素材本身朝右（默认），-1=素材本身朝左。
   *                  绘制时按 face*baseFace<0 决定是否水平镜像。}
   */
  class Clip {
    constructor(sheetKey, frames, fps, opts) {
      opts = opts || {};
      this.key = sheetKey;
      this.frames = frames;
      this.fps = fps || 12;
      this.loop = !!opts.loop;
      this.pingpong = !!opts.pingpong;
      this.hold = opts.hold || 0;
      this.baseFace = opts.baseFace === -1 ? -1 : 1;
      this.sheet = null;         // 延迟解析
    }
    /** 解析图集；frames 为 null 时自动展开为整表全部帧 */
    ensure() {
      if (!this.sheet) this.sheet = A.sheet(this.key);
      if (this.sheet && !this.frames) {
        const n = this.sheet.cols * this.sheet.rows;
        this.frames = [];
        for (let i = 0; i < n; i++) this.frames.push(i);
      }
      if (!this.frames) this.frames = [0];
      return this.sheet;
    }
    get length() { return this.frames.length; }
    /** 时长（秒） */
    get duration() {
      const extra = this.hold > 0 ? this.hold / this.fps : 0;
      return this.length / this.fps + extra;
    }
  }

  /** 播放实例：挂到实体上 */
  class Anim {
    constructor() { this.clip = null; this.t = 0; this.idx = 0; this.done = true; this.speed = 1; }
    play(clip, restart) {
      if (!clip) return;
      if (this.clip === clip && !restart && !this.done) return;
      clip.ensure();
      this.clip = clip; this.t = 0; this.idx = 0; this.done = false; this._holdT = 0;
    }
    update(dt) {
      const c = this.clip;
      if (!c || this.done) return;
      this.t += dt * this.speed;
      const step = 1 / c.fps;
      let guard = 0;
      while (this.t >= step && guard++ < 8) {
        this.t -= step;
        if (this.idx < c.frames.length - 1) {
          this.idx++;
        } else if (c.hold > 0 && this.t < c.hold / c.fps) {
          // 停留在最后一帧
          this.t = this.t; break;
        } else if (c.loop) {
          this.idx = 0;
        } else {
          this.done = true; this.t = 0;
          break;
        }
      }
      // 处理 hold 的计时（当 idx 到底后继续累计直到超过 hold）
      if (c.hold > 0 && this.idx === c.frames.length - 1 && !c.loop) {
        this._holdT = (this._holdT || 0) + dt;
        if (this._holdT >= c.hold / c.fps) { this.done = true; this._holdT = 0; }
      } else this._holdT = 0;
    }
    get frameIndex() {
      const c = this.clip; if (!c) return 0;
      return c.frames[Math.min(this.idx, c.frames.length - 1)];
    }
    /** 归一化进度 0..1 */
    get progress() {
      const c = this.clip; if (!c || !c.length) return 0;
      return this.idx / Math.max(1, c.length - 1);
    }
    reset() { this.t = 0; this.idx = 0; this.done = false; this._holdT = 0; }
    seek(i) { this.idx = RB.U.clamp(i, 0, this.clip.frames.length - 1); this.t = 0; this.done = false; }
  }

  /**
   * 绘制一帧精灵
   * @param ctx         2d context（已应用相机变换，处于世界坐标）
   * @param img         图
   * @param frameIdx    行优先帧索引
   * @param cols,rows   网格
   * @param x,y         世界坐标下的"脚底中心"锚点
   * @param scale       缩放
   * @param flip        -1 表示水平翻转
   * @param F           单元格尺寸
   */
  function drawFrame(ctx, img, frameIdx, cols, rows, x, y, scale, flip, F, opt) {
    F = F || 192;
    const col = frameIdx % cols, r = Math.floor(frameIdx / cols);
    if (r >= rows) return;
    const sx = col * F, sy = r * F;
    const w = F * scale, h = F * scale;
    ctx.save();
    if (opt && opt.alpha !== undefined) ctx.globalAlpha *= opt.alpha;
    if (opt && opt.tint) ctx.filter = opt.tint;

    if (flip < 0) {
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, F, F, -w / 2, -h, w, h);
    } else {
      ctx.drawImage(img, sx, sy, F, F, x - w / 2, y - h, w, h);
    }
    if (opt && opt.tint) ctx.filter = 'none';
    ctx.restore();
  }

  RB.Anim = Anim;
  RB.Clip = Clip;
  RB.AnimUtil = { seq, row, rowRange, drawFrame };

})(window.RB);

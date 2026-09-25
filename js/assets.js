/* ===========================================================
   assets.js — 资源清单与加载
   所有精灵表统一 192x192 单元格，锚点 = 单元格底部中心
   =========================================================== */
(function (RB) {
  'use strict';

  const Assets = RB.Assets = {
    manifest: null,
    images: {},          // key -> HTMLImageElement
    TOTAL: 0,
    loaded: 0,
    ready: false,
    _bySrc: {},          // src -> key   (去重：同一文件可能被多个 key 引用)

    /** 读取 manifest */
    async init() {
      const res = await fetch('assets/manifest.json');
      this.manifest = await res.json();
      this.frame = this.manifest.frame || 192;
    },

    /** 收集所有资源路径 */
    _collect() {
      const m = this.manifest, list = [];
      for (const g of ['chara', 'fx', 'bg', 'ui']) {
        for (const k in m[g]) list.push({ key: k, group: g, info: m[g][k] });
      }
      return list;
    },

    /** 加载全部，onProgress(done,total,key) */
    load(onProgress) {
      const list = this._collect();
      this.TOTAL = list.length;
      this.loaded = 0;
      return Promise.all(list.map(item => new Promise(resolve => {
        const img = new Image();
        img.onload = () => { this._done(item, img, onProgress, resolve); };
        img.onerror = () => {
          console.warn('[asset fail]', item.key, item.info.src);
          this._done(item, null, onProgress, resolve);
        };
        img.src = item.info.src;
      })));
    },

    _done(item, img, onProgress, resolve) {
      const key = item.group === 'chara' ? 'c_' + item.key
                : item.group === 'fx' ? 'f_' + item.key
                : item.group === 'ui' ? 'u_' + item.key
                : 'b_' + item.key;
      if (img) {
        this.images[key] = img;
        this._bySrc[item.info.src] = key;
      }
      this.loaded++;
      if (onProgress) onProgress(this.loaded, this.TOTAL, item.key);
      resolve();
    },

    /** 取图：优先精确 key，也支持原名兜底 */
    img(key) {
      let im = this.images[key];
      if (im) return im;
      // 容错：允许传 'hero_idle' 这类裸名
      for (const p of ['c_', 'f_', 'b_', 'u_']) {
        im = this.images[p + key];
        if (im) return im;
      }
      return null;
    },

    /** 取精灵表元信息（chara 或 fx） */
    meta(key) {
      const m = this.manifest;
      if (!m) return null;
      return (m.chara && m.chara[key]) || (m.fx && m.fx[key]) || null;
    },

    /** 快捷：拿 chara/fx 的图 + 元信息 */
    sheet(key) {
      const meta = this.meta(key);
      if (!meta) return null;
      const img = this.images['c_' + key] || this.images['f_' + key];
      if (!img) return null;
      return { img, cols: meta.cols, rows: meta.rows, w: meta.w, h: meta.h };
    },

    bg(key) {
      return this.images['b_' + key] || null;
    },
    ui(key) {
      return this.images['u_' + key] || null;
    },
  };

})(window.RB);

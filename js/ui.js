/* ===========================================================
   ui.js — 战斗 HUD（水墨风，Canvas 绘制）
   =========================================================== */
(function (RB) {
  'use strict';
  const U = RB.U, C = RB.CFG;

  const UI = RB.UI = {
    api: null,
    comboShow: 0, comboT: 0, comboScale: 1,
    mpFlash: 0, hpFlash: 0, hpLag: 1,
    bannerT: 0, bannerText: '', bannerSub: '',
    waveInfo: null, waveInfoT: 0,
    tipT: 0, tipText: '',
    marquee: [], // 战斗日志
    lastMp: 0,

    init(api) { this.api = api; },

    onCombo(n) {
      this.comboShow = n; this.comboT = 2.6; this.comboScale = 1.55;
    },
    onWave(d) { this.waveInfo = d; this.waveInfoT = 3.2; },
    onChapter(ch) {
      this.bannerText = ch.title; this.bannerSub = ch.sub; this.bannerT = 3.4;
    },
    tip(t, dur) { this.tipText = t; this.tipT = dur || 4; },
    push(t, color) {
      this.marquee.unshift({ t, color: color || '#ccc', life: 3.2 });
      if (this.marquee.length > 4) this.marquee.pop();
    },

    update(dt, st) {
      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) this.comboShow = 0;
      }
      this.comboScale = U.damp(this.comboScale, 1, 11, dt);
      this.mpFlash = Math.max(0, this.mpFlash - dt * 2.4);
      this.hpFlash = Math.max(0, this.hpFlash - dt * 2.2);
      this.bannerT = Math.max(0, this.bannerT - dt);
      this.waveInfoT = Math.max(0, this.waveInfoT - dt);
      this.tipT = Math.max(0, this.tipT - dt);
      for (let i = this.marquee.length - 1; i >= 0; i--) {
        this.marquee[i].life -= dt;
        if (this.marquee[i].life <= 0) this.marquee.splice(i, 1);
      }
      // 血条缓动
      const p = st.player;
      const target = p ? U.clamp(p.hp / p.maxHp, 0, 1) : 0;
      this.hpLag = U.damp(this.hpLag, target, 5.5, dt);
      if (this.lastMp < (p ? p.mp : 0)) this.mpFlash = 1;
      this.lastMp = p ? p.mp : 0;
    },

    /* ================= 主绘制 ================= */
    draw(ctx, st) {
      const p = st.player, W = C.VIEW_W, H = C.VIEW_H;
      ctx.save();
      ctx.textBaseline = 'middle';

      this._drawPlayerHud(ctx, p);
      this._drawCombo(ctx);
      this._drawEnemyCounter(ctx, st);
      this._drawBossBar(ctx, st);
      this._drawWaveInfo(ctx);
      this._drawTips(ctx, st);
      this._drawMarquee(ctx);
      this._drawBanner(ctx);

      ctx.restore();
    },

    /* ---------- 主角血条 ---------- */
    _drawPlayerHud(ctx, p) {
      if (!p) return;
      const x = 42, y = 40;
      const bw = 372, bh = 17;

      // 头像
      const head = RB.Assets.ui('head_hero');
      const hr = 38;
      ctx.save();
      ctx.globalAlpha = .95;
      // 头像底
      ctx.beginPath(); ctx.arc(x + hr, y + hr, hr + 4, 0, 6.2832);
      ctx.fillStyle = 'rgba(8,6,10,.86)'; ctx.fill();
      ctx.strokeStyle = 'rgba(190,30,36,.55)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x + hr, y + hr, hr, 0, 6.2832); ctx.clip();
      if (head) {
        const s = Math.max(hr * 2 / head.width, hr * 2 / head.height);
        ctx.drawImage(head, x + hr - head.width * s / 2, y + hr - head.height * s / 2, head.width * s, head.height * s);
      } else {
        ctx.fillStyle = '#2a2430'; ctx.fill();
      }
      ctx.restore();

      const bx = x + hr * 2 + 16;
      // 血条底
      ctx.save();
      ctx.fillStyle = 'rgba(6,5,9,.82)';
      ctx.fillRect(bx - 3, y - 3, bw + 6, bh + 6);
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.fillRect(bx, y, bw, bh);

      // 缓动层（受伤残影）
      const r0 = U.clamp(p.hp / p.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(220,180,90,.5)';
      ctx.fillRect(bx, y, bw * this.hpLag, bh);

      // 血量
      const grd = ctx.createLinearGradient(bx, y, bx, y + bh);
      grd.addColorStop(0, '#e8323c');
      grd.addColorStop(.5, '#b3101c');
      grd.addColorStop(1, '#6d0710');
      ctx.fillStyle = grd;
      ctx.fillRect(bx, y, bw * r0, bh);
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.fillRect(bx, y + 1, bw * r0, 2);

      // 边框
      ctx.strokeStyle = 'rgba(200,190,180,.42)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx - 3.5, y - 3.5, bw + 7, bh + 7);
      // 刻度
      ctx.strokeStyle = 'rgba(0,0,0,.42)'; ctx.lineWidth = 1;
      for (let i = 1; i < 10; i++) {
        const sx = bx + bw * i / 10;
        ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx, y + bh); ctx.stroke();
      }
      // 名字
      ctx.font = '600 13px "Noto Serif SC",serif';
      ctx.fillStyle = 'rgba(232,228,220,.85)';
      ctx.textAlign = 'left';
      ctx.fillText('魂', bx + 5, y + bh / 2 + 1);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,.62)';
      ctx.font = '600 12px Georgia,serif';
      ctx.fillText(Math.max(0, Math.ceil(p.hp)) + ' / ' + p.maxHp, bx + bw - 5, y + bh / 2 + 1);
      ctx.restore();

      // 气条
      const qy = y + bh + 12, qw = bw * .62, qh = 8;
      const mpR = U.clamp(p.mp / p.maxMp, 0, 1);
      ctx.save();
      ctx.fillStyle = 'rgba(6,5,9,.82)';
      ctx.fillRect(bx - 3, qy - 3, qw + 6, qh + 6);
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.fillRect(bx, qy, qw, qh);
      const mg = ctx.createLinearGradient(bx, qy, bx, qy + qh);
      mg.addColorStop(0, this.mpFlash > 0 ? '#fff6d0' : '#ffd764');
      mg.addColorStop(.5, '#e8a01c');
      mg.addColorStop(1, '#a85c06');
      ctx.fillStyle = mg;
      ctx.fillRect(bx, qy, qw * mpR, qh);
      if (mpR >= 1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = .4 + Math.sin(performance.now() / 120) * .28;
        ctx.fillStyle = '#ffe89a';
        ctx.fillRect(bx, qy, qw, qh);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(200,170,120,.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 3.5, qy - 3.5, qw + 7, qh + 7);
      // 气提示
      ctx.font = '600 10px "Noto Serif SC",serif';
      ctx.fillStyle = mpR >= 1 ? 'rgba(255,225,150,.95)' : 'rgba(190,170,140,.5)';
      ctx.textAlign = 'left';
      ctx.fillText(mpR >= 1 ? '奥义 · 就绪  [U]' : '气', bx + qw + 12, qy + qh / 2 + 1);
      ctx.restore();

      // 技能冷却
      ctx.save();
      const skY = qy + qh + 13;
      ctx.font = '600 11px "Noto Serif SC",serif';
      const cd = p.skillCD || 0;
      ctx.fillStyle = cd > 0 ? 'rgba(150,145,150,.5)' : (p.mp >= 30 ? 'rgba(230,220,210,.85)' : 'rgba(150,145,150,.45)');
      ctx.textAlign = 'left';
      ctx.fillText('[K] 居合', bx, skY);
      if (cd > 0) {
        ctx.fillStyle = 'rgba(200,60,60,.8)';
        ctx.fillRect(bx + 52, skY - 4, 46 * (cd / .9), 8);
      } else if (p.mp >= 30) {
        ctx.fillStyle = 'rgba(120,220,140,.85)';
        ctx.fillText('可用', bx + 54, skY);
      } else {
        ctx.fillStyle = 'rgba(140,135,140,.6)';
        ctx.fillText('气不足', bx + 54, skY);
      }
      ctx.restore();
    },

    /* ---------- 连击 ---------- */
    _drawCombo(ctx) {
      if (this.comboShow < 2) return;
      const a = U.clamp(this.comboT / .5, 0, 1);
      const x = C.VIEW_W - 168, y = 156;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.scale(this.comboScale, this.comboScale);
      ctx.textAlign = 'center';
      // 笔触底
      ctx.font = '900 76px "Noto Serif SC",Georgia,serif';
      const txt = String(this.comboShow);
      ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,.86)';
      ctx.lineJoin = 'round';
      ctx.strokeText(txt, 0, 0);
      const g = ctx.createLinearGradient(0, -40, 0, 40);
      g.addColorStop(0, '#fff2d8');
      g.addColorStop(.45, '#ffb43a');
      g.addColorStop(1, '#e0321f');
      ctx.fillStyle = g;
      ctx.fillText(txt, 0, 0);
      ctx.font = '700 19px "Noto Serif SC",serif';
      ctx.lineWidth = 5;
      ctx.strokeText('连 击', 0, 52);
      ctx.fillStyle = '#f0e8dc';
      ctx.fillText('连 击', 0, 52);
      ctx.restore();
    },

    /* ---------- 敌人计数 ---------- */
    _drawEnemyCounter(ctx, st) {
      const alive = st.enemies.filter(e => !e.dead && !e.remove).length;
      if (!st.level.battleOn || alive <= 0) return;
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = '700 15px "Noto Serif SC",serif';
      ctx.fillStyle = 'rgba(232,226,216,.82)';
      ctx.fillText('残 敌', C.VIEW_W - 42, 44);
      ctx.font = '900 40px Georgia,serif';
      ctx.fillStyle = '#c5121f';
      ctx.shadowColor = 'rgba(197,18,31,.7)'; ctx.shadowBlur = 18;
      ctx.fillText(String(alive), C.VIEW_W - 42, 76);
      ctx.shadowBlur = 0;
      // 血滴装饰
      for (let i = 0; i < alive && i < 8; i++) {
        ctx.globalAlpha = .5;
        ctx.fillStyle = '#8b1018';
        ctx.beginPath();
        ctx.arc(C.VIEW_W - 178 + i * 13, 46, 3.4, 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();
    },

    /* ---------- BOSS 血条 ---------- */
    _drawBossBar(ctx, st) {
      const boss = st.enemies.find(e => e.boss && !e.remove);
      if (!boss) return;
      const W = C.VIEW_W, H = C.VIEW_H;
      const bw = 720, bh = 14, bx = (W - bw) / 2, by = H - 74;
      const r = U.clamp(boss.hp / boss.maxHp, 0, 1);
      ctx.save();
      // 名字
      ctx.textAlign = 'left';
      ctx.font = '700 21px "Noto Serif SC",serif';
      ctx.fillStyle = boss.enraged ? '#ff3a2a' : '#e0d6cc';
      ctx.shadowColor = 'rgba(197,18,31,.8)'; ctx.shadowBlur = 16;
      ctx.fillText(boss.label, bx, by - 20);
      ctx.shadowBlur = 0;
      if (boss.enraged) {
        ctx.font = '700 13px "Noto Serif SC",serif';
        ctx.fillStyle = '#ff6a4a';
        ctx.fillText('狂 暴', bx + 130, by - 20);
      }
      ctx.textAlign = 'right';
      ctx.font = '600 13px Georgia,serif';
      ctx.fillStyle = 'rgba(220,210,200,.62)';
      ctx.fillText(Math.max(0, Math.ceil(boss.hp)) + ' / ' + boss.maxHp, bx + bw, by - 20);

      ctx.fillStyle = 'rgba(6,5,9,.88)';
      ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.fillRect(bx, by, bw, bh);
      const g = ctx.createLinearGradient(bx, by, bx, by + bh);
      g.addColorStop(0, boss.enraged ? '#ff5040' : '#c0202a');
      g.addColorStop(.5, '#8b1018');
      g.addColorStop(1, '#4a060c');
      ctx.fillStyle = g;
      ctx.fillRect(bx, by, bw * r, bh);
      ctx.fillStyle = 'rgba(255,180,160,.4)';
      ctx.fillRect(bx, by + 1, bw * r, 2);
      ctx.strokeStyle = boss.enraged ? 'rgba(255,80,60,.85)' : 'rgba(190,26,32,.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1;
      for (let i = 1; i < 12; i++) {
        const sx = bx + bw * i / 12;
        ctx.beginPath(); ctx.moveTo(sx, by); ctx.lineTo(sx, by + bh); ctx.stroke();
      }
      ctx.restore();
    },

    /* ---------- 波次提示 ---------- */
    _drawWaveInfo(ctx) {
      if (this.waveInfoT <= 0 || !this.waveInfo) return;
      const a = U.clamp(this.waveInfoT / .8, 0, 1);
      const d = this.waveInfo;
      const y = 250;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '700 30px "Noto Serif SC",serif';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineJoin = 'round';
      const txt = d.boss ? '『 ' + d.label + ' 』' : '敌 袭 · ' + d.count + ' 人';
      ctx.strokeText(txt, C.VIEW_W / 2, y);
      ctx.fillStyle = d.boss ? '#e8323c' : '#e8e2d8';
      ctx.fillText(txt, C.VIEW_W / 2, y);
      ctx.restore();
    },

    /* ---------- 操作提示 ---------- */
    _drawTips(ctx, st) {
      if (this.tipT <= 0) return;
      const a = U.clamp(this.tipT / .6, 0, 1);
      ctx.save();
      ctx.globalAlpha = a * .92;
      ctx.textAlign = 'center';
      ctx.font = '600 15px "Noto Serif SC",serif';
      ctx.fillStyle = 'rgba(238,232,222,.94)';
      ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 12;
      ctx.fillText(this.tipText, C.VIEW_W / 2, C.VIEW_H - 152);
      ctx.restore();
    },

    /* ---------- 战斗日志 ---------- */
    _drawMarquee(ctx) {
      ctx.save();
      ctx.textAlign = 'left';
      ctx.font = '600 13px "Noto Serif SC",serif';
      this.marquee.forEach((m, i) => {
        ctx.globalAlpha = U.clamp(m.life / 1.2, 0, 1) * .8;
        ctx.fillStyle = m.color;
        ctx.fillText(m.t, 44, 178 + i * 22);
      });
      ctx.restore();
    },

    /* ---------- 章节横幅（Canvas 内备用，DOM 版为主） ---------- */
    _drawBanner(ctx) {
      if (this.bannerT <= 0) return;
      const t = 1 - this.bannerT / 3.4;
      let a = 1;
      if (t < .16) a = t / .16;
      else if (t > .78) a = (1 - t) / .22;
      const blur = t < .16 ? (1 - t / .16) * 16 : (t > .78 ? (t - .78) / .22 * 8 : 0);
      ctx.save();
      ctx.globalAlpha = U.clamp(a, 0, 1);
      ctx.textAlign = 'center';
      ctx.filter = blur > .4 ? 'blur(' + blur + 'px)' : 'none';
      ctx.font = '700 46px "Noto Serif SC",serif';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.86)'; ctx.lineJoin = 'round';
      ctx.strokeText(this.bannerText, C.VIEW_W / 2, 236);
      ctx.fillStyle = '#f2ede4';
      ctx.fillText(this.bannerText, C.VIEW_W / 2, 236);
      ctx.font = '600 14px Georgia,serif';
      ctx.fillStyle = 'rgba(197,18,31,.9)';
      ctx.fillText(this.bannerSub, C.VIEW_W / 2, 274);
      ctx.restore();
    },
  };

})(window.RB);

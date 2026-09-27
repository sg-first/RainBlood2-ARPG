/* ===========================================================
   enemy.js — 敌人 / AI / BOSS
   =========================================================== */
(function (RB) {
  'use strict';
  const U = RB.U, Fx = RB.Fx, Snd = RB.Audio, C = RB.CFG;

  /* 全局出手节奏倍率：<1 = 更快。
     同时缩放每招的 windup/active/recover/cd，并按 1/TEMPO 加快本体动作条播放（动画不会变慢放）。
     只想改某一个敌人/某一招时，直接改它自己的 windup/active/recover/fps，这里只做「一键调手感」。 */
  const TEMPO = .85;

  /* 敌人档案
     攻击动画（atkAnim）：素材统一取自 assets/fx 下的动作条
     （一条 = 角色动作帧 + 挥击特效帧一体的序列，5 列 × N 行）：
       sheet       动作条 key
       from / to   角色动作帧范围（作为敌人本体动画播放，from 默认 0）
       fps         本体动画帧率
       fxFrom/fxTo 命中瞬间叠加播放的“纯特效”帧范围（省略则不叠加；含角色的帧不要放进来，会与本体叠影）
     动作条缺失时回退到 sheets.idle（chara 立绘）和 atkFps，此时用 fxScale 缩放兜底刀光。
     注意：chara 目录下的 *_attackone.png 是「受击」动画（不是攻击），已挂到 sheets.hurt 上。

     ---- 多招式（attacks）----
     只写 atkAnim/dmg/hit/windup... 的档案仍是「单招式」，内部会自动合成一招，行为与旧版完全一致。
     要给敌人配多招就写 attacks 数组，每项字段（缺省时回落到档案上的同名字段）：
       id / label            招式标识 / 起手飘字（label 只建议给特殊招用，避免刷屏）
       anim                  本招的动作条，结构同 atkAnim
       hit / dmg             判定框 {w,h,ox,oy} / 伤害
       windup/active/recover/cd  前摇 / 判定 / 后摇 / 冷却（秒）
       minRange/maxRange/standRange  可触发距离区间 / 站桩距离（超出 standRange 会先走近）
       weight                出招权重（越大越常出）；刚用过的招会自动降权，避免复读同一招
       ---- 打击感参数（命中后施加什么效果，写在招式或 hits 段上均可，缺省用默认公式）----
       dmg                  伤害值：扣多少血。>26 会触发重闪白与重音效
       kb                   水平击退速度：命中后目标 vx = 方向 × kb（背刺 ×1.25，敌人再乘自身 kbRes 抗性）
       kbY                  垂直击飞速度：>0 会把目标挑飞（vy = -kbY 且离地）
       hitstop              顿帧：命中瞬间全局定格的强度，越大卡得越久，用来「打实」打击感
       shake                屏幕震动强度
       stun                 受击硬直时长（秒）：被打方多久不能行动
       默认公式：kb = 260 + dmg*8（伤害越大击退越远）、kbY = BOSS 180 / 杂兵 0（普通杂兵不挑飞）、
                 hitstop 4、shake BOSS 10 / 杂兵 5、stun .42
       ---- 以下为高级字段 ----
       rush                  { at, vx, vy }  出手后敌人自己冲刺；vy>0 时敌人自身跃起（跳劈类招式）
                             注意 vy 动的是「敌人自己」，不是把玩家挑飞——挑飞玩家请用 kbY
       hits                  [{ at, dmg, hit, kb, kbY, hitstop, shake, stun, arc }] 多段判定
                             at = 进入判定阶段后的秒数；arc=false 可关掉「叠加动作条特效帧」
                             （段内写的 dmg/kb/... 只覆盖这一段，没写的回落到招式级 → 再回落到默认公式）
       fx                    [{ at, sheet, frames | from,to, fps, scale, offX, offY, alpha, blend, z, follow }] 附加特效
                             follow（默认 true）= 特效是否跟随本体：
                               true  → 每帧按本体当前位置重算坐标（offX 会 *face：朝右 +1/朝左 -1）
                                       即偏移始终朝「身前」
                                       适合贴在角色身上的刀光（突进/起跳招必开，否则光会落在原地）
                               false → 坐标只在生成时算一次，钉在世界坐标不动，
                                       适合地面冲击波、裂地这类不该跟着角色跑的特效
                             offX / offY = 特效相对锚点的偏移（锚点是「脚底中心」：水平居中、垂直在底）：
                               offX >0 → 向面朝的方向移动，用来把刀光从「身体正中」挪到「身前出手处」，与 hit.ox 视觉对齐
                               offY >0 → 下移（y 向下为正），<0 上移
       sfx                   [{ at, key, vol }] 附加音效
     运行时：this.attacks（归一化招式表）、this._scripts（各招事件表）、this._atkCd（各招独立冷却） */
  const TYPES = {
    tiegui: {
      label: '铁鬼', hp: 120, speed: 118, scale: 2.25, hurtH: 214,
      range: 132, dmg: 20, windup: .62, active: .12, recover: .58, cd: .55,
      body: 118, kbRes: .62, mpGain: 7,
      hit: { w: 150, h: 150, ox: 76, oy: 96 },
      sheets: { idle: 'tiegui_idle', hurt: 'tiegui_atk', miss: 'tiegui_miss' },
      idleFps: 5, atkFps: 15,
      fxScale: 1.5,
      shadow: 1.35,
      attacks: [
        { // 普攻·铁掌：8 帧按 fps 8 慢放正好铺满原有的 .62/.12/.58 节奏，判定落在推掌最伸展的 49 帧前后
          id: 'atk', weight: 4,
          anim: { sheet: 'e_tieguishuanghong', from: 45, to: 52, fps: 8 },
          dmg: 20, windup: .62, active: .12, recover: .58, cd: .55,
          maxRange: 132, standRange: 113,
          hits: [{ at: .04, arc: false, kb: 420, hitstop: 5, shake: 6, stun: .42 }],
          fx: [{ at: .06, sheet: 'e_tieguishuanghong', frames: [53], fps: 14, scale: 1.3, offX: 104, offY: 88 }],
          sfx: [{ at: .04, key: 'hitbig', vol: .45 }],
        },
        { // 震裂：蓄力→砸地→上勾。画面上确实是两个独立动作，故配两段判定（不是一段连击拆两刀）
          id: 'zhenlie', label: '震 裂',
          anim: { sheet: 'e_tieguizhenlie', from: 0, to: 24, fps: 21 },
          hit: { w: 176, h: 168, ox: 92, oy: 104 },
          dmg: 13, windup: .52, active: .22, recover: .42, cd: 1.6,
          maxRange: 150, standRange: 128, weight: 2,
          hits: [
            { at: .02, arc: false, kb: 380, hitstop: 6, shake: 8, stun: .4 },
            { at: .35, arc: false, dmg: 19, kb: 480, kbY: 300, hitstop: 8, shake: 10, stun: .55 },
          ],
          sfx: [{ at: .04, key: 'explode', vol: .55 }, { at: .35, key: 'hitbig', vol: .5 }],
        },
      ],
    },
    shanzei: {
      label: '山贼', hp: 68, speed: 196, scale: 1.85, hurtH: 176,
      range: 122, dmg: 13, windup: .42, active: .1, recover: .34, cd: .38,
      body: 96, kbRes: .95, mpGain: 6,
      hit: { w: 122, h: 132, ox: 62, oy: 88 },
      sheets: { idle: 'shanzei1_idle', hurt: 'shanzei1_atk', miss: 'shanzei1_miss' },
      idleFps: 6, atkFps: 17,
      // 该条只有 0~6 帧有内容，7~9 为空帧（避免战斗中“消失”）
      atkAnim: { sheet: 'e_shanzeiaction', to: 6, fps: 8 },
      fxScale: 1.35,
      shadow: .95,
    },
    shanzei2: {
      label: '悍匪', hp: 84, speed: 176, scale: 1.95, hurtH: 184,
      range: 132, dmg: 15, windup: .48, active: .11, recover: .4, cd: .42,
      body: 104, kbRes: .86, mpGain: 6,
      hit: { w: 132, h: 140, ox: 66, oy: 92 },
      sheets: { idle: 'shanzei2_idle', hurt: 'shanzei2_atk', miss: 'shanzei2_miss' },
      idleFps: 6, atkFps: 16,
      atkAnim: { sheet: 'e_shanzeiaction2', to: 6, fps: 7, fxFrom: 7, fxTo: 9 },
      fxScale: 1.4,
      shadow: 1.0,
    },
    muxiaokui: {
      label: '鬼差', hp: 88, speed: 146, scale: 1.95, hurtH: 184,
      range: 196, dmg: 16, windup: .56, active: .13, recover: .46, cd: .5,
      body: 100, kbRes: .7, mpGain: 7,
      hit: { w: 210, h: 128, ox: 116, oy: 96 },
      sheets: { idle: 'muxiaokui_idle', hurt: 'muxiaokui_atk', miss: 'muxiaokui_miss' },
      idleFps: 5.5, atkFps: 15,
      // 该条 8 帧起夹着大量近空帧与纯特效帧（45 帧起还是全黑底），只取 0~7 的角色动作
      atkAnim: { sheet: 'e_muxiaokuiaction', to: 7, fps: 7 },
      fxScale: 1.5,
      shadow: 1.15,
    },
    yingmei: {
      label: '影魅', hp: 74, speed: 262, scale: 1.9, hurtH: 150,
      range: 118, dmg: 14, windup: .34, active: .09, recover: .3, cd: .34,
      body: 88, kbRes: 1.0, mpGain: 6,
      hit: { w: 128, h: 130, ox: 62, oy: 84 },
      sheets: { idle: 'yingmei_idle', hurt: 'yingmei_atk', miss: 'yingmei_miss' },
      idleFps: 7, atkFps: 20,
      atkAnim: { sheet: 'e_yingmeiaction', to: 14, fps: 18 },
      fxScale: 1.35,
      shadow: .62, dash: true,
    },
    slashguichai: {
      label: '斩鬼差', hp: 190, speed: 138, scale: 2.5, hurtH: 268,
      range: 218, dmg: 26, windup: .72, active: .15, recover: .66, cd: .7,
      body: 160, kbRes: .5, mpGain: 10,
      hit: { w: 246, h: 200, ox: 128, oy: 130 },
      sheets: { idle: 'slashguichai_idle', hurt: 'slashguichai_atk', miss: 'slashguichai_miss' },
      idleFps: 4.6, atkFps: 13,
      // 只有 5 帧角色动作（慢速重劈），帧率压低 → 挥砍正好落在判定帧上
      atkAnim: { sheet: 'e_slashguichaiaction', to: 4, fps: 7, fxFrom: 5, fxTo: 8 },
      fxScale: 2.0,
      shadow: 1.95, elite: true,
    },
    blader: {
      label: '黑甲客', hp: 104, speed: 172, scale: 2.0, hurtH: 206,
      range: 140, dmg: 17, windup: .5, active: .11, recover: .4, cd: .44,
      body: 112, kbRes: .82, mpGain: 7,
      hit: { w: 148, h: 152, ox: 74, oy: 100 },
      sheets: { idle: 'blader_idle', hurt: 'blader_atk', miss: 'blader_miss' },
      idleFps: 5.4, atkFps: 15,
      // 0~12 为角色动作（13~15 近空帧，16 帧起又回到角色动作，故不叠加、只取前段）
      atkAnim: { sheet: 'e_bladeraction', to: 12, fps: 19 },
      fxScale: 1.5,
      shadow: 1.4,
    },
    baijianke: {
      label: '白剑客', hp: 92, speed: 214, scale: 1.92, hurtH: 180,
      range: 152, dmg: 15, windup: .4, active: .1, recover: .33, cd: .36,
      body: 96, kbRes: .9, mpGain: 7,
      hit: { w: 168, h: 140, ox: 84, oy: 94 },
      sheets: { idle: 'baijiankeb_idle', hurt: 'baijiankeb_atk', miss: 'baijiankeb_miss' },
      idleFps: 6.4, atkFps: 18,
      atkAnim: { sheet: 'e_baijianke_action', to: 7, fps: 10, fxFrom: 10, fxTo: 19 },
      fxScale: 1.4,
      shadow: .9,
    },
    xingmang: {
      label: '星芒', hp: 96, speed: 232, scale: 1.98, hurtH: 190,
      range: 146, dmg: 16, windup: .38, active: .1, recover: .32, cd: .34,
      body: 98, kbRes: .92, mpGain: 7,
      hit: { w: 156, h: 148, ox: 78, oy: 100 },
      sheets: { idle: 'xingmang_idle', hurt: 'xingmang_atk', miss: 'xingmang_miss' },
      idleFps: 6.6, atkFps: 18,
      // 反星刃整条都含角色动作帧；104~119 是“举刃→劈下→收势”的一段完整挥击
      atkAnim: { sheet: 'e_xingmang-fanxing-ren', from: 104, to: 119, fps: 20 },
      fxScale: 1.5,
      shadow: .95,
    },
    triyingmei: {
      label: '三影', hp: 86, speed: 246, scale: 1.94, hurtH: 158,
      range: 126, dmg: 15, windup: .36, active: .1, recover: .32, cd: .36,
      body: 92, kbRes: .98, mpGain: 7,
      hit: { w: 136, h: 136, ox: 64, oy: 84 },
      sheets: { idle: 'triyingmei_idle', hurt: 'triyingmei_atk', miss: 'triyingmei_miss' },
      idleFps: 7, atkFps: 19,
      atkAnim: { sheet: 'e_yingmeiaction', to: 14, fps: 17 },
      fxScale: 1.35,
      shadow: .66, dash: true,
    },
    zuoshang: {
      label: '左殇', hp: 150, speed: 168, scale: 2.1, hurtH: 214,
      range: 168, dmg: 21, windup: .58, active: .12, recover: .5, cd: .55,
      body: 120, kbRes: .66, mpGain: 9,
      hit: { w: 184, h: 170, ox: 92, oy: 116 },
      sheets: { idle: 'zuoshang_idle', hurt: 'zuoshang_atk', miss: 'zuoshang_miss' },
      idleFps: 5, atkFps: 14,
      // 拔刀 5 帧 + 整条金色斩击特效帧
      atkAnim: { sheet: 'e_shanggongji', to: 4, fps: 8, fxFrom: 5, fxTo: 34 },
      fxScale: 1.7,
      shadow: 1.45, elite: true,
    },
    zangwudi: {
      label: '葬 无 地', hp: 900, speed: 152, scale: 3.0, hurtH: 330,
      range: 250, dmg: 30, windup: .78, active: .16, recover: .62, cd: .5,
      body: 230, kbRes: .12, mpGain: 14,
      hit: { w: 300, h: 320, ox: 148, oy: 175 },
      // 原 atk 指向的 zangwudi_skill 在 manifest 里不存在，改用基础形态的受击图
      sheets: { idle: 'zangwudi_idle', hurt: 'zangwudi_atk', miss: 'zangwudi_miss' },
      idleFps: 4.2, atkFps: 12,
      // 29 帧之后是大片全黑底特效帧，特效只取 29~34
      atkAnim: { sheet: 'e_zangwudiaction', to: 28, fps: 19, fxFrom: 29, fxTo: 34 },
      fxScale: 2.8,
      shadow: 2.9, boss: true,
    },
  };

  /* ---------------- 招式表：归一化 / 编译 ---------------- */

  /** 取第一个「已定义」的值（undefined 才回落到下一层） */
  function pick(a, b, def) { return a !== undefined ? a : (b !== undefined ? b : def); }

  /**
   * 把档案编译成统一的招式表。
   * 没写 attacks 的敌人会由平铺字段（atkAnim/dmg/hit/windup...）合成出唯一一招，
   * 各字段的默认值也刻意与旧版一致（stance = range*.86、出手帧 = active*.35、kb = 260+dmg*8）。
   */
  function normalizeAttacks(T) {
    const raw = (T.attacks && T.attacks.length) ? T.attacks : [null];
    return raw.map(function (a, i) {
      const s = a || {};
      const maxRange = pick(s.maxRange, T.range, 200);
      return {
        id: s.id || ('atk' + i),
        label: s.label || '',
        anim: s.anim || T.atkAnim || null,
        hit: s.hit || T.hit,
        dmg: pick(s.dmg, T.dmg, 10),
        windup: pick(s.windup, T.windup, .5) * TEMPO,
        active: pick(s.active, T.active, .1) * TEMPO,
        recover: pick(s.recover, T.recover, .4) * TEMPO,
        cd: pick(s.cd, T.cd, .5) * TEMPO,
        minRange: pick(s.minRange, 0),
        maxRange: maxRange,
        standRange: pick(s.standRange, maxRange * .86),
        weight: pick(s.weight, 1),
        kb: s.kb, kbY: s.kbY, hitstop: s.hitstop, shake: s.shake, stun: s.stun,
        rush: s.rush || null,
        hits: (s.hits && s.hits.length) ? s.hits : null,
        fx: (s.fx && s.fx.length) ? s.fx : null,
        sfx: (s.sfx && s.sfx.length) ? s.sfx : null,
      };
    });
  }

  /**
   * 把招式编译成按时间排序的事件表（hit / fx / sfx / rush），运行期按 aiT 依次触发。
   * 这里只做「结构」展开（帧号区间 → 帧数组），伤害/击退等仍保留 undefined 交给出招瞬间读取，
   * 这样 BOSS 狂暴改数值后不需要重新编译。
   */
  function buildScript(atk) {
    /*
      把招式配置拍平成一维、按 t 升序的事件表。运行期用单调游标 _scIdx 往后扫
      （while (aiT >= events[_scIdx].t) 就执行），不必每帧遍历，也不会漏事件。
      t = 进入 attack 状态后的秒数。

      【输入】atk = 归一化后的招式（normalizeAttacks 产物）。里面有四类事件：hits/fx/sfx/rush
      【输出】events = 事件数组，每项必含 { kind, t }：
        hit  { hit?, dmg?, kb?, kbY?, hitstop?, shake?, stun?, arc } → _strike 出判定框
        fx   { sheet, frames:[帧号], fps, scale?, offX, offY, ... }  → 叠特效
        sfx  { key, vol? }                                          → 播音效
        rush { vx, vy }                                             → 突进
    */
    const events = [];

    /* ① hits → 判定框事件。「分几段」就在这里分：hits[] 的一项 = 一段判定，
         段数 = hits.length；没写 hits 就是 1 段（合成 [{}]，at 缺省 = active*.35）。
         每段的 at = 进入判定阶段后的秒数，决定它在时间轴上的位置。
       arc = 是否叠「动作条里的挥击特效帧」：默认只第一段（i===0，即 hits[0]，通常也是 at 最小的那段）叠，避免多段招每段都刷同一条金光；
         段内可写 arc:false 关掉，或给后面段写 arc:true 强制叠。
         不叠的段通常改用 fx 事件里显式指定的刀光（如三连斩后两段用 shangsword）。 */
    const hitDefs = atk.hits || [{}];
    hitDefs.forEach(function (def, i) {
      events.push({
        // t / arc 属于「时序与结构」，编译期就算死（狂暴不会改它们）
        kind: 'hit', t: pick(def.at, atk.active * .35),
        // ↓ 这 7 个原样从 def 拷贝、不做任何回落，段内没写就是 undefined
        /* 这些数值有三个数据源，优先级从高到低：
            ① hits[] 段内字段  （如三连斩末段 kb:520）  —— 最高
            ② 招式级字段 atk.X（如整招统一 kb:380）    —— 次之
            ③ 默认公式        （kb = 260 + dmg*8、stun .42 等）—— 兜底
          在编译期，如果段内没写，就原样存 undefined，不在这里取值。
          真正取值推迟到出招瞬间，由 _strike 的 pick(ev.X, A.X, 默认) 做三级回落（取第一个「已定义」的值）。

          这么做的目的：BOSS 狂暴时是直接改招式对象的（a.dmg *= 1.22、a.windup *= .78）。
          因为事件表里存的是 undefined，每次出手都会重新去读「当前的」招式数值，
          于是狂暴加成自动生效、不必重新编译事件表 */
        hit: def.hit, dmg: def.dmg, kb: def.kb, kbY: def.kbY,
        hitstop: def.hitstop, shake: def.shake, stun: def.stun,
        arc: pick(def.arc, i === 0),
      });
    });

    // ② fx → 特效事件。sheet 是 manifest 键名字符串（可跨表），from/to 区间在此展开成帧数组
    (atk.fx || []).forEach(function (def) {
      const sheetObj = RB.Assets.sheet(def.sheet); // 只为取 cols/rows 算总帧数
      const frameCount = sheetObj ? sheetObj.cols * sheetObj.rows : 0;
      let frames = def.frames || null;
      if (!frames) {
        const from = def.from || 0;
        const to = def.to === undefined ? frameCount - 1 : def.to;   // 不写 to 取到表尾
        frames = [];
        for (let f = from; f <= to; f++) frames.push(f);
      }
      // follow（默认 true）= 特效是否每帧按本体位置重算坐标（贴在身上跟着跑）
      //   false 则只在生成时算一次，钉在世界坐标不动
      events.push({
        kind: 'fx', t: def.at || 0, sheet: def.sheet, frames: frames,
        fps: def.fps || 22, scale: def.scale, offX: def.offX || 0, offY: def.offY || 0,
        alpha: def.alpha, blend: def.blend, z: def.z, follow: def.follow !== false,
      });
    });

    // ③ sfx → 音效事件
    (atk.sfx || []).forEach(function (def) {
      events.push({ kind: 'sfx', t: def.at || 0, key: def.key, vol: def.vol });
    });

    // ④ rush → 突进事件。vy>0 是「敌人自己」跃起（挑飞目标的是 kbY，别搞混）
    if (atk.rush) {
      events.push({ kind: 'rush', t: atk.rush.at || 0, vx: atk.rush.vx || 0, vy: atk.rush.vy || 0 });
    }

    // ⑤ 按时间排序：运行期用游标单调扫描
    events.sort(function (e1, e2) { return e1.t - e2.t; });
    return events;
  }

  class Enemy extends RB.Entity {
    constructor(typeKey, x, opt) {
      opt = opt || {};
      const T = TYPES[typeKey];
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
      // 招式表：单招式的敌人也会被normalizeAttacks合成为“一招”，下面的流程对两者一致
      this.attacks = normalizeAttacks(T);   // 【招式参数表】每招的：伤害/判定框/前摇判定后摇/距离/权重… —— 运行时读数值的唯一真值来源
      this.scripts = this.attacks.map(buildScript);  // 【事件时间轴】attacks[i] 编译出的事件表
      // fix: 下面这三个应该有硬同步机制
      this.atk = this.attacks[0];          // 当前出招引用（运行期指向 attacks[atkI]）；初始指第 0 招
      this.atkI = 0;                       // 当前招式下标：同时索引 attacks / scripts / _atkCd / _atkFx 的「主键」
      this._atkClip = 'atk';               // 当前招的本体动画 clip 名（= _atkClipKey(atkI)，第 0 招固定 'atk'）
      this._atkCd = this.attacks.map(function () { return 0; });  // 各招独立冷却计时器，与 attacks 等长的数组
      this._lastAtk = -1;                  // 上一招的下标（初始 -1=无）；用于选招时降权，避免连续复读同一招
      this._scIdx = 0;                     // 事件表游标：attack 状态里按 aiT 单调扫 scripts[atkI] 的指针，每触发一个事件 +1
      this.rangeDefault = T.range * .86;   // 「接近距离」：没有任何招可出（或玩家距离全在招式范围外）时，追到这个距离内就停步侧移绕圈；单招敌人直接用它当站位距离
      this._buildClips();
      this.setState('idle');
      this.play('idle');
      // 出场特效
      Fx.ink(x, C.GROUND_Y - 40, 12, 260, 13);
      Snd.play('pressure', { vol: .6 });
    }

    /** 攻击招式 i 的本体动画 clip 名
     * 由于之前平铺的sheets里攻击字段就叫atk，所以这里第0也招固定叫 'atk'，兼容既有引用 */
    _atkClipKey(i) { return i === 0 ? 'atk' : 'atk' + i; }

    _buildClips() {
      const S = this.T.sheets;
      this.clip('idle', S.idle, [0, 1, 2, 3], this.T.idleFps, { loop: true });
      this.clip('walk', S.idle, [0, 1, 2, 3], this.T.idleFps * .8, { loop: true });
      this._buildAtkClips();
      this.clip('windup', S.idle, [0, 1, 0, 1], 9, { loop: true });
      // 受击（*_attackone.png）与硬直
      const hurtSheet = S.hurt || S.miss || S.idle;
      this.clip('hurt', hurtSheet, [0, 1, 2, 3], 14, { loop: false });
      this.clip('stagger', hurtSheet, [0, 1, 2, 3], 12, { loop: false });
      // 敌人素材（c_* 系列）均为朝右绘制：显式声明基线朝向
      for (const k in this.clips) this.clips[k].baseFace = 1;
    }

    /**
     * 攻击动画：每招一条，优先使用 assets/fx 下的动作条（角色动作 + 挥击特效一体的序列）。
     * 只取 anim.to 之前的角色动作帧作为敌人本体动画，其余特效帧留到命中瞬间叠加播放。
     * @param speedMul 帧率倍率（BOSS 狂暴时加速）
     */
    _buildAtkClips(speedMul) {
      // 【入参·帧率倍率】BOSS 狂暴时 speedMul>1，动作条整体快放；除以 TEMPO 把「每秒帧数」折算到引擎节奏
      const mul = (speedMul || 1) / TEMPO;
      // 【输出·特效帧表】重建每招「命中瞬间叠加」的纯特效帧；没有就填 null。
      // 后续由 _strike() 在判定生成时读取（_atkFx[this.atkI]）
      this._atkFx = [];
      
      // 【逐招建 clip】遍历归一化后的招式表，把每招 anim 蓝图落成可播放的 clip
      this.attacks.forEach((A, i) => {
        const anim = A.anim;
        const key = this._atkClipKey(i);
        // ①【输入读取】取动作条表对象；anim.to 存在才算「动作条」，缺失则视为没有素材
        const sheet = anim && anim.to !== undefined ? RB.Assets.sheet(anim.sheet) : null;

        // ①a【输出】动作条缺失 → 回退到待机立绘（固定取前4帧）
        //   写 this.clips[key]（本体动画）、_atkFx[i]=null（无叠加特效）
        if (!sheet) {
          this.clip(key, this.T.sheets.idle, [0, 1, 2, 3], this.T.atkFps * mul, { loop: false, hold: 1 });
          this._atkFx[i] = null;
          return;
        }

        // ②【输出·本体动画】把 [from..to] 区间展开成帧数组，注册成 clip
        //   写 this.clips[key]，之后由 play(this._atkClip) 播放（hold:1 = 播完定格末帧）
        const from = anim.from || 0, body = [];
        for (let f = from; f <= anim.to; f++) body.push(f); // 取[from..to]范围
        this.clip(key, anim.sheet, body, anim.fps * mul, { loop: false, hold: 1 });

        // ③【输出·特效帧】同表后半段的纯刀光/特效，命中瞬间单独叠加。没配 fxFrom 就标 null 并收工。
        if (anim.fxFrom === undefined) { this._atkFx[i] = null; return; }
        const fx = [];
        const last = anim.fxTo === undefined ? sheet.cols * sheet.rows - 1 : anim.fxTo;  // 不写 fxTo 则取到表尾
        for (let f = anim.fxFrom; f <= last; f++) fx.push(f);
        this._atkFx[i] = { sheet: anim.sheet, frames: fx };
      });
    }

    /* =================== 更新 =================== */
    update(dt, world) {
      if (this.dead) { this._dying(dt); return; }
      this.world = world;
      this.baseUpdate(dt);
      if (this.spawnT > 0) this.spawnT -= dt;
      // 出场错峰：level.js 按「同波内的出场序号 × .55」赋初值（0 / .55 / 1.1 / 1.65…），
      // 倒计时归零后该敌人才被允许从 idle 进 chase。漏掉这一步 → 除第一个外全体永久卡 idle。
      if (this.slotT > 0) this.slotT -= dt;
      
      if (this.staggerT > 0) this.staggerT -= dt;
      for (let i = 0; i < this._atkCd.length; i++) if (this._atkCd[i] > 0) this._atkCd[i] -= dt;
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
        // 招式同样吃狂暴加成（前摇/后摇缩短、判定更凶），数值在出招瞬间读取，无需重编事件表
        this.attacks.forEach(function (a) {
          a.windup *= .78; a.active *= .9; a.recover *= .82; a.dmg *= 1.22;
        });
        this._buildAtkClips(1.25);
      }

      this._ai(dt, p, world);
      this.physics(dt);
      this.x = U.clamp(this.x, world.bounds[0] - 40, world.bounds[1] + 40);
    }

    _ai(dt, p, world) {
      if (!p || p.dead) { this.vx = U.approach(this.vx, 0, 900 * dt); this.play('idle'); return; }
      // 受击硬直：守住受击动画，别被下面 AI 每帧的 idle/walk 顶掉（否则只闪一帧）
      if (this.state === 'hurt') {
        this.vx = U.approach(this.vx, 0, 900 * dt);
        if (this.stateT >= (this.stateDur || .3)) {
          this.setState('idle');
          this.play('idle');
        } else {
          this.play(this.animDone ? 'idle' : 'hurt');
          return;
        }
      }
      this.aiT += dt;
      const dx = p.x - this.x;
      const adx = Math.abs(dx); // 与玩家的水平距离：选招、走位、侧移全看它
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
        /*
          chase = 咬着玩家走位，直到「某一招够得着」为止。

          流程是「先定招、再定站位」：
            pick >= 0 → 挑中了招，站位取它的 standRange（远程招因此可以站得更远，不再一律贴脸）
            pick = -1 → 当前距离/冷却下没有可用招式，退回默认接近距离 rangeDefault（= T.range*.86）继续走

          举例（左殇）：玩家 400px 时四招都够不着 → pick=-1 → 往 181px 走；
          走到 320px 只有「天斩」够得着（130~330）→ stand=300 → 继续走到 300 → 站住起手
        */
        case 'chase': {
          this.face = dirToP;
          const pick = this._pickAttack(adx);
          const stand = pick >= 0 ? this.attacks[pick].standRange : this.rangeDefault;
          if (adx > stand) {
            // 还没进入这一招的射程 → 压上去（只有这里会播走路动画）
            this.vx = U.approach(this.vx, dirToP * spd, 1500 * dt);
            this.play('walk');
            this.anim.speed = U.clamp(spd / 170, .6, 1.5);
            // 影子步
            if (this.T.dash && Math.random() < .012) {
              this.vx = dirToP * spd * 2.1;
              Fx.ghost('c_' + T.sheets.idle, 0, this.x, this.y, this.scale, this.spriteFlip, .26, .7);
            }
          } else {
            // 已进入射程：刹住脚步，随机侧移绕圈，犹豫 .12s 再起手（避免刚停下就挥刀）
            this.vx = U.approach(this.vx, 0, 2200 * dt);
            // 侧移绕圈
            if (Math.random() < .02) this._strafe = U.rand(-1, 1) > 0 ? 1 : -1;
            if (this._strafe) this.vx += this._strafe * 40;
            if (this.aiT > .12 && pick >= 0) { // 已经追了0.12s以上且挑中了招
              this._startWindup(pick);
            }
          }
          // 追够久还没打到（玩家一路在跑）→ 放弃这一轮，回 idle 等冷却
          if (this.aiT > 3.4) { this.ai = 'idle'; this.aiT = 0; this.cd = U.rand(.3, .9); }
          break;
        }
        /*
          windup = 前摇。动作条（本体动画）从这里就开始播，抬手动作本身就是给玩家的预警，
          配合 _startWindup 里的红光/「!」，玩家的反应窗口 = A.windup 秒。
        */
        case 'windup': {
          this.vx = U.approach(this.vx, 0, 1800 * dt);
          this.face = dirToP;          // 前摇期间仍跟随玩家转向：此阶段敌人一直面朝你，较难被绕背
          this.play(this._atkClip);    // 动作条自带起手帧：抬手即开始整段攻击动画
          if (this.aiT >= this.atk.windup) {
            this.ai = 'attack'; this.aiT = 0;
            Snd.play(this.T.boss ? 'slashhvy' : 'slash', { vol: .5 });
          }
          break;
        }
        /*
          attack = 判定 + 后摇。aiT 从 0 重新计时，事件表（判定/特效/音效/冲刺）按 t 依次触发。
        */
        case 'attack': {
          const A = this.atk;
          const sc = this.scripts[this.atkI] || [];
          // 突进招（rush）保留冲势到冲刺结束后再减速，普通招判定一过就开始收力
          const decelAt = A.rush ? A.active : A.active * .55;
          if (this.aiT > decelAt) this.vx = U.approach(this.vx, 0, 2600 * dt);
          // 事件表：按时间依次触发判定，扔给exec执行
          while (this._scIdx < sc.length && this.aiT >= sc[this._scIdx].t) {
            this._exec(sc[this._scIdx++], p);
          }
          // 攻击结束
          if (this.aiT >= A.active + A.recover) {
            this.ai = 'idle'; this.aiT = 0;
            this.cd = A.cd * U.rand(.85, 1.3) / (this.enraged ? 1.5 : 1);   // 全局冷却：多久再进攻一轮
            // 各招独立冷却（比全局冷却更长），避免同一招连续复读
            if (this.attacks.length > 1) this._atkCd[this.atkI] = A.cd * U.rand(1.8, 2.6);
            this.vx = 0;
          } else if (this.animDone) {
            this.play('idle');         // 动画播完 → 收回待机姿态
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
      if (this.boss && this.state !== 'hurt') this._bossExtra(dt, p, world);
    }

    /**
     * 依「距离 + 权重 + 冷却」挑一招（返回招式下标，-1 表示当前没有可用招式 → 继续接近）。
     * 刚放过的招会大幅降权，多招式敌人因此会自然地轮换出招。
     */
    _pickAttack(adx) {
      const n = this.attacks.length;
      // 1) 先按距离与冷却筛出「现在就能打」的招
      let pool = [];
      for (let i = 0; i < n; i++) {
        const a = this.attacks[i];
        if (adx > a.maxRange || adx < a.minRange) continue; // 太远够不着 / 太近不愿放（如远程招）
        if (n > 1 && this._atkCd[i] > 0) continue; // 单招式敌人不触发 per-attack 冷却（n<=1走到下面的push）
        pool.push(i);
      }
      if (!pool.length) return -1; // 一个都打不了 → 由 chase 继续走近
      // 2) 再按权重随机；刚放过的那招概率打二折，避免复读同一招
      let total = 0;
      const w = pool.map(function (i) {
        let k = this.attacks[i].weight;
        if (i === this._lastAtk && pool.length > 1) k *= .2;
        total += k;
        return k;
      }, this);
      // 3) 在 [0,total) 上取一点，落在谁的权重区间就选谁
      let r = Math.random() * total, pick = pool[0];
      for (let j = 0; j < pool.length; j++) { r -= w[j]; if (r <= 0) { pick = pool[j]; break; } }
      return pick;
    }

    /**
     * 起手：切到某招并开始播放它的动作条。
     * 前三帧的动画就是手感的前摇，所以这里同时建立预警特效与招式飘字。
     */
    _startWindup(i) {
      const idx = (i === undefined || i < 0) ? 0 : i;
      const A = this.attacks[idx];
      this.atkI = idx; this.atk = A;
      this._lastAtk = idx;              // 记录「实际出手」的招式，供下次选招降权
      this._atkClip = this._atkClipKey(idx);
      this._scIdx = 0;
      this.ai = 'windup'; this.aiT = 0;
      const W = A.windup;
      this.play(this._atkClip, true);     // 攻击动作条从第 0 帧起播（含起手前摇）
      // 预警红光
      this.tintColor = 'brightness(1.35) sepia(1) saturate(6) hue-rotate(-28deg)';
      this.tintT = W + .1; // +0.1让进入攻击时的视觉连贯
      Fx.add(new RB.Particle(this.x, this.y - this.hurtH * .55, {
        life: W, size: 26, size2: 46, g: 0, drag: .99,
        color: 'rgba(220,30,30,.5)', shape: 'ring', blend: 'lighter', z: 12,
      }));
      Fx.text(this.x, this.y - this.hurtH - 34, '!', { color: '#ff3a2a', size: 34, life: W * .9, vy: -34 });
      if (A.label) Fx.text(this.x, this.y - this.hurtH - 66, A.label, { color: '#ffd76a', size: 26, life: W + .25, vy: -18 });
      Snd.play('charge', { vol: .22 });
    }

    /** 执行一个招式事件（见 buildScript） */
    _exec(ev, p) {
      switch (ev.kind) {
        case 'hit':                     // 生成判定框，并按 arc 决定是否叠动作条里的挥击特效
          this._strike(p, ev);
          break;
        case 'fx': {                    // 附加特效（刀光/新月等）
          const o = {
            frames: ev.frames, fps: ev.fps,
            scale: ev.scale === undefined ? this.scale : ev.scale,   // 缺省与本体同缩放 → 与动作条对齐
            alpha: ev.alpha, blend: ev.blend,
            z: ev.z === undefined ? 54 : ev.z,
          };
          if (ev.follow) {            // 特效是否跟随本体
            // 跟随本体：贴在角色身上的刀光，本体移动/转身时光也跟着走
            Fx.on(ev.sheet, this, Object.assign(o, { offX: ev.offX, offY: ev.offY }));
          } else {
            // 不跟随：坐标只在生成时算一次，钉在出手瞬间的位置（地面冲击波这类不该跟着跑的特效）
            Fx.add(new RB.SpriteFx(ev.sheet, this.x + this.face * ev.offX, this.y + ev.offY,
              Object.assign(o, { flip: this.face })));
          }
          break;
        }
        case 'sfx':                     // 附加音效
          Snd.play(ev.key, { vol: ev.vol === undefined ? .45 : ev.vol });
          break;
        case 'rush':                    // 突进：敌人沿当前朝向冲刺，vy>0 时跃起（跳劈）
          this.vx = this.face * ev.vx;
          if (ev.vy) { this.vy = -ev.vy; this.onGround = false; }   // y 轴向下为正，取负即向上
          break;
      }
    }

    /**
     * 出手：生成判定框 + 叠加挥击特效。
     * ev 是本招的一个 hit 事件（可覆盖伤害/判定框/击退），里面读不到的字段回落到招式与档案。
     */
    _strike(p, ev) {
      const T = this.T, A = this.atk;
      const h = (ev && ev.hit) || A.hit;
      const dmg = (ev && ev.dmg !== undefined) ? ev.dmg : A.dmg;
      const facing = this.face;
      this.makeHit({
        w: h.w, h: h.h, ox: h.ox, oy: h.oy,
        dmg: dmg,
        kb: pick(ev && ev.kb, A.kb, 260 + dmg * 8),
        kbY: pick(ev && ev.kbY, A.kbY, this.boss ? 180 : 0),
        hitstop: pick(ev && ev.hitstop, A.hitstop, 4),
        shake: pick(ev && ev.shake, A.shake, this.boss ? 10 : 5),
        stun: pick(ev && ev.stun, A.stun, .42),
        life: .14, pierce: true, type: 'enemy',
      });
      // 挥击特效：把动作条剩下的纯特效帧在命中瞬间叠加播放。
      // 特效帧与角色帧同处一张表、共用同一格坐标系，故必须按本体的位置与缩放绘制才能对齐。
      const arc = !ev || ev.arc; // 没有ev默认开启
      const fx = this._atkFx[this.atkI];
      if (arc && fx) {
        Fx.add(new RB.SpriteFx(fx.sheet, this.x, this.y, {
          frames: fx.frames, scale: this.scale, flip: facing, z: 54, fps: 24,
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
        // 突进撞击：复用第 0 招的动作条，但判定由下面的 setTimeout 自己接管（跳过事件表）
        // fix: 这种写死的应该删掉，改用attacks配置多招式来做
        this.atkI = 0; this.atk = this.attacks[0];
        this._atkClip = this._atkClipKey(0);
        this._scIdx = this.scripts[0].length;      // 事件表直接走完 → 不再触发普通判定
        this.ai = 'attack'; this.aiT = 0;
        this.play(this._atkClip, true);
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
      this.play('hurt', true);
      this.squashTo(.9, .1);
      // 精英抵抗击退
      if (this.kbRes < .35) this.vx *= .5;
      // 每次被击中都要溅血（溅血 / 火花 / 伤害数字 / 顿帧 / 震屏 / 音效）
      super.onHurt(atk, dmg, fromBehind, dir);
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

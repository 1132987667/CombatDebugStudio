/**
 * 战斗动画时序配置 — 固定行动预算模型（唯一时间源）
 *
 * 1. 每个行动消耗固定总预算 T；T(speed) = BASE_BUDGET / speed
 * 2. 所有动画节点按 T 的固定占比排布，命中瞬间锁定 50%
 * 3. 命中瞬间 = 伤害数字弹出 = 气血 条开始变化 = 命中特效，三者严格同步
 * 4. 领域层按此配速（flight→impact 两段等待），UI 按此排期，不再各定时长
 */
export const BATTLE_ANIMATION_TIMING = {
  /** 1x 速度下的单行动总预算（ms）— 唯一基准常数 */
  BASE_BUDGET: 1200,

  /** 阶段占比（全速度通用，值为 T 的比例） */
  PHASES: {
    windup: { start: 0.0, end: 0.2 }, // 攻击者蓄力/突进
    nameFlight: { start: 0.1, end: 0.5 }, // 技能名飞行
    projectile: { start: 0.2, end: 0.5 }, // 光弹飞行
    impact: 0.5, // 命中瞬间（数字+气血+特效同步锚点）
    numberFloat: { start: 0.5, end: 0.85 }, // 伤害数字上浮淡出
    hpTransition: { start: 0.5, end: 1.0 }, // 气血 条过渡
    settle: { start: 0.5, end: 1.0 }, // 攻击者回位/场景收束
  },

  /** 多目标命中错峰间隔（占 T 比例） */
  MULTI_TARGET_STAGGER: 0.08,
} as const

/** 指定速度下的单行动总预算 T */
export const getActionBudget = (speed: number): number =>
  BATTLE_ANIMATION_TIMING.BASE_BUDGET / speed

/** 指定速度下某占比点对应的绝对毫秒 */
export const phaseAt = (ratio: number, speed: number): number =>
  getActionBudget(speed) * ratio

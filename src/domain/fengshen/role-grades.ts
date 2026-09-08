/**
 * role-grades.ts — 敌人品阶单一来源（六档）
 *
 * 品阶码同时被三处消费：configs/enemies/enemies.json 的 role 字段、
 * 封神榜敌人奖励倍率（enemy_reward_table.roleMultiplier 的键）、UI 品阶标签/筛选。
 * 历史别名（normal/elite）已废弃；存量库由 seed 标记版本递增重种覆盖。
 */

/** 敌人品阶码（权威顺序，UI 下拉/筛选按此排序） */
export const ENEMY_ROLES = ['xiaoyao', 'yaobing', 'yaotu', 'yaokui', 'yaowang', 'yaozun'] as const

export type EnemyRole = (typeof ENEMY_ROLES)[number]

/** 品阶码 → 中文名 */
export const ENEMY_ROLE_LABELS: Record<EnemyRole, string> = {
  xiaoyao: '小妖',
  yaobing: '妖兵',
  yaotu: '妖徒',
  yaokui: '妖魁',
  yaowang: '妖王',
  yaozun: '妖尊',
}

/** 品阶倍率（敌人经验与金钱基准表 roleMultiplier 的种子/默认值） */
export const ENEMY_ROLE_MULTIPLIERS: Record<EnemyRole, number> = {
  xiaoyao: 1.0,
  yaobing: 1.15,
  yaotu: 1.2,
  yaokui: 2.0,
  yaowang: 3.0,
  yaozun: 5.0,
}

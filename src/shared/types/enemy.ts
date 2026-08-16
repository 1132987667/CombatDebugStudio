import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

/** 敌人属性统计（使用 ATTRIBUTE_CODE 作为键） */
export type EnemyStats = Partial<Record<ATTRIBUTE_CODE, number>>

export interface EnemyDrop {
  itemId: string
  quantity: number
  chance: number
}

/**
 * 敌人技能配置接口
 * 支持字符串或字符串数组格式
 */
export interface EnemySkills {
  /** 小技能ID（字符串或字符串数组） */
  small?: string[]
  /** 被动技能ID（字符串或字符串数组） */
  passive?: string[]
  /** 终极技能ID（字符串或字符串数组） */
  ultimate?: string[]
}

/** 敌人 affixPool 配置（enemies 表）：buffTier 0 无 / 1-4 增益档 / 5 天命；count 词缀数量；hasDebuff 是否含劫数（暂未启用） */
export interface EnemyAffixPool {
  buffTier?: number
  count?: number
  hasDebuff?: boolean
}

export interface Enemy {
  id: string
  name: string
  level: number
  stats: EnemyStats
  drops: EnemyDrop[]
  skills: EnemySkills
  /** 是否完全不会攻击（木人/训练靶子；AI 回合直接跳过行动） */
  noAttack?: boolean
  /** 词缀 ID 列表（引用 affixes 表，敌人附加的属性修正标签） */
  affixes?: string[]
  /** 词缀池（决定该敌人可获得词缀的档位与数量，「随机词缀」按此抽取） */
  affixPool?: EnemyAffixPool
}



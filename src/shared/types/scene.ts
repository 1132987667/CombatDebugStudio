/**
 * 场景数据接口定义
 */

/** 场地效果修饰符 */
export interface FieldEffectModifier {
  attribute: string
  value: number
  type: 'ADDITIVE' | 'PERCENTAGE'
}

/** 场地元素修正 */
export interface FieldEffectElemental {
  bonusElements?: string[]
  resistElements?: string[]
  percent: number
}

/** 场地周期效果 */
export interface FieldEffectPeriodic {
  phase: 'turn_start' | 'turn_end'
  effect: 'damage' | 'heal' | 'energy'
  value: number
  isPercent?: boolean
}

/** 场地效果配置 */
export interface FieldEffectConfig {
  id: string
  name: string
  description: string
  type: 'modifier' | 'elemental' | 'periodic'
  duration: number
  faction: 'all' | 'ally' | 'enemy'
  modifiers?: FieldEffectModifier[]
  elemental?: FieldEffectElemental
  periodic?: FieldEffectPeriodic
}

/** 场景内敌人条目（内联引用 enemies 表 id） */
export interface SceneEnemyRef {
  id: string
  name?: string
  level?: number
  /** 敌人标签（new_born / old_blood 等） */
  type?: string
}

/** 场景解锁条件 */
export interface SceneUnlockCondition {
  /** clear_scene：通关前置关卡；clear_boss：击败 BOSS */
  type: 'clear_scene' | 'clear_boss'
  /** 前置关卡 id / BOSS id */
  sceneId: string | null
}

/** 场景掉落配置 */
export interface SceneDrops {
  materials?: string[]
  gold?: [number, number]
  exp?: [number, number]
}

/**
 * 场景（关卡）数据 —— 对齐 configs/xiyou/scenes.json（25 关平铺结构）。
 * 每关敌人平铺在 enemies（普通）+ yaotu（守护者）。
 */
export interface SceneData {
  id: string
  name: string
  /** 区域 id（引用 regions 表） */
  regionId?: string
  /** 关卡等级范围 [min, max] */
  levelRange?: [number, number]
  /** 背景/描述文本（原 desc 字段） */
  background: string
  /** 普通敌人（内联 id 引用 enemies 表） */
  enemies: SceneEnemyRef[]
  /** 守护者（本关精英，内联 id 引用 enemies 表） */
  yaotu?: SceneEnemyRef | null
  /** 掉落配置（材料 / 金币区间 / 经验区间） */
  drops?: SceneDrops
  /** 是否已解锁 */
  unlocked?: boolean
  /** 通关星级 */
  stars?: number
  maxStars?: number
  /** 地图坐标 */
  pos?: { x: number; y: number }
  /** 解锁条件（前置关卡 / BOSS） */
  unlockCondition?: SceneUnlockCondition
  /** 剧情钩子 */
  narrativeHook?: string
  /** 场地效果列表（可选；当前场景数据未配置时为空） */
  fieldEffects?: FieldEffectConfig[]
}

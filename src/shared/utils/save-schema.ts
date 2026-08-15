/**
 * save-schema.ts — 演劫台存档数据结构（Schema v2.0.0）
 *
 * 纯数据层：SaveData 类型 + 初始状态工厂 + 完整性校验 + checksum 附着。
 * 不依赖任何 store / 组件，可在 node 环境单测（documents/演劫台/玩家存档数据储存与新游戏功能.md §4/§6.4）。
 *
 * NOTE: 与 PRD 的差异（适配实际运行时状态）：
 * - current_scene / unlocked_scenes 用场景 id（string）而非数字（configs/xiyou/scenes.json 为 scene_1_1 结构）；
 * - current_difficulty 用 'easy'（实际系统难度枚举），兼容旧档 'simple'（迁移时归一）；
 * - inventory 四类统一 Record<id,count>（PRD 的 equipments: string[] 改为 Record，避免数量丢失）。
 */

import { calculateChecksum } from './Checksum'

export const SAVE_VERSION = '2.0.0'

/** 存储键（IndexedDB saves store / localStorage 降级键，PRD §5.2） */
export const SAVE_MAIN_KEY = 'save:main'
export const SAVE_AUTO_KEY = 'save:auto'
export const LOCAL_MAIN_KEY = 'xiyou_save'
export const LOCAL_AUTO_KEY = 'xiyou_save_auto'

export type SaveDifficulty = 'easy' | 'normal' | 'hard'

export interface SaveMeta {
  version: string
  save_time: number
  play_time: number
  checksum?: string
}

export interface SavePlayerState {
  level: number
  exp: number
  hp_max: number
  energy_max: number
  base_atk: [number, number]
  gold: number
  silver: number
  jade: number
  pills_eaten: Record<string, number>
  statBonuses?: Record<string, number>
}

export interface SaveProgressState {
  max_scene: number
  current_scene: string
  current_difficulty: SaveDifficulty
  unlocked_scenes: string[]
  unlocked_difficulties: Record<string, string[]>
  boss_killed: string[]
  hidden_boss_killed: string[]
  great_boss_defeated: string[]
  final_boss_defeated: boolean
}

export interface SaveInventoryState {
  materials: Record<string, number>
  equipments: Record<string, number>
  elixirs: Record<string, number>
  misc: Record<string, number>
}

export interface SaveEquipmentState {
  weapon: string | null
  armor: string | null
  helmet: string | null
  boots: string | null
  charm: string | null
  ring: string | null
}

/**
 * 装备实例存档（扩展字段，向后兼容：无此字段的旧档按 itemId 生成裸实例）
 * 词缀与强化等级为实例属性；equipment 六槽存 instanceId 引用（旧档存 itemId）。
 */
export interface SaveEquipmentInstance {
  instanceId: string
  itemId: string
  enhance: number
  /** 品质（1-5 → 凡/精/超/绝/神，缺省按凡品） */
  quality?: number
  /** 品质系数（制造时在品质区间内 roll 并锁定；缺省取品质区间中值） */
  qualityFactor?: number
  affixes: { id: string; attribute: string; modifierType: string; value: number }[]
}

export interface SaveCraftState {
  weapon_level: number
  weapon_exp: number
  armor_level: number
  armor_exp: number
  accessory_level: number
  accessory_exp: number
}

export interface SaveSkillsState {
  passive: string | null
  minor1: string | null
  minor2: string | null
  major: string | null
}

export interface SaveBattleStatsState {
  total_battles: number
  total_wins: number
  total_losses: number
  scene_battle_count: Record<string, number>
}

export interface SaveQuestsState {
  active: string[]
  completed: string[]
}

/** 流派（v3.0 技能树 · 存档：所选流派 + 已点亮节点 id + 已用技能点） */
export interface SaveSchoolState {
  selected: string | null
  learned: string[]
  spent: number
}

export interface SaveData {
  meta: SaveMeta
  player: SavePlayerState
  progress: SaveProgressState
  inventory: SaveInventoryState
  equipment: SaveEquipmentState
  /** 装备实例（背包 + 已穿戴；equipment 槽位存 instanceId 引用） */
  equipment_instances?: SaveEquipmentInstance[]
  craft: SaveCraftState
  skills: SaveSkillsState
  battle_stats: SaveBattleStatsState
  quests: SaveQuestsState
  /** 流派（v3.0；旧档无此字段，恢复时按缺省无选择） */
  school?: SaveSchoolState
}

/** 初始状态工厂（新游戏 / 无档兜底，PRD §6.4） */
export function createInitialGameState(): SaveData {
  return {
    meta: {
      version: SAVE_VERSION,
      save_time: Date.now(),
      play_time: 0,
    },
    player: {
      level: 1,
      exp: 0,
      hp_max: 100,
      energy_max: 150,
      base_atk: [5, 8],
      gold: 0,
      silver: 0,
      jade: 0,
      pills_eaten: {},
      statBonuses: { available: 3, strength: 0, vitality: 0, agility: 0, spirit: 0 },
    },
    progress: {
      max_scene: 1,
      current_scene: '',
      current_difficulty: 'easy',
      unlocked_scenes: [],
      unlocked_difficulties: {},
      boss_killed: [],
      hidden_boss_killed: [],
      great_boss_defeated: [],
      final_boss_defeated: false,
    },
    inventory: {
      materials: {},
      equipments: {},
      elixirs: {},
      misc: {},
    },
    equipment: {
      weapon: null,
      armor: null,
      helmet: null,
      boots: null,
      charm: null,
      ring: null,
    },
    craft: {
      weapon_level: 0, weapon_exp: 0,
      armor_level: 0, armor_exp: 0,
      accessory_level: 0, accessory_exp: 0,
    },
    skills: {
      passive: null,
      minor1: null,
      minor2: null,
      major: null,
    },
    battle_stats: {
      total_battles: 0,
      total_wins: 0,
      total_losses: 0,
      scene_battle_count: {},
    },
    quests: {
      active: [],
      completed: [],
    },
  }
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** 完整性校验：校验值基于「剔除 meta.checksum 后的整体」，保证 key 顺序稳定（与附着时同构） */
export function attachChecksum(data: SaveData): SaveData {
  const { checksum: _drop, ...meta } = data.meta
  return { ...data, meta: { ...meta, checksum: calculateChecksum({ ...data, meta }) } }
}

export function verifySaveChecksum(data: SaveData): boolean {
  if (!data.meta?.checksum) return false
  const { checksum: _drop, ...meta } = data.meta
  return calculateChecksum({ ...data, meta }) === data.meta.checksum
}

export type SaveValidation =
  | { ok: true; data: SaveData }
  | { ok: false; error: string }

/** 必填字段完整性校验（导入 / 加载降级前判断，PRD §8.2） */
export function validateSaveData(raw: unknown): SaveValidation {
  if (!isObj(raw)) return { ok: false, error: '存档根节点不是对象' }
  const missing: string[] = []
  if (!isObj(raw.meta) || typeof raw.meta.version !== 'string') missing.push('meta.version')
  if (!isObj(raw.player)) missing.push('player')
  else {
    if (typeof raw.player.level !== 'number') missing.push('player.level')
    if (typeof raw.player.exp !== 'number') missing.push('player.exp')
  }
  if (!isObj(raw.progress)) missing.push('progress')
  else {
    if (!('current_scene' in raw.progress)) missing.push('progress.current_scene')
    if (!Array.isArray(raw.progress.unlocked_scenes)) missing.push('progress.unlocked_scenes')
  }
  if (!isObj(raw.inventory)) missing.push('inventory')
  if (!isObj(raw.equipment)) missing.push('equipment')
  if (missing.length > 0) return { ok: false, error: missing.join('、') }
  return { ok: true, data: raw as unknown as SaveData }
}

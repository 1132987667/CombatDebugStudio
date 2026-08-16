/**
 * seed.ts — 封神榜种子数据导入（封神榜开发计划 §3.2）
 *
 * 首次启动将 configs/ JSON 写入 IndexedDB 封神榜 store，幂等（标记 `cds:fengshen-seed-v2`）。
 * configs 仅作种子源，运行期以 IndexedDB 为唯一权威。
 *
 * 种子内容：
 * - skills/buffs/enemies/scenes/formations/lineups 直接落表；
 * - materials 剥离 3 件装备（weapon/armor/accessory）至独立 equipment 域并补全字段；
 * - actors 从 guardian_* 敌人派生（id 保持一致，供预设阵容 roleId 引用）；
 * - elements/growth 为新建种子；
 * - meta 写 dataVersion（初值 1）+ 种子标记。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import type {
  ActorData,
  AffixData,
  AffixLibraryData,
  BattleParamData,
  ElementsData,
  EquipmentAffixData,
  EquipmentData,
  GearData,
  GrowthCurveData,
  ItemData,
  LineupData,
  XiyouData,
} from '@/domain/fengshen/types'
import type { Enemy } from '@/shared/types/enemy'
import type { SkillConfig } from '@/domain/skill/types'
import { ConfigDataSource } from '@/shared/utils/ConfigDataSource'
import { deriveMaterials } from '@/domain/fengshen/derive-materials'
import { buffsData } from '@/shared/types/buffs-json'
import type { EffectsJsonEntry } from '@/shared/types/effects-json'
import formationsDataRaw from '@configs/formations/formations.json'
import lineupsDataRaw from '@configs/lineups/lineups.json'
import equipmentDataRaw from '@configs/equipment/equipment.json'
import equipmentAffixesDataRaw from '@configs/equipment/equipment-affixes.json'
import effectsDataRaw from '@configs/effects/effects.json'
import affixesDataRaw from '@configs/affixes/affixes.json'
import xiyouRegionsJson from '@configs/xiyou/regions.json'
import xiyouScenesJson from '@configs/xiyou/scenes.json'
import xiyouSchoolsJson from '@configs/xiyou/schools.json'
import xiyouPackJson from '@configs/xiyou/pack.json'
import xiyouCultivateJson from '@configs/xiyou/cultivate.json'
import xiyouEquipJson from '@configs/xiyou/equip.json'
import xiyouMateJson from '@configs/xiyou/mate.json'
import xiyouCollectJson from '@configs/xiyou/collect.json'
import xiyouQuestJson from '@configs/xiyou/quest.json'
import xiyouCaveJson from '@configs/xiyou/cave.json'
import itemsDataRaw from '@configs/xiyou/items.json'
import enemyBuffsJson from '@configs/xiyou/enemy-buffs.json'

// NOTE: v13 — 新增装备词条库 equipment_affixes（独立于敌人词缀 affixes，词条属性映射 attributes.json、
//       部位约束 slotKey 强校验，供装备随机词条掉落/洗炼/重铸按部位抽池）。
// NOTE: v14 — cave.json 配方材料结构化：锻造配方（forgeRecipes）不再内联 materials，经 equipmentId 引用装备 JSON 权威材料；
//       forgeRecipes 补全为全部 43 件可打造装备（原仅 5 件，闭环完整）。
// NOTE: v15 — 词缀库按设计稿 v3.1 重建：affixes.json 顶层改为对象（affix_library_version/affixes/mandate_bindings/
//       conflict_rules/wuxing_res_cap），69 条词缀（yao_1~4/mandate/jie 六档），五行词缀统一为抗性（D1b 已删五行攻击）。
//       升级版本号让已 seed 的浏览器重导最新 configs。
// NOTE: v16 — 敌人体系拆档：guardian_* 五行护法等旧敌人归档 enemies-old.json 且 ConfigDataSource 已加载，
//       修复 seed 后 actors 表为空（deriveActors 依赖 guardian_* 派生）。升版强制已 seed 的浏览器重导补全。
// NOTE: v17 — 敌人技能/敌人 buff 数据补全：enemy-buffs.json 合并入 buffs 表（技能 steps.buffId 引用断裂 178 项修复）。
// NOTE: v18 — 经验与金钱管理：params 域新增结构化种子 exp_table / enemy_reward_table / level_diff_bonus
//       （经验曲线、敌人奖励基准+难度/角色倍率、等级差加成规则，供封神榜编辑与引擎结算消费）。
// NOTE: v19 — 玩家等级上限 30 → 50（《关卡系统 v2.0.md》）：exp_table maxLevel 50、补 11-50 档位
//       （1-10 级 300×等级 / 11-30 级 600×等级 / 31-50 级 900×等级）。升版强制已 seed 的浏览器重导新经验表。
// NOTE: v20 — 敌人品阶体系（6 档：小怪/精英/头目/大头目/妖王/隐藏妖王）：role 码由 8 个归并为 6 个——
//       three_kings→major_boss（妖王）、achievement_boss/final_boss→hidden_boss（隐藏妖王）、新增 elite（精英，暂未落数据）。
//       roleMultiplier 同步归并（取各归并源代表档原值：major_boss=3.0 大头目、hidden_boss=5.0 隐藏BOSS）。
//       enemies.json 数据已归并，升版强制已 seed 的浏览器重导。
// NOTE: v23 — 守护者品阶归一：25 个关卡守护者敌人 role 由 guardian（头目）改为 elite（精英），
//       （guardian 档暂留 roleMultiplier 无数据占用；elite 倍率 1.15 已在 v20 定义）。升版强制已 seed 的浏览器重导。
// NOTE: v24 — 品阶档 minor_boss（大头目）废弃：5 个大头目敌人 role 由 minor_boss 改为 guardian（头目），
//       连带 id/技能/buff 编码 boss_minor_* → boss_guardian_* 改名；guardian 保持 1.2。升版强制已 seed 的浏览器重导。
// NOTE: v25 — 5 大场景 BOSS 收敛到 bosses.json（权威，运行时转换）并降档：boss_major_*（lv10/20/30/40/50 妖王）
//       role 由 major_boss 改为 minor_boss（大头目），数值以 bosses.json 为准（血量大幅提升）；enemies.json 移除
//       这 5 个 boss_major_* 定义；roleMultiplier/schema 恢复 minor_boss 档（2.0）。升版强制已 seed 的浏览器重导。
// NOTE: v21 — 物品价值语义重构：items.json sellPrice → value（实际价值），坊市经济系数入 params 域
//       （economy_ratios：购买 200% / 出售 56%），坊市商品按 itemId 关联物品由 价值×购买系数 派生价格。
//       升版强制已 seed 的浏览器重导（items 表 value 字段 + params economy_ratios）。
// NOTE: v22 — 炼丹图谱补全：cave.json alchemyRecipes 新增 元气丹/全属性丹药 丹方，速度丹药/洗髓丹
//       产出数量定值（2/1）；AlchemyPanel 炼制按丹方 count 产出。升版重导 XIYOU cave 表。
// NOTE: v25 — 修复 buff_thorns（荆棘/反伤）：effects 用了不存在的原子效果类型 "reflect"
//       （AtomicEffectType 仅认 "thorns"，且无对应处理器），战斗触发时 BuffConfigResolver 抛
//       「未知原子效果类型 reflect」。改为与 buff_metallization 一致的 TRIGGER + scriptId=reflect_damage
//       （params.percent=0.1）。升版强制已 seed 的浏览器重导 buffs 表。
export const SEED_FLAG_ID = 'cds:fengshen-seed-v25'

/** buffs 域统一管理 buff 定义 + effect 定义（规格说明书 3.3）——技能 steps.effectId 可引用两者 */
const buffsWithEffects = [
  ...buffsData,
  ...(enemyBuffsJson as unknown as Array<Record<string, unknown>>),
  ...((effectsDataRaw as { effects: EffectsJsonEntry[] }).effects ?? []),
]

export interface SeedResult {
  imported: boolean
  reason: string
}

const nowIso = () => new Date().toISOString()

/** guardian_* 敌人派生角色：id 保持一致，faction 由 id 后缀映射，技能合并 small/passive/ultimate */
function deriveActors(enemies: Enemy[]): ActorData[] {
  const factionMap: Record<string, string> = {
    guardian_fire: 'fire',
    guardian_water: 'water',
    guardian_wood: 'wood',
    guardian_earth: 'earth',
    guardian_gold: 'metal',
  }
  return enemies
    .filter((e) => e.id.startsWith('guardian_'))
    .map((e) => {
      const stats: Record<string, number> = { ...e.stats }
      delete stats.currentHealth
      if (stats.maxHealth === undefined && e.stats.currentHealth) {
        stats.maxHealth = e.stats.currentHealth
      }
      return {
        id: e.id,
        name: e.name,
        level: e.level,
        stats,
        growth: 'growth_balanced',
        skillIds: [...(e.skills?.small ?? []), ...(e.skills?.passive ?? []), ...(e.skills?.ultimate ?? [])],
        faction: factionMap[e.id],
        energyInit: 30,
        description: `由敌人「${e.name}」派生，作为可操作角色模板。`,
      }
    })
}

function buildElements(): ElementsData {
  return {
    id: 'elements',
    elements: [
      { id: 'fire', name: '火' },
      { id: 'water', name: '水' },
      { id: 'wood', name: '木' },
      { id: 'earth', name: '土' },
      { id: 'metal', name: '金' },
    ],
    matrix: [
      { attackerId: 'fire', defenderId: 'wood', coefficient: 1.2 },
      { attackerId: 'water', defenderId: 'fire', coefficient: 1.2 },
      { attackerId: 'wood', defenderId: 'earth', coefficient: 1.2 },
      { attackerId: 'earth', defenderId: 'water', coefficient: 1.2 },
      { attackerId: 'metal', defenderId: 'wood', coefficient: 1.2 },
    ],
    defaultCoefficient: 1.0,
  }
}

/** 战斗规则参数种子（对齐 BattleRuleManager 默认配置数值，引擎经 BattleDataLoader 消费） */
function buildParams(): BattleParamData[] {
  return [
    { id: 'energy_gain_per_turn', name: '每回合能量回复', value: 15, range: { min: 0, max: 200 }, description: '战斗规则·每回合自动回复能量（combat.energyGainPerTurn）', updatedAt: nowIso() },
    { id: 'energy_gain_on_hit', name: '受击能量获取', value: 12, range: { min: 0, max: 100 }, description: '战斗规则·受到攻击获得能量（combat.energyGainOnHit）', updatedAt: nowIso() },
    { id: 'min_damage', name: '最小伤害', value: 1, range: { min: 1, max: 9999 }, description: '战斗规则·单次攻击最低伤害（combat.minDamage）', updatedAt: nowIso() },
    { id: 'max_damage', name: '最大伤害', value: 9999, range: { min: 1, max: 99999 }, description: '战斗规则·单次攻击最高伤害（combat.maxDamage）', updatedAt: nowIso() },
    { id: 'max_turns', name: '最大回合数', value: 99, range: { min: 1, max: 999 }, description: '战斗规则·固定回合上限（turnSystem.maxTurns）', updatedAt: nowIso() },
    // 坊市经济：物品实际价值 → 购买价 / 出售价 换算系数（百分比口径；200=价值×200%）
    { id: 'economy_ratios', name: '坊市经济系数', description: '物品实际价值 → 坊市购买价 / 出售价换算（百分比；购买 200% 即价值×2.0，出售 56% 即价值×0.56）', data: { id: 'economy_ratios', buyPercent: 200, sellPercent: 56 }, updatedAt: nowIso() },
  ]
}

/** 经验与金钱管理结构化种子：玩家升级经验表（params 域，key=exp_table） */
function buildExpTable(): BattleParamData {
  const levelRange = (start: number, end: number): { level: number; expRequired: number }[] => {
    const out: { level: number; expRequired: number }[] = []
    for (let lv = start; lv <= end; lv++) out.push({ level: lv, expRequired: 300 * lv })
    return out
  }
  const growthRange = (start: number, end: number, perLv: number): { level: number; expRequired: number }[] => {
    const out: { level: number; expRequired: number }[] = []
    for (let lv = start; lv <= end; lv++) out.push({ level: lv, expRequired: perLv * lv })
    return out
  }
  return {
    id: 'exp_table',
    name: '玩家升级经验表',
    description: '定义玩家每个等级升至下一级所需的经验值',
    data: {
      id: 'exp_table',
      maxLevel: 50,
      entries: [
        ...levelRange(1, 10),
        ...growthRange(11, 30, 600),
        ...growthRange(31, 50, 900),
      ],
      formulaHint: '1-10级：300×等级；11-30级：600×等级；31-50级：900×等级',
    },
    updatedAt: nowIso(),
  }
}

/** 经验与金钱管理结构化种子：敌人经验与金钱基准表（params 域，key=enemy_reward_table） */
function buildEnemyRewardTable(): BattleParamData {
  return {
    id: 'enemy_reward_table',
    name: '敌人经验与金钱基准表',
    description: '定义每个等级敌人被击败后给予的基础经验与金钱区间',
    data: {
      id: 'enemy_reward_table',
      baseExpFormula: 'enemyLevel × 10',
      baseGoldFormula: 'enemyLevel × 3 + random(0, enemyLevel × 2)',
      roleMultiplier: {
        normal: 1.0,
        elite: 1.15,
        guardian: 1.2,
        minor_boss: 2.0,
        major_boss: 3.0,
        hidden_boss: 5.0,
      },
      entries: [
        { enemyLevel: 1, baseExp: 10, goldMin: 3, goldMax: 5, note: '小花山初级敌人' },
        { enemyLevel: 5, baseExp: 50, goldMin: 15, goldMax: 25, note: '小花山后期' },
        { enemyLevel: 10, baseExp: 100, goldMin: 30, goldMax: 50, note: '浅水涧' },
        { enemyLevel: 15, baseExp: 150, goldMin: 45, goldMax: 75, note: '碎石坡' },
        { enemyLevel: 20, baseExp: 200, goldMin: 60, goldMax: 100, note: '熔岩洞' },
        { enemyLevel: 25, baseExp: 250, goldMin: 75, goldMax: 125, note: '蛛丝谷' },
        { enemyLevel: 30, baseExp: 300, goldMin: 90, goldMax: 150, note: '灵霄台终局' },
        { enemyLevel: 40, baseExp: 400, goldMin: 120, goldMax: 200, note: '中期深度（插值锚点）' },
        { enemyLevel: 50, baseExp: 500, goldMin: 150, goldMax: 250, note: '后期深度（插值锚点）' },
        { enemyLevel: 60, baseExp: 600, goldMin: 180, goldMax: 300, note: '隐藏 BOSS 档（插值锚点）' },
        { enemyLevel: 70, baseExp: 700, goldMin: 210, goldMax: 350, note: '终局档（插值锚点）' },
      ],
      interpolation: 'linear',
    },
    updatedAt: nowIso(),
  }
}

/** 经验与金钱管理结构化种子：等级差经验加成规则（params 域，key=level_diff_bonus） */
function buildLevelDiffBonus(): BattleParamData {
  return {
    id: 'level_diff_bonus',
    name: '等级差经验加成规则',
    description: '玩家攻击高于或低于自身等级的敌人时，经验获取的倍率修正',
    data: {
      id: 'level_diff_bonus',
      rules: [
        { id: 'rule_underleveled_5', label: '碾压（低5级及以上）', condition: { diff: '<= -5' }, expMultiplier: 0.1, goldMultiplier: 0.5, description: '敌人等级比玩家低5级及以上，经验大幅衰减', note: '防止低级刷怪' },
        { id: 'rule_underleveled_3', label: '轻松（低3~4级）', condition: { diff: [-4, -3] }, expMultiplier: 0.5, goldMultiplier: 0.8, description: '敌人等级比玩家低3~4级，经验减半' },
        { id: 'rule_underleveled_1', label: '略低（低1~2级）', condition: { diff: [-2, -1] }, expMultiplier: 0.8, goldMultiplier: 1.0, description: '敌人等级略低于玩家，经验轻微衰减' },
        { id: 'rule_even', label: '同级', condition: { diff: 0 }, expMultiplier: 1.0, goldMultiplier: 1.0, description: '等级相同，无修正' },
        { id: 'rule_overleveled_1', label: '略高（高1~2级）', condition: { diff: [1, 2] }, expMultiplier: 1.2, goldMultiplier: 1.0, description: '敌人略强，经验小幅加成' },
        { id: 'rule_overleveled_3', label: '挑战（高3~5级）', condition: { diff: [3, 5] }, expMultiplier: 1.5, goldMultiplier: 1.2, description: '越级挑战，经验显著加成' },
        { id: 'rule_overleveled_6', label: '极限（高6级及以上）', condition: { diff: '>= 6' }, expMultiplier: 2.0, goldMultiplier: 1.5, description: '极限越级，经验翻倍', note: '鼓励挑战高难内容' },
      ],
      fallbackMultiplier: 1.0,
      clampRange: { min: 0.1, max: 3.0 },
    },
    updatedAt: nowIso(),
  }
}

/** 西游数据种子：configs/xiyou/*.json 单文档导入（演劫台经封神榜读取，需求说明 §5.1 方案 B） */
function buildXiyou(): XiyouData[] {
  const now = nowIso()
  return [
    { id: 'regions', name: '区域', description: '西游·章节大地图', data: xiyouRegionsJson, updatedAt: now },
    { id: 'scenes', name: '场景', description: '西游·关卡卡片', data: xiyouScenesJson, updatedAt: now },
    { id: 'schools', name: '流派', description: '西游·三流派技能', data: xiyouSchoolsJson, updatedAt: now },
    { id: 'pack', name: '背包', description: '西游·乾坤袋/坊市/仓库', data: xiyouPackJson, updatedAt: now },
    { id: 'cultivate', name: '养成', description: '西游·境界/功法/经脉/神通', data: xiyouCultivateJson, updatedAt: now },
    { id: 'equip', name: '装备', description: '西游·装备槽/法宝/坐骑', data: xiyouEquipJson, updatedAt: now },
    { id: 'mate', name: '伙伴', description: '西游·伙伴/灵宠/缘分', data: xiyouMateJson, updatedAt: now },
    { id: 'collect', name: '图鉴', description: '西游·图鉴/成就/称号', data: xiyouCollectJson, updatedAt: now },
    { id: 'quest', name: '任务', description: '西游·任务/签到/活动', data: xiyouQuestJson, updatedAt: now },
    { id: 'cave', name: '洞府', description: '西游·炼丹/炼器/闭关/药园/百艺', data: xiyouCaveJson, updatedAt: now },
  ]
}

function buildGrowth(): GrowthCurveData[] {
  return [
    {
      id: 'growth_balanced',
      name: '均衡型',
      perLevel: { maxHealth: 60, attack: 8, defense: 4, speed: 2 },
      expTable: [
        { level: 2, expRequired: 120 },
        { level: 3, expRequired: 260 },
        { level: 4, expRequired: 420 },
      ],
    },
    {
      id: 'growth_attack',
      name: '攻击型',
      perLevel: { maxHealth: 45, attack: 12, defense: 2, speed: 3 },
      expTable: [
        { level: 2, expRequired: 140 },
        { level: 3, expRequired: 300 },
      ],
    },
    {
      id: 'growth_defense',
      name: '防御型',
      perLevel: { maxHealth: 90, attack: 4, defense: 10, speed: 1 },
      expTable: [
        { level: 2, expRequired: 110 },
        { level: 3, expRequired: 240 },
      ],
    },
    {
      id: 'growth_speed',
      name: '速度型',
      perLevel: { maxHealth: 50, attack: 6, defense: 3, speed: 5 },
      expTable: [
        { level: 2, expRequired: 130 },
        { level: 3, expRequired: 280 },
      ],
    },
  ]
}

/**
 * 执行种子导入（幂等）。
 * 底层 storage 不可用时（如无 IndexedDB 环境）由调用方容错，此处不预检。
 */
export async function seedFengshenData(storage: IPersistentStorage): Promise<SeedResult> {
  try {
    const flag = await storage.get<{ id: string; appliedAt: string }>(FENGSHEN_STORE.META, SEED_FLAG_ID)
    if (flag) {
      return { imported: false, reason: 'already-seeded' }
    }

    const config = new ConfigDataSource()
    const enemies = config.getEnemies()
    const skills = config.getSkills() as SkillConfig[]

    const tables: Array<[StorageStoreName, readonly unknown[]]> = [
      [FENGSHEN_STORE.ENEMIES, enemies],
      [FENGSHEN_STORE.SKILLS, skills],
      [FENGSHEN_STORE.SCENES, config.getScenes()],
      [FENGSHEN_STORE.BUFFS, buffsWithEffects],
      [FENGSHEN_STORE.FORMATIONS, formationsDataRaw],
      [FENGSHEN_STORE.LINEUPS, lineupsDataRaw as LineupData[]],
      [FENGSHEN_STORE.MATERIALS, deriveMaterials((itemsDataRaw as { items: ItemData[] }).items)],
      [FENGSHEN_STORE.EQUIPMENT, equipmentDataRaw as EquipmentData[]],
      [FENGSHEN_STORE.ACTORS, deriveActors(enemies)],
      [FENGSHEN_STORE.GROWTH, buildGrowth()],
      [FENGSHEN_STORE.AFFIXES, (affixesDataRaw as AffixLibraryData).affixes as AffixData[]],
      [FENGSHEN_STORE.EQUIPMENT_AFFIXES, equipmentAffixesDataRaw as EquipmentAffixData[]],
      [FENGSHEN_STORE.PARAMS, [...buildParams(), buildExpTable(), buildEnemyRewardTable(), buildLevelDiffBonus()]],
      [FENGSHEN_STORE.XIYOU, buildXiyou()],
      [FENGSHEN_STORE.ITEMS, (itemsDataRaw as { items: ItemData[] }).items],
      [FENGSHEN_STORE.GEARS, (equipmentDataRaw as EquipmentData[]).filter((e) => e.craftable) as GearData[]],
    ]

    for (const [store, rows] of tables) {
      for (const row of rows) {
        const entity = row as { id: string }
        if (!entity || typeof entity.id !== 'string' || !entity.id) continue
        await storage.set(store, entity.id, { ...(row as object), updatedAt: nowIso() })
      }
    }

    // elements 单文档
    await storage.set(FENGSHEN_STORE.ELEMENTS, 'elements', { ...buildElements(), updatedAt: nowIso() })

    // meta：dataVersion 初值 1 + 种子标记
    await storage.set(FENGSHEN_STORE.META, 'dataVersion', { id: 'dataVersion', version: 1, updatedAt: nowIso() })
    await storage.set(FENGSHEN_STORE.META, SEED_FLAG_ID, { id: SEED_FLAG_ID, appliedAt: nowIso() })

    return { imported: true, reason: 'seeded' }
  } catch {
    return { imported: false, reason: 'seed-failed' }
  }
}

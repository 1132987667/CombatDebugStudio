/**
 * seed.ts — 封神榜种子数据导入（封神榜开发计划 §3.2）
 *
 * 首次启动将 configs/ JSON 写入 IndexedDB 封神榜 store，幂等（标记 `cds:fengshen-seed-v2`）。
 * configs 仅作种子源，运行期以 IndexedDB 为唯一权威。
 *
 * 种子内容：
 * - skills/buffs/enemies/scenes/formations/lineups 直接落表；
 * - materials 剥离 3 件装备（weapon/armor/accessory）至独立 equipment 域并补全字段；
 * - actors 从 yaotu_* 敌人派生（id 保持一致，供预设阵容 roleId 引用）；
 * - elements/growth 为新建种子；
 * - meta 写 dataVersion（初值 1）+ 种子标记。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import type {
  ActorData,
  AffixData,
  AffixLibraryData,
  AffixRuleConfig,
  AttributeDef,
  BattleParamData,
  ElementsData,
  EquipFormulaConfig,
  EquipmentAffixData,
  EquipmentData,
  GearData,
  GrowthCurveData,
  ItemData,
  LineupData,
  PlayerGrowthConfig,
  SystemBudgetConfig,
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
import attributesDataRaw from '@configs/attributes/attributes.json'
import affixRuleDataRaw from '@configs/equipment/affix-rule.json'

export const SEED_FLAG_ID = 'cds:fengshen-seed-v26'

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

/** yaotu_* 敌人派生角色：id 保持一致，faction 由 id 后缀映射，技能合并 small/passive/ultimate */
function deriveActors(enemies: Enemy[]): ActorData[] {
  const factionMap: Record<string, string> = {
    yaotu_fire: 'fire',
    yaotu_water: 'water',
    yaotu_wood: 'wood',
    yaotu_earth: 'earth',
    yaotu_gold: 'metal',
  }
  return enemies
    .filter((e) => e.id.startsWith('yaotu_'))
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
        yaotu: 1.2,
        yaokui: 2.0,
        yaowang: 3.0,
        yaozun: 5.0,
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
        { enemyLevel: 60, baseExp: 600, goldMin: 180, goldMax: 300, note: '妖尊 档（插值锚点）' },
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

/** 玩家成长配置种子（params 域，key=player_config）—— SAP 六维模型，对齐 PRD §19 / 数值体系构建计划 D1。
 * 每级固定成长合计 12 属性点（24/12+8/2+4/2+3/2+3/2+2/2=12）；每级自由点 4；丹药 +100 → 满级总量 900。 */
function buildPlayerConfig(): BattleParamData {
  return {
    id: 'player_config',
    name: '玩家成长配置',
    description: '玩家初始属性 / 每级成长 / 自由属性点 / SAP 转化 / 丹药加成（数值体系闭环起点）',
    data: {
      id: 'player_config',
      maxLevel: 50,
      expFormula: 'round(50 × L^1.35 + 60 × L)',
      base: { maxHealth: 60, attack: 15, defense: 10, hitValue: 10, dodgeValue: 10, speed: 10 },
      growth: { maxHealth: 24, attack: 8, defense: 4, hitValue: 3, dodgeValue: 3, speed: 2 },
      freePointsPerLevel: 4,
      conversion: { maxHealth: 12, attack: 2, defense: 2, hitValue: 2, dodgeValue: 2, speed: 2 },
      pillBonusPoints: 100,
      currentLevel: 1,
    } as PlayerGrowthConfig,
    updatedAt: nowIso(),
  }
}

/** 养成系统预算种子（params 域，key=system_budget）—— §2.3 策划新表，随策划调整只改 JSON */
function buildSystemBudget(): BattleParamData {
  return {
    id: 'system_budget',
    name: '养成系统预算权重',
    description: '各养成系统属性预算权重（等级总属性点 900 = 每级16点×50 + 丹药100）',
    data: {
      id: 'system_budget',
      systems: [
        { system: 'level', label: '等级', totalSap: 900, weight: 120, note: '800（每级16属性点 × 50）+ 丹药100' },
        { system: 'equipment', label: '装备', weight: 240, note: '100% × 强化15(1.6) × 满级升星(1.25)' },
        { system: 'school', label: '流派树', weight: 60 },
        { system: 'pet', label: '宠物', weight: 60 },
        { system: 'mount', label: '坐骑', weight: 60 },
        { system: 'artifact', label: '法宝', weight: 60 },
        { system: 'relic', label: '神器', weight: 60 },
      ],
    } as SystemBudgetConfig,
    updatedAt: nowIso(),
  }
}

/** 装备数值公式种子（params 域，key=equip_formula）—— §3.7 策划公式存档，随策划调整只改 JSON */
function buildEquipFormula(): BattleParamData {
  return {
    id: 'equip_formula',
    name: '装备数值公式',
    description: '装备基础属性投放公式：单位基数 × 等级 × 属性权重 × 品阶权重 × 转化系数，浮动 50%~110%',
    data: {
      id: 'equip_formula',
      baseSap: 900,
      slotCount: 6,
      weightPerSlot: 3,
      maxLevel: 50,
      coreWeight: 2,
      affixWeight: 1,
      floatRange: { min: 0.5, max: 1.1 },
      tierWeight: {
        fan: { min: 0.5, max: 0.6 },
        xuan: { min: 0.6, max: 0.7 },
        di: { min: 0.7, max: 0.8 },
        tian: { min: 0.8, max: 0.9 },
        xian: { min: 0.9, max: 1.0 },
      },
    } as EquipFormulaConfig,
    updatedAt: nowIso(),
  }
}

/** 装备词条投放规则种子（params 域，key=affix_rule）—— configs/equipment/affix-rule.json 策划定稿 */
function buildAffixRule(): BattleParamData {
  const raw = affixRuleDataRaw as Record<string, unknown>
  return {
    id: 'affix_rule',
    name: '装备词条投放规则',
    description: '定义各装备部位/子类型允许投放的属性组池（5行×14子类型矩阵）',
    data: {
      id: 'affix_rule',
      rule_version: String(raw.rule_version ?? '1.0'),
      updated_at: String(raw.updated_at ?? ''),
      description: String(raw.description ?? ''),
      attribute_groups: (raw.attribute_groups ?? {}) as AffixRuleConfig['attribute_groups'],
      sub_type_groups: (raw.sub_type_groups ?? {}) as AffixRuleConfig['sub_type_groups'],
      slot_side: (raw.slot_side ?? {}) as AffixRuleConfig['slot_side'],
      affix_rows: (raw.affix_rows ?? []) as AffixRuleConfig['affix_rows'],
      forbidden: (raw.forbidden ?? []) as AffixRuleConfig['forbidden'],
    } as AffixRuleConfig,
    updatedAt: nowIso(),
  }
}

/** SAP 价值倍数映射（§3.4 / D1：12 气血 = 2 攻 = 2 防 = 2 命中 = 2 闪避 = 2 速度） */
const SAP_MULTIPLIER_MAP: Record<string, number> = {
  maxHealth: 12,
  attack: 2,
  defense: 2,
  hitValue: 2,
  dodgeValue: 2,
  speed: 2,
}

/** 属性代码 → 归属系统推导（核心六维属性的默认来源系统） */
const SYSTEMS_MAP: Record<string, string[]> = {
  maxHealth: ['level', 'equipment'],
  attack: ['level', 'equipment'],
  defense: ['level', 'equipment'],
  hitValue: ['level', 'equipment'],
  dodgeValue: ['level', 'equipment'],
  speed: ['level', 'equipment'],
}

/** 属性定义种子（attributes 表）—— 从 attributes.json 迁移，补 SAP 价值倍数 / 层级 / 归属系统。
 * id 直接用 code（与 equipment_affixes.attribute 代码值对齐，支持声明式引用规则和 refTable 翻译）；
 * 跳过 isRuntimeState=true 的运行时属性。 */
function buildAttributes(): AttributeDef[] {
  const raw = attributesDataRaw as Array<Record<string, unknown>>
  const now = nowIso()
  return raw
    .filter((r) => !r.isRuntimeState)
    .map((r) => ({
      id: String(r.code),
      name: String(r.name ?? r.displayName ?? r.code),
      code: String(r.code),
      isPercentage: Boolean(r.isPercentage),
      sapMultiplier: SAP_MULTIPLIER_MAP[String(r.code)] ?? 1,
      valueTier: 'L1' as const,
      systems: SYSTEMS_MAP[String(r.code)] ?? [],
      isRuntimeState: false,
      description: String(r.description ?? r.impact ?? ''),
      updatedAt: now,
    }))
}

/** 西游数据种子：configs/xiyou/*.json 单文档导入（演劫台经封神榜读取，需求说明 §5.1 方案 B） */
function buildXiyou(): XiyouData[] {
  const now = nowIso()
  return [
    { id: 'regions', name: '区域', description: '西游·章节大地图', data: xiyouRegionsJson, updatedAt: now },
    { id: 'scenes', name: '场景', description: '西游·关卡卡片', data: xiyouScenesJson, updatedAt: now },
    { id: 'schools', name: '流派', description: '西游·三流派技能', data: xiyouSchoolsJson, updatedAt: now },
    { id: 'pack', name: '背包', description: '西游·乾坤袋/坊市/仓库', data: xiyouPackJson, updatedAt: now },
    { id: 'cultivate', name: '养成', description: '西游·境界/功法/经脉', data: xiyouCultivateJson, updatedAt: now },
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
      [FENGSHEN_STORE.ATTRIBUTES, buildAttributes()],
      [FENGSHEN_STORE.PARAMS, [...buildParams(), buildExpTable(), buildEnemyRewardTable(), buildLevelDiffBonus(), buildPlayerConfig(), buildSystemBudget(), buildEquipFormula(), buildAffixRule()]],
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

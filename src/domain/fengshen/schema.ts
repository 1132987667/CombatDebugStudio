/**
 * 封神榜字段 Schema 资产（封神榜开发计划 §3.5）
 *
 * 一份 schema 三用：FieldEditor 表单渲染 + DataIntegrityService 校验（数值范围/唯一性/引用完整性）+ DataTable 列配置。
 * 引用完整性以声明式 ReferenceRule 注册表表达，保存校验与删除保护共享同一规则表。
 */

import type { FengshenTableName } from '@/domain/fengshen/types'

export type FieldType = 'text' | 'number' | 'select' | 'multi' | 'map' | 'array' | 'object' | 'boolean'

export interface FieldSchema {
  key: string
  label: string
  type: FieldType
  required?: boolean
  /** 数值范围约束（number 类型） */
  min?: number
  max?: number
  /** 枚举选项（select 类型；显示名与值一致时仅给字符串数组） */
  enum?: string[]
  /** 枚举值 → 中文显示名（select 类型；详情/列表/表单展示时翻译，缺省回退原值） */
  valueLabel?: Record<string, string>
  /** 引用目标表（引用完整性检查，单值字段） */
  refTable?: FengshenTableName
  /** 列表列配置 */
  column?: {
    width?: number
    format?: 'id' | 'number' | 'tag'
    /** 标签着色依据（Demo 多色标签）：值 → 标签语义色 */
    tagKind?: 'polarity' | 'category' | 'type' | 'slot' | 'rarity' | 'rank' | 'neutral'
    /** 列表单元格可点击（点击后在右侧详情面板显示该行；name 字段默认可点击） */
    clickable?: boolean
  }
  description?: string
  /** 参与列表搜索的字段（除默认 name/id 外；map 字段按「键:值」匹配，如 stats 搜属性值） */
  searchable?: boolean
  /** array 字段的结构示例模板（FieldEditor「填入示例」按钮写入，供对照结构编辑） */
  arrayTemplate?: unknown[]
  /** object 字段的结构示例模板（FieldEditor「填入示例」按钮写入，供对照结构编辑） */
  objectTemplate?: Record<string, unknown>
}

/** 列表筛选器（对齐 Demo 工具条：select 下拉 / range 范围输入） */
export interface TableFilter {
  key: string
  label: string
  type: 'select' | 'range'
  /** select：选项（值 = 显示名）或引用表取选项 */
  options?: string[]
  /** select：值 → 显示名映射（如 role 码 → 中文档位名）；多个值映射到同一显示名时下拉合并为一个档位，过滤按档位全匹配 */
  labelMap?: Record<string, string>
  refTable?: FengshenTableName
  /** range：字段路径（如 level） */
  min?: number
  max?: number
}

export interface TableSchema {
  table: FengshenTableName
  label: string
  /** 列表展示列（按此顺序渲染表格列头） */
  columns: string[]
  fields: FieldSchema[]
  /** 唯一性约束字段（除 id 外的字段值全表唯一，如 name） */
  uniqueFields?: string[]
  /** 列表工具条筛选器 */
  filters?: TableFilter[]
}

/**
 * 声明式引用规则：sourceTable 的 path 字段引用 targetTables 中的 ID。
 * path 支持数组遍历（如 `steps[].effectId`），值为字符串或字符串数组。
 */
export interface ReferenceRule {
  sourceTable: FengshenTableName
  /** 字段路径，`[]` 表示遍历数组元素 */
  path: string
  targetTables: FengshenTableName[]
  /** 可选字段：为 undefined/null/空时跳过检查 */
  optional?: boolean
}

/** 全表引用规则注册表（保存校验 + 删除保护 + 健康检查共用） */
export const REFERENCE_RULES: ReferenceRule[] = [
  { sourceTable: 'actors', path: 'skillIds', targetTables: ['skills'] },
  { sourceTable: 'actors', path: 'growth', targetTables: ['growth'], optional: true },
  { sourceTable: 'actors', path: 'faction', targetTables: ['elements'], optional: true },
  { sourceTable: 'skills', path: 'steps[].effectId', targetTables: ['buffs'], optional: true },
  { sourceTable: 'skills', path: 'steps[].buffId', targetTables: ['buffs'], optional: true },
  { sourceTable: 'scenes', path: 'enemies[].id', targetTables: ['enemies'], optional: true },
  { sourceTable: 'scenes', path: 'yaotu.id', targetTables: ['enemies'], optional: true },
  { sourceTable: 'scenes', path: 'unlockCondition.sceneId', targetTables: ['scenes', 'enemies'], optional: true },
  { sourceTable: 'scenes', path: 'drops.materials', targetTables: ['items'], optional: true },
  { sourceTable: 'lineups', path: 'formationId', targetTables: ['formations'] },
  { sourceTable: 'lineups', path: 'roles[].roleId', targetTables: ['actors', 'enemies'] },
  { sourceTable: 'enemies', path: 'drops[].itemId', targetTables: ['materials', 'equipment', 'items'], optional: true },
  { sourceTable: 'enemies', path: 'skillIds', targetTables: ['skills'], optional: true },
  { sourceTable: 'enemies', path: 'passiveSkillIds', targetTables: ['skills'], optional: true },
  { sourceTable: 'enemies', path: 'affixes', targetTables: ['affixes'], optional: true },
  { sourceTable: 'equipment', path: 'factionRestriction', targetTables: ['elements'], optional: true },
  { sourceTable: 'gears', path: 'materials[].itemId', targetTables: ['items', 'materials'] },
  { sourceTable: 'elements', path: 'matrix[].attackerId', targetTables: ['elements'], optional: true },
  { sourceTable: 'elements', path: 'matrix[].defenderId', targetTables: ['elements'], optional: true },
]

export const TABLE_SCHEMAS: Record<FengshenTableName, TableSchema> = {
  actors: {
    table: 'actors',
    label: '角色/敌人',
    columns: ['name', 'level', 'growth', 'skillIds'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'level', label: '等级', type: 'number', required: true, min: 1, max: 99, column: { format: 'number' } },
      { key: 'growth', label: '成长曲线', type: 'select', refTable: 'growth' },
      { key: 'skillIds', label: '可用技能', type: 'multi', refTable: 'skills', searchable: true },
      { key: 'energyInit', label: '初始能量', type: 'number', min: 0, max: 200 },
      { key: 'stats', label: '基础属性', type: 'map', searchable: true },
      { key: 'description', label: '描述', type: 'text', searchable: true },
    ],
    uniqueFields: ['name'],
    filters: [
      { key: 'level', label: '等级', type: 'range', min: 1, max: 99 },
    ],
  },
  skills: {
    table: 'skills',
    label: '技能',
    columns: ['name', 'skillType', 'energyCost', 'cooldown'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'skillType', label: '类型', type: 'select', enum: ['small', 'ultimate', 'passive'], column: { tagKind: 'type' }, searchable: true,
        valueLabel: { small: '小技能', ultimate: '大招', passive: '被动' } },
      { key: 'energyCost', label: '能量消耗', type: 'number', min: 0, max: 200, column: { format: 'number' } },
      { key: 'cooldown', label: '冷却回合', type: 'number', min: 0, max: 20, column: { format: 'number' } },
      { key: 'description', label: '描述', type: 'text', searchable: true },
      { key: 'selector', label: '目标规则', type: 'object',
        description: '阵营/策略/数量',
        objectTemplate: { faction: 'enemy', strategy: 'first', count: 1 } },
      { key: 'steps', label: '步骤编排', type: 'array', description: '技能步骤类型 + 伤害/效果参数', searchable: true,
        arrayTemplate: [
          { type: 'deal_damage', attackType: 'normal', calculation: { baseValue: 0, extraValues: [{ ratio: 0.8, attribute: 'attack' }] } },
          { type: 'apply_buff', duration: 1, effectId: 'buff_xxx', calculation: { baseValue: 0.3, extraValues: [] } },
        ] },
    ],
    uniqueFields: ['name'],
    filters: [
      { key: 'skillType', label: '类型', type: 'select', options: ['small', 'ultimate', 'passive'] },
      { key: 'energyCost', label: '能量消耗', type: 'range', min: 0, max: 200 },
    ],
  },
  buffs: {
    table: 'buffs',
    label: '状态与 Buff',
    columns: ['name', 'polarity', 'category', 'duration'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'polarity', label: '极性', type: 'select', enum: ['positive', 'negative'], column: { tagKind: 'polarity' }, searchable: true,
        valueLabel: { positive: '增益', negative: '减益' } },
      { key: 'category', label: '类别', type: 'select', enum: ['attribute', 'aura', 'dot', 'hot', 'shield', 'control', 'immunity', 'trigger'], column: { tagKind: 'category' }, searchable: true,
        valueLabel: { attribute: '属性', aura: '光环', dot: '持续伤害', hot: '持续治疗', shield: '护盾', control: '控制', immunity: '免疫', trigger: '触发' } },
      { key: 'duration', label: '持续回合', type: 'number', min: -1, max: 99, description: '-1 为永久', column: { format: 'number' } },
      { key: 'maxStacks', label: '最大叠加', type: 'number', min: 1, max: 99 },
      { key: 'stackRule', label: '叠加规则', type: 'select', enum: ['replace', 'stack', 'independent'],
        valueLabel: { replace: '替换', stack: '叠加', independent: '独立' } },
      { key: 'effects', label: '效果列表', type: 'array', searchable: true,
        description: '原子效果类型 + params（modifier/aura/...）',
        arrayTemplate: [
          { type: 'modifier', params: { attributes: { attack: { value: 10, type: 'PERCENTAGE' } }, perStack: true } },
        ] },
      { key: 'chain', label: '效果链', type: 'array' },
      { key: 'description', label: '描述', type: 'text', searchable: true },
    ],
    uniqueFields: ['name'],
    filters: [
      { key: 'polarity', label: '极性', type: 'select', options: ['positive', 'negative'] },
      { key: 'category', label: '类别', type: 'select', options: ['attribute', 'aura', 'dot', 'hot', 'shield', 'control', 'immunity', 'trigger'] },
    ],
  },
  enemies: {
    table: 'enemies',
    label: '敌人',
    columns: ['name', 'role', 'level', 'skills'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'role', label: '品阶', type: 'select', enum: ['normal', 'elite', 'yaotu', 'yaokui', 'yaowang', 'yaozun'], column: { tagKind: 'rank' }, searchable: true,
        description: '小妖/yaobing/妖徒/妖魁/妖王/妖尊',
        valueLabel: { normal: '小妖', elite: 'yaobing', yaotu: '妖徒', yaokui: '妖魁', yaowang: '妖王', yaozun: '妖尊' },
      },
      { key: 'level', label: '等级', type: 'number', required: true, min: 1, max: 99, column: { format: 'number' } },
      { key: 'stats', label: '属性', type: 'map' },
      { key: 'skills', label: '技能组', type: 'object', searchable: true,
        description: 'small/passive/ultimate 技能 ID 数组',
        objectTemplate: { small: ['skill_xxx'], passive: [], ultimate: [] } },
      { key: 'drops', label: '掉落', type: 'array', description: '掉落物 + 数量 + 概率', searchable: true,
        arrayTemplate: [{ itemId: 'mat_taomu', quantity: 1, chance: 0.5 }] },
    ],
    uniqueFields: ['name'],
    filters: [
      {
        key: 'role', label: '品阶', type: 'select',
        options: ['normal', 'elite', 'yaotu', 'yaokui', 'yaowang', 'yaozun'],
        labelMap: {
          normal: '小妖',
          yaobing: '妖兵',
          yaotu: '妖徒',
          yaokui: '妖魁',
          yaowang: '妖王',
          yaozun: '妖尊',
        },
      },
      { key: 'level', label: '等级', type: 'range', min: 1, max: 99 },
      { key: 'sceneId', label: '场景', type: 'select', refTable: 'scenes' },
    ],
  },
  scenes: {
    table: 'scenes',
    label: '场景',
    columns: ['name'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'background', label: '背景描述', type: 'text', searchable: true },
      { key: 'regionId', label: '区域', type: 'text', searchable: true },
      { key: 'levelRange', label: '等级范围', type: 'array',
        description: '[min, max]',
        arrayTemplate: [1, 99] },
      { key: 'enemies', label: '普通敌人', type: 'array', searchable: true,
        description: '敌人 id（引用 enemies 表）',
        arrayTemplate: [{ id: 'enemy_s1_1_a', name: '花妖幼芽', level: 1 }] },
      { key: 'yaotu', label: '守护者', type: 'object',
        description: '守护者敌人 id（引用 enemies 表）',
        objectTemplate: { id: 'enemy_s1_1_g', name: '桃林守卫', level: 2 } },
      { key: 'drops', label: '掉落配置', type: 'object',
        description: '材料 / 金币区间 / 经验区间',
        objectTemplate: { materials: ['mat_taomu'], gold: [10, 30], exp: [15, 25] } },
      { key: 'unlockCondition', label: '解锁条件', type: 'object',
        description: 'clear_scene=通关前置关卡 / clear_boss=击败 BOSS',
        objectTemplate: { type: 'clear_scene', sceneId: 'scene_1_1' } },
      { key: 'fieldEffects', label: '地形效果', type: 'array',
        description: '地形 modifier：对指定阵营属性修正',
        arrayTemplate: [
          { id: 'field_xxx', name: '地形效果', description: '描述', type: 'modifier', duration: -1, faction: 'all', modifiers: [{ attribute: 'speed', value: 10, type: 'PERCENTAGE' }] },
        ] },
    ],
    uniqueFields: ['name'],
  },
  formations: {
    table: 'formations',
    label: '阵型',
    columns: ['name', 'maxSlots'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'maxSlots', label: '最大站位', type: 'number', min: 1, max: 8, column: { format: 'number' } },
      { key: 'slots', label: '站位布局', type: 'array',
        description: '站位 index + 排位（front/back）',
        arrayTemplate: [{ index: 0, row: 'front' }, { index: 1, row: 'back' }] },
      { key: 'effects', label: '阵型增益', type: 'array',
        description: '条件 + 绑定的阵型 Buff',
        arrayTemplate: [{ id: 'front_def', condition: 'front', buffId: 'buff_xxx' }] },
      { key: 'frontProtection', label: '前排保护', type: 'boolean' },
      { key: 'description', label: '描述', type: 'text', searchable: true },
    ],
    uniqueFields: ['name'],
  },
  lineups: {
    table: 'lineups',
    label: '预设阵容',
    columns: ['name', 'formationId', 'tags'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'formationId', label: '绑定阵型', type: 'select', refTable: 'formations' },
      { key: 'roles', label: '角色编组', type: 'array',
        description: '站位序号 + 角色/敌人 ID',
        arrayTemplate: [{ seatIndex: 0, roleId: 'yaotu_fire' }] },
      { key: 'tags', label: '用途标签', type: 'multi', searchable: true },
      { key: 'description', label: '用途说明', type: 'text', searchable: true },
    ],
    uniqueFields: ['name'],
  },
  materials: {
    table: 'materials',
    label: '材料',
    columns: ['name', 'type', 'rarity', 'usage'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'type', label: '类型', type: 'select', enum: ['木材', '矿石', '金属', '玉石', '水产', '皮革', '织物', '陶瓷', '古董', '液体', '毒物', '灵气', '晶球', '碎片', '货币', '草药', '药引', '种子'], column: { tagKind: 'type' }, searchable: true },
      { key: 'rarity', label: '稀有度', type: 'number', min: 1, max: 5, column: { format: 'number' } },
      { key: 'effects', label: '使用效果', type: 'array',
        description: '效果类型 + 数值（heal/buff/...）',
        arrayTemplate: [{ type: 'heal', value: 50 }] },
      { key: 'usage', label: '用途', type: 'text', searchable: true },
      { key: 'description', label: '描述', type: 'text', searchable: true },
    ],
    uniqueFields: ['name'],
    filters: [
      { key: 'type', label: '类型', type: 'select', options: ['木材', '矿石', '金属', '玉石', '水产', '皮革', '织物', '陶瓷', '古董', '液体', '毒物', '灵气', '晶球', '碎片', '货币', '草药', '药引', '种子'] },
      { key: 'rarity', label: '稀有度', type: 'range', min: 1, max: 5 },
    ],
  },
  equipment: {
    table: 'equipment',
    label: '装备',
    columns: ['name', 'slot', 'rarity', 'requiredLevel'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'slot', label: '部位', type: 'select', enum: ['weapon', 'armor', 'helmet', 'boots', 'charm', 'ring'], column: { tagKind: 'slot' }, searchable: true,
        valueLabel: { weapon: '武器', armor: '衣服', helmet: '头盔', boots: '靴子', charm: '护符', ring: '戒指' } },
      { key: 'rarity', label: '稀有度', type: 'number', min: 1, max: 5, column: { format: 'number' } },
      { key: 'stats', label: '属性加成', type: 'array',
        description: '属性 + 修正类型（flat/percent）+ 数值',
        arrayTemplate: [{ attribute: 'attack', modifierType: 'flat', value: 10 }] },
      { key: 'requiredLevel', label: '穿戴等级门槛', type: 'number', min: 1, max: 99, column: { format: 'number' } },
      { key: 'factionRestriction', label: '阵营限制', type: 'select', refTable: 'elements' },
      { key: 'description', label: '描述', type: 'text', searchable: true },
    ],
    uniqueFields: ['name'],
    filters: [
      { key: 'slot', label: '部位', type: 'select', options: ['weapon', 'armor', 'helmet', 'boots', 'charm', 'ring'] },
      { key: 'rarity', label: '稀有度', type: 'range', min: 1, max: 5 },
    ],
  },
  elements: {
    table: 'elements',
    label: '阵营元素',
    columns: ['name'],
    fields: [
      { key: 'elements', label: '元素定义', type: 'array', searchable: true,
        description: '元素 id + 名称',
        arrayTemplate: [{ id: 'fire', name: '火' }] },
      { key: 'matrix', label: '克制矩阵', type: 'array', searchable: true,
        description: '攻击方 → 防御方 伤害系数',
        arrayTemplate: [{ attackerId: 'fire', defenderId: 'wood', coefficient: 1.5 }] },
      { key: 'defaultCoefficient', label: '默认系数', type: 'number', min: 0.5, max: 3 },
    ],
  },
  growth: {
    table: 'growth',
    label: '成长曲线',
    columns: ['name'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'perLevel', label: '每级增量', type: 'map' },
      { key: 'expTable', label: '经验表', type: 'array',
        description: '等级 + 所需经验',
        arrayTemplate: [{ level: 2, expRequired: 100 }] },
    ],
    uniqueFields: ['name'],
  },
  affixes: {
    table: 'affixes',
    label: '词缀',
    columns: ['name', 'tier', 'target', 'rarity'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'tier', label: '档位', type: 'select', enum: ['yao_1', 'yao_2', 'yao_3', 'yao_4', 'mandate', 'jie'], column: { tagKind: 'neutral' }, searchable: true,
        valueLabel: { yao_1: '一档·妖气', yao_2: '二档·妖性', yao_3: '三档·妖道', yao_4: '四档·妖圣', mandate: '天命', jie: '劫数' } },
      { key: 'target', label: '作用目标', type: 'select', enum: ['player', 'enemy'], column: { tagKind: 'neutral' }, searchable: true,
        valueLabel: { player: '玩家', enemy: '敌人' } },
      { key: 'rarity', label: '稀有度', type: 'number', min: 1, max: 5, column: { format: 'number' } },
      { key: 'statModifiers', label: '属性修正', type: 'array',
        description: '属性 + 修正百分比（20=+20%，-20=-20%）',
        arrayTemplate: [{ attribute: 'attack', percent: -20 }] },
      { key: 'conflict_group', label: '冲突组', type: 'select', enum: ['wuxing_single', 'wuxing_all'],
        valueLabel: { wuxing_single: '五行单体', wuxing_all: '五行全抗' } },
      { key: 'description', label: '描述', type: 'text', searchable: true },
      { key: 'drop_hint', label: '掉落倾向', type: 'text' },
    ],
    uniqueFields: ['name'],
    filters: [
      { key: 'tier', label: '档位', type: 'select', options: ['yao_1', 'yao_2', 'yao_3', 'yao_4', 'mandate', 'jie'] },
      { key: 'target', label: '作用目标', type: 'select', options: ['player', 'enemy'] },
    ],
  },
  equipment_affixes: {
    table: 'equipment_affixes',
    label: '装备词条',
    columns: ['name', 'attribute', 'modifierType', 'school', 'rarity'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'attribute', label: '属性', type: 'text', required: true, searchable: true,
        description: '属性代码（必须存在于 attributes.json，强校验）' },
      { key: 'modifierType', label: '修正类型', type: 'select', enum: ['flat', 'percent'], column: { tagKind: 'neutral' }, searchable: true,
        valueLabel: { flat: '固定值', percent: '百分比' } },
      { key: 'valueRange', label: '数值区间', type: 'object', required: true,
        description: '{ min, max }——掉落/洗炼在该区间随机，缺失或 min>max 被拦截',
        objectTemplate: { min: 5, max: 15 } },
      { key: 'applicableSlots', label: '适用部位', type: 'array', required: true, searchable: true,
        description: "slotKey 数组：'*' 通配 / 'weapon' 部位 / 'weapon:轻型' 部位+子类型",
        arrayTemplate: ['weapon:轻型', 'ring:戒指'] },
      { key: 'school', label: '流派绑定', type: 'text', searchable: true,
        description: 'schools.json 流派名（如 金行道）；缺省为通用词条' },
      { key: 'weight', label: '抽池权重', type: 'number', required: true, min: 0, max: 99999, column: { format: 'number' },
        description: '0 = 不参与随机（如限定时装词条）' },
      { key: 'rarity', label: '稀有度', type: 'number', min: 1, max: 5, column: { format: 'number' } },
      { key: 'description', label: '描述', type: 'text', searchable: true },
    ],
    uniqueFields: ['name'],
    filters: [
      { key: 'modifierType', label: '修正类型', type: 'select', options: ['flat', 'percent'] },
      { key: 'rarity', label: '稀有度', type: 'range', min: 1, max: 5 },
    ],
  },
  params: {
    table: 'params',
    label: '战斗规则参数',
    columns: ['name', 'value', 'description'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'value', label: '当前值', type: 'number', column: { format: 'number' },
        description: '简单数字参数（如每回合能量）；结构化参数（exp_table 等）不填，见 data' },
      { key: 'range', label: '合法范围', type: 'object',
        description: '{ min, max }——越界保存被拦截（仅数字参数）',
        objectTemplate: { min: 0, max: 9999 } },
      { key: 'data', label: '结构化数据', type: 'object',
        description: '经验/金钱表（exp_table / enemy_reward_table / level_diff_bonus）的复杂配置；数字参数不填',
        objectTemplate: { maxLevel: 50, entries: [{ level: 1, expRequired: 300 }] } },
      { key: 'description', label: '用途说明', type: 'text', searchable: true },
    ],
  },
  xiyou: {
    table: 'xiyou',
    label: '西游数据',
    columns: ['name', 'description'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'description', label: '说明', type: 'text', searchable: true },
      { key: 'data', label: '数据（JSON）', type: 'object', required: true,
        description: 'configs/xiyou/*.json 原始配置；演劫台经 GameDataApi 读取',
        objectTemplate: { key: 'value' } },
    ],
  },
  items: {
    table: 'items',
    label: '物品',
    columns: ['name', 'type', 'rarity', 'usage'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'type', label: '类型', type: 'select',
        enum: ['木材', '矿石', '金属', '玉石', '水产', '皮革', '织物', '陶瓷', '古董', '液体', '毒物', '特殊材料', 'BOSS材料', '灵气', '碎片', '货币', '晶球', '丹药', '永久丹药', '图纸', '强化', '升星', '精锻', '洗炼', '重铸', '传承', '分解', '符箓', '突破', '技能书', '经验', '杂物', '钥匙', '门票', '任务', '器灵', '套装烙印', '武器', '衣服', '饰品', '草药', '药引', '种子', '制造辅助', '法宝', '神器', '经验丹', '卷轴', '功能道具', '宝箱'],
        column: { tagKind: 'type' }, searchable: true },
      { key: 'rarity', label: '稀有度', type: 'number', min: 1, max: 5, column: { format: 'number' } },
      { key: 'value', label: '实际价值', type: 'number', min: 0, max: 999999, column: { format: 'number' },
        description: '物品实际价值（铜钱口径）；出售价 / 坊市购买价 = 价值 × 全局系数（params 域 economy_ratios）' },
      { key: 'source', label: '来源', type: 'text', searchable: true },
      { key: 'usage', label: '用途', type: 'text', searchable: true },
      { key: 'description', label: '描述', type: 'text', searchable: true },
    ],
    filters: [
      { key: 'type', label: '类型', type: 'select', options: ['木材', '矿石', '金属', '玉石', '水产', '皮革', '织物', '陶瓷', '古董', '液体', '毒物', '特殊材料', 'BOSS材料', '灵气', '碎片', '货币', '晶球', '丹药', '永久丹药', '图纸', '强化', '升星', '精锻', '洗炼', '重铸', '传承', '分解', '符箓', '突破', '技能书', '经验', '杂物', '钥匙', '门票', '任务', '器灵', '套装烙印', '武器', '衣服', '饰品', '草药', '药引', '种子', '制造辅助', '法宝', '神器', '经验丹', '卷轴', '功能道具', '宝箱'] },
      { key: 'rarity', label: '稀有度', type: 'range', min: 1, max: 5 },
    ],
  },
  gears: {
    table: 'gears',
    label: '装备详情',
    columns: ['name', 'slot', 'tier', 'rarity', 'cost'],
    fields: [
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'slot', label: '部位', type: 'select', enum: ['weapon', 'armor', 'helmet', 'boots', 'charm', 'ring'], column: { tagKind: 'slot' }, searchable: true,
        valueLabel: { weapon: '武器', armor: '衣服', helmet: '头盔', boots: '靴子', charm: '护符', ring: '戒指' } },
      { key: 'subType', label: '子类型', type: 'text', searchable: true },
      { key: 'tier', label: '阶位', type: 'select', enum: ['t1', 't2', 't3', 't4', 't5'], column: { tagKind: 'neutral' }, searchable: true,
        valueLabel: { t1: '一阶', t2: '二阶', t3: '三阶', t4: '四阶', t5: '五阶' } },
      { key: 'rarity', label: '稀有度', type: 'number', min: 1, max: 5, column: { format: 'number' } },
      { key: 'requiredLevel', label: '穿戴等级门槛', type: 'number', min: 1, max: 99, column: { format: 'number' } },
      { key: 'cost', label: '制造金钱', type: 'number', min: 0, max: 999999, column: { format: 'number' } },
      { key: 'stats', label: '属性加成', type: 'array',
        description: '属性 + 修正类型（flat/percent）+ 数值',
        arrayTemplate: [{ attribute: 'attack', modifierType: 'flat', value: 10 }] },
      { key: 'materials', label: '制造材料', type: 'array',
        description: '材料 itemId（引用 items 表）+ 数量',
        arrayTemplate: [{ itemId: 'mat_taomu', count: 3 }] },
      { key: 'source', label: '来源', type: 'text', searchable: true },
      { key: 'description', label: '描述', type: 'text', searchable: true },
    ],
    uniqueFields: ['name'],
    filters: [
      { key: 'slot', label: '部位', type: 'select', options: ['weapon', 'armor', 'helmet', 'boots', 'charm', 'ring'] },
      { key: 'tier', label: '阶位', type: 'select', options: ['t1', 't2', 't3', 't4', 't5'] },
      { key: 'rarity', label: '稀有度', type: 'range', min: 1, max: 5 },
    ],
  },
}

/**
 * 按路径提取实体的引用值（字符串或字符串数组，`[]` 遍历数组元素）。
 * 供 DataIntegrityService 保存校验 / 删除保护 / 健康检查共用。
 */
export function extractReferenceIds(entity: Record<string, unknown>, path: string): string[] {
  const out: string[] = []
  collect(entity, path.split('.'), 0, out)
  return out
}

function collect(value: unknown, segments: string[], idx: number, out: string[]): void {
  if (value == null) return
  if (idx >= segments.length) {
    pushScalar(value, out)
    return
  }
  let seg = segments[idx]
  let arrayTraverse = false
  if (seg.endsWith('[]')) {
    seg = seg.slice(0, -2)
    arrayTraverse = true
  }
  const node = (value as Record<string, unknown>)[seg]
  if (arrayTraverse && Array.isArray(node)) {
    for (const item of node) collect(item, segments, idx + 1, out)
  } else {
    collect(node, segments, idx + 1, out)
  }
}

function pushScalar(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const v of value) pushScalar(v, out)
  } else if (typeof value === 'string' && value.trim()) {
    out.push(value.trim())
  }
}

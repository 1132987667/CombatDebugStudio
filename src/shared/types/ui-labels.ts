/**
 * 文件: ui-labels.ts
 * 功能: 界面显示文案常量集中地
 * 描述: 收纳跨文件复用的枚举→中文表之外的「一次性显示文案」。
 *
 * NOTE: 当前消费者仅 LogTooltipResolver 一个。此处集中是为「日后出现第二个消费者时好复用」，
 *       不是去重表——schema 的表单字段 label、EDP 的 JSON 键译名虽有个别同字词（属性/类型/法力消耗），
 *       但属不同概念，勿并入本表以免制造假耦合。
 */

/** 明细行标签 */
export const ROW = {
  scope: '生效范围',
  attribute: '属性',
  triggerPhase: '触发时机',
  triggerChance: '触发概率',
  effect: '效果',
  type: '类型',
  immunityList: '免疫列表',
  energyCost: '法力消耗',
  cooldown: '冷却',
  targetCount: '目标数',
} as const

/** 类别效果描述值（区别于 StatusCategoryNames 的类别名，此处描述具体作用） */
export const ROW_VALUE = {
  uncontrollable: '无法行动',
  shieldAbsorb: '护盾吸收',
} as const

/** 光环 targetSelector 配置值 */
export const AuraTargetSelector = {
  SELF: 'self',
  ALLIES: 'allies',
  ENEMIES: 'enemies',
} as const

/** targetSelector → 作用范围文案 */
export const AURA_SCOPE_LABEL: Record<string, string> = {
  [AuraTargetSelector.SELF]: '自身',
  [AuraTargetSelector.ALLIES]: '全体友方',
  [AuraTargetSelector.ENEMIES]: '全体敌方',
}

/** 兜底 / 通用文案 */
export const TEXT = {
  notFound: '未找到配置',
  unknown: '未知',
  skill: '技能',
  permanent: '永久',
} as const

export const UNIT_ROUND = '回合'
export const COOLDOWN_SUFFIX = '冷却'
export const SOURCE_PREFIX = '来源：'
/** buff 持续时长哨兵：-1 = 永久 */
export const DURATION_PERMANENT = -1

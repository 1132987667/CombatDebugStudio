/**
 * 战斗日志条目类型枚举
 */
export type BattleLogType = 'system' | '普通攻击' | '小技能' | '大技能'

/**
 * 战斗日志条目
 * 记录战斗过程中的所有事件信息，用于在界面上展示战斗过程
 */
export interface BattleLogEntry {
  /** 回合号，如 '回合1' 或 '回合开始' */
  turn: string
  /** 行动类型：system-系统消息，普通攻击-普通攻击，小技能-普通技能，大技能-终极技能 */
  type: BattleLogType
  /** 行动结果描述（完整HTML格式，用于富文本渲染） */
  htmlResult: string
  /** 日志级别，用于UI展示和过滤 */
  level: string
  /** 是否命中（仅普通攻击有效） */
  isHit?: boolean
  /** 是否暴击（仅普通攻击有效） */
  isCrit?: boolean
  /** 技能名称（仅小技能和大技能有效） */
  skillName?: string
  /** 附加效果列表，如暴击、状态等详细信息 */
  subEffects?: string[]
}

/**
 * 日志过滤器配置
 * 控制各类战斗日志在界面上的显示状态
 */
export interface LogFilters {
  /** 是否显示伤害类日志 */
  damage: boolean
  /** 是否显示状态类日志（增益、减益、控制等） */
  status: boolean
  /** 是否显示暴击类日志 */
  crit: boolean
  /** 是否显示治疗类日志 */
  heal: boolean
}

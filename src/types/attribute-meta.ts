/**
 * 文件: attribute-meta.ts
 * 创建日期: 2026-02-19
 * 作者: CombatDebugStudio
 * 功能: 属性元数据定义
 * 描述: 统一管理角色属性的完整信息，包括属性名称、详细介绍、数值范围、图标路径等元数据
 * 版本: 1.0.0
 */

/**
 * 属性元数据接口
 * 定义属性的完整信息
 */
export interface AttributeMeta {
  /** 属性编码 */
  code: string
  /** 属性名称 */
  name: string
  /** 属性详细介绍 */
  description: string
  /** 数值范围描述 */
  range: string
  /** 图标路径（可选） */
  iconPath?: string
  /** 对游戏体验的影响 */
  impact: string
  /** 是否为百分比属性 */
  isPercentage: boolean
}

/**
 * 属性元数据映射
 * 存储所有属性的元数据信息
 */
export const AttributeMetaMap: Record<string, AttributeMeta> = {
  // 基础属性
  level: {
    code: 'level',
    name: '等级',
    description: '角色的等级',
    range: '1-99',
    impact: '影响角色基础属性值和技能解锁',
    isPercentage: false
  },
  name: {
    code: 'name',
    name: '名称',
    description: '角色的名字',
    range: '-',
    impact: '用于识别和区分不同角色',
    isPercentage: false
  },
  currentEnergy: {
    code: 'currentEnergy',
    name: '能量',
    description: '角色当前能量值',
    range: '0-100',
    impact: '用于施放技能，影响技能释放频率，初始值为25',
    isPercentage: false
  },
  currentHp: {
    code: 'currentHp',
    name: '气血',
    description: '角色当前生命值',
    range: '0-最大值',
    impact: '直接影响角色生存能力，为0时角色死亡',
    isPercentage: false
  },
  minAttack: {
    code: 'minAttack',
    name: '最小攻击',
    description: '角色最小攻击伤害',
    range: '1-9999',
    impact: '直接影响伤害输出下限',
    isPercentage: false
  },
  maxAttack: {
    code: 'maxAttack',
    name: '最大攻击',
    description: '角色最大攻击伤害',
    range: '1-9999',
    impact: '直接影响伤害输出上限',
    isPercentage: false
  },
  defense: {
    code: 'defense',
    name: '防御',
    description: '角色抵抗伤害的能力',
    range: '0-9999',
    impact: '减少受到的伤害，值越高减伤越多',
    isPercentage: false
  },
  speed: {
    code: 'speed',
    name: '速度',
    description: '角色行动顺序的决定因素',
    range: '1-9999',
    impact: '速度越高，行动顺序越靠前，回合内行动次数可能增加',
    isPercentage: false
  },
  critRate: {
    code: 'critRate',
    name: '暴击率',
    description: '攻击产生暴击的概率',
    range: '0-100%',
    impact: '提高暴击触发几率，增加伤害爆发能力，默认为10%',
    isPercentage: true
  },
  critDamage: {
    code: 'critDamage',
    name: '暴击伤害',
    description: '暴击时的伤害倍率',
    range: '100-500%',
    impact: '暴击时造成的额外伤害，值越高暴击伤害越高，默认125%',
    isPercentage: true
  },
  damageReduction: {
    code: 'damageReduction',
    name: '免伤率',
    description: '受到伤害的减免比例',
    range: '0-100%',
    impact: '减少受到的所有伤害',
    isPercentage: true
  },
  // 属性加成
  healthBonus: {
    code: 'healthBonus',
    name: '气血加成',
    description: '气血加成百分比',
    range: '0-500%',
    impact: '提高角色气血上限，增强生存能力',
    isPercentage: true
  },
  attackBonus: {
    code: 'attackBonus',
    name: '攻击加成',
    description: '攻击加成百分比',
    range: '0-500%',
    impact: '提高角色攻击力，增强伤害输出',
    isPercentage: true
  },
  defenseBonus: {
    code: 'defenseBonus',
    name: '防御加成',
    description: '防御加成百分比',
    range: '0-500%',
    impact: '提高角色防御力，增强生存能力',
    isPercentage: true
  },
  speedBonus: {
    code: 'speedBonus',
    name: '速度加成',
    description: '速度加成百分比',
    range: '0-500%',
    impact: '提高角色速度，增强行动能力',
    isPercentage: true
  }
}

/**
 * 根据属性编码获取属性元数据
 * @param code 属性编码
 * @returns 属性元数据
 */
export const getAttributeMeta = (code: string): AttributeMeta | undefined => {
  return AttributeMetaMap[code]
}

/**
 * 根据属性名称获取属性编码
 * @param name 属性名称
 * @returns 属性编码
 */
export const getAttributeCodeByName = (name: string): string | undefined => {
  return Object.entries(AttributeMetaMap)
    .find(([_, meta]) => meta.name === name)
    ?.[0]
}

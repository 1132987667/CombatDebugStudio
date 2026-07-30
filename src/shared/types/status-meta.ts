/**
 * 文件: status-meta.ts
 * 功能: 战斗状态元数据定义
 * 描述: 为所有战斗状态提供分类、机制说明、玩家描述等元数据，
 *       供 UI 展示、Tooltip 渲染、日志着色、调试面板使用。
 */

// ==================== 状态代码常量 ====================

// ==================== 状态分类 ====================
export const StatusCategory = {
  /** 控制类：限制或改变目标行动能力 */
  CONTROL: 'control',
  /** 持续效果类：每回合自动结算的伤害 */
  DOT: 'dot',
  /** 持续效果类：每回合自动结算的治疗 */
  HOT: 'hot',
  /** 防御类：吸收伤害的护盾 */
  SHIELD: 'shield',
  /** 光环类：影响范围内队友/敌人的被动效果 */
  AURA: 'aura',
  /** 免疫类：使目标免疫特定效果 */
  IMMUNITY: 'immunity',
  /** 触发类：在特定条件下触发的状态效果 */
  TRIGGER: 'trigger',
  /** 增减益类：修改目标属性或行为规则 */
  MODIFIER: 'modifier',
  /** 动作类：触发一次性战斗行为（如召唤、净化、复活） */
  ACTION: 'action',
  OTHER: 'other',
} as const
export type StatusCategory =
  (typeof StatusCategory)[keyof typeof StatusCategory]

export const StatusCategoryNames: Record<StatusCategory, string> = {
  [StatusCategory.CONTROL]: '控制',
  [StatusCategory.DOT]: '持续伤害',
  [StatusCategory.HOT]: '持续治疗',
  [StatusCategory.SHIELD]: '护盾',
  [StatusCategory.AURA]: '光环',
  [StatusCategory.IMMUNITY]: '免疫',
  [StatusCategory.TRIGGER]: '触发',
  [StatusCategory.MODIFIER]: '属性',
  [StatusCategory.ACTION]: '动作',
  [StatusCategory.OTHER]: '其他',
}

export const STATUS_CODE = {
  // ── 控制类 ──
  STUN: 'stun',
  SILENCE: 'silence',
  FREEZE: 'freeze',
  SLEEP: 'sleep',
  BIND: 'bind',
  CONFUSION: 'confusion',
  FEAR: 'fear',
  CHARM: 'charm',
  TAUNT: 'taunt',
  PETRIFY: 'petrify',
  IMMOBILIZE: 'immobilize',
  DISARM: 'disarm',
  POLYMORPH: 'polymorph',
  IMPRISON: 'imprison',
  GUIXU: 'guixu',
  // ── 持续伤害/治疗类 ──
  DOT: 'dot',
  HEAL: 'heal',
  BLEED: 'bleed',
  FROSTBITE: 'frostbite',
  BURN: 'burn',
  POISON: 'poison',
  DRAIN: 'drain',
  REFLECT: 'reflect',
  // ── 防御类 ──
  SHIELD: 'shield',
  // ── 增益/减益类 ──
  BUFF: 'buff',
  DEBUFF: 'debuff',
  HEAL_REDUCTION: 'heal_reduction',
  // ── 动作类 ──
  DEAL_DAMAGE: 'deal_damage',
  KNOCKBACK: 'knockback',
  PULL: 'pull',
  TELEPORT: 'teleport',
  SUMMON: 'summon',
  TRANSFORM: 'transform',
  REVIVE: 'revive',
  CLEANSE: 'cleanse',
  DISPEL: 'dispel',
  AURA: 'aura',
} as const

export type StatusCode = (typeof STATUS_CODE)[keyof typeof STATUS_CODE]

// ==================== 元数据接口 ====================

export interface StatusMeta {
  /** 状态代码（唯一标识） */
  code: StatusCode
  /** 所属分类 */
  category: StatusCategory
  /** 内部名称（开发/日志用） */
  name: string
  /** 玩家可见的简短描述（Tooltip 标题下方一行） */
  playerDescription: string
  /** 机制说明（调试面板 / 详细 Tooltip 展开后显示） */
  mechanicDescription: string
  /** 是否为负面效果（决定 UI 颜色：红/绿） */
  isNegative: boolean
  /** 是否可被净化（cleanse）移除 */
  cleanseable: boolean
  /** 是否可被驱散（dispel）移除 */
  dispellable: boolean
  /** 是否可叠加多层 */
  stackable: boolean
  /** 默认持续回合数（-1 = 永久，0 = 即时） */
  defaultDuration: number
  /** 控制优先级（仅控制类有效；同目标多个控制共存时，高优先级生效） */
  controlPriority?: number
  /** 是否阻止行动（仅控制类：true = 完全跳过回合） */
  blocksAction?: boolean
  /** 是否阻止技能（仅控制类：true = 无法释放技能但可普攻） */
  blocksSkill?: boolean
}

// ==================== 元数据表 ====================

export const STATUS_META: Record<StatusCode, StatusMeta> = {
  // ═══════════════════════════════════════════
  // 控制类
  // ═══════════════════════════════════════════
  [STATUS_CODE.STUN]: {
    code: STATUS_CODE.STUN,
    category: StatusCategory.CONTROL,
    name: '眩晕',
    playerDescription: '无法进行任何行动，回合被跳过。',
    mechanicDescription:
      '目标在持续期间完全无法行动（普攻、技能、物品均不可用）。' +
      '回合开始时检查，若仍处于眩晕则跳过整个行动阶段。' +
      '受击不会提前解除。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 1,
    controlPriority: 100,
    blocksAction: true,
    blocksSkill: true,
  },

  [STATUS_CODE.SILENCE]: {
    code: STATUS_CODE.SILENCE,
    category: StatusCategory.CONTROL,
    name: '沉默',
    playerDescription: '无法使用技能，但仍可进行普通攻击。',
    mechanicDescription:
      '目标在持续期间无法释放任何主动技能（小技能/终极技能），' +
      '但普通攻击不受影响。被动技能仍正常触发。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 2,
    controlPriority: 50,
    blocksAction: false,
    blocksSkill: true,
  },

  [STATUS_CODE.FREEZE]: {
    code: STATUS_CODE.FREEZE,
    category: StatusCategory.CONTROL,
    name: '冰冻',
    playerDescription: '无法行动，受到攻击时解除。',
    mechanicDescription:
      '目标完全无法行动。与眩晕不同的是，' +
      '受到任何伤害（含 DOT）时立即解除冰冻状态。' +
      '解除时不触发额外效果。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 2,
    controlPriority: 90,
    blocksAction: true,
    blocksSkill: true,
  },

  [STATUS_CODE.SLEEP]: {
    code: STATUS_CODE.SLEEP,
    category: StatusCategory.CONTROL,
    name: '睡眠',
    playerDescription: '无法行动，受到攻击时解除并额外承受 20% 伤害。',
    mechanicDescription:
      '目标完全无法行动。受到任何伤害时解除睡眠，' +
      '且该次伤害额外增加 20%（乘算）。' +
      'DOT 伤害同样会唤醒目标。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 2,
    controlPriority: 80,
    blocksAction: true,
    blocksSkill: true,
  },

  [STATUS_CODE.BIND]: {
    code: STATUS_CODE.BIND,
    category: StatusCategory.CONTROL,
    name: '束缚',
    playerDescription: '无法行动，但受到伤害不会提前解除。',
    mechanicDescription:
      '目标完全无法行动，与眩晕类似但优先级更低。' +
      '受击不会解除。通常由物理系控制技能施加。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 1,
    controlPriority: 70,
    blocksAction: true,
    blocksSkill: true,
  },

  [STATUS_CODE.CONFUSION]: {
    code: STATUS_CODE.CONFUSION,
    category: StatusCategory.CONTROL,
    name: '混乱',
    playerDescription: '行动目标随机化，可能攻击友方。',
    mechanicDescription:
      '目标仍可行动，但目标选择被强制随机化：' +
      '从全场存活单位（含己方）中随机选取一个作为目标。' +
      '技能选择不受影响，仅目标被篡改。' +
      '若随机到自身则视为跳过行动。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 2,
    controlPriority: 40,
    blocksAction: false,
    blocksSkill: false,
  },

  [STATUS_CODE.FEAR]: {
    code: STATUS_CODE.FEAR,
    category: StatusCategory.CONTROL,
    name: '恐惧',
    playerDescription: '无法主动攻击，只能跳过行动。',
    mechanicDescription:
      '目标无法选择任何敌方单位作为攻击/技能目标，' +
      '行动阶段强制跳过（等同于被控制）。' +
      '与眩晕的区别：恐惧可被「免疫控制」以外的方式解除（如队友净化），' +
      '且恐惧期间仍可触发被动技能。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 1,
    controlPriority: 60,
    blocksAction: true,
    blocksSkill: true,
  },

  [STATUS_CODE.CHARM]: {
    code: STATUS_CODE.CHARM,
    category: StatusCategory.CONTROL,
    name: '魅惑',
    playerDescription: '倒戈攻击友方，无法控制自身行动。',
    mechanicDescription:
      '目标被魅惑后转为敌方阵营行动，自动攻击原友方单位。' +
      '持续期间施法者无法主动解除。受击不会解除魅惑。' +
      '某些技能/道具可抵抗魅惑效果。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 2,
    controlPriority: 75,
    blocksAction: false,
    blocksSkill: false,
  },

  [STATUS_CODE.TAUNT]: {
    code: STATUS_CODE.TAUNT,
    category: StatusCategory.CONTROL,
    name: '嘲讽',
    playerDescription: '强制攻击施法者，无法选择其他目标。',
    mechanicDescription:
      '目标在持续期间只能以施法者为攻击/技能目标，' +
      'AOE 技能以施法者所在位置为中心释放。' +
      '若施法者已死亡则嘲讽失效。目标仍可正常行动但目标受限。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 2,
    controlPriority: 35,
    blocksAction: false,
    blocksSkill: false,
  },

  [STATUS_CODE.PETRIFY]: {
    code: STATUS_CODE.PETRIFY,
    category: StatusCategory.CONTROL,
    name: '石化',
    playerDescription: '完全无法行动，同时获得 50% 伤害减免。',
    mechanicDescription:
      '目标完全无法行动（普攻、技能均不可用）。' +
      '同时获得 50% 全伤害减免。' +
      '受击不会提前解除石化。石化结束时伤害减免同时消失。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 2,
    controlPriority: 95,
    blocksAction: true,
    blocksSkill: true,
  },

  [STATUS_CODE.IMMOBILIZE]: {
    code: STATUS_CODE.IMMOBILIZE,
    category: StatusCategory.CONTROL,
    name: '定身',
    playerDescription: '无法移动和改变位置，但可正常行动。',
    mechanicDescription:
      '目标无法被任何位移效果影响（击退、拉扯、传送等均无效），' +
      '但可以正常进行攻击和释放技能。不影响目标自身的行动能力。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 2,
    controlPriority: 25,
    blocksAction: false,
    blocksSkill: false,
  },

  [STATUS_CODE.DISARM]: {
    code: STATUS_CODE.DISARM,
    category: StatusCategory.CONTROL,
    name: '缴械',
    playerDescription: '无法使用物理攻击和物理技能。',
    mechanicDescription:
      '目标无法使用任何物理类型（physical）的攻击和技能。' +
      '法术类技能不受影响。普攻若为物理类型同样被禁止。' +
      '被动技能（非主动）不受影响。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 2,
    controlPriority: 45,
    blocksAction: false,
    blocksSkill: true,
  },

  [STATUS_CODE.POLYMORPH]: {
    code: STATUS_CODE.POLYMORPH,
    category: StatusCategory.CONTROL,
    name: '变形',
    playerDescription: '变成无害小动物，无法使用任何技能。',
    mechanicDescription:
      '目标被变形为小动物，无法使用任何主动技能和普攻。' +
      '基础属性大幅降低（攻击力降为 0）。' +
      '变形期间免疫其他控制效果（高优先级覆盖）。' +
      '受击不会解除变形。变形解除后恢复原状态。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 2,
    controlPriority: 85,
    blocksAction: true,
    blocksSkill: true,
  },

  [STATUS_CODE.IMPRISON]: {
    code: STATUS_CODE.IMPRISON,
    category: StatusCategory.CONTROL,
    name: '禁锢',
    playerDescription: '无法行动且无法被选中为目标。',
    mechanicDescription:
      '目标被完全禁锢，无法进行任何行动。' +
      '同时无法被任何单位选中为目标（包括友方治疗技能）。' +
      'AOE 技能若为全屏/区域效果则仍可波及，但单体选择会跳过。' +
      '禁锢期间免疫所有伤害和控制效果。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 1,
    controlPriority: 65,
    blocksAction: true,
    blocksSkill: true,
  },

  [STATUS_CODE.GUIXU]: {
    code: STATUS_CODE.GUIXU,
    category: StatusCategory.CONTROL,
    name: '归墟',
    playerDescription: '无法被除自身以外的任何角色选为目标。',
    mechanicDescription:
      '目标进入「归墟」状态后，所有其他单位的技能/攻击目标选择' +
      '将自动跳过该单位（如同不存在）。' +
      '该单位自身仍可正常行动和选择目标。' +
      'AOE 技能若以区域为目标则不受影响（非单体选择）。' +
      '优先级最高的控制效果，不可被其他控制覆盖。',
    isNegative: false,
    cleanseable: false,
    dispellable: false,
    stackable: false,
    defaultDuration: 2,
    controlPriority: 200,
    blocksAction: false,
    blocksSkill: false,
  },

  // ═══════════════════════════════════════════
  // 持续效果类
  // ═══════════════════════════════════════════

  [STATUS_CODE.DOT]: {
    code: STATUS_CODE.DOT,
    category: StatusCategory.DOT,
    name: '持续伤害',
    playerDescription: '每回合结束时受到固定伤害。',
    mechanicDescription:
      '每回合结束时（TURN_END 阶段）对目标造成固定数值伤害。' +
      '伤害不受防御减免影响（真实伤害），但可被护盾吸收。' +
      '多层 DOT 独立结算，互不覆盖。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: true,
    defaultDuration: 3,
  },

  [STATUS_CODE.HEAL]: {
    code: STATUS_CODE.HEAL,
    category: StatusCategory.HOT,
    name: '持续治疗',
    playerDescription: '每回合结束时恢复固定气血。',
    mechanicDescription:
      '每回合结束时（TURN_END 阶段）恢复固定数值气血。' +
      '治疗量不受减治疗影响（除非特别标注）。' +
      '多层 HOT 独立结算。',
    isNegative: false,
    cleanseable: false,
    dispellable: true,
    stackable: true,
    defaultDuration: 3,
  },

  [STATUS_CODE.BLEED]: {
    code: STATUS_CODE.BLEED,
    category: StatusCategory.DOT,
    name: '出血',
    playerDescription: '每回合结束时按最大气血百分比流血。',
    mechanicDescription:
      '每回合结束时造成目标最大气血值一定百分比的伤害。' +
      '属于物理持续伤害，可被物理减免部分抵消。' +
      '可叠加，每层独立计算。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: true,
    defaultDuration: 3,
  },

  [STATUS_CODE.FROSTBITE]: {
    code: STATUS_CODE.FROSTBITE,
    category: StatusCategory.DOT,
    name: '冰息',
    playerDescription: '每回合受到冰属性伤害，并降低速度。',
    mechanicDescription:
      '每回合结束时造成冰属性伤害，同时降低目标速度属性。' +
      '速度降低为 ADDITIVE 修饰符，随层数叠加。' +
      '可被火属性技能提前解除。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: true,
    defaultDuration: 2,
  },

  [STATUS_CODE.BURN]: {
    code: STATUS_CODE.BURN,
    category: StatusCategory.DOT,
    name: '灼烧',
    playerDescription: '每回合受到火属性伤害。',
    mechanicDescription:
      '每回合结束时造成火属性伤害。' +
      '伤害基于施加者的火属性攻击力计算。' +
      '可叠加，每层独立结算。可被水属性技能净化。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: true,
    defaultDuration: 3,
  },

  [STATUS_CODE.POISON]: {
    code: STATUS_CODE.POISON,
    category: StatusCategory.DOT,
    name: '中毒',
    playerDescription: '每回合受到毒素伤害，可叠加多层。',
    mechanicDescription:
      '每回合结束时造成毒素伤害（真实伤害，无视防御）。' +
      '最多叠加 N 层（由施加技能决定），每层独立结算。' +
      '可被「毒素抗性」属性减少伤害。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: true,
    defaultDuration: 3,
  },

  [STATUS_CODE.DRAIN]: {
    code: STATUS_CODE.DRAIN,
    category: StatusCategory.TRIGGER,
    name: '吸取',
    playerDescription: '每回合被吸取气血，施加者获得等量治疗。',
    mechanicDescription:
      '每回合结束时对目标造成伤害，并将等量数值治疗施加者。' +
      '若施加者已死亡则仅造成伤害不治疗。' +
      '伤害为真实伤害，治疗不受减治疗影响。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 3,
  },

  [STATUS_CODE.REFLECT]: {
    code: STATUS_CODE.REFLECT,
    category: StatusCategory.TRIGGER,
    name: '反射',
    playerDescription: '受到攻击时将部分伤害反弹给攻击者。',
    mechanicDescription:
      '持续期间，每次受到直接伤害时将一定比例反弹给攻击者。' +
      '反弹伤害为真实伤害，不触发攻击者的受击被动。' +
      '反弹不会递归（A 反弹给 B，B 的反弹不再弹回 A）。',
    isNegative: false,
    cleanseable: false,
    dispellable: true,
    stackable: false,
    defaultDuration: 3,
  },

  // ═══════════════════════════════════════════
  // 防御类
  // ═══════════════════════════════════════════

  [STATUS_CODE.SHIELD]: {
    code: STATUS_CODE.SHIELD,
    category: StatusCategory.SHIELD,
    name: '护盾',
    playerDescription: '获得一层护盾，优先吸收受到的伤害。',
    mechanicDescription:
      '为目标附加护盾值。受到伤害时优先消耗护盾，' +
      '护盾耗尽后剩余伤害才扣除气血。' +
      '多个护盾可叠加（数值累加）。' +
      '护盾不可被治疗，回合结束不衰减（除非配置了 duration）。',
    isNegative: false,
    cleanseable: false,
    dispellable: true,
    stackable: true,
    defaultDuration: -1,
  },

  // ═══════════════════════════════════════════
  // 增减益类
  // ═══════════════════════════════════════════

  [STATUS_CODE.BUFF]: {
    code: STATUS_CODE.BUFF,
    category: StatusCategory.MODIFIER,
    name: '增益',
    playerDescription: '获得属性提升或特殊正面效果。',
    mechanicDescription:
      '通用正面状态标记。具体效果由 Buff 配置的 attributes/triggers 决定。' +
      '增益状态在 UI 中以绿色/青色显示。' +
      '可被敌方「驱散」技能移除。',
    isNegative: false,
    cleanseable: false,
    dispellable: true,
    stackable: false,
    defaultDuration: 3,
  },

  [STATUS_CODE.DEBUFF]: {
    code: STATUS_CODE.DEBUFF,
    category: StatusCategory.MODIFIER,
    name: '减益',
    playerDescription: '属性被削弱或受到特殊负面效果。',
    mechanicDescription:
      '通用负面状态标记。具体效果由 Buff 配置的 attributes/triggers 决定。' +
      '减益状态在 UI 中以紫色/红色显示。' +
      '可被己方「净化」技能移除。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 3,
  },

  [STATUS_CODE.HEAL_REDUCTION]: {
    code: STATUS_CODE.HEAL_REDUCTION,
    category: StatusCategory.MODIFIER,
    name: '减治疗',
    playerDescription: '受到的治疗效果降低。',
    mechanicDescription:
      '持续期间，目标受到的所有治疗效果按百分比削减。' +
      '例：50% 减治疗 → 原本恢复 100 气血变为恢复 50。' +
      '多层减治疗取最高值，不叠加。' +
      '不影响护盾吸收和 HOT 的原始结算（HOT 在结算时检查）。',
    isNegative: true,
    cleanseable: true,
    dispellable: true,
    stackable: false,
    defaultDuration: 2,
  },

  // ═══════════════════════════════════════════
  // 动作类
  // ═══════════════════════════════════════════

  [STATUS_CODE.DEAL_DAMAGE]: {
    code: STATUS_CODE.DEAL_DAMAGE,
    category: StatusCategory.ACTION,
    name: '造成伤害',
    playerDescription: '对目标造成一次性伤害。',
    mechanicDescription:
      '即时结算的伤害动作。伤害经过完整管线计算' +
      '（基础值 → 加成 → 暴击 → 防御减免 → 阈值钳制）。' +
      '不附加持续状态。',
    isNegative: true,
    cleanseable: false,
    dispellable: false,
    stackable: false,
    defaultDuration: 0,
  },

  [STATUS_CODE.KNOCKBACK]: {
    code: STATUS_CODE.KNOCKBACK,
    category: StatusCategory.ACTION,
    name: '击退',
    playerDescription: '将目标向后推移一个位置。',
    mechanicDescription:
      '将目标在阵型中的 seatIndex +1（向后推移）。' +
      '若已在最后排则无效。' +
      '击退不造成伤害，但可触发位置相关被动。' +
      '可被「击退抵抗」属性免疫。',
    isNegative: true,
    cleanseable: false,
    dispellable: false,
    stackable: false,
    defaultDuration: 0,
  },

  [STATUS_CODE.PULL]: {
    code: STATUS_CODE.PULL,
    category: StatusCategory.ACTION,
    name: '拉扯',
    playerDescription: '将目标向前拉近一个位置。',
    mechanicDescription:
      '将目标在阵型中的 seatIndex -1（向前拉近）。' +
      '若已在最前排则无效。' +
      '拉扯不造成伤害。可被「击退抵抗」属性免疫（共用抗性）。',
    isNegative: true,
    cleanseable: false,
    dispellable: false,
    stackable: false,
    defaultDuration: 0,
  },

  [STATUS_CODE.TELEPORT]: {
    code: STATUS_CODE.TELEPORT,
    category: StatusCategory.ACTION,
    name: '传送',
    playerDescription: '将目标传送到指定位置。',
    mechanicDescription:
      '将目标的 seatIndex 直接设为指定值。' +
      '不受位置抗性影响。' +
      '传送后触发位置变更事件。',
    isNegative: true,
    cleanseable: false,
    dispellable: false,
    stackable: false,
    defaultDuration: 0,
  },

  [STATUS_CODE.SUMMON]: {
    code: STATUS_CODE.SUMMON,
    category: StatusCategory.ACTION,
    name: '召唤',
    playerDescription: '召唤一个单位加入战斗。',
    mechanicDescription:
      '在施法者同阵营创建一个召唤物实体。' +
      '召唤物拥有独立气血、属性和技能。' +
      '召唤物有存活回合限制，到期自动消失。' +
      '召唤物死亡不触发 ON_DEATH 被动（防止无限连锁）。',
    isNegative: false,
    cleanseable: false,
    dispellable: false,
    stackable: false,
    defaultDuration: 0,
  },

  [STATUS_CODE.TRANSFORM]: {
    code: STATUS_CODE.TRANSFORM,
    category: StatusCategory.ACTION,
    name: '变身',
    playerDescription: '改变目标的外观和技能组。',
    mechanicDescription:
      '将目标的技能组替换为指定技能集，持续期间生效。' +
      '变身不改变基础属性，但可附加属性修饰符。' +
      '变身期间原技能不可用。变身结束后恢复原技能组和冷却。',
    isNegative: false,
    cleanseable: false,
    dispellable: true,
    stackable: false,
    defaultDuration: 3,
  },

  [STATUS_CODE.REVIVE]: {
    code: STATUS_CODE.REVIVE,
    category: StatusCategory.ACTION,
    name: '复活',
    playerDescription: '使已倒下的角色重新站起。',
    mechanicDescription:
      '将已死亡目标的气血恢复至指定百分比。' +
      '复活后触发 ON_REVIVE 被动。' +
      '受 ReviveTracker 次数和冷却限制。' +
      '复活不解除目标身上的 debuff（除非配置了 cleanseDebuffs）。',
    isNegative: false,
    cleanseable: false,
    dispellable: false,
    stackable: false,
    defaultDuration: 0,
  },

  [STATUS_CODE.CLEANSE]: {
    code: STATUS_CODE.CLEANSE,
    category: StatusCategory.ACTION,
    name: '净化',
    playerDescription: '移除友方目标身上的负面状态。',
    mechanicDescription:
      '移除目标身上所有 cleanseable=true 的负面状态。' +
      '包括：控制类、DOT、减益、减治疗等。' +
      '不影响正面 Buff 和护盾。' +
      '净化数量可配置（默认全部移除）。',
    isNegative: false,
    cleanseable: false,
    dispellable: false,
    stackable: false,
    defaultDuration: 0,
  },

  [STATUS_CODE.DISPEL]: {
    code: STATUS_CODE.DISPEL,
    category: StatusCategory.ACTION,
    name: '驱散',
    playerDescription: '移除敌方目标身上的正面状态。',
    mechanicDescription:
      '移除目标身上所有 dispellable=true 的正面状态。' +
      '包括：增益 Buff、护盾、反射等。' +
      '不影响负面 debuff 和控制效果。' +
      '驱散数量可配置（默认全部移除）。',
    isNegative: true,
    cleanseable: false,
    dispellable: false,
    stackable: false,
    defaultDuration: 0,
  },

  [STATUS_CODE.AURA]: {
    code: STATUS_CODE.AURA,
    category: StatusCategory.ACTION,
    name: '光环',
    playerDescription: '为周围友方/敌方提供持续属性加成或减益。',
    mechanicDescription:
      '光环持有者存活期间，自动为指定范围（allies/enemies/self）' +
      '的单位施加属性修饰符。' +
      '光环持有者死亡或被沉默时光环失效。' +
      '光环修饰符随持有者 Buff 移除而自动清理。' +
      '同类光环不叠加，取最高值。',
    isNegative: false,
    cleanseable: false,
    dispellable: false,
    stackable: false,
    defaultDuration: -1,
  },
}

// ==================== 辅助查询函数 ====================

/** 根据状态代码获取元数据 */
export function getStatusMeta(code: StatusCode): StatusMeta {
  return STATUS_META[code]
}

/** 获取指定分类下的所有状态元数据 */
export function getStatusByCategory(category: StatusCategory): StatusMeta[] {
  return Object.values(STATUS_META).filter((m) => m.category === category)
}

/** 判断状态是否为控制类且阻止行动 */
export function isActionBlockingControl(code: StatusCode): boolean {
  const meta = STATUS_META[code]
  return meta.category === StatusCategory.CONTROL && meta.blocksAction === true
}

/** 判断状态是否为控制类且阻止技能 */
export function isSkillBlockingControl(code: StatusCode): boolean {
  const meta = STATUS_META[code]
  return meta.category === StatusCategory.CONTROL && meta.blocksSkill === true
}

/** 获取控制类状态的优先级（非控制类返回 0） */
export function getControlPriority(code: StatusCode): number {
  return STATUS_META[code].controlPriority ?? 0
}

/** 判断状态是否可被净化 */
export function isCleanseable(code: StatusCode): boolean {
  return STATUS_META[code].cleanseable
}

/** 判断状态是否可被驱散 */
export function isDispellable(code: StatusCode): boolean {
  return STATUS_META[code].dispellable
}

export const StatusNames: Record<StatusCode, string> = Object.fromEntries(
  Object.entries(STATUS_META).map(([code, meta]) => [code, meta.name]),
) as Record<StatusCode, string>

export const ControlKind: StatusCode[] = Object.values(STATUS_META)
  .filter((m) => m.category === StatusCategory.CONTROL)
  .map((m) => m.code)
export type ControlKind = (typeof ControlKind)[number]
export const ControlKindNames = Object.values(STATUS_META)
  .filter((m) => m.category === StatusCategory.CONTROL)
  .map((m) => m.name)
export const ControlKindOrder = ControlKind.map(
  (code) => STATUS_META[code].controlPriority ?? 0,
)

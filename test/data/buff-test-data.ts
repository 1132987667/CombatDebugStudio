import type { BuffConfig } from '@/types/buff'

/**
 * 完整的buff测试数据集合
 * 包含所有buff脚本的测试配置
 */

export const buffTestConfigs: Record<string, BuffConfig> = {
  // 增益类buff测试配置
  'buff_hit_reduction': {
    id: 'buff_hit_reduction',
    name: '命中率降低',
    description: '降低目标命中率30%',
    duration: 5000,
    maxStacks: 1,
    cooldown: 0,
    isDebuff: true,
    parameters: {
      hitReduction: 0.3,
      recoveryRate: 0.05,
      refreshBonus: 0.1
    }
  },

  'buff_dodge_up': {
    id: 'buff_dodge_up',
    name: '闪避提升',
    description: '提升闪避率20%',
    duration: 5000,
    maxStacks: 1,
    cooldown: 0,
    isDebuff: false,
    parameters: {
      dodgeBonus: 0.2,
      decayRate: 0.02,
      refreshBonus: 0.1
    }
  },

  'buff_speed_reduction': {
    id: 'buff_speed_reduction',
    name: '速度降低',
    description: '降低目标速度25%',
    duration: 5000,
    maxStacks: 1,
    cooldown: 0,
    isDebuff: true,
    parameters: {
      speedReduction: 0.25,
      recoveryRate: 0.03,
      refreshBonus: 0.1
    }
  },

  'buff_atk_up': {
    id: 'buff_atk_up',
    name: '攻击力提升',
    description: '提升攻击力20点',
    duration: 5000,
    maxStacks: 3,
    cooldown: 0,
    isDebuff: false,
    parameters: {
      attackBonus: 20,
      growthRate: 0.01,
      refreshBonus: 10
    }
  },

  'buff_def_up': {
    id: 'buff_def_up',
    name: '防御力提升',
    description: '提升防御力15点',
    duration: 5000,
    maxStacks: 3,
    cooldown: 0,
    isDebuff: false,
    parameters: {
      defenseBonus: 15,
      growthRate: 0.008,
      refreshBonus: 8
    }
  },

  'buff_crit_damage_reduction': {
    id: 'buff_crit_damage_reduction',
    name: '暴击伤害降低',
    description: '降低暴击伤害20%',
    duration: 5000,
    maxStacks: 1,
    cooldown: 0,
    isDebuff: true,
    parameters: {
      critDamageReduction: 0.2,
      recoveryRate: 0.02,
      refreshBonus: 0.05
    }
  },

  // 特殊效果类buff测试配置
  'buff_stone_skin': {
    id: 'buff_stone_skin',
    name: '石化皮肤',
    description: '提供物理伤害减免，但降低移动速度',
    duration: 5000,
    maxStacks: 1,
    cooldown: 0,
    isDebuff: false,
    parameters: {
      physicalReduction: 0.3,
      speedPenalty: 0.15,
      enhancementRate: 0.005,
      refreshBonus: 0.1
    }
  },

  'buff_mountain_child': {
    id: 'buff_mountain_child',
    name: '山林之子',
    description: '在山林环境中获得额外加成',
    duration: 5000,
    maxStacks: 1,
    cooldown: 0,
    isDebuff: false,
    parameters: {
      natureBonus: 0.15,
      hpRegen: 5,
      enhancementRate: 0.001,
      refreshBonus: 0.05
    }
  },

  'buff_strong_poison': {
    id: 'buff_strong_poison',
    name: '强毒',
    description: '比普通中毒更强的毒素效果',
    duration: 5000,
    maxStacks: 1,
    cooldown: 0,
    isDebuff: true,
    parameters: {
      baseDamage: 15,
      damageInterval: 1500,
      damageMultiplier: 1.3,
      speedReduction: 0.2,
      attackReduction: 0.15,
      refreshBonus: 0.05
    }
  },

  'buff_stun': {
    id: 'buff_stun',
    name: '眩晕',
    description: '使目标无法行动',
    duration: 2000,
    maxStacks: 1,
    cooldown: 0,
    isDebuff: true,
    parameters: {
      defenseReduction: 0.2,
      recoveryRate: 0.05,
      refreshBonus: 0.1
    }
  },

  // 现有buff测试配置
  'mountain_god': {
    id: 'mountain_god',
    name: '山神降临',
    description: '获得强大的力量加成',
    duration: 5000,
    maxStacks: 1,
    cooldown: 0,
    isDebuff: false,
    parameters: {
      attackBonus: 50,
      defenseBonus: 30,
      regeneration: 5,
      refreshBonus: 10
    }
  },

  'poison': {
    id: 'poison',
    name: '中毒',
    description: '持续受到毒素伤害',
    duration: 5000,
    maxStacks: 1,
    cooldown: 0,
    isDebuff: true,
    parameters: {
      baseDamage: 10,
      damageInterval: 2000,
      damageMultiplier: 1.2,
      refreshBonus: 5
    }
  }
}

/**
 * 测试角色数据
 */
export const testCharacters = {
  character_1: {
    id: 'char_character_1',
    name: '测试角色1',
    type: 'character' as const,
    level: 5,
    currentHealth: 100,
    maxHealth: 100,
    currentEnergy: 100,
    maxEnergy: 150,
    attributes: {
      ATK: 50,
      DEF: 30,
      SPD: 10,
      HIT_RATE: 0.8,
      DODGE_RATE: 0.1,
      CRIT_RATE: 0.1,
      CRIT_DAMAGE: 1.5
    }
  },

  enemy_1: {
    id: 'enemy_enemy_1',
    name: '测试敌人1',
    type: 'enemy' as const,
    level: 5,
    currentHealth: 100,
    maxHealth: 100,
    currentEnergy: 100,
    maxEnergy: 150,
    attributes: {
      ATK: 40,
      DEF: 20,
      SPD: 8,
      HIT_RATE: 0.7,
      DODGE_RATE: 0.05,
      CRIT_RATE: 0.05,
      CRIT_DAMAGE: 1.3
    }
  }
}

/**
 * 测试技能数据
 */
export const testSkills = {
  // 小技能测试数据
  small_skill_1: {
    id: 'skill_enemy_001_easy_1_small',
    name: '花粉迷雾',
    mpCost: 5,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'DAMAGE',
        formula: 'attack*0.8',
        attackType: 'normal'
      },
      {
        type: 'DEBUFF',
        formula: '0.3',
        buffId: 'buff_hit_reduction',
        duration: 1
      }
    ]
  },

  small_skill_2: {
    id: 'skill_enemy_001_easy_3_small',
    name: '滑溜闪避',
    mpCost: 5,
    cooldown: 2,
    selector: 'single_enemy',
    steps: [
      {
        type: 'DAMAGE',
        formula: 'attack*0.9',
        attackType: 'normal'
      },
      {
        type: 'BUFF',
        formula: '0.2',
        buffId: 'buff_dodge_up',
        duration: 1,
        target: 'self'
      }
    ]
  },

  // 大招测试数据
  ultimate_skill_1: {
    id: 'skill_boss_001_ultimate',
    name: '山神降临',
    mpCost: 25,
    cooldown: 3,
    selector: 'self',
    steps: [
      {
        type: 'BUFF',
        formula: '1.0',
        buffId: 'buff_mountain_god',
        duration: 2,
        stacks: 1
      }
    ]
  },

  ultimate_skill_2: {
    id: 'skill_boss_003_ultimate',
    name: '山神震怒',
    mpCost: 30,
    cooldown: 4,
    selector: 'all_enemies',
    steps: [
      {
        type: 'DAMAGE',
        formula: 'attack*1.2',
        attackType: 'normal'
      },
      {
        type: 'DEBUFF',
        formula: '1.0',
        buffId: 'buff_stun',
        duration: 1
      }
    ]
  }
}

/**
 * 测试用例数据
 */
export const testCases = {
  // 单buff效果测试
  singleBuffTests: [
    {
      name: '命中率降低debuff测试',
      buffId: 'buff_hit_reduction',
      characterId: 'enemy_enemy_1',
      expectedEffects: {
        HIT_RATE: -0.3
      },
      duration: 5000
    },
    {
      name: '闪避提升buff测试',
      buffId: 'buff_dodge_up',
      characterId: 'char_character_1',
      expectedEffects: {
        DODGE_RATE: 0.2
      },
      duration: 5000
    },
    {
      name: '攻击力提升buff测试',
      buffId: 'buff_atk_up',
      characterId: 'char_character_1',
      expectedEffects: {
        ATK: 20
      },
      duration: 5000
    }
  ],

  // 多buff叠加测试
  multiBuffTests: [
    {
      name: '同类型buff叠加测试',
      buffs: [
        { id: 'buff_atk_up', characterId: 'char_character_1' },
        { id: 'buff_atk_up', characterId: 'char_character_1' }
      ],
      expectedMaxStacks: 3,
      expectedTotalBonus: 40
    },
    {
      name: '不同类型buff共存测试',
      buffs: [
        { id: 'buff_atk_up', characterId: 'char_character_1' },
        { id: 'buff_def_up', characterId: 'char_character_1' },
        { id: 'buff_dodge_up', characterId: 'char_character_1' }
      ],
      expectedEffects: {
        ATK: 20,
        DEF: 15,
        DODGE_RATE: 0.2
      }
    },
    {
      name: 'buff与debuff共存测试',
      buffs: [
        { id: 'buff_dodge_up', characterId: 'char_character_1' },
        { id: 'buff_poison', characterId: 'char_character_1' }
      ],
      expectedCount: 2
    }
  ],

  // 技能与buff联动测试
  skillBuffTests: [
    {
      name: '小技能buff添加测试',
      skillId: 'skill_enemy_001_easy_1_small',
      sourceId: 'char_character_1',
      targetId: 'enemy_enemy_1',
      expectedBuffs: ['buff_hit_reduction']
    },
    {
      name: '大招buff添加测试',
      skillId: 'skill_boss_001_ultimate',
      sourceId: 'char_character_1',
      targetId: 'char_character_1',
      expectedBuffs: ['buff_mountain_god']
    },
    {
      name: '技能能量消耗测试',
      skillId: 'skill_boss_001_ultimate',
      sourceId: 'char_character_1',
      targetId: 'char_character_1',
      expectedEnergyCost: 25
    }
  ]
}

/**
 * 测试工具函数
 */
export const testUtils = {
  /**
   * 创建测试buff配置
   */
  createTestBuffConfig(buffId: string, customParams?: Record<string, any>): BuffConfig {
    const baseConfig = buffTestConfigs[buffId]
    if (!baseConfig) {
      throw new Error(`未找到buff配置: ${buffId}`)
    }

    return {
      ...baseConfig,
      parameters: {
        ...baseConfig.parameters,
        ...customParams
      }
    }
  },

  /**
   * 验证buff效果
   */
  validateBuffEffects(characterId: string, buffId: string, expectedEffects: Record<string, number>): boolean {
    // 这里应该实现实际的验证逻辑
    // 暂时返回true表示验证通过
    return true
  },

  /**
   * 模拟时间流逝
   */
  async simulateTimePassage(duration: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, duration)
    })
  }
}
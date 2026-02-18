/**
 * 文件: schema-validator.ts
 * 创建日期: 2026-02-19
 * 作者: CombatDebugStudio
 * 功能: 配置文件验证工具
 * 描述: 使用JSON Schema验证技能和Effect配置的完整性和正确性
 */

/**
 * 验证结果接口
 */
export interface ValidationResult {
  /** 是否验证通过 */
  valid: boolean
  /** 错误信息列表 */
  errors: string[]
}

/**
 * 技能配置JSON Schema
 */
const skillSchema = {
  type: 'object',
  required: ['id', 'name', 'mpCost', 'cooldown', 'steps'],
  properties: {
    id: {
      type: 'string',
      pattern: '^skill_.*$'
    },
    name: {
      type: 'string',
      minLength: 1
    },
    description: {
      type: 'string'
    },
    mpCost: {
      type: 'number',
      minimum: 0
    },
    cooldown: {
      type: 'number',
      minimum: 0
    },
    maxUses: {
      type: 'number',
      minimum: 1
    },
    targetType: {
      type: 'string'
    },
    scope: {
      type: 'string'
    },
    steps: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['type', 'formula'],
        properties: {
          type: {
            type: 'string'
          },
          formula: {
            type: 'string',
            minLength: 1
          },
          attackType: {
            type: 'string'
          },
          effectId: {
            type: 'string'
          },
          effectParams: {
            type: 'object'
          },
          duration: {
            type: 'number'
          },
          stacks: {
            type: 'number',
            minimum: 1
          },
          targetType: {
            type: 'string'
          },
          scope: {
            type: 'string'
          },
          condition: {
            type: 'string'
          },
          priority: {
            type: 'number'
          },
          parameters: {
            type: 'object'
          }
        }
      }
    },
    condition: {
      type: 'string'
    },
    skillType: {
      type: 'string'
    },
    triggerTimes: {
      type: 'array',
      items: {
        type: 'string'
      }
    },
    level: {
      type: 'number',
      minimum: 1
    },
    icon: {
      type: 'string'
    },
    animation: {
      type: 'string'
    },
    soundEffect: {
      type: 'string'
    },
    tags: {
      type: 'array',
      items: {
        type: 'string'
      }
    },
    parameters: {
      type: 'object'
    }
  }
}

/**
 * Effect配置JSON Schema
 */
const effectSchema = {
  type: 'object',
  required: ['id', 'type', 'params'],
  properties: {
    id: {
      type: 'string',
      minLength: 1
    },
    type: {
      type: 'string',
      enum: ['damage', 'heal', 'buff', 'debuff', 'special']
    },
    params: {
      type: 'object'
    },
    description: {
      type: 'string'
    }
  }
}

/**
 * 验证技能配置
 * @param skillConfig 技能配置对象
 * @returns 验证结果
 */
export function validateSkillConfig(skillConfig: any): ValidationResult {
  const errors: string[] = []
  
  // 检查必填字段
  if (!skillConfig.id) {
    errors.push('Missing required field: id')
  }
  
  if (!skillConfig.name) {
    errors.push('Missing required field: name')
  }
  
  if (skillConfig.mpCost === undefined) {
    errors.push('Missing required field: mpCost')
  }
  
  if (skillConfig.cooldown === undefined) {
    errors.push('Missing required field: cooldown')
  }
  
  if (!skillConfig.steps || !Array.isArray(skillConfig.steps) || skillConfig.steps.length === 0) {
    errors.push('Missing required field: steps (must be a non-empty array)')
  } else {
    // 验证每个步骤
    skillConfig.steps.forEach((step: any, index: number) => {
      if (!step.type) {
        errors.push(`Step ${index}: Missing required field: type`)
      }
      
      if (!step.formula) {
        errors.push(`Step ${index}: Missing required field: formula`)
      }
      
      // 检查effectId（如果是buff或debuff类型）
      if ((step.type === 'buff' || step.type === 'debuff') && !step.effectId) {
        errors.push(`Step ${index}: Missing required field: effectId for ${step.type} type`)
      }
    })
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 验证Effect配置
 * @param effectConfig Effect配置对象
 * @returns 验证结果
 */
export function validateEffectConfig(effectConfig: any): ValidationResult {
  const errors: string[] = []
  
  // 检查必填字段
  if (!effectConfig.id) {
    errors.push('Missing required field: id')
  }
  
  if (!effectConfig.type) {
    errors.push('Missing required field: type')
  } else if (!['damage', 'heal', 'buff', 'debuff', 'special'].includes(effectConfig.type)) {
    errors.push(`Invalid type: ${effectConfig.type}. Must be one of: damage, heal, buff, debuff, special`)
  }
  
  if (!effectConfig.params) {
    errors.push('Missing required field: params')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * 批量验证技能配置
 * @param skillConfigs 技能配置数组
 * @returns 验证结果
 */
export function validateSkillConfigs(skillConfigs: any[]): ValidationResult {
  const errors: string[] = []
  let validCount = 0
  
  skillConfigs.forEach((config, index) => {
    const result = validateSkillConfig(config)
    if (result.valid) {
      validCount++
    } else {
      errors.push(`Skill ${index} (${config.id || 'unknown'}): ${result.errors.join(', ')}`)
    }
  })
  
  return {
    valid: errors.length === 0,
    errors: [
      `Validation summary: ${validCount}/${skillConfigs.length} skills are valid`,
      ...errors
    ]
  }
}

/**
 * 批量验证Effect配置
 * @param effectConfigs Effect配置数组
 * @returns 验证结果
 */
export function validateEffectConfigs(effectConfigs: any[]): ValidationResult {
  const errors: string[] = []
  let validCount = 0
  
  effectConfigs.forEach((config, index) => {
    const result = validateEffectConfig(config)
    if (result.valid) {
      validCount++
    } else {
      errors.push(`Effect ${index} (${config.id || 'unknown'}): ${result.errors.join(', ')}`)
    }
  })
  
  return {
    valid: errors.length === 0,
    errors: [
      `Validation summary: ${validCount}/${effectConfigs.length} effects are valid`,
      ...errors
    ]
  }
}

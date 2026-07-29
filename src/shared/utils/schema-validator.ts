/**
 * 文件: schema-validator.ts
 * 创建日期: 2026-02-19
 * 作者: CombatDebugStudio
 * 功能: 配置文件验证工具
 * 描述: 使用JSON Schema验证技能和Effect配置的完整性和正确性
 */

import { SkillConfig, SkillStep } from '@/domain/skill/types'
import { AtomicEffectType } from '@/domain/buff/atomic/types'
/** 合法被动分类值 */
const VALID_PASSIVE_CATEGORIES: readonly AtomicEffectType[] =
  Object.values(AtomicEffectType)

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
  required: ['id', 'name', 'energyCost', 'cooldown', 'steps'],
  properties: {
    id: {
      type: 'string',
      pattern: '^skill_.*$',
    },
    name: {
      type: 'string',
      minLength: 1,
    },
    description: {
      type: 'string',
    },
    energyCost: {
      type: 'number',
      minimum: 0,
    },
    cooldown: {
      type: 'number',
      minimum: 0,
    },
    maxUses: {
      type: 'number',
      minimum: 1,
    },
    selector: {
      type: 'object',
      required: ['faction'],
      properties: {
        faction: { type: 'string', enum: ['enemy', 'ally', 'all', 'self'] },
        strategy: {
          type: 'string',
          enum: [
            'all',
            'random',
            'lowest_hp',
            'highest_hp',
            'front',
            'back',
            'adjacent',
            'first',
          ],
        },
        count: { type: 'number', minimum: 1 },
      },
    },
    steps: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['type'],
        properties: {
          type: {
            type: 'string',
          },
          formula: {
            type: 'string',
            minLength: 1,
          },
          calculation: {
            type: 'object',
            properties: {
              baseValue: { type: 'number' },
              extraValues: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    attribute: { type: 'string' },
                    ratio: { type: 'number' },
                  },
                },
              },
              damageCategory: { type: 'string' },
              isSingleTurn: { type: 'boolean' },
            },
          },
          buffId: {
            type: 'string',
          },
          modifiers: {
            type: 'array',
          },
          attackType: {
            type: 'string',
          },
          effectId: {
            type: 'string',
          },
          effectParams: {
            type: 'object',
          },
          duration: {
            type: 'number',
          },
          stacks: {
            type: 'number',
            minimum: 1,
          },
          targetConfig: {
            type: 'object',
            properties: {
              faction: { type: 'string' },
              strategy: { type: 'string' },
              count: { type: 'number' },
            },
          },
          condition: {
            type: 'string',
          },
          priority: {
            type: 'number',
          },
          parameters: {
            type: 'object',
          },
        },
      },
    },
    condition: {
      type: 'string',
    },
    skillType: {
      type: 'string',
    },
    triggerTimes: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    level: {
      type: 'number',
      minimum: 1,
    },
    icon: {
      type: 'string',
    },
    animation: {
      type: 'string',
    },
    soundEffect: {
      type: 'string',
    },
    tags: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    parameters: {
      type: 'object',
    },
  },
}

/**
 * 验证技能配置
 * @param skillConfig 技能配置对象
 * @returns 验证结果
 */
export function validateSkillConfig(
  skillConfig: SkillConfig,
): ValidationResult {
  const errors: string[] = []

  // 检查必填字段
  if (!skillConfig.id) {
    errors.push('Missing required field: id')
  }

  // 检查 skillType 字段
  if (!skillConfig.skillType) {
    errors.push('Missing required field: skillType')
  }

  if (!skillConfig.name) {
    errors.push('Missing required field: name')
  }

  if (skillConfig.energyCost === undefined) {
    errors.push('Missing required field: energyCost')
  }

  if (skillConfig.cooldown === undefined) {
    errors.push('Missing required field: cooldown')
  }

  if (
    !skillConfig.steps ||
    !Array.isArray(skillConfig.steps) ||
    skillConfig.steps.length === 0
  ) {
    errors.push('Missing required field: steps (must be a non-empty array)')
  } else {
    // 验证每个步骤
    skillConfig.steps.forEach((step: SkillStep, index: number) => {
      if (!step.type) {
        errors.push(`Step ${index}: Missing required field: type`)
      }

      // 验证 step.targetConfig 字段（新格式）
      if (step.targetConfig) {
        const tc = step.targetConfig
        if (
          !tc.faction ||
          !['enemy', 'ally', 'all', 'self'].includes(tc.faction)
        ) {
          errors.push(
            `Step ${index}: targetConfig.faction must be one of: enemy, ally, all, self`,
          )
        }
        if (
          tc.strategy &&
          ![
            'all',
            'random',
            'lowest_hp',
            'highest_hp',
            'front',
            'back',
            'adjacent',
            'first',
          ].includes(tc.strategy)
        ) {
          errors.push(
            `Step ${index}: targetConfig.strategy is invalid: ${tc.strategy}`,
          )
        }
      }

      // 检查 effectId（如果是 apply_buff 类型）
      if (step.type === 'apply_buff' && !step.effectId && !step.buffId) {
        errors.push(
          `Step ${index}: Missing required field: effectId for ${step.type} type`,
        )
      }
    })
  }

  // 验证 passiveCategory
  if (skillConfig.passiveCategory !== undefined) {
    if (!Array.isArray(skillConfig.passiveCategory)) {
      errors.push('passiveCategory must be an array')
    } else if (skillConfig.passiveCategory.length === 0) {
      errors.push('passiveCategory must be a non-empty array')
    } else {
      for (const cat of skillConfig.passiveCategory) {
        if (!VALID_PASSIVE_CATEGORIES.includes(cat as AtomicEffectType)) {
          errors.push(
            `Invalid passiveCategory value: "${cat}". Must be one of: ${VALID_PASSIVE_CATEGORIES.join(', ')}`,
          )
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 验证Effect配置
 * @param effectConfig Effect配置对象
 * @returns 验证结果
 */
export function validateEffectConfig(
  effectConfig: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = []

  // 检查必填字段
  if (!effectConfig.id) {
    errors.push('Missing required field: id')
  }

  if (!effectConfig.type) {
    errors.push('Missing required field: type')
  } else if (
    !['damage', 'heal', 'buff', 'debuff', 'special'].includes(
      effectConfig.type as string,
    )
  ) {
    errors.push(
      `Invalid type: ${effectConfig.type}. Must be one of: damage, heal, buff, debuff, special`,
    )
  }

  if (!effectConfig.params) {
    errors.push('Missing required field: params')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 批量验证技能配置
 * @param skillConfigs 技能配置数组
 * @returns 验证结果
 */
export function validateSkillConfigs(
  skillConfigs: SkillConfig[],
): ValidationResult {
  const errors: string[] = []
  let validCount = 0

  skillConfigs.forEach((config, index) => {
    const result = validateSkillConfig(config)
    if (result.valid) {
      validCount++
    } else {
      errors.push(
        `Skill ${index} (${config.id || 'unknown'}): ${result.errors.join(', ')}`,
      )
    }
  })

  return {
    valid: errors.length === 0,
    errors: [
      `Validation summary: ${validCount}/${skillConfigs.length} skills are valid`,
      ...errors,
    ],
  }
}

/**
 * 批量验证Effect配置
 * @param effectConfigs Effect配置数组
 * @returns 验证结果
 */
export function validateEffectConfigs(
  effectConfigs: Record<string, unknown>[],
): ValidationResult {
  const errors: string[] = []
  let validCount = 0

  effectConfigs.forEach((config, index) => {
    const result = validateEffectConfig(config)
    if (result.valid) {
      validCount++
    } else {
      errors.push(
        `Effect ${index} (${config.id || 'unknown'}): ${result.errors.join(', ')}`,
      )
    }
  })

  return {
    valid: errors.length === 0,
    errors: [
      `Validation summary: ${validCount}/${effectConfigs.length} effects are valid`,
      ...errors,
    ],
  }
}

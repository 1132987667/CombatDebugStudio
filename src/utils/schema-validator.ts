/**
 * 文件: schema-validator.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: JSON模式验证器
 * 描述: 提供JSON Schema验证功能，用于验证配置数据的格式和约束
 * 版本: 1.0.0
 */

import { logger } from '@/utils/logging'

interface ValidationError {
  field: string
  message: string
}

interface Schema {
  type: string
  properties?: Record<string, Schema>
  required?: string[]
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  enum?: any[]
}

export class SchemaValidator {
  public validate(data: any, schema: Schema): {
    valid: boolean
    errors: ValidationError[]
  } {
    const errors: ValidationError[] = []
    this.validateValue('', data, schema, errors)
    return {
      valid: errors.length === 0,
      errors
    }
  }

  private validateValue(
    path: string,
    value: any,
    schema: Schema,
    errors: ValidationError[]
  ): void {
    // 验证类型
    if (schema.type === 'string' && typeof value !== 'string') {
      errors.push({
        field: path || 'root',
        message: 'Expected string'
      })
      return
    }

    if (schema.type === 'number' && typeof value !== 'number') {
      errors.push({
        field: path || 'root',
        message: 'Expected number'
      })
      return
    }

    if (schema.type === 'boolean' && typeof value !== 'boolean') {
      errors.push({
        field: path || 'root',
        message: 'Expected boolean'
      })
      return
    }

    if (schema.type === 'array' && !Array.isArray(value)) {
      errors.push({
        field: path || 'root',
        message: 'Expected array'
      })
      return
    }

    if (schema.type === 'object' && typeof value !== 'object') {
      errors.push({
        field: path || 'root',
        message: 'Expected object'
      })
      return
    }

    // 验证字符串长度
    if (schema.type === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({
          field: path || 'root',
          message: `String length must be at least ${schema.minLength}`
        })
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({
          field: path || 'root',
          message: `String length must be at most ${schema.maxLength}`
        })
      }
    }

    // 验证数字范围
    if (schema.type === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          field: path || 'root',
          message: `Number must be at least ${schema.minimum}`
        })
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          field: path || 'root',
          message: `Number must be at most ${schema.maximum}`
        })
      }
    }

    // 验证枚举值
    if (schema.enum !== undefined && !schema.enum.includes(value)) {
      errors.push({
        field: path || 'root',
        message: `Value must be one of: ${schema.enum.join(', ')}`
      })
    }

    // 验证对象属性
    if (schema.type === 'object' && typeof value === 'object' && value !== null) {
      if (schema.required) {
        for (const requiredField of schema.required) {
          if (!(requiredField in value)) {
            errors.push({
              field: path ? `${path}.${requiredField}` : requiredField,
              message: 'Required field'
            })
          }
        }
      }

      if (schema.properties) {
        for (const [key, propertySchema] of Object.entries(schema.properties)) {
          if (key in value) {
            this.validateValue(
              path ? `${path}.${key}` : key,
              value[key],
              propertySchema,
              errors
            )
          }
        }
      }
    }
  }

  public validateBuffConfig(config: any): boolean {
    const schema: Schema = {
      type: 'object',
      required: ['id', 'name', 'description', 'duration', 'maxStacks', 'cooldown'],
      properties: {
        id: {
          type: 'string',
          minLength: 1
        },
        name: {
          type: 'string',
          minLength: 1
        },
        description: {
          type: 'string'
        },
        duration: {
          type: 'number',
          minimum: -1
        },
        maxStacks: {
          type: 'number',
          minimum: 1
        },
        cooldown: {
          type: 'number',
          minimum: 0
        },
        isPermanent: {
          type: 'boolean'
        },
        isDebuff: {
          type: 'boolean'
        },
        parameters: {
          type: 'object'
        }
      }
    }

    const result = this.validate(config, schema)
    if (!result.valid) {
      logger.error('Invalid buff config:', result.errors)
      return false
    }
    return true
  }
}

export const schemaValidator = new SchemaValidator()

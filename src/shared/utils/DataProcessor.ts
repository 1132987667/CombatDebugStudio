/**
 * 文件: DataProcessor.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 通用数据处理工具类
 * 描述: 提供通用的数据处理功能，包括过滤、搜索、转换、排序等操作
 * 版本: 1.0.0
 */

export interface FilterOptions<T> {
  /** 过滤条件 */
  condition: (item: T) => boolean
  /** 最大返回数量 */
  limit?: number
  /** 排序字段 */
  sortBy?: keyof T
  /** 排序方向 */
  sortDirection?: 'asc' | 'desc'
}

export interface SearchOptions<T> {
  /** 搜索字段 */
  fields: (keyof T)[]
  /** 搜索关键词 */
  keyword: string
  /** 是否模糊匹配 */
  fuzzy?: boolean
  /** 匹配阈值（仅模糊匹配时有效） */
  threshold?: number
}

export interface TransformOptions<T, R> {
  /** 转换函数 */
  transform: (item: T) => R
  /** 是否并行处理 */
  parallel?: boolean
  /** 并行处理批次大小 */
  batchSize?: number
}

export interface ValidationRule<T> {
  /** 验证字段 */
  field: keyof T
  /** 验证类型 */
  type: 'required' | 'number' | 'string' | 'array' | 'object'
  /** 最小值（数字类型） */
  min?: number
  /** 最大值（数字类型） */
  max?: number
  /** 最小长度（字符串/数组类型） */
  minLength?: number
  /** 最大长度（字符串/数组类型） */
  maxLength?: number
  /** 正则表达式（字符串类型） */
  pattern?: RegExp
  /** 自定义验证函数 */
  validator?: (value: unknown) => boolean
  /** 错误消息 */
  message?: string
}

export interface ValidationResult {
  /** 是否验证通过 */
  isValid: boolean
  /** 错误消息列表 */
  errors: string[]
}

/**
 * 数据处理工具类
 */
export class DataProcessor {
  private static cache: Map<string, { data: unknown; timestamp: number }> = new Map()

  constructor() {}

  /**
   * 数据查找方法
   */
  static find<T>(data: T[], condition: (item: T) => boolean): T | undefined {
    return data.find(condition)
  }

  /**
   * 数据过滤方法
   */
  static filter<T>(data: T[], options: FilterOptions<T>): T[] {
    let result = data.filter(options.condition)

    if (options.sortBy) {
      result = result.sort((a, b) => {
        const aVal = a[options.sortBy!]
        const bVal = b[options.sortBy!]

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return options.sortDirection === 'desc' ? bVal - aVal : aVal - bVal
        }

        const aStr = String(aVal)
        const bStr = String(bVal)
        return options.sortDirection === 'desc'
          ? bStr.localeCompare(aStr)
          : aStr.localeCompare(bStr)
      })
    }

    if (options.limit && options.limit > 0) {
      result = result.slice(0, options.limit)
    }

    return result
  }

  /**
   * 数据映射转换
   */
  static map<T, R>(data: T[], options: TransformOptions<T, R>): R[] {
    if (options.parallel && data.length > (options.batchSize || 1000)) {
      return this.parallelMap(
        data,
        options.transform,
        options.batchSize || 1000,
      )
    }
    return data.map(options.transform)
  }

  /**
   * 并行映射处理
   */
  private static parallelMap<T, R>(
    data: T[],
    transform: (item: T) => R,
    batchSize: number,
  ): R[] {
    const result: R[] = []
    const batches = Math.ceil(data.length / batchSize)

    for (let i = 0; i < batches; i++) {
      const batch = data.slice(i * batchSize, (i + 1) * batchSize)
      const batchResult = batch.map(transform)
      result.push(...batchResult)
    }

    return result
  }

  /**
   * 数据搜索
   */
  static search<T>(data: T[], options: SearchOptions<T>): T[] {
    const { fields, keyword, fuzzy = false, threshold = 0.7 } = options
    const lowerKeyword = keyword.toLowerCase()

    return data.filter((item) => {
      return fields.some((field) => {
        const value = String(item[field]).toLowerCase()

        if (fuzzy) {
          return this.calculateSimilarity(value, lowerKeyword) >= threshold
        }

        return value.includes(lowerKeyword)
      })
    })
  }

  /**
   * 计算字符串相似度（Levenshtein距离）
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    const len1 = str1.length
    const len2 = str2.length

    if (len1 === 0 || len2 === 0) return 0

    const matrix: number[][] = []

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0] = matrix[0] || []
      matrix[0][j] = j
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        )
      }
    }

    const distance = matrix[len1][len2]
    return 1 - distance / Math.max(len1, len2)
  }

  /**
   * 数据验证
   */
  static validate<T>(data: T, rules: ValidationRule<T>[]): ValidationResult {
    const errors: string[] = []

    rules.forEach((rule) => {
      const value = data[rule.field]

      switch (rule.type) {
        case 'required':
          if (value === undefined || value === null || value === '') {
            errors.push(rule.message || `${String(rule.field)} 是必填字段`)
          }
          break

        case 'number':
          if (typeof value !== 'number') {
            errors.push(rule.message || `${String(rule.field)} 必须是数字`)
          } else {
            if (rule.min !== undefined && value < rule.min) {
              errors.push(
                rule.message || `${String(rule.field)} 不能小于 ${rule.min}`,
              )
            }
            if (rule.max !== undefined && value > rule.max) {
              errors.push(
                rule.message || `${String(rule.field)} 不能大于 ${rule.max}`,
              )
            }
          }
          break

        case 'string':
          if (typeof value !== 'string') {
            errors.push(rule.message || `${String(rule.field)} 必须是字符串`)
          } else {
            if (rule.minLength !== undefined && value.length < rule.minLength) {
              errors.push(
                rule.message ||
                  `${String(rule.field)} 长度不能小于 ${rule.minLength}`,
              )
            }
            if (rule.maxLength !== undefined && value.length > rule.maxLength) {
              errors.push(
                rule.message ||
                  `${String(rule.field)} 长度不能大于 ${rule.maxLength}`,
              )
            }
            if (rule.pattern && !rule.pattern.test(value)) {
              errors.push(rule.message || `${String(rule.field)} 格式不正确`)
            }
          }
          break

        case 'array':
          if (!Array.isArray(value)) {
            errors.push(rule.message || `${String(rule.field)} 必须是数组`)
          } else {
            if (rule.minLength !== undefined && value.length < rule.minLength) {
              errors.push(
                rule.message ||
                  `${String(rule.field)} 长度不能小于 ${rule.minLength}`,
              )
            }
            if (rule.maxLength !== undefined && value.length > rule.maxLength) {
              errors.push(
                rule.message ||
                  `${String(rule.field)} 长度不能大于 ${rule.maxLength}`,
              )
            }
          }
          break

        case 'object':
          if (
            typeof value !== 'object' ||
            value === null ||
            Array.isArray(value)
          ) {
            errors.push(rule.message || `${String(rule.field)} 必须是对象`)
          }
          break
      }

      if (rule.validator && !rule.validator(value)) {
        errors.push(rule.message || `${String(rule.field)} 验证失败`)
      }
    })

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * 获取缓存数据
   */
  static getCachedData<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached) return null
    return cached.data as T
  }

  /**
   * 设置缓存数据
   */
  static setCachedData<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  /**
   * 清除缓存
   */
  static clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }
}

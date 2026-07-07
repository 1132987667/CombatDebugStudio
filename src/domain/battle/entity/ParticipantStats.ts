/**
 ** 文件: ParticipantStats.ts
 ** 创建日期: 2026-02-09
 ** 作者: 
 ** 功能: 参与者属性管理
 ** 描述: 
 **/
import { ATTRIBUTE_CODE, type AttributeValue, getAttributeMeta, getAttributeDefaultValue } from '@/domain/attribute/types'
import { ModifierType, ModifierSourceType, type Modifier } from '@/domain/attribute/types'
import * as Utils from '@/domain/utils/Utils'

export class ParticipantStats {
  readonly attributes = new Map<ATTRIBUTE_CODE, AttributeValue>()

  /** 全局版本号，每次变化递增 */
  private version: number = 0

  /** 获取当前版本号（供外部比对） */
  getCurrentVersion(): number {
    return this.version
  }

  /** 使所有缓存失效：递增全局版本号 */
  invalidateCache(): void {
    this.version++
    // 防御性防溢出。实际项目不可能触发，但防患未然
    if (this.version > Number.MAX_SAFE_INTEGER - 1000) {
      this.version = 0
    }
  }

  initAttribute(code: ATTRIBUTE_CODE, baseValue: number, isPercentage: boolean): void {
    this.attributes.set(code, {
      value: baseValue,
      base: baseValue,
      modifiers: [
        {
          sourceKey: 'base',
          sourceType: ModifierSourceType.BASE,
          attribute: code,
          value: baseValue,
          type: ModifierType.ADDITIVE,
          description: '基础值',
        }
      ],
      isPercentage,
      cachedVersion: this.version,
    })
  }

  initAttributes(attributeValues: Partial<Record<ATTRIBUTE_CODE, number>>): void {
    const normalized: Partial<Record<ATTRIBUTE_CODE, number>> = {}
    for (const [key, value] of Object.entries(attributeValues)) {
      normalized[key as ATTRIBUTE_CODE] = value
    }
    for (const code of Object.values(ATTRIBUTE_CODE)) {
      const meta = getAttributeMeta(code)
      const baseValue = normalized[code] ?? getAttributeDefaultValue(code)
      this.initAttribute(code, baseValue, meta?.isPercentage ?? false)
    }
    // 初始化后使缓存失效，强制第一次读取时重算
    this.invalidateCache()
  }

  reCalAttributeValue(attr: ATTRIBUTE_CODE): AttributeValue | undefined {
    this.recalcAttribute(attr)
    return this.attributes.get(attr)
  }

  getAttributeValue(attr: ATTRIBUTE_CODE): number {
    const result = this.getAttribute(attr)
    return result?.value ?? 0
  }

  getAttribute(attr: ATTRIBUTE_CODE): AttributeValue | undefined {
    return this.attributes.get(attr)
  }

  getAttributeBaseValue(attr: ATTRIBUTE_CODE): number {
    return this.attributes.get(attr)?.base ?? 0
  }

  setAttributeBase(attr: ATTRIBUTE_CODE, value: number): void {
    const attrData = this.attributes.get(attr)
    if (attrData) {
      attrData.base = value
      // 标记该属性为过期（版本号不匹配），同时递增全局版本号
      attrData.cachedVersion = this.version - 1
    }
  }

  setAttributeValue(attr: ATTRIBUTE_CODE, value: number): void {
    const attrData = this.attributes.get(attr)
    if (attrData) {
      attrData.value = value
      attrData.cachedVersion = this.version
    }
  }

  /** 通知外部修饰符已变化，使所有缓存失效 */
  notifyModifiersChanged(): void {
    this.invalidateCache()
  }

  recalculateAll(): void {
    this.invalidateCache()
    for (const code of Object.values(ATTRIBUTE_CODE)) {
      this.recalcAttribute(code)
    }
  }

  private recalcAttribute(attrCode: ATTRIBUTE_CODE): void {
    const attrData: AttributeValue | undefined = this.attributes.get(attrCode)
    if (!attrData) return

    // ponytail: 跳过运行时状态属性（血量、能量），它们由 setAttributeValue 单独维护，不从公式重算
    const meta = getAttributeMeta(attrCode)
    if (meta?.isRuntimeState) return

    // 版本号比对：如果缓存是最新的，跳过重算
    if (attrData.cachedVersion === this.version) return

    const modifiers: Modifier[] = attrData.modifiers
    // 计算最终值
    // 1. 基础值[base] + 累加值[additive]
    // 2. 百分比值[percentMultiplier]
    // 3. 独立乘法值[independentMultiplier]
    // 4. 最终乘法值[finalMultiplier]
    let additive = 0, percentMultiplier = 100, independentMultiplier = 100, finalMultiplier = 100
    for (const mod of modifiers) {
      // ponytail: 跳过 sourceKey === 'base' 的修饰符，base 值已通过 attrData.base 计入
      if (mod.sourceKey === 'base') continue
      switch (mod.type) {
        case ModifierType.ADDITIVE: additive += mod.value; break
        case ModifierType.PERCENTAGE: percentMultiplier += mod.value; break
        case ModifierType.MULTIPLICATIVE: independentMultiplier += mod.value; break
        case ModifierType.FINAL: finalMultiplier += mod.value; break
      }
    }
    // ponytail: 加成属性（attackBonus/healthBonus）已在 enemyToParticipant 中作为
    // PERCENTAGE 修饰符注入到对应属性，此处不再重复处理。
    const value = ((attrData.base + additive) * percentMultiplier / 100 * independentMultiplier / 100) * finalMultiplier / 100
    attrData.value = Utils.round(value, 2)
    // 更新版本戳，标记为已计算
    attrData.cachedVersion = this.version
  }

  getAllBaseAttributes(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [code, attrData] of this.attributes) {
      result[code] = attrData.base
    }
    return result
  }
}

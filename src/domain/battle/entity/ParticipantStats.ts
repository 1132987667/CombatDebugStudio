/**
 ** 文件: ParticipantStats.ts
 ** 创建日期: 2026-02-09
 ** 作者: CombatDebugStudio
 ** 功能: 参与者属性管理
 ** 描述: 维护参与者的属性 Map（ATTRIBUTE_CODE → AttributeValue），支持基础值设定、版本号缓存、修饰符重算
 ** 从 BattleParticipantImpl.ts 提取，职责单一
 **
 ** ponytail: 使用"纪元版本号"替代布尔脏标记。
 **   每次属性变化递增全局 version，各属性的 cachedVersion 与之比对决定是否需要重算。
 **   彻底移除手动 markDirty/markAllDirty 调用，降低遗漏风险。
 **/
import { ATTRIBUTE_CODE, type AttributeValue, getAttributeMeta, getAttributeDefaultValue, normalizeAttributeCode } from '@/domain/attribute/types'
import { ModifierType, ModifierSourceType, type Modifier } from '@/domain/attribute/types'

export class ParticipantStats {
  readonly attributes = new Map<ATTRIBUTE_CODE, AttributeValue>()

  /** 全局版本号，每次变化递增 */
  private version = 0

  /** 获取当前版本号（供外部比对） */
  getCurrentVersion(): number {
    return this.version
  }

  /** 使所有缓存失效：递增全局版本号 */
  invalidateCache(): void {
    this.version++
    // ponytail: 防御性防溢出。实际项目不可能触发，但防患未然
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
    // ponytail: normalize keys so legacy JSON keys like 'ATK' → 'attack' work
    const normalized: Partial<Record<ATTRIBUTE_CODE, number>> = {}
    for (const [key, value] of Object.entries(attributeValues)) {
      normalized[normalizeAttributeCode(key)] = value as number
    }
    for (const code of Object.values(ATTRIBUTE_CODE)) {
      const meta = getAttributeMeta(code)
      const baseValue = normalized[code] ?? getAttributeDefaultValue(code)
      this.initAttribute(code, baseValue, meta?.isPercentage ?? false)
    }
    // 初始化后使缓存失效，强制第一次读取时重算
    this.invalidateCache()
  }

  getAttributeValue(attr: ATTRIBUTE_CODE): AttributeValue | undefined {
    this.recalcAttribute(attr)
    return this.attributes.get(attr)
  }

  getAttribute(attr: ATTRIBUTE_CODE): number {
    const result = this.getAttributeValue(attr)
    return result?.value ?? 0
  }

  getAttrValue(attr: ATTRIBUTE_CODE): AttributeValue | undefined {
    return this.attributes.get(attr)
  }

  getAttributeBase(attr: ATTRIBUTE_CODE): number {
    return this.attributes.get(attr)?.base ?? 0
  }

  setAttributeBase(attr: ATTRIBUTE_CODE, value: number): void {
    const attrData = this.attributes.get(attr)
    if (attrData) {
      attrData.base = value
      // 标记该属性为过期（版本号不匹配），同时递增全局版本号
      attrData.cachedVersion = this.version - 1
      this.invalidateCache()
    }
  }

  setAttributeValue(attr: ATTRIBUTE_CODE, value: number): void {
    const attrData = this.attributes.get(attr)
    if (attrData) {
      attrData.value = value
      // 直接设值视为"已是最新"，版本戳对齐，不需要重算
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

    // 版本号比对：如果缓存是最新的，跳过重算
    if (attrData.cachedVersion === this.version) return

    // ponytail: 只用本地 modifiers — 不从 provider 拉取。
    // provider.getModifierStack 按 attrCode 而非 participantId 查，永远找不到正确堆栈；
    // 且 modifiers 本来就在 attrData.modifiers 里（由 initAttribute / 外部 push 维护）。
    const modifiers: Modifier[] = attrData.modifiers

    let additive = 0
    let percentMultiplier = 1
    let independentMultiplier = 1
    let finalMultiplier = 1
    for (const mod of modifiers) {
      // ponytail: Modifier.value 是 number，没有 DynamicValueResolver，直接取值
      switch (mod.type) {
        case ModifierType.ADDITIVE: additive += mod.value; break
        case ModifierType.PERCENTAGE: percentMultiplier += mod.value; break
        case ModifierType.MULTIPLICATIVE: independentMultiplier *= (1 + mod.value); break
        case ModifierType.FINAL: finalMultiplier *= (1 + mod.value); break
      }
    }
    const value = ((attrData.base + additive) * percentMultiplier * independentMultiplier) * finalMultiplier

    attrData.modifiers = modifiers
    attrData.value = Math.floor(value * 100) / 100
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

/**
 ** 文件: ParticipantStats.ts
 ** 创建日期: 2026-02-09
 ** 作者: 
 ** 功能: 参与者属性管理
 ** 描述: 
 **/
import { ATTRIBUTE_CODE, type AttributeValue, getAttrMeta, getAttrDv } from '@/domain/attribute/types'
import { ModifierType, ModifierSourceType, type Modifier } from '@/domain/attribute/types'
import { round } from '@/shared/utils/math'
import type { IDebugTracePort } from '@/domain/port/IDebugTracePort'
import { createTraceEvent, TraceLevel, TracePhase } from '@/shared/types/trace-event'

export class ParticipantStats {
  readonly attributes = new Map<ATTRIBUTE_CODE, AttributeValue>()

  /** P1: 调试追踪端口（静态注入——实体深埋于参与者内部，经 BattleParticipantImpl.setTracePort 转发） */
  private static tracePort: IDebugTracePort | null = null
  private static recalcSeq = 0

  /** 设置调试追踪端口（BattleSystem 初始化时注入） */
  static setTracePort(port: IDebugTracePort | null): void {
    ParticipantStats.tracePort = port
  }

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
      const meta = getAttrMeta(code)
      const baseValue = normalized[code] ?? getAttrDv(code)
      this.initAttribute(code, baseValue, meta?.isPercentage ?? false)
    }
    // 初始化后使缓存失效，强制第一次读取时重算
    this.invalidateCache()
  }

  reCalAttributeValue(attr: ATTRIBUTE_CODE): AttributeValue | undefined {
    this.recalcAttribute(attr)
    return this.attributes.get(attr)
  }

  getAttrVal(attr: ATTRIBUTE_CODE): number {
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

  /** 归属实体 ID（由宿主 BattleEntity 设置，供 ATTRIBUTE_RECALC 事件定位） */
  private ownerId = ''

  /** 归属实体名称（供事件摘要展示——调试日志面向开发者，显示名字而非内部 ID） */
  private ownerName = ''

  setOwnerId(id: string): void {
    this.ownerId = id
  }

  setOwnerName(name: string): void {
    this.ownerName = name
  }

  /** 本次重算的触发源（文档 §5 示例 4 triggeredBy），由 recalculateAll 调用方传入 */
  private pendingTriggerSource?: string

  recalculateAll(triggerSource?: string): void {
    this.pendingTriggerSource = triggerSource
    this.invalidateCache()
    for (const code of Object.values(ATTRIBUTE_CODE)) {
      this.recalcAttribute(code)
    }
  }

  private recalcAttribute(attrCode: ATTRIBUTE_CODE): void {
    const attrData: AttributeValue | undefined = this.attributes.get(attrCode)
    if (!attrData) return

    // ponytail: 跳过运行时状态属性（血量、能量），它们由 setAttributeValue 单独维护，不从公式重算
    const meta = getAttrMeta(attrCode)
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
    const before = attrData.value
    const after = round(value, 2)
    attrData.value = after
    // P1: ATTRIBUTE_RECALC 事件（trace 级高频，文档 §5 示例 4）
    //     只记录值实际变化的属性：invalidateCache 会对全部属性幂等重算，
    //     绝大多数属性无修饰符变化（before === after），记录即噪音（与 steps 同原则）
    if (
      ParticipantStats.tracePort?.isEnabled(TracePhase.ATTRIBUTE_RECALC) &&
      before !== after
    ) {
      // before 的 breakdown 用上次计算记录（attrData.breakdown），after 用本次计算的 modifier 拆解
      const prev = attrData.breakdown
      ParticipantStats.tracePort.emit(
        createTraceEvent({
          correlationId: `attr_recalc_${attrCode}_${++ParticipantStats.recalcSeq}`,
          phase: TracePhase.ATTRIBUTE_RECALC,
          level: TraceLevel.TRACE,
          summary: `属性重算 ${this.ownerName || this.ownerId} ${attrCode} ${before} → ${after}`,
          payload: {
            entityId: this.ownerId,
            attribute: attrCode,
            triggeredBy: this.pendingTriggerSource,
            before: {
              base: prev?.base ?? attrData.base,
              additive: prev?.additive ?? 0,
              // prev.percentMultiplier 已是归一化值（存时除以 100），无需再除
              percent: prev?.percentMultiplier ?? 1,
              final: before,
            },
            after: {
              base: attrData.base,
              additive,
              percent: percentMultiplier / 100,
              final: after,
            },
          },
        }),
      )
    }
    // 记录计算拆解
    attrData.breakdown = {
      base: attrData.base,
      additive,
      percentMultiplier: percentMultiplier / 100,
      independentMultiplier: independentMultiplier / 100,
      finalMultiplier: finalMultiplier / 100,
    }
    // 更新版本戳，标记为已计算
    attrData.cachedVersion = this.version
  }
}

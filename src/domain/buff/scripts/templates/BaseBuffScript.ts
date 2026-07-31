import type { IBuffScript, BuffEffectLine } from '@/domain/buff/types'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { BuffErrorBoundary } from '@/domain/buff/BuffErrorBoundary'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { LogLevel } from '@/shared/types/battle-log'

export abstract class BaseBuffScript<TParams = any> implements IBuffScript<TParams> {
  params?: TParams
  
  public onApply(context: BuffContext): void {
    BuffErrorBoundary.wrap(() => {
      this._onApply(context)
    })
  }

  public onRemove(context: BuffContext): void {
    BuffErrorBoundary.wrap(() => {
      this._onRemove(context)
    })
    // NOTE: 修饰符清理由 BuffSystem.removeBuff → modifierStack.removeModifier(instanceId) 统一处理，
    //       不在脚本层调用 context.removeModifiers()。
  }

  public onUpdate(context: BuffContext): void {
    BuffErrorBoundary.wrap(() => {
      this._onUpdate(context)
    })
  }

  public onRefresh(context: BuffContext): void {
    BuffErrorBoundary.wrap(() => {
      this._onRefresh(context)
    })
  }

  protected abstract _onApply(context: BuffContext): void
  protected abstract _onRemove(context: BuffContext): void
  protected abstract _onUpdate(context: BuffContext): void
  protected abstract _onRefresh(context: BuffContext): void

  protected addModifier(
    context: BuffContext,
    attribute: ATTRIBUTE_CODE,
    value: number,
    type: ModifierType
  ): void {
    context.addModifier(attribute, value, type)
  }

  protected getConfigValue<T>(
    context: BuffContext,
    key: string,
    defaultValue: T
  ): T {
    return context.config.parameters?.[key] ?? defaultValue
  }

  protected log(context: BuffContext, message: string): void {
    LoggerProvider.logger.addDebugLog(`[${context.config.id}] ${message}`, { level: LogLevel.DEBUG })
  }

  protected triggerEvent(
    context: BuffContext,
    eventName: string,
    data?: unknown
  ): void {
    context.triggerEvent(eventName, data)
  }

  /** 默认实现：无特殊效果行。子类可覆盖此方法返回 DOT/HEAL/护盾等文本 */
  public getEffectLines(_context: BuffContext): BuffEffectLine[] {
    return []
  }
}


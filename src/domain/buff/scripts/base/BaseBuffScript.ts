import type { IBuffScript, BuffEffectLine } from '@/domain/buff/types'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { BuffErrorBoundary } from '@/domain/buff/BuffErrorBoundary'
import { ModifierType } from '@/domain/attribute/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

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
    // ponytail: 修饰符清理由 BuffSystem.removeBuff → modifierStack.removeModifier(instanceId) 统一处理。
    //           BaseBuffScript 不再调用 context.removeModifiers()，避免 double-free 但无害。
    //           AttributeBuffTemplate._onRemove 的注释提到"context.removeModifiers() 已由基类调用"，
    //           该注释已过时——当前仅执行 _onRemove 回调，修饰符清理由系统层负责。
  }

  public onUpdate(context: BuffContext, deltaTime: number): void {
    BuffErrorBoundary.wrap(() => {
      this._onUpdate(context, deltaTime)
    })
  }

  public onRefresh(context: BuffContext): void {
    BuffErrorBoundary.wrap(() => {
      this._onRefresh(context)
    })
  }

  protected abstract _onApply(context: BuffContext): void
  protected abstract _onRemove(context: BuffContext): void
  protected abstract _onUpdate(context: BuffContext, deltaTime: number): void
  protected abstract _onRefresh(context: BuffContext): void

  protected addModifier(
    context: BuffContext,
    attribute: string,
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
    LoggerProvider.logger.addDebugLog(`[${context.config.id}] ${message}`)
  }

  protected triggerEvent(
    context: BuffContext,
    eventName: string,
    data?: any
  ): void {
    context.triggerEvent(eventName, data)
  }

  /** 默认实现：无特殊效果行。子类可覆盖此方法返回 DOT/HOT/护盾等文本 */
  public getEffectLines(_context: BuffContext): BuffEffectLine[] {
    return []
  }
}


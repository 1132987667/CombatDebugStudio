import type { IBuffScript } from '@/types/buff'
import type { BuffContext } from '@/core/BuffContext'
import { BuffErrorBoundary } from '@/core/BuffErrorBoundary'
import { battleLogManager } from '@/utils/logging'

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
      context.removeModifiers()
    })
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
    type: 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE'
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
    battleLogManager.debug(`[${context.config.id}] ${message}`)
  }

  protected triggerEvent(
    context: BuffContext,
    eventName: string,
    data?: any
  ): void {
    context.triggerEvent(eventName, data)
  }
}

import type { IAtomicEffect } from './types'
import { AtomicEffectType } from './types'
import { ModifierEffect } from './effects/ModifierEffect'
import { DotEffect } from './effects/DotEffect'
import { HotEffect } from './effects/HotEffect'
import { ControlEffect } from './effects/ControlEffect'
import { ShieldEffect } from './effects/ShieldEffect'
import { TriggerEffect } from './effects/TriggerEffect'
import { AuraEffect } from './effects/AuraEffect'
import { ImmunityEffect } from './effects/ImmunityEffect'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { LogLevel } from '@/shared/types/battle-log'

/**
 * 原子效果注册表 — 管理 7 + 1 种内置原语，并提供扩展点
 */
export class AtomicEffectRegistry {
  private handlers = new Map<AtomicEffectType, IAtomicEffect>()

  constructor() {
    this.register(new ModifierEffect())
    this.register(new DotEffect())
    this.register(new HotEffect())
    this.register(new ControlEffect())
    this.register(new ShieldEffect())
    this.register(new TriggerEffect())
    this.register(new AuraEffect())
    this.register(new ImmunityEffect())
  }

  register(handler: IAtomicEffect): void {
    this.handlers.set(handler.type, handler)
  }

  get(type: AtomicEffectType): IAtomicEffect | undefined {
    return this.handlers.get(type)
  }

  /** 扩展点：允许外部注册自定义原子效果（JSON type 字符串映射） */
  registerCustom(type: string, handler: IAtomicEffect): void {
    if (!Object.values(AtomicEffectType).includes(type as AtomicEffectType)) {
      LoggerProvider.logger.addDebugLog(`[AtomicEffectRegistry] 注册非标准原子效果类型: ${type}，请确认拼写正确`, { level: LogLevel.WARN })
    }
    this.handlers.set(type as AtomicEffectType, handler)
  }
}

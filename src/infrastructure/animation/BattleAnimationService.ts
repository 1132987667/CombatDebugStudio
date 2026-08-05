/**
 * 文件: BattleAnimationService.ts
 * 功能: 战斗动画服务
 * 描述: 使用 GSAP 实现战斗动画效果，支持倍速控制
 */

import gsap from 'gsap'
import { ActionResultType } from '@/domain/battle/type/types'

/** prefers-reduced-motion：用户系统开启"减少动态效果"时跳过/缩短动画（无障碍要求） */
const prefersReducedMotion = (): boolean => {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface AnimationConfig {
  battleSpeed: number
}

export const Side = {
  LEFT: 'left',
  RIGHT: 'right',
} as const
export type SideType = (typeof Side)[keyof typeof Side]
export interface AttackAnimationData {
  attackerId: string
  attackerElement: HTMLElement
  attackerSide: SideType
  skillName?: string
  /** 固定预算模型中的总预算 T（ms），用于按比例排期突进时长 */
  budget?: number
}

export interface HitAnimationData {
  targetId: string
  targetElement: HTMLElement
  damage?: number
  hitEffect: ActionResultType
  isCritical?: boolean
  skillName?: string
  passiveName?: string
}

export interface ShakeAnimationData {
  targetElement: HTMLElement
  intensity?: 'light' | 'medium' | 'heavy'
}

export class BattleAnimationService {
  private battleSpeed: number = 1
  private activeAnimations: gsap.core.Timeline[] = []
  private activeTweens: gsap.core.Tween[] = []

  // ponytail: 突进要快——出去 150ms 回来 150ms，配合 back.out 弹性回位
  private readonly BASE_ATTACK_DURATION = 300
  private readonly SKILL_NAME_DELAY = 180
  private readonly SKILL_NAME_MOVE_DURATION = 180
  private readonly SKILL_NAME_FADE_DURATION = 360
  private readonly HIT_SHAKE_DELAY = 180

  constructor(config?: AnimationConfig) {
    if (config) {
      this.battleSpeed = config.battleSpeed
    }
  }

  setBattleSpeed(speed: number): void {
    this.battleSpeed = Math.max(1, Math.min(5, speed))
  }

  getBattleSpeed(): number {
    return this.battleSpeed
  }

  private getScaledDuration(baseDuration: number): number {
    return baseDuration / this.battleSpeed
  }

  private createTimeline(): gsap.core.Timeline {
    const timeline = gsap.timeline()
    this.activeAnimations.push(timeline)
    return timeline
  }

  playAttackAnimation(data: AttackAnimationData): Promise<void> {
    // 无障碍：减少动效时跳过动画（攻击者回原位 = 初始态，无副作用）
    if (prefersReducedMotion()) return Promise.resolve()

    return new Promise((resolve) => {
      const timeline = this.createTimeline()
      const moveDistance = 30
      const direction = data.attackerSide === Side.LEFT ? 1 : -1

      // NOTE: 固定预算模型 — budget 优先，按 windup 占比（20%T）分配
      const attackDuration = data.budget
        ? data.budget * 0.2
        : this.getScaledDuration(this.BASE_ATTACK_DURATION)
      const halfDuration = attackDuration / 2

      timeline
        .to(data.attackerElement, {
          x: moveDistance * direction,
          duration: halfDuration / 1000,
          ease: 'power3.out',
        })
        .to(data.attackerElement, {
          x: 0,
          duration: halfDuration / 1000,
          ease: 'back.out(1.2)',
          onComplete: () => {
            resolve()
          },
        })

      if (data.skillName) {
        this.playSkillNameAnimation(
          data.attackerElement,
          data.skillName,
          data.attackerSide as SideType,
        )
      }
    })
  }

  private playSkillNameAnimation(
    targetElement: HTMLElement,
    skillName: string,
    side: SideType,
  ): void {
    let skillElement: HTMLElement | null = targetElement.querySelector(
      '.floating-skill-name',
    )

    if (!skillElement) {
      skillElement = document.createElement('div')
      skillElement.className = 'floating-skill-name'
      skillElement.style.cssText = `
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        font-size: 14px;
        font-weight: bold;
        color: var(--color-energy-deep);
        text-shadow: 0 0 10px rgba(var(--rgb-energy), 0.8);
        pointer-events: none;
        z-index: var(--z-float);
        white-space: nowrap;
      `
      targetElement.style.position = 'relative'
      targetElement.appendChild(skillElement)
    }

    skillElement.textContent = skillName
    skillElement.style.opacity = '1'
    skillElement.style.transform = 'translate(-50%, -50%) scale(1)'

    const timeline = this.createTimeline()
    const delayMs = this.getScaledDuration(this.SKILL_NAME_DELAY)
    const moveDurationMs = this.getScaledDuration(this.SKILL_NAME_MOVE_DURATION)
    const fadeDurationMs = this.getScaledDuration(this.SKILL_NAME_FADE_DURATION)

    const direction = side === Side.LEFT ? -1 : 1

    timeline
      .set(skillElement, { opacity: 1, scale: 1, y: 0 })
      .to(skillElement, {
        y: -30 * direction,
        scale: 0.8,
        duration: moveDurationMs / 1000,
        ease: 'power2.out',
        delay: delayMs / 1000,
      })
      .to(skillElement, {
        opacity: 0,
        scale: 0.3,
        duration: fadeDurationMs / 1000,
        ease: 'power2.in',
        onComplete: () => {
          if (skillElement && skillElement.parentNode) {
            skillElement.parentNode.removeChild(skillElement)
          }
        },
      })
  }

  playHitAnimation(data: HitAnimationData): Promise<void> {
    // 无障碍：减少动效时跳过受击动画（伤害文本由日志兜底）
    if (prefersReducedMotion()) return Promise.resolve()

    return new Promise((resolve) => {
      const timeline = this.createTimeline()

      this.playShakeAnimation({
        targetElement: data.targetElement,
        intensity: data.isCritical ? 'heavy' : 'medium',
      })

      this.playFlashAnimation(data.targetElement, data.hitEffect)

      const delayMs = this.getScaledDuration(this.HIT_SHAKE_DELAY)

      if (data.hitEffect === ActionResultType.MISS) {
        // NOTE: Miss 文本由 BattleVisualEffects.showMissText 统一接管，此处只做震屏+闪光
      } else if (data.passiveName) {
        this.playPassiveTextAnimation(
          data.targetElement,
          data.passiveName,
          delayMs,
        )
      } else if (data.damage !== undefined) {
        this.playDamageTextAnimation(
          data.targetElement,
          data.damage,
          data.hitEffect,
          data.isCritical,
          delayMs,
        )
      }

      const totalDuration = this.getScaledDuration(
        this.HIT_SHAKE_DELAY +
          this.SKILL_NAME_MOVE_DURATION +
          this.SKILL_NAME_FADE_DURATION,
      )

      timeline.to(
        {},
        {
          duration: totalDuration / 1000,
          onComplete: resolve,
        },
      )
    })
  }

  playShakeAnimation(data: ShakeAnimationData): void {
    if (prefersReducedMotion()) return

    const intensityMap = {
      light: { distance: 3, times: 3 },
      medium: { distance: 5, times: 5 },
      heavy: { distance: 8, times: 7 },
    }

    const { distance, times } = intensityMap[data.intensity || 'medium']
    const shakeDuration = this.getScaledDuration(50)

    gsap.to(data.targetElement, {
      x: `+=${distance}`,
      duration: shakeDuration / 1000,
      repeat: times * 2 - 1,
      yoyo: true,
      ease: 'power1.inOut',
    })
  }

  private playFlashAnimation(
    targetElement: HTMLElement,
    hitEffect: ActionResultType,
  ): void {
    const flashColor =
      hitEffect === ActionResultType.HEAL
        ? 'rgba(var(--rgb-success), var(--alpha-glow))'
        : 'rgba(var(--rgb-danger), var(--alpha-glow))'

    const hpBar = targetElement.querySelector('.hp-fill') as HTMLElement
    if (hpBar) {
      const timeline = this.createTimeline()
      timeline
        .to(hpBar, {
          boxShadow: `0 0 15px ${flashColor}`,
          duration: this.getScaledDuration(50) / 1000,
        })
        .to(hpBar, {
          boxShadow: 'none',
          duration: this.getScaledDuration(100) / 1000,
        })
    }

    const timeline = this.createTimeline()
    timeline
      .to(targetElement, {
        backgroundColor: flashColor,
        duration: this.getScaledDuration(50) / 1000,
      })
      .to(targetElement, {
        backgroundColor: 'transparent',
        duration: this.getScaledDuration(100) / 1000,
      })
  }

  private playDamageTextAnimation(
    targetElement: HTMLElement,
    damage: number,
    type: ActionResultType,
    isCritical?: boolean,
    delayMs: number = 0,
  ): void {
    const textElement = document.createElement('div')
    textElement.className = 'floating-damage-text'

    const colorMap: Partial<Record<ActionResultType, string>> = {
      [ActionResultType.DAMAGE]: 'var(--color-damage)',
      [ActionResultType.HEAL]: 'var(--color-heal)',
      [ActionResultType.CRITICAL]: 'var(--color-crit)',
    }

    const prefix = type === ActionResultType.HEAL ? '+' : '-'
    const suffix = isCritical ? '!' : ''

    textElement.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      font-size: ${isCritical ? '24px' : '18px'};
      font-weight: bold;
      color: ${colorMap[type]};
      text-shadow: 0 0 10px ${colorMap[type]};
      pointer-events: none;
      z-index: 100;
    `
    textElement.textContent = `${prefix}${Math.abs(damage)}${suffix}`

    targetElement.style.position = 'relative'
    targetElement.appendChild(textElement)

    const timeline = this.createTimeline()
    const moveDurationMs = this.getScaledDuration(this.SKILL_NAME_MOVE_DURATION)
    const fadeDurationMs = this.getScaledDuration(this.SKILL_NAME_FADE_DURATION)

    timeline
      .set(textElement, { opacity: 1, scale: 1, y: 0 })
      .to(textElement, {
        y: -40,
        scale: 0.8,
        duration: moveDurationMs / 1000,
        ease: 'power2.out',
        delay: delayMs / 1000,
      })
      .to(textElement, {
        opacity: 0,
        scale: 0.3,
        duration: fadeDurationMs / 1000,
        ease: 'power2.in',
        onComplete: () => {
          if (textElement.parentNode) {
            textElement.parentNode.removeChild(textElement)
          }
        },
      })
  }

  private playPassiveTextAnimation(
    targetElement: HTMLElement,
    passiveName: string,
    delayMs: number,
  ): void {
    const textElement = document.createElement('div')
    textElement.className = 'floating-passive-text'

    textElement.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      font-size: 14px;
      font-weight: bold;
      color: var(--color-debuff);
      text-shadow: 0 0 10px rgba(var(--rgb-debuff), 0.8);
      pointer-events: none;
      z-index: 100;
    `
    textElement.textContent = passiveName

    targetElement.style.position = 'relative'
    targetElement.appendChild(textElement)

    const timeline = this.createTimeline()
    const moveDurationMs = this.getScaledDuration(this.SKILL_NAME_MOVE_DURATION)
    const fadeDurationMs = this.getScaledDuration(this.SKILL_NAME_FADE_DURATION)

    timeline
      .set(textElement, { opacity: 1, scale: 1, y: 0 })
      .to(textElement, {
        y: -40,
        scale: 0.8,
        duration: moveDurationMs / 1000,
        ease: 'power2.out',
        delay: delayMs / 1000,
      })
      .to(textElement, {
        opacity: 0,
        scale: 0.3,
        duration: fadeDurationMs / 1000,
        ease: 'power2.in',
        onComplete: () => {
          if (textElement.parentNode) {
            textElement.parentNode.removeChild(textElement)
          }
        },
      })
  }

  playBuffAnimation(
    targetElement: HTMLElement,
    isPositive: boolean,
  ): Promise<void> {
    // 无障碍：减少动效时跳过 Buff 辉光
    if (prefersReducedMotion()) return Promise.resolve()

    return new Promise((resolve) => {
      const timeline = this.createTimeline()
      const color = isPositive
        ? 'rgba(var(--rgb-energy), 0.8)'
        : 'rgba(var(--rgb-danger), 0.8)'
      const duration = this.getScaledDuration(500)

      timeline
        .to(targetElement, {
          boxShadow: `0 0 20px ${color}`,
          filter: 'brightness(1.2)',
          duration: duration / 2000,
          ease: 'power2.out',
        })
        .to(targetElement, {
          boxShadow: 'none',
          filter: 'brightness(1)',
          duration: duration / 2000,
          ease: 'power2.in',
          onComplete: resolve,
        })
    })
  }

  stopAllAnimations(): void {
    this.activeAnimations.forEach((timeline) => {
      timeline.kill()
    })
    this.activeTweens.forEach((tween) => {
      tween.kill()
    })
    this.activeAnimations = []
    this.activeTweens = []

    document
      .querySelectorAll(
        '.floating-skill-name, .floating-damage-text, .floating-passive-text',
      )
      .forEach((el) => {
        el.remove()
      })
  }
}

export const battleAnimationService = new BattleAnimationService()

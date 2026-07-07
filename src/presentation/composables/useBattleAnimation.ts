/**
 * 文件: useBattleAnimation.ts
 * 功能: 战斗动画 Vue Composable
 * 描述: 封装 BattleAnimationService，提供 Vue 组件可用的动画接口
 */

import { ref, onUnmounted, watch, type Ref } from 'vue'
import {
  BattleAnimationService,
  battleAnimationService,
  type AttackAnimationData,
  type HitAnimationData,
} from '@/infrastructure/animation/BattleAnimationService'

export interface UseBattleAnimationOptions {
  battleSpeed?: Ref<number>
}

export interface AnimationState {
  isPlaying: boolean
  currentAnimation: string | null
}

export function useBattleAnimation(options: UseBattleAnimationOptions = {}) {
  const animationService = ref<BattleAnimationService>(battleAnimationService)
  const state = ref<AnimationState>({
    isPlaying: false,
    currentAnimation: null,
  })

  const elementRefs = new Map<string, HTMLElement | null>()

  if (options.battleSpeed) {
    watch(options.battleSpeed, (newSpeed) => {
      animationService.value.setBattleSpeed(newSpeed)
    }, { immediate: true })
  }

  function registerElement(id: string, element: HTMLElement | null): void {
    elementRefs.set(id, element)
  }

  function unregisterElement(id: string): void {
    elementRefs.delete(id)
  }

  function getElement(id: string): HTMLElement | null {
    return elementRefs.get(id) || null
  }

  async function playAttackAnimation(
    attackerId: string,
    attackerSide: 'left' | 'right',
    skillName?: string
  ): Promise<void> {
    const attackerElement = getElement(attackerId)
    if (!attackerElement) {
      console.warn(`[useBattleAnimation] 未找到攻击方元素: ${attackerId}`)
      return
    }

    state.value.isPlaying = true
    state.value.currentAnimation = 'attack'

    try {
      await animationService.value.playAttackAnimation({
        attackerId,
        attackerElement,
        attackerSide,
        skillName,
      })
    } finally {
      state.value.isPlaying = false
      state.value.currentAnimation = null
    }
  }

  async function playHitAnimation(
    targetId: string,
    data: {
      damage?: number
      damageType: 'damage' | 'heal' | 'critical' | 'miss'
      isCritical?: boolean
      skillName?: string
      passiveName?: string
    }
  ): Promise<void> {
    const targetElement = getElement(targetId)
    if (!targetElement) {
      console.warn(`[useBattleAnimation] 未找到目标元素: ${targetId}`)
      return
    }

    state.value.isPlaying = true
    state.value.currentAnimation = 'hit'

    try {
      await animationService.value.playHitAnimation({
        targetId,
        targetElement,
        ...data,
      })
    } finally {
      state.value.isPlaying = false
      state.value.currentAnimation = null
    }
  }

  async function playBuffAnimation(
    targetId: string,
    isPositive: boolean
  ): Promise<void> {
    const targetElement = getElement(targetId)
    if (!targetElement) {
      console.warn(`[useBattleAnimation] 未找到目标元素: ${targetId}`)
      return
    }

    state.value.isPlaying = true
    state.value.currentAnimation = 'buff'

    try {
      await animationService.value.playBuffAnimation(targetElement, isPositive)
    } finally {
      state.value.isPlaying = false
      state.value.currentAnimation = null
    }
  }

  async function playDeathAnimation(targetId: string): Promise<void> {
    const targetElement = getElement(targetId)
    if (!targetElement) {
      console.warn(`[useBattleAnimation] 未找到目标元素: ${targetId}`)
      return
    }

    state.value.isPlaying = true
    state.value.currentAnimation = 'death'

    try {
      await animationService.value.playDeathAnimation(targetElement)
    } finally {
      state.value.isPlaying = false
      state.value.currentAnimation = null
    }
  }

  function setBattleSpeed(speed: number): void {
    animationService.value.setBattleSpeed(speed)
  }

  function getAnimationDuration(): number {
    return animationService.value.getAnimationDuration()
  }

  function stopAllAnimations(): void {
    animationService.value.stopAllAnimations()
    state.value.isPlaying = false
    state.value.currentAnimation = null
  }

  onUnmounted(() => {
    stopAllAnimations()
    elementRefs.clear()
  })

  return {
    animationService,
    state,
    registerElement,
    unregisterElement,
    playAttackAnimation,
    playHitAnimation,
    playBuffAnimation,
    playDeathAnimation,
    setBattleSpeed,
    getAnimationDuration,
    stopAllAnimations,
  }
}

export type UseBattleAnimationReturn = ReturnType<typeof useBattleAnimation>

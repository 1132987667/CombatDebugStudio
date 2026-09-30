// @vitest-environment happy-dom
/**
 * 属性面板显示口径回归（数值精度规范 §2「面板主值显示」行）
 *
 * 锁两件事：
 * 1. 六维面板显示四舍五入到最多 1 位——用 87.54（round→87.5，ceil 会是 87.6）
 *    与 97.56（round→97.6，floor 会是 97.5）两个值把 round 语义钉死，排除 floor/ceil 漂移；
 * 2. sixAttrVal 不再 Math.round（否则小数活不到显示层，面板与昊天镜/唤灵台不同源）。
 *
 * 运行: npx vitest run tests/unit/presentation/character-attrs-display.test.ts
 */
import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useCharacterAttrs } from '@/presentation/modules/yanjie/xiyou/characterAttrs'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

describe('属性面板显示口径（最多 1 位、四舍五入）', () => {
  it('六维显示 round 语义：87.54→87.5（非 ceil 87.6）、97.56→97.6（非 floor 97.5）', () => {
    setActivePinia(createPinia())
    const store = usePlayerStore()
    store.playerAttributes[ATTRIBUTE_CODE.speed] = 87.54
    store.playerAttributes[ATTRIBUTE_CODE.hitValue] = 97.56

    const { attrText } = useCharacterAttrs()
    const entry = (code: ATTRIBUTE_CODE) => ({ code, displayName: code, isPercentage: false })
    expect(attrText(entry(ATTRIBUTE_CODE.speed))).toBe('87.5')
    expect(attrText(entry(ATTRIBUTE_CODE.hitValue))).toBe('97.6')
  })

  it('sixAttrVal 保留计算精度不取整：面板与存储同源对账', () => {
    setActivePinia(createPinia())
    const store = usePlayerStore()
    store.playerAttributes[ATTRIBUTE_CODE.speed] = 87.54

    const { attrVal } = useCharacterAttrs()
    expect(attrVal(ATTRIBUTE_CODE.speed)).toBe(87.54)
  })

  it('气血/法力文本最多 1 位小数', () => {
    setActivePinia(createPinia())
    const store = usePlayerStore()
    store.playerAttributes[ATTRIBUTE_CODE.currentHealth] = 817.7
    store.playerAttributes[ATTRIBUTE_CODE.maxHealth] = 817.7
    store.playerAttributes[ATTRIBUTE_CODE.currentEnergy] = 150
    store.playerAttributes[ATTRIBUTE_CODE.maxEnergy] = 150

    const { hpText, energyText } = useCharacterAttrs()
    expect(hpText.value).toBe('817.7/817.7')
    expect(energyText.value).toBe('150/150')
  })
})

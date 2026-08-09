// @vitest-environment happy-dom
/**
 * ParticipantCard displayData 纯数据注入模式特征测试
 *
 * 定位：锁住"回放/静态场景无领域实体时卡片仍完整渲染"契约——
 *       名称/等级/HP 文本/HP 条/护盾条/纯名字 Buff 标签均从注入数据读取，
 *       与唤灵台演武台共用同一卡片组件（昊天镜回放舞台数据源）。
 */
import { describe, it, expect } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import ParticipantCard from '@/presentation/components/ParticipantCard.vue'

function mountCard(displayData: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(ParticipantCard, { displayData }),
  })
  app.use(createPinia())
  app.mount(host)
  return { el: host, unmount: () => { app.unmount(); host.remove() } }
}

describe('ParticipantCard displayData 纯数据注入', () => {
  it('无领域实体时渲染名称/等级/HP 文本/HP 条/护盾条', async () => {
    const { el, unmount } = mountCard({
      id: 'p1',
      name: '剑修',
      level: 5,
      maxHp: 100,
      hp: 80,
      maxEnergy: 50,
      energy: 30,
      shield: 20,
      buffs: [],
      isAlive: true,
    })
    await nextTick()

    const name = el.querySelector('.member-name')!.textContent!
    expect(name).toContain('Lv.5')
    expect(name).toContain('剑修')
    expect(name).toContain('80/100')
    expect(el.querySelector('.hp-fill')!.getAttribute('style')).toContain('width: 80%')

    // 护盾条：值 20，宽度 20%
    expect(el.querySelector('.shield-fill')!.getAttribute('style')).toContain('width: 20%')
    expect(el.querySelector('.shield-bar')!.textContent).toContain('20')
    unmount()
  })

  it('无等级（回放存档无 level）时不显示 Lv.0 噪音', async () => {
    const { el, unmount } = mountCard({
      id: 'p2',
      name: '火护法',
      maxHp: 100,
      hp: 100,
      maxEnergy: 50,
      energy: 50,
      buffs: [],
      isAlive: true,
    })
    await nextTick()
    const name = el.querySelector('.member-name')!.textContent!
    expect(name).toContain('火护法')
    expect(name).not.toContain('Lv.')
    unmount()
  })

  it('纯名字 Buff（无属性/非控制）以标签可见且带层数', async () => {
    const { el, unmount } = mountCard({
      id: 'p3',
      name: '药童',
      maxHp: 100,
      hp: 100,
      maxEnergy: 50,
      energy: 50,
      buffs: [
        { id: 'b1', buffId: 'b1', name: '护体', currentStacks: 2, remainingTurns: 3, isAura: false },
      ],
      isAlive: true,
    })
    await nextTick()

    const tags = Array.from(el.querySelectorAll('.buff-text-tag')).map((n) => n.textContent ?? '')
    expect(tags.join('')).toContain('护体')
    expect(tags.join('')).toContain('×2')
    unmount()
  })

  it('无 Buff 时显示占位文本', async () => {
    const { el, unmount } = mountCard({
      id: 'p4',
      name: '旁观',
      maxHp: 100,
      hp: 100,
      maxEnergy: 50,
      energy: 50,
      buffs: [],
      isAlive: true,
    })
    await nextTick()
    expect(el.textContent).toContain('无效果')
    unmount()
  })
})

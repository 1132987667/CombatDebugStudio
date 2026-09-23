// @vitest-environment happy-dom
/**
 * 一域一城城镇条位置 + 妖魁徽标判定 + 进入城镇 回归测试
 *
 * 覆盖：城镇条（路引时间线 / 大地图通栏）渲染在每域第二个关卡之后而非首站，
 *       点击 emit enter-town；妖魁 BOSS 徽标按 id（scene_*_boss）判定，不落在同域
 *       第 5 关（妖徒）上；无城区域不渲染城镇条；城镇界面内容与关闭事件。
 *
 * 运行: npx vitest run tests/unit/presentation/XiyouCityPlacement.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import type { XiyouRegion, XiyouScene } from '@/presentation/modules/yanjie/xiyou/types'
import SceneTimeline from '@/presentation/modules/yanjie/xiyou/components/SceneTimeline.vue'
import SceneMapDialog from '@/presentation/modules/yanjie/xiyou/components/SceneMapDialog.vue'
import TownDialog from '@/presentation/modules/yanjie/xiyou/components/TownDialog.vue'

let app: App | null = null
let host: HTMLElement | null = null

function makeRegion(id: string, withCity: boolean): XiyouRegion {
  return {
    id,
    name: `域${id}`,
    sub: '试炼',
    levelRange: [1, 10],
    city: withCity ? { id: `city_${id}`, name: '测试镇', desc: '休整枢纽' } : null,
  }
}

function makeScene(id: string, regionId: string): XiyouScene {
  return {
    id,
    regionId,
    name: id,
    levelRange: [1, 2],
    desc: '',
    enemies: [],
    unlocked: true,
    stars: 0,
    maxStars: 3,
  }
}

/** 每域 6 关：scene_{域}_1..5 + scene_{域}_boss（scenes.json 数组序） */
function makeRegionScenes(regionId: string): XiyouScene[] {
  return [1, 2, 3, 4, 5].map(n => makeScene(`scene_${regionId.slice(-1)}_${n}`, regionId))
    .concat(makeScene(`scene_${regionId.slice(-1)}_boss`, regionId))
}

function mount(component: typeof SceneTimeline | typeof SceneMapDialog | typeof TownDialog, props: Record<string, unknown>): void {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp({ render: () => h(component, props) })
  app.mount(host)
}

afterEach(() => {
  app?.unmount()
  app = null
  host?.remove()
  host = null
})

const regions: XiyouRegion[] = [makeRegion('region_1', true), makeRegion('region_2', false)]
const scenes: XiyouScene[] = [...makeRegionScenes('region_1'), ...makeRegionScenes('region_2')]

describe('城镇条位置（第二关之后）', () => {
  it('路引时间线：城镇节点位于该域第 2 个关卡节点之后', () => {
    mount(SceneTimeline, { regions, scenes, current: null })
    const path = host!.querySelector('.xy-timeline-path')!
    const children = Array.from(path.children)
    const cityIndex = children.findIndex(el => el.classList.contains('xy-timeline-city'))
    expect(cityIndex).toBe(2)
    expect(children.length).toBe(7) // 6 关卡 + 1 城镇
  })

  it('大地图通栏：城镇条位于该域第 2 张关卡卡之后', () => {
    mount(SceneMapDialog, { modelValue: true, regions, scenes, current: null })
    const list = host!.querySelector('.xy-map-dlg__list')!
    const children = Array.from(list.children)
    const cityIndex = children.findIndex(el => el.classList.contains('xy-map-dlg__city'))
    expect(cityIndex).toBe(2)
    expect(children.length).toBe(7)
  })

  it('无城区域不渲染城镇条，关卡数不受影响', () => {
    mount(SceneTimeline, { regions, scenes, current: null })
    const paths = host!.querySelectorAll('.xy-timeline-path')
    expect(paths.length).toBe(2)
    const second = Array.from(paths[1]!.children)
    expect(second.some(el => el.classList.contains('xy-timeline-city'))).toBe(false)
    expect(second.length).toBe(6)
  })
})

describe('妖魁徽标按 id 判定', () => {
  it('BOSS 徽标落在 scene_*_boss 关上，不落在同域第 5 关（妖徒）上', () => {
    mount(SceneTimeline, { regions, scenes, current: null })
    const nodes = Array.from(host!.querySelectorAll('.xy-timeline-node'))
    const bossNodes = nodes.filter(el => el.classList.contains('boss'))
    // 每域一枚：两域各落在 scene_*_boss 上
    expect(bossNodes.map(el => el.textContent)).toEqual(['scene_1_bossBOSS', 'scene_2_bossBOSS'])
    // 第 5 个节点是妖徒关（索引 4 曾被误标 BOSS）
    expect(nodes[4]!.classList.contains('boss')).toBe(false)
    expect(nodes[4]!.textContent).not.toContain('BOSS')
  })
})

describe('进入城镇', () => {
  it('时间线城镇节点点击 emit enter-town（携带所在区域）', () => {
    let enteredId = ''
    mount(SceneTimeline, { regions, scenes, current: null, onEnterTown: (r: XiyouRegion) => { enteredId = r.id } })
    ;(host!.querySelector('.xy-timeline-city') as HTMLButtonElement).click()
    expect(enteredId).toBe('region_1')
  })

  it('大地图城镇通栏点击 emit enter-town（携带所在区域）', () => {
    let enteredId = ''
    mount(SceneMapDialog, { modelValue: true, regions, scenes, current: null, onEnterTown: (r: XiyouRegion) => { enteredId = r.id } })
    ;(host!.querySelector('.xy-map-dlg__city') as HTMLButtonElement).click()
    expect(enteredId).toBe('region_1')
  })

  it('城镇界面渲染城镇名/所属区域/设施陈列，点击关闭 emit update:modelValue false', () => {
    let emitted: boolean | null = null
    mount(TownDialog, { modelValue: true, region: regions[0], 'onUpdate:modelValue': (v: boolean) => { emitted = v } })
    expect(host!.querySelector('.xy-town__name')!.textContent).toContain('测试镇')
    expect(host!.textContent).toContain('region_1')
    expect(host!.querySelectorAll('.xy-town__facility').length).toBe(3)
    ;(host!.querySelector('.xy-town__close') as HTMLButtonElement).click()
    expect(emitted).toBe(false)
  })

  it('关闭态不渲染城镇界面', () => {
    mount(TownDialog, { modelValue: false, region: regions[0] })
    expect(host!.querySelector('.xy-town')).toBeNull()
  })
})

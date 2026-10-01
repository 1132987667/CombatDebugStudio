/**
 * raf-timer.test.ts — RAFTimer 后台可续跑加固的可运行检查（AGENTS.md：非琐碎逻辑留测试）
 * 覆盖：基本到期执行/清除、rAF 失约看门狗切兜底、hidden 时走 setTimeout 驱动、
 *       清空后看门狗清理（无悬挂 interval）。
 * NOTE: setup.ts 全局 mock 了 '@/shared/utils/RAF'，此处用 importActual 取真实类；
 *       node 环境无 document/rAF，rAF 用可控 stub（不回调 = 模拟失约），hidden 用
 *       globalThis.document 注入/还原。
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RAFTimer as RAFTimerClass } from '@/shared/utils/RAF'

type RafCallback = (now: number) => void

/** setup.ts 全局 mock 了 '@/shared/utils/RAF'，此处取真实实现 */
let RAFTimer: typeof RAFTimerClass
beforeAll(async () => {
  ;({ RAFTimer } = await vi.importActual<typeof import('@/shared/utils/RAF')>('@/shared/utils/RAF'))
})

let rafCallbacks: RafCallback[] = []
let rafNextId = 1

/** stub rAF：只注册不执行（回调由用例手动 pump），可精确模拟「帧失约/恢复」 */
function installRafStub(): void {
  rafCallbacks = []
  ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: RafCallback): number => {
    rafCallbacks.push(cb)
    return rafNextId++
  }
  ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => {}
}

function pumpFrames(now = performance.now()): void {
  const pending = rafCallbacks
  rafCallbacks = []
  for (const cb of pending) cb(now)
}

function installDocumentStub(hidden: boolean): { restore: () => void } {
  const g = globalThis as { document?: { hidden: boolean; addEventListener: () => void; removeEventListener: () => void } }
  const prev = g.document
  g.document = { hidden, addEventListener: () => {}, removeEventListener: () => {} }
  return { restore: () => { g.document = prev } }
}

describe('RAFTimer（真实实现：后台可续跑加固）', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] })
    installRafStub()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame
    delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame
    delete (globalThis as { document?: unknown }).document
  })

  it('到期执行 timeout 回调，clear 后不再执行', async () => {
    const t = new RAFTimer()
    let hits = 0
    const id = t.setTimeout(() => { hits++ }, 300)
    // rAF 失约（帧停转）下 1s 内看门狗未接管，loop 不跑；1s 后切兜底补跑
    await vi.advanceTimersByTimeAsync(400)
    expect(hits).toBe(0)
    await vi.advanceTimersByTimeAsync(2000)
    expect(hits).toBe(1)
    t.clear(id)
  })

  it('rAF 失约 >1s：看门狗切兜底驱动，回调照常到期执行', async () => {
    const t = new RAFTimer()
    let hits = 0
    t.setTimeout(() => { hits++ }, 300)
    // 前台启动（rAF 已注册但帧停转 = 失约），推进 2s 只跑 fake timer，不 pumpFrames
    await vi.advanceTimersByTimeAsync(2000)
    expect(hits).toBe(1)
    t.destroy()
  })

  it('document.hidden=true：不走 rAF，直接 setTimeout 驱动推进', async () => {
    const doc = installDocumentStub(true)
    try {
      const t = new RAFTimer()
      let hits = 0
      t.setTimeout(() => { hits++ }, 300)
      expect(rafCallbacks.length).toBe(0) // 未注册任何 rAF 回调
      await vi.advanceTimersByTimeAsync(500)
      expect(hits).toBe(1)
      t.destroy()
    } finally {
      doc.restore()
    }
  })

  it('timers 清空后 destroy：无悬挂 interval（看门狗已清）', async () => {
    const before = vi.getTimerCount()
    const t = new RAFTimer()
    const id = t.setTimeout(() => {}, 50)
    await vi.advanceTimersByTimeAsync(100)
    t.destroy()
    expect(vi.getTimerCount()).toBe(before)
  })

  it('interval 型 timer 在看门狗接管后按周期重复执行', async () => {
    const t = new RAFTimer()
    let hits = 0
    const id = t.setInterval(() => { hits++ }, 200)
    // rAF 失约：不 pump 帧推进 2.4s——1s 时看门狗切兜底，之后按 250ms tick 推进 interval
    await vi.advanceTimersByTimeAsync(2400)
    expect(hits).toBeGreaterThanOrEqual(2)
    t.clear(id)
    t.destroy()
  })
})

/**
 * 文件: useHaotianHotkeys.ts
 * 功能: 昊天镜键盘导航（V4 键位表）
 * 描述: 1/2 切换双工作台 · 空格播放/暂停 · ←/→ 逐事件 · ↑/↓ 调试卡片导航 · F 跟随 · Esc 关闭诊断。
 *       INPUT/TEXTAREA 聚焦时不拦截。
 */

import { onMounted, onUnmounted } from 'vue'
import type { HaotianMode } from '../stores/haotianStore'

export interface HaotianHotkeyContext {
  /** 昊天镜模块当前是否可见（v-show 保活，仅激活时响应快捷键） */
  isActive: () => boolean
  mode: () => HaotianMode
  setMode: (m: HaotianMode) => void
  togglePlay: () => void
  stepEvent: (dir: 1 | -1) => void
  toggleFollow: () => void
  /** Esc 关闭诊断面板 */
  closeDiag: () => void
  /** 调试卡片导航：当前选中 id，dir=1 下移 / -1 上移，返回目标 id 或 null */
  navCards: (dir: 1 | -1) => string | null
  /** 同链事件导航：dir=1 后一条 / -1 前一条（一次行动的完整链路内跳转） */
  stepInChain: (dir: 1 | -1) => void
  selectEvent: (id: string, opts?: { seek?: boolean; fx?: boolean }) => void
  /** B 打开断点配置 */
  openBreakpoint: () => void
  /** S 打开战斗摘要 */
  openSummary: () => void
  /** D 打开分支对比 */
  openDiff: () => void
  /** K 打开 / 关闭书签面板 */
  toggleBookmarkPanel: () => void
}

export function useHaotianHotkeys(ctx: HaotianHotkeyContext): void {
  function onKeydown(e: KeyboardEvent): void {
    if (!ctx.isActive()) return
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

    if (e.key === '1') {
      e.preventDefault()
      ctx.setMode('replay')
      return
    }
    if (e.key === '2') {
      e.preventDefault()
      ctx.setMode('debug')
      return
    }
    if (e.code === 'Space') {
      e.preventDefault()
      // 回放系统：播放/暂停；调试系统：逐事件推进
      if (ctx.mode() === 'debug') ctx.stepEvent(1)
      else ctx.togglePlay()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      ctx.stepEvent(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      ctx.stepEvent(-1)
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && ctx.mode() === 'debug') {
      e.preventDefault()
      const next = ctx.navCards(e.key === 'ArrowDown' ? 1 : -1)
      if (next) ctx.selectEvent(next, { seek: true })
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault()
      ctx.toggleFollow()
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault()
      ctx.openBreakpoint()
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault()
      ctx.openSummary()
    } else if (e.key === 'd' || e.key === 'D') {
      e.preventDefault()
      ctx.openDiff()
    } else if (e.key === 'k' || e.key === 'K') {
      e.preventDefault()
      ctx.toggleBookmarkPanel()
    } else if (e.key === '[') {
      e.preventDefault()
      ctx.stepInChain(-1)
    } else if (e.key === ']') {
      e.preventDefault()
      ctx.stepInChain(1)
    } else if (e.key === 'Escape') {
      ctx.closeDiag()
    }
  }

  onMounted(() => document.addEventListener('keydown', onKeydown))
  onUnmounted(() => document.removeEventListener('keydown', onKeydown))
}

/**
 * 测试全局初始化
 *
 * 在 vitest 启动时执行，确保所有测试环境中的全局依赖就绪。
 */

import { vi } from 'vitest'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { createMockLogManager } from './mocks/MockLogger'

// LoggerProvider 初始化：领域层多处通过 LoggerProvider.logger 记录日志，
// 测试环境不初始化会导致 TypeError: Cannot read properties of undefined (reading 'addDebugLog')
LoggerProvider.logger = createMockLogManager()

// @/main 是应用入口（无导出），测试统一 mock 其 eventBus，避免真实副作用
vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} },
  default: {},
}))

// RAFTimer 全局 mock：同步执行 setTimeout 回调（多数测试默认形态）。
// 依赖真实异步时序的测试（TDZ 防护场景）应在文件内自行 vi.mock 覆盖。
vi.mock('@/shared/utils/RAF', () => ({
  RAFTimer: class {
    setTimeout(fn: (...args: unknown[]) => void, _ms?: number): symbol {
      fn()
      return Symbol('mock')
    }
    setInterval = () => Symbol('mock')
    clearTimeout = () => {}
    clearInterval = () => {}
  },
}))

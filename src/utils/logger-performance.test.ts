/**
 * 日志系统性能基准测试
 * 对比 SimpleLogger 和 FrameworkLogger 的性能表现
 */

import { SimpleLogger, logger as simpleLogger } from '@/utils/logging'
import { FrameworkLogger, logger as frameworkLogger } from '@/utils/logging'

describe('日志系统性能基准测试', () => {
  const TEST_ITERATIONS = 1000
  
  test('单次日志调用性能对比', () => {
    const simpleStart = performance.now()
    for (let i = 0; i < TEST_ITERATIONS; i++) {
      simpleLogger.debug(`测试消息 ${i}`)
    }
    const simpleEnd = performance.now()
    const simpleDuration = simpleEnd - simpleStart
    
    const frameworkStart = performance.now()
    for (let i = 0; i < TEST_ITERATIONS; i++) {
      frameworkLogger.debug(`测试消息 ${i}`)
    }
    const frameworkEnd = performance.now()
    const frameworkDuration = frameworkEnd - frameworkStart
    
    console.log(`SimpleLogger: ${simpleDuration.toFixed(2)}ms (${TEST_ITERATIONS}次调用)`)
    console.log(`FrameworkLogger: ${frameworkDuration.toFixed(2)}ms (${TEST_ITERATIONS}次调用)`)
    console.log(`性能差异: ${((frameworkDuration - simpleDuration) / simpleDuration * 100).toFixed(2)}%`)
    
    expect(frameworkDuration).toBeLessThan(simpleDuration * 1.5)
  })
  
  test('内存使用对比', () => {
    const initialMemory = process.memoryUsage().heapUsed
    
    const simpleLoggers: SimpleLogger[] = []
    const frameworkLoggers: FrameworkLogger[] = []
    
    for (let i = 0; i < 100; i++) {
      simpleLoggers.push(new SimpleLogger({ prefix: `Test${i}` }))
      frameworkLoggers.push(new FrameworkLogger(`Test${i}`))
    }
    
    const finalMemory = process.memoryUsage().heapUsed
    const memoryIncrease = finalMemory - initialMemory
    
    console.log(`内存增加: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`)
    
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024)
  })
  
  test('批量日志处理性能', () => {
    const batchSize = 1000
    const messages = Array.from({ length: batchSize }, (_, i) => `批量消息 ${i}`)
    
    const simpleStart = performance.now()
    messages.forEach(msg => simpleLogger.info(msg))
    const simpleEnd = performance.now()
    
    const frameworkStart = performance.now()
    messages.forEach(msg => frameworkLogger.info(msg))
    const frameworkEnd = performance.now()
    
    const simpleBatchTime = simpleEnd - simpleStart
    const frameworkBatchTime = frameworkEnd - frameworkStart
    
    console.log(`SimpleLogger批量处理: ${simpleBatchTime.toFixed(2)}ms`)
    console.log(`FrameworkLogger批量处理: ${frameworkBatchTime.toFixed(2)}ms`)
    
    expect(Math.abs(frameworkBatchTime - simpleBatchTime) / simpleBatchTime).toBeLessThan(0.3)
  })
})

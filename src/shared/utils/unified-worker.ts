/**
 * 文件: unified-worker.ts
 * 功能: 校验器 Worker 管线（parse → validate），失败回退主线程
 * 描述: validateUnified 为自包含纯函数（unified-validator.ts），toString 序列化后注入 Web Worker。
 *       主线程双实现兜底：Worker 创建失败 / 抛错 / 超时均回退同步执行。
 */

import type { UnifiedArchive } from '@/domain/battle/replay/unified/unified-archive'
import { validateUnified, type ValidationResult } from '@/domain/battle/replay/unified/unified-validator'

export interface ValidationPipelineResult {
  validation: ValidationResult
  parseMs: number
  validateMs: number
}

/** Worker 源码：内联 DEBUG_PHASES + 校验函数 + 消息处理（parse → validate → post） */
function buildWorkerSource(validateSource: string): string {
  return [
    `var DEBUG_PHASES = ["ai_decision","attribute_recalc","config_load","config_validation"];`,
    `var validate = ${validateSource};`,
    `self.onmessage = function (e) {`,
    `  try {`,
    `    var t0 = performance.now();`,
    `    var log = JSON.parse(e.data);`,
    `    var t1 = performance.now();`,
    `    var v = validate(log, DEBUG_PHASES);`,
    `    var t2 = performance.now();`,
    `    self.postMessage({ validation: v, parseMs: t1 - t0, validateMs: t2 - t1 });`,
    `  } catch (err) {`,
    `    self.postMessage({ error: String(err && err.message || err) });`,
    `  }`,
    `};`,
  ].join('\n')
}

function runLocal(archive: UnifiedArchive): ValidationPipelineResult {
  const raw = JSON.stringify(archive)
  const t0 = performance.now()
  const parsed = JSON.parse(raw) as UnifiedArchive
  const t1 = performance.now()
  const v = validateUnified(parsed)
  const t2 = performance.now()
  return { validation: v, parseMs: t1 - t0, validateMs: t2 - t1 }
}

/** 异步校验管线：优先 Worker，任何异常/超时回退主线程 */
export function runValidationPipeline(archive: UnifiedArchive): Promise<ValidationPipelineResult> {
  const raw = JSON.stringify(archive)
  return new Promise((resolve) => {
    let worker: Worker | null = null
    let blobUrl = ''
    try {
      const blob = new Blob([buildWorkerSource(validateUnified.toString())], { type: 'application/javascript' })
      blobUrl = URL.createObjectURL(blob)
      worker = new Worker(blobUrl)
    } catch {
      worker = null
    }

    if (!worker) {
      resolve(runLocal(archive))
      return
    }

    const release = (): void => {
      worker?.terminate()
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        blobUrl = ''
      }
    }

    const timer = window.setTimeout(() => {
      release()
      resolve(runLocal(archive))
    }, 2000)

    worker.onmessage = (e: MessageEvent) => {
      window.clearTimeout(timer)
      release()
      const data = e.data as { validation?: ValidationResult; parseMs?: number; validateMs?: number; error?: string }
      if (data.error || !data.validation) {
        resolve(runLocal(archive))
        return
      }
      resolve({
        validation: data.validation,
        parseMs: data.parseMs ?? 0,
        validateMs: data.validateMs ?? 0,
      })
    }
    worker.onerror = () => {
      window.clearTimeout(timer)
      release()
      resolve(runLocal(archive))
    }
    worker.postMessage(raw)
  })
}

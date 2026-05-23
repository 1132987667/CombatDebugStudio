/**
 * 文件：AnimationElementManager.ts
 * 功能：动画元素管理器 - 负责 DOM 元素的创建、回收和池化管理
 * 描述：实现对象池模式，避免频繁创建销毁 DOM 元素
 */

export interface PoolConfig {
  initialSize?: number
  maxSize?: number
}

export interface PooledElement {
  element: HTMLElement
  inUse: boolean
  createdAt: number
  lastUsedAt: number
}

/**
 * 动画元素管理器
 * 使用对象池模式管理临时 DOM 元素（如浮动文字、特效等）
 */
export class AnimationElementManager {
  private pools: Map<string, PooledElement[]> = new Map()
  private configs: Map<string, PoolConfig> = new Map()

  constructor() {
    // 默认配置
    this.registerPool('floating-text', { initialSize: 10, maxSize: 50 })
    this.registerPool('effect-overlay', { initialSize: 5, maxSize: 20 })
  }

  /**
   * 注册元素池
   */
  registerPool(type: string, config: PoolConfig = {}): void {
    this.configs.set(type, {
      initialSize: config.initialSize ?? 10,
      maxSize: config.maxSize ?? 50,
    })

    const pool: PooledElement[] = []
    for (let i = 0; i < (config.initialSize ?? 10); i++) {
      pool.push(this.createElement(type))
    }
    this.pools.set(type, pool)
  }

  /**
   * 创建池元素
   */
  private createElement(type: string): PooledElement {
    const element = document.createElement('div')
    element.className = `pooled-element pooled-${type}`
    element.style.cssText = `
      position: absolute;
      pointer-events: none;
      display: none;
      z-index: 100;
    `
    
    return {
      element,
      inUse: false,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    }
  }

  /**
   * 获取元素
   */
  acquire(type: string, parent?: HTMLElement): HTMLElement | null {
    const pool = this.pools.get(type)
    if (!pool) {
      console.warn(`Pool ${type} not found`)
      return null
    }

    // 查找可用元素
    let pooled = pool.find((p) => !p.inUse)

    // 如果没有可用元素且未达到上限，创建新元素
    if (!pooled && pool.length < (this.configs.get(type)?.maxSize ?? 50)) {
      pooled = this.createElement(type)
      pool.push(pooled)
    }

    // 如果仍然没有，返回 null（池耗尽）
    if (!pooled) {
      console.warn(`Pool ${type} exhausted`)
      return null
    }

    pooled.inUse = true
    pooled.lastUsedAt = Date.now()
    pooled.element.style.display = 'block'

    if (parent) {
      parent.appendChild(pooled.element)
    }

    return pooled.element
  }

  /**
   * 释放元素
   */
  release(type: string, element: HTMLElement): void {
    const pool = this.pools.get(type)
    if (!pool) return

    const pooled = pool.find((p) => p.element === element)
    if (!pooled) return

    pooled.inUse = false
    pooled.element.style.display = 'none'
    
    if (pooled.element.parentNode) {
      pooled.element.parentNode.removeChild(pooled.element)
    }
  }

  /**
   * 批量释放同类型所有元素
   */
  releaseAll(type: string): void {
    const pool = this.pools.get(type)
    if (!pool) return

    pool.forEach((pooled) => {
      if (pooled.inUse) {
        this.release(type, pooled.element)
      }
    })
  }

  /**
   * 清理长时间未使用的元素
   */
  cleanup(maxAgeMs: number = 60000): void {
    const now = Date.now()
    
    this.pools.forEach((pool, type) => {
      const maxSize = this.configs.get(type)?.maxSize ?? 50
      const minSize = this.configs.get(type)?.initialSize ?? 10

      // 只清理超出最小尺寸的元素
      if (pool.length <= minSize) return

      const unusedOldElements = pool.filter(
        (p) => !p.inUse && now - p.lastUsedAt > maxAgeMs
      )

      // 移除多余的老元素
      const toRemove = Math.min(
        unusedOldElements.length,
        pool.length - minSize
      )

      for (let i = 0; i < toRemove; i++) {
        const element = unusedOldElements[i].element
        if (element.parentNode) {
          element.parentNode.removeChild(element)
        }
        pool.splice(pool.indexOf(unusedOldElements[i]), 1)
      }
    })
  }

  /**
   * 获取池统计信息
   */
  getStats(type: string): { total: number; inUse: number; available: number } | null {
    const pool = this.pools.get(type)
    if (!pool) return null

    const inUse = pool.filter((p) => p.inUse).length
    return {
      total: pool.length,
      inUse,
      available: pool.length - inUse,
    }
  }

  /**
   * 获取所有池的统计信息
   */
  getAllStats(): Map<string, { total: number; inUse: number; available: number }> {
    const stats = new Map<
      string,
      { total: number; inUse: number; available: number }
    >()

    this.pools.forEach((_, type) => {
      const stat = this.getStats(type)
      if (stat) {
        stats.set(type, stat)
      }
    })

    return stats
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.pools.forEach((pool) => {
      pool.forEach((pooled) => {
        if (pooled.element.parentNode) {
          pooled.element.parentNode.removeChild(pooled.element)
        }
      })
    })
    this.pools.clear()
    this.configs.clear()
  }
}

// 单例实例
export const animationElementManager = new AnimationElementManager()

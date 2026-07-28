/**
 * 文件: Checksum.ts
 * 创建日期: 2026-03-12
 * 作者: CombatDebugStudio
 * 功能: 数据校验工具
 * 描述: 用于战斗回放数据的完整性校验
 */

export function calculateChecksum(data: unknown): string {
  const str = JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  return hex
}

export function verifyChecksum(data: unknown, expectedChecksum: string): boolean {
  const actualChecksum = calculateChecksum(data)
  return actualChecksum === expectedChecksum
}

export function generateReplayId(): string {
  return `replay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

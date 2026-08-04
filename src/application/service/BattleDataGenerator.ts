/**
 * BattleDataGenerator.ts — 战斗数据批量生成器
 *
 * 职责：随机选择双方成员（1v1 或 2v2），执行多场战斗，
 *       收集每场战斗的叙事日志（与日志面板导出格式完全一致），
 *       合并为单一文本文件并触发浏览器下载。
 *
 * 日志管线（与面板导出同源）：
 *   battleLogManager 战斗日志 → RoundNarrativeRenderer → blocksToText
 *
 * 关键处理：
 * - 生成期间 setAutoCleanup(false)，避免长战斗日志超 200 条被截断
 * - 每场战斗前 clearLogs，保证每场日志独立完整
 * - 结束后恢复用户原有日志与 autoCleanup
 */
import type { Container } from '@/infrastructure/di/Container'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import type { BattleService } from '@/application/facade/BattleFacade'
import type { BattleEntity } from '@/domain/battle/type/types'
import { ParticipantSide, ParticipantSideName, BattleStatus } from '@/domain/battle/type/types'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { SeededRandom } from '@/shared/utils/SeededRandom'
import type { Enemy } from '@/shared/types/enemy'
import { container } from '@/infrastructure/di/Container'
import type { DebugGate } from '@/domain/battle/debug/DebugGate'

/** 惰性获取 DebugGate 实例（DI 容器初始化后方可 resolve） */
function getDebugGate(): DebugGate | undefined {
  try { return container.resolve<DebugGate>('DebugGate') }
  catch { return undefined }
}
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { LogType, LogLevel, type BattleLogEntry, BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log'
import { RoundNarrativeRenderer } from '@/domain/battle/logs/renderers/RoundNarrativeRenderer'
import { projectSnapshotLogs } from '@/domain/battle/logs/BattleLogProjector'
import { blocksToText, blocksToHtmlBody, wrapHtmlDocument, escapeHtml } from '@/shared/utils/log-segment-factory'
import type { NarrativeBlock } from '@/shared/types/battle-log'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { BattleSummaryGenerator } from '@/domain/battle/logs/BattleSummaryGenerator'

export interface BattleGenerationOptions {
  /** 总场次数（默认 50） */
  totalBattles?: number
  /** 战斗模式：'1v1' | '2v2' | 'random'（随机选择） */
  mode?: '1v1' | '2v2' | 'random'
  /** 进度回调（0~1） */
  onProgress?: (progress: number, current: number, total: number) => void
  /** 导出格式，默认 'txt' */
  format?: 'txt' | 'html'
  /** 是否保存每场战斗的回放/调试记录到本地（IndexedDB，昊天镜「战斗记录」源可加载） */
  record?: boolean
}

export interface SingleBattleLog {
  battleIndex: number
  battleId: string
  allyNames: string[]
  enemyNames: string[]
  winner: string
  totalRounds: number
  /** 叙事块（TXT/HTML 导出的唯一数据源） */
  narrativeBlocks: NarrativeBlock[]
}

export class BattleDataGenerator {
  private battleSystem: BattleSystem
  private renderer = new RoundNarrativeRenderer()
  private _cancelled = false
  /** 上一场参与者 ID，用于清理 BuffSystem 残留修饰符 */
  private _prevParticipantIds: string[] = []
  private _currentParticipantIds: string[] = []

  constructor(container: Container) {
    const battleService = container.resolve<BattleService>('BattleService')
    this.battleSystem = battleService.getBattleManager().getBattleSystem()
  }

  /** 取消正在执行的生成任务 */
  cancel(): void {
    this._cancelled = true
  }

  async generate(options: BattleGenerationOptions = {}): Promise<string> {
    const total = options.totalBattles ?? 50
    const mode = options.mode ?? 'random'
    const allEnemies = GameDataProcessor.getEnemiesData()
    if (allEnemies.length < 1) {
      throw new Error('角色库数据不足，至少需要 1 个角色')
    }

    this._cancelled = false
    this._prevParticipantIds = []
    this._currentParticipantIds = []

    // ── 备份并隔离全局日志状态，防止 50 场战斗污染 UI 面板 ──
    const savedBattleLogs = battleLogManager.exportLogs()
    battleLogManager.setAutoCleanup(false) // 解除 200 条上限，防止长战斗日志被截断
    battleLogManager.clearLogs()

    const battleLogs: SingleBattleLog[] = []
    const dg = getDebugGate()
    const prevDebugEnabled = dg?.enabled ?? false
    if (dg) dg.enabled = false
    const prevHeadless = this.battleSystem.getHeadless()
    this.battleSystem.setHeadless(true)

    try {
      for (let i = 0; i < total; i++) {
        if (this._cancelled) break
        options.onProgress?.(i / total, i + 1, total)

        // 每场战斗使用独立种子，确保结果不重复
        const rng = new SeededRandom(Date.now() + i * 9973 + Math.floor(Math.random() * 10000))

        // 决定本场模式
        const battleMode = mode === 'random' ? (rng.next() < 0.5 ? '1v1' : '2v2') : mode
        const teamSize = battleMode === '1v1' ? 1 : 2

        // 随机选择双方成员；角色不足时允许克隆补足，保证至少 1v1
        const shuffled = rng.shuffle(allEnemies)
        const allySource = shuffled.slice(0, teamSize)
        const enemySource = shuffled.slice(teamSize, teamSize * 2)
        while (enemySource.length < teamSize) {
          enemySource.push(allySource[enemySource.length % allySource.length])
        }

        const allyTeam = allySource.map((e, idx) => this.createParticipant(e, ParticipantSide.ALLY, idx))
        const enemyTeam = enemySource.map((e, idx) => this.createParticipant(e, ParticipantSide.ENEMY, idx))
        this._currentParticipantIds = [...allyTeam.map(e => e.id), ...enemyTeam.map(e => e.id)]

        // 清理上一场参与者残留在 BuffSystem 中的修饰符
        this.cleanupPrevBuffSystemEntries()
        // 清空上一场的战斗日志，保证本场日志独立完整
        battleLogManager.clearLogs()

        // 每场独立 battleId
        this.battleSystem.regenerateBattleId()
        const battleState = this.battleSystem.initialize(allyTeam, enemyTeam)
        this.battleSystem.setBattleState(BattleStatus.ACTIVE)
        const battleId = battleState.battleId

        // 执行战斗直到结束
        let rounds = 0
        // NOTE: 硬上限防死循环。低于 battle.maxTurns（默认 999）时可能截断——
        //       截断场次无 winner，走下方 record 分支的"不保存录制"路径
        const MAX_ROUNDS = 200
        while (this.battleSystem.getBattleStatus() === BattleStatus.ACTIVE && rounds < MAX_ROUNDS) {
          await this.battleSystem.processTurn()
          rounds++
        }

        // 补充可能缺失的态势快照和战斗结束日志（短战斗提前结束时会被跳过）
        this.ensureEndBattleLogs()

        // ── 收集本场叙事日志（与面板导出同管线）──
        const battleData = this.battleSystem.getBattleData()
        if (!battleData) {
          // 防御：正常流程不可达（initialize 后必有 battleData），但若发生需清理本场内存录制避免泄漏
          this.battleSystem.resetBattle()
          continue
        }

        //  headless 下 BATTLE_ENDED 不广播，战报生成器不会自动 onBattleEnd：
        //   手动触发以恢复导出中的"战报摘要"块（与面板导出格式一致），顺带释放累加器
        const winner = battleData.winner
        if (winner) BattleSummaryGenerator.instance.onBattleEnd(winner)

        const narrativeBlocks = this.collectNarrativeBlocks()

        battleLogs.push({
          battleIndex: i + 1,
          battleId,
          allyNames: allyTeam.map(e => e.name),
          enemyNames: enemyTeam.map(e => e.name),
          winner: winner ? ParticipantSideName[winner] : '未分胜负',
          totalRounds: rounds,
          narrativeBlocks,
        })

        //  保存回放/调试记录（必须在 resetBattle 清除内存录制之前）
        //   RecordedBattle 已含 events/traceEvents/initialState/randomSeed/winner，
        //   昊天镜「战斗记录」源（UnifiedArchiveService.fromRecordedBattle）可直接加载回放与调试。
        //   NOTE: 保持 headless=true，lifecycleManager.endBattle 的自动保存被跳过，这里手动保存不双写。
        if (options.record) {
          if (!winner) {
            // 超出 MAX_ROUNDS 截断的战斗未走 endBattle：无 winner/BATTLE_END 事件，保存为残缺录制没有分析价值
            LoggerProvider.logger.addDebugLog(
              `第 ${i + 1} 场战斗达到 ${MAX_ROUNDS} 回合上限未决出胜负，未保存回放记录`,
              { level: LogLevel.WARN },
            )
          } else {
            const label = battleMode === '1v1' ? '1v1' : '2v2'
            try {
              await this.battleSystem.saveBattleRecording(battleId, `数据生成 第${i + 1}场（${label}）`)
            } catch (e) {
              LoggerProvider.logger.addDebugLog(`保存生成战斗记录失败: ${e}`, {
                level: LogLevel.ERROR,
              })
            }
          }
        }

        this.battleSystem.resetBattle()
        this._prevParticipantIds = this._currentParticipantIds
        this._currentParticipantIds = []

        // 让出主线程，避免 UI 冻结
        if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0))
      }
    } finally {
      // 恢复原始设置
      this.battleSystem.setHeadless(prevHeadless)
      const dgRestore = getDebugGate()
      if (dgRestore) dgRestore.enabled = prevDebugEnabled
      battleLogManager.setAutoCleanup(true)
      // 恢复用户原有战斗日志（无条件恢复，避免取消后日志永久丢失）
      battleLogManager.importLogs(savedBattleLogs)
      // 清理最后一场参与者残留
      this.cleanupPrevBuffSystemEntries()
      // 清理可能未进入 _prevParticipantIds 的当前参与者
      for (const id of this._currentParticipantIds) {
        this.battleSystem.getBuffSystem().clearCharacterState(id)
      }
    }

    options.onProgress?.(1, total, total)

    if (!this._cancelled && battleLogs.length > 0) {
      const format = options.format ?? 'txt'
      if (format === 'html') {
        const mergedHtml = this.mergeLogsHtml(battleLogs)
        this.downloadFile(mergedHtml, `battle-data-${battleLogs.length}场-${this.getTimestamp()}.html`, 'text/html;charset=utf-8')
      } else {
        const mergedText = this.mergeLogs(battleLogs)
        this.downloadFile(mergedText, `battle-data-${battleLogs.length}场-${this.getTimestamp()}.txt`)
      }
    }
    return this._cancelled ? 'cancelled' : 'done'
  }

  /**
   * 收集当前战斗的叙事日志块
   * 与日志面板"导出"使用完全相同的渲染管线，保证格式一致
   */
  private collectNarrativeBlocks(): NarrativeBlock[] {
    const entries = battleLogManager
      .getAllLogs()
      .filter((l) => l.type === LogType.BATTLE) as BattleLogEntry[]
    return this.renderer.renderEntries(entries)
  }

  /**
   * 补充可能缺失的态势快照和战斗结束日志
   *
   * 短战斗可能在参与者行动中提前结束（processTurnInternal 第 703-705 行 return），
   * 跳过回合末的态势快照输出（第 810-845 行）和 battle-header 渲染。
   * 此方法检查日志中是否已包含这些内容，若缺失则直接补充。
   */
  private ensureEndBattleLogs(): void {
    const battleData = this.battleSystem.getBattleData()
    if (!battleData) return

    const lastTurn = battleData.currentTurn || 1
    const allBattles = battleLogManager.getAllLogs().filter(
      (l) => l.type === LogType.BATTLE,
    ) as BattleLogEntry[]

    // 检查是否已有态势快照
    const hasSnapshot = allBattles.some((l) => l.meta?.role === 'snapshot')
    if (!hasSnapshot) {
      // 投影器统一生成（与 BattleSystem 回合末/终局快照同口径）
      for (const log of projectSnapshotLogs(battleData.participants, lastTurn)) {
        battleLogManager.addBattleLog({
          turn: lastTurn,
          ...log,
        })
      }
    }

    // 检查是否已有战斗结束横幅（role: 'battle'）
    const hasEndBanner = allBattles.some(
      (l) => l.meta?.role === 'battle' && l.message?.includes('战斗结束'),
    )
    if (!hasEndBanner && battleData.winner) {
      const winnerLabel = ParticipantSideName[battleData.winner!]
      battleLogManager.addBattleLog({
        turn: lastTurn,
        message: `战斗结束！胜利者：${winnerLabel}`,
        segments: [{ text: `战斗结束！胜利者：${winnerLabel}` }],
        category: BATTLE_LOG_CATEGORIES.STATUS,
        meta: { role: 'battle' },
      })
    }
  }

  /** 清理上一场参与者残留在 BuffSystem 中的修饰符、护盾、免疫等全部状态 */
  private cleanupPrevBuffSystemEntries(): void {
    for (const id of this._prevParticipantIds) {
      this.battleSystem.getBuffSystem().clearCharacterState(id)
    }
    this._prevParticipantIds = []
  }

  private createParticipant(
    enemy: Enemy,
    side: typeof ParticipantSide.ALLY | typeof ParticipantSide.ENEMY,
    seatIndex: number,
  ): BattleEntity {
    return GameDataProcessor.enemyToParticipant(enemy, side, seatIndex)
  }

  /** 合并所有战斗日志（头部统计 + 每场叙事） */
  private mergeLogs(battleLogs: SingleBattleLog[]): string {
    const header: string[] = []
    header.push('═'.repeat(60))
    header.push(`  战斗数据报告 — 共 ${battleLogs.length} 场`)
    header.push(`  生成时间: ${new Date().toLocaleString()}`)
    header.push('═'.repeat(60))
    header.push('')

    const allyWins = battleLogs.filter(b => b.winner === '友方').length
    const draws = battleLogs.filter(b => b.winner === '未分胜负').length
    const enemyWins = battleLogs.length - allyWins - draws
    const totalRounds = battleLogs.reduce((s, b) => s + b.totalRounds, 0)
    const avgRounds = battleLogs.length > 0 ? Math.round(totalRounds / battleLogs.length) : 0
    header.push('【统计摘要】')
    header.push(`  我方胜: ${allyWins} 场 | 敌方胜: ${enemyWins} 场 | 平局: ${draws} 场`)
    header.push(`  平均回合数: ${avgRounds}`)
    header.push(`  总回合数: ${totalRounds}`)
    header.push('')
    header.push('═'.repeat(60))
    header.push('')

    const body = battleLogs.map(b => {
      const meta = [
        `━━━━━━━━━━ 第 ${b.battleIndex} 场 ━━━━━━━━━━`,
        `我方: ${b.allyNames.join('、')}`,
        `敌方: ${b.enemyNames.join('、')}`,
        `胜方: ${b.winner}  |  回合数: ${b.totalRounds}`,
        '─'.repeat(40),
      ].join('\n')
      return `${meta}\n${blocksToText(b.narrativeBlocks)}\n`
    }).join('\n')

    return [...header, body].join('\n')
  }

  /** 合并所有战斗日志为 HTML（头部统计 + <details> 折叠 + 语义渲染） */
  private mergeLogsHtml(battleLogs: SingleBattleLog[]): string {
    const allyWins = battleLogs.filter(b => b.winner === '友方').length
    const draws = battleLogs.filter(b => b.winner === '未分胜负').length
    const enemyWins = battleLogs.length - allyWins - draws
    const totalRounds = battleLogs.reduce((s, b) => s + b.totalRounds, 0)
    const avgRounds = battleLogs.length > 0 ? Math.round(totalRounds / battleLogs.length) : 0

    const headerHtml = `<div class="report-stats">\n` +
      `<div>战斗数据报告 — 共 ${battleLogs.length} 场</div>\n` +
      `<div>我方胜: ${allyWins} 场 | 敌方胜: ${enemyWins} 场 | 平局: ${draws} 场</div>\n` +
      `<div>平均回合数: ${avgRounds} | 总回合数: ${totalRounds}</div>\n` +
      `</div>`

    const sections = battleLogs.map(b => {
      const meta = `第 ${b.battleIndex} 场 · 我方: ${b.allyNames.join('、')} · 敌方: ${b.enemyNames.join('、')} · 胜方: ${b.winner} · 回合: ${b.totalRounds}`
      return `<details class="battle-block"><summary>${escapeHtml(meta)}</summary>\n` +
        `<div class="battle-body">${blocksToHtmlBody(b.narrativeBlocks)}</div></details>`
    }).join('\n')

    return wrapHtmlDocument(headerHtml + '\n' + sections, {
      title: `战斗数据报告 (${battleLogs.length}场)`,
      generatedAt: new Date().toLocaleString(),
    })
  }

  private downloadFile(content: string, filename: string, mime: string = 'text/plain;charset=utf-8'): void {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  private getTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  }
}

/**
 * bookmarks.ts — 演劫台对局书签
 *
 * 职责：把「存档快照 + 场景 + 待用种子 + 倍速」打包为命名书签，一键恢复到验证起点，
 *       免去反复导入 JSON 存档、手动定位场景、重设种子的回归循环。
 *
 * 存储口径：localStorage（调试数据，非玩家进度；不占用存档/自动备份键位）。
 * 存档快照复用 saveManager.exportSave()（含 checksum 的 SaveData JSON），恢复走
 * xiyouSaveBridge.restore —— 与正常存档加载同一管线，保证语义一致。
 */

import type { SaveData } from '@/shared/utils/save-schema'
import { attachChecksum, SAVE_VERSION } from '@/shared/utils/save-schema'
import { saveManager, xiyouSaveBridge } from './save-bridge'
import { useBattleStore } from '@/presentation/stores/battleStore'

export interface RunBookmark {
  id: string
  name: string
  createdAt: number
  /** 书签保存时的场景（恢复后回到该场景） */
  sceneId: string
  /** 待用随机种子（null = 随机） */
  seed: string | null
  /** 战斗倍速 */
  speed: number
  /** 完整存档快照（含 checksum） */
  saveData: SaveData
}

const BOOKMARKS_KEY = 'xy_run_bookmarks'
const MAX_BOOKMARKS = 10
/** 恢复点固定 id（应用书签前自动覆盖写入，不占 MAX_BOOKMARKS 名额） */
const RESTORE_POINT_ID = 'bm_restore_point'

export function listRunBookmarks(): RunBookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY)
    const list = raw ? (JSON.parse(raw) as RunBookmark[]) : []
    return list.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

function persistBookmarks(list: RunBookmark[]): boolean {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list.slice(0, MAX_BOOKMARKS)))
    return true
  } catch {
    // localStorage 不可用或配额满：返回 false 由调用方提示，避免"以为存了实际没存"
    return false
  }
}

/**
 * 收集当前内存状态为 SaveData 快照（含 checksum）。
 * NOTE: 不走 saveManager.exportSave()——它带浏览器下载副作用（导出按钮契约），
 *       书签保存/恢复点只取数据不下载。与 SaveManager.collectData 同口径组装。
 */
async function collectSnapshot(): Promise<SaveData> {
  const raw = await xiyouSaveBridge.collect({ currentSceneId: saveManager.getCurrentSceneId() })
  return attachChecksum({
    ...raw,
    meta: { ...raw.meta, version: SAVE_VERSION, save_time: Date.now() },
  })
}

/** 把当前对局上下文存为书签（存档快照 + 场景 + 种子 + 倍速）。落盘失败抛错由调用方提示。 */
export async function createRunBookmark(name: string): Promise<RunBookmark> {
  const battle = useBattleStore()
  const bookmark: RunBookmark = {
    id: `bm_${Date.now()}_${Math.floor(Math.random() * 1e4)}`,
    name: name.trim() || `书签 ${new Date().toLocaleString()}`,
    createdAt: Date.now(),
    sceneId: saveManager.getCurrentSceneId() ?? '',
    seed: battle.pendingSeed ?? null,
    speed: battle.battleSpeed,
    saveData: await collectSnapshot(),
  }
  if (!persistBookmarks([bookmark, ...listRunBookmarks()])) {
    throw new Error('浏览器存储不可用或配额已满，书签未保存')
  }
  return bookmark
}

/**
 * 应用书签：恢复存档 + 场景 + 种子 + 倍速。
 * 应用前把当前进度写入固定「恢复点」书签——应用后紧随的场景切换会触发自动存档
 * 覆盖主档，恢复点是原进度的唯一回滚出口（试错可回滚）。
 * @returns 书签场景 id（调用方负责把当前场景切过去）
 */
export async function applyRunBookmark(id: string): Promise<string> {
  const bookmark = listRunBookmarks().find((b) => b.id === id)
  if (!bookmark) throw new Error('书签不存在或已被清除')
  const battle = useBattleStore()
  const restorePoint: RunBookmark = {
    id: RESTORE_POINT_ID,
    name: '恢复点（应用书签前）',
    createdAt: Date.now(),
    sceneId: saveManager.getCurrentSceneId() ?? '',
    seed: battle.pendingSeed ?? null,
    speed: battle.battleSpeed,
    saveData: await collectSnapshot(),
  }
  if (!persistBookmarks([restorePoint, ...listRunBookmarks().filter((b) => b.id !== RESTORE_POINT_ID)])) {
    throw new Error('浏览器存储不可用或配额已满，恢复点未写入，已中止应用')
  }
  await xiyouSaveBridge.restore(bookmark.saveData)
  saveManager.setCurrentSceneId(bookmark.sceneId)
  battle.setPendingSeed(bookmark.seed)
  battle.setBattleSpeed(bookmark.speed)
  return bookmark.sceneId
}

export function deleteRunBookmark(id: string): void {
  persistBookmarks(listRunBookmarks().filter((b) => b.id !== id))
}

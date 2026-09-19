/**
 * save-manager.ts — 演劫台存档管理器
 *
 * 负责存档读写的编排：save / load / reset / export / import / 自动存档。
 * 通过 SaveStatePort 依赖注入运行时状态的收集与恢复（端口实现见
 * src/presentation/modules/yanjie/xiyou/save-bridge.ts），本文件不依赖任何 store，
 * 可在 node 环境单测。
 *
 * 存储：IndexedDB saves store（save:main 主档 / save:auto 自动备份）为主，localStorage
 * 降级（xiyou_save / xiyou_save_auto）。每次落盘双写，beforeunload 同步写 localStorage 兜底。
 * 自动存档同时写 main + auto；手动存档只写 main（保留最近自动备份，防误覆盖，PRD §5.2）。
 */

import { SAVE_STORE, type IPersistentStorage } from '@/domain/port/IPersistentStorage'
import { persistentStorage } from '@/infrastructure/adapters/storage'
import {
  attachChecksum,
  createInitialGameState,
  LOCAL_AUTO_KEY,
  LOCAL_MAIN_KEY,
  SAVE_AUTO_KEY,
  SAVE_MAIN_KEY,
  SAVE_VERSION,
  validateSaveData,
  verifySaveChecksum,
  type SaveData,
} from './save-schema'
import { migrateSave } from './save-migrate'

/** 运行时状态 ↔ SaveData 的端口（collect 内部确保 packStore 已 init，避免把空背包写入存档） */
export interface SaveStatePort {
  collect(context: { currentSceneId: string | null }): Promise<SaveData> | SaveData
  restore(data: SaveData): Promise<void>
  /** 新游戏初始态提供方（缺省用 createInitialGameState）；bridge 实现据此把 configs 权威的新手内容并入 */
  createInitial?(): SaveData
}

export interface SaveResult {
  ok: boolean
  message?: string
  /** 非阻断警告（如导入存档的配置指纹与当前环境不一致），调用方以警示样式展示 */
  warning?: string
  source?: 'main' | 'auto' | 'local' | 'reset' | 'new' | 'import'
  migrated?: boolean
}

const AUTO_SAVE_INTERVAL_MS = 30_000

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export class SaveManager {
  private currentSceneId: string | null = null
  private playTimeSec = 0
  private sessionStartAt = Date.now()
  private timer: ReturnType<typeof setInterval> | null = null
  private lastData: SaveData | null = null

  constructor(
    private readonly port: SaveStatePort,
    private readonly storage: IPersistentStorage = persistentStorage,
    /** 当前配置指纹提供方（导出时写入 meta.configs_fp，导入时比对提示漂移）；未注入则跳过指纹逻辑 */
    private readonly getConfigsFingerprint?: () => Promise<string | undefined>,
  ) {}

  setCurrentSceneId(id: string): void {
    this.currentSceneId = id
  }

  getCurrentSceneId(): string | null {
    return this.currentSceneId
  }

  /** 收集当前状态 → SaveData（填 save_time / play_time；checksum 由 persist 统一附着） */
  private async collectData(): Promise<SaveData> {
    const raw = await this.port.collect({ currentSceneId: this.currentSceneId })
    const saveTime = Date.now()
    this.playTimeSec += Math.max(0, Math.floor((saveTime - this.sessionStartAt) / 1000))
    this.sessionStartAt = saveTime
    return {
      ...raw,
      meta: { ...raw.meta, version: SAVE_VERSION, save_time: saveTime, play_time: this.playTimeSec },
    }
  }

  /**
   * 落盘：IndexedDB saves store 为主，localStorage 降级；autoSave 额外写 auto 备份键。
   * 返回两种存储各自的成败——调用方按需判定（save 取「任一成功」；load 迁移仅在 IDB 成功时清理旧键）。
   * NOTE: 统一在此 attachChecksum——load/reset 路径传入的旧档/初始档可能无 checksum 或已失效，
   *       必须重算后才能让下次加载的完整性校验成立。
   */
  private async persist(data: SaveData, withAuto: boolean): Promise<{ idb: boolean; local: boolean }> {
    const stamped = attachChecksum(data)
    let idb = false
    try {
      idb = await this.storage.set(SAVE_STORE.SAVES, SAVE_MAIN_KEY, stamped)
      if (withAuto) await this.storage.set(SAVE_STORE.SAVES, SAVE_AUTO_KEY, stamped)
    } catch {
      idb = false
    }
    let local = false
    try {
      localStorage.setItem(LOCAL_MAIN_KEY, JSON.stringify(stamped))
      if (withAuto) localStorage.setItem(LOCAL_AUTO_KEY, JSON.stringify(stamped))
      local = true
    } catch {
      /* localStorage 不可用（隐私模式等）：IDB 仍为主存储 */
    }
    this.lastData = stamped
    return { idb, local }
  }

  /** 存档（manual=仅写主档，覆盖自动备份语义；auto=主档 + 自动备份） */
  async save(kind: 'manual' | 'auto'): Promise<boolean> {
    try {
      const data = await this.collectData()
      const { idb, local } = await this.persist(data, kind === 'auto')
      // NOTE: IDB 失败但 localStorage 写入成功时仍算保存成功（降级路径，防误报"保存失败"）
      return idb || local
    } catch {
      return false
    }
  }

  /** 自动存档（定时 / 关键节点触发） */
  async autoSave(): Promise<boolean> {
    return this.save('auto')
  }

  /** 启动自动存档：30 秒定时 + beforeunload 兜底 */
  startAutoSave(intervalMs: number = AUTO_SAVE_INTERVAL_MS): void {
    if (this.timer != null) return
    this.timer = setInterval(() => {
      void this.autoSave()
    }, intervalMs)
    window.addEventListener('beforeunload', this.onBeforeUnload)
  }

  stopAutoSave(): void {
    if (this.timer != null) {
      clearInterval(this.timer)
      this.timer = null
    }
    window.removeEventListener('beforeunload', this.onBeforeUnload)
  }

  // NOTE: beforeunload 内异步不可靠，同步写最近一次落盘结果兜底；并尽力触发一次异步刷新
  private onBeforeUnload = (): void => {
    try {
      if (this.lastData) localStorage.setItem(LOCAL_MAIN_KEY, JSON.stringify(this.lastData))
    } catch {
      /* ignore */
    }
    void this.autoSave()
  }

  /** 尝试从 auto 备份恢复（主档损坏时的降级路径，PRD §7） */
  private async restoreFromBackup(): Promise<SaveResult> {
    try {
      const auto = await this.storage.get<SaveData>(SAVE_STORE.SAVES, SAVE_AUTO_KEY)
      if (auto && validateSaveData(auto).ok) {
        const data = migrateSave(auto)
        await this.port.restore(data)
        await this.persist(data, true)
        this.setSessionFromMeta(data)
        return { ok: true, source: 'auto', message: '主存档异常，已恢复自动备份' }
      }
    } catch {
      /* 降级到重置 */
    }
    await this.reset()
    return { ok: true, source: 'reset', message: '存档损坏，已重置为新档' }
  }

  private setSessionFromMeta(data: SaveData): void {
    this.playTimeSec = data.meta.play_time ?? 0
    this.sessionStartAt = Date.now()
    this.currentSceneId = data.progress.current_scene || null
  }

  /**
   * 加载存档（PRD §7）：IDB main → checksum/结构校验 → 失败降级 auto 备份 → 备份不可用则重置；
   * IDB 无档时尝试 localStorage 旧档（静默迁移至 IDB 后删除旧键）；均无则创建初始档。
   */
  async load(): Promise<SaveResult> {
    // 1. IndexedDB 主存档
    let main: SaveData | null = null
    try {
      main = await this.storage.get<SaveData>(SAVE_STORE.SAVES, SAVE_MAIN_KEY)
    } catch {
      main = null
    }
    if (main) {
      const valid = validateSaveData(main)
      if (!valid.ok) return this.restoreFromBackup()
      // 旧档（无 checksum）结构完整时直接迁移加载；有 checksum 且不匹配视为损坏
      if (main.meta?.checksum && !verifySaveChecksum(main)) return this.restoreFromBackup()
      const data = migrateSave(main)
      await this.port.restore(data)
      await this.persist(data, true)
      this.setSessionFromMeta(data)
      return { ok: true, source: 'main' }
    }

    // 2. localStorage 旧档（v1.x 兼容，静默迁移至 IDB 后删除旧键）
    let local: string | null = null
    try {
      local = localStorage.getItem(LOCAL_MAIN_KEY)
    } catch {
      local = null
    }
    if (local) {
      try {
        const parsed = JSON.parse(local)
        const data = migrateSave(parsed)
        await this.port.restore(data)
        const { idb } = await this.persist(data, true)
        this.setSessionFromMeta(data)
        // 仅当迁移确实写入 IDB 主档后才删除 localStorage 旧键；IDB 不可用时保留降级档，防下次加载丢档
        if (idb) {
          try {
            localStorage.removeItem(LOCAL_MAIN_KEY)
            localStorage.removeItem(LOCAL_AUTO_KEY)
          } catch {
            /* ignore */
          }
        }
        return { ok: true, source: 'local', migrated: idb }
      } catch {
        /* 损坏的 localStorage 档：继续走新建 */
      }
    }

    // 3. 无档：创建初始存档
    await this.reset()
    return { ok: true, source: 'new' }
  }

  /** 清除存储并重置运行时状态为初始值（新游戏，PRD §6.3） */
  async reset(): Promise<SaveResult> {
    try {
      await this.storage.remove(SAVE_STORE.SAVES, SAVE_MAIN_KEY)
      await this.storage.remove(SAVE_STORE.SAVES, SAVE_AUTO_KEY)
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(LOCAL_MAIN_KEY)
      localStorage.removeItem(LOCAL_AUTO_KEY)
    } catch {
      /* ignore */
    }
    // NOTE: 初始态经端口 createInitial 组装——shared 层的 createInitialGameState 只有裸字段形状，
    //       configs 权威的新手内容（如 pack.json 新手装备套）由 bridge 并入，避免两处各写一份初始数据
    const initial = this.port.createInitial?.() ?? createInitialGameState()
    await this.port.restore(initial)
    await this.persist(initial, true)
    this.playTimeSec = 0
    this.sessionStartAt = Date.now()
    this.currentSceneId = null
    return { ok: true, source: 'reset' }
  }

  /** 导出当前存档为 JSON 并触发下载（返回 JSON 文本供测试/校验）。
   *  附带配置指纹（meta.configs_fp）：QA 共享存档时，导入方可据此发现数据版本漂移。 */
  async exportSave(): Promise<string> {
    const raw = await this.port.collect({ currentSceneId: this.currentSceneId })
    let configsFp: string | undefined
    try {
      configsFp = this.getConfigsFingerprint ? await this.getConfigsFingerprint() : undefined
    } catch {
      configsFp = undefined // 指纹获取失败不阻断导出（降级为无指纹旧格式）
    }
    const data = attachChecksum({
      ...raw,
      meta: { ...raw.meta, save_time: Date.now(), configs_fp: configsFp },
    })
    const json = JSON.stringify(data, null, 2)
    if (typeof document !== 'undefined') {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `xiyou_save_${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
    return json
  }

  // ════════════ 调试辅助（DebugCavePanel 存档调试调用，走同一存储端口） ════════════

  /** 读取主档原始数据（含 checksum；无档返回 null） */
  async debugReadRaw(): Promise<SaveData | null> {
    try {
      return await this.storage.get<SaveData>(SAVE_STORE.SAVES, SAVE_MAIN_KEY)
    } catch {
      return null
    }
  }

  /** 清空全部存档键（IDB 主档 + 自动备份 + localStorage 降级键），不重置运行时状态 */
  async debugClearAll(): Promise<void> {
    try {
      await this.storage.remove(SAVE_STORE.SAVES, SAVE_MAIN_KEY)
      await this.storage.remove(SAVE_STORE.SAVES, SAVE_AUTO_KEY)
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(LOCAL_MAIN_KEY)
      localStorage.removeItem(LOCAL_AUTO_KEY)
    } catch {
      /* ignore */
    }
  }

  /** 写入一份 v1.x 旧格式存档（8 槽装备）到主档，供 load() 触发迁移链验证 */
  async debugWriteLegacy(): Promise<void> {
    const base = createInitialGameState()
    const legacy = {
      ...base,
      meta: { ...base.meta, version: '1.0.0' },
      player: { ...base.player, level: 7, exp: 120, gold: 5000 },
      equipment: {
        ...base.equipment,
        // 夹具 id 须为 equipment.json 现存装备（迁移映射：necklace→helmet、belt→boots、bracelet→charm）
        weapon: 'wp_t1_light_01',
        armor: 'ar_t1_light_01',
        necklace: 'hd_t1_war_01',
        crown: null,
        belt: 'bt_t1_light_01',
        bracelet: null,
      },
    }
    await this.storage.set(SAVE_STORE.SAVES, SAVE_MAIN_KEY, legacy)
  }

  /** 写入随机损坏 JSON 到主档，供 load() 降级容错路径验证 */
  async debugWriteCorrupt(): Promise<void> {
    await this.storage.set(SAVE_STORE.SAVES, SAVE_MAIN_KEY, { corrupted: true, noise: Math.random() })
  }

  /** 对比当前内存状态与磁盘存档差异（剔除 meta 时间戳/checksum），返回差异字段列表 */
  async debugCompare(): Promise<{ memory: SaveData; disk: SaveData | null; changed: boolean; diffs: string[] }> {
    const memory = await this.collectData()
    const disk = await this.debugReadRaw()
    if (!disk) return { memory, disk, changed: true, diffs: ['磁盘无存档'] }
    const norm = (d: SaveData): string =>
      JSON.stringify({ ...d, meta: { ...d.meta, save_time: 0, play_time: 0, checksum: undefined } })
    const changed = norm(memory) !== norm(disk)
    const diffs: string[] = []
    if (changed) {
      for (const key of new Set([...Object.keys(memory), ...Object.keys(disk)])) {
        if (key === 'meta') continue
        if (JSON.stringify(memory[key as keyof SaveData]) !== JSON.stringify(disk[key as keyof SaveData])) {
          diffs.push(key)
        }
      }
    }
    return { memory, disk, changed, diffs }
  }

  /** 导入存档（文件选择器传入 File，PRD §8.2）：解析 → 迁移 → 校验 → 落盘 → 恢复 */
  async importSave(file: File): Promise<SaveResult> {
    let text: string
    try {
      text = await file.text()
    } catch {
      return { ok: false, message: '读取文件失败' }
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return { ok: false, message: '文件不是有效的 JSON' }
    }
    // 导入预检：要求 meta.version 字段存在（PRD §8.2），旧版本号走迁移链
    if (!isObj(raw) || !isObj(raw.meta) || typeof raw.meta.version !== 'string') {
      return { ok: false, message: '存档缺少 meta.version 字段' }
    }
    const fromVersion = raw.meta.version
    // 配置指纹比对（非阻断）：档内指纹与当前环境不一致说明数据已漂移，掉落/公式行为可能与录档时不符
    let warning: string | undefined
    const saveFp = typeof raw.meta.configs_fp === 'string' ? raw.meta.configs_fp : undefined
    if (saveFp && this.getConfigsFingerprint) {
      try {
        const currentFp = await this.getConfigsFingerprint()
        if (currentFp && currentFp !== saveFp) {
          warning = '存档基于不同版本的配置数据导出，掉落/成长等行为可能与录档时不一致'
        }
      } catch {
        /* 当前环境指纹获取失败：跳过比对，不阻断导入 */
      }
    }
    const data = migrateSave(raw)
    const check = validateSaveData(data)
    if (!check.ok) return { ok: false, message: `存档缺少必填字段：${check.error}` }
    await this.port.restore(data)
    await this.persist(data, true)
    this.setSessionFromMeta(data)
    // 版本迁移不静默：QA 共享存档时需感知档位差异（迁移会改写版本号落盘）
    const message = data.meta.version !== fromVersion
      ? `存档导入成功（版本 ${fromVersion} 已迁移至 ${data.meta.version}）`
      : '存档导入成功'
    return { ok: true, source: 'import', message, warning }
  }
}

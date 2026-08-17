/**
 * debugEnv.ts — 调试动作运行时依赖注入（DebugCavePanel 装配点）
 *
 * debugActions.ts 不 import 任何 store / service，仅声明本接口；
 * 面板组件负责构造 env 实例（Pinia setup 内 resolve），保证可测试与解耦。
 */

import type { useBattleStore } from '@/presentation/stores/battleStore'
import type { usePlayerStore } from '@/presentation/stores/playerStore'
import type { usePackStore } from '@/presentation/stores/packStore'
import type { SaveManager } from '@/shared/utils/save-manager'
import type { XiyouCatalogItem, XiyouQuest, XiyouRecipe, XiyouScene, XiyouSchool, XiyouShopGood, XiyouSkillPoints } from './types'
import type { EquipmentData } from '@/domain/fengshen/types'

/** 系统诊断端口（DebugCavePanel 装配：经 DI 容器 resolve application 层服务） */
export interface DebugDiagPort {
  /** 数据完整性健康检查（DataIntegrityService.runHealthCheck） */
  healthCheck: () => Promise<{ scannedRules: number; checkedEntities: number; issues: unknown[] }>
  /** 读取封神榜 dataVersion */
  dataVersion: () => Promise<number>
  /** 重新从 IDB 加载全部西游配置（loadXiyouData） */
  reloadXiyou: () => Promise<boolean>
}

/** 调试动作执行环境（工厂注入） */
export interface PlayerStoreDebugEnv {
  battle: ReturnType<typeof useBattleStore>
  player: ReturnType<typeof usePlayerStore>
  pack: ReturnType<typeof usePackStore>
  save: SaveManager
  /** 系统诊断端口（application 层服务） */
  diag: DebugDiagPort
  /** 场景表（reactive） */
  scenes: XiyouScene[]
  /** 任务表（reactive） */
  quests: XiyouQuest[]
  /** 流派表（reactive） */
  schools: XiyouSchool[]
  /** 流派技能点（reactive） */
  skillPoints: XiyouSkillPoints
  /** 物品目录（items.json 全量） */
  items: XiyouCatalogItem[]
  /** 坊市商品表 */
  shopGoods: XiyouShopGood[]
  /** 装备定义目录（equipment.json） */
  equipmentCatalog: EquipmentData[]
  /** 锻造配方表 */
  forgeRecipes: XiyouRecipe[]
  /** 炼丹配方表 */
  alchemyRecipes: XiyouRecipe[]
  /** Toast 提示 */
  toast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
}

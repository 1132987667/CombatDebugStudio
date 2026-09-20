/**
 * 法宝/神器系统（PRD §22）
 *
 * NOTE: 持有模型独立于 GearInstance——法宝/神器无词条/星级（§22 裁定不可洗练/升星），
 *       实例只承载 品质(1-5) / 强化(0..上限) / 技能升阶(0..2) 三个养成维度；
 *       战斗接入两条通道：
 *       ① 属性：fabaoAttributeBonuses() 并入主角 allyBonuses（与装备同路径）；
 *       ② 技能：释放/充能被动 id 注入 passive 桶，充能满 3 层由被动条件触发（不占行动回合）。
 * HACK: 存档暂走封神榜 IDB xiyou 表 'fabao' 文档（与 materials 等运行时状态同域），
 *       SaveData 导出/导入尚未纳入——天花板：用户清 IDB 会丢法宝，接入 save-bridge 后迁出。
 */
import { reactive } from 'vue'
import fabaoJson from '@configs/xiyou/fabao.json'
import { persistentStorage } from '@/infrastructure/adapters/storage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'

// ===== 类型 =====

export type FabaoKind = 'fabao' | 'relic'

/** 静态定义（configs/xiyou/fabao.json；数值数组下标 = 品质-1） */
export interface FabaoDef {
  id: string
  name: string
  kind: FabaoKind
  positioning: string
  /** 释放被动技能 id（注入战斗 passive 桶，充能满 3 层触发） */
  releaseSkillId: string
  /** 联动被动（风火轮闪避加速等） */
  extraSkillIds?: string[]
  primary: { attr: string; label: string; values: number[] }
  secondary: { attr: string; label: string; values: number[] }
  /** 系数加成（L3 独立乘区属性码，百分点） */
  coefficient: { attr: string; label: string; values: number[] }
  /** 技能/触发描述 */
  skill?: string
  trigger?: string
  /** 独立机制描述（法宝已在 fabao_strike 内实现；神器为设计占位） */
  mechanic: string
}

/** 运行时实例 */
export interface FabaoInstance {
  uid: string
  defId: string
  /** 品质 1-5（凡/玄/地/天/仙） */
  quality: number
  /** 强化等级 0..强化上限 */
  enhance: number
  /** 技能升阶 0..2 */
  skillRank: number
}

// ===== 品质基准（PRD §22.5）=====

export interface FabaoQualityTier {
  quality: number
  name: string
  /** 强化上限 +3~+15 */
  enhanceCap: number
  /** 强化金钱单价（强化到 L 级耗 单价×L） */
  goldPerLevel: number
  /** 分解灵尘返还率 */
  dustReturnRate: number
}

export const FABAO_QUALITY_TIERS: FabaoQualityTier[] = [
  { quality: 1, name: '凡品', enhanceCap: 3, goldPerLevel: 20, dustReturnRate: 0.5 },
  { quality: 2, name: '玄品', enhanceCap: 6, goldPerLevel: 50, dustReturnRate: 0.55 },
  { quality: 3, name: '地品', enhanceCap: 9, goldPerLevel: 100, dustReturnRate: 0.6 },
  { quality: 4, name: '天品', enhanceCap: 12, goldPerLevel: 150, dustReturnRate: 0.65 },
  { quality: 5, name: '仙品', enhanceCap: 15, goldPerLevel: 200, dustReturnRate: 0.7 },
]

export const FABAO_MAX_SKILL_RANK = 2

// ===== 配置索引 =====

export const fabaoDefs: FabaoDef[] = [
  ...(fabaoJson.fabao as unknown as FabaoDef[]),
  ...(fabaoJson.relic as unknown as FabaoDef[]),
]

export function fabaoDefById(id: string): FabaoDef | undefined {
  return fabaoDefs.find((d) => d.id === id)
}

export function fabaoTier(quality: number): FabaoQualityTier {
  return FABAO_QUALITY_TIERS[Math.min(5, Math.max(1, quality)) - 1]
}

// ===== 纯函数（养成数值口径，tests/unit/fabao.test.ts 锁定）=====

/** 强化到 targetLevel 级的金钱消耗：单价 × L（与装备强化同构的累计口径） */
export function fabaoEnhanceCost(quality: number, targetLevel: number): number {
  return fabaoTier(quality).goldPerLevel * Math.max(1, targetLevel)
}

/** 强化每级固定消耗灵尘 ×1（必成，PRD §22 养成裁定） */
export const FABAO_ENHANCE_DUST = 1

/** 分解返还灵尘 = floor(已强化级数 × 品质返还率) */
export function fabaoDustReturn(inst: Pick<FabaoInstance, 'quality' | 'enhance'>): number {
  return Math.floor(inst.enhance * fabaoTier(inst.quality).dustReturnRate)
}

/** 单条属性值：品质档基准值 × (1 + 强化等级 × 4%)，四舍五入 */
export function fabaoAttrValue(base: number, enhance: number): number {
  return Math.round(base * (1 + enhance * 0.04))
}

/** 实例当前三条属性（主/副 flat + 系数百分点） */
export function fabaoInstanceStats(
  def: FabaoDef,
  inst: Pick<FabaoInstance, 'quality' | 'enhance'>,
): { attr: string; label: string; value: number }[] {
  const q = inst.quality - 1
  return [
    { attr: def.primary.attr, label: def.primary.label, value: fabaoAttrValue(def.primary.values[q] ?? 0, inst.enhance) },
    { attr: def.secondary.attr, label: def.secondary.label, value: fabaoAttrValue(def.secondary.values[q] ?? 0, inst.enhance) },
    { attr: def.coefficient.attr, label: def.coefficient.label, value: def.coefficient.values[q] ?? 0 },
  ]
}

// ===== 运行时状态 =====

interface FabaoState {
  instances: FabaoInstance[]
  /** 出战法宝/神器（实例 uid） */
  equippedFabao: string | null
  equippedRelic: string | null
}

export const fabaoState = reactive<FabaoState>({
  instances: [],
  equippedFabao: null,
  equippedRelic: null,
})

export function fabaoInstanceByUid(uid: string | null): FabaoInstance | undefined {
  if (!uid) return undefined
  return fabaoState.instances.find((i) => i.uid === uid)
}

let uidSeq = 0
function nextUid(): string {
  uidSeq += 1
  return `fb_inst_${Date.now().toString(36)}_${uidSeq}`
}

// ===== 持久化（封神榜 IDB xiyou 表 'fabao' 文档）=====

export async function persistFabaoState(): Promise<void> {
  try {
    await persistentStorage.set(FENGSHEN_STORE.XIYOU, 'fabao', {
      id: 'fabao',
      data: {
        instances: fabaoState.instances,
        equippedFabao: fabaoState.equippedFabao,
        equippedRelic: fabaoState.equippedRelic,
      },
      updatedAt: new Date().toISOString(),
    })
  } catch {
    // 写失败静默——与 persistStarterEnabled 同口径（IDB 不可用时内存态仍可用）
  }
}

/** 从 IDB 恢复（loadXiyouData 尾部调用）；无文档/结构不符保持内存态 */
export async function loadFabaoState(): Promise<void> {
  try {
    const doc = await persistentStorage.get<{ data?: Partial<FabaoState> }>(FENGSHEN_STORE.XIYOU, 'fabao')
    const data = doc?.data
    if (!data || !Array.isArray(data.instances)) return
    fabaoState.instances = data.instances
    fabaoState.equippedFabao = data.equippedFabao ?? null
    fabaoState.equippedRelic = data.equippedRelic ?? null
  } catch {
    // 读失败保持 configs 兜底（空持有）
  }
}

// ===== 养成动作（返回 null 成功；否则为 toast 文案）=====

/** 强化：灵尘×1 + 金钱（单价×目标级），必成，上限按品质 */
export function enhanceFabao(uid: string): string | null {
  const inst = fabaoInstanceByUid(uid)
  if (!inst) return '实例不存在'
  const cap = fabaoTier(inst.quality).enhanceCap
  if (inst.enhance >= cap) return '已达品阶强化上限'
  const pack = usePackStore()
  if (pack.countOf('spirit_dust') < FABAO_ENHANCE_DUST) return '缺少灵尘×1'
  const cost = fabaoEnhanceCost(inst.quality, inst.enhance + 1)
  const player = usePlayerStore()
  if (player.currency.money < cost) return `金钱不足（需 ${cost}）`

  pack.removeItem('spirit_dust', FABAO_ENHANCE_DUST)
  player.currency.money -= cost
  inst.enhance += 1
  void persistFabaoState()
  useNotificationStore().toast(`${fabaoDefById(inst.defId)?.name ?? '法宝'} 强化至 +${inst.enhance}`)
  return null
}

/** 技能升阶：器灵×1，上限 +2 阶，每阶技能效果 +10% */
export function upgradeFabaoSkill(uid: string): string | null {
  const inst = fabaoInstanceByUid(uid)
  if (!inst) return '实例不存在'
  if (inst.skillRank >= FABAO_MAX_SKILL_RANK) return '已达升阶上限'
  const pack = usePackStore()
  if (pack.countOf('spirit_core') < 1) return '缺少器灵×1'

  pack.removeItem('spirit_core', 1)
  inst.skillRank += 1
  void persistFabaoState()
  useNotificationStore().toast(`${fabaoDefById(inst.defId)?.name ?? '法宝'} 技能升阶至 ${inst.skillRank} 阶`)
  return null
}

/** 分解：返还灵尘 = floor(强化级数 × 品质返还率)；本体消失，出战中自动卸下 */
export function decomposeFabao(uid: string): string | null {
  const inst = fabaoInstanceByUid(uid)
  if (!inst) return '实例不存在'
  const returned = fabaoDustReturn(inst)
  if (fabaoState.equippedFabao === uid) fabaoState.equippedFabao = null
  if (fabaoState.equippedRelic === uid) fabaoState.equippedRelic = null
  fabaoState.instances = fabaoState.instances.filter((i) => i.uid !== uid)
  if (returned > 0) usePackStore().addItem('spirit_dust', returned)
  void persistFabaoState()
  useNotificationStore().toast(`分解${fabaoDefById(inst.defId)?.name ?? '法宝'}，返还灵尘×${returned}`)
  return null
}

/** 出战切换（同类型互斥；再点已出战的即卸下） */
export function equipFabao(uid: string): void {
  const inst = fabaoInstanceByUid(uid)
  if (!inst) return
  const key = inst.defId.startsWith('fb_') ? 'equippedFabao' : 'equippedRelic'
  fabaoState[key] = fabaoState[key] === uid ? null : uid
  void persistFabaoState()
}

// ===== 战斗接口 =====

/** 出战法宝+神器的属性增量（主/副属性按强化缩放，系数为百分点直加）——并入主角 allyBonuses */
export function fabaoAttributeBonuses(): Partial<Record<string, number>> {
  const out: Record<string, number> = {}
  const push = (uid: string | null): void => {
    const inst = fabaoInstanceByUid(uid)
    if (!inst) return
    const def = fabaoDefById(inst.defId)
    if (!def) return
    for (const s of fabaoInstanceStats(def, inst)) {
      out[s.attr] = (out[s.attr] ?? 0) + s.value
    }
  }
  push(fabaoState.equippedFabao)
  push(fabaoState.equippedRelic)
  return out
}

/** 出战法宝/神器注入战斗的全部被动 id（充能 + 释放 + 联动） */
export function fabaoReleaseSkillIds(): string[] {
  const ids: string[] = []
  const push = (uid: string | null): void => {
    const inst = fabaoInstanceByUid(uid)
    const def = inst ? fabaoDefById(inst.defId) : undefined
    if (!def) return
    ids.push(def.releaseSkillId, ...(def.extraSkillIds ?? []))
  }
  push(fabaoState.equippedFabao)
  push(fabaoState.equippedRelic)
  if (ids.length > 0) {
    ids.push('skill_fb_charge_gen', 'skill_sq_charge_gen')
  }
  return ids
}

/** 出战法宝的技能升阶阶数（注入主角 fabaoRankMult，每阶倍率 +10%） */
export function fabaoEquippedRank(): number {
  return fabaoInstanceByUid(fabaoState.equippedFabao)?.skillRank ?? 0
}

/** 发放实例（调试/奖励通道；品质 1-5，缺省凡品） */
export function grantFabao(defId: string, quality = 1): FabaoInstance | null {
  const def = fabaoDefById(defId)
  if (!def) return null
  const inst: FabaoInstance = { uid: nextUid(), defId, quality, enhance: 0, skillRank: 0 }
  fabaoState.instances.push(inst)
  void persistFabaoState()
  return inst
}

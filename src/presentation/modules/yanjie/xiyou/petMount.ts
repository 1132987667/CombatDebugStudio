/**
 * 宠物/坐骑个体养成系统（PRD §18）
 *
 * NOTE: 个体为唯一持有（每个体全局 1 只，PRD §18 获得口径）。实例承载 资质(280~500)/
 *       品质(1-5)/独立等级(1~50)/经验/突破(0~3) 五个养成维度；floatFactor 为生成时
 *       roll 的浮动系数（§18 浮动范围 50%~110%，生成后固定）。
 *       战斗接入「常驻光环」：出战个体按主要 3 条提供属性增量（宠物=输出组、坐骑=防御组，
 *       个体 weights 已分好），与装备/法宝同路径并入主角 allyBonuses。
 * HACK: 幸运值（§18 掉率/品质权重）通路已实现但玩家幸运暂无投放来源，luckValue 恒 0——
 *       天花板：玩家属性系统投放 luck 后在 setLuckValue 接线。
 */
import { reactive, ref } from 'vue'
import petsJson from '@configs/pets/pets.json'
import mountsJson from '@configs/mounts/mounts.json'
import { persistentStorage } from '@/infrastructure/adapters/storage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { usePackStore } from '@/presentation/stores/packStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'

// ===== 类型 =====

export type PetMountKind = 'pet' | 'mount'

/** 个体静态定义（configs/pets|mounts/*.json） */
export interface PetMountIndividual {
  id: string
  name: string
  scene: number
  category: string
  /** 主要 3 条属性权重（和 = 7） */
  weights: Record<string, number>
  trait?: string
}

export interface PetMountInstance {
  uid: string
  individualId: string
  kind: PetMountKind
  /** 品质 1-5（凡/精/超/绝/神），获得时按幸运权重 roll */
  quality: number
  /** 资质 280~500（§18：初始 roll [280,440]，资质丹可推到 500） */
  aptitude: number
  /** 独立等级 1~50（§18：与玩家经验曲线一致） */
  level: number
  exp: number
  /** 已突破次数 0~3（节点 10/30/50 级） */
  breakthroughs: number
  /** 浮动系数 0.5~1.1（§18 浮动范围，生成时 roll 后固定） */
  floatFactor: number
  /** 特性（combo 流派从特性池随机，其余个体固定 trait） */
  trait?: string
  /** 出战（伴战光环） */
  active: boolean
}

// ===== 个体表 =====

export const petIndividuals: PetMountIndividual[] = petsJson as unknown as PetMountIndividual[]
export const mountIndividuals: PetMountIndividual[] = mountsJson as unknown as PetMountIndividual[]

export function individualById(id: string): PetMountIndividual | undefined {
  return [...petIndividuals, ...mountIndividuals].find((i) => i.id === id)
}

// ===== 养成纯函数（tests/unit/petmount.test.ts 锁定）=====

/** §19 经验曲线（§18 裁定：宠物/坐骑与玩家一致）：升到 L+1 级所需经验 */
export function petExpNeed(level: number): number {
  return Math.round(50 * Math.pow(level, 1.35) + 60 * level)
}

export const PET_MAX_LEVEL = 50

/** 资质档位金钱（§18：<400 → 100；400~439 → 200；440~499 → 400） */
export function aptitudePillCost(aptitude: number): number {
  if (aptitude < 400) return 100
  if (aptitude < 440) return 200
  return 400
}

export const APTITUDE_CAP = 500
export const APTITUDE_PILL_GAIN = 2
export const PET_EXP_PILL_VALUE = 500

/** 突破节点（§18：10/30/50 级，各限 1 次，丹 + 金钱） */
export const BREAKTHROUGH_STAGES = [
  { level: 10, pill: 'pet_break_pill_1', gold: 1000, bonus: 0.1 },
  { level: 30, pill: 'pet_break_pill_2', gold: 2000, bonus: 0.2 },
  { level: 50, pill: 'pet_break_pill_3', gold: 3000, bonus: 0.3 },
] as const

/** 已突破次数 → A 类属性倍率（1 + 10%/20%/30%） */
export function breakthroughMult(breakthroughs: number): number {
  let mult = 1
  for (let i = 0; i < Math.min(3, breakthroughs); i++) mult += BREAKTHROUGH_STAGES[i]!.bonus
  return mult
}

/** 品质 → 品阶权重上限（§18「品阶权重共用装备一套」，单值验算取区间上限） */
export function qualityTierWeight(quality: number): number {
  return [0, 0.6, 0.7, 0.8, 0.9, 1.0][Math.min(5, Math.max(1, quality))] ?? 0.6
}

/** 属性点转化系数（§19：1 点 = 12 气血 = 2 攻/防/命/闪/速） */
const CONVERSION: Record<string, number> = {
  attack: 2,
  defense: 2,
  hit: 2,
  dodge: 2,
  speed: 2,
  maxHealth: 12,
}

/** 个体权重键 → 属性码（与设计侧 INDIVIDUAL_WEIGHT_CODES 同口径） */
const WEIGHT_CODES: Record<string, string> = {
  attack: 'attack',
  hit: 'hit',
  speed: 'speed',
  defense: 'defense',
  dodge: 'dodge',
  maxHealth: 'maxHealth',
}

/**
 * §18 属性公式（实例版，单值口径）：
 * 值 = 单位基数(1) × 等级 × 个体权重 × 品阶权重 × (资质/400) × 突破倍率 × 转化系数 × 浮动
 */
export function petMountStatValue(
  inst: Pick<PetMountInstance, 'level' | 'quality' | 'aptitude' | 'breakthroughs' | 'floatFactor'>,
  weight: number,
  attrKey: string,
): number {
  const conversion = CONVERSION[WEIGHT_CODES[attrKey] ?? attrKey] ?? 0
  if (conversion === 0) return 0
  const base = inst.level * weight * qualityTierWeight(inst.quality) * (inst.aptitude / 400) * breakthroughMult(inst.breakthroughs) * conversion
  return Math.max(1, Math.round(base * inst.floatFactor))
}

/** 实例的主要 3 条属性（个体 weights 顺序） */
export function petMountStats(inst: PetMountInstance): { attr: string; value: number }[] {
  const individual = individualById(inst.individualId)
  if (!individual) return []
  return Object.entries(individual.weights).map(([key, weight]) => ({
    attr: WEIGHT_CODES[key] ?? key,
    value: petMountStatValue(inst, weight, key),
  }))
}

// ===== 幸运值（§18 掉率/品质权重）=====

const luckValue = ref(0)

/** 玩家幸运值注入（属性系统投放 luck 后接线；当前恒 0） */
export function setLuckValue(v: number): void {
  luckValue.value = Math.min(3000, Math.max(0, v))
}

export function luckOf(): number {
  return luckValue.value
}

/** §18 掉率乘数：基础掉率 × (1 + 幸运/1000)，封顶 100% */
export function luckDropRate(baseRate: number): number {
  return Math.min(1, baseRate * (1 + luckValue.value / 1000))
}

/** §18 品质权重：默认权重向 20% 线性缩放，权重和恒 100% */
export function luckQualityWeights(): number[] {
  const base = [0.6, 0.25, 0.1, 0.04, 0.01]
  const t = luckValue.value / 3000
  const w = base.map((p) => p + (0.2 - p) * t)
  const sum = w.reduce((s, x) => s + x, 0)
  return w.map((x) => x / sum)
}

/** 按幸运权重 roll 品质（1-5） */
export function rollQualityByLuck(): number {
  const w = luckQualityWeights()
  let r = Math.random()
  for (let i = 0; i < w.length; i++) {
    r -= w[i]!
    if (r < 0) return i + 1
  }
  return 1
}

// ===== 获得与掉落（§18 击败掉落）=====

/** §18 六档敌人基础掉率（小妖 3% → 妖尊 8%；键 = enemies.json role 英文码） */
export const PET_DROP_BASE_RATE: Record<string, number> = {
  xiaoyao: 0.03,
  yaobing: 0.04,
  yaotu: 0.05,
  yaokui: 0.06,
  yaowang: 0.07,
  yaozun: 0.08,
}

let uidSeq = 0
function nextUid(kind: PetMountKind): string {
  uidSeq += 1
  return `${kind}_inst_${Date.now().toString(36)}_${uidSeq}`
}

/** 获得个体：roll 三件套（资质 [280,440] / 品质（幸运权重）/ 浮动 [0.5,1.1]），等级 1 */
export function makeIndividualInstance(
  individual: PetMountIndividual,
  kind: PetMountKind,
): PetMountInstance {
  return {
    uid: nextUid(kind),
    individualId: individual.id,
    kind,
    quality: rollQualityByLuck(),
    aptitude: 280 + Math.floor(Math.random() * 161), // [280, 440]
    level: 1,
    exp: 0,
    breakthroughs: 0,
    floatFactor: 0.5 + Math.random() * 0.6, // [0.5, 1.1]
    trait: individual.trait,
    active: false,
  }
}

// ===== 运行时状态与持久化（IDB xiyou 表 'petmount' 文档）=====

interface PetMountState {
  pets: PetMountInstance[]
  mounts: PetMountInstance[]
}

export const petMountState = reactive<PetMountState>({ pets: [], mounts: [] })

export function ownedIndividualIds(): Set<string> {
  return new Set([
    ...petMountState.pets.map((p) => p.individualId),
    ...petMountState.mounts.map((m) => m.individualId),
  ])
}

export async function persistPetMountState(): Promise<void> {
  try {
    await persistentStorage.set(FENGSHEN_STORE.XIYOU, 'petmount', {
      id: 'petmount',
      data: { pets: petMountState.pets, mounts: petMountState.mounts },
      updatedAt: new Date().toISOString(),
    })
  } catch {
    // IDB 不可用时内存态仍可用（与 fabao 同口径）
  }
}

export async function loadPetMountState(): Promise<void> {
  try {
    const doc = await persistentStorage.get<{ data?: Partial<PetMountState> }>(FENGSHEN_STORE.XIYOU, 'petmount')
    const data = doc?.data
    if (!data) return
    if (Array.isArray(data.pets)) petMountState.pets = data.pets
    if (Array.isArray(data.mounts)) petMountState.mounts = data.mounts
  } catch {
    // 读失败保持空持有
  }
}

/**
 * 击败掉落判定（§18）：同场敌人按顺序判 role 掉率（× 幸运乘数），命中即停；
 * 个体从敌人所属场景的个体池随机（宠物/坐骑各判一次），已拥有不进池，池空不掉。
 * @returns 获得的新实例（可能 0/1/2 个——宠物与坐骑各自判定）
 */
export function rollPetMountDrops(sceneId: number, enemyRoles: string[]): PetMountInstance[] {
  const gained: PetMountInstance[] = []
  const owned = ownedIndividualIds()
  for (const kind of ['pet', 'mount'] as const) {
    for (const role of enemyRoles) {
      const base = PET_DROP_BASE_RATE[role]
      if (base == null) continue
      if (Math.random() >= luckDropRate(base)) continue
      const pool = (kind === 'pet' ? petIndividuals : mountIndividuals).filter(
        (i) => i.scene === sceneId && !owned.has(i.id),
      )
      if (pool.length === 0) continue
      const picked = pool[Math.floor(Math.random() * pool.length)]!
      owned.add(picked.id)
      gained.push(makeIndividualInstance(picked, kind))
      break // 每场每类至多 1 只：命中即停
    }
  }
  if (gained.length > 0) {
    for (const g of gained) {
      ;(g.kind === 'pet' ? petMountState.pets : petMountState.mounts).push(g)
    }
    void persistPetMountState()
  }
  return gained
}

// ===== 养成动作 =====

function instanceIn(kind: PetMountKind, uid: string): PetMountInstance | undefined {
  return (kind === 'pet' ? petMountState.pets : petMountState.mounts).find((i) => i.uid === uid)
}

/** 经验入账 + 升级循环（§18：曲线与玩家一致；满级溢出封存） */
export function gainPetExp(inst: PetMountInstance, exp: number): number {
  if (inst.level >= PET_MAX_LEVEL || exp <= 0) return 0
  inst.exp += exp
  let levels = 0
  while (inst.level < PET_MAX_LEVEL && inst.exp >= petExpNeed(inst.level)) {
    inst.exp -= petExpNeed(inst.level)
    inst.level += 1
    levels += 1
  }
  if (inst.level >= PET_MAX_LEVEL) inst.exp = 0
  return levels
}

/** 喂宠物经验丹：pet_exp_pill ×1 → +500 经验 */
export function feedExpPill(kind: PetMountKind, uid: string): string | null {
  const inst = instanceIn(kind, uid)
  if (!inst) return '实例不存在'
  if (inst.level >= PET_MAX_LEVEL) return '已满级'
  const pack = usePackStore()
  if (pack.countOf('pet_exp_pill') < 1) return '缺少宠物经验丹×1'
  pack.removeItem('pet_exp_pill', 1)
  const levels = gainPetExp(inst, PET_EXP_PILL_VALUE)
  void persistPetMountState()
  useNotificationStore().toast(
    `${individualById(inst.individualId)?.name ?? '个体'} 升至 ${inst.level} 级（+${levels} 级）`,
  )
  return null
}

/** 资质丹：+2 资质（上限 500），金钱按资质档 100/200/400 */
export function raiseAptitude(kind: PetMountKind, uid: string): string | null {
  const inst = instanceIn(kind, uid)
  if (!inst) return '实例不存在'
  if (inst.aptitude >= APTITUDE_CAP) return '资质已达上限 500'
  const pack = usePackStore()
  if (pack.countOf('pet_aptitude_pill') < 1) return '缺少资质丹×1'
  const gold = aptitudePillCost(inst.aptitude)
  const player = usePlayerStore()
  if (player.currency.money < gold) return `金钱不足（需 ${gold}）`

  pack.removeItem('pet_aptitude_pill', 1)
  player.currency.money -= gold
  inst.aptitude = Math.min(APTITUDE_CAP, inst.aptitude + APTITUDE_PILL_GAIN)
  void persistPetMountState()
  useNotificationStore().toast(`${individualById(inst.individualId)?.name ?? '个体'} 资质提升至 ${inst.aptitude}`)
  return null
}

/** 突破：按等级节点校验 + 对应突破丹 + 金钱；各限 1 次 */
export function breakthrough(kind: PetMountKind, uid: string): string | null {
  const inst = instanceIn(kind, uid)
  if (!inst) return '实例不存在'
  if (inst.breakthroughs >= BREAKTHROUGH_STAGES.length) return '已完成全部突破'
  const stage = BREAKTHROUGH_STAGES[inst.breakthroughs]!
  if (inst.level < stage.level) return `需达到 ${stage.level} 级（当前 ${inst.level}）`
  const pack = usePackStore()
  if (pack.countOf(stage.pill) < 1) return `缺少突破丹·${['壹', '贰', '叁'][inst.breakthroughs]}×1`
  const player = usePlayerStore()
  if (player.currency.money < stage.gold) return `金钱不足（需 ${stage.gold}）`

  pack.removeItem(stage.pill, 1)
  player.currency.money -= stage.gold
  inst.breakthroughs += 1
  void persistPetMountState()
  useNotificationStore().toast(`${individualById(inst.individualId)?.name ?? '个体'} 突破成功（+${stage.bonus * 100}% 属性）`)
  return null
}

/** 出战切换：宠物/坐骑各 1 只伴战（光环属性）；再点已出战的即卸下 */
export function setPetMountActive(kind: PetMountKind, uid: string): void {
  const list = kind === 'pet' ? petMountState.pets : petMountState.mounts
  for (const i of list) {
    i.active = i.uid === uid ? !i.active : false
  }
  void persistPetMountState()
}

/** 调试发放（已拥有个体返回 null——唯一持有） */
export function grantPetMount(individualId: string): PetMountInstance | null {
  const individual = individualById(individualId)
  if (!individual) return null
  if (ownedIndividualIds().has(individualId)) return null
  const inst = makeIndividualInstance(individual, individual.id.startsWith('pet_') ? 'pet' : 'mount')
  ;(inst.kind === 'pet' ? petMountState.pets : petMountState.mounts).push(inst)
  void persistPetMountState()
  return inst
}

// ===== 战斗接口 =====

/** 出战个体的伴战属性增量（常驻光环，§22.12 宠物=输出/坐骑=防御）——并入主角 allyBonuses */
export function petMountAttributeBonuses(): Partial<Record<string, number>> {
  const out: Record<string, number> = {}
  const push = (inst: PetMountInstance | undefined): void => {
    if (!inst?.active) return
    for (const s of petMountStats(inst)) {
      out[s.attr] = (out[s.attr] ?? 0) + s.value
    }
  }
  push(petMountState.pets.find((p) => p.active))
  push(petMountState.mounts.find((m) => m.active))
  return out
}

/** 出战经验结算（§18 待对账 P1：默认与玩家同池 1:1，折算系数做成常量便于调整） */
export const PET_EXP_SHARE_RATIO = 1

/** 战斗胜利后给出战个体结算经验（宠物与坐骑各结算自己的伴战个体） */
export function settlePetMountBattleExp(playerExp: number): string[] {
  const leveled: string[] = []
  const share = Math.round(playerExp * PET_EXP_SHARE_RATIO)
  if (share <= 0) return leveled
  const push = (inst: PetMountInstance | undefined): void => {
    if (!inst) return
    const levels = gainPetExp(inst, share)
    const name = individualById(inst.individualId)?.name ?? '个体'
    leveled.push(levels > 0 ? `${name} 升至 ${inst.level} 级` : `${name} +${share} 经验`)
  }
  push(petMountState.pets.find((p) => p.active))
  push(petMountState.mounts.find((m) => m.active))
  if (leveled.length > 0) void persistPetMountState()
  return leveled
}

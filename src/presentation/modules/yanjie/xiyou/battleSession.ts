/**
 * battleSession.ts — 挂机会话战利品累计（裁定 2026-10-07）
 *
 * NOTE: run.totals 是单关累计（再来一次即清零），挂机多轮的战利品此前无处可看。
 *       本模块为模块级状态——切页签/换关/组件重挂不丢，跨关卡持续累计；
 *       展示在战斗顶部信息条（battle 态常驻），「清零」由用户手动触发。
 */
import { reactive } from 'vue'

export interface SessionDrop {
  itemId: string
  quantity: number
}

export const battleSession = reactive({
  exp: 0,
  money: 0,
  xianyuan: 0,
  drops: [] as SessionDrop[],
})

/** 结算累加入会话（drops 同物品合并数量；0 值不记） */
export function recordSessionGain(gain: {
  exp?: number
  money?: number
  xianyuan?: number
  drops?: Array<{ itemId: string; quantity: number }>
}): void {
  battleSession.exp += gain.exp ?? 0
  battleSession.money += gain.money ?? 0
  battleSession.xianyuan += gain.xianyuan ?? 0
  for (const d of gain.drops ?? []) {
    if (d.quantity <= 0) continue
    const prev = battleSession.drops.find((x) => x.itemId === d.itemId)
    if (prev) prev.quantity += d.quantity
    else battleSession.drops.push({ itemId: d.itemId, quantity: d.quantity })
  }
}

/** 手动清零（信息条「清零」按钮；切模块/刷新由存档语义接管，不自动清） */
export function resetBattleSession(): void {
  battleSession.exp = 0
  battleSession.money = 0
  battleSession.xianyuan = 0
  battleSession.drops = []
}

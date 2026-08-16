/**
 * rebalance-enemies.cjs — 敌人数值重平衡脚本（攻击浮动模型）
 *
 * 背景：攻击模型从「min/max 区间随机 + 百分比防御」迁移为「attack × (1±15%) + 减法防御」后，
 *       原 enemies.json 数值（按旧模型调校）导致战斗节奏崩塌（前期无伤、后期必败）。
 *       本脚本按新模型重调整条曲线，保留同等级内"精英/普通"的相对差异。
 *
 * 曲线（线性，低成长，确保我方 L10 守护者全程可破防且后期有挑战）：
 *   HP  = 80  + 11×(L−1)      → L1:80   L10:179  L19:278  L27:366
 *   ATK = 10  + 2.0×(L−1)     → L1:10   L10:28   L19:46   L27:62
 *   DEF = 1   + 0.9×(L−1)     → L1:1    L10:9    L19:17   L27:24   （低于我方最低攻击 44×0.85≈37，杜绝破防悬崖）
 *   SPD = 10  + 1.2×(L−1)     → L1:10   L10:21   L19:32   L27:41   （不全面压过我方守护者，保留先手博弈）
 *
 * 曲线参数由 configs/params/curves.json 驱动（数值体系中枢，见 documents/数值体系搭建指南.md §4.1）。
 * yaotu_*（我方核心角色，同时可被选入敌方）单独手写，高于野怪曲线（主角团定位）。
 *
 * 用法：node scripts/rebalance-enemies.cjs
 */

const fs = require('fs')
const path = require('path')

const FILE = path.resolve(__dirname, '..', 'configs', 'enemies', 'enemies.json')
const CURVES_FILE = path.resolve(__dirname, '..', 'configs', 'params', 'curves.json')
const enemies = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const curves = JSON.parse(fs.readFileSync(CURVES_FILE, 'utf8'))

/** 曲线求值器：目前支持线性（value = base + perLevel×(L−1)），未知类型直接抛错防静默算错 */
function evalCurve(spec, L) {
  if (spec.type !== 'linear') throw new Error(`[rebalance-enemies] 不支持的曲线类型: ${spec.type}`)
  return spec.base + spec.perLevel * (L - 1)
}

/** 野怪曲线（按等级），参数来自 configs/params/curves.json */
const curve = (L) => ({
  hp: evalCurve(curves.enemy.hp, L),
  atk: evalCurve(curves.enemy.atk, L),
  def: evalCurve(curves.enemy.def, L),
  spd: evalCurve(curves.enemy.spd, L),
})

/** yaotu_* 手写数值（火/金/水/木/土，主角团定位，高于野怪曲线约 1.5~2 倍） */
const yaotu = {
  yaotu_fire: { hp: 350, atk: 70, def: 12, spd: 35 },
  yaotu_gold: { hp: 430, atk: 58, def: 18, spd: 24 },
  yaotu_water: { hp: 390, atk: 48, def: 14, spd: 30 },
  yaotu_wood: { hp: 410, atk: 52, def: 16, spd: 26 },
  yaotu_earth: { hp: 520, atk: 40, def: 25, spd: 16 },
}

/** 按等级分组（排除 yaotu） */
const groups = new Map()
for (const e of enemies) {
  if (yaotu[e.id]) continue
  if (!groups.has(e.level)) groups.set(e.level, [])
  groups.get(e.level).push(e)
}

// 野怪：映射到新曲线，保留同等级相对差异
for (const [lv, group] of groups) {
  const t = curve(Number(lv))
  // 预计算组均值（先于任何写入，避免循环内被新值污染导致序列相关）
  const mean = (k) => group.reduce((s, e) => s + (e.stats[k] ?? 0), 0) / group.length || 1
  const m = {
    hp: mean('currentHealth'),
    atk: mean('attack'),
    def: mean('defense'),
    spd: mean('speed'),
  }
  for (const e of group) {
    e.stats.currentHealth = Math.max(50, Math.round(t.hp * ((e.stats.currentHealth ?? 0) / m.hp)))
    e.stats.attack = Math.max(1, Math.round(t.atk * ((e.stats.attack ?? 0) / m.atk)))
    e.stats.defense = Math.max(0, Math.round(t.def * ((e.stats.defense ?? 0) / m.def)))
    e.stats.speed = Math.max(5, Math.round(t.spd * ((e.stats.speed ?? 0) / m.spd)))
  }
}

// yaotu 覆盖
for (const e of enemies) {
  const g = yaotu[e.id]
  if (!g) continue
  e.stats.currentHealth = g.hp
  e.stats.attack = g.atk
  e.stats.defense = g.def
  e.stats.speed = g.spd
}

fs.writeFileSync(FILE, JSON.stringify(enemies, null, 2) + '\n', 'utf8')
console.log(`[rebalance-enemies] 完成，共调整 ${enemies.length} 个敌人`)

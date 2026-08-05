/**
 * balance-check.cjs — 战斗节奏平衡验证脚本（攻击浮动模型）
 *
 * 模拟「attack × (1 ± 15%) 浮动 + 减法防御」下的核心对局，输出 TTK（回合数）与破防悬崖检查。
 * 数值调整（scripts/rebalance-enemies.cjs）后运行本脚本验证战斗节奏。
 *
 * 平衡目标：
 * - guardian 1v1 普攻 TTK ≈ 6~12 回合
 * - 我方 4v4（guardian）vs 场景敌方 ≈ 4~10 回合分出胜负，前期胜、后期有挑战
 * - 任何敌方防御 < 我方最低攻击 × 0.85（杜绝破防卡 1 点）
 *
 * 用法：node scripts/balance-check.cjs
 */

const fs = require('fs')
const path = require('path')

const enemies = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'configs', 'enemies', 'enemies.json'), 'utf8'),
)
const byId = Object.fromEntries(enemies.map((e) => [e.id, e]))

const GUARD = {
  guardian_fire: { hp: 350, atk: 70, def: 12, spd: 35 },
  guardian_gold: { hp: 430, atk: 58, def: 18, spd: 24 },
  guardian_water: { hp: 390, atk: 48, def: 14, spd: 30 },
  guardian_wood: { hp: 410, atk: 52, def: 16, spd: 26 },
  guardian_earth: { hp: 520, atk: 40, def: 25, spd: 16 },
}

function mkGuard(id) {
  const g = GUARD[id]
  return { id, lv: 10, hp: g.hp, max: g.hp, atk: g.atk, def: g.def, spd: g.spd, alive: true }
}
function mk(e) {
  return {
    id: e.id,
    lv: e.level,
    hp: e.stats.currentHealth,
    max: e.stats.currentHealth,
    atk: e.stats.attack,
    def: e.stats.defense,
    spd: e.stats.speed,
    alive: true,
  }
}

/** 确定性回合制模拟：按速度先后普攻，目标选择血量最低 */
function sim(foes, allies, seed = 1) {
  let s = seed
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const dmg = (src, tgt) => {
    const base = src.atk * (0.85 + rnd() * 0.3)
    return Math.max(1, Math.floor(base - tgt.def))
  }
  let turn = 0
  while (turn < 200) {
    turn++
    const all = [...allies.filter((a) => a.alive), ...foes.filter((f) => f.alive)].sort(
      (a, b) => b.spd - a.spd,
    )
    if (!allies.some((a) => a.alive) || !foes.some((f) => f.alive)) break
    for (const u of all) {
      if (!u.alive) continue
      const targets = (allies.includes(u) ? foes : allies)
        .filter((t) => t.alive)
        .sort((a, b) => a.hp - b.hp)
      if (!targets.length) break
      const t = targets[0]
      t.hp -= dmg(u, t)
      if (t.hp <= 0) t.alive = false
    }
  }
  const aL = allies.filter((a) => a.alive).length
  const fL = foes.filter((f) => f.alive).length
  return {
    turns: turn,
    result: aL > 0 && fL === 0 ? '左侧胜' : fL > 0 && aL === 0 ? '右侧胜' : '平',
    allyLeft: aL,
    foesLeft: fL,
  }
}

console.log('=== guardian 1v1 ===')
const pairs = [
  ['guardian_fire', 'guardian_gold'],
  ['guardian_gold', 'guardian_fire'],
  ['guardian_fire', 'guardian_earth'],
  ['guardian_water', 'guardian_wood'],
]
for (const [a, b] of pairs) {
  const r = sim([mkGuard(b)], [mkGuard(a)])
  console.log(`${a} vs ${b}: ${r.turns} 回合 ${r.result}`)
}

console.log('=== 4v4 guardian(fire/gold/water/wood) vs 场景 ===')
const scenes = [
  ['scene_001 easy L1', ['enemy_001', 'enemy_002', 'enemy_003']],
  ['scene_001 hard L7', ['enemy_007', 'enemy_008', 'boss_001']],
  ['scene_005 hard L9', ['enemy_039', 'enemy_040', 'boss_005']],
  ['scene_008 hard L15', ['enemy_063', 'enemy_064', 'boss_008']],
  ['scene_010 hard L19', ['enemy_079', 'enemy_080', 'boss_010']],
]
const squad = ['guardian_fire', 'guardian_gold', 'guardian_wood', 'guardian_water']
for (const [label, ids] of scenes) {
  const foes = ids.map((id) => mk(byId[id]))
  const allies = squad.map((id) => ({ ...mkGuard(id), hp: GUARD[id].hp, alive: true }))
  const r = sim(foes, allies)
  console.log(`${label}: ${r.turns} 回合 ${r.result} 剩我${r.allyLeft}/敌${r.foesLeft}`)
}

console.log('=== 破防悬崖检查（guardian 最低攻 earth atk40×0.85=34）===')
const highDef = enemies.filter((e) => e.stats.defense > 30).map((e) => `${e.id}(def${e.stats.defense})`)
console.log(highDef.length ? `def>30 的敌人: ${highDef.join(', ')}` : '无，全部可破防')

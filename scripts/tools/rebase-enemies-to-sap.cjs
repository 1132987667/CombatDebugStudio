/**
 * rebase-enemies-to-sap.cjs — 一次性迁移：敌人数值整体重定标到 SAP 玩家线（2026-09-23）
 *
 * 背景：演劫台运行时已切 SAP 玩家模型（configs/xiyou/player.json，§19：hp60/atk16 起、
 * +24/+8 每级），且引擎为减法防御（DamageCalculator：伤害 = max(0, 伤害 − 防御)）。
 * 旧敌人曲线（hp 80+11L / atk 10+2L / def 1+0.9L）相对旧玩家线（hp300/atk15+1）拟合，
 * 两条线在减法防御下互为死锁：旧玩家线 L30 起打不动敌人，SAP 线下敌人打不动玩家。
 *
 * 本脚本把全部敌人 stats 重生成到 §25 系数带（怪物属性 = 玩家同等级标准属性 × 类型系数）：
 *   新值[attr] = round( SAP线[attr](L) × 目标比例[tier][attr] × f_indiv )
 *   f_indiv = 旧实数 / (旧模板 × 旧品阶系数中位)，clamp [0.6, 1.8] —— 保留逐怪个性
 *   （新手域手调弱化、离群样本的相对强弱不变，只平移基准）。
 *
 * 目标比例（中位，占同等级 SAP 裸线玩家）：
 *   hp  与 §25 击杀回合带在集火模型（4 人队 dps = 4×(攻−敌防)）下互推自洽：
 *         普通怪 75%/90%（2~3 回合全歼）、精英 220%（4~6）、
 *         小Boss 600%（6~8）、大Boss 900%/1200%/王级 1500%/终局 1800%（8~12 / 12+）
 *   atk 按 §25 攻击系数带中位：普通 90%/100%、精英 120%、Boss 120%~170%
 *   def 取玩家攻击的 20%~34%（减法防御下决定我方输出效率，按档位递增）
 *
 * 冻结不改值：yaotu_*（五行护法沙盒基准）、test_*（战斗测试靶子）。
 * 普通怪 hitValue/dodgeValue/critRate/critDamage/maxEnergy/energyInit/speed 原样保留；
 * boss_major_*（f=1）speed/hitValue/dodgeValue 一并对齐档位模型期望（否则进拟合池后
 * 这三维仍是旧设计值，产生 45%~77% 拟合离群）。
 *
 * 配套（手工，非本脚本）：configs/params/curves.json 敌人曲线重定标为
 *   hp{45,18}=0.75×SAPhp、atk{14.4,7.2}=0.90×SAPatk、def{3.2,1.6}=0.20×SAPatk（小妖=基准 coef 1.0）；
 *   src/domain/fengshen/enemy-generate.ts ENEMY_TIER_COEF 同步为目标比例/基准比例。
 *
 * 用法：node scripts/tools/rebase-enemies-to-sap.cjs [--dry]
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const ENEMIES_FILE = path.join(ROOT, 'configs', 'enemies', 'enemies.json')
const DRY = process.argv.includes('--dry')

// 旧曲线（configs/params/curves.json enemy，迁移前值）
const OLD_TPL = {
  maxHealth: (L) => 80 + 11 * (L - 1),
  attack: (L) => 10 + 2 * (L - 1),
  defense: (L) => 1 + 0.9 * (L - 1),
}
// 旧品阶系数中位（迁移前 enemy-generate.ts ENEMY_TIER_COEF 实数/模板 中位，dd010464 版）
const OLD_COEF = {
  xiaoyao: { maxHealth: 1.08, attack: 1.43, defense: 2.3 },
  yaobing: { maxHealth: 1.23, attack: 1.63, defense: 2.65 },
  yaotu: { maxHealth: 1.4, attack: 1.87, defense: 2.99 },
  yaokui: { maxHealth: 1.94, attack: 2.58, defense: 4.13 },
  yaowang: { maxHealth: 2.38, attack: 3.21, defense: 5.18 },
  yaozun: { maxHealth: 2.71, attack: 3.67, defense: 5.64 },
  king: { maxHealth: 3.04, attack: 4.12, defense: 6.31 },
  final: { maxHealth: 9.54, attack: 1.69, defense: 1.9 },
}
// 新目标比例（占同等级 SAP 裸线玩家：hp 60+24(L−1)、atk 16+8(L−1)）
const TARGET = {
  hp: { xiaoyao: 0.75, yaobing: 0.9, yaotu: 2.2, yaokui: 6.0, yaowang: 9.0, yaozun: 12.0, king: 15.0, final: 18.0 },
  attack: { xiaoyao: 0.9, yaobing: 1.0, yaotu: 1.2, yaokui: 1.35, yaowang: 1.5, yaozun: 1.65, king: 1.7, final: 1.2 },
  defense: { xiaoyao: 0.2, yaobing: 0.22, yaotu: 0.24, yaokui: 0.27, yaowang: 0.3, yaozun: 0.32, king: 0.34, final: 0.24 },
}
// 属性键 → [旧模板, 旧系数, 新目标]
const REBASE_KEYS = [
  ['maxHealth', OLD_TPL.maxHealth, OLD_COEF, TARGET.hp, (L) => 60 + 24 * (L - 1)],
  ['attack', OLD_TPL.attack, OLD_COEF, TARGET.attack, (L) => 16 + 8 * (L - 1)],
  ['defense', OLD_TPL.defense, OLD_COEF, TARGET.defense, (L) => 16 + 8 * (L - 1)],
]
// boss_major 附加对齐维度（f=1，直接取「模板 × 旧档位系数」= 模型期望）：
// speed 模板沿用 curves enemy.spd（10, 1.2，未重定标）；hit/dodge 用小妖次级拟合线
const EXTRA_TPL = {
  speed: (L) => 10 + 1.2 * (L - 1),
  hitValue: (L) => 10 + 2 * (L - 1),
  dodgeValue: (L) => 2.212679 + 0.808794 * (L - 1),
}
const EXTRA_COEF = {
  speed: { xiaoyao: 0.69, yaobing: 0.77, yaotu: 0.89, yaokui: 1.21, yaowang: 1.57, yaozun: 1.71, king: 1.9, final: 0.48 },
  hitValue: { xiaoyao: 1.0, yaobing: 1.0, yaotu: 1.0, yaokui: 1.03, yaowang: 1.02, yaozun: 1.02, king: 1.01, final: 1.01 },
  dodgeValue: { xiaoyao: 1.0, yaobing: 1.08, yaotu: 1.19, yaokui: 1.43, yaowang: 1.59, yaozun: 1.56, king: 1.56, final: 1.55 },
}

const SPECIAL = [
  { tier: 'king', match: (id) => id.startsWith('boss_king_') },
  { tier: 'final', match: (id) => id === 'boss_final_liuer' },
]
const FROZEN_PREFIX = ['yaotu_', 'test_']
// 场景 BOSS（5 大妖魁关关底）旧值为旧线设计值，f_indiv 无意义（且多数撞钳制边界），直接取模型目标
const DESIGN_PREFIX = ['boss_major_']

const enemies = JSON.parse(fs.readFileSync(ENEMIES_FILE, 'utf8'))
let changed = 0
const skipped = []
const out = enemies.map((row) => {
  const id = String(row.id)
  if (FROZEN_PREFIX.some((p) => id.startsWith(p))) {
    skipped.push(`${id}（沙盒/测试冻结）`)
    return row
  }
  const special = SPECIAL.find((t) => t.match(id))
  const tier = special ? special.tier : row.role
  if (!tier || !OLD_COEF[tier]) {
    skipped.push(`${id}（role「${row.role}」不在系数表）`)
    return row
  }
  const L = Math.max(1, Math.round(Number(row.level) || 1))
  const stats = { ...(row.stats ?? {}) }
  if (!stats.maxHealth) {
    skipped.push(`${id}（无 stats）`)
    return row
  }
  for (const [key, oldTpl, , targetCol, sapLine] of REBASE_KEYS) {
    const oldReal = stats[key]
    if (!Number.isFinite(oldReal)) continue
    const f = DESIGN_PREFIX.some((p) => id.startsWith(p))
      ? 1
      : Math.min(1.8, Math.max(0.6, oldReal / (oldTpl(L) * OLD_COEF[tier][key])))
    stats[key] = Math.round(sapLine(L) * targetCol[tier] * f)
  }
  if (DESIGN_PREFIX.some((p) => id.startsWith(p))) {
    for (const key of Object.keys(EXTRA_TPL)) {
      stats[key] = Math.round(EXTRA_TPL[key](L) * EXTRA_COEF[key][tier])
    }
  }
  changed++
  return { ...row, stats }
})

console.log(`重生成 ${changed} 只 / 共 ${enemies.length} 只；跳过 ${skipped.length} 只`)
for (const s of skipped) console.log(`  skip: ${s}`)
for (const tier of ['xiaoyao', 'yaotu', 'yaokui', 'yaowang']) {
  const sample = out.find((r) => (r.role === tier || SPECIAL.find((t) => t.tier === tier)?.match(String(r.id))) && Number.isFinite(r.stats?.maxHealth))
  if (sample) console.log(`样本 ${sample.id} L${sample.level}: ${JSON.stringify({ hp: sample.stats.maxHealth, atk: sample.stats.attack, def: sample.stats.defense })}`)
}

if (!DRY) {
  fs.writeFileSync(ENEMIES_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.log(`已写回 ${path.relative(ROOT, ENEMIES_FILE)}`)
} else {
  console.log('[dry] 未写回')
}

/**
 * generate-enemy-design.cjs — 敌人生成模型拟合 + 设计文档表格生成 + 平衡断言
 *
 * 模型（三级结构，详见 documents/需求文档/敌人生成设计.md）：
 *   属性期望 = 等级模板曲线 × 品阶系数(逐维) + 圆整
 *   - 等级模板曲线（血/攻/防/速）来自 configs/params/curves.json（数值中枢，不自拟合）
 *   - 次级维度模板曲线（命中/闪避/暴击率/暴击伤害）从小妖样本（基准档）实数最小二乘拟合
 *   - 品阶系数 = 各 role 实数相对模板曲线的中位数（反推拟合，非拍脑袋）
 *   - 特殊档（boss_king_* 王级 / boss_final_liuer 终局）单独登记系数
 *
 * 本脚本做什么：
 *   1. 从 configs/enemies/enemies.json 现场拟合品阶系数矩阵与次级曲线（改配置即重算）
 *   2. 读 configs/xiyou/player.json 运行时玩家成长线（演劫台 computePlayerBase 同式）与 domain 层奖励基准
 *   3. 跑平衡断言（拟合度/单调性/玩家对标/TTK 模拟/配置自洽），失败非零退出
 *   4. 输出报告；--write 时把数值总表写回设计文档的生成区间（保留 UTF-8 BOM）
 *
 * 用法：node scripts/generate-enemy-design.cjs [--write]
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const ENEMIES_FILE = path.join(ROOT, 'configs', 'enemies', 'enemies.json')
const CURVES_FILE = path.join(ROOT, 'configs', 'params', 'curves.json')
const AFFIXES_FILE = path.join(ROOT, 'configs', 'affixes', 'affixes.json')
const PLAYER_JSON_FILE = path.join(ROOT, 'configs', 'xiyou', 'player.json')
const EXP_REWARD_FILE = path.join(ROOT, 'src', 'domain', 'fengshen', 'exp-reward.ts')
const ROLE_GRADES_FILE = path.join(ROOT, 'src', 'domain', 'fengshen', 'role-grades.ts')
const DOC_FILE = path.join(ROOT, 'documents', '需求文档', '敌人生成设计.md')

const WRITE = process.argv.includes('--write')

// ---------------------------------------------------------------------------
// 数据装载
// ---------------------------------------------------------------------------

// boss_major_* 曾外置 bosses.json（已归档 configs/expired/enemies-expired.json）。
// 曲线重定标后主表条目 = 生成模型精确值（SAP 线 × 目标比例，f=1），参与拟合与断言；
// 归档版为旧场景设计值（旧曲线口径），剥离出样本集，防止同名 id 双份进拟合池
const ARCHIVED_ENEMIES_FILE = path.join(ROOT, 'configs', 'expired', 'enemies-expired.json')
const archivedEnemies = (fs.existsSync(ARCHIVED_ENEMIES_FILE) ? JSON.parse(fs.readFileSync(ARCHIVED_ENEMIES_FILE, 'utf8')) : [])
  .map((e) => ({ ...e, __archived: true }))
// 剥离规则：沙盒玩家实体（yaotu_）与测试靶子（test_）不归生成模型管辖，双向剥离；
// boss_major_* 只取主表（模型精确值），归档旧值剥离
const frozenPrefixes = ['yaotu_', 'test_']
const allEnemies = [
  ...JSON.parse(fs.readFileSync(ENEMIES_FILE, 'utf8')),
  ...archivedEnemies,
]
const enemies = allEnemies.filter((e) => {
  const id = String(e.id)
  if (frozenPrefixes.some((p) => id.startsWith(p))) return false
  if (id.startsWith('boss_major_') && e.__archived) return false
  return true
})
const curves = JSON.parse(fs.readFileSync(CURVES_FILE, 'utf8'))
const affixes = JSON.parse(fs.readFileSync(AFFIXES_FILE, 'utf8'))
// 奖励种子已抽到 domain 层单一来源（seed.ts 仅引用）：entries ← exp-reward.ts，倍率 ← role-grades.ts
const expRewardSrc = fs.readFileSync(EXP_REWARD_FILE, 'utf8')
const roleGradesSrc = fs.readFileSync(ROLE_GRADES_FILE, 'utf8')

/** 普通品阶（按强度升序，单调性断言依赖此顺序） */
const ROLES = ['xiaoyao', 'yaobing', 'yaotu', 'yaokui', 'yaowang', 'yaozun']
const ROLE_LABEL = { xiaoyao: '小妖', yaobing: '妖兵', yaotu: '妖徒', yaokui: '妖魁', yaowang: '妖王', yaozun: '妖尊' }
/** 特殊档：id 前缀/全名匹配，绕开 role 字段的错标（boss_king_* 数值超 yaowang 档） */
const SPECIAL_TIERS = [
  { key: 'king', label: '王级(boss_king_*)', match: (id) => id.startsWith('boss_king_') },
  { key: 'final', label: '终局(boss_final_liuer)', match: (id) => id === 'boss_final_liuer' },
]
const tierOf = (e) => SPECIAL_TIERS.find((t) => t.match(e.id))?.key ?? e.role

/** 等级模板曲线求值器（与 src/domain/fengshen/enemy-generate.ts 的 evalCurve 同款，未知类型抛错防静默算错） */
function evalCurve(spec, L) {
  if (spec.type !== 'linear') throw new Error(`不支持的曲线类型: ${spec.type}`)
  return spec.base + spec.perLevel * (L - 1)
}

// 血/攻/防/速：配置权威曲线
const B = {
  maxHealth: (L) => evalCurve(curves.enemy.hp, L),
  attack: (L) => evalCurve(curves.enemy.atk, L),
  defense: (L) => evalCurve(curves.enemy.def, L),
  speed: (L) => evalCurve(curves.enemy.spd, L),
}

// ---------------------------------------------------------------------------
// 玩家成长参数：读 configs/xiyou/player.json（运行时权威，演劫台 computePlayerBase 同式）
// ---------------------------------------------------------------------------

const playerJson = JSON.parse(fs.readFileSync(PLAYER_JSON_FILE, 'utf8'))
// A4 对标基准 = base + (L−1)×growth（不含自由点/装备，下界口径）；攻击取 attackMin（attackMin=attackMax）
const PLAYER_BASE = {
  maxHealth: playerJson.base.maxHealth,
  attack: playerJson.base.attackMin,
  defense: playerJson.base.defense,
  speed: playerJson.base.speed,
}
const PLAYER_GROWTH = {
  maxHealth: playerJson.growth.maxHealth,
  attack: playerJson.growth.attack,
  defense: playerJson.growth.defense,
  speed: playerJson.growth.speed,
}
const playerBase = (attr, L) => (PLAYER_BASE[attr] ?? 0) + (L - 1) * (PLAYER_GROWTH[attr] ?? 0)

// 玩家升级经验表（player.json expTable，§19 公式生成）：击杀数分析用
const expRequiredAt = (L) => playerJson.expTable?.find((r) => r.level === L)?.expRequired ?? null

// 敌人奖励基准表种子（exp-reward.ts 的 DEFAULT_ENEMY_REWARD_ENTRIES + role-grades.ts 的 ENEMY_ROLE_MULTIPLIERS）
const rewardEntries = [...expRewardSrc.matchAll(/enemyLevel:\s*(\d+),\s*baseExp:\s*(\d+),\s*goldMin:\s*(\d+),\s*goldMax:\s*(\d+)/g)].map(
  (m) => ({ enemyLevel: +m[1], baseExp: +m[2], goldMin: +m[3], goldMax: +m[4] }),
)
const roleMultBody = roleGradesSrc.slice(roleGradesSrc.indexOf('ENEMY_ROLE_MULTIPLIERS'))
const objStart = roleMultBody.indexOf('{')
const roleMultSeg = {}
for (const part of roleMultBody.slice(objStart + 1, roleMultBody.indexOf('}', objStart)).split(',')) {
  const kv = part.split(':')
  if (kv.length === 2 && Number.isFinite(Number(kv[1]))) roleMultSeg[kv[0].trim()] = Number(kv[1].trim())
}
const rewardAt = (L) => {
  const exact = rewardEntries.find((e) => e.enemyLevel === L)
  if (exact) return exact
  const sorted = [...rewardEntries].sort((a, b) => a.enemyLevel - b.enemyLevel)
  let lo = sorted[0]
  let hi = sorted[sorted.length - 1]
  for (const e of sorted) {
    if (e.enemyLevel > L) {
      hi = e
      break
    }
    lo = e
  }
  const r = hi.enemyLevel === lo.enemyLevel ? 0 : (L - lo.enemyLevel) / (hi.enemyLevel - lo.enemyLevel)
  const lerp = (a, b) => Math.round(a + (b - a) * r)
  return { baseExp: lerp(lo.baseExp, hi.baseExp), goldMin: lerp(lo.goldMin, hi.goldMin), goldMax: lerp(lo.goldMax, hi.goldMax) }
}

// ---------------------------------------------------------------------------
// 拟合：次级模板曲线（全体最小二乘）+ 品阶系数矩阵（各 role 中位数）
// ---------------------------------------------------------------------------

/** 最小二乘拟合 y = a + b×(L−1) */
function fitLinear(pairs) {
  const n = pairs.length
  const sx = pairs.reduce((s, [x]) => s + x, 0)
  const sy = pairs.reduce((s, [, y]) => s + y, 0)
  const sxx = pairs.reduce((s, [x]) => s + x * x, 0)
  const sxy = pairs.reduce((s, [x, y]) => s + x * y, 0)
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx)
  const a = (sy - b * sx) / n
  return { a, b }
}

const median = (arr) => {
  const s = [...arr].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const round2 = (v) => Math.round(v * 100) / 100

// 次级维度模板以小妖（基准档、最大样本 n=75）拟合：模板语义 = 「小妖基准曲线」，
// 与 curves.json 对血/攻/防/速的定位一致；其余档位系数 = 实数 / 小妖模板。
const SECONDARY_KEYS = ['hitValue', 'dodgeValue', 'critRate', 'critDamage']
const xiaoyaoPool = enemies.filter((e) => e.role === 'xiaoyao')
const secondaryFit = {}
for (const k of SECONDARY_KEYS) {
  secondaryFit[k] = fitLinear(xiaoyaoPool.map((e) => [e.level - 1, e.stats[k] ?? 0]))
}
const B_HIT = (L) => secondaryFit.hitValue.a + secondaryFit.hitValue.b * (L - 1)
const B_DODGE = (L) => secondaryFit.dodgeValue.a + secondaryFit.dodgeValue.b * (L - 1)
const B_CRITR = (L) => secondaryFit.critRate.a + secondaryFit.critRate.b * (L - 1)
const B_CRITD = (L) => secondaryFit.critDamage.a + secondaryFit.critDamage.b * (L - 1)

// 血/攻/防/速模板函数表（系数矩阵统一按键取用）
const TEMPLATE = { maxHealth: B.maxHealth, attack: B.attack, defense: B.defense, speed: B.speed, hitValue: B_HIT, dodgeValue: B_DODGE }
const STAT_KEYS = Object.keys(TEMPLATE)

// 品阶系数：各档位实数 / 模板 的中位数（普通 5 档 + 特殊档），圆整 2 位
const COEF = {}
for (const role of ROLES) {
  const pool = enemies.filter((e) => e.role === role)
  const row = {}
  for (const k of STAT_KEYS) row[k] = round2(median(pool.map((e) => (e.stats[k] ?? 0) / TEMPLATE[k](e.level))))
  COEF[role] = row
}
for (const t of SPECIAL_TIERS) {
  const pool = enemies.filter((e) => t.match(e.id))
  const row = {}
  for (const k of STAT_KEYS) row[k] = round2(median(pool.map((e) => (e.stats[k] ?? 0) / TEMPLATE[k](e.level))))
  COEF[t.key] = row
}

/** 各档位在现状中的存在等级域（模型外推超出此域仅供推演，不参与对标断言） */
const LEVEL_RANGE = {}
// 无 role 记录非生成模型管辖，跳过
for (const e of enemies) {
  if (!e.role) continue
  const t = tierOf(e)
  const r = (LEVEL_RANGE[t] ??= { min: e.level, max: e.level })
  r.min = Math.min(r.min, e.level)
  r.max = Math.max(r.max, e.level)
}

/** 生成模型：等级 × 档位 → 期望 stats（round 与现状数据同为四舍五入） */
function expectStats(tier, L) {
  const c = COEF[tier]
  return {
    maxHealth: Math.round(B.maxHealth(L) * c.maxHealth),
    attack: Math.round(B.attack(L) * c.attack),
    defense: Math.round(B.defense(L) * c.defense),
    speed: Math.round(B.speed(L) * c.speed),
    hitValue: Math.round(B_HIT(L) * c.hitValue),
    dodgeValue: Math.round(B_DODGE(L) * c.dodgeValue),
    critRate: Math.round(B_CRITR(L)),
    critDamage: Math.round(B_CRITD(L)),
    maxEnergy: 150,
    energyInit: 25,
  }
}

// ---------------------------------------------------------------------------
// TTK 确定性模拟（对齐原 balance-check.cjs，已归档：atk×(1±15%) 浮动 + 减法防御，速度序行动）
// ---------------------------------------------------------------------------

function lcg(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}
function simCombat(foes, allies, seed = 1) {
  const rnd = lcg(seed)
  const dmg = (src, tgt) => Math.max(1, Math.floor(src.atk * (0.85 + rnd() * 0.3) - tgt.def))
  let turn = 0
  while (turn < 200) {
    turn++
    const all = [...allies.filter((a) => a.alive), ...foes.filter((f) => f.alive)].sort((a, b) => b.spd - a.spd)
    if (!allies.some((a) => a.alive) || !foes.some((f) => f.alive)) break
    for (const u of all) {
      if (!u.alive) continue
      const ts = (allies.includes(u) ? foes : allies).filter((t) => t.alive).sort((a, b) => a.hp - b.hp)
      if (!ts.length) break
      const t = ts[0]
      t.hp -= dmg(u, t)
      if (t.hp <= 0) t.alive = false
    }
  }
  return { turns: turn, alliesWin: allies.some((a) => a.alive) && !foes.some((f) => f.alive) }
}

// 我方基准 = SAP 裸线小队（player.json base + growth，不含加点/装备/丹药，computePlayerBase 同式）
const mkSapHero = (id, L) => ({
  id,
  hp: playerBase('maxHealth', L),
  atk: playerBase('attack', L),
  def: playerBase('defense', L),
  spd: playerBase('speed', L),
  alive: true,
})
const mkModelFoe = (tier, L) => {
  const s = expectStats(tier, L)
  return { id: `${tier}#L${L}`, hp: s.maxHealth, atk: s.attack, def: s.defense, spd: s.speed, alive: true }
}

// ---------------------------------------------------------------------------
// 断言
// ---------------------------------------------------------------------------

const failures = []
function assert(cond, msg) {
  if (!cond) failures.push(msg)
  return cond
}

// A1 曲线配置存在且为线性
for (const k of ['hp', 'atk', 'def', 'spd']) {
  assert(curves.enemy[k]?.type === 'linear', `A1 curves.json enemy.${k} 缺失或非 linear`)
}

// A2 品阶系数严格单调（四维主属性；命中/闪避/暴击为模板维度，品阶差异在圆整噪声内，A2 豁免）
for (const k of ['maxHealth', 'attack', 'defense', 'speed']) {
  for (let i = 0; i < ROLES.length - 1; i++) {
    assert(COEF[ROLES[i]][k] < COEF[ROLES[i + 1]][k], `A2 品阶系数非单调: ${k} ${ROLES[i]}(${COEF[ROLES[i]][k]}) >= ${ROLES[i + 1]}(${COEF[ROLES[i + 1]][k]})`)
  }
}

// A3 拟合度：逐只逐维 |实/模−1| ≤ max(维容差, 圆整噪声界 0.6/期望)；离群需 ≤ 白名单容量
const TOL = { maxHealth: 0.12, attack: 0.12, defense: 0.35, speed: 0.12, hitValue: 0.1, dodgeValue: 0.3 }
const OUTLIER_ALLOWANCE = 10 // 每维允许的离群数上限；剩余离群多为新手域(L≤5)手调弱化，逐只点名进报告
const outliers = {}
for (const e of enemies) {
  if (!e.role) continue
  const m = expectStats(tierOf(e), e.level)
  for (const k of Object.keys(TOL)) {
    const exp = Math.max(1, m[k])
    const dev = Math.abs((e.stats[k] ?? 0) - exp) / exp
    const tol = Math.max(TOL[k], 0.6 / exp)
    if (dev > tol) (outliers[k] ??= []).push(`${e.id}(L${e.level} 实${e.stats[k]} 模${exp} 偏${(dev * 100).toFixed(0)}%)`)
  }
}
for (const [k, list] of Object.entries(outliers)) {
  assert(list.length <= OUTLIER_ALLOWANCE, `A3 拟合离群超限 ${k}: ${list.length} 只 > ${OUTLIER_ALLOWANCE}（${list.slice(0, 5).join('; ')}）`)
}

// A4 玩家对标（带宽 = §25 击杀回合带反推的目标比例 + 拟合/圆整余量；基准 = computePlayerBase 裸线）
// 目标比例：小妖 hp 75%（2~3 回合全歼）、妖徒 220%（4~6）、Boss 档 600~1800%（8~12）
const ratioToPlayer = (tier, L, statKey, playerAttr) => (expectStats(tier, L)[statKey] / playerBase(playerAttr, L)) * 100
const inBand = (v, lo, hi) => v >= lo && v <= hi
for (const L of [10, 20, 30, 40, 50]) {
  assert(inBand(ratioToPlayer('xiaoyao', L, 'maxHealth', 'maxHealth'), 70, 120),
    `A4 L${L} 小妖血量/玩家超出 [70%,120%]: ${ratioToPlayer('xiaoyao', L, 'maxHealth', 'maxHealth').toFixed(0)}%`)
}
for (const L of [10, 30, 50]) {
  assert(inBand(ratioToPlayer('yaotu', L, 'maxHealth', 'maxHealth'), 200, 400),
    `A4 L${L} 妖徒血量/玩家超出 [200%,400%]: ${ratioToPlayer('yaotu', L, 'maxHealth', 'maxHealth').toFixed(0)}%`)
}
for (const tier of ['yaokui', 'yaowang', 'yaozun', 'king', 'final']) {
  for (let L = 1; L <= 70; L++) {
    assert(inBand(ratioToPlayer(tier, L, 'maxHealth', 'maxHealth'), 590, 1850),
      `A4 L${L} ${tier} 血量/玩家超出 [590%,1850%]: ${ratioToPlayer(tier, L, 'maxHealth', 'maxHealth').toFixed(0)}%`)
  }
}
for (const [tier, lo, hi] of [['xiaoyao', 0, 105], ['yaobing', 0, 105], ['yaotu', 110, 160], ['yaokui', 110, 175], ['yaowang', 130, 175], ['yaozun', 140, 175], ['king', 140, 180], ['final', 100, 175]]) {
  assert(inBand(ratioToPlayer(tier, 50, 'attack', 'attack'), lo, hi),
    `A4 L50 ${tier} 攻击/玩家超出 [${lo}%,${hi}%]: ${ratioToPlayer(tier, 50, 'attack', 'attack').toFixed(0)}%`)
}

// A5 TTK：SAP 裸线小队 vs 模型期望怪（确定性普攻减法模拟，含我方减员——
// 无技能/治疗，实测带比 §25 连续 dps 估算带偏长 ~1.5 倍，口径差异见注释）
// 场景覆盖 §25 回合带全段：普通(2~3 全歼)/精英(4~6)/小 Boss(6~8)/大 Boss(8~12)，
// 以及大 Boss 战长度下限（裸线险胜/惨败均可，胜负不作要求——需养成才能碾压）
function runTtk(label, foes, allies, min, max, mustWin) {
  const r = simCombat(foes, allies)
  assert(r.turns >= min && r.turns <= max, `A5 TTK ${label}: ${r.turns} 回合超出 [${min},${max}]`)
  if (mustWin) assert(r.alliesWin, `A5 TTK ${label}: 我方未胜`)
  return r
}
const ttkResults = []
ttkResults.push(['1v1 SAP-L10 vs 小妖L10', 1, ['xiaoyao', 10], [[10, 'a']], 2, 6, true])
ttkResults.push(['1v1 SAP-L30 vs 小妖L30', 1, ['xiaoyao', 30], [[30, 'a']], 2, 6, true])
ttkResults.push(['1v1 SAP-L50 vs 小妖L50', 1, ['xiaoyao', 50], [[50, 'a']], 2, 6, true])
ttkResults.push(['4v4 SAP-L10 普通关末节(2小妖+妖徒L10)', 4, [['xiaoyao', 10], ['xiaoyao', 10], ['yaotu', 10]], [[10, 'a'], [10, 'b'], [10, 'c'], [10, 'd']], 3, 8, true])
ttkResults.push(['4v4 SAP-L30 精英战(小妖+2妖徒L30)', 4, [['xiaoyao', 30], ['yaotu', 30], ['yaotu', 30]], [[30, 'a'], [30, 'b'], [30, 'c'], [30, 'd']], 5, 10, true])
ttkResults.push(['4v4 SAP-L50 妖魁关末节(2小妖+妖魁L50)', 4, [['xiaoyao', 50], ['xiaoyao', 50], ['yaokui', 50]], [[50, 'a'], [50, 'b'], [50, 'c'], [50, 'd']], 7, 14, true])
ttkResults.push(['4v4 SAP-L50 vs 妖王L50(Boss战长度下限)', 4, [['yaowang', 50]], [[50, 'a'], [50, 'b'], [50, 'c'], [50, 'd']], 8, 18, false])
const ttkRows = ttkResults.map(([label, mode, foeSpec, heroSpecs, min, max, mustWin]) => {
  const foes = mode === 1 ? [mkModelFoe(...foeSpec)] : foeSpec.map(([t, L]) => mkModelFoe(t, L))
  const r = runTtk(label, foes, heroSpecs.map(([L, id]) => mkSapHero(id, L)), min, max, mustWin)
  return { label, turns: r.turns, win: r.alliesWin }
})

// A6 模型期望逐级单调不减（同档位同维，L1→70）
for (const tier of [...ROLES, ...SPECIAL_TIERS.map((t) => t.key)]) {
  for (const k of ['maxHealth', 'attack', 'defense', 'speed', 'hitValue', 'dodgeValue', 'critRate', 'critDamage']) {
    for (let L = 2; L <= 70; L++) {
      assert(expectStats(tier, L)[k] >= expectStats(tier, L - 1)[k], `A6 模型非单调: ${tier} ${k} L${L - 1}→L${L}`)
    }
  }
}

// A7 奖励基准表自洽（seed 种子抽取结果）
assert(rewardEntries.length >= 2, 'A7 奖励基准表条目过少（seed.ts 抽取失败?）')
for (let i = 1; i < rewardEntries.length; i++) {
  assert(rewardEntries[i].enemyLevel > rewardEntries[i - 1].enemyLevel, 'A7 奖励基准表等级非严格递增')
  assert(rewardEntries[i].baseExp >= rewardEntries[i - 1].baseExp, 'A7 奖励基准表 baseExp 非单调不减')
}
for (const role of ['xiaoyao', 'yaobing', ...ROLES.slice(1)]) {
  assert(roleMultSeg[role] !== undefined, `A7 roleMultiplier 缺少键: ${role}（xiaoyao 为普通基准档）`)
}
// 击杀数/级（同等级小妖 = normal 基准，无等级差修正）∈ [5,100] 防坏数据；节奏跳变进报告
const killsAt = (L) => {
  if (expRequiredAt(L) === null) return null
  return expRequiredAt(L) / Math.max(1, Math.round(rewardAt(L).baseExp * (roleMultSeg.xiaoyao ?? 1)))
}
for (let L = 1; L <= 50; L++) {
  const n = killsAt(L)
  assert(n !== null && n >= 5 && n <= 100, `A7 L${L} 升级所需同等级击杀数超警戒带 [5,100]: ${n === null ? '无经验档' : n.toFixed(1)}`)
}

// A8 词缀配置自洽 + affixPool 规则
const affixList = Array.isArray(affixes) ? affixes : affixes.affixes ?? []
const tierKeys = new Set(affixList.map((a) => a.tier))
for (const t of ['yao_1', 'yao_2', 'yao_3', 'yao_4', 'mandate', 'jie']) {
  assert(tierKeys.has(t), `A8 affixes.json 缺少词缀档位: ${t}`)
}
const affixPlan = (e) => {
  const L = e.level
  const t = e.role
  if (t === 'xiaoyao') return { buffTier: 0, count: 0 }
  if (t === 'yaobing' || t === 'yaotu' || t === 'yaokui') return { buffTier: Math.min(3, Math.max(1, Math.ceil(L / 20))), count: 1 }
  if (t === 'yaowang') return { buffTier: e.id.startsWith('boss_king_') ? 5 : 3, count: 1 }
  if (t === 'yaozun') return { buffTier: e.id === 'boss_final_liuer' ? 5 : 4, count: e.id === 'boss_final_liuer' ? 1 : 2 }
  return { buffTier: 0, count: 0 }
}
const affixMismatch = []
for (const e of enemies) {
  if (String(e.id).startsWith('boss_major_')) continue // 场景 BOSS 词缀为设计值（归档版 t3/t5 本就豁免，跳过等价）
  const p = affixPlan(e)
  const a = e.affixPool ?? {}
  if ((a.buffTier ?? 0) !== p.buffTier || (a.count ?? 0) !== p.count) {
    // 妖王现状混用 t3/t5（天命绑定），允许 ∈ {3,5}；其余档位严格对齐模型
    const ok = e.role === 'yaowang' && a.count === 1 && [3, 5].includes(a.buffTier)
    if (!ok) affixMismatch.push(`${e.id}(实 t${a.buffTier}c${a.count} / 模 t${p.buffTier}c${p.count})`)
  }
}
assert(affixMismatch.length === 0, `A8 affixPool 与模型规则不符: ${affixMismatch.slice(0, 5).join('; ')}`)

// ---------------------------------------------------------------------------
// 奖励现状偏差报告（warning，不计入失败——现状与基准表的脱节是文档已知发现）
// ---------------------------------------------------------------------------
const rewardGap = {}
for (const role of ROLES) {
  const pool = enemies.filter((e) => e.role === role && !String(e.id).startsWith('yaotu_'))
  const expR = pool.map((e) => (e.exp?.[0] ?? 0) / Math.max(1, Math.round(rewardAt(e.level).baseExp * (roleMultSeg[e.role] ?? 1))))
  const goldR = pool.map((e) => (e.money?.[0] ?? 0) / Math.max(1, Math.round(rewardAt(e.level).goldMin * (roleMultSeg[e.role] ?? 1))))
  rewardGap[role] = { exp: median(expR), gold: median(goldR), n: pool.length }
}

// 破防悬崖检查（旧模型专有问题）：旧曲线 def 独立成长，越过「主角攻×0.85」后普攻被减法防御
// 完全吞掉。重定标后敌 def 占同等级玩家攻的 20%~34%（TARGET.defense），敌 def/敌攻 比恒 ≈0.20，
// 普攻下限 0.85×玩家攻 − 0.34×玩家攻 = 0.51×玩家攻 > 0 恒成立 → 悬崖在全等级域不再出现。
const defAtkRows = [...ROLES, ...SPECIAL_TIERS.map((t) => t.key)].map((tier) => {
  const s = expectStats(tier, 50)
  return { tier, ratio: s.defense / s.attack, toPlayerAtk: s.defense / playerBase('attack', 50) }
})

// ---------------------------------------------------------------------------
// 报告输出
// ---------------------------------------------------------------------------

console.log(`=== 敌人生成模型拟合报告 ===`)
console.log(`敌人 ${JSON.parse(fs.readFileSync(ENEMIES_FILE, 'utf8')).length} 只（enemies.json）｜曲线中枢 curves.json｜玩家成长线 configs/xiyou/player.json`)
console.log('\n-- 品阶系数矩阵（实数/模板 中位数） --')
const coefHeader = ['档位', ...STAT_KEYS].join('\t')
console.log(coefHeader)
for (const role of ROLES) console.log(`${ROLE_LABEL[role]}(${role})`, ...STAT_KEYS.map((k) => COEF[role][k].toFixed(2)).join('\t'))
for (const t of SPECIAL_TIERS) console.log(`${t.label}`, ...STAT_KEYS.map((k) => COEF[t.key][k].toFixed(2)).join('\t'))

console.log('\n-- 次级维度模板曲线（小妖样本最小二乘） --')
console.log(`hitValue        = ${secondaryFit.hitValue.a.toFixed(1)} + ${secondaryFit.hitValue.b.toFixed(2)}×(L−1)`)
console.log(`dodgeValue      = ${secondaryFit.dodgeValue.a.toFixed(1)} + ${secondaryFit.dodgeValue.b.toFixed(2)}×(L−1)`)
console.log(`critRate   = ${secondaryFit.critRate.a.toFixed(1)} + ${secondaryFit.critRate.b.toFixed(2)}×(L−1)`)
console.log(`critDamage = ${secondaryFit.critDamage.a.toFixed(1)} + ${secondaryFit.critDamage.b.toFixed(2)}×(L−1)`)

console.log('\n-- 玩家对标（模型期望 / computePlayerBase，%） --')
console.log('L\t小妖hp\t妖徒hp\t妖魁hp\t小妖atk\t妖徒atk\t小妖def\t妖徒def')
for (let L = 5; L <= 70; L += 5) {
  const cells = [
    ratioToPlayer('xiaoyao', L, 'maxHealth', 'maxHealth'),
    ratioToPlayer('yaotu', L, 'maxHealth', 'maxHealth'),
    ratioToPlayer('yaokui', L, 'maxHealth', 'maxHealth'),
    ratioToPlayer('xiaoyao', L, 'attack', 'attack'),
    ratioToPlayer('yaotu', L, 'attack', 'attack'),
    ratioToPlayer('xiaoyao', L, 'defense', 'defense'),
    ratioToPlayer('yaotu', L, 'defense', 'defense'),
  ]
  console.log(`${L}\t${cells.map((v) => v.toFixed(0) + '%').join('\t')}`)
}

console.log('\n-- TTK 模拟（确定性，普攻减法模型） --')
for (const r of ttkRows) console.log(`${r.label}: ${r.turns} 回合 ${r.win ? '胜' : '败'}`)

console.log('\n-- 升级所需同等级击杀数（exp_table / 基准×roleMult） --')
for (let L = 1; L <= 50; L += 7) console.log(`L${L}: ${killsAt(L).toFixed(1)} 只`)

console.log('\n-- 奖励现状偏差（enemy.exp/money 实数 ÷ 基准×roleMult，中位；warning 不阻断） --')
for (const [role, g] of Object.entries(rewardGap)) console.log(`${ROLE_LABEL[role]}: exp×${g.exp.toFixed(2)} gold×${g.gold.toFixed(2)} (n=${g.n})`)

console.log('\n-- 敌人 def/攻 比（L50 期望；「破防悬崖」在新曲线下不存在） --')
for (const w of defAtkRows) console.log(`${ROLE_LABEL[w.tier] ?? w.tier}: def/攻 ${w.ratio.toFixed(2)}｜def/玩家攻 ${(w.toPlayerAtk * 100).toFixed(0)}%`)

if (Object.keys(outliers).length) {
  console.log('\n-- 拟合离群清单（超出容差，计入 A3 白名单容量） --')
  for (const [k, list] of Object.entries(outliers)) console.log(`${k}: ${list.join('; ')}`)
}

console.log('\n=== 断言结果 ===')
if (failures.length) {
  for (const f of failures) console.log(`[FAIL] ${f}`)
  console.log(`共 ${failures.length} 条断言失败，退出码 1`)
  process.exit(1)
}
console.log('全部断言通过（A1 曲线 / A2 品阶单调 / A3 拟合度 / A4 玩家对标 / A5 TTK / A6 模型单调 / A7 奖励自洽 / A8 词缀规则）')

// ---------------------------------------------------------------------------
// --write：生成数值总表 Markdown，写回文档生成区间（保留 UTF-8 BOM）
// ---------------------------------------------------------------------------

if (WRITE) {
  const BEGIN = '<!-- BEGIN:generated:enemy-design-tables (node scripts/generate-enemy-design.cjs --write，勿手改本区间) -->'
  const END = '<!-- END:generated:enemy-design-tables -->'
  const md = []
  const cell = (v) => String(v)

  md.push('### 品阶系数矩阵（拟合值）', '')
  md.push('> 各档位实数相对等级模板曲线的中位数，由脚本现场拟合；改 enemies.json / curves.json 后重跑即再生。', '')
  md.push('| 档位 | ' + STAT_KEYS.map((k) => ({ maxHealth: '血量', attack: '攻击', defense: '防御', speed: '速度', hitValue: '命中', dodgeValue: '闪避' }[k])).join(' | ') + ' |')
  md.push('| --- | ' + STAT_KEYS.map(() => '---').join(' | ') + ' |')
  for (const role of ROLES) md.push(`| ${ROLE_LABEL[role]} ${role} | ` + STAT_KEYS.map((k) => cell(COEF[role][k].toFixed(2))).join(' | ') + ' |')
  for (const t of SPECIAL_TIERS) md.push(`| ${t.label} | ` + STAT_KEYS.map((k) => cell(COEF[t.key][k].toFixed(2))).join(' | ') + ' |')
  md.push('')

  md.push('### 次级维度模板曲线（小妖样本最小二乘拟合）', '')
  md.push('```')
  md.push(`hitValue        = ${secondaryFit.hitValue.a.toFixed(1)} + ${secondaryFit.hitValue.b.toFixed(2)}×(L−1)`)
  md.push(`dodgeValue      = ${secondaryFit.dodgeValue.a.toFixed(1)} + ${secondaryFit.dodgeValue.b.toFixed(2)}×(L−1)`)
  md.push(`critRate   = ${secondaryFit.critRate.a.toFixed(1)} + ${secondaryFit.critRate.b.toFixed(2)}×(L−1)`)
  md.push(`critDamage = ${secondaryFit.critDamage.a.toFixed(1)} + ${secondaryFit.critDamage.b.toFixed(2)}×(L−1)`)
  md.push('maxEnergy = 150（全体常量）；energyInit = 25（终局 BOSS 特例 50）')
  md.push('```', '')

  md.push('### 每 5 级期望值总表（血/攻/防/速 = round(模板曲线×品阶系数)）', '')
  md.push('> 各档位存在域见正文 §3.4；表内超出存在域的等级（如妖徒 L1）为模型外推值，仅供推演。', '')
  md.push('| 等级 | ' + ROLES.map((r) => `${ROLE_LABEL[r]}`) .join(' | ') + ' |')
  md.push('| --- | ' + ROLES.map(() => '---').join(' | ') + ' |')
  for (let L = 1; L <= 70; L += 5) {
    const cells = ROLES.map((r) => {
      const s = expectStats(r, L)
      return `${s.maxHealth}/${s.attack}/${s.defense}/${s.speed}`
    })
    md.push(`| ${L} | ` + cells.join(' | ') + ' |')
  }
  md.push('')
  md.push('特殊档：', '')
  md.push('| 档位 | 等级 | 血/攻/防/速 |')
  md.push('| --- | --- | --- |')
  for (const t of SPECIAL_TIERS) {
    for (const L of [...new Set(enemies.filter((e) => t.match(e.id)).map((e) => e.level))].sort((a, b) => a - b)) {
      const s = expectStats(t.key, L)
      md.push(`| ${t.label} | ${L} | ${s.maxHealth}/${s.attack}/${s.defense}/${s.speed} |`)
    }
  }
  md.push('')

  md.push('### 玩家对标比例表（模型期望 ÷ computePlayerBase，%）', '')
  md.push('> 玩家基准 = base + (L−1)×growth（不含自由点/装备，下界口径）。敌人曲线与玩家线同斜率重定标（hp{45,18} = 0.75×SAPhp），小妖血量比例恒定 75%，各档位比例不随等级漂移；后期强度差由品阶系数、词缀与阵容规模弥补。', '')
  md.push('| 等级 | 小妖血 | 妖徒血 | 妖魁血 | 妖王血 | 妖尊血 | 小妖攻 | 妖徒攻 | 小妖防 |')
  md.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (let L = 5; L <= 70; L += 5) {
    const cells = [
      ratioToPlayer('xiaoyao', L, 'maxHealth', 'maxHealth'),
      ratioToPlayer('yaotu', L, 'maxHealth', 'maxHealth'),
      ratioToPlayer('yaokui', L, 'maxHealth', 'maxHealth'),
      ratioToPlayer('yaowang', L, 'maxHealth', 'maxHealth'),
      ratioToPlayer('yaozun', L, 'maxHealth', 'maxHealth'),
      ratioToPlayer('xiaoyao', L, 'attack', 'attack'),
      ratioToPlayer('yaotu', L, 'attack', 'attack'),
      ratioToPlayer('xiaoyao', L, 'defense', 'defense'),
    ]
    md.push(`| ${L} | ` + cells.map((v) => v.toFixed(0) + '%').join(' | ') + ' |')
  }
  md.push('')

  md.push('### TTK 模拟（SAP 裸线小队，确定性普攻减法模拟）', '')
  md.push('| 对局 | 回合数 | 结果 |')
  md.push('| --- | --- | --- |')
  for (const r of ttkRows) md.push(`| ${r.label} | ${r.turns} | ${r.win ? '我方胜' : '我方败'} |`)
  md.push('')
  md.push(`敌人 def 对标（L50 期望）：${defAtkRows.map((w) => `${ROLE_LABEL[w.tier] ?? w.tier} def/攻 ${w.ratio.toFixed(2)}、def/玩家攻 ${(w.toPlayerAtk * 100).toFixed(0)}%`).join('；')}。敌 def 占同等级玩家攻的 20%~34%（随档位递增），普攻下限 0.85×玩家攻 − 0.34×玩家攻 = 0.51×玩家攻 > 0 恒成立 → 旧减法模型的「破防悬崖」在全等级域不再出现。`, '')

  md.push('### 升级所需同等级击杀数（exp_table ÷ (基准exp×roleMult)）', '')
  md.push('| 等级 | ' + Array.from({ length: 8 }, (_, i) => 1 + i * 7).join(' | ') + ' |')
  md.push('| --- | ' + Array.from({ length: 8 }, () => '---').join(' | ') + ' |')
  md.push('| 击杀数 | ' + Array.from({ length: 8 }, (_, i) => killsAt(1 + i * 7).toFixed(1)).join(' | ') + ' |')
  md.push('')

  md.push('### 奖励现状偏差（enemy.exp/money ÷ 基准×roleMult，中位）', '')
  md.push('| 档位 | exp 倍率 | 金钱倍率 | 样本 |')
  md.push('| --- | --- | --- | --- |')
  for (const [role, g] of Object.entries(rewardGap)) md.push(`| ${ROLE_LABEL[role]} | ×${g.exp.toFixed(2)} | ×${g.gold.toFixed(2)} | ${g.n} |`)
  md.push('')

  if (Object.keys(outliers).length) {
    md.push(`### 拟合离群清单（超出容差，白名单容量 ${OUTLIER_ALLOWANCE}/维）`, '')
    for (const [k, list] of Object.entries(outliers)) md.push(`- **${k}**: ${list.join('；')}`)
    md.push('')
  }

  const block = `${BEGIN}\n${md.join('\n')}\n${END}`
  let src = fs.readFileSync(DOC_FILE, 'utf8')
  const hasBom = src.charCodeAt(0) === 0xfeff
  const re = new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  if (re.test(src)) src = src.replace(re, block)
  else src = src.trimEnd() + '\n\n' + block + '\n'
  // BOM 感知写回（documents/*.md 必须 UTF-8 带 BOM）
  fs.writeFileSync(DOC_FILE, (hasBom ? '\ufeff' : '') + src.replace(/^\ufeff/, ''), 'utf8')
  console.log(`\n[generate-enemy-design] 数值总表已写回 ${path.relative(ROOT, DOC_FILE)}（BOM: ${hasBom ? '保留' : '无——请检查文档编码'}）`)
}

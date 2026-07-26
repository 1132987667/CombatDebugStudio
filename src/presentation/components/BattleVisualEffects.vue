<!--
  战斗视觉特效层
  覆盖在战场上方，实现技能名飞行、光弹尾迹、命中爆炸、治疗光环、护盾六边形、屏幕震动等效果
  ponytail: 纯 DOM + CSS 动画实现，无 GSAP 依赖，动画结束后自动清理
-->
<template>
  <div id="visual-effects-root" class="battle-visual-effects" :class="{ 'screen-shake': shaking }">
    <!-- 技能名飞行 -->
    <div v-for="sk in skillNames" :key="sk.id" class="skill-name" :class="sk.fromSide"
      :style="{ left: sk.x + 'px', top: sk.y + 'px', '--dx': sk.dx + 'px', '--dy': sk.dy + 'px' }">
      {{ sk.text }}
    </div>

    <!-- 光弹（用 JS 驱动，模板只做容器）-->

    <!-- 命中爆炸 -->
    <div v-for="imp in impacts" :key="imp.id" class="impact" :class="[imp.colorType, imp.style]"
      :style="{ left: imp.x + 'px', top: imp.y + 'px' }"></div>

    <!-- 火花粒子（用 JS 驱动）-->

    <!-- 治疗光环 -->
    <div v-for="aura in healAuras" :key="aura.id" class="heal-aura"
      :style="{ left: aura.x + 'px', top: aura.y + 'px' }"></div>

    <!-- 护盾六边形 -->
    <div v-for="hex in shieldHexes" :key="hex.id" class="shield-hex" :style="{ left: hex.x + 'px', top: hex.y + 'px' }">
      <svg viewBox="0 0 100 100" fill="none">
        <polygon points="50,5 90,27 90,73 50,95 10,73 10,27" stroke="var(--vfx-frost)" stroke-width="2"
          fill="rgba(76,201,240,0.1)" />
        <polygon points="50,20 75,35 75,65 50,80 25,65 25,35" stroke="var(--vfx-heal)" stroke-width="1" fill="none"
          opacity="0.6" />
      </svg>
    </div>

    <!-- 伤害/治疗/护盾数字 -->
    <div v-for="dn in dmgNums" :key="dn.id" class="floating-num" :class="dn.cls"
      :style="{ left: dn.x + 'px', top: dn.y + 'px' }">
      {{ dn.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, nextTick } from 'vue'
import { useDebugStore } from '@/presentation/stores/debugStore'
import { getActionBudget } from '@/shared/constants/animation-timing'
import { useBattleStore } from '@/presentation/stores/battleStore'

const debugStore = useDebugStore()

// ============ 类型 ============
export interface CardPos { x: number; y: number; el: HTMLElement }

// ============ VFX 颜色映射 ============
/* ponytail: these match the --vfx-* CSS variables above; keep in sync */
const VFX_COLORS: Record<string, Record<string, string>> = {
  fire: { bg: '#ffaa30', glow: '#ff6600' },
  frost: { bg: '#8ee0ff', glow: '#4cc9f0' },
  heal: { bg: '#6affd0', glow: '#2dd4a8' },
  shield: { bg: '#8ee0ff', glow: '#4cc9f0' },
}

// ============ 响应式数据 ============
let nextId = 0

/** 技能名飞行 */
const skillNames = ref<Array<{ id: number; text: string; x: number; y: number; dx: number; dy: number; fromSide: string }>>([])
/** 命中爆炸 */
const impacts = ref<Array<{ id: number; x: number; y: number; colorType: string; style: string }>>([])
/** 治疗光环 */
const healAuras = ref<Array<{ id: number; x: number; y: number }>>([])
/** 护盾六边形 */
const shieldHexes = ref<Array<{ id: number; x: number; y: number }>>([])
/** 伤害/治疗/护盾数字 */
const dmgNums = ref<Array<{ id: number; text: string; x: number; y: number; cls: string }>>([])
/** 屏幕震动 */
const shaking = ref(false)

// ============ 工具 ============
let timeouts: ReturnType<typeof setTimeout>[] = []
function setRemove(id: number, arr: any, delay: number) {
  const t = setTimeout(() => {
    const idx = arr.value.findIndex((i: any) => i.id === id)
    if (idx !== -1) arr.value.splice(idx, 1)
  }, delay)
  timeouts.push(t)
}

function spawn(html: string, x: number, y: number, cls: string, duration: number, container?: HTMLElement): HTMLElement {
  const el = document.createElement('div')
  el.className = cls
  el.innerHTML = html
  el.style.left = x + 'px'
  el.style.top = y + 'px'
    ; (container || document.getElementById('visual-effects-root') || document.body).appendChild(el)
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el) }, duration + 50)
  return el
}

// ============ 获取卡片位置 ============
/** 外部需注入卡片 DOM 元素映射 */
const cardElements = new Map<string, HTMLElement>()

function registerCard(id: string, el: HTMLElement) { cardElements.set(id, el) }
function unregisterCard(id: string) { cardElements.delete(id) }

function cardCenter(id: string): CardPos | null {
  const el = cardElements.get(id)
  if (!el) {
    console.warn('[BattleVisualEffects] 卡片未注册，无法定位:', id, '已有卡片:', Array.from(cardElements.keys()))
    return null
  }
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, el }
}

// ============ 公共方法 ============

/** 技能名从攻击者飞向目标（飞行时长 = budget * 0.5，即 0→50%T） */
function showSkillName(attackerId: string, targetId: string, name: string, fromSide: 'left' | 'right', budget: number) {
  const aPos = cardCenter(attackerId)
  const tPos = cardCenter(targetId)
  if (!aPos || !tPos) return

  const id = nextId++
  const dx = tPos.x - aPos.x
  const dy = tPos.y - aPos.y
  skillNames.value.push({ id, text: name, x: aPos.x, y: aPos.y - 20, dx, dy, fromSide })
  setRemove(id, skillNames, budget * 0.5 + 50)
}

/** 光弹飞行（requestAnimationFrame 驱动），duration = budget * 0.3（20%→50%T） */
function showProjectile(fromId: string, toId: string, type: 'fire' | 'frost' | 'heal' | 'shield', duration: number) {
  const from = cardCenter(fromId)
  const to = cardCenter(toId)
  if (!from || !to) return

  const proj = document.createElement('div')
  proj.className = `projectile ${type}`
  const root = document.getElementById('visual-effects-root')
  if (!root) return
  root.appendChild(proj)

  const dx = to.x - from.x
  const dy = to.y - from.y
  const start = performance.now()
  let lastTrail = 0

  function step(now: number) {
    const t = Math.min(1, (now - start) / duration)
    const arc = Math.sin(t * Math.PI) * 60
    const x = from.x + dx * t
    const y = from.y + dy * t - arc
    proj.style.left = (x - 7) + 'px'
    proj.style.top = (y - 7) + 'px'

    // 尾迹
    if (now - lastTrail > 30) {
      lastTrail = now
      const trail = document.createElement('div')
      trail.className = 'projectile-trail'
      trail.style.left = x + 'px'
      trail.style.top = y + 'px'
      if (type === 'fire') {
        trail.style.background = `radial-gradient(circle, ${VFX_COLORS[type].bg}, transparent)`
        trail.style.boxShadow = `0 0 10px ${VFX_COLORS[type].glow}`
      } else {
        trail.style.background = `radial-gradient(circle, ${VFX_COLORS.frost.bg}, transparent)`
        trail.style.boxShadow = `0 0 10px ${VFX_COLORS.frost.glow}`
      }
      root.appendChild(trail)
      setTimeout(() => { if (trail.parentNode) trail.parentNode.removeChild(trail) }, 600)
    }

    if (t < 1) {
      requestAnimationFrame(step)
    } else {
      if (proj.parentNode) proj.parentNode.removeChild(proj)
    }
  }
  requestAnimationFrame(step)
}

/** 命中爆炸 — 根据 debugStore.impactStyle 选择动画变体 */
function showImpact(targetId: string, colorType: 'fire' | 'frost' | 'heal' | 'shield', budget?: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  const style = debugStore.impactStyle
  impacts.value.push({ id, x: pos.x, y: pos.y, colorType, style })
  // NOTE: 命中爆炸清除时长 = 数字上浮阶段（50%→85%T），有 budget 时按比例，否则兜底 1x
  const impactDuration = (budget ?? getActionBudget(1)) * 0.35
  setRemove(id, impacts, impactDuration)

  // 粒子 — 根据 style 变化
  const isCrit = false // 只区分颜色，暴击由调用方决定
  const sparkColors: Record<string, { bg: string; glow: string }> = {
    fire: { bg: '#ffaa30', glow: '#ff6600' },
    frost: { bg: '#8ee0ff', glow: '#4cc9f0' },
    heal: { bg: '#6affd0', glow: '#2dd4a8' },
    shield: { bg: '#8ee0ff', glow: '#4cc9f0' },
  }
  const c = sparkColors[colorType] || sparkColors.fire

  switch (style) {
    case 'explosion':
      spawnExplosionParticles(pos, c)
      break
    case 'slash':
      // ponytail: 一刀效果完全由 CSS ::before 实现，无需额外 JS 粒子
      break
    case 'iceshatter':
      spawnIceShatterParticles(pos, c)
      break
    case 'shockwave':
      // 冲击波无额外粒子，纯 CSS
      break
    case 'shadow':
      spawnShadowParticles(pos, c)
      break
  }
}

/** 爆炸粒子（原 showImpact 的火花逻辑） */
function spawnExplosionParticles(pos: CardPos, c: { bg: string; glow: string }) {
  const sparkCount = 12
  for (let i = 0; i < sparkCount; i++) {
    const spark = createSpark(pos, c, 4)
    const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.5
    const dist = 40 + Math.random() * 50
    const sx = Math.cos(angle) * dist
    const sy = Math.sin(angle) * dist
    spark.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px)) scale(0)`, opacity: 0 }
    ], { duration: 600, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' })
    setTimeout(() => { if (spark.parentNode) spark.parentNode.removeChild(spark) }, 650)
  }
}

/** 冰裂粒子 — 菱形碎晶散射 */
function spawnIceShatterParticles(pos: CardPos, c: { bg: string; glow: string }) {
  for (let i = 0; i < 6; i++) {
    const spark = createSpark(pos, c, 4)
    // 菱形碎片
    spark.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
    spark.style.borderRadius = '0'
    spark.style.width = '8px'
    spark.style.height = '8px'
    const angle = Math.random() * Math.PI * 2
    const dist = 25 + Math.random() * 55
    const sx = Math.cos(angle) * dist
    const sy = Math.sin(angle) * dist
    spark.animate([
      { transform: 'translate(-50%, -50%) scale(0.5) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px)) scale(0) rotate(${120 + Math.random() * 120}deg)`, opacity: 0 }
    ], { duration: 600, easing: 'cubic-bezier(0.1, 0.9, 0.2, 1)' })
    setTimeout(() => { if (spark.parentNode) spark.parentNode.removeChild(spark) }, 650)
  }
  // 一个明亮的核心闪光
  const flash = document.createElement('div')
  flash.style.cssText = `
    position: fixed; left: ${pos.x}px; top: ${pos.y}px;
    width: 20px; height: 20px; border-radius: 50%;
    pointer-events: none; z-index: 158;
    background: radial-gradient(circle, #fff, ${c.bg}, transparent);
    box-shadow: 0 0 30px ${c.glow};
  `
  const root = document.getElementById('visual-effects-root')
  if (root) root.appendChild(flash)
  flash.animate([
    { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 1 },
    { transform: 'translate(-50%, -50%) scale(2.5)', opacity: 0 }
  ], { duration: 400, easing: 'ease-out' })
  setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash) }, 450)
}

/** 暗影粒子 — 上升烟雾 */
function spawnShadowParticles(pos: CardPos, c: { bg: string; glow: string }) {
  for (let i = 0; i < 10; i++) {
    const spark = createSpark(pos, c, 5)
    // 暗影用暗紫色而不是原色
    spark.style.background = 'radial-gradient(circle, #a855f7, transparent)'
    spark.style.boxShadow = '0 0 8px #a855f7'
    const sx = (Math.random() - 0.5) * 60
    const sy = -30 - Math.random() * 50
    spark.style.width = (6 + Math.random() * 8) + 'px'
    spark.style.height = spark.style.width
    spark.animate([
      { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0.8 },
      { transform: `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px)) scale(1.5)`, opacity: 0 }
    ], { duration: 800, easing: 'ease-out' })
    setTimeout(() => { if (spark.parentNode) spark.parentNode.removeChild(spark) }, 850)
  }
}

/** 创建单个火花 DOM 元素 */
function createSpark(pos: CardPos, c: { bg: string; glow: string }, size: number): HTMLElement {
  const spark = document.createElement('div')
  spark.className = 'spark'
  spark.style.cssText = `
    position: fixed; left: ${pos.x}px; top: ${pos.y}px;
    width: ${size}px; height: ${size}px; border-radius: 50%;
    pointer-events: none; z-index: 156;
    background: ${c.bg};
    box-shadow: 0 0 8px ${c.glow};
  `
  const root = document.getElementById('visual-effects-root')
  if (root) root.appendChild(spark)
  return spark
}

/** 治疗光环 */
function showHealAura(targetId: string, budget?: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  healAuras.value.push({ id, x: pos.x, y: pos.y })
  // NOTE: 治疗光环清除时长 = 命中阶段（50%→100%T）
  const auraDuration = (budget ?? getActionBudget(1)) * 0.5
  setRemove(id, healAuras, auraDuration)

  // 第二层
  const id2 = nextId++
  setTimeout(() => {
    healAuras.value.push({ id: id2, x: pos.x, y: pos.y })
    setRemove(id2, healAuras, auraDuration)
  }, 200)
}

/** 护盾六边形 */
function showShieldHex(targetId: string, budget?: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  shieldHexes.value.push({ id, x: pos.x, y: pos.y })
  const hexDuration = (budget ?? getActionBudget(1)) * 0.5
  setRemove(id, shieldHexes, hexDuration)
}

/** 伤害数字（上浮淡出时长 = budget * 0.35，即 50%→85%T） */
function showDamageNum(targetId: string, value: number, isCrit: boolean, budget?: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  // HACK: budget 由所有当前调用方传入，兜底用 1x 速度的 numberFloat 阶段时长
  const floatDuration = (budget ?? getActionBudget(1)) * 0.35
  dmgNums.value.push({
    id, text: `-${value}`,
    x: pos.x + (Math.random() - 0.5) * 40,
    y: pos.y - 20,
    cls: isCrit ? 'dmg crit' : 'dmg normal',
  })
  setRemove(id, dmgNums, floatDuration)
}

/** 治疗数字（上浮淡出时长 = budget * 0.35） */
function showHealNum(targetId: string, value: number, budget?: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  const floatDuration = (budget ?? getActionBudget(1)) * 0.35
  dmgNums.value.push({
    id, text: `+${value}`,
    x: pos.x + (Math.random() - 0.5) * 30,
    y: pos.y + 10,
    cls: 'heal-num',
  })
  setRemove(id, dmgNums, floatDuration)
}

/** 护盾数字 */
function showShieldNum(targetId: string, value: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  dmgNums.value.push({
    id, text: `+${value}`,
    x: pos.x + (Math.random() - 0.5) * 30,
    y: pos.y + 15,
    cls: 'shield-num',
  })
  setRemove(id, dmgNums, 1450)
}

/** 屏幕震动 */
function showScreenShake() {
  shaking.value = true
  setTimeout(() => { shaking.value = false }, 400)
}

/** 飞行序列：只飞（技能名 + 光弹），不包含命中 */
function playFlightSequence(
  attackerId: string,
  targetId: string,
  skillName: string,
  fromSide: 'left' | 'right',
  impactStyle: 'fire' | 'frost',
  budget: number,
) {
  showSkillName(attackerId, targetId, skillName, fromSide, budget)
  // 光弹从 20%T 出发 → 50%T 到达
  setTimeout(() => showProjectile(attackerId, targetId, impactStyle, budget * 0.3), budget * 0.2)
}

/** 完整攻击动画序列（已废弃 — 保留旧接口兼容） */
function playAttackSequence(
  attackerId: string,
  targetId: string,
  skillName: string,
  damage: number,
  isCrit: boolean,
  fromSide: 'left' | 'right',
  impactStyle: 'fire' | 'frost' = 'fire',
) {
  const budget = getActionBudget(useBattleStore().battleSpeed)
  showSkillName(attackerId, targetId, skillName, fromSide, budget)
  setTimeout(() => showProjectile(attackerId, targetId, impactStyle, budget * 0.3), budget * 0.2)
  setTimeout(() => {
    showImpact(targetId, impactStyle, budget)
    if (damage > 0) showDamageNum(targetId, damage, isCrit, budget)
    if (isCrit) showScreenShake()
  }, budget * 0.5)
}

/** 完整治疗动画序列（已废弃 — 保留旧接口兼容） */
function playHealSequence(healerId: string, targetId: string, skillName: string, value: number, fromSide: 'left' | 'right') {
  const budget = getActionBudget(useBattleStore().battleSpeed)
  showSkillName(healerId, targetId, skillName, fromSide, budget)
  setTimeout(() => showProjectile(healerId, targetId, 'heal', budget * 0.3), budget * 0.2)
  setTimeout(() => {
    showImpact(targetId, 'heal', budget)
    showHealAura(targetId, budget)
    showHealNum(targetId, value, budget)
  }, budget * 0.5)
}

/** 完整护盾动画序列（已废弃 — 保留旧接口兼容） */
function playShieldSequence(casterId: string, targetId: string, skillName: string, value: number, fromSide: 'left' | 'right') {
  const budget = getActionBudget(useBattleStore().battleSpeed)
  showSkillName(casterId, targetId, skillName, fromSide, budget)
  setTimeout(() => showProjectile(casterId, targetId, 'shield', budget * 0.3), budget * 0.2)
  setTimeout(() => {
    showShieldHex(targetId, budget)
    showShieldNum(targetId, value)
  }, budget * 0.5)
}

defineExpose({
  registerCard,
  unregisterCard,
  showSkillName,
  showProjectile,
  showImpact,
  showHealAura,
  showShieldHex,
  showDamageNum,
  showHealNum,
  showShieldNum,
  showScreenShake,
  playFlightSequence,
  playAttackSequence,
  playHealSequence,
  playShieldSequence,
  cardElements,
})

onUnmounted(() => {
  timeouts.forEach(clearTimeout)
  cardElements.clear()
})
</script>

<style scoped>
.battle-visual-effects {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1000;
}
</style>

<style>
/* ============ 全局样式（非 scoped，因为动态创建的元素在 DOM 中） ============ */

/* ponytail: VFX 专用色 — 纯视觉效果独有，不纳入全局设计令牌 */
:root {
  --vfx-fire: #ffaa30;
  --vfx-fire-glow: #ff6600;
  --vfx-fire-core: #ff4400;
  --vfx-frost: #8ee0ff;
  --vfx-frost-glow: #4cc9f0;
  --vfx-heal: #6affd0;
  --vfx-heal-glow: #2dd4a8;
  --vfx-skill-color: #ffd478;
}

/* 屏幕震动 */
.screen-shake {
  animation: visual-shake 0.4s cubic-bezier(.36, .07, .19, .97);
}

@keyframes visual-shake {

  0%,
  100% {
    transform: translate(0, 0);
  }

  10% {
    transform: translate(-4px, 2px);
  }

  20% {
    transform: translate(4px, -2px);
  }

  30% {
    transform: translate(-3px, 1px);
  }

  40% {
    transform: translate(3px, -1px);
  }

  50% {
    transform: translate(-2px, 1px);
  }

  60% {
    transform: translate(2px, -1px);
  }

  70% {
    transform: translate(-1px, 0);
  }
}

/* 技能名飞行 */
.skill-name {
  position: fixed;
  font-family: 'Noto Serif SC', serif;
  font-weight: 900;
  font-size: 22px;
  letter-spacing: 4px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1100;
  color: var(--vfx-skill-color);
  text-shadow: 0 0 12px currentColor, 0 0 24px currentColor, 0 2px 6px rgba(0, 0, 0, 0.95);
  will-change: transform, opacity;
  animation: skill-fly 1.2s cubic-bezier(0.3, 0.1, 0.6, 1) forwards;
}

@keyframes skill-fly {
  0% {
    transform: translate(-50%, -50%) scale(0.3) rotate(-8deg);
    opacity: 0;
  }

  15% {
    transform: translate(-50%, -50%) scale(1.25) rotate(-3deg);
    opacity: 1;
  }

  70% {
    transform: translate(calc(-50% + var(--dx) * 0.85), calc(-50% + var(--dy) * 0.85)) scale(1.05) rotate(2deg);
    opacity: 1;
  }

  100% {
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.7) rotate(5deg);
    opacity: 0;
  }
}

/* 光弹 */
.projectile {
  position: fixed;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1050;
  will-change: transform, opacity;
}

.projectile.fire {
  background: radial-gradient(circle, #fff, var(--vfx-fire) 30%, var(--vfx-fire-core) 70%, transparent);
  box-shadow: 0 0 20px var(--vfx-fire-glow), 0 0 40px var(--vfx-fire-core);
}

.projectile.frost {
  background: radial-gradient(circle, #fff, var(--vfx-frost) 30%, var(--vfx-frost-glow) 70%, transparent);
  box-shadow: 0 0 20px var(--vfx-frost-glow), 0 0 40px var(--vfx-frost-glow);
}

.projectile.heal {
  background: radial-gradient(circle, #fff, var(--vfx-heal) 30%, var(--vfx-heal-glow) 70%, transparent);
  box-shadow: 0 0 20px var(--vfx-heal-glow), 0 0 40px var(--vfx-heal-glow);
}

.projectile.shield {
  background: radial-gradient(circle, #fff, var(--vfx-frost) 30%, var(--vfx-frost-glow) 70%, transparent);
  box-shadow: 0 0 20px var(--vfx-frost-glow), 0 0 40px var(--vfx-frost-glow);
}

/* 光弹尾迹 */
.projectile-trail {
  position: fixed;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1049;
  animation: trail-fade 0.6s ease forwards;
}

@keyframes trail-fade {
  0% {
    opacity: 0.8;
    transform: translate(-50%, -50%) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.2);
  }
}

/* 命中爆炸 — 基础样式 */
.impact {
  position: fixed;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1100;
  transform: translate(-50%, -50%);
  animation-duration: 0.5s;
  animation-fill-mode: forwards;
}

/* 颜色变体（与原有一致） */
.impact.fire {
  background: radial-gradient(circle, #fff, var(--vfx-fire) 20%, var(--vfx-fire-core) 50%, transparent 70%);
}
.impact.frost,
.impact.shield {
  background: radial-gradient(circle, #fff, var(--vfx-frost) 20%, var(--vfx-frost-glow) 50%, transparent 70%);
}
.impact.heal {
  background: radial-gradient(circle, #fff, var(--vfx-heal) 20%, var(--vfx-heal-glow) 50%, transparent 70%);
}

/* ============ 爆炸动画变体 ============ */

/* 1. 爆炸 — 径向扩散（原版） */
.impact.explosion {
  animation-name: impact-burst;
}
@keyframes impact-burst {
  0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
  50%  { transform: translate(-50%, -50%) scale(1.8); opacity: 0.8; }
  100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
}

/* 2. 斩击 — 干净利落的一刀斜线 */
.impact.slash {
  width: 100px;
  height: 100px;
  border-radius: 0;
  background: none !important;
}
.impact.slash::before {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  width: 80px;
  height: 4px;
  border-radius: 2px;
  opacity: 0;
  transform: translate(-50%, -50%) rotate(-45deg);
  animation: slash-cut 0.25s ease-out both;
}
.impact.slash.fire::before {
  background: linear-gradient(90deg, transparent, var(--vfx-fire), #fff, var(--vfx-fire), transparent);
  box-shadow: 0 0 16px var(--vfx-fire-glow), 0 0 32px var(--vfx-fire-core);
}
.impact.slash.frost::before,
.impact.slash.shield::before {
  background: linear-gradient(90deg, transparent, var(--vfx-frost), #fff, var(--vfx-frost), transparent);
  box-shadow: 0 0 16px var(--vfx-frost-glow), 0 0 32px var(--vfx-frost-glow);
}
.impact.slash.heal::before {
  background: linear-gradient(90deg, transparent, var(--vfx-heal), #fff, var(--vfx-heal), transparent);
  box-shadow: 0 0 16px var(--vfx-heal-glow), 0 0 32px var(--vfx-heal-glow);
}
@keyframes slash-cut {
  0%   { transform: translate(-50%, -50%) rotate(-45deg) scaleX(0.1); opacity: 0; }
  15%  { transform: translate(-50%, -50%) rotate(-45deg) scaleX(1.3); opacity: 1; filter: brightness(2); }
  40%  { transform: translate(-50%, -50%) rotate(-45deg) scaleX(1.0); opacity: 1; filter: brightness(1.2); }
  100% { transform: translate(-50%, -50%) rotate(-45deg) scaleX(0.6); opacity: 0; filter: brightness(0.5); }
}

/* 3. 冰裂 — 菱形冰晶碎裂（不再是圆形扩散） */
.impact.iceshatter {
  width: 60px;
  height: 60px;
  border-radius: 0;
  background: none !important;
  animation-name: ice-crystal;
}
/* 冰晶主体 — 菱形 */
.impact.iceshatter::before {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  width: 40px;
  height: 40px;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  transform: translate(-50%, -50%);
  animation: ice-flash 0.5s ease-out forwards;
}
/* 外层碎片光环 */
.impact.iceshatter::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  width: 70px;
  height: 70px;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  transform: translate(-50%, -50%);
  opacity: 0;
  animation: ice-shards 0.6s ease-out forwards;
}
.impact.iceshatter.fire::before {
  background: linear-gradient(135deg, #fff, var(--vfx-fire), var(--vfx-fire-core));
  box-shadow: 0 0 20px var(--vfx-fire-glow), 0 0 40px var(--vfx-fire-core);
}
.impact.iceshatter.fire::after {
  background: linear-gradient(135deg, transparent, var(--vfx-fire) 40%, transparent);
  box-shadow: 0 0 15px var(--vfx-fire-glow);
}
.impact.iceshatter.frost::before,
.impact.iceshatter.shield::before {
  background: linear-gradient(135deg, #fff, var(--vfx-frost), var(--vfx-frost-glow));
  box-shadow: 0 0 20px var(--vfx-frost-glow), 0 0 40px var(--vfx-frost-glow);
}
.impact.iceshatter.frost::after,
.impact.iceshatter.shield::after {
  background: linear-gradient(135deg, transparent, var(--vfx-frost) 40%, transparent);
  box-shadow: 0 0 15px var(--vfx-frost-glow);
}
.impact.iceshatter.heal::before {
  background: linear-gradient(135deg, #fff, var(--vfx-heal), var(--vfx-heal-glow));
  box-shadow: 0 0 20px var(--vfx-heal-glow), 0 0 40px var(--vfx-heal-glow);
}
.impact.iceshatter.heal::after {
  background: linear-gradient(135deg, transparent, var(--vfx-heal) 40%, transparent);
  box-shadow: 0 0 15px var(--vfx-heal-glow);
}
@keyframes ice-crystal {
  0%   { transform: translate(-50%, -50%) scale(0.1) rotate(0deg); opacity: 0; }
  15%  { transform: translate(-50%, -50%) scale(1.3) rotate(15deg); opacity: 1; }
  40%  { transform: translate(-50%, -50%) scale(1.1) rotate(30deg); opacity: 0.9; }
  100% { transform: translate(-50%, -50%) scale(0.8) rotate(60deg); opacity: 0; }
}
@keyframes ice-flash {
  0%   { transform: translate(-50%, -50%) scale(0.1); opacity: 1; filter: brightness(2); }
  20%  { transform: translate(-50%, -50%) scale(1.2); opacity: 1; filter: brightness(1.5); }
  50%  { transform: translate(-50%, -50%) scale(0.9); opacity: 0.8; filter: brightness(1); }
  100% { transform: translate(-50%, -50%) scale(0.4); opacity: 0; filter: brightness(0.3); }
}
@keyframes ice-shards {
  0%   { transform: translate(-50%, -50%) scale(0.3) rotate(0deg); opacity: 0.6; }
  50%  { transform: translate(-50%, -50%) scale(1.6) rotate(45deg); opacity: 0.4; }
  100% { transform: translate(-50%, -50%) scale(2.2) rotate(90deg); opacity: 0; }
}

/* 4. 冲击波 — 多环扩散 */
.impact.shockwave {
  background: none !important;
  animation-name: shockwave-burst;
}
.impact.shockwave::before,
.impact.shockwave::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  width: 100%; height: 100%;
  border-radius: 50%;
  border: 3px solid;
  transform-origin: center center;
  transform: translate(-50%, -50%);
}
.impact.shockwave.fire::before,
.impact.shockwave.fire::after {
  border-color: var(--vfx-fire-glow);
  box-shadow: 0 0 12px var(--vfx-fire-glow), inset 0 0 12px var(--vfx-fire-glow);
}
.impact.shockwave.frost::before,
.impact.shockwave.frost::after,
.impact.shockwave.shield::before,
.impact.shockwave.shield::after {
  border-color: var(--vfx-frost-glow);
  box-shadow: 0 0 12px var(--vfx-frost-glow), inset 0 0 12px var(--vfx-frost-glow);
}
.impact.shockwave.heal::before,
.impact.shockwave.heal::after {
  border-color: var(--vfx-heal-glow);
  box-shadow: 0 0 12px var(--vfx-heal-glow), inset 0 0 12px var(--vfx-heal-glow);
}
.impact.shockwave::after { animation: ring-2 0.5s ease-out forwards; }
@keyframes shockwave-burst {
  0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
}
@keyframes ring-2 {
  0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0.8; }
  100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
}

/* 5. 暗影 — 紫黑能量爆发 */
.impact.shadow {
  animation-name: shadow-burst;
  mix-blend-mode: screen;
}
.impact.shadow.fire,
.impact.shadow.frost,
.impact.shadow.shield,
.impact.shadow.heal {
  /* 暗影统一用紫黑能量覆盖原色 */
  background: radial-gradient(circle, #c084fc 10%, #a855f7 30%, #7c3aed 50%, transparent 70%);
  box-shadow: 0 0 30px #a855f7, 0 0 60px #7c3aed;
}
@keyframes shadow-burst {
  0%   { transform: translate(-50%, -50%) scale(0.1); opacity: 0; filter: blur(8px); }
  30%  { transform: translate(-50%, -50%) scale(1.2); opacity: 1; filter: blur(2px); }
  60%  { transform: translate(-50%, -50%) scale(1.6); opacity: 0.7; filter: blur(0px); }
  100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; filter: blur(6px); }
}

/* 治疗光环 */
.heal-aura {
  position: fixed;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1100;
  transform: translate(-50%, -50%);
  border: 2px solid var(--vfx-heal-glow);
  box-shadow: 0 0 24px var(--vfx-heal-glow), inset 0 0 24px var(--vfx-heal-glow);
  animation: aura-expand 1s ease-out forwards;
}

@keyframes aura-expand {
  0% {
    transform: translate(-50%, -50%) scale(0.3);
    opacity: 1;
  }

  100% {
    transform: translate(-50%, -50%) scale(2);
    opacity: 0;
  }
}

/* 护盾六边形 */
.shield-hex {
  position: fixed;
  pointer-events: none;
  z-index: 1100;
  transform: translate(-50%, -50%);
  animation: hex-flash 0.9s ease-out forwards;
}

.shield-hex svg {
  width: 70px;
  height: 70px;
  filter: drop-shadow(0 0 8px var(--vfx-frost)) drop-shadow(0 0 16px var(--vfx-frost-glow));
}

@keyframes hex-flash {
  0% {
    transform: translate(-50%, -50%) scale(0.5) rotate(0deg);
    opacity: 0;
  }

  30% {
    transform: translate(-50%, -50%) scale(1.1) rotate(15deg);
    opacity: 1;
  }

  70% {
    transform: translate(-50%, -50%) scale(1) rotate(25deg);
    opacity: 0.8;
  }

  100% {
    transform: translate(-50%, -50%) scale(1.2) rotate(35deg);
    opacity: 0;
  }
}

/* 浮动数字 */
.floating-num {
  position: fixed;
  font-family: 'Cinzel', 'Noto Serif SC', serif;
  font-weight: 900;
  pointer-events: none;
  white-space: nowrap;
  z-index: 1100;
  will-change: transform, opacity;
}

.floating-num.dmg {
  text-shadow: 0 0 10px currentColor, 0 3px 6px rgba(0, 0, 0, 0.95), 0 0 24px currentColor;
  animation: dmg-pop 1.4s cubic-bezier(0.2, 0.6, 0.3, 1) forwards;
}

.floating-num.dmg.normal {
  font-size: var(--font-size-xxxl);
  color: var(--color-damage);
}

.floating-num.dmg.crit {
  font-size: 40px;
  color: var(--color-warning);
  text-shadow: 0 0 14px var(--color-warning), 0 3px 8px rgba(0, 0, 0, 0.95), 0 0 32px var(--color-warning);
}

.floating-num.dmg.crit::before {
  content: '破';
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Noto Serif SC', serif;
  font-size: var(--font-size-xl);
  color: var(--color-danger);
  text-shadow: 0 0 10px var(--color-danger), 0 0 20px var(--color-danger);
  letter-spacing: 0;
}

@keyframes dmg-pop {
  0% {
    transform: translate(-50%, -50%) scale(0.2);
    opacity: 0;
  }

  20% {
    transform: translate(-50%, -80%) scale(1.4);
    opacity: 1;
  }

  40% {
    transform: translate(-50%, -90%) scale(1.0);
    opacity: 1;
  }

  100% {
    transform: translate(-50%, -200%) scale(0.85);
    opacity: 0;
  }
}

.floating-num.heal-num {
  font-size: 24px;
  color: var(--color-heal);
  text-shadow: 0 0 12px var(--color-heal), 0 3px 6px rgba(0, 0, 0, 0.95), 0 0 28px var(--color-heal);
  animation: heal-rise 1.6s cubic-bezier(0.3, 0.2, 0.5, 1) forwards;
}

@keyframes heal-rise {
  0% {
    transform: translate(-50%, 30%) scale(0.3);
    opacity: 0;
  }

  20% {
    transform: translate(-50%, -20%) scale(1.3);
    opacity: 1;
  }

  50% {
    transform: translate(-50%, -90%) scale(1.0);
    opacity: 1;
  }

  100% {
    transform: translate(-50%, -180%) scale(0.85);
    opacity: 0;
  }
}

.floating-num.shield-num {
  font-size: 22px;
  color: var(--color-energy);
  text-shadow: 0 0 12px var(--color-energy), 0 3px 6px rgba(0, 0, 0, 0.95), 0 0 28px var(--color-energy);
  animation: shield-rise 1.4s cubic-bezier(0.3, 0.2, 0.5, 1) forwards;
}

@keyframes shield-rise {
  0% {
    transform: translate(-50%, 20%) scale(0.3);
    opacity: 0;
  }

  25% {
    transform: translate(-50%, -20%) scale(1.2);
    opacity: 1;
  }

  65% {
    transform: translate(-50%, -70%) scale(1.0);
    opacity: 1;
  }

  100% {
    transform: translate(-50%, -110%) scale(0.85);
    opacity: 0;
  }
}

/* 闪避文字（复用 dmg 类动画，灰色） */
.floating-num.miss {
  font-size: var(--font-size-xxl);
  color: var(--color-text-tertiary);
  text-shadow: 0 0 8px currentColor, 0 2px 4px rgba(0, 0, 0, 0.9);
}
</style>

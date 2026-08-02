<!--
  战斗视觉特效层
  覆盖在战场上方，实现技能名飞行、光弹尾迹、命中爆炸、治疗光环、护盾六边形、屏幕震动等效果
  纯 DOM + CSS 动画实现，无 GSAP 依赖，动画结束后自动清理
  NOTE: 本文件内的裸 hex/rgba（#ffaa30 等）是特效层专属色板（粒子/辉光/渐变），
        与 UI 语义色 token 体系隔离，属有意豁免——特效色追求视觉表现，不参与语义 token 化
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
      :style="{ left: dn.x + 'px', top: dn.y + 'px', '--rotate': (dn.rotate || 0) + 'deg' }">
      {{ dn.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, type Ref } from 'vue'
import { useDebugStore } from '@/presentation/stores/debugStore'
import { getActionBudget, BATTLE_ANIMATION_TIMING } from '@/shared/constants/animation-timing'
import { ImpactClass } from '@/shared/utils/visual-effect-mapper.ts'

const debugStore = useDebugStore()
const P = BATTLE_ANIMATION_TIMING.PHASES

// ============ 类型 ============
export interface CardPos { x: number; y: number; el: HTMLElement }


interface SkillNameItem { id: number; text: string; x: number; y: number; dx: number; dy: number; fromSide: string }
interface ImpactItem { id: number; x: number; y: number; colorType: ImpactClass; style: string }
interface PositionItem { id: number; x: number; y: number }
interface FloatingNumItem { id: number; text: string; x: number; y: number; cls: string; rotate?: number }

// ============ VFX 颜色映射 ============
/* NOTE: 与 <style> 中 --vfx-* CSS 变量同源，改这里必须同步改 CSS */
const VFX_COLORS: Record<ImpactClass, { bg: string; glow: string }> = {
  fire: { bg: '#ffaa30', glow: '#ff6600' },
  frost: { bg: '#8ee0ff', glow: '#4cc9f0' },
  heal: { bg: '#6affd0', glow: '#2dd4a8' },
  shield: { bg: '#8ee0ff', glow: '#4cc9f0' },
}

// ============ VFX 侧时长常量（耦合 CSS 关键帧，刻意不随倍速缩放） ============
/* NOTE: 这些数字与本文件 CSS 动画时长耦合，不从 PHASES 派生。
   若修改 CSS 动画时长，必须同步修改对应常量。 */
const SKILL_NAME_REMOVE_BUFFER_MS = 50   // 技能名移除缓冲（skill-fly 1.2s）
const DMG_NUM_MIN_TTL_MS = 1400          // 伤害数字浮动下限（dmg-pop 1.4s，可读性保障）
const HEAL_NUM_MIN_TTL_MS = 1600         // 治疗数字浮动下限（heal-rise 1.6s）
const SHIELD_NUM_TTL_MS = 1450           // 护盾数字 TTL（shield-rise 1.4s，+50ms 缓冲）
const SHAKE_DURATION_MS = 400            // 屏幕震动时长（visual-shake 0.4s）
const AURA_SECOND_LAYER_DELAY_MS = 200   // 治疗光环第二层延迟
const TRAIL_INTERVAL_MS = 30             // 光弹尾迹生成间隔
const TRAIL_TTL_MS = 600                 // 光弹尾迹存活时长（trail-fade 0.6s）
/* hex-flash CSS 动画 0.9s > JS 移除时长 b*0.5（1x 时 = 600ms），
   这意味着六边形在 CSS 动画完成前就被移除。这是原版既有行为。 */

// ============ 响应式数据 ============
let nextId = 0
const skillNames = ref<SkillNameItem[]>([])
const impacts = ref<ImpactItem[]>([])
const healAuras = ref<PositionItem[]>([])
const shieldHexes = ref<PositionItem[]>([])
const dmgNums = ref<FloatingNumItem[]>([])
const shaking = ref(false)

// ============ 生命周期安全调度器 ============
/* NOTE: 单视图应用中此组件实际不卸载（BattleArena 是唯一 view）。
   以下收口是卫生与期权，非修复既有泄漏（原版回调均有 parentNode 守卫）。 */
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
const pendingFrames = new Set<number>()

function later(fn: () => void, delay: number): void {
  const t = setTimeout(() => { pendingTimers.delete(t); fn() }, delay)
  pendingTimers.add(t)
}
function nextFrame(fn: FrameRequestCallback): void {
  const id = requestAnimationFrame((now) => { pendingFrames.delete(id); fn(now) })
  pendingFrames.add(id)
}

// ============ 泛型移除 ============
function setRemove<T extends { id: number }>(id: number, arr: Ref<T[]>, delay: number): void {
  later(() => {
    const idx = arr.value.findIndex((i) => i.id === id)
    if (idx !== -1) arr.value.splice(idx, 1)
  }, delay)
}

// ============ 相位派生时长（单一事实来源：animation-timing.ts） ============
/* NOTE: 随倍速缩放，值与历史魔数恒等（由特征测试证明）。 */
/** 技能名飞行时长 = nameFlight 相位（0→50%T），= budget × 0.5 */
const skillNameDuration = (b: number) => b * P.nameFlight.end
/** 光弹发射延迟 = projectile.start（20%T），= budget × 0.2 */
const projectileDelay = (b: number) => b * P.projectile.start
/** 光弹飞行时长 = projectile 相位跨度（20%→50%T），= budget × 0.3 */
const projectileDuration = (b: number) => b * (P.projectile.end - P.projectile.start)
/** 命中特效时长 = impact→numberFloat.end（50%→85%T），= budget × 0.35 */
const impactDuration = (b: number) => b * (P.numberFloat.end - P.impact)
/** 光环/护盾六边形时长 = 0→impact（0→50%T），= budget × 0.5 */
const auraDuration = (b: number) => b * P.impact

// ============ 获取卡片位置 ============
const cardElements = new Map<string, HTMLElement>()
function registerCard(id: string, el: HTMLElement) { cardElements.set(id, el) }
function unregisterCard(id: string) { cardElements.delete(id) }
function cardCenter(id: string): CardPos | null {
  const el = cardElements.get(id)
  // isConnected 防御：卡片可能已脱离文档但未反注册（v-if/路由切换瞬间），
  // 此时 getBoundingClientRect 返回过期坐标
  if (!el || !el.isConnected) {
    console.warn('[BattleVisualEffects] 卡片未注册或已脱离文档，无法定位:', id)
    return null
  }
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, el }
}

// ============ 公共方法 ============
/** 技能名从攻击者飞向目标（飞行时长 = 0→50%T） */
function showSkillName(attackerId: string, targetId: string, name: string, fromSide: 'left' | 'right', budget: number) {
  const aPos = cardCenter(attackerId)
  const tPos = cardCenter(targetId)
  if (!aPos || !tPos) return
  const id = nextId++
  skillNames.value.push({
    id, text: name,
    x: aPos.x, y: aPos.y - 20,
    dx: tPos.x - aPos.x, dy: tPos.y - aPos.y,
    fromSide,
  })
  setRemove(id, skillNames, skillNameDuration(budget) + SKILL_NAME_REMOVE_BUFFER_MS)
}

/** 光弹飞行（requestAnimationFrame 驱动），时长 = 20%→50%T */
function showProjectile(fromId: string, toId: string, type: ImpactClass, duration: number) {
  const from = cardCenter(fromId)
  const to = cardCenter(toId)
  // duration<=0 防御：避免 (now-start)/0 产生 NaN 坐标（实践中 budget 恒为正，此路径不可达）
  if (!from || !to || duration <= 0) return
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
    // 卸载后立即终止（元素已被回收），rAF 链自然断开
    if (!proj.isConnected) return
    const t = Math.min(1, (now - start) / duration)
    const arc = Math.sin(t * Math.PI) * 60
    const x = from.x + dx * t
    const y = from.y + dy * t - arc
    proj.style.left = (x - 7) + 'px'
    proj.style.top = (y - 7) + 'px'
    if (now - lastTrail > TRAIL_INTERVAL_MS) {
      lastTrail = now
      spawnTrail(root, x, y, type)
    }
    if (t < 1) {
      nextFrame(step)
    } else {
      if (proj.parentNode) proj.parentNode.removeChild(proj)
    }
  }
  nextFrame(step)
}

/** 光弹尾迹（生成后自行淡出） */
function spawnTrail(root: HTMLElement, x: number, y: number, type: ImpactClass) {
  const trail = document.createElement('div')
  trail.className = 'projectile-trail'
  trail.style.left = x + 'px'
  trail.style.top = y + 'px'
  if (type === 'fire') {
    trail.style.background = `radial-gradient(circle, ${VFX_COLORS.fire.bg}, transparent)`
    trail.style.boxShadow = `0 0 10px ${VFX_COLORS.fire.glow}`
  } else {
    trail.style.background = `radial-gradient(circle, ${VFX_COLORS.frost.bg}, transparent)`
    trail.style.boxShadow = `0 0 10px ${VFX_COLORS.frost.glow}`
  }
  root.appendChild(trail)
  later(() => { if (trail.parentNode) trail.parentNode.removeChild(trail) }, TRAIL_TTL_MS)
}

/** 命中爆炸 — 根据 debugStore.impactStyle 选择动画变体 */
function showImpact(targetId: string, colorType: ImpactClass, budget?: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  const style = debugStore.impactStyle
  impacts.value.push({ id, x: pos.x, y: pos.y, colorType, style })
  setRemove(id, impacts, impactDuration(budget ?? getActionBudget(1)))
  const c = VFX_COLORS[colorType] ?? VFX_COLORS.fire
  switch (style) {
    case 'explosion':
      spawnExplosionParticles(pos, c)
      break
    case 'slash':
      // NOTE: 一刀效果完全由 CSS ::before 实现，无需额外 JS 粒子
      break
    case 'iceshatter':
      spawnIceShatterParticles(pos, c)
      break
    case 'shockwave':
      // NOTE: 冲击波无额外粒子，纯 CSS
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
    later(() => { if (spark.parentNode) spark.parentNode.removeChild(spark) }, 650)
  }
}

/** 冰裂粒子 — 菱形碎晶散射 */
function spawnIceShatterParticles(pos: CardPos, c: { bg: string; glow: string }) {
  for (let i = 0; i < 6; i++) {
    const spark = createSpark(pos, c, 4)
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
    later(() => { if (spark.parentNode) spark.parentNode.removeChild(spark) }, 650)
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
  later(() => { if (flash.parentNode) flash.parentNode.removeChild(flash) }, 450)
}

/** 暗影粒子 — 上升烟雾 */
function spawnShadowParticles(pos: CardPos, c: { bg: string; glow: string }) {
  for (let i = 0; i < 10; i++) {
    const spark = createSpark(pos, c, 5)
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
    later(() => { if (spark.parentNode) spark.parentNode.removeChild(spark) }, 850)
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
  const duration = auraDuration(budget ?? getActionBudget(1))
  setRemove(id, healAuras, duration)
  const id2 = nextId++
  later(() => {
    healAuras.value.push({ id: id2, x: pos.x, y: pos.y })
    setRemove(id2, healAuras, duration)
  }, AURA_SECOND_LAYER_DELAY_MS)
}

/** 护盾六边形 */
function showShieldHex(targetId: string, budget?: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  shieldHexes.value.push({ id, x: pos.x, y: pos.y })
  setRemove(id, shieldHexes, auraDuration(budget ?? getActionBudget(1)))
}

/** 伤害数字（上浮淡出时长 = 50%→85%T） */
function showDamageNum(targetId: string, value: number, isCrit: boolean, budget?: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  // HACK: budget 由所有当前调用方传入，兜底用 1x 速度的 numberFloat 阶段时长。
  //       天花板：快速模式下上游（BattleSystem.shouldSuppressAnimationEvents）根本不发事件，
  //       此兜底实际不可达；若未来 VFX 需要感知快速模式，重新评估此兜底。
  const floatDuration = Math.max(impactDuration(budget ?? getActionBudget(1)), DMG_NUM_MIN_TTL_MS)
  dmgNums.value.push({
    id, text: `-${value}`,
    x: pos.x + (Math.random() - 0.5) * 60,
    y: pos.y - 20,
    cls: isCrit ? 'dmg crit' : 'dmg normal',
    rotate: (Math.random() - 0.5) * 10,
  })
  setRemove(id, dmgNums, floatDuration)
}

/** 治疗数字（上浮淡出时长 = 50%→85%T） */
function showHealNum(targetId: string, value: number, budget?: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  const floatDuration = Math.max(impactDuration(budget ?? getActionBudget(1)), HEAL_NUM_MIN_TTL_MS)
  dmgNums.value.push({
    id, text: `+${value}`,
    x: pos.x + (Math.random() - 0.5) * 40,
    y: pos.y + 10,
    cls: 'heal-num',
    rotate: (Math.random() - 0.5) * 6,
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
    x: pos.x + (Math.random() - 0.5) * 40,
    y: pos.y + 15,
    cls: 'shield-num',
    rotate: (Math.random() - 0.5) * 6,
  })
  setRemove(id, dmgNums, SHIELD_NUM_TTL_MS) // NOTE: shield-rise 动画 1.4s，1450ms 足够覆盖
}

/** 闪避文字 — 固定偏移到目标右上角，与伤害数字分离 */
function showMissText(targetId: string, budget?: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  const floatDuration = Math.max(impactDuration(budget ?? getActionBudget(1)), DMG_NUM_MIN_TTL_MS)
  dmgNums.value.push({
    id, text: '闪避',
    x: pos.x + 50,
    y: pos.y - 40,
    cls: 'miss',
    rotate: 0,
  })
  setRemove(id, dmgNums, floatDuration)
}

/** 屏幕震动 */
function showScreenShake() {
  shaking.value = true
  later(() => { shaking.value = false }, SHAKE_DURATION_MS)
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
  later(() => showProjectile(attackerId, targetId, impactStyle, projectileDuration(budget)), projectileDelay(budget))
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
  showMissText,
  showScreenShake,
  playFlightSequence,
  cardElements,
})

onUnmounted(() => {
  pendingTimers.forEach(clearTimeout)
  pendingFrames.forEach(cancelAnimationFrame)
  pendingTimers.clear()
  pendingFrames.clear()
  cardElements.clear()
})
</script>

<style scoped>
.battle-visual-effects {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
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
  animation: dmg-pop 1.4s cubic-bezier(0.2, 0.6, 0.3, 1) forwards,
             dmg-glow 1.4s ease-out forwards;
}

.floating-num.dmg.normal {
  font-size: var(--font-size-xxxl);
  color: var(--color-damage);
}

.floating-num.dmg.crit {
  font-size: 40px;
  color: var(--color-warning);
  text-shadow: 0 0 14px var(--color-warning), 0 3px 8px rgba(0, 0, 0, 0.95), 0 0 32px var(--color-warning);
  animation: dmg-pop 1.4s cubic-bezier(0.2, 0.6, 0.3, 1) forwards,
             dmg-crit-glow 1.4s ease-out forwards;
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
    transform: translate(-50%, -50%) scale(0.2) rotate(var(--rotate, 0deg));
    opacity: 0;
  }
  15% {
    transform: translate(-50%, -65%) scale(1.5) rotate(var(--rotate, 0deg));
    opacity: 1;
    animation-timing-function: cubic-bezier(0.17, 0.67, 0.83, 0.67);
  }
  30% {
    transform: translate(-50%, -70%) scale(1.2) rotate(var(--rotate, 0deg));
  }
  100% {
    transform: translate(-50%, -220%) scale(0.85) rotate(var(--rotate, 0deg));
    opacity: 0;
    animation-timing-function: ease-out;
  }
}

/* 普通伤害发光消散 */
@keyframes dmg-glow {
  0%, 30% { filter: drop-shadow(0 0 8px currentColor) brightness(1.2); }
  100%    { filter: drop-shadow(0 0 24px currentColor) brightness(0.6); }
}

/* 暴击伤害：更强烈的能量爆发 */
@keyframes dmg-crit-glow {
  0%, 20% { filter: drop-shadow(0 0 15px var(--color-warning)) brightness(1.5); }
  100%    { filter: drop-shadow(0 0 35px var(--color-warning)) brightness(0.4); }
}

.floating-num.heal-num {
  font-size: 24px;
  color: var(--color-heal);
  text-shadow: 0 0 12px var(--color-heal), 0 3px 6px rgba(0, 0, 0, 0.95), 0 0 28px var(--color-heal);
  animation: heal-rise 1.6s cubic-bezier(0.3, 0.2, 0.5, 1) forwards;
}

@keyframes heal-rise {
  0% {
    transform: translate(-50%, 30%) scale(0.3) rotate(var(--rotate, 0deg));
    opacity: 0;
  }

  20% {
    transform: translate(-50%, -20%) scale(1.3) rotate(var(--rotate, 0deg));
    opacity: 1;
  }

  100% {
    transform: translate(-50%, -180%) scale(0.85) rotate(var(--rotate, 0deg));
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
    transform: translate(-50%, 20%) scale(0.3) rotate(var(--rotate, 0deg));
    opacity: 0;
  }

  25% {
    transform: translate(-50%, -20%) scale(1.2) rotate(var(--rotate, 0deg));
    opacity: 1;
  }

  100% {
    transform: translate(-50%, -110%) scale(0.85) rotate(var(--rotate, 0deg));
    opacity: 0;
  }
}

/* 闪避文字（复用 dmg 类动画，灰色） */
.floating-num.miss {
  font-size: var(--font-size-xxl);
  color: var(--color-text-tertiary);
  text-shadow: 0 0 8px currentColor, 0 2px 4px rgba(0, 0, 0, 0.9);
  animation: dmg-pop 1.4s cubic-bezier(0.2, 0.6, 0.3, 1) forwards;
}
</style>

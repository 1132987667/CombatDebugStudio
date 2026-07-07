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
    <div v-for="imp in impacts" :key="imp.id" class="impact" :class="imp.type"
      :style="{ left: imp.x + 'px', top: imp.y + 'px' }"></div>

    <!-- 火花粒子（用 JS 驱动）-->

    <!-- 治疗光环 -->
    <div v-for="aura in healAuras" :key="aura.id" class="heal-aura"
      :style="{ left: aura.x + 'px', top: aura.y + 'px' }"></div>

    <!-- 护盾六边形 -->
    <div v-for="hex in shieldHexes" :key="hex.id" class="shield-hex" :style="{ left: hex.x + 'px', top: hex.y + 'px' }">
      <svg viewBox="0 0 100 100" fill="none">
        <polygon points="50,5 90,27 90,73 50,95 10,73 10,27" stroke="#8ee0ff" stroke-width="2"
          fill="rgba(76,201,240,0.1)" />
        <polygon points="50,20 75,35 75,65 50,80 25,65 25,35" stroke="#6affd0" stroke-width="1" fill="none"
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

// ============ 类型 ============
export interface CardPos { x: number; y: number; el: HTMLElement }

// ============ 响应式数据 ============
let nextId = 0

/** 技能名飞行 */
const skillNames = ref<Array<{ id: number; text: string; x: number; y: number; dx: number; dy: number; fromSide: string }>>([])
/** 命中爆炸 */
const impacts = ref<Array<{ id: number; x: number; y: number; type: string }>>([])
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

/** 技能名从攻击者飞向目标 */
function showSkillName(attackerId: string, targetId: string, name: string, fromSide: 'left' | 'right') {
  const aPos = cardCenter(attackerId)
  const tPos = cardCenter(targetId)
  if (!aPos || !tPos) return

  const id = nextId++
  const dx = tPos.x - aPos.x
  const dy = tPos.y - aPos.y
  skillNames.value.push({ id, text: name, x: aPos.x, y: aPos.y - 20, dx, dy, fromSide })
  setRemove(id, skillNames, 1250)
}

/** 光弹飞行（requestAnimationFrame 驱动） */
function showProjectile(fromId: string, toId: string, type: 'fire' | 'frost' | 'heal' | 'shield') {
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
  const duration = 700
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
        trail.style.background = 'radial-gradient(circle, #ffaa30, transparent)'
        trail.style.boxShadow = '0 0 10px #ff6600'
      } else {
        trail.style.background = 'radial-gradient(circle, #8ee0ff, transparent)'
        trail.style.boxShadow = '0 0 10px #4cc9f0'
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

/** 命中爆炸 */
function showImpact(targetId: string, type: 'fire' | 'frost' | 'heal' | 'shield') {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  impacts.value.push({ id, x: pos.x, y: pos.y, type })
  setRemove(id, impacts, 550)

  // 火花粒子
  const sparkCount = type === 'fire' ? 12 : 8
  for (let i = 0; i < sparkCount; i++) {
    const spark = document.createElement('div')
    spark.className = 'spark'
    const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.5
    const dist = 40 + Math.random() * 50
    const sx = Math.cos(angle) * dist
    const sy = Math.sin(angle) * dist
    spark.style.cssText = `
      position: fixed; left: ${pos.x}px; top: ${pos.y}px;
      width: 4px; height: 4px; border-radius: 50%;
      pointer-events: none; z-index: 156;
      background: ${type === 'fire' ? '#ffaa30' : '#8ee0ff'};
      box-shadow: 0 0 8px ${type === 'fire' ? '#ff6600' : '#4cc9f0'};
    `
    const root = document.getElementById('visual-effects-root')
    if (!root) continue
    root.appendChild(spark)
    spark.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px)) scale(0)`, opacity: 0 }
    ], { duration: 600, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)' })
    setTimeout(() => { if (spark.parentNode) spark.parentNode.removeChild(spark) }, 650)
  }
}

/** 治疗光环 */
function showHealAura(targetId: string) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  healAuras.value.push({ id, x: pos.x, y: pos.y })
  setRemove(id, healAuras, 1050)

  // 第二层
  const id2 = nextId++
  setTimeout(() => {
    healAuras.value.push({ id: id2, x: pos.x, y: pos.y })
    setRemove(id2, healAuras, 1050)
  }, 200)
}

/** 护盾六边形 */
function showShieldHex(targetId: string) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  shieldHexes.value.push({ id, x: pos.x, y: pos.y })
  setRemove(id, shieldHexes, 950)
}

/** 伤害数字 */
function showDamageNum(targetId: string, value: number, isCrit: boolean) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  dmgNums.value.push({
    id, text: `-${value}`,
    x: pos.x + (Math.random() - 0.5) * 40,
    y: pos.y - 20,
    cls: isCrit ? 'dmg crit' : 'dmg normal',
  })
  setRemove(id, dmgNums, 1450)
}

/** 治疗数字 */
function showHealNum(targetId: string, value: number) {
  const pos = cardCenter(targetId)
  if (!pos) return
  const id = nextId++
  dmgNums.value.push({
    id, text: `+${value}`,
    x: pos.x + (Math.random() - 0.5) * 30,
    y: pos.y + 10,
    cls: 'heal-num',
  })
  setRemove(id, dmgNums, 1650)
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

/** 完整攻击动画序列 */
function playAttackSequence(
  attackerId: string,
  targetId: string,
  skillName: string,
  damage: number,
  isCrit: boolean,
  fromSide: 'left' | 'right',
  damageType: 'fire' | 'frost' = 'fire',
) {
  showSkillName(attackerId, targetId, skillName, fromSide)
  setTimeout(() => showProjectile(attackerId, targetId, damageType), 250)
  setTimeout(() => {
    showImpact(targetId, damageType)
    // ponytail: damage=0 时跳过数字，由后续 DAMAGE_ANIMATION 事件显示真实值
    if (damage > 0) showDamageNum(targetId, damage, isCrit)
    if (isCrit) showScreenShake()
  }, 1100)
}

/** 完整治疗动画序列 */
function playHealSequence(healerId: string, targetId: string, skillName: string, value: number, fromSide: 'left' | 'right') {
  showSkillName(healerId, targetId, skillName, fromSide)
  setTimeout(() => showProjectile(healerId, targetId, 'heal'), 250)
  setTimeout(() => {
    showImpact(targetId, 'heal')
    showHealAura(targetId)
    showHealNum(targetId, value)
  }, 1100)
}

/** 完整护盾动画序列 */
function playShieldSequence(casterId: string, targetId: string, skillName: string, value: number, fromSide: 'left' | 'right') {
  showSkillName(casterId, targetId, skillName, fromSide)
  setTimeout(() => showProjectile(casterId, targetId, 'shield'), 250)
  setTimeout(() => {
    showShieldHex(targetId)
    showShieldNum(targetId, value)
  }, 1100)
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
  color: #ffd478;
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
  background: radial-gradient(circle, #fff, #ffaa30 30%, #ff4400 70%, transparent);
  box-shadow: 0 0 20px #ff6600, 0 0 40px #ff4400;
}

.projectile.frost {
  background: radial-gradient(circle, #fff, #8ee0ff 30%, #4cc9f0 70%, transparent);
  box-shadow: 0 0 20px #4cc9f0, 0 0 40px #4cc9f0;
}

.projectile.heal {
  background: radial-gradient(circle, #fff, #6affd0 30%, #2dd4a8 70%, transparent);
  box-shadow: 0 0 20px #2dd4a8, 0 0 40px #2dd4a8;
}

.projectile.shield {
  background: radial-gradient(circle, #fff, #8ee0ff 30%, #4cc9f0 70%, transparent);
  box-shadow: 0 0 20px #4cc9f0, 0 0 40px #4cc9f0;
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

/* 命中爆炸 */
.impact {
  position: fixed;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1100;
  transform: translate(-50%, -50%);
  animation: impact-burst 0.5s ease-out forwards;
}

.impact.fire {
  background: radial-gradient(circle, #fff, #ffaa30 20%, #ff4400 50%, transparent 70%);
}

.impact.frost,
.impact.shield {
  background: radial-gradient(circle, #fff, #8ee0ff 20%, #4cc9f0 50%, transparent 70%);
}

.impact.heal {
  background: radial-gradient(circle, #fff, #6affd0 20%, #2dd4a8 50%, transparent 70%);
}

@keyframes impact-burst {
  0% {
    transform: translate(-50%, -50%) scale(0.2);
    opacity: 1;
  }

  50% {
    transform: translate(-50%, -50%) scale(1.8);
    opacity: 0.8;
  }

  100% {
    transform: translate(-50%, -50%) scale(2.5);
    opacity: 0;
  }
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
  border: 2px solid #2dd4a8;
  box-shadow: 0 0 24px #2dd4a8, inset 0 0 24px #2dd4a8;
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
  filter: drop-shadow(0 0 8px #8ee0ff) drop-shadow(0 0 16px #4cc9f0);
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
  font-size: 26px;
  color: #ff8a6a;
}

.floating-num.dmg.crit {
  font-size: 40px;
  color: #ffd040;
  text-shadow: 0 0 14px #ff8800, 0 3px 8px rgba(0, 0, 0, 0.95), 0 0 32px #ff6600;
}

.floating-num.dmg.crit::before {
  content: '破';
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Noto Serif SC', serif;
  font-size: 18px;
  color: #ff4040;
  text-shadow: 0 0 10px #ff0000, 0 0 20px #ff0000;
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
  color: #6affd0;
  text-shadow: 0 0 12px #2dd4a8, 0 3px 6px rgba(0, 0, 0, 0.95), 0 0 28px #6affd0;
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
  color: #8ee0ff;
  text-shadow: 0 0 12px #4cc9f0, 0 3px 6px rgba(0, 0, 0, 0.95), 0 0 28px #8ee0ff;
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
  font-size: 20px;
  color: #9ca3af;
  text-shadow: 0 0 8px currentColor, 0 2px 4px rgba(0, 0, 0, 0.9);
}
</style>

<template>
  <div>
    <div class="xy-cave-skill-bar">
      <span>可用技能点</span>
      <strong>{{ skillPoints.max - skillPoints.spent }}</strong>
    </div>

    <!-- 流派切换 -->
    <div class="xy-cave-skill-schools">
      <button
        v-for="s in schools"
        :key="s.id"
        type="button"
        class="xy-cave-skill-school"
        :class="{ active: schoolId === s.id }"
        @click="schoolId = s.id"
      >
        {{ s.name }}
      </button>
    </div>

    <div class="xy-cave-skill-grid">
      <div
        v-for="sk in currentSkills"
        :key="sk.id"
        class="xy-cave-skill-card"
        :class="cardClass(sk)"
        role="button"
        :tabindex="locked(sk) ? -1 : 0"
        :aria-disabled="locked(sk)"
        :aria-pressed="isChoosing(sk)"
        @click="choose(sk)"
        @keydown.enter="onCardEnter(sk, $event)"
      >
        <span class="xy-cave-skill-card__head">
          <span class="xy-cave-skill-card__name">{{ sk.name }}</span>
          <span class="xy-cave-skill-card__tier">
            <svg v-if="locked(sk)" viewBox="0 0 24 24" class="xy-cave-skill-lock" aria-hidden="true">
              <path d="M7 11V7a5 5 0 0 1 10 0v4M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            {{ typeText(sk.type) }} · {{ sk.points }} 技能点
          </span>
        </span>
        <p class="xy-cave-skill-card__desc">{{ sk.desc }}</p>
        <span v-if="sk.energyCost > 0" class="xy-cave-skill-card__cost">消耗能量 {{ sk.energyCost }}</span>
        <span v-if="!learned(sk) && !prereqMet(sk)" class="xy-cave-skill-card__cost">需先点亮同分支上一阶</span>
        <div v-if="isChoosing(sk)" class="xy-cave-skill-card__learn">
          <button
            type="button"
            class="xy-cave-action xy-cave-action--ghost"
            :disabled="availablePoints <= 0"
            @click.stop="learn(sk)"
          >
            {{ availablePoints < sk.points ? '技能点不足' : `学 习（${sk.points} 技能点）` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import type { XiyouSkillNode, XiyouNodeType } from '../../data/mock'
import { schools, skillPoints } from '../../data/mock'

const notification = useNotificationStore()

const defaultSchool = schools.find((s) => s.selected) ?? schools[0]
const schoolId = ref(defaultSchool.id)
const choosingId = ref<string | null>(null)

const currentSkills = computed<XiyouSkillNode[]>(() => schools.find((s) => s.id === schoolId.value)?.nodes ?? [])

const availablePoints = computed(() => skillPoints.max - skillPoints.spent)

function schoolOf(): XiyouSkillNode[] {
  return schools.find((s) => s.id === schoolId.value)?.nodes ?? []
}

function learned(sk: XiyouSkillNode): boolean {
  return sk.learned === true
}

function prereqMet(sk: XiyouSkillNode): boolean {
  if (sk.tier === 1) return true
  const prev = schoolOf().find((p) => p.branch === sk.branch && p.tier === sk.tier - 1)
  return prev ? prev.learned === true : false
}

function locked(sk: XiyouSkillNode): boolean {
  return !learned(sk) && !prereqMet(sk)
}

function learnable(sk: XiyouSkillNode): boolean {
  return !learned(sk) && prereqMet(sk)
}

function cardClass(sk: XiyouSkillNode): Record<string, boolean> {
  return {
    'is-learned': learned(sk),
    'is-locked': locked(sk),
    'is-available': learnable(sk) && !isChoosing(sk),
    'is-choosing': isChoosing(sk),
  }
}

function isChoosing(sk: XiyouSkillNode): boolean {
  return learnable(sk) && choosingId.value === sk.id
}

function choose(sk: XiyouSkillNode): void {
  if (!learnable(sk)) return
  choosingId.value = choosingId.value === sk.id ? null : sk.id
}

/** 仅卡片自身回车响应（内层学习按钮的回车由其 click 处理，避免冒泡竞态） */
function onCardEnter(sk: XiyouSkillNode, e: KeyboardEvent): void {
  if (e.target !== e.currentTarget) return
  choose(sk)
}

function typeText(t: XiyouNodeType): string {
  return { attribute: '属性', passive: '被动', skill: '小技', ultimate: '大招', enhance: '强化' }[t]
}

function learn(sk: XiyouSkillNode): void {
  if (availablePoints.value < sk.points || !learnable(sk)) return
  sk.learned = true
  skillPoints.spent += sk.points
  choosingId.value = null
  notification.toast(`习得「${sk.name}」，剩余技能点 ${skillPoints.max - skillPoints.spent}`, 'success')
}
</script>

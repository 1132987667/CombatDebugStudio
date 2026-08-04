<template>
  <div class="ht-cmd">
    <div class="ht-mode-switch" role="tablist" aria-label="双工作台切换">
      <button type="button" role="tab" title="回放系统：按时间戳播放，StateDelta 快照跳转（快捷键 1）"
        :aria-selected="store.mode === 'replay'" :class="{ on: store.mode === 'replay' }" @click="store.setMode('replay')">
        ▶ 回放系统 <span class="k">1</span>
      </button>
      <button type="button" role="tab" title="调试系统：时间线树 / 卡片流 / RNG 凭证，按因果链消费（快捷键 2）"
        :aria-selected="store.mode === 'debug'" :class="{ on: store.mode === 'debug' }" @click="store.setMode('debug')">
        ⌬ 调试系统 <span class="k">2</span>
      </button>
    </div>

    <div class="ht-cmd-spacer"></div>

    <select v-model="source" class="ht-btn" aria-label="档案来源" title="数据源：演示存档 / 战斗记录 / 压测合成 / 实时战斗">
      <option value="demo">演示存档</option>
      <option value="recordings">战斗记录</option>
      <option value="stress">压测 · 2000+ 事件</option>
      <option value="live">实时战斗</option>
    </select>
    <select v-if="source === 'recordings'" v-model="recKey" class="ht-btn" aria-label="选择战斗记录"
      title="选择已保存到本地的战斗记录（唤灵台「保存战斗记录」）">
      <option value="">选择记录…</option>
      <option v-for="r in store.recordings" :key="r.saveKey" :value="r.saveKey">
        {{ r.name }} · {{ fmtTime(r.startTime) }} · {{ r.eventCount }} 事件
      </option>
    </select>

    <button class="ht-btn" :class="{ on: store.bpArmed }" title="配置条件断点（伤害/级别/随机值/单位），播放命中自动暂停定位" @click="bpOpen = true">⏸ 断点</button>
    <button class="ht-btn" title="导出调试会话：模式 + 书签 + 断点 + 过滤，一键复现调试现场" @click="store.exportSession()">⤓ 会话</button>
    <button class="ht-btn" title="导入调试会话 JSON 文件" @click="sessionInput?.click()">⤒ 会话导入</button>
    <button class="ht-btn" title="与另一份存档逐链路对比差异（分支 diff：生成示例分支 / 从战斗记录选 / 载入 JSON）" @click="diffOpen = true">⇋ 分支对比</button>
    <button class="ht-btn" title="战斗摘要：回合数/胜方/每单位输出/承伤/暴击/闪避/抵抗/Buff/击杀，支持 Markdown 与 CSV 导出" @click="sumOpen = true">⌖ 摘要</button>
    <button class="ht-btn" title="复制当前模式与事件定位链接（#m=&e=）" @click="store.copyDeepLink()">⎘ 深链</button>
    <button class="ht-btn primary" title="导出统一存档 JSON（一份文件，回放与调试两种能力）" @click="store.exportArchive()">⇩ 导出存档</button>

    <input ref="sessionInput" type="file" accept="application/json" hidden @change="onSessionFile" />
    <BreakpointDialog v-model:open="bpOpen" />
    <DiffDialog v-model:open="diffOpen" />
    <SummaryDialog v-model:open="sumOpen" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import BreakpointDialog from '../components/BreakpointDialog.vue'
import DiffDialog from '../components/DiffDialog.vue'
import SummaryDialog from '../components/SummaryDialog.vue'
import { useHaotianStore } from '../stores/haotianStore'

const store = useHaotianStore()

const source = ref('demo')
const recKey = ref('')
const bpOpen = ref(false)
const diffOpen = ref(false)
const sumOpen = ref(false)
const sessionInput = ref<HTMLInputElement | null>(null)

const resolveBattleSystem = (): BattleSystem => container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())

const fmtTime = (t: number): string => (t ? new Date(t).toLocaleString() : '—')

watch(source, async (val) => {
  if (val === 'live') {
    const battleSystem = resolveBattleSystem()
    const eventBus = container.resolve<BuffSystem>('BuffSystem').getEventBus() as IDomainEventBus
    const ok = await store.startLive(battleSystem, eventBus)
    // 战斗未开始时保持待命，开战后自动接入
    if (!ok) store.armLiveFollow(battleSystem, eventBus)
  } else {
    store.stopLive()
    if (val === 'recordings') {
      await store.refreshRecordings(resolveBattleSystem())
      recKey.value = ''
    } else if (val === 'stress') {
      await store.loadStress(2000)
    } else {
      await store.loadDemo()
    }
  }
})

watch(recKey, async (key) => {
  if (!key) return
  await store.loadRecording(resolveBattleSystem(), key)
})

// 实时流收尾（battle_end）后保留最终存档，用户可继续回放；切换档案源即触发 stopLive

async function onSessionFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await store.importSession(file)
  input.value = ''
}
</script>

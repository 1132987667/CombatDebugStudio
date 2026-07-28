/**
 * 文件: log-segment-factory.ts
 * 功能: 日志片段工厂 — 统一收口所有实体名的 LogSegment 生成
 * 描述: 三个工厂函数分别用于 buff/技能/被动，同时产出 classStr（着色）和 hover（可悬浮）。
 *
 * 设计原则：
 * - 可测试：所有外部依赖通过接口注入
 * - 向后兼容：不修改现有 LogSegment 结构
 * - 一致性：classStr 和 hover 在同一处决定
 */

import type { LogSegment, LogSegmentHover, NarrativeBlock } from '@/shared/types/battle-log'
import {
  type BuffClassificationInput,
} from '@/shared/types/buff-classification'

// HACK: EXPORT_CSS 是 SCSS 令牌体系的静态快照，不参与构建。
// 修改以下 SCSS 内容时须同步更新此处（grep "EXPORT_CSS" 定位）：
//   - tokens.scss 颜色令牌: --color-bg-primary/-secondary/-tertiary, --color-text-primary/
//     -secondary/-tertiary, --color-border-default/-tertiary, --color-success, --color-danger,
//     --color-warning, --color-info, --color-energy, --color-debuff
//   - _battle-log.scss §5-6 语义类: .log-*, .chip--*, .num--*, .hp-*, .hoverable
//   - _battle-log.scss §6 叙事块类: .nb--*, .rule--*, .action-*, .sub-header, .summary-*

// ==================== 可注入的查找接口 ====================

/**
 * Buff 配置查找接口（工厂不依赖具体的 BuffScriptRegistry）
 */
export interface BuffConfigLookup {
  getBuffConfig(buffId: string): BuffClassificationInput | undefined
}

/**
 * 技能/被动配置查找接口（工厂不依赖具体的 SkillManager）
 */
export interface SkillConfigLookup {
  getSkillConfig(skillId: string): { name: string; description?: string } | undefined
}

// ==================== 工厂函数 ====================

/**
 * 生成技能名称的 LogSegment
 *
 * @param skillId - 技能的唯一标识
 * @param lookup - 技能配置查找器（通常是 SkillManager）
 * @returns LogSegment（含 classStr 和 hover）
 */
export function skillSegment(
  skillId: string,
  lookup: SkillConfigLookup,
): LogSegment {
  const config = lookup.getSkillConfig(skillId)
  const name = config?.name ?? skillId
  const hover: LogSegmentHover = { kind: 'skill', id: skillId }

  return { text: `【${name}】`, classStr: 'log-skill', hover, kind: 'skill' }
}

/**
 * 生成被动技能名称的 LogSegment
 *
 * @param skillId - 被动技能的唯一标识
 * @param lookup - 技能配置查找器（通常是 SkillManager）
 * @returns LogSegment（含 classStr 和 hover）
 */
export function passiveSegment(
  skillId: string,
  lookup: SkillConfigLookup,
): LogSegment {
  const config = lookup.getSkillConfig(skillId)
  const name = config?.name ?? skillId
  const hover: LogSegmentHover = { kind: 'passive', id: skillId }

  return { text: `【${name}】`, classStr: 'log-passive', hover, kind: 'passive' }
}

// ==================== 叙事文本导出 ====================

/** 将 LogSegment[] 拼接为纯文本 */
export function segsText(segs: LogSegment[]): string {
  return segs.map((s) => s.text).join('')
}

/** 将 NarrativeBlock[] 渲染为叙事纯文本 —— 与日志面板"导出"格式完全一致 */
export function blocksToText(blocks: NarrativeBlock[]): string {
  const lines: string[] = []
  for (const b of blocks) {
    switch (b.type) {
      case 'battle-header':
        lines.push('═══════════════════════════════════════════')
        lines.push(segsText(b.segments))
        lines.push('═══════════════════════════════════════════')
        lines.push('')
        break
      case 'round':
        lines.push(b.turn === 0
          ? `─────────────────────── 战斗开始 ───────────────────────`
          : `─────────────────────── 第 ${b.turn} 回合${b.tag ? ` · ${b.tag}` : ''} ───────────────────────`)
        break
      case 'action':
        lines.push(`◆ ${segsText(b.header)}`)
        if (b.result) lines.push(`  ${segsText(b.result)}`)
        for (let k = 0; k < b.subs.length; k++) {
          const prefix = k === b.subs.length - 1 ? '└' : '├'
          lines.push(`  ${prefix} ${segsText(b.subs[k])}`)
        }
        break
      case 'settlement':
        lines.push('')
        lines.push('  ── 回合结算 ──')
        for (const line of b.lines) lines.push(`    ${segsText(line)}`)
        break
      case 'snapshot':
        lines.push('')
        lines.push('  ── 态势 ──')
        for (const line of b.lines) lines.push(`    ${segsText(line)}`)
        break
      case 'section':
        lines.push(`【${b.title}】`)
        for (const line of b.lines) lines.push(`  ${segsText(line)}`)
        break
      case 'summary':
        lines.push('')
        lines.push('═══════════════════════════════════════════')
        for (const line of b.lines) lines.push(segsText(line))
        lines.push('═══════════════════════════════════════════')
        lines.push('')
        break
      default:
        lines.push(segsText(b.segments))
    }
  }
  return lines.join('\n')
}

// ==================== HTML 导出 ====================

/** HTML 转义（含 " 与 '，供属性/文本上下文共用） */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 导出专用 CSS — 提取自 tokens.scss + _battle-log.scss，自包含供离线查看。
 *
 * ⚠️ 双源同步检查清单：此常量是 SCSS 令牌体系的"快照"，不参与构建。
 *    修改 SCSS 中以下内容时，必须手动同步此处（grep "EXPORT_CSS" 定位）：
 *    - 颜色令牌: --color-bg-primary/-secondary/-tertiary, --color-text-primary/
 *      -secondary/-tertiary, --color-border-default/-tertiary, --color-success,
 *      --color-danger, --color-warning, --color-info, --color-energy, --color-debuff
 *    - 语义类: .log-* / .chip--* / .num--* / .hp-* / .hoverable (_battle-log.scss §5-6)
 *    - 叙事块类: .nb--* / .rule--* / .action-* / .sub-header / .summary-* (_battle-log.scss §6)
 */
const EXPORT_CSS = `
:root {
  --bg-primary:#1a1a2e; --bg-secondary:#0f0f1a; --bg-tertiary:#16213e;
  --text-primary:#ffffff; --text-secondary:#eeeeee; --text-tertiary:#888888;
  --border:#0f3460; --border-tertiary:#0f4b86;
  --c-success:#4caf50; --c-danger:#f44336; --c-warning:#ff9800;
  --c-info:#4fc3f7; --c-energy:#0a7f91; --c-debuff:#a855f7;
}
* { box-sizing:border-box; }
body { margin:0; background:var(--bg-primary); color:var(--text-primary);
  font-family:'Consolas','Monaco','Courier New',monospace; font-size:14px;
  line-height:1.6; padding:20px; }
.log-container { max-width:900px; margin:0 auto; background:var(--bg-secondary);
  border:1px solid var(--border); border-radius:8px; padding:24px; }
.meta { color:var(--text-tertiary); font-size:12px; border-bottom:1px solid var(--border);
  padding-bottom:8px; margin-bottom:16px; }
/* 叙事块（同源 _battle-log.scss §6） */
.nb { margin:2px 0; }
.nb--battle-header { display:flex; gap:10px; align-items:center; text-align:center;
  font-weight:bold; color:var(--c-warning); padding:6px 0; }
.battle-line { letter-spacing:1px; }
.rule { flex:1; height:1px; background:var(--border); }
.rule--double { height:3px; background:transparent;
  border-top:1px solid var(--border-tertiary); border-bottom:1px solid var(--border-tertiary); }
.rule--thin { opacity:0.5; }
.nb--round { display:flex; gap:10px; align-items:center; margin:14px 0 6px; }
.round-label { color:var(--c-info); font-weight:bold; white-space:nowrap; }
.action-header { font-weight:600; line-height: var(--line-height-xl); }
.glyph { color:var(--c-warning); margin-right:6px; }
.action-result, .action-sub { padding-left:1.4em; line-height: var(--line-height-xl); }
.glyph--sub { color:var(--text-tertiary); }
.sub-header { display:flex; gap:8px; align-items:center; color:var(--text-tertiary);
  margin-top:8px; letter-spacing:4px; }
.indent-line { padding-left:1.4em; }
.section-title { color:var(--c-energy); font-weight:bold; }
.nb--summary { display:flex; gap:10px; align-items:center; padding:8px 0; }
.summary-content { text-align:center; }
.summary-line { margin:2px 0; }
/* 语义着色（同源 _battle-log.scss §5） */
.log-friendly { color:var(--c-success); font-weight:bold; }
.log-hostile { color:var(--c-danger); font-weight:bold; }
.log-damage { color:var(--c-danger); font-weight:bold; }
.log-heal { color:var(--c-success); font-weight:bold; }
.log-crit { color:var(--c-warning); font-weight:bold; }
.log-buff { color:var(--c-energy); font-weight:500; }
.log-debuff { color:var(--c-debuff); font-weight:500; }
.log-control { color:var(--c-debuff); font-weight:bold; }
.log-skill { color:var(--c-warning); font-weight:500; }
.log-passive { color:var(--c-info); font-weight:500; }
.log-energy { color:var(--c-energy); font-weight:bold; }
.log-shield { color:var(--c-info); font-weight:bold; }
.log-system { color:var(--text-tertiary); opacity:0.7; }
.log-info { color:var(--c-info); font-weight:600; }
/* 芯片（同源 _battle-log.scss §6 — 含 chip--skill/buff/passive 与 hoverable） */
.chip { padding:0 6px; border-radius:4px; font-weight:500; white-space:nowrap; }
.chip--ally { color:var(--c-success); background:rgba(76,175,80,0.12); }
.chip--enemy { color:var(--c-danger); background:rgba(244,67,54,0.12); }
.chip--skill { color:var(--c-warning); }
.chip--buff { color:var(--c-energy); }
.chip--passive { color:var(--c-info); }
.hoverable { text-decoration:underline dotted; text-underline-offset:2px; }
/* 大号数字 / 气血 */
.num--damage { color:var(--c-danger); font-size:1.15em; font-weight:bold; }
.num--heal { color:var(--c-success); font-size:1.15em; font-weight:bold; }
.hp-before { color:var(--text-tertiary); }
.hp-after { color:var(--c-warning); font-weight:bold; }
/* 批量报告 — batch-only（仅在 mergeLogsHtml 中使用） */
.report-stats { color:var(--text-secondary); border:1px solid var(--border);
  border-radius:6px; padding:12px 16px; margin-bottom:16px; }
.report-stats div:first-child { font-size:16px; font-weight:bold;
  color:var(--c-warning); margin-bottom:4px; }
.battle-block { border:1px solid var(--border); border-left:3px solid var(--c-info);
  border-radius:6px; margin-bottom:8px; background:var(--bg-tertiary); }
.battle-block > summary { cursor:pointer; padding:8px 12px; color:var(--text-secondary);
  user-select:none; list-style:none; }
.battle-block > summary::-webkit-details-marker { display:none; }
.battle-block > summary::before { content:'▶ '; color:var(--c-info); }
.battle-block[open] > summary::before { content:'▼ '; }
.battle-block > summary:hover { background:rgba(255,255,255,0.04); }
.battle-body { padding:8px 12px 12px; border-top:1px solid var(--border); }
`

/**
 * 将单个 LogSegment 渲染为 HTML。
 * NOTE: 分支与 LogSeg.vue 的 v-if 链严格同源，修改 LogSeg.vue 时须同步此处。
 */
function segToHtml(seg: LogSegment): string {
  const text = escapeHtml(seg.text)
  if (seg.kind === 'entity') {
    const cls = seg.faction === 'ally' ? 'chip--ally' : 'chip--enemy'
    return `<span class="chip ${cls}">${text}</span>`
  }
  if (seg.kind === 'damage') return `<b class="num num--damage">${text}</b>`
  if (seg.kind === 'heal') return `<b class="num num--heal">${text}</b>`
  if (seg.kind === 'hp-before') return `<span class="hp-before">${text}</span>`
  if (seg.kind === 'hp-after') return `<span class="hp-after">${text}</span>`
  if (seg.kind && ['buff', 'skill', 'passive'].includes(seg.kind)) {
    const hoverable = seg.hover ? ' hoverable' : ''
    return `<span class="chip chip--${seg.kind}${hoverable}">${text}</span>`
  }
  if (seg.classStr) return `<span class="${escapeHtml(seg.classStr)}">${text}</span>`
  return text
}

function segsToHtml(segs: LogSegment[]): string {
  return segs.map(segToHtml).join('')
}

function blockToHtml(b: NarrativeBlock): string {
  switch (b.type) {
    case 'battle-header':
      return `<div class="nb nb--battle-header"><span class="rule rule--double"></span>` +
        `<div class="battle-line">${segsToHtml(b.segments)}</div>` +
        `<span class="rule rule--double"></span></div>`
    case 'round':
      return `<div class="nb nb--round"><span class="rule"></span>` +
        `<span class="round-label">第 ${b.turn} 回合${b.tag ? ` · ${escapeHtml(b.tag)}` : ''}</span>` +
        `<span class="rule"></span></div>`
    case 'action': {
      let html = `<div class="nb nb--action"><div class="action-header">` +
        `<span class="glyph">◆</span>${segsToHtml(b.header)}</div>`
      if (b.result) html += `<div class="action-result">${segsToHtml(b.result)}</div>`
      b.subs.forEach((sub, k) => {
        const prefix = k === b.subs.length - 1 ? '└' : '├'
        html += `<div class="action-sub"><span class="glyph glyph--sub">${prefix}</span>${segsToHtml(sub)}</div>`
      })
      return html + '</div>'
    }
    case 'settlement':
      return `<div class="nb nb--settlement"><div class="sub-header">` +
        `<span class="rule rule--thin"></span>回合结算<span class="rule rule--thin"></span></div>` +
        b.lines.map(l => `<div class="indent-line">${segsToHtml(l)}</div>`).join('') + '</div>'
    case 'snapshot':
      return `<div class="nb nb--snapshot"><div class="sub-header">` +
        `<span class="rule rule--thin"></span>态势<span class="rule rule--thin"></span></div>` +
        b.lines.map(l => `<div class="indent-line">${segsToHtml(l)}</div>`).join('') + '</div>'
    case 'section':
      return `<div class="nb nb--section"><div class="section-title">【${escapeHtml(b.title)}】</div>` +
        b.lines.map(l => `<div class="indent-line">${segsToHtml(l)}</div>`).join('') + '</div>'
    case 'summary':
      return `<div class="nb nb--summary"><span class="rule rule--double"></span>` +
        `<div class="summary-content">` +
        b.lines.map(l => `<div class="summary-line">${segsToHtml(l)}</div>`).join('') +
        `</div><span class="rule rule--double"></span></div>`
    case 'plain':
      return `<div class="nb">${segsToHtml(b.segments)}</div>`
    default:
      return ''
  }
}

/** 将 NarrativeBlock[] 渲染为 HTML 正文片段（不含 <html> 外壳），供单场/批量复用 */
export function blocksToHtmlBody(blocks: NarrativeBlock[]): string {
  return blocks.map(blockToHtml).join('\n')
}

/** 将 HTML 正文片段包装为自包含完整文档（内联样式） */
export function wrapHtmlDocument(
  body: string,
  meta: { title: string; generatedAt: string },
): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(meta.title)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<div class="log-container">
<div class="meta">
<div>${escapeHtml(meta.title)}</div>
<div>生成时间: ${escapeHtml(meta.generatedAt)}</div>
</div>
${body}
</div>
</body>
</html>`
}

/** 将 NarrativeBlock[] 渲染为自包含 HTML 字符串（单场导出入口） */
export function blocksToHtml(
  blocks: NarrativeBlock[],
  meta: { title: string; generatedAt: string },
): string {
  return wrapHtmlDocument(blocksToHtmlBody(blocks), meta)
}

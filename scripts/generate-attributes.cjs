/**
 * generate-attributes.cjs — 属性元数据生成器（Schema-Driven）
 *
 * 读取 configs/attributes/attributes.json（唯一权威数据源），生成
 * src/domain/attribute/attribute-codes.generated.ts（ATTRIBUTE_CODE + AttributeMetaMap）。
 *
 * 执行时机：npm run predev / prebuild（见 package.json）。
 * 产物契约：任何对属性列表的增删改都改 attributes.json，勿直接编辑生成文件。
 */

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const INPUT = path.join(PROJECT_ROOT, 'configs', 'attributes', 'attributes.json')
const OUTPUT = path.join(
  PROJECT_ROOT,
  'src',
  'domain',
  'attribute',
  'attribute-codes.generated.ts',
)

const TS_LINE_PREFIX = ' * '

/** 单引号字符串字面量（对齐项目 TS 单引号风格），处理引号/反斜杠转义 */
function jsonString(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
  return `'${escaped}'`
}

function generate(attributes) {
  const now = new Date()
  const timestamp = now.toISOString()
  const lines = []
  const push = (s) => lines.push(s)

  push('/* eslint-disable */')
  push('// ==========================================')
  push('// \u26a0\ufe0f \u81ea\u52a8\u751f\u6210\uff0c\u52ff\u624b\u52a8\u7f16\u8f91')
  push(`// \u751f\u6210\u65f6\u95f4: ${timestamp}`)
  push('// \u6570\u636e\u6e90: configs/attributes/attributes.json')
  push('// \u914d\u7f6e\u4fee\u6539\u540e\u8bf7\u91cd\u65b0\u8fd0\u884c: npm run generate:attributes')
  push('// ==========================================')
  push('')
  push("import type { AttributeMeta } from './types'")
  push('')
  push('export const ATTRIBUTE_CODE = {')
  for (const attr of attributes) {
    push(`  ${attr.code}: ${jsonString(attr.code)},`)
  }
  push('} as const')
  push('')
  push('export type ATTRIBUTE_CODE = (typeof ATTRIBUTE_CODE)[keyof typeof ATTRIBUTE_CODE]')
  push('')
  push('export const AttributeMetaMap: Record<ATTRIBUTE_CODE, AttributeMeta> = {')
  for (const attr of attributes) {
    push(`  ${attr.code}: {`)
    push(`    code: ${jsonString(attr.code)},`)
    push(`    name: ${jsonString(attr.name)},`)
    push(`    displayName: ${jsonString(attr.displayName)},`)
    push(`    description: ${jsonString(attr.description)},`)
    push(`    isPercentage: ${attr.isPercentage},`)
    if (typeof attr.defaultValue === 'number') {
      push(`    defaultValue: ${attr.defaultValue},`)
    }
    push(`    range: ${jsonString(attr.range)},`)
    push(`    impact: ${jsonString(attr.impact)},`)
    if (attr.isRuntimeState) {
      push(`    isRuntimeState: true,`)
    }
    push('  },')
  }
  push('} as const')
  push('')

  return lines.join('\n')
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`[generate-attributes] 输入源不存在: ${INPUT}`)
    process.exit(1)
  }

  let raw
  try {
    raw = fs.readFileSync(INPUT, 'utf8')
  } catch (err) {
    console.error(`[generate-attributes] 读取失败: ${INPUT}`, err)
    process.exit(1)
  }

  let attributes
  try {
    attributes = JSON.parse(raw)
  } catch (err) {
    console.error('[generate-attributes] attributes.json 不是合法 JSON，请检查格式', err)
    process.exit(1)
  }

  if (!Array.isArray(attributes)) {
    console.error('[generate-attributes] attributes.json 应为顶层数组')
    process.exit(1)
  }

  const seen = new Set()
  for (const attr of attributes) {
    if (!attr || typeof attr.code !== 'string' || !attr.code) {
      console.error('[generate-attributes] 属性缺少合法 code:', JSON.stringify(attr))
      process.exit(1)
    }
    if (seen.has(attr.code)) {
      console.error(`[generate-attributes] code 重复: ${attr.code}`)
      process.exit(1)
    }
    seen.add(attr.code)
    for (const field of ['name', 'displayName', 'description', 'range', 'impact']) {
      if (typeof attr[field] !== 'string') {
        console.error(`[generate-attributes] ${attr.code} 缺少字符串字段 ${field}`)
        process.exit(1)
      }
    }
    if (typeof attr.isPercentage !== 'boolean') {
      console.error(`[generate-attributes] ${attr.code} 缺少布尔字段 isPercentage`)
      process.exit(1)
    }
  }

  const output = generate(attributes)
  try {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
    fs.writeFileSync(OUTPUT, output, 'utf8')
  } catch (err) {
    console.error(`[generate-attributes] 写入失败: ${OUTPUT}`, err)
    process.exit(1)
  }

  console.log(`[generate-attributes] 已生成 ${attributes.length} 个属性 -> ${path.relative(PROJECT_ROOT, OUTPUT)}`)
}

main()

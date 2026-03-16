# 修复技能数据中 damage 步骤缺少 target 字段的脚本

$filePath = "d:\4-softworkspace\java\CombatDebugStudio\configs\skills\skills.json"
$content = Get-Content $filePath -Raw -Encoding UTF8

# 匹配缺少 target 字段的 damage 步骤，并添加 "target": "enemy"
# 匹配模式："type": "damage", 后跟 "formula": 但没有 "target":
$pattern = '(?"type":\s*"damage",\s*)(?!.*?"target":)(.*?"formula":\s*"[^"]+",\s*.*?"attackType":\s*"[^"]+")'

$matchCount = 0
$updatedContent = $content -replace $pattern, {
    param($match)
    $matchCount++
    # 在 "type": "damage", 后面插入 "target": "enemy",
    $match.Value -replace '(?"type":\s*"damage",\s*)', '$1"target": "enemy",'
}

Write-Host "找到并修复了 $matchCount 个缺少 target 字段的 damage 步骤"

# 保存修改后的文件
$updatedContent | Out-File $filePath -Encoding UTF8 -NoNewline

Write-Host "文件已更新完成！"

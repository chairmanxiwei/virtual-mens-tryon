<#
.SYNOPSIS
代码性能分析器

.DESCRIPTION
分析代码的性能问题、瓶颈和优化机会。支持Python和JavaScript代码库，提供详细的性能分析报告和优化建议。

.PARAMETER File
要分析的文件路径

.PARAMETER Directory
要分析的目录路径

.PARAMETER Exclude
要排除的文件或目录列表

.PARAMETER Output
报告格式 (json 或 html)

.PARAMETER OutputFile
报告输出文件路径

.EXAMPLE
# 分析单个Python文件
Analyze-Performance.ps1 -File example.py

.EXAMPLE
# 分析单个JavaScript文件
Analyze-Performance.ps1 -File example.js

.EXAMPLE
# 分析目录
Analyze-Performance.ps1 -Directory ./src

.EXAMPLE
# 生成HTML报告
Analyze-Performance.ps1 -File example.py -Output html -OutputFile report.html

.NOTES
Author: Code Performance Checker
Version: 1.0.0
#>

param(
    [Parameter(Mandatory=$false, HelpMessage="要分析的文件路径")]
    [string]$File,
    
    [Parameter(Mandatory=$false, HelpMessage="要分析的目录路径")]
    [string]$Directory,
    
    [Parameter(Mandatory=$false, HelpMessage="要排除的文件或目录列表")]
    [string[]]$Exclude,
    
    [Parameter(Mandatory=$false, HelpMessage="报告格式 (json 或 html)")]
    [ValidateSet("json", "html")]
    [string]$Output = "json",
    
    [Parameter(Mandatory=$false, HelpMessage="报告输出文件路径")]
    [string]$OutputFile
)

# 脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# 性能分析器脚本路径
$PerformanceAnalyzer = Join-Path $ScriptDir "performance_analyzer.py"

# 检查脚本是否存在
if (-not (Test-Path $PerformanceAnalyzer)) {
    Write-Error "性能分析器脚本不存在: $PerformanceAnalyzer"
    exit 1
}

# 构建命令
$Command = "python " + "`"$PerformanceAnalyzer`""

if ($File) {
    $Command += " --file " + "`"$File`""
} elseif ($Directory) {
    $Command += " --directory " + "`"$Directory`""
    if ($Exclude) {
        foreach ($item in $Exclude) {
            $Command += " --exclude " + "`"$item`""
        }
    }
} else {
    Write-Error "必须指定要分析的文件或目录"
    Get-Help $MyInvocation.MyCommand.Path
    exit 1
}

if ($Output) {
    $Command += " --output $Output"
}

if ($OutputFile) {
    $Command += " --output-file " + "`"$OutputFile`""
}

# 执行命令
Write-Host "执行性能分析..."
Write-Host "命令: $Command"
Write-Host ""

Invoke-Expression $Command

# 检查执行结果
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "性能分析完成!"
} else {
    Write-Host ""
    Write-Error "性能分析失败!"
    exit 1
}

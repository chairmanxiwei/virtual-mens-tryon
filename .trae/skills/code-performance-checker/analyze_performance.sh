#!/bin/bash

# 代码性能分析脚本
# 用于在Unix系统上运行性能分析器

# 脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 性能分析器脚本路径
PERFORMANCE_ANALYZER="$SCRIPT_DIR/performance_analyzer.py"

# 显示帮助信息
show_help() {
    echo "代码性能分析器"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --file <文件路径>        分析单个文件"
    echo "  --directory <目录路径>   分析目录中的所有文件"
    echo "  --exclude <文件/目录>    排除指定的文件或目录"
    echo "  --output <格式>          报告格式 (json 或 html)"
    echo "  --output-file <文件路径>  报告输出文件路径"
    echo "  --help                   显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  # 分析单个Python文件"
    echo "  $0 --file example.py"
    echo ""
    echo "  # 分析单个JavaScript文件"
    echo "  $0 --file example.js"
    echo ""
    echo "  # 分析目录"
    echo "  $0 --directory ./src"
    echo ""
    echo "  # 生成HTML报告"
    echo "  $0 --file example.py --output html --output-file report.html"
}

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --file)
            FILE="$2"
            shift 2
            ;;
        --directory)
            DIRECTORY="$2"
            shift 2
            ;;
        --exclude)
            EXCLUDE+="$2 "
            shift 2
            ;;
        --output)
            OUTPUT="$2"
            shift 2
            ;;
        --output-file)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 构建命令
COMMAND="python3 $PERFORMANCE_ANALYZER"

if [[ -n "$FILE" ]]; then
    COMMAND+=" --file $FILE"
elif [[ -n "$DIRECTORY" ]]; then
    COMMAND+=" --directory $DIRECTORY"
    if [[ -n "$EXCLUDE" ]]; then
        COMMAND+=" --exclude $EXCLUDE"
    fi
else
    echo "错误: 必须指定要分析的文件或目录"
    show_help
    exit 1
fi

if [[ -n "$OUTPUT" ]]; then
    COMMAND+=" --output $OUTPUT"
fi

if [[ -n "$OUTPUT_FILE" ]]; then
    COMMAND+=" --output-file $OUTPUT_FILE"
fi

# 执行命令
echo "执行性能分析..."
echo "命令: $COMMAND"
echo ""

$COMMAND

# 检查执行结果
if [[ $? -eq 0 ]]; then
    echo ""
    echo "性能分析完成!"
else
    echo ""
    echo "性能分析失败!"
    exit 1
fi

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
代码性能分析器

分析Python和JavaScript代码的性能问题、瓶颈和优化机会。
提供详细的性能分析报告和优化建议。
"""

import os
import sys
import time
import cProfile
import pstats
import json
import argparse
import subprocess
import re
from datetime import datetime

# 尝试导入memory_profiler，如果不可用则跳过内存分析
try:
    from memory_profiler import memory_usage
    MEMORY_PROFILER_AVAILABLE = True
except ImportError:
    MEMORY_PROFILER_AVAILABLE = False

class PerformanceAnalyzer:
    """性能分析器类"""

    def __init__(self):
        """初始化性能分析器"""
        self.results = {
            'timestamp': datetime.now().isoformat(),
            'files': {},
            'summary': {
                'total_execution_time': 0,
                'total_memory_usage': 0,
                'functions_analyzed': 0,
                'performance_issues': 0
            }
        }

    def analyze_file(self, file_path):
        """分析单个文件

        Args:
            file_path: 文件路径

        Returns:
            分析结果
        """
        file_ext = os.path.splitext(file_path)[1].lower()
        file_results = {
            'path': file_path,
            'extension': file_ext,
            'analysis': {},
            'optimization_suggestions': []
        }

        if file_ext == '.py':
            file_results['analysis'] = self._analyze_python_file(file_path)
        elif file_ext == '.js':
            file_results['analysis'] = self._analyze_javascript_file(file_path)
        else:
            file_results['analysis'] = {'error': f'不支持的文件类型: {file_ext}'}

        # 生成优化建议
        file_results['optimization_suggestions'] = self._generate_optimization_suggestions(file_results['analysis'])

        # 更新摘要信息
        self._update_summary(file_results)

        self.results['files'][file_path] = file_results
        return file_results

    def analyze_directory(self, directory_path, exclude=None):
        """分析目录中的所有文件

        Args:
            directory_path: 目录路径
            exclude: 排除的文件或目录列表

        Returns:
            分析结果
        """
        if exclude is None:
            exclude = []

        for root, dirs, files in os.walk(directory_path):
            # 排除指定的目录
            dirs[:] = [d for d in dirs if d not in exclude]

            for file in files:
                if file.endswith(('.py', '.js')):
                    file_path = os.path.join(root, file)
                    # 排除指定的文件
                    if any(excluded in file_path for excluded in exclude):
                        continue
                    self.analyze_file(file_path)

        return self.results

    def _analyze_python_file(self, file_path):
        """分析Python文件

        Args:
            file_path: Python文件路径

        Returns:
            分析结果
        """
        analysis = {
            'execution_time': {},
            'memory_usage': {},
            'function_calls': {},
            'code_complexity': {}
        }

        try:
            # 执行时间分析
            start_time = time.time()
            # 使用cProfile分析函数调用
            profiler = cProfile.Profile()
            profiler.enable()

            # 尝试导入并执行文件
            try:
                # 构建模块路径
                module_name = os.path.splitext(os.path.basename(file_path))[0]
                # 添加目录到Python路径
                sys.path.insert(0, os.path.dirname(file_path))
                # 导入模块
                __import__(module_name)
            except Exception as e:
                analysis['execution_time']['error'] = f'执行错误: {str(e)}'

            profiler.disable()
            end_time = time.time()

            analysis['execution_time']['total'] = end_time - start_time

            # 分析函数调用
            stats = pstats.Stats(profiler)
            function_calls = []
            for func, (cc, nn, tt, ct, callers) in stats.stats.items():
                func_name = func[2]
                if func[0]:
                    func_name = f'{func[0]}.{func_name}'
                function_calls.append({
                    'name': func_name,
                    'calls': cc,
                    'total_time': tt,
                    'cumulative_time': ct
                })

            # 按累积时间排序
            function_calls.sort(key=lambda x: x['cumulative_time'], reverse=True)
            analysis['function_calls'] = function_calls[:10]  # 只保留前10个

            # 内存使用分析
            if MEMORY_PROFILER_AVAILABLE:
                try:
                    mem_usage = memory_usage((self._execute_python_file, (file_path,)), interval=0.1, timeout=30)
                    analysis['memory_usage']['peak'] = max(mem_usage)
                    analysis['memory_usage']['average'] = sum(mem_usage) / len(mem_usage)
                except Exception as e:
                    analysis['memory_usage']['error'] = f'内存分析错误: {str(e)}'
            else:
                analysis['memory_usage']['warning'] = 'memory_profiler模块未安装，跳过内存分析'

            # 代码复杂度分析
            analysis['code_complexity'] = self._analyze_code_complexity(file_path)

        except Exception as e:
            analysis['error'] = f'分析错误: {str(e)}'

        return analysis

    def _analyze_javascript_file(self, file_path):
        """分析JavaScript文件

        Args:
            file_path: JavaScript文件路径

        Returns:
            分析结果
        """
        analysis = {
            'execution_time': {},
            'memory_usage': {},
            'function_calls': {},
            'code_complexity': {}
        }

        try:
            # 检查Node.js是否可用
            try:
                subprocess.run(['node', '--version'], check=True, capture_output=True, text=True)
            except subprocess.CalledProcessError:
                analysis['error'] = 'Node.js未安装，无法分析JavaScript文件'
                return analysis

            # 创建临时分析脚本
            # 修复路径处理，使用正斜杠作为路径分隔符
            js_file_path = file_path.replace('\\', '/')
            temp_script = """
            const fs = require('fs');
            const path = require('path');

            // 性能分析函数
            function analyzePerformance() {
                const startTime = process.hrtime();
                const startMemory = process.memoryUsage();

                try {
                    // 加载并执行目标文件
                    require('" + js_file_path + "');
                } catch (e) {
                    console.error('执行错误:', e.message);
                }

                const endTime = process.hrtime(startTime);
                const endMemory = process.memoryUsage();

                const executionTime = endTime[0] + endTime[1] / 1e9;
                const memoryUsage = {
                    rss: (endMemory.rss - startMemory.rss) / 1024 / 1024,
                    heapTotal: (endMemory.heapTotal - startMemory.heapTotal) / 1024 / 1024,
                    heapUsed: (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024,
                    external: (endMemory.external - startMemory.external) / 1024 / 1024
                };

                console.log(JSON.stringify({
                    executionTime: executionTime,
                    memoryUsage: memoryUsage
                }));
            }

            analyzePerformance();
            """

            # 写入临时脚本
            temp_script_path = os.path.join(os.path.dirname(file_path), 'temp_analyzer.js')
            with open(temp_script_path, 'w', encoding='utf-8') as f:
                f.write(temp_script)

            # 执行分析脚本
            result = subprocess.run(['node', temp_script_path], capture_output=True, text=True, encoding='utf-8', timeout=30)

            # 清理临时脚本
            if os.path.exists(temp_script_path):
                os.remove(temp_script_path)

            if result.stdout:
                try:
                    js_results = json.loads(result.stdout)
                    analysis['execution_time']['total'] = js_results.get('executionTime', 0)
                    analysis['memory_usage'] = js_results.get('memoryUsage', {})
                except json.JSONDecodeError:
                    analysis['error'] = '解析JavaScript分析结果失败'
            else:
                analysis['error'] = f'JavaScript执行错误: {result.stderr}'

            # 代码复杂度分析
            analysis['code_complexity'] = self._analyze_code_complexity(file_path)

        except Exception as e:
            analysis['error'] = f'分析错误: {str(e)}'

        return analysis

    def _execute_python_file(self, file_path):
        """执行Python文件

        Args:
            file_path: Python文件路径
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                code = f.read()
            exec(code, {})
        except Exception:
            pass

    def _analyze_code_complexity(self, file_path):
        """分析代码复杂度

        Args:
            file_path: 文件路径

        Returns:
            复杂度分析结果
        """
        complexity = {
            'cyclomatic_complexity': 0,
            'function_count': 0,
            'average_function_length': 0,
            'max_nesting_depth': 0
        }

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                code = f.read()

            # 计算函数数量
            function_pattern = re.compile(r'\b(def|function)\s+\w+\s*\(')
            functions = function_pattern.findall(code)
            complexity['function_count'] = len(functions)

            # 计算平均函数长度（简单估算）
            lines = code.split('\n')
            complexity['average_function_length'] = len(lines) / (complexity['function_count'] or 1)

            # 计算最大嵌套深度（简单估算）
            max_depth = 0
            current_depth = 0
            for line in lines:
                stripped_line = line.strip()
                if stripped_line.startswith(('if ', 'for ', 'while ', 'def ', 'function ', 'try:', 'except:')):
                    current_depth += 1
                    max_depth = max(max_depth, current_depth)
                elif stripped_line in ('break', 'continue', 'return', '}'):
                    current_depth = max(0, current_depth - 1)
            complexity['max_nesting_depth'] = max_depth

            # 简单计算圈复杂度（基于控制流语句）
            control_flow_patterns = re.compile(r'\b(if|for|while|try|except|elif)\b')
            control_flow_statements = control_flow_patterns.findall(code)
            complexity['cyclomatic_complexity'] = len(control_flow_statements) + 1

        except Exception as e:
            complexity['error'] = f'复杂度分析错误: {str(e)}'

        return complexity

    def _generate_optimization_suggestions(self, analysis):
        """生成优化建议

        Args:
            analysis: 分析结果

        Returns:
            优化建议列表
        """
        suggestions = []

        # 基于执行时间的建议
        if 'execution_time' in analysis and 'total' in analysis['execution_time']:
            exec_time = analysis['execution_time']['total']
            if exec_time > 1:
                suggestions.append('执行时间较长，考虑优化算法或使用缓存')

        # 基于内存使用的建议
        if 'memory_usage' in analysis:
            if 'peak' in analysis['memory_usage'] and analysis['memory_usage']['peak'] > 100:
                suggestions.append('内存使用较高，检查是否有内存泄漏或不必要的大对象')

        # 基于函数调用的建议
        if 'function_calls' in analysis and isinstance(analysis['function_calls'], list):
            for func in analysis['function_calls'][:3]:  # 检查前3个耗时最多的函数
                if func.get('cumulative_time', 0) > 0.1:
                    suggestions.append(f'函数 {func.get("name", "未知")} 执行时间较长，考虑优化其实现')

        # 基于代码复杂度的建议
        if 'code_complexity' in analysis:
            complexity = analysis['code_complexity']
            if 'cyclomatic_complexity' in complexity and complexity['cyclomatic_complexity'] > 10:
                suggestions.append('圈复杂度较高，考虑拆分为多个简单函数')
            if 'max_nesting_depth' in complexity and complexity['max_nesting_depth'] > 3:
                suggestions.append('嵌套深度过大，考虑简化代码结构')
            if 'average_function_length' in complexity and complexity['average_function_length'] > 50:
                suggestions.append('函数平均长度较长，考虑拆分为多个小函数')

        return suggestions

    def _update_summary(self, file_results):
        """更新摘要信息

        Args:
            file_results: 文件分析结果
        """
        analysis = file_results.get('analysis', {})

        # 更新执行时间
        if 'execution_time' in analysis and 'total' in analysis['execution_time']:
            self.results['summary']['total_execution_time'] += analysis['execution_time']['total']

        # 更新内存使用
        if 'memory_usage' in analysis and 'peak' in analysis['memory_usage']:
            self.results['summary']['total_memory_usage'] += analysis['memory_usage']['peak']

        # 更新函数分析数量
        if 'function_calls' in analysis:
            self.results['summary']['functions_analyzed'] += len(analysis['function_calls'])

        # 更新性能问题数量
        if 'optimization_suggestions' in file_results:
            self.results['summary']['performance_issues'] += len(file_results['optimization_suggestions'])

    def generate_report(self, format='json'):
        """生成报告

        Args:
            format: 报告格式 ('json' 或 'html')

        Returns:
            报告内容
        """
        if format == 'json':
            return json.dumps(self.results, indent=2, ensure_ascii=False)
        elif format == 'html':
            return self._generate_html_report()
        else:
            return '不支持的报告格式'

    def _generate_html_report(self):
        """生成HTML报告

        Returns:
            HTML报告内容
        """
        html = '''
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>代码性能分析报告</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    background-color: #f5f5f5;
                }
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    background-color: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                }
                h1 {
                    color: #333;
                    text-align: center;
                }
                h2 {
                    color: #555;
                    border-bottom: 2px solid #eee;
                    padding-bottom: 10px;
                }
                h3 {
                    color: #666;
                }
                .summary {
                    background-color: #f9f9f9;
                    padding: 15px;
                    border-radius: 5px;
                    margin-bottom: 20px;
                }
                .file-report {
                    margin-bottom: 30px;
                    padding: 15px;
                    border: 1px solid #eee;
                    border-radius: 5px;
                }
                .file-report h3 {
                    color: #333;
                    margin-top: 0;
                }
                .analysis-section {
                    margin-bottom: 20px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 10px 0;
                }
                th, td {
                    padding: 8px;
                    text-align: left;
                    border-bottom: 1px solid #ddd;
                }
                th {
                    background-color: #f2f2f2;
                }
                tr:hover {
                    background-color: #f5f5f5;
                }
                .suggestions {
                    background-color: #fff3cd;
                    padding: 15px;
                    border-radius: 5px;
                    border-left: 4px solid #ffc107;
                }
                .suggestions h4 {
                    margin-top: 0;
                    color: #856404;
                }
                .suggestions ul {
                    margin: 10px 0;
                    padding-left: 20px;
                }
                .suggestions li {
                    margin-bottom: 5px;
                }
                .error {
                    color: red;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>代码性能分析报告</h1>
                <div class="summary">
                    <h2>摘要</h2>
                    <p>分析时间: ''' + self.results['timestamp'] + '''</p>
                    <p>分析文件数: ''' + str(len(self.results['files'])) + '''</p>
                    <p>总执行时间: ''' + str(round(self.results['summary']['total_execution_time'], 4)) + ''' 秒</p>
                    <p>总内存使用峰值: ''' + str(round(self.results['summary']['total_memory_usage'], 2)) + ''' MB</p>
                    <p>分析函数数: ''' + str(self.results['summary']['functions_analyzed']) + '''</p>
                    <p>发现性能问题: ''' + str(self.results['summary']['performance_issues']) + '''</p>
                </div>
        '''

        # 添加每个文件的报告
        for file_path, file_results in self.results['files'].items():
            html += '''
                <div class="file-report">
                    <h3>文件: ''' + file_path + '''</h3>
            '''

            analysis = file_results.get('analysis', {})

            # 执行时间分析
            if 'execution_time' in analysis:
                html += '''
                    <div class="analysis-section">
                        <h4>执行时间分析</h4>
                '''
                if 'total' in analysis['execution_time']:
                    html += '''
                        <p>总执行时间: ''' + str(round(analysis['execution_time']['total'], 4)) + ''' 秒</p>
                    '''
                elif 'error' in analysis['execution_time']:
                    html += '''
                        <p class="error">''' + analysis['execution_time']['error'] + '''</p>
                    '''
                html += '''
                    </div>
                '''

            # 内存使用分析
            if 'memory_usage' in analysis:
                html += '''
                    <div class="analysis-section">
                        <h4>内存使用分析</h4>
                '''
                if 'peak' in analysis['memory_usage']:
                    html += '''
                        <p>内存使用峰值: ''' + str(round(analysis['memory_usage']['peak'], 2)) + ''' MB</p>
                    '''
                if 'average' in analysis['memory_usage']:
                    html += '''
                        <p>平均内存使用: ''' + str(round(analysis['memory_usage']['average'], 2)) + ''' MB</p>
                    '''
                elif 'warning' in analysis['memory_usage']:
                    html += '''
                        <p>''' + analysis['memory_usage']['warning'] + '''</p>
                    '''
                elif 'error' in analysis['memory_usage']:
                    html += '''
                        <p class="error">''' + analysis['memory_usage']['error'] + '''</p>
                    '''
                html += '''
                    </div>
                '''

            # 函数调用分析
            if 'function_calls' in analysis and analysis['function_calls']:
                html += '''
                    <div class="analysis-section">
                        <h4>函数调用分析</h4>
                        <table>
                            <tr>
                                <th>函数名</th>
                                <th>调用次数</th>
                                <th>总执行时间 (秒)</th>
                                <th>累积执行时间 (秒)</th>
                            </tr>
                '''
                for func in analysis['function_calls']:
                    html += '''
                            <tr>
                                <td>''' + func['name'] + '''</td>
                                <td>''' + str(func['calls']) + '''</td>
                                <td>''' + str(round(func['total_time'], 4)) + '''</td>
                                <td>''' + str(round(func['cumulative_time'], 4)) + '''</td>
                            </tr>
                    '''
                html += '''
                        </table>
                    </div>
                '''

            # 代码复杂度分析
            if 'code_complexity' in analysis:
                html += '''
                    <div class="analysis-section">
                        <h4>代码复杂度分析</h4>
                '''
                complexity = analysis['code_complexity']
                if 'cyclomatic_complexity' in complexity:
                    html += '''
                        <p>圈复杂度: ''' + str(complexity['cyclomatic_complexity']) + '''</p>
                    '''
                if 'function_count' in complexity:
                    html += '''
                        <p>函数数量: ''' + str(complexity['function_count']) + '''</p>
                    '''
                if 'average_function_length' in complexity:
                    html += '''
                        <p>平均函数长度: ''' + str(round(complexity['average_function_length'], 1)) + ''' 行</p>
                    '''
                if 'max_nesting_depth' in complexity:
                    html += '''
                        <p>最大嵌套深度: ''' + str(complexity['max_nesting_depth']) + '''</p>
                    '''
                html += '''
                    </div>
                '''

            # 优化建议
            if 'optimization_suggestions' in file_results and file_results['optimization_suggestions']:
                html += '''
                    <div class="suggestions">
                        <h4>优化建议</h4>
                        <ul>
                '''
                for suggestion in file_results['optimization_suggestions']:
                    html += '''
                            <li>''' + suggestion + '''</li>
                    '''
                html += '''
                        </ul>
                    </div>
                '''

            html += '''
                </div>
            '''

        html += '''
            </div>
        </body>
        </html>
        '''

        return html

    def save_report(self, output_file, format='json'):
        """保存报告到文件

        Args:
            output_file: 输出文件路径
            format: 报告格式 ('json' 或 'html')
        """
        report = self.generate_report(format)
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(report)
        print(f'报告已保存到: {output_file}')


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='代码性能分析器')
    parser.add_argument('--file', help='要分析的文件路径')
    parser.add_argument('--directory', help='要分析的目录路径')
    parser.add_argument('--exclude', nargs='+', help='要排除的文件或目录')
    parser.add_argument('--output', choices=['json', 'html'], default='json', help='报告格式')
    parser.add_argument('--output-file', help='报告输出文件路径')

    args = parser.parse_args()

    analyzer = PerformanceAnalyzer()

    if args.file:
        analyzer.analyze_file(args.file)
    elif args.directory:
        analyzer.analyze_directory(args.directory, args.exclude)
    else:
        print('请指定要分析的文件或目录')
        return

    # 生成报告
    if args.output_file:
        analyzer.save_report(args.output_file, args.output)
    else:
        print(analyzer.generate_report(args.output))


if __name__ == '__main__':
    main()

---
name: "code-performance-checker"
description: "检查代码性能，分析性能瓶颈和优化机会。适用于Python和JavaScript代码库，提供详细的性能分析报告和优化建议。"
---

# 代码性能检查器

## 功能介绍

代码性能检查器是一个强大的工具，用于分析代码的性能问题、瓶颈和优化机会。它支持分析Python和JavaScript代码库，提供详细的性能分析报告和优化建议。

## 支持的语言

- **Python**：支持分析.py文件和Python模块
- **JavaScript**：支持分析.js文件和Node.js应用

## 性能指标分析

- **执行时间**：分析代码执行的时间消耗
- **内存使用**：分析代码的内存消耗情况
- **函数调用**：分析函数调用的频率和耗时
- **代码复杂度**：分析代码的复杂度和潜在问题

## 分析工具

- **Python**：使用内置的cProfile、time模块和可选的memory_profiler
- **JavaScript**：使用Node.js的内置性能分析工具

## 常见性能问题

- **循环嵌套过深**：导致时间复杂度指数级增长
- **内存泄漏**：未释放的内存导致内存使用持续增长
- **重复计算**：相同的计算重复执行
- **I/O操作频繁**：频繁的文件或网络操作
- **函数调用开销**：过多的函数调用导致的开销

## 优化建议

- **算法优化**：选择更高效的算法和数据结构
- **缓存使用**：缓存计算结果，避免重复计算
- **并行处理**：使用多线程或多进程处理计算密集型任务
- **内存管理**：及时释放不再使用的内存
- **代码重构**：简化复杂的代码结构，提高可读性和性能

## 使用方法

### 基本用法

```bash
# 分析Python文件
python performance_analyzer.py --file example.py

# 分析JavaScript文件
python performance_analyzer.py --file example.js

# 分析整个目录
python performance_analyzer.py --directory ./src

# 生成HTML报告
python performance_analyzer.py --file example.py --output html

# 生成JSON报告
python performance_analyzer.py --file example.py --output json
```

### 示例

#### 分析Python文件

```bash
python performance_analyzer.py --file services/advanced_3d_modeling.py
```

#### 分析JavaScript文件

```bash
python performance_analyzer.py --file nodejs-login-app/server.js
```

#### 分析整个目录

```bash
python performance_analyzer.py --directory services/
```

## 报告内容

### 执行时间分析

- 总执行时间
- 各函数执行时间占比
- 执行时间最长的函数

### 内存使用分析

- 总内存使用量
- 内存使用峰值
- 内存使用最多的函数

### 函数调用分析

- 函数调用次数
- 函数调用层级
- 调用频率最高的函数

### 代码复杂度分析

- 圈复杂度
- 函数长度
- 嵌套深度

### 优化建议

- 针对发现的性能问题提供具体的优化建议
- 建议的优化方法和预期效果
- 优化后的性能提升估计

## 高级选项

- **--exclude**：排除特定文件或目录
- **--depth**：设置分析的深度
- **--timeout**：设置分析的超时时间
- **--sample-rate**：设置采样率

## 系统要求

- **Python**：3.7+
- **JavaScript**：Node.js 10+
- **可选依赖**：memory_profiler（用于内存使用分析）

## 安装依赖

```bash
# 安装可选的内存分析依赖
pip install memory_profiler
```

## 注意事项

- 性能分析可能会增加系统负载，建议在开发环境中使用
- 对于大型代码库，分析可能需要较长时间
- 内存分析需要安装memory_profiler模块
- JavaScript分析需要Node.js环境

## 故障排除

### 内存分析失败

如果遇到内存分析失败的情况，可能是因为未安装memory_profiler模块。可以通过以下命令安装：

```bash
pip install memory_profiler
```

### JavaScript分析失败

如果遇到JavaScript分析失败的情况，可能是因为未安装Node.js或Node.js路径未添加到环境变量。请确保安装了Node.js并正确配置了环境变量。

### 分析超时

对于大型代码库，分析可能会超时。可以通过--timeout选项增加超时时间：

```bash
python performance_analyzer.py --file large_file.py --timeout 300
```
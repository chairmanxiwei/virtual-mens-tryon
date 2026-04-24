# 逐件换装与两阶段串联试衣（Chain Try-On）

本系统的试衣能力支持两种模式：

- 逐件换装（前端串行）：每次仅试穿一件衣物，以上一步生成图作为下一步输入，直到完成。
- 两阶段串联试衣（后端链式）：每次试穿一件衣物会进行两次大模型调用（step1 + step2），仅保留 step2 的输出作为最终结果，用于提升细节一致性与成像质量。

## 接口

### 1) 上传图片

`POST /api/upload/image`

表单字段：
- `file`: 图片文件

返回：
- `data.image_url`: 图片 URL（本服务 `/files/...`）

### 2) 单件试衣（异步为主）

`POST /api/virtual-tryon`

请求 JSON：
- `person_image_url`: 人物图片 URL
- `garment_image_url`: 衣物图片 URL
- `garment_type`: `top|bottom|dress`

返回（两种情况）：
- 立即返回（本地/同步）：`data.image_url`
- 异步任务：`data.task_id`

### 3) 查询任务

`GET /api/virtual-tryon/task/{task_id}`

关键字段：
- `data.status`: `pending|processing|completed|failed|canceled`
- `data.image_url`: 完成时的结果图
- `data.trace_id`: 串联模式下的追踪 ID（用于定位日志）

### 4) 取消任务

`POST /api/virtual-tryon/task/{task_id}/cancel`

用于终止轮询与后续处理。若任务已结束则返回当前状态。

## 两阶段串联（Chain）说明

当开启 `TRYON_CHAIN_ENABLED=1` 时，后端会对单次试衣执行两次模型调用：

1. step1：输入（人物图 + 衣物图）生成中间结果
2. step2：输入（step1 结果图 + 原始衣物图）再次生成，最终只保留 step2 输出

系统会把两次调用的参数、耗时与质量指标写入日志，便于复现与追溯。

日志文件：
- `tryon_chain.log`（JSON Lines，每行一条记录）

记录字段包含：
- `trace_id`
- `step1/step2.task_id`
- `step1/step2.duration`
- `step1/step2.parameters`
- `step1/step2.metrics`（bytes/width/height/brightness/edge_mean 等）

## 错误码（data.code）

后端失败响应结构：
- `success=false`
- `message`: 人类可读错误
- `data.code`: 机器可读错误码（部分路径支持）

建议在前端按 `data.code` 做差异化提示：
- `TRYON_PUBLIC_URL_REQUIRED`：需要公网可访问 URL（生产应配 OSS）
- `TRYON_CANCELED`：任务已取消
- `TRYON_TASK_NOT_FOUND`：task_id 不存在

## 性能基准（建议测量方法）

建议在同一台机器上分别测量：

- 单件试衣（非串联）：每次输出耗时 `T`
- 两阶段串联：每次输出耗时约 `T1 + T2`（通常明显高于单次，但质量更稳定）

推荐记录：
- p50 / p95 端到端耗时
- 失败率（HTTP 非 200、任务 FAILED、无有效 image_url）

## 回滚方案

如需回滚到非串联：
- 设置：`TRYON_CHAIN_ENABLED=0`

如需允许本地贴图兜底（不推荐、与纯串联目标相悖）：
- 设置：`TRYON_ALLOW_LOCAL_FALLBACK=1`

## 端到端脚本

在启动后端服务后，可运行：

```bash
python server/src/api/scripts/e2e_tryon_chain.py --person <人物图路径> --garment <衣物图路径> --type top
```


# 虚拟男装智能穿搭系统 - GitHub 推送指南

## 推送步骤

由于 Trae 环境网络限制，无法直接推送代码。请在您的本地终端中执行以下命令：

### 1. 进入项目目录
```bash
cd "d:\虚拟男装各版本\虚拟男装（网站版）\虚拟男装"
```

### 2. 验证远程仓库配置
```bash
git remote -v
```

### 3. 推送代码（会提示输入 GitHub 用户名和密码/Token）
```bash
git push -u origin main
```

## 注意事项

### 如果提示需要登录
- **用户名**：输入您的 GitHub 用户名
- **密码**：输入您的 GitHub 个人访问令牌（Personal Access Token）
  - 如何创建 Token：GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
  - 权限：至少需要 `repo` 权限

### 如果推送失败

#### 错误：remote: Permission to charmmanwei/virtual-mens-tryon.git denied to user
- 原因：没有仓库权限
- 解决：确保您是仓库的协作者或拥有者

#### 错误：fatal: unable to access 'https://github.com/charmmanwei/virtual-mens-tryon.git/': Failed to connect to github.com
- 原因：网络连接问题
- 解决：检查网络连接，或尝试使用 SSH 方式

#### 错误：Updates were rejected because a pushed branch tip is behind its remote
- 原因：远程仓库有新的提交
- 解决：先拉取合并
  ```bash
  git pull origin main --rebase
  git push -u origin main
  ```

## 查看仓库

推送成功后，您可以在以下地址查看：
https://github.com/charmmanwei/virtual-mens-tryon

## 配置文件说明

推送完成后，团队成员需要：
1. 克隆仓库：`git clone https://github.com/charmmanwei/virtual-mens-tryon.git`
2. 复制 `.env.example` 为 `.env` 并填写实际配置
3. 参考 `CONFIGURATION.md` 进行环境配置

# 上传文件到服务器

Write-Host "开始上传文件..." -ForegroundColor Green

# 服务器信息
$serverIP = $env:DEPLOY_SERVER_IP
$username = $env:DEPLOY_USERNAME
$port = if ($env:DEPLOY_PORT) { [int]$env:DEPLOY_PORT } else { 22 }

# 本地项目路径
$localProjectPath = "D:\Pycharm\虚拟男装"

# 服务器项目路径
$serverProjectPath = "/root/虚拟男装"

if (-not $serverIP -or -not $username) {
    throw "请先设置环境变量 DEPLOY_SERVER_IP 与 DEPLOY_USERNAME"
}

# 创建服务器目录
Write-Host "创建服务器目录..." -ForegroundColor Cyan
ssh -o StrictHostKeyChecking=no $username@$serverIP -p $port "mkdir -p $serverProjectPath"

# 上传文件
Write-Host "上传文件..." -ForegroundColor Cyan
scp -r -P $port "$localProjectPath\*" "$username@$serverIP:$serverProjectPath/"

Write-Host "文件上传完成！" -ForegroundColor Green

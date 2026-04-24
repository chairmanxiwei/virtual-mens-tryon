module.exports = {
  apps: [
    {
      name: "virtual-man-frontend",
      cwd: "/root/虚拟男装/current/node-server",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};

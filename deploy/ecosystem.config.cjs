// PM2 설정 (오라클 서버)
// 사용: pm2 start deploy/ecosystem.config.cjs && pm2 save
// 환경 변수는 프로젝트 루트의 .env 에서 읽는다 (server/_core/index.ts 의 dotenv/config).
const path = require("path");

module.exports = {
  apps: [
    {
      name: "mystarcraft",
      cwd: path.resolve(__dirname, ".."),
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      time: true,
    },
  ],
};

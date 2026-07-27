// PM2 설정 파일 — 노트북 서버 자동 실행용
// 사용법: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "safetyboard",
      script: "start.cjs",               // .env 로드 후 서버 시작
      interpreter: "node",
      node_args: [],
      env: {
        NODE_ENV: "production",
        PORT: 5000,
        DATABASE_URL: "postgresql://postgres:ryujaeha123!!@localhost:5432/safetyboard",
        SESSION_SECRET: "safetyboard-session-secret-2026",
      },
      // 충돌 시 자동 재시작
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      // 로그 파일 위치 (프로젝트 폴더 기준)
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};

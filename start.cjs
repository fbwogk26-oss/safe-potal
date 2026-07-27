// .env 파일을 직접 읽어서 환경변수로 설정한 후 서버 시작
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.substring(0, idx).trim();
      const value = trimmed.substring(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
  console.log('[start] .env 파일 로드 완료');
} else {
  console.warn('[start] .env 파일을 찾을 수 없습니다:', envPath);
}

require('./dist/index.cjs');

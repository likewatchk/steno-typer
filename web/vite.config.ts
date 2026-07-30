/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 로컬 API 테스트용 (uvicorn :8000) — 프로덕션은 nginx 가 프록시
    proxy: { '/api': 'http://localhost:8000' },
  },
  build: {
    target: 'es2022',
    // 단일 청크로 충분히 작다 — 코드 스플리팅으로 얻을 게 없는 규모
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})

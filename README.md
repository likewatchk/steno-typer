# 나희의 속기 깜빡이 (steno-typer)

스테노 속기 연습 웹앱. 학원의 '깜빡이' 기계처럼 단어목록을 큰 글씨로 하나씩 깜빡이며 보여주고,
속기계/키보드로 받아쳐서 채점까지 한다.

- **깜빡이**: 낱말·어절·문장 노출 (글자수 자동/고정 시간, 셔플·반복·구간, 카운트다운, 전체화면)
- **타이핑 채점**: 띄어쓰기 무시 옵션, 음절/자모/타수 단위, 오답만 재연습, KPM
- **자유연습**: 메모장형 백지 (속기 프로그램이 메모장을 팅기는 문제의 대체재, 자동 저장)
- **속기계 방어 입력**: 비제어 textarea, input 이벤트만 신뢰, 키 절대 안 뺏음, IME 조합 보호,
  입력 진단 로그(JSON 내보내기)
- **로컬 우선**: IndexedDB 가 정본. 서버(사우디 OCI)는 수동 동기화 시에만 접촉 (10s 타임아웃)

## 구조

```
web/     Vite + React 19 + TS + zustand + idb (라우터·UI킷 없음)
api/     FastAPI + stdlib sqlite3 — /api/health, /api/sync (LWW 병합)
deploy/  nginx.conf, docker-compose.yml, deploy.sh, verify-vpn.sh, size-gate.mjs
```

## 개발

```bash
cd web
npm install
npm run dev     # http://localhost:5173 (/api 는 :8000 프록시)
npm test        # vitest 122개 (성능 예산 테스트 포함)
npm run build
```

## 배포

```bash
deploy/deploy.sh   # 테스트 → 빌드 → 성능게이트 → rsync → compose up → VPN 무결성 확인
```

- 서버: `ssh saudi` (OCI 리야드, Oracle Linux 9 aarch64). 호스트 설치 0 — 전부 컨테이너.
- 포트: **1004/tcp 만 사용.**
- ⚠️ **서버의 OpenVPN(443/tcp·1194/udp)과 network-inspector(5000)는 절대 건드리지 않는다.**
  모든 배포는 `verify-vpn.sh` 무결성 확인으로 끝나며, 실패 시 즉시 중단·보고.

## 성능 예산 (빌드 게이트)

JS ≤ 120KB gzip · CSS ≤ 15KB gzip · 웹폰트/이미지 0 · 연습 중 React 리렌더 0 (DOM 직접 기록)

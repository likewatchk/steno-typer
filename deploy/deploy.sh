#!/usr/bin/env bash
# steno 배포 — 로컬 빌드 → rsync → 컨테이너 기동 → VPN 무결성 확인.
# 서버 호스트에는 아무것도 설치하지 않는다. 방화벽은 1004/tcp "추가"만 (플랜 §0).
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=saudi
IP=84.8.104.88
PORT=1004

echo "==[1/7] 테스트 =="
(cd web && npx vitest run --silent)

echo "==[2/7] 타입체크 + 빌드 =="
(cd web && npx tsc -b && npx vite build)

echo "==[3/7] 성능 게이트 =="
node deploy/size-gate.mjs

echo "==[4/7] 전송 =="
ssh "$HOST" 'mkdir -p ~/steno/data'
rsync -az --delete web/dist/ "$HOST":steno/dist/
rsync -az --delete api/ "$HOST":steno/api/
rsync -az deploy/nginx.conf deploy/docker-compose.yml deploy/verify-vpn.sh "$HOST":steno/

# .env(동기화 토큰) — 없을 때만 생성, 절대 덮어쓰지 않는다
ssh "$HOST" 'test -f ~/steno/.env || { umask 077; echo "STENO_TOKEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d " \n")" > ~/steno/.env; echo "새 동기화 토큰 생성됨"; }'

echo "==[5/7] 방화벽 (1004/tcp 추가만, 기존 룰 불변) =="
ssh "$HOST" '
  set -euo pipefail
  if sudo firewall-cmd --list-ports | grep -q "1004/tcp"; then
    echo "1004/tcp 이미 개방됨 — 방화벽 무변경"
  else
    sudo firewall-cmd --list-all > ~/steno/firewall-before-$(date +%Y%m%d%H%M%S).txt
    sudo firewall-cmd --permanent --add-port=1004/tcp
    sudo firewall-cmd --reload
    echo "1004/tcp 추가 완료"
  fi
'

echo "==[6/7] 컨테이너 기동 (프로젝트 steno 한정) =="
ssh "$HOST" 'cd ~/steno && sudo docker compose -p steno -f ~/steno/docker-compose.yml up -d --build'

echo "==[7/7] VPN 무결성 + 서비스 확인 =="
ssh "$HOST" 'bash ~/steno/verify-vpn.sh'
sleep 2
curl -fsS -m 15 "http://$IP:$PORT/api/health" && echo " ← api ok"
curl -fsS -m 15 -o /dev/null -w "web %{http_code} (%{time_total}s)\n" "http://$IP:$PORT/"

echo
echo "배포 완료: http://$IP:$PORT/"
echo "동기화 토큰 확인: ssh $HOST 'cat ~/steno/.env'"

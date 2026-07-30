#!/usr/bin/env bash
# OpenVPN 무결성 확인 — 서버 변경(배포) 후 반드시 통과해야 한다 (플랜 §0).
# 하나라도 어긋나면 non-zero exit. 자체 복구 시도는 하지 않는다 — 보고만.
set -u

fail=0
note() { echo "✓ $1"; }
bad() {
  echo "✗ $1"
  fail=1
}

# 1) OpenVPN 리스닝 (tcp/443 + udp/1194)
sudo ss -tlnp | grep -q ':443 .*openvpn' && note "OpenVPN tcp/443 리스닝" || bad "OpenVPN tcp/443 리스닝 사라짐!"
sudo ss -ulnp | grep -q ':1194 .*openvpn' && note "OpenVPN udp/1194 리스닝" || bad "OpenVPN udp/1194 리스닝 사라짐!"

# 2) systemd 유닛 (tcp·udp 서버 모두)
systemctl is-active --quiet openvpn-server@server && note "openvpn-server@server active" || bad "openvpn-server@server inactive!"
systemctl is-active --quiet openvpn-server@server-udp && note "openvpn-server@server-udp active" || bad "openvpn-server@server-udp inactive!"

# 3) 방화벽 기존 룰 보존 (443/tcp, 1194/udp, 5000/tcp + rich rules + masquerade)
ports=$(sudo firewall-cmd --list-ports)
for p in 443/tcp 1194/udp 5000/tcp; do
  grep -q "$p" <<<"$ports" && note "firewalld $p 유지" || bad "firewalld $p 사라짐!"
done
rich=$(sudo firewall-cmd --list-rich-rules)
grep -q '10.10.0.0/16' <<<"$rich" && grep -q '10.11.0.0/16' <<<"$rich" && note "rich rules 유지" || bad "rich rules 사라짐!"
[ "$(sudo firewall-cmd --query-masquerade)" = "yes" ] && note "masquerade 유지" || bad "masquerade 꺼짐!"

# 4) 기존 컨테이너 생존
sudo docker ps --format '{{.Names}}' | grep -q '^network-inspector$' && note "network-inspector 생존" || bad "network-inspector 사라짐!"

if [ "$fail" -ne 0 ]; then
  echo
  echo "!! VPN 무결성 확인 실패 — 즉시 수동 점검 필요. 자동 복구는 시도하지 않았습니다."
  exit 1
fi
echo
echo "VPN 무결성 확인 통과"

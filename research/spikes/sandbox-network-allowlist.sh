#!/bin/bash
# Spike: allowlisted, recorded egress for an unprivileged sandbox netns.
#
# Proves the three claims research/sandbox-network.md doubted on 2026-06-12:
#   1. slirp4netns gives a child in a fresh netns REAL egress (the handoff that
#      "failed on first pass" — the fix was slirp4netns --configure, which sets up
#      tap0 inside the netns itself, NOT `pasta --config-net`).
#   2. nftables INSIDE the unprivileged user+net namespace enforces an IP
#      allowlist UNBYPASSABLY — raw sockets are dropped too, not just
#      proxy-honoring tools (the property an HTTP_PROXY allowlist cannot give).
#   3. Per-rule counters are a readable, unbypassable record of allowed + denied.
#
# Requires: bubblewrap/unshare + slirp4netns + nft, and working unprivileged user
# namespaces (the same primitive the bwrap tier needs). Skips cleanly if absent.
#
# Run: research/spikes/sandbox-network-allowlist.sh
set -u

for t in unshare slirp4netns nft curl; do
  command -v "$t" >/dev/null || { echo "SKIP: $t not installed"; exit 0; }
done
unshare --user --map-root-user --net true 2>/dev/null || {
  echo "SKIP: unprivileged user namespaces unavailable"; exit 0; }

ALLOW_HOST="${ALLOW_HOST:-example.com}"
BLOCK_HOST="${BLOCK_HOST:-1.1.1.1}"
RAW_IP="${RAW_IP:-9.9.9.9}"
NS=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
ALLOW_IP=$(getent ahostsv4 "$ALLOW_HOST" | awk '{print $1; exit}')   # resolved on HOST
echo "[host] allowlist: $ALLOW_HOST -> $ALLOW_IP ; resolver=$NS ; block=$BLOCK_HOST"

READY=$(mktemp -u); GO=$(mktemp -u); mkfifo "$READY" "$GO"
trap 'rm -f "$READY" "$GO"' EXIT

# The child lives in a fresh user+net namespace (mapped-root, so it owns
# CAP_NET_ADMIN over ITS netns only). It signals readiness, waits for the parent
# to attach slirp4netns, then installs the nft allowlist and runs the tests.
unshare --user --map-root-user --net bash -c '
  echo ready > '"$READY"'
  read < '"$GO"'
  nft -f - <<NFT
  table inet vig {
    chain output {
      type filter hook output priority 0; policy drop;
      oifname "lo" accept
      ct state established,related accept
      ip daddr '"$NS"' udp dport 53 counter accept comment "dns"
      ip daddr '"$NS"' tcp dport 53 counter accept comment "dns"
      ip daddr '"$ALLOW_IP"' counter accept comment "allow-'"$ALLOW_HOST"'"
      log prefix "vig-drop " counter drop
    }
  }
NFT
  echo "[ns] ALLOW  https://'"$ALLOW_HOST"'"
  curl -s -m 10 -o /dev/null -w "[ns]   -> http_code=%{http_code} (expect 200)\n" \
    --resolve '"$ALLOW_HOST"':443:'"$ALLOW_IP"' https://'"$ALLOW_HOST"'/ 2>&1 \
    || echo "[ns]   -> curl rc=$?"
  echo "[ns] BLOCK  https://'"$BLOCK_HOST"' (not allowlisted)"
  curl -s -m 6 -o /dev/null -w "[ns]   -> http_code=%{http_code}\n" https://'"$BLOCK_HOST"'/ 2>&1 \
    || echo "[ns]   -> curl rc=$? (28=dropped)"
  echo "[ns] BLOCK  raw socket -> '"$RAW_IP"':443 (bypasses any proxy)"
  if timeout 5 bash -c "exec 3<>/dev/tcp/'"$RAW_IP"'/443" 2>/dev/null; then
    echo "[ns]   -> OPEN (LEAK!)"; else echo "[ns]   -> blocked rc=$? (124=dropped/timeout)"; fi
  echo "[ns] RECORD (per-rule counters, unbypassable):"
  nft list chain inet vig output | grep -E "comment|vig-drop" | sed "s/^/[ns]   /"
' &
NSPID=$!
head -c1 "$READY" >/dev/null
# Parent attaches a tap to the child netns and configures it (10.0.2.0/24, route,
# slirp DNS). --disable-host-loopback keeps host services unreachable.
slirp4netns --configure --disable-host-loopback "$NSPID" tap0 >/dev/null 2>&1 &
SLIRP=$!
sleep 1.5
echo go > "$GO"
wait $NSPID
kill $SLIRP 2>/dev/null

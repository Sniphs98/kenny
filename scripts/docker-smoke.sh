#!/usr/bin/env bash
set -euo pipefail

image=${1:-kenny:local}
container="kenny-smoke-${RANDOM}-${RANDOM}"
volume="${container}-data"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker volume create "$volume" >/dev/null
docker run -d --name "$container" --mount "type=volume,source=$volume,target=/app/data" \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -e ORIGIN=http://localhost:3000 -e BETTER_AUTH_URL=http://localhost:3000 \
  -e BETTER_AUTH_SECRET=container-smoke-only-secret-0123456789 "$image" >/dev/null

wait_ready() {
  for attempt in $(seq 1 60); do
    if docker exec "$container" node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  docker logs "$container"
  return 1
}
wait_ready
docker exec -i -e SMOKE_PHASE=create "$container" node --input-type=module < scripts/docker-smoke.mjs
docker restart "$container" >/dev/null
wait_ready
docker exec -i -e SMOKE_PHASE=verify "$container" node --input-type=module < scripts/docker-smoke.mjs
echo "Container smoke test passed (auth, migrations, API, uploads, persistent restart)."

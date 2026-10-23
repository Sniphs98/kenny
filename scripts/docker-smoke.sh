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

# The same image below a subpath: requests outside BASE_PATH are rejected, the healthcheck follows it
docker rm -f "$container" >/dev/null
docker run -d --name "$container" --mount "type=volume,source=$volume,target=/app/data" \
  --cap-drop ALL --security-opt no-new-privileges:true -e BASE_PATH=/kenny \
  -e ORIGIN=http://localhost:3000 -e BETTER_AUTH_URL=http://localhost:3000 \
  -e BETTER_AUTH_SECRET=container-smoke-only-secret-0123456789 "$image" >/dev/null
for attempt in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$container")" = healthy ] && break
  [ "$attempt" = 60 ] && { docker logs "$container"; exit 1; }
  sleep 2
done
docker exec -i "$container" node --input-type=module <<'JS'
const status = async (path) => (await fetch(`http://localhost:3000${path}`, { redirect: 'manual' })).status;
const expected = { '/kenny/login': 200, '/kenny/api/health': 200, '/kenny': 308, '/login': 404 };
for (const [path, code] of Object.entries(expected)) {
	const actual = await status(path);
	if (actual !== code) throw new Error(`${path}: expected ${code}, got ${actual}`);
}
JS
echo "Container smoke test passed (auth, migrations, API, uploads, persistent restart, subpath)."

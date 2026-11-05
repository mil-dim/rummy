#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage: sh scripts/deploy-safe.sh [--force] [--no-sync] [--source DIR]

Run this from an environment directory such as ~/rummy/qa or ~/rummy/prod.
By default it syncs ../../git/rummy into the current directory, preserving
.env, .git, data and upload, then builds and safely recreates the service.

  --source DIR  use a different checked-out source directory
  --no-sync     deploy the files already present in this directory
  --force       recreate even with connected users or unfinished games
EOF
}

force=0
sync_source=${DEPLOY_SOURCE_DIR:-../../git/rummy}
sync_enabled=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --force)
      force=1
      ;;
    --no-sync)
      sync_enabled=0
      ;;
    --source)
      [ "$#" -ge 2 ] || { echo "deploy-safe: --source requires a directory" >&2; exit 2; }
      sync_source=$2
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "deploy-safe: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

target_dir=$(pwd -P)
[ -f "$target_dir/compose.yaml" ] || { echo "deploy-safe: run from an environment directory containing compose.yaml" >&2; exit 2; }
[ -f "$target_dir/.env" ] || { echo "deploy-safe: refusing to deploy without the environment's .env file" >&2; exit 2; }

if [ "$sync_enabled" -eq 1 ]; then
  command -v rsync >/dev/null 2>&1 || { echo "deploy-safe: rsync is required" >&2; exit 2; }
  source_dir=$(cd "$sync_source" 2>/dev/null && pwd -P) || { echo "deploy-safe: source directory not found: $sync_source" >&2; exit 2; }
  [ "$source_dir" != "$target_dir" ] || { echo "deploy-safe: source and target must be different; use --no-sync for an in-place checkout" >&2; exit 2; }
  [ -d "$source_dir/.git" ] || { echo "deploy-safe: source is not a Git checkout: $source_dir" >&2; exit 2; }
  [ -f "$source_dir/compose.yaml" ] && [ -f "$source_dir/package.json" ] || { echo "deploy-safe: source does not look like the Tabletop repository: $source_dir" >&2; exit 2; }

  echo "Syncing $source_dir -> $target_dir"
  rsync -av --delete \
    --exclude='.git/' \
    --exclude='.env' \
    --exclude='data/' \
    --exclude='upload/' \
    "$source_dir/" "$target_dir/"
fi

# Build while the old container remains available.
docker compose build

if [ "$force" -eq 1 ]; then
  echo "WARNING: --force bypasses the maintenance deadline, connected-user check, and unfinished-game check." >&2
  echo "WARNING: recreating now disconnects users and permanently loses all in-memory games." >&2
else
  # This atomically locks new identification if the instance is ready.
  docker compose exec -T tabletop node scripts/admin.mjs ready
fi

docker compose up -d --no-build
docker compose ps


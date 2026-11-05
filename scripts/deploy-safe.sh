#!/bin/sh
set -eu
# Run from the environment directory containing compose.yaml and .env.
# Build while the old container remains up; re-check immediately before replacing it.
docker compose build
docker compose exec -T tabletop node scripts/admin.mjs ready
docker compose up -d --no-build

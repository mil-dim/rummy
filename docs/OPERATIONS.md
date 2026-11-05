# Operator controls and dice diagnostics

Run these commands from the environment directory, e.g. `~/rummy/qa` or
`~/rummy/prod`. Keep each environment's existing COMPOSE_PROJECT_NAME unchanged.
The initial upgrade from 1.0.11 must be arranged manually while no one is playing:
old versions do not have these commands. Container restarts still lose game state.

## Private control API

Compose enables a separate HTTP listener on **127.0.0.1:9090 inside the container**.
It is NOT published by Docker and must NOT be added to Caddy. It requires a random
per-boot bearer token stored in `/tmp/tabletop-admin.token` (mode 0600). The CLI
reads that key locally; never copy it into chat, a URL or browser storage.
The public game listener has no admin routes. Do not expose port 9090.

```sh
# Connected people, rooms, unfinished games, memory and audit health:
docker compose exec -T tabletop node scripts/admin.mjs status

# Announce a restart ten minutes from now and drain new games:
docker compose exec -T tabletop node scripts/admin.mjs announce 10 'Server update planned'

# Withdraw the notice and reopen new games:
docker compose exec -T tabletop node scripts/admin.mjs cancel

# Exit nonzero unless deployment is safe:
docker compose exec -T tabletop node scripts/admin.mjs ready
```

The announcement is delivered to every connected page and to reconnecting pages.
It shows a countdown and operator message. Existing games, undo, concessions,
renames and leaving remain available. Creating rooms, joining a new player seat,
starting another hand/game and creating new identities are paused. Existing
identities can reconnect, and existing users can watch.

**There is no automatic restart at the deadline.** If players remain, wait or
cancel/reannounce. `ready` requires an announcement whose deadline has passed,
zero connected identified users (including lobby users/watchers), and zero
unfinished games, even if their players disconnected. It does not delete paused
games or make a disconnected player lose. Finished/waiting rooms can be cleared
by a restart once everyone is offline.

After merging, pulling and rsyncing source into this environment with the usual
`.env`, `.git`, `data` and `upload` exclusions, use:

```sh
sh scripts/deploy-safe.sh
```

This builds while the current service remains running, rechecks `ready` and locks new sign-ins/reconnects, then
recreates the container without another build. Use only after announcing and
waiting. This is an operator guard, not a replacement for coordination: a successful `ready` locks identification until restart or cancel. Manually running Docker restart,
Compose down/up, or rebooting the VM bypasses it. No deployment can preserve games
in memory through a server restart. The notice itself is in memory and clears
when the server restarts.

For bare Node installs, set a private ADMIN_PORT and ADMIN_TOKEN_FILE per process;
DICE_AUDIT_DIR enables persistence. Leaving ADMIN_PORT unset disables the admin API.

## Dice audit

Every **accepted physical Backgammon roll** across all tables is appended to a
UTC-date JSONL file in `/data/dice`. This includes the opening contest. Ordinary
rolls have two dice; doubles, Gulbara expansion and inheritance do not generate
additional audit records. Rejected/repeated requests, page rendering and undo do
not log duplicate rolls.

Records contain a boot UUID, environment, room ID, game/variant, side (0/1), roll
ID, kind, values and time. They contain no names, IP addresses, tokens, hands or
future random values. IDs are correlated only for debugging; this is not a
cryptographically tamper-proof gambling audit trail.

Compose's `runtime-data` named volume survives rebuild/recreation. Each Compose
project has its own volume. Do not run `docker compose down -v` unless you intend
to remove its audit history. There is no automatic deletion: monitor disk use and
archive old files as needed. One million records typically take hundreds of MB.
`admin status` reports bytes, write errors and accepted records logged this boot.
Write failures are reported to stderr/status; play continues, so investigate gaps
before drawing statistical conclusions.

```sh
# Test the same cryptographic function used by production; no game/audit changes:
docker compose exec -T tabletop node scripts/dice-check.mjs --samples 1000000

# Analyse actual server history, streaming files without loading them all:
docker compose exec -T tabletop node scripts/dice-check.mjs --audit-dir /data/dice --days 30

# Narrow to one table or variant when investigating an apparent pattern:
docker compose exec -T tabletop node scripts/dice-check.mjs --audit-dir /data/dice --room ABC12345
docker compose exec -T tabletop node scripts/dice-check.mjs --audit-dir /data/dice --variant gulbara
```

`--samples` counts two-dice rolls, so one million generates two million individual
dice. Checks include faces, 36 ordered pairs, doubles, non-overlapping adjacent pairs,
repeat streaks, numerical correlation and equal-value dependence at lags 1..32.
Chi-square p-values require adequate expected counts; output reports this.
Opening single-die rolls are excluded from pair/doubles counts. Pair arrays are
row-major: (1,1)..(1,6),(2,1)..(6,6).

Flags use conservative exploratory thresholds, not a fairness certificate or
proof of cheating. Multiple comparisons can flag honest data. Interleaving tables
can hide local patterns; use room/variant filters as appropriate. Do not keep
rerunning until a pass, suppress repeats or adjust production probabilities.
No finite sample proves unpredictability or absence of longer periods. Production
still uses crypto.randomInt(1,7), with no clock seeds, internet entropy or filters.

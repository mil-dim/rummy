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

After merging, first update the source checkout, then run the deploy from the
environment directory:

```sh
# Update reviewed source explicitly. deploy-safe never changes Git branches.
cd ~/git/rummy
git switch main
git pull --ff-only

cd ~/rummy/qa
sh scripts/deploy-safe.sh
```

By default the script rsyncs `../../git/rummy` into the current environment,
preserving `.env`, `.git`, `data` and `upload`. Use `--source DIR` for a different
checkout, or `--no-sync` when the current directory is itself the checkout. It
then builds while the current service remains running, rechecks `ready`, locks
new sign-ins/reconnects, and recreates the container without another build.

Announce before deploying with the short wrapper:

```sh
cd ~/rummy/qa
sh scripts/announce-restart.sh 10 'QA update in ten minutes'
sh scripts/deploy-safe.sh
```

The deployment refuses while the deadline, logged-in people or unfinished games
make the instance unsafe. In an emergency, `sh scripts/deploy-safe.sh --force`
bypasses those three checks and recreates immediately. It still requires a valid
source, successful sync and successful image build. **Force disconnects users and
permanently loses every in-memory game**, so it is not the normal production path.

This is an operator guard, not a replacement for coordination: a successful
`ready` locks identification until restart or cancel. Manually running Docker
restart, Compose down/up, rebooting the VM, or using `--force` bypasses the safe
drain. No deployment can preserve games in memory through a server restart. The
notice itself is in memory and clears when the server restarts.

For bare Node installs, set a private ADMIN_PORT and ADMIN_TOKEN_FILE per process;
DICE_AUDIT_DIR enables persistence. Leaving ADMIN_PORT unset disables the admin API.

## Optional Google accounts and ratings

The existing `/data` runtime volume stores `/data/tabletop.sqlite` as well as the
dice audit. Guest play remains available when authentication is not configured.
For each public environment, create a Google OAuth **Web application** client and
register its exact redirect URI, for example:

```text
https://qa.milenid.com/auth/google/callback
https://games.milenid.com/auth/google/callback
```

Google may use one client with both redirect URIs or separate QA/production
clients. Set these only in each deployment's uncommitted `.env`:

```sh
PUBLIC_BASE_URL=https://qa.milenid.com
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

`PUBLIC_BASE_URL` must exactly match the browser origin and must use HTTPS in
public deployments. Caddy needs no special path: its existing reverse proxy sends
the callback to the application. The application stores Google subject, verified
email, display name and optional avatar URL. It never receives or stores the
Google password. Login cookies are opaque, HttpOnly, SameSite=Lax, Secure on HTTPS,
and expire after 30 days. Google OAuth access tokens are not persisted.

New signed profiles are unapproved and can still play casually. Review and approve
only people you recognize using the loopback-only operator API:

```sh
docker compose exec -T tabletop node scripts/admin.mjs accounts
docker compose exec -T tabletop node scripts/admin.mjs approve ACCOUNT_ID
docker compose exec -T tabletop node scripts/admin.mjs unapprove ACCOUNT_ID
```

## Private feedback delivery

The in-game feedback form is available only when the Resend HTTPS API is
configured. DigitalOcean blocks outbound SMTP ports 25, 465 and 587, so Gmail SMTP
cannot be used from the Droplet. The recipient, sender and API key stay in each
deployment's uncommitted `.env`; they are never sent to the browser or included in
the public build.

Create a Resend account, verify the sending domain, and create an API key restricted
to sending email. Add the same settings to both `~/rummy/qa/.env` and
`~/rummy/prod/.env`:

```sh
FEEDBACK_TO=operator@example.com
FEEDBACK_FROM="Tabletop <feedback@example.com>"
RESEND_API_KEY=re_replace_with_private_key
```

Recreate each container after changing `.env`; a source rebuild is not required
for environment-only changes. The form allows one attempt per player
every 10 minutes, at most three attempts per player and ten per source network in
24 hours, and contains a bot honeypot. Limits are held in memory and reset when the
container restarts. The IP address is used only for this temporary limit; it is not
emailed or stored. Feedback is sent as plain email and is not written to SQLite or
application logs. Delivery errors log only the Resend HTTP error, never the message
body or API key. All delivery traffic uses HTTPS port 443.

## Private usage reports

Tabletop stores privacy-limited visit and game analytics in the existing SQLite
database. The report includes display names, browser-reported country/locale and
time zone, visit duration, rooms created/joined, watching, games and variants
played, completion and winners. It does not include IP addresses, cards, private
hands, messages, Google identifiers, email addresses or authentication tokens.
Country is an approximation from the browser locale and may be missing or wrong.

```sh
# Last 30 days (default):
docker compose exec -T tabletop node scripts/admin.mjs report

# Last 7 days:
docker compose exec -T tabletop node scripts/admin.mjs report 7

# Save a report on the host:
docker compose exec -T tabletop node scripts/admin.mjs report 30 > tabletop-report-30d.json
```

The command uses the loopback-only operator API and its per-boot token. Reports
are never exposed through Caddy or the public application. Usage rows live in
`/data/tabletop.sqlite`, survive normal container recreation, and follow the
same backup precautions as ratings. Usage visits and games older than 24 months
are deleted automatically when the application starts.

Approval is not exposed through Caddy or the public web application. Rated matches
require distinct approved accounts for all seated players and lock the roster at
match start. Results are written once after the full match finishes; unfinished
in-memory matches lost during a restart do not affect ratings. The first ten rated
matches use a deliberately small K-factor to limit rating transfer from new
accounts. Ratings are separate for Rummy, normal Backgammon and the three-variant
rotation.

Back up the Compose runtime-data volume. In particular, copy the SQLite database
only with the application stopped or use SQLite's backup tooling; copying only the
main file while WAL writes are active can produce an incomplete backup. Never run
`docker compose down -v` unless both rating history and dice history may be erased.

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


# Tabletop

Self-hosted real-time Bulgarian Rummy, Santase (66), Blato (3-5-8) and
Backgammon for a Proxmox VM.

Guest play requires no account. Optional Google sign-in supports persistent,
administrator-approved rated profiles; casual games remain available to everyone.

## Proxmox installation

Create a Debian 12 VM (2 vCPU, 2 GB RAM, 12 GB disk), install Docker, copy this
folder to the VM, and run:

```bash
docker compose up -d --build
```

Open `http://VM-IP:8080` on the LAN. For internet play, place it behind an HTTPS
reverse proxy such as Caddy, Nginx Proxy Manager, or your existing proxy. The
proxy must pass WebSocket connections.

## Rummy rules implemented

- 13 cards; two decks plus two jokers.
- Sets and same-suit runs of at least three cards.
- Opening threshold: 44 points, except when going out.
- A discard pickup must immediately be used in a meld.
- A player must have opened before adding to any table meld.
- `A-2-3` scores 6; `Q-K-A` scores 30; wrapped runs are invalid.
- Jokers score 25; faces and Ace score 10 except a low Ace scores 1.
- Match points are `floor(card points / 10)`, with a minimum of 1.
- If nobody else has opened when the winner goes out: fixed 100 / 10 points.
- Every `(player count + 1)` game is a sprint and scores double.

## Current release notes

Rooms and active games are held in server memory. Browser guest identity survives
reconnects while the server is running. Optional signed profiles, completed rated
matches and ratings persist in SQLite on the runtime-data volume. Active game
snapshots are not yet persisted through a server restart.


### Browser regression check

After npm ci, install the test browser once with `npx playwright install chromium`.
Run `npm run test:browser` to check roll history, reconnect after a server restart,
build-update detection, and reload without losing player/order storage. This
starts an isolated local server on port 18091. GitHub CI runs this check too.

The browser checks /version against its loaded build on reconnect, tab focus,
and every 60 seconds while visible. An update notice offers a reload; active games
are not forcibly reloaded. Old pages from before this mechanism may need one final
reload to load it. This does not deploy changes: update the checkout, deployment
copy and Docker image separately.


## Backgammon match formats

At match setup choose Normal Backgammon only and a number of games, or rotating
rounds where each round plays normal Backgammon, Gulbara, then Tapa. The previous
winner starts the next game, including variant changes; a new match uses the
opening dice contest. Wins score 1, Mars scores 2. The in-app English/Bulgarian
rules describe pins and ascending doubles.

Each player sees their own starting point as 24, with checker-color badges.
Concede 1 point or concede Mars asks for confirmation and then the opponent's
acceptance. It ends only the current game. Permanent Leave game remains separate
and ends the match. Protocol 12 requires current browser assets after deployment.

## Santase and Blato

Santase is a two-player match to 11 points with the Bulgarian 24-card rules,
20/40 announcements, trump-nine exchange, talon closing and 1/2/3-point deal
scoring. Blato is a three-player, nine-deal match with rotating 8/5/3 targets,
the four-card talon, trump/no-trump bidding, one pass per player per match and
the plus/minus card exchange between deals. Both games are server-authoritative,
support casual or rated matches, and hide hands from opponents and watchers.

## Optional Google sign-in and ratings

The public homepage links to `/privacy` and `/terms`; use those exact
HTTPS URLs for Google OAuth production branding and verification.

Leave Google variables empty to keep guest-only operation. To enable sign-in,
create a Google OAuth web client, add the exact callback URL
`https://YOUR_HOST/auth/google/callback`, and configure `PUBLIC_BASE_URL`,
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the environment `.env` file.
Never commit the client secret. After first sign-in, approve known people through
the private operator command documented in `docs/OPERATIONS.md`.

Casual play never requires an account. A host can select Rated only when every
seated player is signed in, approved, and uses a distinct account. Rummy,
Santase, Blato, normal Backgammon and rotating Backgammon have separate ratings. New accounts transfer
rating slowly for their first ten rated matches.


## Watching games

Use **Watch** in the lobby to observe any game, even when
all player seats are occupied. The lobby lists player and watcher names, online
status and game status. Watchers cannot play, start games or respond to concessions.
Rummy, Santase and Blato hands remain hidden during play. Public tricks, talons,
contracts, counts, scores and table melds remain visible as appropriate.

Back to lobby and Resume watching preserve your watcher place. Stop watching
returns to the lobby without affecting the match. A session has one room membership;
leave your current seat or stop watching before joining another table. Refresh and
short disconnects resume watching. Watchers do not keep abandoned rooms alive.


## Lobby and operations

Change name preserves your current identity and game. Sign out explicitly confirms
leaving a seat, then returns every tab for that identity to name entry. Lobby people
show activity and reserved table; default table names are funny and unique.

See [operator instructions](docs/OPERATIONS.md) for private maintenance announcements,
drain/deployment checks, persistent accepted-roll auditing and randomness diagnostics.
The admin port must never be published or proxied.

From a QA/prod environment directory, `sh scripts/announce-restart.sh 10` posts
the warning and `sh scripts/deploy-safe.sh` syncs the reviewed checkout, builds,
checks that the drain is safe, and recreates the container. `--force` is an
emergency override that disconnects users and loses in-memory games.

Waiting tables default to two players. The lobby identifies Bulgarian Rummy as
Joker/Жокер, shows the current game or Backgammon variant on active tables, and
lets seated players invite an available online person. Invitations remain visible
until accepted/declined and are revalidated by the server before joining.


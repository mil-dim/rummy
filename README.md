# Tabletop LAN

Self-hosted real-time Bulgarian Rummy and Backgammon for a Proxmox VM.

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

Rooms and active games are held in server memory. Browser identity survives
reconnects while the server is running. A later production hardening step
should persist room/game snapshots and add account authentication if the
internet endpoint will be public.


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


## Bulgarian Backgammon rounds

Choose the number of rounds at match setup. Each round plays normal backgammon,
Gulbara, then Tapa. The previous winner starts the next game, including variant
changes; a new match uses the opening dice contest. Wins score 1, Mars scores 2.
The in-app English/Bulgarian rules describe pins and ascending doubles.

Each player sees their own starting point as 24, with checker-color badges.
Concede 1 point or concede Mars asks for confirmation and then the opponent's
acceptance. It ends only the current game. Permanent Leave game remains separate
and ends the match. Protocol 6 requires current browser assets after deployment.


## Watching games

Use **Watch** in the lobby to observe Rummy or any Backgammon variant, even when
all player seats are occupied. The lobby lists player and watcher names, online
status and game status. Watchers cannot play, start games or respond to concessions.
Rummy hands remain hidden during play; only counts, discard and table melds are
shown. Finished hands reveal remaining cards for score verification.

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

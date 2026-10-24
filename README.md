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

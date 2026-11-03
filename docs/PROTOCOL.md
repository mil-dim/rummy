# Tabletop client protocol

Protocol version: **2**

The Node server is authoritative. Browser and future mobile clients render the
public state they receive and submit requested actions; they never decide
whether a move is legal.

## Session and room events

- `identify { token?, name }` → `{ ok, token, player }`
- `createRoom { name, gameType, maxPlayers }`
- `joinRoom { id }`
- `startGame { sprintCount? }`
- `action { ... }`

Every client event uses a Socket.IO acknowledgement shaped as either
`{ ok: true }` or `{ ok: false, error }`.

The server emits:

- `lobby`: public room summaries.
- `room`: `{ protocolVersion, id, name, gameType, hostId, players, match, game }`.

Private Rummy hands are redacted for other players until the hand finishes.

## Rummy actions

- `{ type: "draw", from: "stock" | "discard" }`
- `{ type: "meldBatch", melds: [{ cardIds, jokerAssignments }] }`
- `{ type: "add", meldId, cardIds, jokerAssignments }`
- `{ type: "replaceJoker", meldId, jokerId, cardId }`
- `{ type: "discard", cardId }`

A joker assignment is `{ cardId, rank, suit }`. Rank uses `A, 2..10, J, Q,
K`; suit uses `♠, ♥, ♦, ♣`.

Card IDs must never appear in more than one staged meld. Meld membership is
persistent and determines how that meld may later be extended.

## Compatibility

Clients must reject a room state with a newer unsupported
`protocolVersion`. Additive display-only fields may be introduced without a
version increment; action or state-semantic changes require one.

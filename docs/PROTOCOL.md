# Tabletop client protocol

Protocol version: **3**

The Node server is authoritative. Browser and future mobile clients render the
public state they receive and submit requested actions; they never decide
whether a move is legal.

## Session and room events

- `identify { token?, name }` → `{ ok, token, player }`
- `createRoom { name, gameType, maxPlayers }`
- `joinRoom { id }`
- `leaveRoom {}`: permanently remove the authenticated player from their seat; no target player ID is accepted.
- `startGame { sprintCount? }`
- `action { ... }`

Every client event uses a Socket.IO acknowledgement shaped as either
`{ ok: true }` or `{ ok: false, error }`.

The server emits:

- `lobby`: public room summaries.
- `room`: `{ protocolVersion, id, name, gameType, hostId, players, formerPlayers, match, game }`.
- `roomLeft { id }`: clears the room in all connected tabs of the leaving session.

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

## Lobby browsing and leaving

Back to lobby is a local view change; membership, hand, and turn remain intact.
The browser remembers this view per tab across refresh and reconnect. Resume game
returns to the reserved seat. A seated player cannot create or join another room.

Permanent leave transfers host ownership to the first remaining player and deletes
empty rooms. Disconnecting alone never forfeits. In Backgammon, the opponent wins
by forfeit. In Rummy, forfeited players cannot act, their turns are skipped, and
their hands stay out of circulation until scoring. Their remaining points count
normally; an unopened hand counts 100. The last remaining player wins. A roster
change ends the current match after this hand; the next match uses remaining seats.
Previous names remain available in formerPlayers for results. Undo cannot restore
a departed player. Server authorization requires current room membership even if
an old game still contains the player's historical ID.

On touch screens, Arrange cards switches hand taps from selection to reordering:
tap a source card, then a destination. Done arranging restores normal selection.
Desktop drag and drop remains available.

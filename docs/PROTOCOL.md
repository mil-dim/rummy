# Tabletop client protocol

Protocol version: **5**

The Node server is authoritative. Browser and future mobile clients render the
public state they receive and submit requested actions; they never decide
whether a move is legal.

## Session and room events

- `identify { token?, name }` → `{ ok, token, player }`
- `createRoom { name, gameType, maxPlayers }`
- `joinRoom { id }`
- `leaveRoom {}`: permanently remove the authenticated player from their seat; no target player ID is accepted.
- `startGame { sprintCount?, gameCount? }`
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

## Rummy score rounding

For each opponent, divide raw remaining-card points by 10, round to the nearest
integer (half rounds up), and apply a minimum of 1. Then double that rounded
score for a sprint. The winner receives the sum of those opponent scores.
For example: 24 → 2 (sprint 4), 25 → 3 (sprint 6), 27 → 3 (sprint 6).
An unopened hand remains 100 raw points: 10 normally, 20 during a sprint.

## Zero-sum standings (protocol 4)

Each scores.players[id].match is now a signed change: negative for each loser,
positive for the winner, whose change equals scores.awarded. Raw points stay
nonnegative. Each hand and the cumulative standings sum to zero. Cumulative
standings add every player's signed change once per hand, including forfeited
players. Highest cumulative score wins after the selected sprint cycles; there
is no 100-point elimination rule.

## Backgammon (protocol 5)

Choose gameCount (integer 1–100, default 5) when starting a new match. A finished
match resets cumulative scores; otherwise startGame advances to the next game.
In the first game, each player may submit `{ type: "roll" }` once to roll one die.
Ties reset both opening rolls; openingPrevious preserves the tie for display.
The higher roller then rolls two fresh dice. Subsequent games start with the
previous winner. The server's phases are opening, roll, play and finished.

Actions are `{ type: "roll" }`, `{ type: "move", from: 0..23 | "bar", dieIndex }`
and `{ type: "undo" }`. Move coordinates and dieIndex must be integers. Doubles
expand to four dice. The server searches all continuations and rejects moves
that fail to use the maximum number of dice; when only one of two different dice
can be played, the higher must be used. Bar checkers re-enter before any other
checker moves. Side 0 (white) moves toward point 1, side 1 (red) toward point 24.

publicBackgammon returns viewer-specific legalMoves and canUndo. Undo snapshots
stay in a server-only WeakMap. The first move may be undone until a second move,
a win, a forfeit, or the opponent's next roll. Moving the same checker twice
counts as two moves. If only one move was possible, undo can restore that turn
before the opponent rolls. Rolls themselves cannot be undone.

After a turn, lastTurn contains playerId, dice, used indices, and reason
(complete or blocked). It stays visible until the next roll. Current dice and
used indices are separate, allowing the next player to roll without losing the
previous roll's evidence prematurely.

A normal win earns 1; Mars earns 2 if the opponent has borne off no checkers.
No additional triple-point category is applied. A permanent departure earns the
opponent 1 forfeit point and ends the match. scores contains winner, awarded,
mars and forfeit. The server records each result once in match.cumulative.
Backgammon totals accumulate positively; Rummy zero-sum scoring is unchanged.

The center bar displays each side's hit checkers exactly once. Borne-off checkers
appear in a separate off-board tray. The browser does not decide legal moves.

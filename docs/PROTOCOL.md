# Tabletop client protocol

Protocol version: **9**

The Node server is authoritative. Browser and future mobile clients render the
public state they receive and submit requested actions; they never decide
whether a move is legal.

## Session and room events

- `identify { token?, name }` → `{ ok, token, player, resumed, sessionReplaced }`
- `createRoom { name, gameType, maxPlayers }`
- `joinRoom { id }`
- `invitePlayer { playerId }`
- `respondInvitation { id, accept }`
- `leaveRoom {}`: permanently remove the authenticated player from their seat; no target player ID is accepted.
- `startGame { sprintCount?, roundCount? }`
- `action { ... }`

Every client event uses a Socket.IO acknowledgement shaped as either
`{ ok: true }` or `{ ok: false, error }`.

The server emits:

- `serverVersion`: environment, version and build fingerprint on connection.
- `lobby`: public room summaries, including public `currentGame` progress.
- `room`: `{ protocolVersion, id, name, gameType, maxPlayers, hostId, players, formerPlayers, match, game }`.
- `gameInvitation`: the current invitation or `null`.
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

## Backgammon

Choose roundCount (integer 1–100, default 3) when starting a new match. A finished
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
stay in a server-only WeakMap as a stack. Undo restores one move at a time,
including moving the same checker repeatedly. A normal roll allows undo of its
first move; doubles allow undo of the first three moves, in reverse order. Using
the final die commits the turn and clears the entire stack. A win, a forfeit, or
the opponent's next roll also clears it. If blocked before using all dice, the
stack remains available until the opponent rolls. Rolls themselves cannot be undone.

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

## Dice generation and roll history

Backgammon dice use Node crypto.randomInt(1, 7) independently per physical die.
No timestamps, counters, external services, or repeat suppression affect results.
Opening rolls request one value; ordinary rolls request two, then doubles expand
to four moves. Rummy's existing shuffle is unchanged.

rollHistory retains up to 50 accepted rolls. Each entry contains a monotonically
increasing per-game id, playerId, kind (opening or turn), the original one/two dice,
and at (timestamp for diagnostics only). Rejected rolls and undo do not create
entries. History contains past rolls, never future random values. rollNumber is
the latest per-game id; gameNumber distinguishes games. Browser re-renders retain
the same id until a fresh roll is accepted.

## Client updates and session recovery

The server renders / and /index.html with no-store and the current build embedded
in metadata and asset query strings. Static assets still revalidate. The loaded
client compares that embedded build to serverVersion and uncached /version on
connect, return to a visible tab, and every 60 seconds while visible. A mismatch
shows a reload button; it never forcibly reloads an active game. The footer keeps
the loaded client version/build rather than mislabeling old code as the new build.

Reload uses a fresh navigation URL and preserves local player data. When identify
returns resumed:false, the client clears only transient room/game selection state
and shows the lobby. sessionReplaced:true means the supplied token was no longer
valid; the server has issued a new identity. A valid resumed seat and hand ordering
are preserved. An existing page from before this feature may need one final normal
or hard reload to load the update-aware client; a reload cannot deploy server code.

## Starting order and button language

Rummy game N starts with player (N-1) modulo player count, without reordering the
player list. Two-player games alternate starters; larger tables rotate through
seat order. A new match resets gameNumber and starts with the first seat again.

The header EN/БГ selector translates action and dialog buttons in both games.
The preference is stored locally as uiLanguage and survives reload. Changing
language only updates control text; it does not submit a move, rebuild the game,
clear selected/staged cards, or change player/room names. The rules dialog starts
in the selected language. Other status/help text is not fully localized yet.


## Three-variant Backgammon (protocol 6)

`startGame { roundCount }` accepts 1..100 rounds; default 3. Each round is
normal → gulbara → tapa. `match.roundCount` and `totalGames = roundCount * 3`
are fixed for the match. Each next game uses the previous winner as starter;
a new match repeats the opening dice contest. `game.variant` selects the rules.

`rollsBySide` counts regular rolls per side, excluding the opening contest and
inherited dice. Gulbara ascending doubles apply when the roller's count exceeds
three. `sequence = {roller,face,started,handedOver}` describes four dice at the
current stage, continuing to six. No giant dice array is sent. A blocked sequence
transfers its unconsumed dice at most once and only if the roller has moved.
Blocking again abandons the remainder. The next regular roller is always the
opponent of the original roller. No bonus rolls are generated. Undo commits at
handover or final completion; otherwise existing snapshots restore stage state.

Tapa points use `owner/count` for the top color and optional `pinned` for one
opposing checker underneath. That checker counts toward its owner's 15 but cannot
move. Removing the last covering checker releases it. Capturing the last checker
on its starting point sets `tapaWinner` and immediately awards Mars.

Concession actions: `offerResignation {points:1|2}`, `cancelResignation`,
`acceptResignation`, `declineResignation`. Offers are held privately outside undo
snapshots and projected as `resignationOffer:{side,points}|null`. Only the other
player can accept/decline; only the proposer can cancel. Pending offers pause
moves and rolls. Acceptance finishes one game, sets `scores.resigned`, and awards
the agreed points; it does not trigger the permanent-leave/end-match policy.
The UI asks the proposer for a second confirmation before sending an offer.

Board coordinates remain authoritative 0..23. The client maps each player's
starting point to displayed 24 and home to 1..6, preserving physical IDs in move
requests. Gulbara red coordinates wrap half a board from white. Player color
badges do not change with the starter. Spectators use the white perspective.


## Watchers (protocol 7)

`watchRoom {id}` joins a read-only watcher membership in any existing room,
including full, waiting, ongoing and finished games. A session has exactly one
membership, either a player seat or a watcher place. Stop watching before joining
another room; leaving a player seat still uses the explicit permanent-leave flow.
The server never auto-forfeits or converts a player into a watcher.

Room payloads add viewer-specific `role: player|watcher` and a `watchers` roster.
Lobby entries retain numeric `players` and add `playerList`, `watchers`, `status`
(waiting/playing/finished), and optional Backgammon `variant`. Roster items contain
only id/name/connected; socket IDs and session tokens never appear in rosters.

Watcher game payloads use a null viewer for the existing public projections.
During Rummy play all hands are counts, stock is a count, and canUndo is false.
Melds, discard, turns and scores remain public. After the hand finishes, remaining
hands are revealed as scoring evidence, as for seated players. Backgammon watchers
see board, dice and history with no legalMoves, undo or concession authority.
Server action/start/join/create checks require the appropriate player membership;
supplying another player's ID cannot elevate a watcher.

`leaveRoom` as a watcher stops watching, clears all tabs for the session and does
not forfeit, transfer host, change scores or end a match. Back to lobby retains
watcher membership and Resume watching returns to the table. Reload/reconnect
restores it. Disconnected watchers retain a ten-minute reconnect grace (pruned on
the minute cleanup tick). Each room allows at most 50 watcher identities.
Watching activity never refreshes player room activity, so observers cannot keep
abandoned rooms alive indefinitely. Room deletion notifies watchers with roomLeft.


## Lobby identities and maintenance (protocol 8)

`rename {name}` updates the current session without changing its player ID or seat.
`identityChanged` updates every tab of that session. `signOut` requires no current
membership; clients explicitly confirm and leave first if necessary. It invalidates
the token, clears all session tabs with `signedOut`, and does not clear language
preferences or other local data. `setView {view:lobby|room}` updates presence.
`people` entries contain id/name/connected/activity/roomId/roomName, never tokens.
Disconnected people are listed only while they retain a table membership.

Room names are normalized/sanitized and unique (case/spacing-insensitive) on the
authoritative server. Duplicate requests receive an available numeric suffix.
The client suggests unused funny names in the selected UI language.

`maintenance` is null or {deadline,message}. It is emitted on connection/change.
Only the private token-authenticated loopback operator API can set it; no public
Socket.IO action controls it. A notice drains new rooms/player joins/new games
but does not terminate or restart games. See OPERATIONS.md for deployment rules.


## Invitations and lobby game labels (protocol 9)

`invitePlayer {playerId}` is available to a seated player while their table is
waiting and has a free seat. The target must be connected and have no player or
watcher membership. The server stores at most one current invitation per identity
and emits `gameInvitation {id,roomId,roomName,gameType,fromName}` to every tab and
again after reconnect. Sending another invitation replaces the earlier one.

`respondInvitation {id,accept}` declines and clears the invitation, or atomically
revalidates maintenance, membership, capacity and game state before seating the
recipient. Starting/deleting a room clears its outstanding invitations. An
invitation never bypasses normal join authorization and contains no private game
state.

Lobby room entries add `currentGame` with public number/total/sprint and, for
Backgammon, variant/round information. This lets the lobby name the game currently
in progress without revealing cards or legal moves.


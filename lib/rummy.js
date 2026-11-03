import { randomUUID } from "node:crypto";

export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function newRummy(players, gameNumber = 1) {
  const deck = [];
  for (let copy = 0; copy < 2; copy++)
    for (const suit of SUITS)
      for (const rank of RANKS) deck.push({ id: randomUUID(), suit, rank });
  for (let i = 0; i < 2; i++) deck.push({ id: randomUUID(), suit: "", rank: "JOKER" });
  shuffle(deck);
  const hands = Object.fromEntries(players.map(player => [player.id, deck.splice(0, 13)]));
  return {
    kind: "rummy",
    gameNumber,
    sprint: gameNumber % (players.length + 1) === 0,
    players: players.map(player => player.id),
    hands,
    stock: deck,
    discard: [deck.pop()],
    melds: [],
    opened: Object.fromEntries(players.map(player => [player.id, false])),
    openedTurn: Object.fromEntries(players.map(player => [player.id, null])),
    turn: 0,
    turnNumber: 0,
    phase: "draw",
    winner: null,
    scores: null,
    drawnDiscard: null,
    mustOpenAfterDiscard: false
  };
}

const rankNumber = rank => rank === "A" ? 1
  : rank === "J" ? 11 : rank === "Q" ? 12 : rank === "K" ? 13 : Number(rank);

export function cardPoints(card, lowAce = false) {
  if (card.rank === "JOKER") return 25;
  if (card.rank === "A") return lowAce ? 1 : 10;
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  return Number(card.rank);
}

function assignmentMap(assignments) {
  if (assignments === undefined) return new Map();
  if (!Array.isArray(assignments)) throw Error("Joker assignments must be a list.");
  const map = new Map();
  for (const assignment of assignments) {
    if (!assignment || typeof assignment !== "object") throw Error("Invalid joker assignment.");
    const cardId = String(assignment.cardId || "");
    const rank = String(assignment.rank || "").toUpperCase();
    const suit = String(assignment.suit || "");
    if (!cardId || !RANKS.includes(rank) || !SUITS.includes(suit) || map.has(cardId))
      throw Error("Every joker needs one valid declared card.");
    map.set(cardId, { rank, suit });
  }
  return map;
}

function represented(card, assignments) {
  if (card.rank !== "JOKER") return card;
  const declaration = card.represents || assignments.get(card.id);
  if (!declaration || !RANKS.includes(declaration.rank) || !SUITS.includes(declaration.suit))
    throw Error("Declare the exact rank and suit represented by each joker.");
  return { ...card, represents: { rank: declaration.rank, suit: declaration.suit } };
}

const sequenceValue = (rank, aceHigh) => rank === "A" && aceHigh ? 14 : rankNumber(rank);

export function validateMeld(cards, jokerAssignments) {
  try {
    if (!Array.isArray(cards) || cards.length < 3)
      return { ok: false, error: "A meld needs at least 3 cards." };
    if (new Set(cards.map(card => card.id)).size !== cards.length)
      return { ok: false, error: "A physical card can belong to only one meld." };

    const assignments = assignmentMap(jokerAssignments);
    const declared = cards.map(card => represented(card, assignments));
    const virtual = declared.map(card => card.rank === "JOKER" ? { ...card, ...card.represents } : card);

    if (virtual.every(card => card.rank === virtual[0].rank)) {
      if (cards.length > 8) return { ok: false, error: "A set is too large." };
      const ordered = declared.slice().sort((a, b) => {
        const aa = a.rank === "JOKER" ? a.represents : a;
        const bb = b.rank === "JOKER" ? b.represents : b;
        return SUITS.indexOf(aa.suit) - SUITS.indexOf(bb.suit)
          || Number(a.rank === "JOKER") - Number(b.rank === "JOKER");
      });
      return { ok: true, type: "set",
        points: ordered.reduce((sum, card) => sum + cardPoints(card), 0), cards: ordered };
    }

    if (!virtual.every(card => card.suit === virtual[0].suit))
      return { ok: false, error: "A run must use one suit." };
    for (const aceHigh of [false, true]) {
      const values = virtual.map(card => sequenceValue(card.rank, aceHigh)).sort((a, b) => a - b);
      if (new Set(values).size !== values.length) continue;
      if (values.some(value => value < 1 || value > 14)) continue;
      if (values.at(-1) - values[0] !== values.length - 1) continue;
      const valueById = new Map(virtual.map(card => [card.id, sequenceValue(card.rank, aceHigh)]));
      const ordered = declared.slice().sort((a, b) => valueById.get(a.id) - valueById.get(b.id));
      const lowAce = values.includes(1);
      return { ok: true, type: "run",
        points: ordered.reduce((sum, card) =>
          sum + cardPoints(card, lowAce && card.rank === "A"), 0), cards: ordered };
    }
    return { ok: false, error: "Cards are not a consecutive run." };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function take(hand, ids) {
  if (!Array.isArray(ids) || !ids.length) throw Error("Select cards first.");
  if (new Set(ids).size !== ids.length) throw Error("Duplicate card selection.");
  const cards = ids.map(id => hand.find(card => card.id === id));
  if (cards.some(card => !card)) throw Error("A selected card is not in your hand.");
  return cards;
}

function remove(hand, ids) {
  const selected = new Set(ids);
  return hand.filter(card => !selected.has(card.id));
}

function finish(game, winner) {
  game.winner = winner;
  const players = {};
  let awarded = 0;
  for (const id of game.players) {
    if (id === winner) {
      players[id] = { cards: 0, raw: 0, match: 0, fullHand: false };
      continue;
    }
    const fullHand = !game.opened[id];
    const raw = fullHand ? 100 : game.hands[id].reduce((sum, card) => sum + cardPoints(card), 0);
    const match = Math.max(1, Math.floor(raw / 10)) * (game.sprint ? 2 : 1);
    players[id] = { cards: game.hands[id].length, raw, match, fullHand };
    awarded += match;
  }
  game.scores = { players, awarded, winner };
  game.phase = "finished";
  game.mustOpenAfterDiscard = false;
}

function batchMeld(game, playerId, melds) {
  if (game.phase !== "play") throw Error("Draw first.");
  if (!Array.isArray(melds) || !melds.length || melds.length > 8)
    throw Error("Stage at least one meld.");
  const hand = game.hands[playerId];
  const allIds = melds.flatMap(meld => Array.isArray(meld?.cardIds) ? meld.cardIds : []);
  if (new Set(allIds).size !== allIds.length)
    throw Error("A physical card can belong to only one meld.");
  take(hand, allIds);
  const validated = melds.map(staged => {
    const result = validateMeld(take(hand, staged.cardIds), staged.jokerAssignments);
    if (!result.ok) throw Error(result.error);
    return result;
  });
  const openingPoints = validated.reduce((sum, meld) => sum + meld.points, 0);
  const cardsRemaining = hand.length - allIds.length;
  const canGoOutImmediately = cardsRemaining <= 1;
  if (!game.opened[playerId] && openingPoints < 44 && !canGoOutImmediately)
    throw Error("Combined opening melds must total at least 44 points, unless they win the hand.");
  game.hands[playerId] = remove(hand, allIds);
  for (const result of validated)
    game.melds.push({ id: randomUUID(), owner: playerId, type: result.type, cards: result.cards });
  if (!game.opened[playerId]) {
    game.opened[playerId] = true;
    game.openedTurn[playerId] = game.turnNumber;
  }
  game.mustOpenAfterDiscard = false;
  if (!game.hands[playerId].length) finish(game, playerId);
}

function recycleDiscard(game) {
  if (game.stock.length) return;
  if (!game.discard.length) throw Error("No cards remain to draw.");
  game.stock = game.discard.splice(0).reverse();
}

function completeTurn(game) {
  game.turn = (game.turn + 1) % game.players.length;
  game.turnNumber += 1;
  game.phase = "draw";
  game.drawnDiscard = null;
  game.mustOpenAfterDiscard = false;
}

function applyRummyAction(game, playerId, action) {
  if (game.winner) throw Error("This game has finished.");
  if (game.players[game.turn] !== playerId) throw Error("It is not your turn.");
  const hand = game.hands[playerId];

  if (action.type === "draw") {
    if (game.phase !== "draw") throw Error("You have already drawn.");
    if (action.from === "discard") {
      const card = game.discard.at(-1);
      if (!card) throw Error("Discard pile is empty.");
      hand.push(game.discard.pop());
      game.drawnDiscard = card.id;
      game.mustOpenAfterDiscard = !game.opened[playerId];
    } else {
      recycleDiscard(game);
      hand.push(game.stock.pop());
      game.drawnDiscard = null;
      game.mustOpenAfterDiscard = false;
    }
    game.phase = "play";
    return;
  }
  if (action.type === "meldBatch" || action.type === "meld") {
    batchMeld(game, playerId, action.type === "meld"
      ? [{ cardIds: action.cardIds, jokerAssignments: action.jokerAssignments }]
      : action.melds);
    return;
  }
  if (action.type === "add") {
    if (game.phase !== "play") throw Error("Draw first.");
    if (!game.opened[playerId]) throw Error("You must open before adding to any meld.");
    const meld = game.melds.find(candidate => candidate.id === action.meldId);
    if (!meld) throw Error("Meld not found.");
    const cards = take(hand, action.cardIds);
    const result = validateMeld([...meld.cards, ...cards], action.jokerAssignments);
    if (!result.ok) throw Error(result.error);
    meld.cards = result.cards;
    meld.type = result.type;
    game.hands[playerId] = remove(hand, action.cardIds);
    if (!game.hands[playerId].length) finish(game, playerId);
    return;
  }
  if (action.type === "replaceJoker") {
    if (game.phase !== "play") throw Error("Draw first.");
    if (!game.opened[playerId] || game.openedTurn[playerId] === game.turnNumber)
      throw Error("You must have opened before this turn to replace a joker.");
    const meld = game.melds.find(candidate => candidate.id === action.meldId);
    if (!meld) throw Error("Meld not found.");
    const jokerIndex = meld.cards.findIndex(card => card.id === action.jokerId && card.rank === "JOKER");
    if (jokerIndex < 0) throw Error("Joker not found.");
    const joker = meld.cards[jokerIndex];
    const [replacement] = take(hand, [action.cardId]);
    if (!joker.represents || replacement.rank !== joker.represents.rank || replacement.suit !== joker.represents.suit)
      throw Error("That is not the exact card declared by the joker.");
    const candidate = meld.cards.slice();
    candidate[jokerIndex] = replacement;
    const result = validateMeld(candidate);
    if (!result.ok) throw Error(result.error);
    meld.cards = result.cards;
    meld.type = result.type;
    game.hands[playerId] = remove(hand, [replacement.id]);
    game.hands[playerId].push({ id: joker.id, rank: "JOKER", suit: "" });
    return;
  }
  if (action.type === "discard") {
    if (game.phase !== "play") throw Error("Draw first.");
    if (game.mustOpenAfterDiscard && !game.opened[playerId])
      throw Error("After taking the discard, you must complete a valid opening this turn.");
    const [card] = take(hand, [action.cardId]);
    game.hands[playerId] = remove(hand, [card.id]);
    game.discard.push(card);
    if (!game.hands[playerId].length) finish(game, playerId);
    else completeTurn(game);
    return;
  }
  throw Error("Unknown action.");
}


// Private history must never be included in public state.
const turnHistory = new WeakMap();

export function rummyAction(game, playerId, action) {
  if (game.winner) throw Error("This hand has finished.");
  if (game.players[game.turn] !== playerId) throw Error("It is not your turn.");
  if (!action || typeof action !== "object") throw Error("Invalid action.");
  const history = turnHistory.get(game) || [];
  if (action.type === "undo") {
    if (!history.length) throw Error("Nothing to undo this turn.");
    const snapshot = history.pop();
    for (const key of Object.keys(game)) delete game[key];
    Object.assign(game, snapshot);
    turnHistory.set(game, history);
    return;
  }
  const before = structuredClone(game);
  try {
    applyRummyAction(game, playerId, action);
  } catch (error) {
    for (const key of Object.keys(game)) delete game[key];
    Object.assign(game, before);
    throw error;
  }
  if (action.type === "discard" || game.winner ||
      (action.type === "draw" && action.from !== "discard")) {
    turnHistory.delete(game);
  } else {
    history.push(before);
    turnHistory.set(game, history);
  }
}

export function publicRummy(game, viewer) {
  return {
    ...game,
    canUndo: !game.winner && game.players[game.turn] === viewer && Boolean(turnHistory.get(game)?.length),
    stock: { count: game.stock.length },
    hands: Object.fromEntries(game.players.map(id => [
      id, id === viewer || game.winner ? game.hands[id] : { count: game.hands[id].length }
    ]))
  };
}

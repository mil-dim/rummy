import { randomUUID } from "node:crypto";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

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
  const hands = Object.fromEntries(players.map(p => [p.id, deck.splice(0, 13)]));
  return {
    kind: "rummy", gameNumber, sprint: gameNumber % (players.length + 1) === 0,
    players: players.map(p => p.id), hands, stock: deck, discard: [deck.pop()],
    melds: [], opened: Object.fromEntries(players.map(p => [p.id, false])),
    turn: 0, phase: "draw", winner: null, scores: null, log: []
  };
}

const rankNumber = r => r === "A" ? 1 : r === "J" ? 11 : r === "Q" ? 12 : r === "K" ? 13 : Number(r);

export function cardPoints(card, lowAce = false) {
  if (card.rank === "JOKER") return 25;
  if (card.rank === "A") return lowAce ? 1 : 10;
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  return Number(card.rank);
}

export function validateMeld(cards) {
  if (!Array.isArray(cards) || cards.length < 3) return { ok: false, error: "A meld needs at least 3 cards." };
  const jokers = cards.filter(c => c.rank === "JOKER");
  const normal = cards.filter(c => c.rank !== "JOKER");
  if (!normal.length) return { ok: false, error: "A meld cannot contain only jokers." };

  if (normal.every(c => c.rank === normal[0].rank)) {
    if (cards.length > 8) return { ok: false, error: "Set is too large." };
    return { ok: true, type: "set", points: cards.reduce((n, c) => n + cardPoints(c), 0) };
  }

  if (!normal.every(c => c.suit === normal[0].suit))
    return { ok: false, error: "A run must use one suit." };
  const nums = normal.map(c => rankNumber(c.rank)).sort((a, b) => a - b);
  if (new Set(nums).size !== nums.length) return { ok: false, error: "Duplicate rank in run." };

  const candidates = [nums];
  if (nums.includes(1)) candidates.push(nums.map(n => n === 1 ? 14 : n).sort((a, b) => a - b));
  for (const seq of candidates) {
    let gaps = 0;
    for (let i = 1; i < seq.length; i++) gaps += seq[i] - seq[i - 1] - 1;
    const span = seq.at(-1) - seq[0] + 1;
    if (gaps <= jokers.length && span + (jokers.length - gaps) === cards.length) {
      const lowAce = seq.includes(1);
      const points = normal.reduce((n, c) => n + cardPoints(c, lowAce && c.rank === "A"), 0)
        + jokers.length * 25;
      return { ok: true, type: "run", points };
    }
  }
  return { ok: false, error: "Cards are not a consecutive run." };
}

function take(hand, ids) {
  if (new Set(ids).size !== ids.length) throw Error("Duplicate card selection.");
  const cards = ids.map(id => hand.find(c => c.id === id));
  if (cards.some(c => !c)) throw Error("A selected card is not in your hand.");
  return cards;
}

function remove(hand, ids) {
  const set = new Set(ids);
  return hand.filter(c => !set.has(c.id));
}

function finish(game, winner) {
  game.winner = winner;
  const nobodyElseOpened = game.players.filter(id => id !== winner).every(id => !game.opened[id]);
  const raw = {};
  const match = {};
  for (const id of game.players) {
    if (id === winner) continue;
    raw[id] = nobodyElseOpened ? 100 : game.hands[id].reduce((n, c) => n + cardPoints(c), 0);
    match[id] = Math.max(1, Math.floor(raw[id] / 10)) * (game.sprint ? 2 : 1);
  }
  game.scores = { raw, match, winner };
  game.phase = "finished";
}

export function rummyAction(game, playerId, action) {
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
    } else {
      if (!game.stock.length) {
        const top = game.discard.pop();
        game.stock = shuffle(game.discard.splice(0));
        game.discard = top ? [top] : [];
      }
      hand.push(game.stock.pop());
      game.drawnDiscard = null;
    }
    game.phase = "play";
  } else if (action.type === "meld") {
    if (game.phase !== "play") throw Error("Draw first.");
    const cards = take(hand, action.cardIds);
    const result = validateMeld(cards);
    if (!result.ok) throw Error(result.error);
    if (!game.opened[playerId]) {
      if (result.points < 44 && cards.length !== hand.length)
        throw Error("Your opening meld must total at least 44 points, unless it wins the game.");
      game.opened[playerId] = true;
    }
    if (game.drawnDiscard && cards.some(c => c.id === game.drawnDiscard)) game.drawnDiscard = null;
    game.hands[playerId] = remove(hand, action.cardIds);
    game.melds.push({ id: randomUUID(), owner: playerId, cards });
    if (!game.hands[playerId].length) finish(game, playerId);
  } else if (action.type === "add") {
    if (game.phase !== "play") throw Error("Draw first.");
    if (!game.opened[playerId]) throw Error("You must open before adding to any meld.");
    const meld = game.melds.find(m => m.id === action.meldId);
    if (!meld) throw Error("Meld not found.");
    const cards = take(hand, action.cardIds);
    const result = validateMeld([...meld.cards, ...cards]);
    if (!result.ok) throw Error(result.error);
    if (game.drawnDiscard && cards.some(c => c.id === game.drawnDiscard)) game.drawnDiscard = null;
    meld.cards.push(...cards);
    game.hands[playerId] = remove(hand, action.cardIds);
    if (!game.hands[playerId].length) finish(game, playerId);
  } else if (action.type === "discard") {
    if (game.phase !== "play") throw Error("Draw first.");
    const [card] = take(hand, [action.cardId]);
    if (game.drawnDiscard === card.id)
      throw Error("A card taken from the discard pile must be used immediately in a meld.");
    game.hands[playerId] = remove(hand, [card.id]);
    game.discard.push(card);
    if (!game.hands[playerId].length) finish(game, playerId);
    else {
      game.turn = (game.turn + 1) % game.players.length;
      game.phase = "draw";
      game.drawnDiscard = null;
    }
  } else throw Error("Unknown action.");
}

export function publicRummy(game, viewer) {
  return {
    ...game,
    stock: { count: game.stock.length },
    hands: Object.fromEntries(game.players.map(id => [id, id === viewer ? game.hands[id] : { count: game.hands[id].length }]))
  };
}

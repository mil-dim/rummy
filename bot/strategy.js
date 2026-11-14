import { rummyOptions } from './rummy.js';
const SUITS = ["♠", "♥", "♦", "♣"];
const TRICK_POWER = { A: 6, "10": 5, K: 4, Q: 3, J: 2, "9": 1 };
const TRICK_POINTS = { A: 11, "10": 10, K: 4, Q: 3, J: 2, "9": 0 };
const BLATO_POWER = Object.fromEntries(["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].map((rank, index) => [rank, index + 1]));

const choose = (items, random = Math.random) => items[Math.floor(random() * items.length)];
const ownSide = (game, playerId) => game.players.indexOf(playerId);

function backgammonRank(game, point, side) {
  return side === 0 ? point : game.variant === "gulbara" ? (point + 12) % 24 : 23 - point;
}

function backgammonPhysical(game, rank, side) {
  return side === 0 ? rank : game.variant === "gulbara" ? (rank + 12) % 24 : 23 - rank;
}

function scoreBackgammonMove(game, move, side) {
  const points = game.points.map(point => ({ ...point }));
  const bar = [...game.bar], borneOff = [...game.borneOff];
  const die = game.dice[move.dieIndex];
  const fromRank = move.from === "bar" ? 24 : backgammonRank(game, move.from, side);
  const destinationRank = fromRank - die;
  const to = destinationRank < 0 ? -1 : backgammonPhysical(game, destinationRank, side);

  if (move.from === "bar") bar[side]--;
  else if (--points[move.from].count === 0) {
    if (points[move.from].pinned !== undefined) {
      points[move.from].owner = points[move.from].pinned;
      points[move.from].count = 1;
      delete points[move.from].pinned;
    } else points[move.from].owner = null;
  }

  if (to < 0) borneOff[side]++;
  else {
    const target = points[to];
    if (target.owner !== null && target.owner !== side) {
      if (game.variant === "tapa") target.pinned = target.owner;
      else bar[1 - side]++;
      target.owner = side;
      target.count = 1;
    } else {
      target.owner = side;
      target.count++;
    }
  }

  const position = { ...game, points, bar, borneOff };
  return evaluateBackgammon(position, side);
}

export function evaluateBackgammon(game, side) {
  const other = 1 - side;
  const rank = (index, who = side) => backgammonRank(game, index, who);
  const owns = (index, who = side) => game.points[index].owner === who;
  const blocked = index => {
    const point = game.points[index];
    return point.owner === other && (game.variant === "gulbara" || point.count >= 2 || point.pinned !== undefined);
  };
  let score = game.borneOff[side] * 120 - game.bar[side] * 60 + game.bar[other] * 28;
  let chain = 0;
  for (let r = 0; r < 24; r++) {
    const index = backgammonPhysical(game, r, side), point = game.points[index];
    const mine = owns(index);
    const made = mine && (game.variant === "gulbara" || point.count >= 2);
    chain = made ? chain + 1 : 0;
    if (chain >= 2) score += 3 * Math.min(chain, 6);
    if (point.pinned === side) {
      score -= 70 + point.count * 3;
      if (r === 23) score -= 100000;
    }
    if (!mine) continue;
    score -= point.count * (r + 1) * 0.15;
    if (game.variant === "gulbara") {
      // Every occupied point blocks; spread into the opponent's remaining route.
      const opponentsBehind = game.points.reduce((sum, p, i) =>
        p.owner === other && rank(i, other) > rank(index, other) ? sum + p.count : sum, 0);
      score += 12 + Math.min(opponentsBehind, 8) * 2;
      score -= Math.max(0, point.count - 2) * 1.5;
      if (r > 0) {
        let exits = 0;
        for (let die = 1; die <= 6 && die <= r; die++)
          if (!blocked(backgammonPhysical(game, r - die, side))) exits++;
        score -= (6 - exits) * Math.min(point.count, 4) * 2;
        if (!exits && r >= 6) score -= point.count * 14;
      }
    } else if (game.variant === "tapa") {
      const opponentRank = rank(index, other);
      if (point.pinned === other) {
        score += 85 + Math.min(point.count - 1, 3) * 14;
        if (opponentRank === 23) score += 100000;
      }
      if (point.count >= 2) score += 9 + (opponentRank >= 18 ? 10 : 0);
      // Keep a defended mother checker and reinforce forward trapping positions.
      if (r === 23 && point.count === 1) score -= 35;
      if (point.count === 1 && point.pinned === undefined) score -= 4;
    } else {
      if (point.count >= 2) score += r < 6 ? 21 : 9;
      if (point.count === 1) {
        let threats = 0;
        for (let i = 0; i < 24; i++) if (owns(i, other)) {
          const distance = rank(i, other) - rank(index, other);
          if (distance > 0 && distance <= 6) threats++;
        }
        score -= 3 + threats * (r < 6 ? 7 : 11);
      }
    }
  }
  return score;
}

export function bearsOff(game, move, side) {
  return move.from !== "bar" && backgammonRank(game, move.from, side) - game.dice[move.dieIndex] < 0;
}

export function urgentBearOffMoves(game, side) {
  if (game.borneOff[side] !== 0 || game.borneOff[1 - side] < 1) return [];
  // In a home-board race, taking the first checker off saves the extra Mars point.
  // Restrict to server-authorized moves: compulsory dice use is preserved.
  const allHome = [0, 1].every(who => !game.bar[who] && game.points.every((point, index) =>
    point.owner !== who && point.pinned !== who || backgammonRank(game, index, who) < 6));
  return allHome ? (game.legalMoves || []).filter(move => bearsOff(game, move, side)) : [];
}

function backgammonAction(game, playerId, random) {
  const side = ownSide(game, playerId);
  if (side < 0 || game.winner) return null;
  const offer = game.resignationOffer;
  if (offer) return offer.side === side ? null : { type: "declineResignation" };
  if (game.phase === "opening" && game.openingRolls?.[side] == null) return { type: "roll" };
  if (game.players[game.turn] !== playerId) return null;
  if (game.phase === "roll") return { type: "roll" };
  if (game.phase !== "play" || !game.legalMoves?.length) return null;
  const urgent = urgentBearOffMoves(game, side);
  const scored = (urgent.length ? urgent : game.legalMoves).map(move => ({ move, score: scoreBackgammonMove(game, move, side) }))
    .sort((a, b) => b.score - a.score);
  const nearBest = scored.filter(item => item.score >= scored[0].score - 2.5).slice(0, 3);
  const selected = choose(nearBest, random).move;
  return { type: "move", from: selected.from, dieIndex: selected.dieIndex };
}

function cardBeats(card, other, trump, power) {
  if (card.suit === other.suit) return power[card.rank] > power[other.rank];
  return card.suit === trump && other.suit !== trump;
}

function santaseAction(game, playerId, random) {
  const side = ownSide(game, playerId);
  if (side < 0 || game.finished || game.players[game.turn] !== playerId) return null;
  const hand = game.hands?.[side];
  if (!Array.isArray(hand)) return null;
  if (!game.trick?.length && game.cardPoints[side] + game.marriagePoints[side] >= 66)
    return { type: "claim66" };
  if (game.canExchange) return { type: "exchangeTrump" };
  const legal = hand.filter(card => game.legalCardIds?.includes(card.id));
  if (!legal.length) return null;

  if (!game.trick.length) {
    const marriages = legal.filter(card => ["K", "Q"].includes(card.rank)
      && game.tricksWon[side] > 0
      && hand.some(other => other.suit === card.suit && other.rank === (card.rank === "K" ? "Q" : "K")));
    if (marriages.length) {
      const trumpMarriage = marriages.filter(card => card.suit === game.trumpSuit);
      const card = choose(trumpMarriage.length ? trumpMarriage : marriages, random);
      return { type: "play", cardId: card.id, announce: true };
    }
  }

  const lead = game.trick[0]?.card;
  let candidates = legal;
  if (lead) {
    const winners = legal.filter(card => cardBeats(card, lead, game.trumpSuit, TRICK_POWER));
    if (winners.length) candidates = winners;
  }
  candidates = [...candidates].sort((a, b) => TRICK_POINTS[a.rank] - TRICK_POINTS[b.rank]
    || TRICK_POWER[a.rank] - TRICK_POWER[b.rank]);
  const best = candidates.slice(0, Math.min(2, candidates.length));
  return { type: "play", cardId: choose(best, random).id };
}

function currentBlatoWinner(game) {
  let winner = game.trick[0];
  for (const item of game.trick.slice(1)) {
    if (item.card.suit === game.contract && winner.card.suit !== game.contract) winner = item;
    else if (item.card.suit === winner.card.suit && BLATO_POWER[item.card.rank] > BLATO_POWER[winner.card.rank]) winner = item;
  }
  return winner;
}

function blatoAction(game, playerId, random) {
  const side = ownSide(game, playerId);
  if (side < 0 || game.finished) return null;
  if (game.canCut) return { type: "cut" };
  if (game.players[game.turn] !== playerId) return null;
  if (game.canDeclareTrump) return { type: "declareTrump", suit: choose(SUITS, random) };
  const hand = game.hands?.[side];
  if (!Array.isArray(hand)) return null;
  if (game.canPull) {
    const maximum = game.exchangeQueue?.[0]?.maxCount || 0;
    const eligible = hand.filter(card => game.pullEligibleCardIds?.includes(card.id))
      .sort((a, b) => BLATO_POWER[a.rank] - BLATO_POWER[b.rank]);
    return { type: "pull", cardIds: eligible.slice(0, maximum).map(card => card.id) };
  }
  if (game.canDiscardKitty) {
    const ordered = [...hand].sort((a, b) => Number(a.suit === game.contract) - Number(b.suit === game.contract)
      || BLATO_POWER[a.rank] - BLATO_POWER[b.rank]);
    return { type: "discardKitty", cardIds: ordered.slice(0, 4).map(card => card.id) };
  }
  const legal = hand.filter(card => game.legalCardIds?.includes(card.id));
  if (!legal.length) return null;
  let candidates = legal;
  if (game.trick.length) {
    const current = currentBlatoWinner(game).card;
    const winners = legal.filter(card => cardBeats(card, current, game.contract, BLATO_POWER));
    if (winners.length) candidates = winners;
  }
  candidates = [...candidates].sort((a, b) => BLATO_POWER[a.rank] - BLATO_POWER[b.rank]);
  return { type: "play", cardId: choose(candidates.slice(0, Math.min(2, candidates.length)), random).id };
}

export function chooseAction(room, playerId, random = Math.random) {
  const game = room?.game;
  if (!game || room.role !== "player") return null;
  if (game.kind === "backgammon") return backgammonAction(game, playerId, random);
  if (game.kind === "santase") return santaseAction(game, playerId, random);
  if (game.kind === "blato") return blatoAction(game, playerId, random);
  if (game.kind === "rummy") return rummyOptions(game, playerId)[0]?.action || null;
  return null;
}

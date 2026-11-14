import { chooseAction, urgentBearOffMoves } from './strategy.js';
import { rummyDecision } from './rummy.js';

const integer = (value, fallback, min, max) => Number.isFinite(Number(value)) && value !== '' && value !== undefined
  ? Math.max(min, Math.min(max, Math.floor(Number(value)))) : fallback;

// Explicit projection: never send room names, identities, accounts, hands or logs.
export function decisionInput(room, playerId) {
  const g = room?.game, side = g?.players?.indexOf(playerId);
  if (room?.role !== 'player' || g?.kind !== 'backgammon' || side < 0 || g.turn !== side
      || g.phase !== 'play' || g.winner || g.resignationOffer) return null;
  const unique = new Map();
  for (const move of g.legalMoves || []) {
    const die = g.dice[move.dieIndex];
    if (!Number.isInteger(move.dieIndex) || !Number.isInteger(die)
        || !(move.from === 'bar' || Number.isInteger(move.from) && move.from >= 0 && move.from < 24)) continue;
    const key = `${move.from}:${die}`;
    if (!unique.has(key)) unique.set(key, { type: 'move', from: move.from, dieIndex: move.dieIndex });
  }
  const actions = [...unique.values()];
  return {
    actions,
    state: {
      variant: g.variant, side,
      points: g.points.map(p => ({ owner: p.owner, count: p.count, ...(p.pinned === undefined ? {} : { pinned: p.pinned }) })),
      bar: [...g.bar], borneOff: [...g.borneOff], dice: [...g.dice], used: [...g.used],
      candidates: actions.map((a, candidateId) => ({ candidateId, from: a.from, die: g.dice[a.dieIndex] }))
    }
  };
}

const instructions = `Choose the strongest legal Backgammon move from the numbered candidates. Return only candidateId.
Points use zero-based physical indices. Side 0 moves downward toward index 0. In normal and tapa, side 1 moves upward toward 23. In gulbara both move downward around the board: side 1 starts at 11 and its rank is (index+12)%24. A side can bear off only from its home ranks 0..5. Legal candidates already enforce compulsory dice use; consider the remaining dice when choosing.
Normal: build two-checker points, especially at home; form connected blocks, hit when safe, escape back checkers, avoid vulnerable singles. During a pure race prioritize efficient bearing off.
Gulbara: one checker blocks, no hits. Occupy more points in the opponent's remaining path, maintain escape routes and avoid trapped stacks. Doubles may ascend and transfer; prioritize mobility.
Tapa: pin opposing singles and reinforce pins near the opponent's start; don't release valuable pins casually. Protect your last starting checker: its capture loses Mars. Two checkers block. Pinned pieces cannot move.
Use only the supplied public board. You have no future dice. No explanation is required.`;

const rummyInstructions = `You play Bulgarian Rummy (Joker). Choose the best numbered candidate and return only candidateId. The candidates have been checked by code; do not invent moves.
Two decks and two jokers, 13 starting cards. Sets require 3-4 distinct suits of one rank; runs require 3+ consecutive suited cards. Ace is low in A-2-3 or high in Q-K-A, never K-A-2. First meld batch requires 44 points unless leaving at most one card to discard and win. Jokers have exact declared identities and count 25 for opening. Faces/Ace are 10 except low Ace=1. Add to public melds only after opening. Replacing a joker requires having opened on a previous turn. Draw once then lay cards and discard; one remaining card may be discarded to win. An unopened discard pickup commits to opening this turn.
Prefer going out, reducing deadwood, using jokers productively, combining disjoint melds to open and preserving useful pairs/sequences. Consider public melds before giving opponents useful discards. Stock order and opponent hands are unknown. Names and IDs are omitted; refs only label this request. No explanation is needed.`;

export function createAiChooser({ env = process.env, fetchImpl = globalThis.fetch, log = value => console.log(JSON.stringify(value)), now = Date.now } = {}) {
  const engine = env.BOT_ENGINE || 'heuristic';
  const provider = env.BOT_AI_PROVIDER || 'openai';
  const model = env.BOT_AI_MODEL || (provider === 'ollama' ? 'qwen3:8b' : 'gpt-6-luna');
  const enabled = engine === 'hybrid' && (provider === 'ollama' || Boolean(env.OPENAI_API_KEY));
  const dailyLimit = integer(env.BOT_AI_MAX_REQUESTS_PER_DAY, 200, 0, 100000);
  const timeout = integer(env.BOT_AI_TIMEOUT_MS, 8000, 100, 60000);
  const maxOutput = integer(env.BOT_AI_MAX_OUTPUT_TOKENS, 256, 32, 4096);
  let day = '', requests = 0, busy = false, cooldownUntil = 0;
  const totals = { inputTokens: 0, outputTokens: 0 };
  log({ event: 'bot_ai_config', engine, provider, model, enabled, dailyLimit, timeout });

  return async function choose(room, playerId) {
    const fallback = chooseAction(room, playerId);
    const game = room?.game, side = game?.players?.indexOf(playerId);
    if (game?.kind === 'backgammon' && room.role === 'player' && side >= 0
        && game.turn === side && game.phase === 'play' && !game.winner && !game.resignationOffer
        && urgentBearOffMoves(game, side).length) {
      log({ event: 'bot_tactical_move', reason: 'save_mars', from: fallback.from, dieIndex: fallback.dieIndex });
      return fallback;
    }
    const decision = enabled && (game?.kind === 'rummy' ? rummyDecision(room, playerId) : decisionInput(room, playerId));
    if (!decision || decision.actions.length < 2 || busy || now() < cooldownUntil) return fallback;
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) { day = today; requests = 0; }
    if (requests >= dailyLimit) return fallback;
    requests++; busy = true;
    const started = now();
    const schema = { type: 'object', properties: { candidateId: { type: 'integer', enum: decision.actions.map((_, i) => i) } }, required: ['candidateId'], additionalProperties: false };
    try {
      const openai = provider === 'openai';
      if (!openai && provider !== 'ollama') throw Error('provider');
      const body = openai ? {
        model, store: false, instructions: game.kind === 'rummy' ? rummyInstructions : instructions, input: JSON.stringify(decision.state),
        reasoning: { effort: 'none' }, max_output_tokens: maxOutput,
        text: { format: { type: 'json_schema', name: 'move_choice', strict: true, schema } }
      } : {
        model, stream: false, think: false, format: schema,
        messages: [{ role: 'system', content: game.kind === 'rummy' ? rummyInstructions : instructions }, { role: 'user', content: JSON.stringify(decision.state) }],
        options: { temperature: 0, num_predict: maxOutput }
      };
      const endpoint = openai ? 'https://api.openai.com/v1/responses'
        : `${String(env.OLLAMA_URL || 'http://host.docker.internal:11434').replace(/\/$/, '')}/api/chat`;
      const response = await fetchImpl(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(openai ? { Authorization: `Bearer ${env.OPENAI_API_KEY}` } : {}) },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeout), redirect: 'error'
      });
      if (!response.ok) throw Error(`http_${response.status}`);
      const data = await response.json();
      const usage = openai ? data.usage || {} : { input_tokens: data.prompt_eval_count, output_tokens: data.eval_count };
      const inputTokens = Number(usage.input_tokens) || 0, outputTokens = Number(usage.output_tokens) || 0;
      totals.inputTokens += inputTokens; totals.outputTokens += outputTokens;
      log({ event: 'bot_ai_usage', provider, model, requestsToday: requests, inputTokens, outputTokens,
        totalInputTokens: totals.inputTokens, totalOutputTokens: totals.outputTokens, durationMs: now() - started });
      if (openai && data.status !== 'completed') throw Error('incomplete');
      const text = openai ? (data.output || []).filter(item => item.type === 'message')
        .flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('') : data.message?.content;
      const selected = JSON.parse(text);
      if (!Number.isInteger(selected.candidateId) || !decision.actions[selected.candidateId]) throw Error('invalid_choice');
      return decision.actions[selected.candidateId];
    } catch (error) {
      // Never log provider bodies, keys, prompts or arbitrary exception strings.
      const reason = /^http_\d{3}$/.test(error.message) ? error.message
        : ['incomplete', 'invalid_choice', 'provider'].includes(error.message) ? error.message : 'request_failed';
      cooldownUntil = now() + 60000;
      log({ event: 'bot_ai_fallback', reason, durationMs: now() - started });
      return fallback;
    } finally { busy = false; }
  };
}

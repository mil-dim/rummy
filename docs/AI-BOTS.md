# Optional AI decisions

The separate bot container supports `BOT_ENGINE=hybrid`.
AI chooses legal checker moves in Normal, Gulbara and Tapa, or validated Rummy
meld batches, public-meld additions, draw choices and discards. Santase and
Blato, rolls, forced decisions and failures use the local strategy.
There is no claim that AI plays better; compare on QA first.

Add to the environment directory's private `.env`:

```dotenv
BOT_ENGINE=hybrid
BOT_AI_PROVIDER=openai
BOT_AI_MODEL=gpt-6-luna
OPENAI_API_KEY=your-private-project-key
BOT_AI_MAX_REQUESTS_PER_DAY=200
BOT_AI_TIMEOUT_MS=8000
BOT_AI_MAX_OUTPUT_TOKENS=256
```

The key needs Responses write access. It is passed only to the bot service.
The request uses the Responses API with a strict candidate ID schema,
`store:false` and `reasoning.effort:none` to keep output short and cost bounded
per response. Model access/billing must be enabled on the operator's account.
No live API call is made by the test suite; tests use mocked responses.

The provider sees a projection of the public board, colors, variant, dice
and candidates. In Rummy it receives the bot's own hand, public melds and recent
discards, stock count and opponents' hand counts/opening status. Opponent cards,
stock order, internal card/player IDs, player/room names, account information,
chat and future dice are excluded. `store:false` does not override the provider's
separate API retention policies.

One request is allowed in flight across all bots in this process. Others use
local strategy immediately. The shared daily limit counts attempts, including
failures, and resets at midnight UTC **or when the container restarts**. It is
not a persistent billing ceiling. Set provider billing controls too. Any API
failure starts a 60-second cooldown. Requests are not automatically retried.
Changed game states invalidate pending AI decisions before submission.

Logs contain model, request count, token counts and latency, never prompts or
keys. `bot_ai_config` shows whether AI is enabled; `bot_ai_usage` records actual
responses; `bot_ai_fallback` records failures. Token totals reset at restart.

After syncing the new `bot/`, `lib/rummy.js` and `compose.yaml` into QA, and after bot games
finish, recreate only the companion:

```sh
docker compose up -d --no-deps --build bot
docker compose logs --tail=100 bot
```

Restarting bots loses their current in-memory session identities. The game
server need not be recreated for the AI provider changes. To disable paid
calls, set `BOT_ENGINE=heuristic` and recreate the bot.

## Rummy candidate generation

Local play and AI share the same candidates, checked with the server's pure
meld validator copied into the bot image at build time. The copy contains rules,
not server state. Search is bounded (180 meld candidates, 20,000 batch search
nodes, up to 12 plans), so it is not exhaustive in unusually large hands.
It supports exact joker declarations, low/high Ace runs without wrapping,
distinct suits in sets, disjoint opening batches, below-44 going out, useful
discard pickups, table additions and exact joker replacement after an earlier
opening. The local fallback ranks these options and preserves jokers.
AI selects an existing candidate ID; it cannot create an arbitrary action.

## Private Ollama alternative

Set `BOT_AI_PROVIDER=ollama`, `BOT_AI_MODEL=qwen3:8b` (or your installed model)
and `OLLAMA_URL=http://your-private-host:11434`. The URL must be reachable from
inside the bot container, ideally through a VPN/private network. No automatic
public Ollama port is published. Use a private address rather than container
localhost; `host.docker.internal` requires host mapping on Linux if used.
OpenAI is not contacted in this mode. Ollama uses the same validated candidate
schema, timeout and request controls.

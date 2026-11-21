# discord-gateway-bot-cloudflare-workers

A Discord gateway bot running 24/7 in a Cloudflare Container, without keeping its Durable Object awake.

- `containers/gateway/gateway.ts`: the bot (`@discordjs/ws` + `@discordjs/rest`). Posts member join/leave and ban/kick/timeout logs.
- `src/gateway-container.ts`: the Durable Object that owns the container through `ctx.container`, and the `WorkerEntrypoint` the container calls to ask for a restart.
- `src/index.ts`: hourly cron that calls `start()`.

## How it stays up

- `setInactivityTimeout(5.5h)` keeps the container running after the Durable Object goes to sleep (the max is 6h).
- The hourly cron wakes the Durable Object. Its constructor re-arms the timeout if the container is running, and `start()` boots a container if there isn't one.
- On `SIGTERM` or `uncaughtException` the container POSTs `http://gateway.internal/restart`. `interceptOutboundHttp` routes that to `GatewayRestart`, which sets an alarm. The alarm waits for the container to exit (`monitor()`) and starts a new one.

## Setup

1. Fill in `vars` in `wrangler.jsonc` (server ID, welcome channel ID, mod log channel ID).
2. Put the bot token in a [Secrets Store](https://developers.cloudflare.com/secrets-store/) secret named `DISCORD_BOT_TOKEN` and set `store_id` in `wrangler.jsonc`.
3. Enable the Server Members intent for the bot in the Discord developer portal.
4. `npm run deploy` (Docker must be running to build the image).

The container starts on the first cron tick after the deploy.

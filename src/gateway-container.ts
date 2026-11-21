import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'

const INACTIVITY_TIMEOUT_MS = 5.5 * 60 * 60 * 1000

export class GatewayContainer extends DurableObject<Env> {
  constructor (ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    if (ctx.container!.running) {
      ctx.blockConcurrencyWhile(async () => {
        await ctx.container!.setInactivityTimeout(INACTIVITY_TIMEOUT_MS)
      })
    }
  }

  async start () {
    const container = this.ctx.container!

    if (container.running) {
      return
    }

    const token = await this.env.DISCORD_BOT_TOKEN.get()

    container.start({
      enableInternet: true,
      env: {
        DISCORD_BOT_TOKEN: token,
        DISCORD_SERVER_ID: this.env.DISCORD_SERVER_ID,
        DISCORD_WELCOME_CHANNEL_ID: this.env.DISCORD_WELCOME_CHANNEL_ID,
        DISCORD_MOD_LOG_CHANNEL_ID: this.env.DISCORD_MOD_LOG_CHANNEL_ID,
        DISCORD_DEFAULT_COLOR: this.env.DISCORD_DEFAULT_COLOR
      }
    })

    await container.interceptOutboundHttp('gateway.internal', this.ctx.exports.GatewayRestart({ props: {} }))
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS)
  }

  async restart () {
    await this.ctx.storage.setAlarm(Date.now())
  }

  async alarm () {
    if (this.ctx.container!.running) {
      await this.ctx.container!.monitor()
    }

    await this.start()
  }
}

export class GatewayRestart extends WorkerEntrypoint<Env> {
  async fetch () {
    await this.env.GATEWAY.getByName('gateway').restart()

    return new Response(null, { status: 204 })
  }
}

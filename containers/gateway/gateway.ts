import { REST } from '@discordjs/rest'
import { WebSocketManager, WebSocketShardEvents } from '@discordjs/ws'
import {
  type APIUser,
  AuditLogEvent,
  GatewayDispatchEvents,
  type GatewayDispatchPayload,
  type GatewayGuildAuditLogEntryCreateDispatchData,
  GatewayIntentBits,
  type RESTPostAPIChannelMessageJSONBody,
  Routes
} from 'discord-api-types/v10'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_SERVER_ID = process.env.DISCORD_SERVER_ID!
const DISCORD_WELCOME_CHANNEL_ID = process.env.DISCORD_WELCOME_CHANNEL_ID!
const DISCORD_MOD_LOG_CHANNEL_ID = process.env.DISCORD_MOD_LOG_CHANNEL_ID!
const DISCORD_DEFAULT_COLOR = Number.parseInt(process.env.DISCORD_DEFAULT_COLOR!.slice(1), 16)

const RESTART_URL = 'http://gateway.internal/restart'

const rest = new REST().setToken(DISCORD_BOT_TOKEN)
const gateway = new WebSocketManager({
  token: DISCORD_BOT_TOKEN,
  intents: GatewayIntentBits.GuildMembers | GatewayIntentBits.GuildModeration,
  rest
})

function avatar (user: APIUser) {
  if (user.avatar !== null) {
    return rest.cdn.avatar(user.id, user.avatar)
  }

  // https://discord.com/developers/docs/reference#image-formatting-cdn-endpoints
  const index = user.discriminator === '0'
    ? Number((BigInt(user.id) >> 22n) % 6n)
    : Number(user.discriminator) % 5

  return rest.cdn.defaultAvatar(index)
}

function time (ms: number) {
  const seconds = Math.floor(ms / 1000)

  return `<t:${seconds}> (<t:${seconds}:R>)`
}

async function modLog (entry: GatewayGuildAuditLogEntryCreateDispatchData, action: string, until?: string) {
  const lines = [
    `**User:** <@${entry.target_id}> (${entry.target_id})`,
    `**Action:** ${action}`,
    `**Staff:** <@${entry.user_id}>`
  ]

  if (entry.reason) {
    lines.push(`**Reason:** ||${entry.reason}||`)
  }

  if (until !== undefined) {
    const seconds = Math.floor(Date.parse(until) / 1000)

    lines.push(`**Until:** <t:${seconds}:F>`)
  }

  await rest.post(Routes.channelMessages(DISCORD_MOD_LOG_CHANNEL_ID), {
    body: {
      embeds: [{
        color: DISCORD_DEFAULT_COLOR,
        description: lines.join('\n')
      }]
    } satisfies RESTPostAPIChannelMessageJSONBody
  })
}

async function dispatch (payload: GatewayDispatchPayload) {
  switch (payload.t) {
    case GatewayDispatchEvents.GuildMemberAdd: {
      if (payload.d.guild_id === DISCORD_SERVER_ID) {
        const { user } = payload.d

        await rest.post(Routes.channelMessages(DISCORD_WELCOME_CHANNEL_ID), {
          body: {
            embeds: [{
              color: DISCORD_DEFAULT_COLOR,
              author: { name: user.username, icon_url: avatar(user) },
              description: [
                `<@${user.id}> (${user.username}) joined the server!`,
                `• Joined: ${time(Date.parse(payload.d.joined_at!))}`
              ].join('\n'),
              footer: { text: 'User joined' }
            }]
          } satisfies RESTPostAPIChannelMessageJSONBody
        })
      }

      break
    }
    case GatewayDispatchEvents.GuildMemberRemove: {
      if (payload.d.guild_id === DISCORD_SERVER_ID) {
        const { user } = payload.d

        await rest.post(Routes.channelMessages(DISCORD_WELCOME_CHANNEL_ID), {
          body: {
            embeds: [{
              color: DISCORD_DEFAULT_COLOR,
              author: { name: user.username, icon_url: avatar(user) },
              description: [
                `<@${user.id}> (${user.username}) has left the server!`,
                `• Left: ${time(Date.now())}`
              ].join('\n'),
              footer: { text: 'User left' }
            }]
          } satisfies RESTPostAPIChannelMessageJSONBody
        })
      }

      break
    }
    case GatewayDispatchEvents.GuildAuditLogEntryCreate: {
      if (payload.d.guild_id !== DISCORD_SERVER_ID) {
        break
      }

      switch (payload.d.action_type) {
        case AuditLogEvent.MemberBanAdd:
          await modLog(payload.d, 'Ban')
          break
        case AuditLogEvent.MemberBanRemove:
          await modLog(payload.d, 'Unban')
          break
        case AuditLogEvent.MemberKick:
          await modLog(payload.d, 'Kick')
          break
        case AuditLogEvent.MemberUpdate: {
          const timeout = payload.d.changes?.find((change) => change.key === 'communication_disabled_until')

          if (timeout === undefined) {
            break
          }

          if (timeout.new_value === undefined) {
            await modLog(payload.d, 'Unmute')
          } else {
            await modLog(payload.d, 'Mute', timeout.new_value)
          }

          break
        }
      }

      break
    }
  }
}

function restart (code: number) {
  fetch(RESTART_URL, { method: 'POST', signal: AbortSignal.timeout(10_000) })
    .catch(console.error)
    .finally(() => process.exit(code))
}

gateway.on(WebSocketShardEvents.Dispatch, (payload) => {
  dispatch(payload).catch(console.error)
})

gateway.on(WebSocketShardEvents.Error, (error) => {
  console.error(error)
  process.exit(1)
})

// The runtime never wakes the Durable Object when its container stops, so the container asks for its own
// replacement on the way out. Node also runs as PID 1, which ignores SIGTERM without a handler.
process.on('SIGTERM', () => restart(0))

process.on('uncaughtException', (error) => {
  console.error(error)
  restart(1)
})

await gateway.connect()

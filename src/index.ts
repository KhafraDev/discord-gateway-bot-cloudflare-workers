export default {
  async scheduled (_controller, env) {
    await env.GATEWAY.getByName('gateway').start()
  }
} satisfies ExportedHandler<Env>

export { GatewayContainer, GatewayRestart } from './gateway-container'

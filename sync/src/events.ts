export type SyncEvent =
  { type: 'tasks'; sequence: number } | { type: 'collections'; version: number }

interface Subscription {
  expiresAt: number
}

export class SyncEvents {
  constructor(private readonly state: DurableObjectState) {
    state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    )
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      const event = await request.text()
      for (const socket of this.state.getWebSockets()) {
        const { expiresAt } = socket.deserializeAttachment() as Subscription
        try {
          if (expiresAt <= Date.now()) socket.close(4001, 'Session expired')
          else socket.send(event)
        } catch {
          // A closing socket will reconnect and catch up from D1.
        }
      }
      return new Response(null, { status: 204 })
    }

    if (this.state.getWebSockets().length >= 32)
      return new Response('Too many subscriptions', { status: 429 })

    const [client, server] = Object.values(new WebSocketPair())
    const account = request.headers.get('X-Famo-Sync-Account')!
    const expiresAt = Number(request.headers.get('X-Famo-Session-Expiry'))
    if (expiresAt <= Date.now())
      return new Response('Session expired', { status: 403 })

    this.state.acceptWebSocket(server)
    server.serializeAttachment({ expiresAt } satisfies Subscription)
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'X-Famo-Sync-Account': account },
    })
  }
}

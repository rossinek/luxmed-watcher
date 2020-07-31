declare module 'pushover-notifications' {
  export interface PushoverClientOptions {
    user: string,
    token: string,
  }

  export interface PushoverMessage {
    message?: string
    title?: string
    sound?: string
    device: string
    priority?: number
    url?: string
    url_title?: string
  }

  class PushoverClient {
    constructor (options: PushoverClientOptions)
    send: (message: PushoverMessage, callback?: (error: any, result: any) => any) => void
  }

  export default PushoverClient
}

import NotificationCenter from 'node-notifier/notifiers/notificationcenter'
import notifier from 'node-notifier'
import path from 'path'
import PushoverClient from 'pushover-notifications'

let pushoverClient: PushoverClient | null = null

if (process.env.PUSHOVER_USER && process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_DEVICE) {
  pushoverClient = new PushoverClient({
    user: process.env.PUSHOVER_USER,
    token: process.env.PUSHOVER_TOKEN
  })
}

export const notify = ({ important, url, ...config }: NotificationCenter.Notification & { important?: boolean, url?: string }) => {
  return new Promise<boolean>(resolve => {
    const title = 'LUX MED Watcher' + (process.env.TITLE ? ` (${process.env.TITLE})` : '')
    notifier.notify({
      ...config,
      title,
      icon: path.join(__dirname, '../assets/luxlogo.png'),
      wait: true,
      timeout: important ? 60 * 5 : 10,
    }, (error, response) => {
      resolve(response === 'activate')
    })

    if (pushoverClient && important) {
      pushoverClient.send({
        title,
        message: config.message,
        sound: config.sound ? 'magic' : undefined,
        device: process.env.PUSHOVER_DEVICE!,
        url,
      })
    }
  })
}

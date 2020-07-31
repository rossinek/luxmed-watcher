import puppeteer, { Browser } from 'puppeteer'
import dotenv from 'dotenv'
import notifier from 'node-notifier'
import path from 'path'
import PushoverClient from 'pushover-notifications'
import 'promise-any-polyfill'
import NotificationCenter from 'node-notifier/notifiers/notificationcenter'

dotenv.config()

let pushoverClient: PushoverClient | null = null

if (process.env.PUSHOVER_USER && process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_DEVICE) {
  pushoverClient = new PushoverClient({
    user: process.env.PUSHOVER_USER,
    token: process.env.PUSHOVER_TOKEN
  })
}

const delay = async (ms: number) => await new Promise(resolve => setTimeout(resolve, ms))

const validateEnv = () => {
  if (!process.env.LOGIN || !process.env.PASSWORD) {
    console.error('LOGIN or PASSWORD is missing')
    process.exit()
  }
  if (!process.env.REFERRAL_ID) {
    console.error('REFERRAL_ID is missing')
    process.exit()
  }
}

const notify = ({ important, url, ...config }: NotificationCenter.Notification & { important?: boolean, url?: string }) => {
  return new Promise<boolean>(resolve => {
    const title = 'LUX MED Watcher' + (process.env.REFERRAL_TYPE ? ` (${process.env.REFERRAL_TYPE})` : '')
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

const withOptionalRetries = async (action: () => Promise<any>) => {
  while (true) {
    try {
      const result = await action()
      return result
    } catch (error) {
      console.error(error)
      const shouldRetry = await notify({
        message: 'Coś poszło nie tak',
        actions: 'Powtórz',
      })
      if (!shouldRetry) {
        throw error
      }
    }
  }
}

const reservationSearch = async (browser: Browser) => {
  const page = await browser.newPage()

  // LOGIN
  await page.goto('https://rezerwacja.luxmed.pl/start')
  const loginInput = await page.waitForSelector('input[name=Login]')
  await loginInput.type(process.env.LOGIN!)
  const passwordInput = await page.waitForSelector('input[name=Password]')
  await passwordInput.type(process.env.PASSWORD!)
  const submitButton = await page.waitForSelector('button[type=submit]')
  await submitButton.click()

  // GO TO REFERRALS
  const referralsAnchor = await page.waitForSelector('a[href$="/PatientPortal/Reservations/Referrals"]')
  await referralsAnchor.click()

  // GO TO RESERVATION SEARCH
  const referralsReservationAnchor = await page.waitForSelector(`.actions a[href*="referralId=${process.env.REFERRAL_ID}"]`)
  await referralsReservationAnchor.click()

  await delay(2000)

  await page.reload()

  // PERFORM SEARCH
  await page.waitForSelector('input[placeholder*="wpisz miasto"]')
  await delay(1000)
  const citySelect = await page.waitForSelector('input[placeholder*="wpisz miasto"]')
  citySelect.click()

  await page.waitForSelector('.dropdown-select-item')
  await page.evaluate(() => {
    document.querySelectorAll('.dropdown-select-item').forEach(node => node.textContent === 'Wrocław' && (node as HTMLElement).click())
  })

  await delay(2000)

  const searchButton = await page.waitForSelector('.btn-search[type=submit]')
  await searchButton.click()

  await delay(2000)

  let reject = (error: any): Promise<any> => Promise.reject(error)
  const hasResults = await Promise.any([
    page.waitForSelector('.no-terms-message').then(() => false).catch((error) => reject(error)),
    page.waitForSelector('.term-item').then(() => true).catch((error) => reject(error)),
  ])
  // suppress further errors
  reject = () => Promise.resolve()

  if (hasResults) {
    // RETURN LIST OF DOCTORS NAMES
    const names = await page.evaluate(() => {
      return Array.from(new Set(Array.from(document.querySelectorAll('.doctor')).map(n => n.textContent)))
    })
    return names
  }
  return false
}

const main = async () => {
  validateEnv()

  let shouldShowResults = !process.env.HEADLESS

  if (process.env.HEADLESS) {
    const doctorsList = await withOptionalRetries(async () => {
      const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ['--window-size=1920,1080'],
      })
      const result = await reservationSearch(browser)
      await browser.close()
      return result
    })
    const hasResults = !!doctorsList

    const message = hasResults
      ? (doctorsList.length ? `Są terminy do ${doctorsList.slice(0, 3).join(', ')}${doctorsList.length > 3 ? ', ...' : ''}` : 'Są terminy!')
      : 'Brak dostępnych terminów'

    shouldShowResults = await notify({
      important: hasResults,
      message,
      sound: hasResults,
      actions: 'Pokaż',
    })
  }

  if (shouldShowResults) {
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
    })
    try {
      const doctorsList = await withOptionalRetries(() => reservationSearch(browser))
      console.log('> results', doctorsList && doctorsList.join(', '))
    } catch (error) {
      console.error(error)
    }
  }
}

main()

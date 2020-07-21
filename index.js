const puppeteer = require('puppeteer')
const dotenv = require('dotenv')
const notifier = require('node-notifier')
const path = require('path')
dotenv.config()

const notify = (config) => new Promise(resolve => {
  const title = 'LuxMed Watcher' + (process.env.REFERRAL_TYPE ? ` (${process.env.REFERRAL_TYPE})` : '')
  notifier.notify({
    ...config,
    title,
    icon: path.join(__dirname, 'luxlogo.png'),
    wait: true,
    timeout: 60,
  }, (error, response) => {
    resolve(response === 'activate')
  })
})

const withOptionalRetries = async (action) => {
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
        process.exit()
      }
    }
  }
}

const reservationSearch = async (browser) => {
  const page = await browser.newPage()

  // MINIMIZE
  // const session = await page.target().createCDPSession()
  // const { windowId } = await session.send('Browser.getWindowForTarget')
  // await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } })

  // LOGIN
  await page.goto('https://rezerwacja.luxmed.pl/start')
  const loginInput = await page.waitForSelector('input[name=Login]')
  await loginInput.type(process.env.LOGIN)
  const passwordInput = await page.waitForSelector('input[name=Password]')
  await passwordInput.type(process.env.PASSWORD)
  const submitButton = await page.waitForSelector('button[type=submit]')
  await submitButton.click()

  // REFERRALS
  const referralsAnchor = await page.waitForSelector('a[href$="/PatientPortal/Reservations/Referrals"]')
  await referralsAnchor.click()

  const referralsReservationAnchor = await page.waitForSelector(`.actions a[href*="referralId=${process.env.REFERRAL_ID}"]`)
  await referralsReservationAnchor.click()

  // SEARCH
  await page.waitForSelector('#reservationSearchSubmitButton')
  await new Promise(resolve => setTimeout(resolve, 1000))
  const searchButton = await page.waitForSelector('#reservationSearchSubmitButton')
  await searchButton.click()

  const resultsBox = await page.waitForSelector('.resultsForService')
  const textContent = await page.evaluate(resultsBox => resultsBox.textContent, resultsBox);

  return !textContent.includes('Brak dostępnych terminów')
}

;(async () => {
  let shouldShowResults = !process.env.HEADLESS

  if (process.env.HEADLESS) {
    const hasResults = await withOptionalRetries(async () => {
      const browser = await puppeteer.launch({ headless: true })
      const result = await reservationSearch(browser)
      await browser.close()
      return result
    })

    shouldShowResults = await notify({
      message: hasResults ? 'Są terminy!' : 'Brak dostępnych terminów',
      sound: hasResults,
      actions: 'Pokaż',
    })
  }

  if (shouldShowResults) {
    const browser = await puppeteer.launch({ headless: false })
    await withOptionalRetries(() => reservationSearch(browser))
  }
})()

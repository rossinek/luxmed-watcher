const puppeteer = require('puppeteer')
const dotenv = require('dotenv')
const notifier = require('node-notifier')
const path = require('path')
dotenv.config()

const notify = (config) => new Promise(resolve => {
  notifier.notify(config, (error, response) => {
    resolve(response === 'activate')
  })
})

const reservationSearch = async ({ headless = false } = {}) => {
  const browser = await puppeteer.launch({ headless })
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

  return {
    result: !textContent.includes('Brak dostępnych terminów'),
    browser,
  }
}

;(async () => {
  let result
  let done = false
  let tries = 3
  while (!done) {
    try {
      const searchData = await reservationSearch({ headless: true })
      await searchData.browser.close()
      result = searchData.result
      done = true
    } catch (error) {
      console.error(error)
      if (--tries) {
        const shouldRetry = await notify({
          title: "LuxMed Watcher",
          message: "Coś poszło nie tak",
          actions: 'Powtórz',
          icon: path.join(__dirname, 'luxlogo.png'),
          wait: true,
        })
        if (!shouldRetry) {
          process.exit()
        }
      }
    }
  }

  const message = result ? 'Prawdopodobnie są jakieś terminy' : 'Brak dostępnych terminów'

  const shouldShow = await notify({
    title: "LuxMed Watcher",
    message,
    actions: 'Pokaż',
    icon: path.join(__dirname, 'luxlogo.png'),
    wait: true,
  })

  if (shouldShow) {
    const searchData = await reservationSearch({ headless: false })
  }
})()

const puppeteer = require('puppeteer')
const dotenv = require('dotenv')
const notifier = require('node-notifier')
const path = require('path')
require('promise-any-polyfill')

dotenv.config()

const delay = async (ms) => await new Promise(resolve => setTimeout(resolve, ms))

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

const notify = (config) => new Promise(resolve => {
  const title = 'LUX MED Watcher' + (process.env.REFERRAL_TYPE ? ` (${process.env.REFERRAL_TYPE})` : '')
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
        throw error
      }
    }
  }
}

const reservationSearch = async (browser) => {
  const page = await browser.newPage()

  // LOGIN
  await page.goto('https://rezerwacja.luxmed.pl/start')
  const loginInput = await page.waitForSelector('input[name=Login]')
  await loginInput.type(process.env.LOGIN)
  const passwordInput = await page.waitForSelector('input[name=Password]')
  await passwordInput.type(process.env.PASSWORD)
  const submitButton = await page.waitForSelector('button[type=submit]')
  await submitButton.click()

  // GO TO REFERRALS
  const referralsAnchor = await page.waitForSelector('a[href$="/PatientPortal/Reservations/Referrals"]')
  await referralsAnchor.click()

  // GO TO RESERVATION SEARCH
  const referralsReservationAnchor = await page.waitForSelector(`.actions a[href*="referralId=${process.env.REFERRAL_ID}"]`)
  await referralsReservationAnchor.click()

  // PERFORM SEARCH
  await page.waitForSelector('input[placeholder*="wpisz miasto"]')
  await delay(1000)
  const citySelect = await page.waitForSelector('input[placeholder*="wpisz miasto"]')
  citySelect.click()

  await page.waitForSelector('.dropdown-select-item')
  await page.evaluate(() => {
    document.querySelectorAll('.dropdown-select-item').forEach(node => node.textContent === 'Wrocław' && node.click())
  })

  await delay(2000)

  const searchButton = await page.waitForSelector('.btn-search[type=submit]')
  await searchButton.click()

  await delay(2000)

  const resolvedNode = await Promise.any([
    page.waitForSelector('.no-terms-message'),
    page.waitForSelector('.term-item'),
  ])
  const hasResults = await page.evaluate(resolvedNode => resolvedNode.classList.contains('term-item'), resolvedNode)
  return hasResults
}

;(async () => {
  validateEnv()

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
    try {
      const hasResults = await withOptionalRetries(() => reservationSearch(browser))
      console.log('> hasResults', hasResults)
    } catch (error) {
      console.error(error)
    }
  }
})()

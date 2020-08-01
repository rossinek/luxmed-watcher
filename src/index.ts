import puppeteer, { Page, JSHandle, ElementHandle } from 'puppeteer'
import { delay, withOptionalRetries } from './utils'
import { notify } from './notifications'
import initEnv from './initialize-env'
import 'promise-any-polyfill'

initEnv()

const login = async (page: Page) => {
  await page.goto('https://rezerwacja.luxmed.pl/start')
  const loginInput = await page.waitForSelector('input[name=Login]')
  await loginInput.type(process.env.LOGIN!)
  const passwordInput = await page.waitForSelector('input[name=Password]')
  await passwordInput.type(process.env.PASSWORD!)
  const submitButton = await page.waitForSelector('button[type=submit]')
  await submitButton.click()
}

const searchInputCity = async (page: Page, city: string = 'Wrocław') => {
  await page.waitForSelector('input[placeholder*="wpisz miasto"]')
  await delay(1000)
  const citySelect = await page.waitForSelector('input[placeholder*="wpisz miasto"]')
  citySelect.click()

  const cityOption = await queryElementWithContent(page, '.dropdown-select-item', city)
  cityOption.click()
  // await page.waitForSelector('.dropdown-select-item')
  // await page.evaluate((city) => {
  //   document.querySelectorAll('.dropdown-select-item').forEach(node => node.textContent === city && (node as HTMLElement).click())
  // }, city)
  await delay(2000)
}

const searchInputExamination = async (page: Page, specialistName: string = 'Ortopeda') => {
  await page.waitForSelector('input[placeholder*="wpisz nazwę usługi"]')
  await delay(1000)
  const examinationSelect = await page.waitForSelector('input[placeholder*="wpisz nazwę usługi"]')
  examinationSelect.click()

  const examinationOption = await queryElementWithContent(page, '.multi-select-item', specialistName)
  examinationOption.click()

  await searchOptionalTriage(page, [
    {
      question: 'Czy miałeś uraz w ciągu ostatnich 5 dni lub masz objawy stanu zapalnego (obrzęk, zaczerwienienie, uczucie gorąca) w miejscu bólu?',
      answer: false,
    },
    {
      question: 'Czy powodem wizyty są dolegliwości szyi, pleców albo kończyn, które były wcześniej zdiagnozowane lub rehabilitowane?',
      answer: false,
    },
    {
      question: 'Czy leczysz się sterydami lub zdiagnozowano u Ciebie osteoporozę?',
      answer: false,
    },
    {
      question: 'Czy chcesz wyszukać terminy u fizjoterapeuty?',
      answer: false,
    },
  ])

  await delay(2000)
}

const queryElementWithContent = async (page: Page, selector: string, content: string, useIncludes?: boolean) => {
  await page.waitForSelector(selector)
  const handle = await page.evaluateHandle((selector, content, useIncludes) => {
    return [...document.querySelectorAll(selector)].find(node => {
      const textContent = node?.textContent?.trim()
      if (useIncludes) return textContent.includes(content)
      return textContent === content
    })
  }, selector, content.trim(), !!useIncludes)
  return handle as ElementHandle
}

const searchOptionalTriage = async (page: Page, QAs: Array<{ question: string, answer: boolean }>) => {
  await delay(1000)
  if (await page.waitForSelector('.triage', { timeout: 5000 }).catch(() => null)) {
    for (const QA of QAs) {
      if (await queryElementWithContent(page, '.triage', QA.question, true)) {
        const button = await queryElementWithContent(page, '.triage button', QA.answer ? 'Tak' : 'Nie')
        button.click()
      }
      await delay(1000)
    }
  }
}

const searchSubmit = async (page: Page) => {
  const searchButton = await page.waitForSelector('.btn-search[type=submit]')
  await searchButton.click()
  await delay(2000)
}

const searchGetResults = async (page: Page): Promise<{ anyResults: true, doctors: string[] } | { anyResults: false }> => {
  let reject = (error: any): Promise<any> => Promise.reject(error)
  const hasResults = await Promise.any([
    page.waitForSelector('.no-terms-message').then(() => false).catch((error) => reject(error)),
    page.waitForSelector('.term-item').then(() => true).catch((error) => reject(error)),
  ])
  // suppress further errors
  reject = () => Promise.resolve()

  if (hasResults) {
    // RETURN LIST OF DOCTORS NAMES
    const doctors = await page.evaluate(() => {
      return Array.from(new Set(Array.from(document.querySelectorAll('.doctor')).map(n => n.textContent || '')))
    })
    return { anyResults: true, doctors }
  }
  return { anyResults: false }
}

const reservationSearch = async (page: Page, referralId: string) => {
  await login(page)

  // GO TO REFERRALS
  const referralsAnchor = await page.waitForSelector('a[href$="/PatientPortal/Reservations/Referrals"]')
  await referralsAnchor.click()

  // GO TO RESERVATION SEARCH
  const referralsReservationAnchor = await page.waitForSelector(`.actions a[href*="referralId=${referralId}"]`)
  await referralsReservationAnchor.click()

  await delay(2000)
  await page.reload()

  await searchInputCity(page)
  await searchSubmit(page)

  return searchGetResults(page)
}

const regularSearch = async (page: Page, specialistName: string) => {
  await login(page)

  // GO TO SEARCH
  const searchAnchor = await page.waitForSelector('a.button.accept[href*="/PatientPortal/Reservations/LandingPage"]')
  await searchAnchor.click()

  await delay(2000)
  await page.reload()

  await searchInputCity(page)
  await searchInputExamination(page, specialistName)
  await searchSubmit(page)

  return searchGetResults(page)
}

const performSearch = (page: Page) => {
  if (process.env.REFERRAL_ID) {
    return reservationSearch(page, process.env.REFERRAL_ID!)
  }
  return regularSearch(page, process.env.SPECIALIST_NAME!)
}

const main = async () => {
  let shouldShowResults = !process.env.HEADLESS

  if (process.env.HEADLESS) {
    const searchResults = await withOptionalRetries(async () => {
      const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ['--window-size=1920,1080'],
      })
      const page = await browser.newPage()
      const result = await performSearch(page)
      await browser.close()
      return result
    })

    const message = searchResults.anyResults
      ? (searchResults.doctors.length ? `Są terminy do ${searchResults.doctors.slice(0, 3).join(', ')}${searchResults.doctors.length > 3 ? ', ...' : ''}` : 'Są terminy!')
      : 'Brak dostępnych terminów'

    shouldShowResults = await notify({
      important: searchResults.anyResults,
      message,
      sound: searchResults.anyResults,
      actions: 'Pokaż',
    })
  }

  if (shouldShowResults) {
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
    })
    const page = await browser.newPage()
    try {
      const searchResults = await withOptionalRetries(() => performSearch(page))
      console.log('> results', searchResults.anyResults && searchResults.doctors.join(', '))
    } catch (error) {
      console.error(error)
    }
  }
}

main()

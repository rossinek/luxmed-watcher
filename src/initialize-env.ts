import dotenv from 'dotenv'

export default () => {
  dotenv.config()

  if (!process.env.LOGIN || !process.env.PASSWORD) {
    console.error('LOGIN or PASSWORD is missing')
    process.exit()
  }
  const referralEnv = !!process.env.REFERRAL_ID
  const regularSearchEnv = !!process.env.SPECIALIST_NAME
  if (!referralEnv && !regularSearchEnv) {
    console.error('REFERRAL_ID or SPECIALIST_NAME is required')
    process.exit()
  }
  if (!!referralEnv && !!regularSearchEnv) {
    console.error('Only one of REFERRAL_ID and SPECIALIST_NAME can be used')
    process.exit()
  }
}

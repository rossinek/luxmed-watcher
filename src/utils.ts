import { notify } from "./notifications"

export const withOptionalRetries = async <T>(action: () => Promise<T>): Promise<T> => {
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

export const delay = async (ms: number) => await new Promise(resolve => setTimeout(resolve, ms))

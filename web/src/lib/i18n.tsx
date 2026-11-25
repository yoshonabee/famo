import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { setDesktopLanguage } from './desktop'
import { messages } from './messages'
import { translateError } from './localized-errors'

export const languages = [
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
] as const
export type Locale = (typeof languages)[number]['code']
export type LanguagePreference = 'system' | Locale

const defaultLocale: Locale = 'zh-TW'
const storageKey = 'famo.language'

function readLanguagePreference(): LanguagePreference {
  try {
    const preference = localStorage.getItem(storageKey)
    if (preference === 'en' || preference === 'zh-TW') return preference
  } catch {
    // Use the system preference when storage is unavailable.
  }
  return 'system'
}

function readSystemLocale(): Locale {
  const preferences = navigator.languages.length
    ? navigator.languages
    : [navigator.language]
  for (const preference of preferences) {
    const [language] = preference.toLowerCase().split('-')
    if (language === 'zh') return 'zh-TW'
    if (language === 'en') return 'en'
  }
  return defaultLocale
}

type MessageKey = keyof typeof messages
type Value = string | number
type MessageArgs<Text extends string> = Text extends `${string}{2}${string}`
  ? [Value, Value]
  : Text extends `${string}{1}${string}`
    ? [Value]
    : []

export type Translator = <Key extends MessageKey>(
  key: Key,
  ...values: MessageArgs<(typeof messages)[Key][0]>
) => string

export function createTranslator(locale: Locale): Translator {
  return (key, ...values) =>
    messages[key][locale === 'en' ? 1 : 0].replace(
      /\{(\d+)\}/g,
      (_, index: string) => String(values[Number(index) - 1]),
    )
}

export class LocalizedError extends Error {
  constructor(readonly format: (t: Translator) => string) {
    super(format(createTranslator(defaultLocale)))
  }
}

type Language = {
  locale: Locale
  preference: LanguagePreference
  t: Translator
  errorText: (error?: Error | string | null) => string
  setPreference: (preference: LanguagePreference) => void
  storageFailed: boolean
}
const LanguageContext = createContext<Language | null>(null)

export function LanguageProvider({
  panel,
  children,
}: {
  panel: boolean
  children: ReactNode
}) {
  const [preference, setCurrentPreference] = useState(readLanguagePreference)
  const [systemLocale, setSystemLocale] = useState(readSystemLocale)
  const [storageFailed, setStorageFailed] = useState(false)
  const locale = preference === 'system' ? systemLocale : preference
  const t = createTranslator(locale)

  useLayoutEffect(() => {
    document.documentElement.lang = locale
    document.title = createTranslator(locale)(
      panel ? 'panelWindowTitle' : 'mainWindowTitle',
    )
    if (!panel) setDesktopLanguage(locale)
  }, [locale, panel])

  useEffect(() => {
    function syncLanguage(event: StorageEvent) {
      if (
        event.storageArea === localStorage &&
        (event.key === storageKey || event.key === null)
      ) {
        setCurrentPreference(readLanguagePreference())
        setStorageFailed(false)
      }
    }
    function syncSystemLanguage() {
      setSystemLocale(readSystemLocale())
    }
    window.addEventListener('storage', syncLanguage)
    window.addEventListener('languagechange', syncSystemLanguage)
    return () => {
      window.removeEventListener('storage', syncLanguage)
      window.removeEventListener('languagechange', syncSystemLanguage)
    }
  }, [])

  function setPreference(next: LanguagePreference) {
    setCurrentPreference(next)
    try {
      localStorage.setItem(storageKey, next)
      setStorageFailed(false)
    } catch {
      setStorageFailed(true)
    }
  }

  return (
    <LanguageContext.Provider
      value={{
        locale,
        preference,
        t,
        errorText: (error) =>
          error instanceof LocalizedError
            ? error.format(t)
            : translateError(
                locale,
                typeof error === 'string' ? error : (error?.message ?? ''),
              ),
        setPreference,
        storageFailed,
      }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const language = useContext(LanguageContext)
  if (!language) throw new Error('LanguageProvider is missing')
  return language
}

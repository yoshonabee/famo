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

const defaultLocale: Locale = 'zh-TW'
const storageKey = 'famo.language'

function readLocale(): Locale {
  try {
    return localStorage.getItem(storageKey) === 'en' ? 'en' : defaultLocale
  } catch {
    return defaultLocale
  }
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
  t: Translator
  errorText: (error?: Error | string | null) => string
  setLocale: (locale: Locale) => void
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
  const [locale, setCurrentLocale] = useState(readLocale)
  const [storageFailed, setStorageFailed] = useState(false)
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
        setCurrentLocale(readLocale())
        setStorageFailed(false)
      }
    }
    window.addEventListener('storage', syncLanguage)
    return () => window.removeEventListener('storage', syncLanguage)
  }, [])

  function setLocale(next: Locale) {
    setCurrentLocale(next)
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
        t,
        errorText: (error) =>
          error instanceof LocalizedError
            ? error.format(t)
            : translateError(
                locale,
                typeof error === 'string' ? error : (error?.message ?? ''),
              ),
        setLocale,
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

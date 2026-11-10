import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export const themeColorFields = [
  { key: 'canvas', label: '頁面背景' },
  { key: 'background', label: '內容背景' },
  { key: 'sidebar', label: '側欄背景' },
  { key: 'foreground', label: '主要文字' },
  { key: 'primary', label: '強調色' },
  { key: 'primary-foreground', label: '強調色文字' },
  { key: 'muted-foreground', label: '次要文字' },
  { key: 'border', label: '邊框' },
  { key: 'accent', label: '選取背景' },
] as const

export type ThemeColors = Record<
  (typeof themeColorFields)[number]['key'],
  string
>
export type Theme = {
  id: string
  name: string
  description: string
  mode: 'light' | 'dark'
  colors: ThemeColors
}
export type ThemeDraft = Omit<Theme, 'id'>

export const themes = [
  {
    id: 'moss',
    name: '苔綠',
    description: '熟悉的綠意，平靜專注',
    mode: 'light',
    colors: {
      canvas: '#f8f9f6',
      background: '#fdfdfb',
      sidebar: '#f1f3ec',
      foreground: '#343a30',
      primary: '#637a4b',
      'primary-foreground': '#ffffff',
      'muted-foreground': '#69735f',
      border: '#d6ddce',
      accent: '#e7ecdf',
    },
  },
  {
    id: 'linen',
    name: '亞麻',
    description: '暖白紙張與柔和棕色',
    mode: 'light',
    colors: {
      canvas: '#faf7f2',
      background: '#fffcf7',
      sidebar: '#f2ece2',
      foreground: '#433a30',
      primary: '#8b6342',
      'primary-foreground': '#ffffff',
      'muted-foreground': '#7b6b59',
      border: '#e0d5c6',
      accent: '#ede1d1',
    },
  },
  {
    id: 'ocean',
    name: '海鹽',
    description: '清透藍色，像海邊的早晨',
    mode: 'light',
    colors: {
      canvas: '#f3f8fc',
      background: '#fbfdff',
      sidebar: '#eaf2f8',
      foreground: '#283d50',
      primary: '#316d9b',
      'primary-foreground': '#ffffff',
      'muted-foreground': '#5c7388',
      border: '#ccdae6',
      accent: '#dcebf6',
    },
  },
  {
    id: 'lavender',
    name: '薰衣草',
    description: '帶一點想像的淡紫色',
    mode: 'light',
    colors: {
      canvas: '#f8f5fc',
      background: '#fefbff',
      sidebar: '#f0eaf7',
      foreground: '#43354f',
      primary: '#7a5199',
      'primary-foreground': '#ffffff',
      'muted-foreground': '#796587',
      border: '#ddcee8',
      accent: '#eaddf3',
    },
  },
  {
    id: 'rose',
    name: '玫瑰',
    description: '溫柔粉色，留一點日常浪漫',
    mode: 'light',
    colors: {
      canvas: '#fcf5f6',
      background: '#fffbfc',
      sidebar: '#f7eaed',
      foreground: '#50343c',
      primary: '#a34663',
      'primary-foreground': '#ffffff',
      'muted-foreground': '#8b626f',
      border: '#e9cfd6',
      accent: '#f4dfe5',
    },
  },
  {
    id: 'sand',
    name: '沙丘',
    description: '日光下的沙色與陶土',
    mode: 'light',
    colors: {
      canvas: '#fcf8ef',
      background: '#fffdf7',
      sidebar: '#f5eddc',
      foreground: '#493d29',
      primary: '#956322',
      'primary-foreground': '#ffffff',
      'muted-foreground': '#7b6d50',
      border: '#e3d6b9',
      accent: '#f0e3c7',
    },
  },
  {
    id: 'midnight',
    name: '午夜',
    description: '沉靜深藍，適合夜晚工作',
    mode: 'dark',
    colors: {
      canvas: '#171e2b',
      background: '#1e2838',
      sidebar: '#121925',
      foreground: '#e0e8f4',
      primary: '#91b9f2',
      'primary-foreground': '#14253e',
      'muted-foreground': '#a0afc5',
      border: '#39485d',
      accent: '#2a3b55',
    },
  },
  {
    id: 'charcoal',
    name: '石墨',
    description: '俐落灰階，讓內容成為主角',
    mode: 'dark',
    colors: {
      canvas: '#202124',
      background: '#292a2e',
      sidebar: '#191a1d',
      foreground: '#e9e9ec',
      primary: '#c1c5d0',
      'primary-foreground': '#24262d',
      'muted-foreground': '#aaabb4',
      border: '#46474f',
      accent: '#383a43',
    },
  },
  {
    id: 'forest',
    name: '夜森',
    description: '深林綠與柔亮的薄荷色',
    mode: 'dark',
    colors: {
      canvas: '#17241e',
      background: '#1e2e26',
      sidebar: '#121e18',
      foreground: '#e0ece3',
      primary: '#9ccaa7',
      'primary-foreground': '#183b24',
      'muted-foreground': '#a0b5a6',
      border: '#3a5143',
      accent: '#2c4435',
    },
  },
  {
    id: 'nord',
    name: '極光',
    description: '冷灰底色，點綴冰川青綠',
    mode: 'dark',
    colors: {
      canvas: '#2e3440',
      background: '#353d4b',
      sidebar: '#272e39',
      foreground: '#eceff4',
      primary: '#88c0d0',
      'primary-foreground': '#203741',
      'muted-foreground': '#b0bdce',
      border: '#536175',
      accent: '#405566',
    },
  },
  {
    id: 'plum',
    name: '暮紫',
    description: '夜幕裡的紫色與微光',
    mode: 'dark',
    colors: {
      canvas: '#282231',
      background: '#322a3e',
      sidebar: '#211b29',
      foreground: '#ede3f5',
      primary: '#c4a0e5',
      'primary-foreground': '#352047',
      'muted-foreground': '#b9a5ca',
      border: '#564365',
      accent: '#483455',
    },
  },
  {
    id: 'mocha',
    name: '摩卡',
    description: '咖啡般溫暖的深棕色',
    mode: 'dark',
    colors: {
      canvas: '#2a231f',
      background: '#342c26',
      sidebar: '#231d19',
      foreground: '#efe5da',
      primary: '#dcaf85',
      'primary-foreground': '#3b2616',
      'muted-foreground': '#bda998',
      border: '#58483b',
      accent: '#4b392b',
    },
  },
] as const satisfies readonly Theme[]

export type ThemePreference = string
const storageKey = 'famo.theme'
const darkModeQuery = '(prefers-color-scheme: dark)'
export const maxThemeFileSize = 1 << 20
const maxCustomThemes = 100

type Appearance = { preference: ThemePreference; customThemes: Theme[] }
const defaultAppearance: Appearance = { preference: 'moss', customThemes: [] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseDefinition(value: unknown): ThemeDraft {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.trim().length > 40
  )
    throw new Error('主題名稱需為 1–40 個字。')
  if (typeof value.description !== 'string' || value.description.length > 160)
    throw new Error('主題說明不可超過 160 個字。')
  if (value.mode !== 'light' && value.mode !== 'dark')
    throw new Error('主題外觀需為淺色或深色。')
  const source = value.colors
  if (!isRecord(source)) throw new Error('主題缺少配色。')
  const colors = {} as ThemeColors
  for (const { key, label } of themeColorFields) {
    const color = source[key]
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
      throw new Error(`${label}需使用 #RRGGBB 色碼。`)
    colors[key] = color.toLowerCase()
  }
  return {
    name: value.name.trim(),
    description: value.description.trim(),
    mode: value.mode,
    colors,
  }
}

export function parseThemeFile(contents: string): ThemeDraft[] {
  if (new Blob([contents]).size > maxThemeFileSize)
    throw new Error('主題檔案不可超過 1 MB。')
  let value: unknown
  try {
    value = JSON.parse(contents)
  } catch {
    throw new Error('請選擇有效的 JSON 主題檔案。')
  }
  if (
    !isRecord(value) ||
    value.format !== 'famo-theme' ||
    value.version !== 1 ||
    !Array.isArray(value.themes) ||
    !value.themes.length ||
    value.themes.length > maxCustomThemes
  )
    throw new Error('不支援的主題檔案格式或版本，一次最多匯入 100 款主題。')
  return value.themes.map(parseDefinition)
}

export function serializeThemes(selection: readonly Theme[]) {
  return JSON.stringify(
    {
      format: 'famo-theme',
      version: 1,
      themes: selection.map(({ name, description, mode, colors }) => ({
        name,
        description,
        mode,
        colors,
      })),
    },
    null,
    2,
  )
}

function readAppearance(): Appearance {
  try {
    const saved = localStorage.getItem(storageKey)
    // Preserve the theme choices saved before custom themes were introduced.
    if (saved === 'system' || themes.some((theme) => theme.id === saved))
      return { ...defaultAppearance, preference: saved! }
    if (!saved) return defaultAppearance
    const value: unknown = JSON.parse(saved)
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      !Array.isArray(value.customThemes) ||
      value.customThemes.length > maxCustomThemes
    )
      return defaultAppearance
    const ids = new Set<string>()
    const customThemes = value.customThemes.map((item: unknown): Theme => {
      if (
        !isRecord(item) ||
        typeof item.id !== 'string' ||
        !/^custom-[0-9a-f-]{36}$/i.test(item.id) ||
        ids.has(item.id)
      )
        throw new Error('Invalid theme ID')
      ids.add(item.id)
      return { id: item.id, ...parseDefinition(item) }
    })
    const preference =
      typeof value.preference === 'string' &&
      (value.preference === 'system' ||
        [...themes, ...customThemes].some(
          (theme) => theme.id === value.preference,
        ))
        ? value.preference
        : 'moss'
    return { preference, customThemes }
  } catch {
    return defaultAppearance
  }
}

function resolveTheme(appearance: Appearance, systemDark: boolean): Theme {
  const id =
    appearance.preference === 'system'
      ? systemDark
        ? 'midnight'
        : 'moss'
      : appearance.preference
  return (
    [...themes, ...appearance.customThemes].find((theme) => theme.id === id) ??
    themes[0]
  )
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.style.colorScheme = theme.mode
  for (const [name, color] of Object.entries(theme.colors))
    root.style.setProperty(`--${name}`, color)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme.colors.canvas)
}

export function initializeTheme() {
  applyTheme(resolveTheme(readAppearance(), matchMedia(darkModeQuery).matches))
}

export function useTheme() {
  const [appearance, setAppearance] = useState(readAppearance)
  const appearanceRef = useRef(appearance)
  appearanceRef.current = appearance
  const [systemDark, setSystemDark] = useState(
    () => matchMedia(darkModeQuery).matches,
  )
  const [storageError, setStorageError] = useState('')
  const theme = resolveTheme(appearance, systemDark)

  useLayoutEffect(() => applyTheme(theme), [theme])
  useEffect(() => {
    const media = matchMedia(darkModeQuery)
    const onSystemChange = () => setSystemDark(media.matches)
    const onStorageChange = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        setAppearance(readAppearance())
        setStorageError('')
      }
    }
    onSystemChange()
    media.addEventListener('change', onSystemChange)
    window.addEventListener('storage', onStorageChange)
    return () => {
      media.removeEventListener('change', onSystemChange)
      window.removeEventListener('storage', onStorageChange)
    }
  }, [])

  function persist(next: Appearance, requireStorage = false) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, ...next }))
      setStorageError('')
    } catch {
      setStorageError(
        requireStorage
          ? '無法儲存主題，請確認本機儲存空間可用後再試。'
          : '主題已套用，但無法儲存偏好。重新開啟後請再次選擇。',
      )
      if (requireStorage) return false
    }
    appearanceRef.current = next
    setAppearance(next)
    return true
  }

  function selectTheme(preference: ThemePreference) {
    const appearance = appearanceRef.current
    if (
      preference !== 'system' &&
      ![...themes, ...appearance.customThemes].some(
        (item) => item.id === preference,
      )
    )
      return
    persist({ ...appearance, preference })
  }

  function saveTheme(draft: ThemeDraft, id?: string) {
    const appearance = appearanceRef.current
    const definition = parseDefinition(draft)
    if (
      [...themes, ...appearance.customThemes].some(
        (item) =>
          item.id !== id &&
          item.name.toLocaleLowerCase() === definition.name.toLocaleLowerCase(),
      )
    )
      throw new Error('這個主題名稱已被使用，請換個名稱。')
    if (!id && appearance.customThemes.length >= maxCustomThemes)
      throw new Error('最多可儲存 100 款自訂主題。')
    if (id && !appearance.customThemes.some((item) => item.id === id))
      throw new Error('這款主題已被移除，請新增為另一款主題。')
    const saved: Theme = {
      ...definition,
      id: id ?? `custom-${crypto.randomUUID()}`,
    }
    const customThemes = id
      ? appearance.customThemes.map((item) => (item.id === id ? saved : item))
      : [...appearance.customThemes, saved]
    return persist({ preference: saved.id, customThemes }, true)
  }

  function importThemes(definitions: ThemeDraft[]) {
    const appearance = appearanceRef.current
    if (appearance.customThemes.length + definitions.length > maxCustomThemes)
      throw new Error('最多可儲存 100 款自訂主題，請先移除不需要的主題。')
    const names = new Set(
      [...themes, ...appearance.customThemes].map((item) =>
        item.name.toLocaleLowerCase(),
      ),
    )
    const imported = definitions.map((definition): Theme => {
      const clean = parseDefinition(definition)
      let name = clean.name
      for (let index = 2; names.has(name.toLocaleLowerCase()); index++) {
        const suffix = ` (${index})`
        name = clean.name.slice(0, 40 - suffix.length) + suffix
      }
      names.add(name.toLocaleLowerCase())
      return { ...clean, name, id: `custom-${crypto.randomUUID()}` }
    })
    return persist(
      {
        preference: imported[0].id,
        customThemes: [...appearance.customThemes, ...imported],
      },
      true,
    )
  }

  function removeTheme(id: string) {
    const appearance = appearanceRef.current
    return persist(
      {
        preference:
          appearance.preference === id ? 'moss' : appearance.preference,
        customThemes: appearance.customThemes.filter((item) => item.id !== id),
      },
      true,
    )
  }

  return {
    ...appearance,
    theme,
    allThemes: [...themes, ...appearance.customThemes],
    selectTheme,
    saveTheme,
    importThemes,
    removeTheme,
    storageError,
  }
}

export type ThemeController = ReturnType<typeof useTheme>

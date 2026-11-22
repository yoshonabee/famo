import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { TodayThemePreview } from '@/components/today-theme-preview'
import {
  themeColorFields,
  themeName,
  type Theme,
  type ThemeDraft,
} from '@/lib/theme'
import { LocalizedError, useLanguage } from '@/lib/i18n'

export function ThemeEditor({
  initialTheme,
  editingId,
  allThemes,
  onSave,
  onCancel,
}: {
  initialTheme: Theme
  editingId?: string
  allThemes: Theme[]
  onSave: (draft: ThemeDraft, id?: string) => boolean
  onCancel: () => void
}) {
  const { t, errorText } = useLanguage()
  const [draft, setDraft] = useState<ThemeDraft>({
    name: editingId ? initialTheme.name : '',
    description: editingId ? initialTheme.description : '',
    mode: initialTheme.mode,
    colors: { ...initialTheme.colors },
  })
  const [baseId, setBaseId] = useState(initialTheme.id)
  const [error, setError] = useState<Error | null>(null)
  const preview: ThemeDraft = { ...draft, colors: { ...draft.colors } }
  for (const { key } of themeColorFields)
    if (!/^#[0-9a-f]{6}$/i.test(preview.colors[key]))
      preview.colors[key] = initialTheme.colors[key]

  function save(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      if (!onSave(draft, editingId))
        setError(new LocalizedError((translate) => translate('themeNotSaved')))
    } catch (error) {
      setError(error as Error)
    }
  }

  return (
    <section className="theme-editor" aria-labelledby="theme-editor-heading">
      <h3 id="theme-editor-heading">
        {editingId ? t('editTheme') : t('addTheme')}
      </h3>
      <p className="preferences-description">{t('themeEditorDescription')}</p>
      <form onSubmit={save}>
        <div className="theme-editor-fields">
          <label className="field">
            <span>{t('themeName')}</span>
            <input
              autoFocus
              required
              maxLength={40}
              placeholder={t('themeNamePlaceholder')}
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>{t('baseTheme')}</span>
            <select
              aria-label={t('baseTheme')}
              value={baseId}
              onChange={(event) => {
                const base = allThemes.find(
                  (theme) => theme.id === event.target.value,
                )
                if (!base) return
                setBaseId(base.id)
                setDraft({
                  ...draft,
                  colors: { ...base.colors },
                  mode: base.mode,
                })
              }}
            >
              {allThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {themeName(theme, t)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('themeDescription')}</span>
            <input
              maxLength={160}
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>{t('themeMode')}</span>
            <select
              aria-label={t('themeMode')}
              value={draft.mode}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  mode: event.target.value as Theme['mode'],
                })
              }
            >
              <option value="light">{t('light')}</option>
              <option value="dark">{t('dark')}</option>
            </select>
          </label>
        </div>
        <div className="palette-layout">
          <fieldset className="theme-palette">
            <legend>{t('palette')}</legend>
            {themeColorFields.map(({ key, label }) => (
              <div className="palette-field" key={key}>
                <label htmlFor={`theme-color-${key}`}>{t(label)}</label>
                <div>
                  <input
                    type="color"
                    aria-label={t('colorPickerFor', t(label))}
                    value={preview.colors[key]}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        colors: { ...draft.colors, [key]: event.target.value },
                      })
                    }
                  />
                  <input
                    id={`theme-color-${key}`}
                    aria-label={t('hexColorFor', t(label))}
                    type="text"
                    required
                    spellCheck={false}
                    maxLength={7}
                    pattern="#[0-9a-fA-F]{6}"
                    value={draft.colors[key]}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        colors: { ...draft.colors, [key]: event.target.value },
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </fieldset>
          <div className="palette-preview-area">
            <h4>{t('livePreview')}</h4>
            <TodayThemePreview theme={preview} />
            <p className="preferences-description">{t('previewHelp')}</p>
          </div>
        </div>
        {error && (
          <p className="inline-edit-error" role="alert">
            {errorText(error)}
          </p>
        )}
        <div className="theme-editor-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button type="submit">
            {editingId ? t('saveChanges') : t('saveTheme')}
          </Button>
        </div>
      </form>
    </section>
  )
}

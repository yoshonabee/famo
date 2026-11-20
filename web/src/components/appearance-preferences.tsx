import {
  Check,
  Download,
  Monitor,
  Palette,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ThemeEditor } from '@/components/theme-editor'
import { ThemePreview } from '@/components/theme-preview'
import { exportThemeFile } from '@/lib/desktop'
import {
  maxThemeFileSize,
  parseThemeFile,
  serializeThemes,
  themeName,
  themeDescription,
  themes,
  type Theme,
  type ThemeController,
  type ThemePreference,
} from '@/lib/theme'
import { LocalizedError, useLanguage } from '@/lib/i18n'

function ThemeOption({
  theme,
  preference,
  onChange,
}: {
  theme: Theme
  preference: ThemePreference
  onChange: (id: string) => void
}) {
  const { t } = useLanguage()
  return (
    <label className="theme-option">
      <input
        type="radio"
        name="theme"
        value={theme.id}
        aria-label={themeName(theme, t)}
        checked={preference === theme.id}
        onChange={() => onChange(theme.id)}
      />
      <ThemePreview theme={theme} />
      <span className="theme-option-heading">
        <strong>{themeName(theme, t)}</strong>
        <Check className="theme-check" size={16} aria-hidden="true" />
      </span>
      <span className="theme-option-description">
        {themeDescription(theme, t) ||
          (theme.mode === 'light'
            ? t('customLightTheme')
            : t('customDarkTheme'))}
      </span>
    </label>
  )
}

export function AppearancePreferences({
  appearance,
}: {
  appearance: ThemeController
}) {
  const { t, errorText } = useLanguage()
  const {
    preference,
    theme,
    selectTheme,
    storageError,
    customThemes,
    allThemes,
  } = appearance
  const [editor, setEditor] = useState<{ base: Theme; id?: string } | null>(
    null,
  )
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [notice, setNotice] = useState<
    | { key: 'themesImported' | 'themesExported'; count: number }
    | 'themeSaved'
    | null
  >(null)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (file.size > maxThemeFileSize)
        throw new LocalizedError((translate) => translate('themeFileTooLarge'))
      const imported = parseThemeFile(await file.text())
      if (appearance.importThemes(imported))
        setNotice({ key: 'themesImported', count: imported.length })
    } catch (error) {
      setError(error as Error)
    } finally {
      setBusy(false)
    }
  }

  async function exportSelection(selection: Theme[]) {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const filename =
        selection.length === 1
          ? `famo-theme-${selection[0].name.replace(/[/\\:*?"<>|]/g, '-')}.json`
          : 'famo-themes.json'
      if (await exportThemeFile(serializeThemes(selection), filename))
        setNotice({ key: 'themesExported', count: selection.length })
    } catch (error) {
      setError(
        new LocalizedError((translate) =>
          translate('exportFailed', (error as Error).message),
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p id="theme-description" className="preferences-description">
        {t('applyThemeDescription')}
      </p>
      <div className="theme-tools">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setEditor({ base: theme })
            setError(null)
            setNotice(null)
          }}
        >
          <Palette />
          {t('addTheme')}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload />
          {t('importTheme')}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void exportSelection([theme])}
        >
          <Download />
          {t('exportCurrentTheme')}
        </Button>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".json,application/json"
          aria-label={t('importThemeFile')}
          onChange={(event) => void importFile(event)}
        />
      </div>
      {(error || storageError) && (
        <p className="inline-edit-error theme-notice" role="alert">
          {errorText(error) || storageError}
        </p>
      )}
      {notice && (
        <p className="theme-notice" role="status">
          {notice === 'themeSaved' ? t(notice) : t(notice.key, notice.count)}
        </p>
      )}
      {editor && (
        <ThemeEditor
          key={editor.id ?? 'new'}
          initialTheme={editor.base}
          editingId={editor.id}
          allThemes={allThemes}
          onCancel={() => setEditor(null)}
          onSave={(draft, id) => {
            if (!appearance.saveTheme(draft, id)) return false
            setEditor(null)
            setNotice('themeSaved')
            return true
          }}
        />
      )}
      <fieldset
        className="theme-settings"
        aria-label={t('appearanceTheme')}
        aria-describedby="theme-description"
      >
        <label className="system-theme-option">
          <input
            type="radio"
            name="theme"
            value="system"
            aria-label={t('followSystem')}
            checked={preference === 'system'}
            onChange={() => selectTheme('system')}
          />
          <Monitor size={22} aria-hidden="true" />
          <span>
            <strong>{t('followSystem')}</strong>
            <span>{t('followSystemDescription')}</span>
          </span>
          <Check className="theme-check" size={18} aria-hidden="true" />
        </label>
        {customThemes.length > 0 && (
          <section className="theme-group" aria-labelledby="custom-themes">
            <div className="custom-themes-heading">
              <h3 id="custom-themes">{t('customThemes')}</h3>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void exportSelection(customThemes)}
              >
                <Download />
                {t('exportCustomThemes')}
              </Button>
            </div>
            <div className="theme-grid">
              {customThemes.map((item) => (
                <div className="custom-theme-card" key={item.id}>
                  <ThemeOption
                    theme={item}
                    preference={preference}
                    onChange={selectTheme}
                  />
                  <div className="custom-theme-actions">
                    {pendingDelete === item.id ? (
                      <>
                        <span>{t('deleteThemeQuestion')}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(null)}
                        >
                          {t('cancel')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (appearance.removeTheme(item.id)) {
                              setPendingDelete(null)
                              if (editor?.id === item.id) setEditor(null)
                            }
                          }}
                        >
                          {t('confirmDelete')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('editNamedTheme', item.name)}
                          onClick={() => setEditor({ base: item, id: item.id })}
                        >
                          <Pencil />
                          {t('edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('deleteNamedTheme', item.name)}
                          onClick={() => setPendingDelete(item.id)}
                        >
                          <Trash2 />
                          {t('delete')}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {(['light', 'dark'] as const).map((mode) => (
          <section
            className="theme-group"
            key={mode}
            aria-labelledby={`${mode}-themes`}
          >
            <h3 id={`${mode}-themes`}>
              {mode === 'light' ? t('lightThemes') : t('darkThemes')}
            </h3>
            <div className="theme-grid">
              {themes
                .filter((item) => item.mode === mode)
                .map((item) => (
                  <ThemeOption
                    key={item.id}
                    theme={item}
                    preference={preference}
                    onChange={selectTheme}
                  />
                ))}
            </div>
          </section>
        ))}
      </fieldset>
      <p className="theme-status" role="status" aria-live="polite">
        {preference === 'system'
          ? t('systemCurrentTheme', themeName(theme, t))
          : t('currentTheme', themeName(theme, t))}
      </p>
    </>
  )
}

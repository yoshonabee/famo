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
  themes,
  type Theme,
  type ThemeController,
  type ThemePreference,
} from '@/lib/theme'

function ThemeOption({
  theme,
  preference,
  onChange,
}: {
  theme: Theme
  preference: ThemePreference
  onChange: (id: string) => void
}) {
  return (
    <label className="theme-option">
      <input
        type="radio"
        name="theme"
        value={theme.id}
        aria-label={theme.name}
        checked={preference === theme.id}
        onChange={() => onChange(theme.id)}
      />
      <ThemePreview theme={theme} />
      <span className="theme-option-heading">
        <strong>{theme.name}</strong>
        <Check className="theme-check" size={16} aria-hidden="true" />
      </span>
      <span className="theme-option-description">
        {theme.description ||
          (theme.mode === 'light' ? '自訂淺色主題' : '自訂深色主題')}
      </span>
    </label>
  )
}

export function PreferencesPage({
  appearance,
}: {
  appearance: ThemeController
}) {
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
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (file.size > maxThemeFileSize)
        throw new Error('主題檔案不可超過 1 MB。')
      const imported = parseThemeFile(await file.text())
      if (appearance.importThemes(imported))
        setNotice(`已匯入 ${imported.length} 款主題。`)
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function exportSelection(selection: Theme[]) {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const filename =
        selection.length === 1
          ? `famo-theme-${selection[0].name.replace(/[/\\:*?"<>|]/g, '-')}.json`
          : 'famo-themes.json'
      if (await exportThemeFile(serializeThemes(selection), filename))
        setNotice(`已匯出 ${selection.length} 款主題。`)
    } catch (error) {
      setError(`匯出失敗：${(error as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="preferences-page">
      <header className="preferences-heading">
        <h1>設定</h1>
        <p>讓 Famo 換上你喜歡的樣子。</p>
      </header>
      <div className="theme-tools">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setEditor({ base: theme })
            setError('')
            setNotice('')
          }}
        >
          <Palette />
          新增主題
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload />
          匯入主題
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void exportSelection([theme])}
        >
          <Download />
          匯出目前主題
        </Button>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept=".json,application/json"
          aria-label="匯入主題檔案"
          onChange={(event) => void importFile(event)}
        />
      </div>
      {(error || storageError) && (
        <p className="inline-edit-error theme-notice" role="alert">
          {error || storageError}
        </p>
      )}
      {notice && (
        <p className="theme-notice" role="status">
          {notice}
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
            setNotice('主題已儲存並套用。')
            return true
          }}
        />
      )}
      <fieldset className="theme-settings" aria-describedby="theme-description">
        <legend>外觀主題</legend>
        <p id="theme-description" className="preferences-description">
          選擇後立即套用，並自動記住你的偏好。
        </p>
        <label className="system-theme-option">
          <input
            type="radio"
            name="theme"
            value="system"
            aria-label="跟隨系統"
            checked={preference === 'system'}
            onChange={() => selectTheme('system')}
          />
          <Monitor size={22} aria-hidden="true" />
          <span>
            <strong>跟隨系統</strong>
            <span>隨系統切換淺色「苔綠」與深色「午夜」</span>
          </span>
          <Check className="theme-check" size={18} aria-hidden="true" />
        </label>
        {customThemes.length > 0 && (
          <section className="theme-group" aria-labelledby="custom-themes">
            <div className="custom-themes-heading">
              <h2 id="custom-themes">自訂主題</h2>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void exportSelection(customThemes)}
              >
                <Download />
                匯出全部自訂主題
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
                        <span>刪除此主題？</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(null)}
                        >
                          取消
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
                          確認刪除
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`編輯主題：${item.name}`}
                          onClick={() => setEditor({ base: item, id: item.id })}
                        >
                          <Pencil />
                          編輯
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`刪除主題：${item.name}`}
                          onClick={() => setPendingDelete(item.id)}
                        >
                          <Trash2 />
                          刪除
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
            <h2 id={`${mode}-themes`}>
              {mode === 'light' ? '淺色主題' : '深色主題'}
            </h2>
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
          ? `跟隨系統 · 目前為${theme.name}`
          : `目前主題：${theme.name}`}
      </p>
    </div>
  )
}

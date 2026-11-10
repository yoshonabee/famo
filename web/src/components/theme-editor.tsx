import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { previewStyle } from '@/components/theme-preview'
import { themeColorFields, type Theme, type ThemeDraft } from '@/lib/theme'

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
  const [draft, setDraft] = useState<ThemeDraft>({
    name: editingId ? initialTheme.name : '',
    description: editingId ? initialTheme.description : '',
    mode: initialTheme.mode,
    colors: { ...initialTheme.colors },
  })
  const [baseId, setBaseId] = useState(initialTheme.id)
  const [error, setError] = useState('')
  const preview: ThemeDraft = { ...draft, colors: { ...draft.colors } }
  for (const { key } of themeColorFields)
    if (!/^#[0-9a-f]{6}$/i.test(preview.colors[key]))
      preview.colors[key] = initialTheme.colors[key]

  function save(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      if (!onSave(draft, editingId))
        setError('主題尚未儲存，請確認本機儲存空間後重試。')
    } catch (error) {
      setError((error as Error).message)
    }
  }

  return (
    <section className="theme-editor" aria-labelledby="theme-editor-heading">
      <h2 id="theme-editor-heading">{editingId ? '編輯主題' : '新增主題'}</h2>
      <p className="preferences-description">
        從現有主題開始調色，預覽滿意後再儲存。
      </p>
      <form onSubmit={save}>
        <div className="theme-editor-fields">
          <label className="field">
            <span>主題名稱</span>
            <input
              autoFocus
              required
              maxLength={40}
              placeholder="例如：我的薄荷主題"
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>基礎主題</span>
            <select
              aria-label="基礎主題"
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
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>主題說明（選填）</span>
            <input
              maxLength={160}
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>外觀模式</span>
            <select
              aria-label="外觀模式"
              value={draft.mode}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  mode: event.target.value as Theme['mode'],
                })
              }
            >
              <option value="light">淺色</option>
              <option value="dark">深色</option>
            </select>
          </label>
        </div>
        <div className="palette-layout">
          <fieldset className="theme-palette">
            <legend>調色盤</legend>
            {themeColorFields.map(({ key, label }) => (
              <div className="palette-field" key={key}>
                <label htmlFor={`theme-color-${key}`}>{label}</label>
                <div>
                  <input
                    type="color"
                    aria-label={`${label}調色盤`}
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
                    aria-label={`${label}色碼`}
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
            <h3>即時預覽</h3>
            <div
              className="palette-preview"
              style={{ ...previewStyle(preview), colorScheme: draft.mode }}
            >
              <div className="palette-preview-nav">
                <strong>famo</strong>
                <span>今日</span>
                <span>任務</span>
                <span>設定</span>
              </div>
              <div className="palette-preview-main">
                <h4>{draft.name.trim() || '我的主題'}</h4>
                <p>留一點時間，完成重要的小事。</p>
                <div className="palette-preview-input">新增一件任務…</div>
                <div className="palette-preview-row">
                  <i />
                  整理今天的想法
                </div>
                <div className="palette-preview-row">
                  <i className="checked" />
                  喝一杯水
                </div>
                <span className="palette-preview-button">新增任務</span>
              </div>
            </div>
            <p className="preferences-description">
              儲存後才會套用到整個介面。
            </p>
          </div>
        </div>
        {error && (
          <p className="inline-edit-error" role="alert">
            {error}
          </p>
        )}
        <div className="theme-editor-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button type="submit">{editingId ? '儲存變更' : '儲存主題'}</Button>
        </div>
      </form>
    </section>
  )
}

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ApiError,
  request,
  type Option,
  type Settings,
  type ColorPreset,
} from '@/lib/api'
import { Check, ChevronDown, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

function colorText(color: string) {
  const channels = color
    .slice(1)
    .match(/../g)
    ?.map((c) => {
      const value = parseInt(c, 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }) ?? [1, 1, 1]
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  return luminance > 0.4 ? '#443744' : luminance > 0.179 ? '#000000' : '#ffffff'
}
export function optionStyle(
  option?: Pick<Option, 'color'>,
): CSSProperties | undefined {
  return option
    ? {
        color: colorText(option.color),
        backgroundColor: option.color,
        borderColor: option.color,
      }
    : undefined
}
function nextOptionColor(options: Option[], colors: ColorPreset[]) {
  const counts = colors.map(
    (p) =>
      options.filter((o) => o.color.toLowerCase() === p.color.toLowerCase())
        .length,
  )
  return colors[counts.indexOf(Math.min(...counts))]?.color ?? '#F4B8CB'
}
function ColorPicker({
  name,
  color,
  colors,
  onChange,
}: {
  name: string
  color: string
  colors: ColorPreset[]
  onChange: (color: string) => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  function place() {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(280, window.innerWidth - 32)
    const height = panel.current?.getBoundingClientRect().height || 180
    setPosition({
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      top: Math.max(
        16,
        rect.bottom + height + 8 <= window.innerHeight - 16
          ? rect.bottom + 8
          : rect.top - height - 8,
      ),
    })
  }
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target))
        return
      panel.current?.hidePopover()
    }
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])
  return (
    <div className="option-color-control">
      <button
        ref={trigger}
        type="button"
        className="task-chip option-color-trigger"
        style={optionStyle({ color })}
        aria-label={`${name || '新選項'}配色`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        onClick={place}
      >
        <span>{name || '預覽'}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={`${name || '新選項'}顏色選單`}
        className="option-color-picker"
        style={position}
        onToggle={(event) => {
          const isOpen = event.newState === 'open'
          setOpen(isOpen)
          if (isOpen) place()
        }}
      >
        <div className="color-picker-heading">
          <span>選擇顏色</span>
          <button
            type="button"
            aria-label={`關閉${name || '新選項'}配色`}
            popoverTarget={id}
            popoverTargetAction="hide"
          >
            <X size={14} />
          </button>
        </div>
        <div
          className="color-presets"
          role="group"
          aria-label={`${name || '新選項'}預選顏色`}
        >
          {colors.map((preset) => (
            <button
              key={preset.color}
              type="button"
              className="color-swatch"
              aria-label={`${name || '新選項'}：${preset.name}`}
              aria-pressed={color.toLowerCase() === preset.color.toLowerCase()}
              title={`${preset.name} ${preset.color}`}
              style={optionStyle(preset)}
              onClick={() => {
                onChange(preset.color)
                panel.current?.hidePopover()
                trigger.current?.focus({ preventScroll: true })
              }}
            >
              {color.toLowerCase() === preset.color.toLowerCase() && (
                <Check size={12} />
              )}
            </button>
          ))}
        </div>
        <label className="custom-color">
          <input
            type="color"
            aria-label={`${name}顏色`}
            value={color}
            onChange={(e) => onChange(e.target.value)}
          />
          <span>自訂顏色</span>
        </label>
      </div>
    </div>
  )
}

export function OptionSelect({
  options,
  label,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  className,
}: {
  className?: string
  options: Option[]
  label: string
  value?: string
  defaultValue?: string
  onChange?: (v: string) => void
  disabled?: boolean
  name?: string
}) {
  const [selected, setSelected] = useState(defaultValue)
  const current = value ?? selected
  return (
    <select
      className={className}
      aria-label={label}
      name={name}
      value={current}
      disabled={disabled}
      style={optionStyle(options.find((o) => o.id === current))}
      onChange={(e) => {
        setSelected(e.target.value)
        onChange?.(e.target.value)
      }}
    >
      {options
        .filter((o) => !o.disabled || o.id === current)
        .map((o) => (
          <option
            key={o.id}
            value={o.id}
            disabled={o.disabled}
            style={optionStyle(o)}
          >
            {o.name}
            {o.disabled ? '（已停用）' : ''}
          </option>
        ))}
    </select>
  )
}
function OptionRows({
  title,
  options,
  defaultID,
  onChange,
  onDefault,
  numeric = false,
  disabled = false,
  colors,
}: {
  colors: ColorPreset[]
  title: string
  options: Option[]
  defaultID: string
  onChange: (o: Option[], defaultID?: string) => void
  onDefault: (id: string) => void
  numeric?: boolean
  disabled?: boolean
}) {
  const numericID = useRef(
    Math.max(-1, ...options.map((o) => Number(o.id)).filter(Number.isFinite)) +
      1,
  )
  numericID.current = Math.max(
    numericID.current,
    Math.max(-1, ...options.map((o) => Number(o.id)).filter(Number.isFinite)) +
      1,
  )
  function remove(option: Option) {
    const remaining = options.filter((o) => o.id !== option.id)
    if (defaultID === option.id) {
      const replacement = remaining.find((o) => !o.disabled)
      if (!replacement) return
      onChange(remaining, replacement.id)
    } else onChange(remaining)
  }
  function update(index: number, patch: Partial<Option>) {
    onChange(options.map((o, i) => (i === index ? { ...o, ...patch } : o)))
  }
  function move(index: number, delta: number) {
    const next = [...options]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    onChange(next)
  }
  return (
    <fieldset className="option-group" disabled={disabled}>
      <legend>{title}</legend>
      {options.map((o, index) => (
        <div className="option-row" key={o.id}>
          <input
            aria-label={`${title}選項名稱 ${index + 1}`}
            value={o.name}
            required
            onChange={(e) => update(index, { name: e.target.value })}
          />
          <ColorPicker
            name={o.name}
            color={o.color}
            colors={colors}
            onChange={(color) => update(index, { color })}
          />
          <label>
            <input
              type="radio"
              name={`default-${title}`}
              checked={defaultID === o.id}
              disabled={o.disabled}
              onChange={() => onDefault(o.id)}
            />
            預設
          </label>
          <label>
            <input
              type="checkbox"
              checked={o.disabled}
              onChange={(e) => update(index, { disabled: e.target.checked })}
            />
            停用
          </label>
          <button
            type="button"
            aria-label={`${o.name}往上移`}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`${o.name}往下移`}
            disabled={index === options.length - 1}
            onClick={() => move(index, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="delete-option"
            aria-label={`刪除${o.name || '新選項'}`}
            title="刪除選項，使用中的任務將改用預設值"
            disabled={
              defaultID === o.id &&
              !options.some((other) => other.id !== o.id && !other.disabled)
            }
            onClick={() => remove(o)}
          >
            <Trash2 size={16} />
            <span>刪除</span>
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...options,
            {
              id: numeric ? String(numericID.current++) : crypto.randomUUID(),
              name: '',
              color: nextOptionColor(options, colors),
              disabled: false,
            },
          ])
        }
      >
        新增{title}選項
      </Button>
    </fieldset>
  )
}
export function SettingsPage({ settings }: { settings: Settings }) {
  const client = useQueryClient()
  const [draft, setDraft] = useState<Settings>(() => structuredClone(settings))
  const [message, setMessage] = useState('')
  const save = useMutation({
    mutationFn: () => request<Settings>('/settings', draft),
    onSuccess: (updated) => {
      client.setQueryData(['settings'], updated)
      void client.invalidateQueries({ queryKey: ['tasks'] })
      setDraft(structuredClone(updated))
      setMessage('設定已儲存。')
    },
    onError: (e) => {
      setMessage(e.message)
      if (e instanceof ApiError && e.status === 409)
        void client.invalidateQueries({ queryKey: ['settings'] })
    },
  })
  const stale = draft.version !== settings.version
  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <h1>下拉選項設定</h1>
          <p>調整任務類型、流程階段與優先順序的名稱、顏色和排列。</p>
        </div>
      </div>
      <p className="muted">
        新增選項會自動配色，也可以點選色票或自訂顏色。刪除後，使用該選項的任務會改用對應預設值；按下儲存後才會生效。
      </p>
      {stale && (
        <div role="alert" className="conflict-notice">
          設定已有更新，草稿仍保留。
          <Button
            variant="outline"
            onClick={() => {
              setDraft(structuredClone(settings))
              setMessage('')
            }}
          >
            重新載入設定
          </Button>
        </div>
      )}
      <form
        className="stack-form"
        onSubmit={(e) => {
          e.preventDefault()
          setMessage('')
          save.mutate()
        }}
      >
        <fieldset disabled={save.isPending} className="settings-fields">
          <OptionRows
            title="任務類型"
            colors={draft.color_presets ?? []}
            options={draft.workflows}
            defaultID={draft.default_type}
            onDefault={(id) => setDraft({ ...draft, default_type: id })}
            onChange={(options, defaultType) =>
              setDraft({
                ...draft,
                default_type: defaultType ?? draft.default_type,
                workflows: options.map((o) => ({
                  ...o,
                  stages: draft.workflows.find((w) => w.id === o.id)
                    ?.stages ?? [
                    {
                      id: 'initial',
                      name: '待開始',
                      color: nextOptionColor([], draft.color_presets ?? []),
                      disabled: false,
                    },
                  ],
                  default_stage:
                    draft.workflows.find((w) => w.id === o.id)?.default_stage ??
                    'initial',
                })),
              })
            }
          />
          {draft.workflows.map((w) => (
            <OptionRows
              key={w.id}
              colors={draft.color_presets ?? []}
              title={`${w.name || '新類型'}流程階段`}
              options={w.stages}
              defaultID={w.default_stage}
              disabled={w.disabled}
              onDefault={(id) =>
                setDraft({
                  ...draft,
                  workflows: draft.workflows.map((item) =>
                    item.id === w.id ? { ...item, default_stage: id } : item,
                  ),
                })
              }
              onChange={(stages, defaultStage) =>
                setDraft({
                  ...draft,
                  workflows: draft.workflows.map((item) =>
                    item.id === w.id
                      ? {
                          ...item,
                          stages,
                          default_stage: defaultStage ?? item.default_stage,
                        }
                      : item,
                  ),
                })
              }
            />
          ))}
          <OptionRows
            title="優先順序"
            colors={draft.color_presets ?? []}
            numeric
            options={draft.priorities}
            defaultID={String(draft.default_priority)}
            onDefault={(id) =>
              setDraft({ ...draft, default_priority: Number(id) })
            }
            onChange={(priorities, defaultPriority) =>
              setDraft({
                ...draft,
                priorities,
                default_priority:
                  defaultPriority === undefined
                    ? draft.default_priority
                    : Number(defaultPriority),
              })
            }
          />
        </fieldset>
        <div className="form-actions">
          <Button disabled={save.isPending || stale}>
            {save.isPending ? '儲存中…' : '儲存選項設定'}
          </Button>
        </div>
      </form>
      {message && <p role={save.isError ? 'alert' : 'status'}>{message}</p>}
    </div>
  )
}

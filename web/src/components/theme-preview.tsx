import type { CSSProperties } from 'react'
import type { ThemeDraft } from '@/lib/theme'

export function previewStyle(theme: ThemeDraft): CSSProperties {
  return Object.fromEntries(
    Object.entries(theme.colors).map(([key, value]) => [
      `--preview-${key}`,
      value,
    ]),
  ) as CSSProperties
}

export function ThemePreview({ theme }: { theme: ThemeDraft }) {
  return (
    <span
      className="theme-preview"
      aria-hidden="true"
      style={previewStyle(theme)}
    >
      <span className="theme-preview-sidebar">
        <span />
        <span />
        <span />
      </span>
      <span className="theme-preview-content">
        <span className="theme-preview-heading" />
        <span className="theme-preview-entry" />
        <span className="theme-preview-task">
          <i />
          <span />
        </span>
        <span className="theme-preview-task">
          <i />
          <span />
        </span>
      </span>
    </span>
  )
}

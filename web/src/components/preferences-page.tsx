import { Bot, Database, Languages, Palette, PanelLeft } from 'lucide-react'
import { useRef, useState } from 'react'
import { AgentPreferences } from '@/components/agent-preferences'
import { AppearancePreferences } from '@/components/appearance-preferences'
import { DataCleanupPreferences } from '@/components/data-cleanup-preferences'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { type ThemeController } from '@/lib/theme'
import { languages, useLanguage, type Locale } from '@/lib/i18n'

type Section = 'appearance' | 'sidebar' | 'agent' | 'data' | 'language'

export function PreferencesPage({
  appearance,
  showToday,
  onShowTodayChange,
}: {
  appearance: ThemeController
  showToday: boolean
  onShowTodayChange: (show: boolean) => void
}) {
  const { t, locale, setLocale, storageFailed } = useLanguage()
  const [activeSection, setActiveSection] = useState<Section>('appearance')
  const heading = useRef<HTMLHeadingElement>(null)
  const sections = [
    {
      id: 'appearance',
      label: t('appearance'),
      icon: Palette,
      content: <AppearancePreferences appearance={appearance} />,
    },
    {
      id: 'language',
      label: t('language'),
      icon: Languages,
      content: (
        <div className="preferences-card">
          <label className="field">
            <span>{t('displayLanguage')}</span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              {languages.map(({ code, label }) => (
                <option key={code} lang={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {storageFailed && <p role="alert">{t('languageStorageFailed')}</p>}
        </div>
      ),
    },
    {
      id: 'sidebar',
      label: t('sidebar'),
      icon: PanelLeft,
      content: (
        <div className="preferences-card">
          <label className="preferences-checkbox">
            <Checkbox
              checked={showToday}
              onCheckedChange={(checked) => onShowTodayChange(checked === true)}
            />
            <span>{t('showTodayTab')}</span>
          </label>
        </div>
      ),
    },
    {
      id: 'agent',
      label: t('localAgent'),
      icon: Bot,
      content: <AgentPreferences />,
    },
    {
      id: 'data',
      label: t('localData'),
      icon: Database,
      content: <DataCleanupPreferences />,
    },
  ] as const

  return (
    <div className="preferences-page">
      <h1 className="preferences-heading" ref={heading}>
        {t('settings')}
      </h1>
      <div className="preferences-layout">
        <nav className="preferences-nav" aria-label={t('settingsCategories')}>
          {sections.map(({ id, icon: Icon, label }) => (
            <Button
              key={id}
              variant="ghost"
              type="button"
              aria-controls={`preferences-${id}`}
              aria-current={id === activeSection ? 'true' : undefined}
              onClick={() => {
                if (id === activeSection) return
                setActiveSection(id)
                heading.current?.scrollIntoView({ block: 'nearest' })
              }}
            >
              <Icon aria-hidden="true" />
              {label}
            </Button>
          ))}
        </nav>
        <div className="preferences-panels">
          {sections.map(({ id, label, content }) => (
            <section
              key={id}
              className="preferences-panel"
              id={`preferences-${id}`}
              aria-labelledby={`preferences-heading-${id}`}
              hidden={id !== activeSection}
            >
              <h2 id={`preferences-heading-${id}`}>{label}</h2>
              {content}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

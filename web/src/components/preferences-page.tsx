import { Bot, Palette, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AgentPreferences } from '@/components/agent-preferences'
import { AppearancePreferences } from '@/components/appearance-preferences'
import { DataCleanupPreferences } from '@/components/data-cleanup-preferences'
import { LoginItemPreferences } from '@/components/login-item-preferences'
import { SyncPreferences } from '@/components/sync-preferences'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { isDesktop } from '@/lib/desktop'
import { isCloudWeb } from '@/lib/environment'
import { type ThemeController } from '@/lib/theme'
import { languages, useLanguage, type LanguagePreference } from '@/lib/i18n'
import { footerNavigation, type FooterNavItem } from '@/lib/sidebar-preferences'

type Section = 'general' | 'appearance' | 'agent'

export function PreferencesPage({
  open,
  appearance,
  showToday,
  footerItems,
  onShowTodayChange,
  onFooterChange,
}: {
  open: boolean
  appearance: ThemeController
  showToday: boolean
  footerItems: FooterNavItem[]
  onShowTodayChange: (show: boolean) => void
  onFooterChange: (id: FooterNavItem, move: boolean) => void
}) {
  const { t, preference, setPreference, storageFailed } = useLanguage()
  const [activeSection, setActiveSection] = useState<Section>('general')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!open) setActiveSection('general')
  }, [open])
  const sections = [
    {
      id: 'general',
      label: t('general'),
      icon: Settings2,
      content: (
        <div className="preferences-general">
          <section aria-labelledby="preferences-language-heading">
            <h3 id="preferences-language-heading">{t('language')}</h3>
            <div className="preferences-card">
              <label className="field">
                <span>{t('displayLanguage')}</span>
                <select
                  value={preference}
                  onChange={(event) =>
                    setPreference(event.target.value as LanguagePreference)
                  }
                >
                  <option value="system">{t('followSystem')}</option>
                  {languages.map(({ code, label }) => (
                    <option key={code} lang={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {storageFailed && (
                <p role="alert">{t('languageStorageFailed')}</p>
              )}
            </div>
          </section>
          {isDesktop() && open && activeSection === 'general' && (
            <LoginItemPreferences />
          )}
          <section aria-labelledby="preferences-sidebar-heading">
            <h3 id="preferences-sidebar-heading">{t('sidebar')}</h3>
            <div className="preferences-card">
              <label className="preferences-checkbox">
                <Checkbox
                  checked={showToday}
                  onCheckedChange={(checked) =>
                    onShowTodayChange(checked === true)
                  }
                />
                <span>{t('showTodayTab')}</span>
              </label>
              {footerNavigation.map((id) => (
                <label className="preferences-checkbox" key={id}>
                  <Checkbox
                    checked={footerItems.includes(id)}
                    onCheckedChange={(checked) =>
                      onFooterChange(id, checked === true)
                    }
                  />
                  <span>
                    {t(
                      'moveAboveRecentlyDeleted',
                      t(id === 'active' ? 'tasks' : 'completed'),
                    )}
                  </span>
                </label>
              ))}
            </div>
          </section>
          {isDesktop() && <SyncPreferences />}
          {!isCloudWeb && (
            <section aria-labelledby="preferences-local-data-heading">
              <h3 id="preferences-local-data-heading">{t('localData')}</h3>
              <DataCleanupPreferences />
            </section>
          )}
        </div>
      ),
    },
    {
      id: 'appearance',
      label: t('appearance'),
      icon: Palette,
      content: <AppearancePreferences appearance={appearance} />,
    },
    {
      id: 'agent',
      label: t('agents'),
      icon: Bot,
      content: <AgentPreferences />,
    },
  ] as const
  const availableSections = sections.filter(
    ({ id }) => !isCloudWeb || id !== 'agent',
  )

  return (
    <div className="preferences-page">
      <h1 className="preferences-heading" ref={heading}>
        {t('settings')}
      </h1>
      <div className="preferences-layout">
        <nav className="preferences-nav" aria-label={t('settingsCategories')}>
          {availableSections.map(({ id, icon: Icon, label }) => (
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
          {availableSections.map(({ id, label, content }) => (
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

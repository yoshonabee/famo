import { Bot, Database, Palette, PanelLeft } from 'lucide-react'
import { useRef, useState } from 'react'
import { AgentPreferences } from '@/components/agent-preferences'
import { AppearancePreferences } from '@/components/appearance-preferences'
import { DataCleanupPreferences } from '@/components/data-cleanup-preferences'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { type ThemeController } from '@/lib/theme'

type Section = 'appearance' | 'sidebar' | 'agent' | 'data'

export function PreferencesPage({
  appearance,
  showToday,
  onShowTodayChange,
}: {
  appearance: ThemeController
  showToday: boolean
  onShowTodayChange: (show: boolean) => void
}) {
  const [activeSection, setActiveSection] = useState<Section>('appearance')
  const heading = useRef<HTMLHeadingElement>(null)
  const sections = [
    {
      id: 'appearance',
      label: '外觀',
      icon: Palette,
      content: <AppearancePreferences appearance={appearance} />,
    },
    {
      id: 'sidebar',
      label: '側邊欄',
      icon: PanelLeft,
      content: (
        <div className="preferences-card">
          <label className="preferences-checkbox">
            <Checkbox
              checked={showToday}
              onCheckedChange={(checked) => onShowTodayChange(checked === true)}
            />
            <span>顯示預設的「今日」分頁</span>
          </label>
        </div>
      ),
    },
    {
      id: 'agent',
      label: '本機 Agent',
      icon: Bot,
      content: <AgentPreferences />,
    },
    {
      id: 'data',
      label: '本機資料',
      icon: Database,
      content: <DataCleanupPreferences />,
    },
  ] as const

  return (
    <div className="preferences-page">
      <h1 className="preferences-heading" ref={heading}>
        設定
      </h1>
      <div className="preferences-layout">
        <nav className="preferences-nav" aria-label="設定分類">
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

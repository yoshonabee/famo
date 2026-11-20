import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { request } from '@/lib/api'
import {
  agentTool,
  copyText,
  isDesktop,
  type AgentToolsState,
} from '@/lib/desktop'
import { useLanguage } from '@/lib/i18n'

type Workspace = { dir: string; prompt: string }

function CopyCommand({ command, label }: { command: string; label: string }) {
  const { t } = useLanguage()
  const [message, setMessage] = useState<'commandCopied' | 'copyFailed' | null>(
    null,
  )
  async function copy() {
    try {
      await copyText(command)
      setMessage('commandCopied')
    } catch {
      setMessage('copyFailed')
    }
  }
  return (
    <div className="agent-command">
      <span>{label}</span>
      <div className="agent-inline">
        <code>{command}</code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t('copyNamed', label)}
          onClick={() => void copy()}
        >
          {t('copy')}
        </Button>
      </div>
      {message && <p role="status">{t(message)}</p>}
    </div>
  )
}

function DesktopAgentTools() {
  const { t, errorText } = useLanguage()
  const client = useQueryClient()
  const status = useQuery({
    queryKey: ['agent-tools'],
    queryFn: () => agentTool<AgentToolsState>('Status'),
    retry: false,
  })
  const mutation = useMutation({
    mutationFn: ({
      method,
      enabled,
    }: {
      method: 'SetAPIEnabled' | 'InstallCLI' | 'RemoveCLI'
      enabled?: boolean
    }) =>
      enabled === undefined
        ? agentTool<void>(method)
        : agentTool<void>(method, enabled),
    onSettled: () => client.invalidateQueries({ queryKey: ['agent-tools'] }),
  })
  const state = status.data
  if (!state) {
    return status.isError ? (
      <div className="agent-inline">
        <p role="alert" className="inline-edit-error">
          {errorText(status.error)}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void status.refetch()}
        >
          {t('retry')}
        </Button>
      </div>
    ) : (
      <p role="status">{t('loadingAgentTools')}</p>
    )
  }
  return (
    <>
      <div className="agent-api">
        <label>
          <input
            type="checkbox"
            role="switch"
            checked={!!state.api_url}
            disabled={mutation.isPending}
            onChange={(event) =>
              mutation.mutate({
                method: 'SetAPIEnabled',
                enabled: event.target.checked,
              })
            }
          />
          {t('enableAgentApi')}
        </label>
        {state.api_url && <code>{state.api_url}</code>}
      </div>
      <div className="agent-inline">
        {state.cli_available && (
          <Button
            variant="outline"
            size="sm"
            disabled={mutation.isPending || !!state.cli_error}
            onClick={() => mutation.mutate({ method: 'InstallCLI' })}
          >
            {state.cli_installed ? t('updateCli') : t('installCli')}
          </Button>
        )}
        {state.cli_installed && (
          <Button
            variant="ghost"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ method: 'RemoveCLI' })}
          >
            {t('removeCli')}
          </Button>
        )}
        {state.cli_installed && (
          <span className="agent-cli-path">
            {t('cliInstalledAt')} <code>{state.cli_path}</code>
          </span>
        )}
      </div>
      {state.cli_error && (
        <p className="inline-edit-error" role="alert">
          {errorText(state.cli_error)}
        </p>
      )}
      {!state.cli_available && !state.cli_installed && (
        <p role="status">{t('cliMissing')}</p>
      )}
      {mutation.isError && (
        <p className="inline-edit-error" role="alert">
          {errorText(mutation.error)}
        </p>
      )}
      {state.skill_command && (
        <CopyCommand
          command={state.skill_command}
          label={t('skillInstallCommand')}
        />
      )}
    </>
  )
}

export function AgentPreferences() {
  const { t, errorText } = useLanguage()
  const client = useQueryClient()
  const desktop = isDesktop()
  const [draft, setDraft] = useState<Workspace | null>(null)
  const workspace = useQuery({
    queryKey: ['agent-workspace'],
    queryFn: ({ signal }) =>
      request<Workspace>('/agent/workspace', undefined, signal),
    retry: false,
  })
  const save = useMutation({
    mutationFn: (value: Workspace) =>
      request<Workspace>('/agent/workspace', value),
    onSuccess: (value) => {
      client.setQueryData(['agent-workspace'], value)
      setDraft(null)
    },
  })
  const picker = useMutation({
    mutationFn: () => agentTool<string>('ChooseWorkspace'),
    onSuccess: (dir) => {
      if (dir)
        setDraft((current) => ({
          ...(current ?? workspace.data ?? { prompt: '' }),
          dir,
        }))
    },
  })
  const value = draft ?? workspace.data
  const dirty =
    !!draft &&
    (draft.dir !== workspace.data?.dir ||
      draft.prompt !== workspace.data?.prompt)
  const busy = save.isPending || picker.isPending

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (value && dirty && !busy) save.mutate(value)
  }

  return (
    <div className="agent-preferences">
      <section
        className="preferences-card"
        aria-labelledby="agent-tools-heading"
      >
        <h3 id="agent-tools-heading">{t('agentTools')}</h3>
        {desktop ? (
          <DesktopAgentTools />
        ) : (
          <>
            <p className="preferences-description">
              {t('agentWebDescription')}
            </p>
            <CopyCommand
              command="./bin/famo-agent cli install"
              label={t('cliInstallCommand')}
            />
            <CopyCommand
              command="./bin/famo-agent skill install"
              label={t('skillInstallCommand')}
            />
          </>
        )}
      </section>
      <section
        className="preferences-card"
        aria-labelledby="agent-workspace-heading"
      >
        <h3 id="agent-workspace-heading">{t('defaultWorkspace')}</h3>
        {value ? (
          <form className="agent-workspace" onSubmit={submit}>
            <div className="agent-inline agent-workspace-path">
              <label className="field">
                <span>{t('workspacePath')}</span>
                <input
                  value={value.dir}
                  placeholder={t('workspacePlaceholder')}
                  disabled={busy}
                  onChange={(event) =>
                    setDraft({ ...value, dir: event.target.value })
                  }
                />
              </label>
              {desktop && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => picker.mutate()}
                >
                  {t('chooseFolder')}
                </Button>
              )}
            </div>
            <label className="field">
              <span>{t('workspaceInstructions')}</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={value.prompt}
                placeholder={t('workspacePromptPlaceholder')}
                disabled={busy}
                onChange={(event) =>
                  setDraft({ ...value, prompt: event.target.value })
                }
              />
            </label>
            <div className="agent-inline">
              <Button type="submit" size="sm" disabled={busy || !dirty}>
                {t('saveWorkspace')}
              </Button>
              {save.isSuccess && !dirty && (
                <span role="status">{t('workspaceSaved')}</span>
              )}
            </div>
            {(save.isError || picker.isError) && (
              <p role="alert" className="inline-edit-error">
                {errorText(save.error ?? picker.error)}
              </p>
            )}
          </form>
        ) : workspace.isError ? (
          <div className="agent-inline">
            <p role="alert" className="inline-edit-error">
              {errorText(workspace.error)}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void workspace.refetch()}
            >
              {t('retry')}
            </Button>
          </div>
        ) : (
          <p role="status">{t('loadingWorkspace')}</p>
        )}
      </section>
    </div>
  )
}

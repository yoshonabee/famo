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

type Workspace = { dir: string; prompt: string }

function CopyCommand({ command, label }: { command: string; label: string }) {
  const [message, setMessage] = useState('')
  async function copy() {
    try {
      await copyText(command)
      setMessage('已複製指令')
    } catch {
      setMessage('無法複製，請手動選取指令。')
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
          aria-label={`複製 ${label}`}
          onClick={() => void copy()}
        >
          複製
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  )
}

function DesktopAgentTools() {
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
          {status.error.message}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void status.refetch()}
        >
          重試
        </Button>
      </div>
    ) : (
      <p role="status">正在讀取 Agent 工具設定…</p>
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
          開啟本機 Agent API
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
            {state.cli_installed ? '更新 CLI' : '安裝 CLI'}
          </Button>
        )}
        {state.cli_installed && (
          <Button
            variant="ghost"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ method: 'RemoveCLI' })}
          >
            移除 CLI
          </Button>
        )}
        {state.cli_installed && (
          <span className="agent-cli-path">
            CLI 已安裝至 <code>{state.cli_path}</code>
          </span>
        )}
      </div>
      {state.cli_error && (
        <p className="inline-edit-error" role="alert">
          {state.cli_error}
        </p>
      )}
      {!state.cli_available && !state.cli_installed && (
        <p role="status">此桌面建置缺少 CLI，請使用包含 CLI 的 Famo.app。</p>
      )}
      {mutation.isError && (
        <p className="inline-edit-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {state.skill_command && (
        <CopyCommand command={state.skill_command} label="Skill 安裝指令" />
      )}
    </>
  )
}

export function AgentPreferences() {
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
    <section
      className="agent-preferences"
      aria-labelledby="agent-preferences-heading"
    >
      <h2 id="agent-preferences-heading">本機 Agent</h2>
      {desktop ? (
        <DesktopAgentTools />
      ) : (
        <>
          <p className="preferences-description">
            網頁版與 Agent 共用本機服務。桌面版可單獨開關 Agent API。
          </p>
          <CopyCommand
            command="./bin/famo-agent cli install"
            label="CLI 安裝指令"
          />
          <CopyCommand
            command="./bin/famo-agent skill install"
            label="Skill 安裝指令"
          />
        </>
      )}
      {value ? (
        <form className="agent-workspace" onSubmit={submit}>
          <div className="agent-inline agent-workspace-path">
            <label className="field">
              <span>工作區路徑</span>
              <input
                value={value.dir}
                placeholder="/Users/你/project"
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
                選擇資料夾
              </Button>
            )}
          </div>
          <label className="field">
            <span>工作區指引（選填）</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={value.prompt}
              placeholder="例如先看 docs/decisions/，修改後端後跑 Go 測試。"
              disabled={busy}
              onChange={(event) =>
                setDraft({ ...value, prompt: event.target.value })
              }
            />
          </label>
          <div className="agent-inline">
            <Button type="submit" size="sm" disabled={busy || !dirty}>
              儲存工作區
            </Button>
            {save.isSuccess && !dirty && (
              <span role="status">工作區已儲存</span>
            )}
          </div>
          {(save.isError || picker.isError) && (
            <p role="alert" className="inline-edit-error">
              {save.error?.message ?? picker.error?.message}
            </p>
          )}
        </form>
      ) : workspace.isError ? (
        <div className="agent-inline">
          <p role="alert" className="inline-edit-error">
            {workspace.error.message}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void workspace.refetch()}
          >
            重試
          </Button>
        </div>
      ) : (
        <p role="status">正在讀取工作區…</p>
      )}
    </section>
  )
}

import { Check, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Task } from '../src/lib/api'
import {
  CollectionsPanel,
  sortedBoards,
  sortedProjects,
} from './collections-panel'
import { useCollections } from './use-collections'
import {
  operationFor,
  pull,
  push,
  SyncError,
  type Operation,
} from './sync-client'
import './style.css'

const storageKey = 'famo.sync.pending.v1'

function readPending(): Operation | null {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
  } catch {
    return null
  }
}

function savePending(operation: Operation | null) {
  try {
    if (operation) sessionStorage.setItem(storageKey, JSON.stringify(operation))
    else sessionStorage.removeItem(storageKey)
  } catch {
    // The current page still holds the pending operation if storage is blocked.
  }
}

function errorText(error: unknown) {
  if (error instanceof SyncError && [401, 403].includes(error.status))
    return '登入已失效或沒有存取權限，請重新載入頁面。'
  return '目前無法連線同步，請再試一次。'
}

function newTask(title: string, projectID: string): Task {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID().replaceAll('-', ''),
    title,
    scheduled_date: '',
    description: '',
    project_id: projectID || undefined,
    completed_at: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
    version: 1,
    links: [],
  }
}

function MobileTasks() {
  const collections = useCollections()
  const refreshCollections = collections.refresh
  const [managing, setManaging] = useState(() => !!collections.pending)
  const [filter, setFilter] = useState('all')
  const [captureProject, setCaptureProject] = useState('')
  const [tasks, setTasks] = useState(() => new Map<string, Task>())
  const [pending, setPending] = useState(readPending)
  const [title, setTitle] = useState(() =>
    pending?.base_version === 0 ? pending.task.title : '',
  )
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [writeError, setWriteError] = useState('')
  const cursor = useRef(0)
  const activePull = useRef(false)
  const activePush = useRef(false)

  const apply = useCallback((updates: Task[]) => {
    if (!updates.length) return
    setTasks((current) => {
      const next = new Map(current)
      for (const task of updates) {
        if (task.version > (next.get(task.id)?.version ?? 0))
          next.set(task.id, task)
      }
      return next
    })
  }, [])

  const refreshTasks = useCallback(async () => {
    try {
      let more: boolean
      do {
        const page = await pull(cursor.current)
        apply(page.changes.map((change) => change.task))
        cursor.current = page.cursor
        more = page.has_more
      } while (more)
      setLoaded(true)
      setLoadError('')
    } catch (error) {
      setLoadError(errorText(error))
    }
  }, [apply])

  const refresh = useCallback(async () => {
    if (activePull.current) return
    activePull.current = true
    setRefreshing(true)
    try {
      await Promise.all([refreshTasks(), refreshCollections()])
    } finally {
      activePull.current = false
      setRefreshing(false)
    }
  }, [refreshCollections, refreshTasks])

  useEffect(() => {
    void refresh()
    const refreshWhenVisible = () => {
      if (!document.hidden) void refresh()
    }
    window.addEventListener('online', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    const timer = window.setInterval(refreshWhenVisible, 10_000)
    return () => {
      window.removeEventListener('online', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.clearInterval(timer)
    }
  }, [refresh])

  async function save(operation: Operation) {
    if (activePush.current) return
    activePush.current = true
    setPending(operation)
    savePending(operation)
    setSaving(true)
    setWriteError('')
    try {
      const result = await push(operation)
      if (result.kind === 'conflict') {
        if (result.current) apply([result.current])
        setWriteError('這項任務已在其他裝置更新，請確認最新狀態後再操作。')
      } else {
        apply([result.task])
        if (operation.base_version === 0) setTitle('')
      }
      setPending(null)
      savePending(null)
      void refresh()
    } catch (error) {
      if (
        error instanceof SyncError &&
        [400, 413, 422].includes(error.status)
      ) {
        setPending(null)
        savePending(null)
        setWriteError('無法儲存這次變更，請確認任務內容後重試。')
      } else {
        setWriteError(errorText(error))
      }
    } finally {
      activePush.current = false
      setSaving(false)
    }
  }

  function toggle(task: Task) {
    if (pending) return
    const updated = new Date().toISOString()
    void save(
      operationFor({
        ...task,
        completed_at: task.completed_at ? null : updated,
        updated_at: updated,
        version: task.version + 1,
      }),
    )
  }

  const projects = sortedProjects(collections.snapshot?.projects ?? [])
  const boards = sortedBoards(collections.snapshot?.boards ?? [])
  const projectByID = new Map(projects.map((entry) => [entry.id, entry]))
  const currentProject = projects.find(({ id }) => filter === `project:${id}`)
  const currentBoard = boards.find(({ id }) => filter === `board:${id}`)
  const unclassified = filter === 'unclassified'
  const boardProjects = currentBoard
    ? projects.filter(({ id }) => currentBoard.project_ids.includes(id))
    : []
  const boardCaptureProject =
    boardProjects.length === 1
      ? boardProjects[0].id
      : boardProjects.some(({ id }) => id === captureProject)
        ? captureProject
        : ''
  const targetProject = currentProject?.id ?? boardCaptureProject
  const canCapture = !currentBoard || !!targetProject
  const visible = [...tasks.values()].filter((task) => {
    if (task.deleted_at) return false
    if (currentProject) return task.project_id === currentProject.id
    const projectID = task.project_id ?? ''
    if (unclassified) return !projectByID.has(projectID)
    if (currentBoard) return currentBoard.project_ids.includes(projectID)
    return true
  })
  const open = visible
    .filter((task) => !task.completed_at)
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id),
    )
  const completed = visible
    .filter((task) => task.completed_at)
    .sort(
      (a, b) =>
        (b.completed_at ?? '').localeCompare(a.completed_at ?? '') ||
        a.id.localeCompare(b.id),
    )

  function taskList(items: Task[], done: boolean) {
    return (
      <ul className="task-list">
        {items.map((task) => (
          <li key={task.id} className={done ? 'task done' : 'task'}>
            <label>
              <input
                type="checkbox"
                checked={done}
                disabled={!!pending}
                onChange={() => toggle(task)}
              />
              <span className="check-box" aria-hidden="true">
                {done && <Check size={14} />}
              </span>
              <span className="task-title">{task.title}</span>
            </label>
            {task.scheduled_date && (
              <time dateTime={task.scheduled_date}>{task.scheduled_date}</time>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <main>
      <header>
        <div className="brand">
          <img src="/famo-mark.svg" width="27" height="27" alt="" /> Famo
        </div>
        <button
          className="refresh"
          type="button"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {refreshing ? '同步中' : '同步'}
        </button>
      </header>
      {collections.loadError && (
        <p className="notice error" role="alert">
          {collections.loadError}
        </p>
      )}
      {managing && collections.snapshot ? (
        <CollectionsPanel
          snapshot={collections.snapshot}
          pending={collections.pending}
          saving={collections.saving}
          writeError={collections.writeError}
          save={collections.save}
          onClose={() => setManaging(false)}
        />
      ) : (
        <>
          <h1>任務</h1>
          {collections.snapshot && (
            <div className="collection-toolbar">
              <label>
                <span>任務範圍</span>
                <select
                  value={
                    currentProject || currentBoard || unclassified
                      ? filter
                      : 'all'
                  }
                  onChange={(event) => {
                    setFilter(event.target.value)
                    setCaptureProject('')
                  }}
                >
                  <option value="all">全部任務</option>
                  <option value="unclassified">未分類</option>
                  {projects.length > 0 && (
                    <optgroup label="Projects">
                      {projects.map((project) => (
                        <option
                          value={`project:${project.id}`}
                          key={project.id}
                        >
                          {project.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {boards.length > 0 && (
                    <optgroup label="Boards">
                      {boards.map((board) => (
                        <option value={`board:${board.id}`} key={board.id}>
                          {board.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <button type="button" onClick={() => setManaging(true)}>
                管理 Project 與 Board
              </button>
            </div>
          )}
          {currentBoard && boardProjects.length > 1 && (
            <label className="collection-capture-project">
              新增至
              <select
                aria-label="任務 Project"
                value={boardCaptureProject}
                onChange={(event) => setCaptureProject(event.target.value)}
              >
                <option value="">選擇 Project</option>
                {boardProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <form
            className="capture"
            onSubmit={(event) => {
              event.preventDefault()
              if (title.trim() && !pending && canCapture)
                void save(operationFor(newTask(title.trim(), targetProject)))
            }}
          >
            <input
              aria-label="新增任務"
              placeholder="新增任務…"
              value={pending?.base_version === 0 ? pending.task.title : title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              readOnly={pending?.base_version === 0}
            />
            <button
              type="submit"
              aria-label="新增"
              title="新增"
              disabled={!title.trim() || !!pending || !canCapture}
            >
              <Plus size={22} aria-hidden="true" />
            </button>
          </form>
          {currentBoard && boardProjects.length === 0 && (
            <p className="notice">
              先為這個 Board 選擇 Project，即可在這裡新增任務。
            </p>
          )}
          {loadError && (
            <p className="notice error" role="alert">
              {loadError}
            </p>
          )}
          {writeError && (
            <p className="notice error" role="alert">
              {writeError}
            </p>
          )}
          {pending && (
            <div className="notice" role="status">
              <span>{saving ? '正在儲存變更…' : '這次變更尚未確認。'}</span>
              {!saving && (
                <button type="button" onClick={() => void save(pending)}>
                  重試儲存
                </button>
              )}
            </div>
          )}
          {loaded && (
            <>
              <section aria-labelledby="open-tasks">
                <h2 id="open-tasks">
                  待辦 <span>{open.length}</span>
                </h2>
                {open.length ? (
                  taskList(open, false)
                ) : (
                  <p className="empty">目前沒有待辦任務。</p>
                )}
              </section>
              {completed.length > 0 && (
                <section aria-labelledby="completed-tasks">
                  <h2 id="completed-tasks">
                    已完成 <span>{completed.length}</span>
                  </h2>
                  {taskList(completed, true)}
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<MobileTasks />)

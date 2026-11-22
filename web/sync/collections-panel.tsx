import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import {
  boardIcons,
  type Board,
  type CollectionOperation,
  type Collections,
  type Project,
} from './collections-client'
import type { useCollections } from './use-collections'

type CollectionState = ReturnType<typeof useCollections>
type Editor = {
  kind: 'project' | 'board'
  id: string
  name: string
  isNew: boolean
  version: number
  color: string
  icon: Board['icon']
  projectIDs: string[]
}

const defaultColor = '#64748B'

export function sortedProjects(projects: Project[]) {
  return [...projects].sort(
    (a, b) =>
      (a.position ?? Infinity) - (b.position ?? Infinity) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  )
}

export function sortedBoards(boards: Board[]) {
  return [...boards].sort((a, b) => a.name.localeCompare(b.name))
}

function normalizedName(name: string) {
  return name.trim().replace(/[A-Z]/g, (char) => char.toLowerCase())
}

type Props = {
  snapshot: Collections
  pending: CollectionState['pending']
  saving: boolean
  writeError: string
  save: CollectionState['save']
  onClose: () => void
}

export function CollectionsPanel({
  snapshot,
  pending,
  saving,
  writeError,
  save,
  onClose,
}: Props) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [reviewingConflict, setReviewingConflict] = useState(false)
  const projects = sortedProjects(snapshot.projects)
  const boards = sortedBoards(snapshot.boards)
  const remoteEntry =
    editor?.kind === 'project'
      ? projects.find(({ id }) => id === editor.id)
      : boards.find(({ id }) => id === editor?.id)

  function edit(kind: Editor['kind'], entry?: Project | Board) {
    setEditor({
      kind,
      id: entry?.id ?? crypto.randomUUID().replaceAll('-', ''),
      name: entry?.name ?? '',
      isNew: !entry,
      version: snapshot.version,
      color: entry && 'color' in entry ? entry.color : defaultColor,
      icon: entry && 'icon' in entry ? entry.icon : 'layout-grid',
      projectIDs: entry && 'project_ids' in entry ? entry.project_ids : [],
    })
    setConfirmDelete(false)
    setValidationError('')
    setReviewingConflict(false)
  }

  async function persist(operation: CollectionOperation) {
    const result = await save(operation)
    if (result?.kind === 'conflict') {
      setReviewingConflict(true)
      setEditor((current) =>
        current ? { ...current, version: result.current.version } : current,
      )
    } else if (result?.kind === 'saved') {
      setEditor(null)
      setConfirmDelete(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editor && !pending) void update(editor, false)
  }

  function update(current: Editor, removing: boolean) {
    setValidationError('')
    const editingProject = current.kind === 'project'
    const name = current.name.trim()
    const entries = editingProject ? projects : boards
    const exists = entries.some((entry) => entry.id === current.id)
    if (!current.isNew && !exists) {
      setValidationError('這個項目已在其他裝置刪除。')
      return
    }
    if (
      !removing &&
      (!name || Array.from(name).length > 80 || /[\0\r\n]/.test(name))
    ) {
      setValidationError('名稱須為 1 到 80 個字元，且不可換行。')
      return
    }
    if (
      !removing &&
      entries.some(
        (entry) =>
          entry.id !== current.id &&
          normalizedName(entry.name) === normalizedName(name),
      )
    ) {
      setValidationError('這個名稱已在使用。')
      return
    }

    const operation: CollectionOperation = {
      base_version: current.version,
      operation_id: crypto.randomUUID(),
      projects: snapshot.projects,
      boards: snapshot.boards,
    }
    if (editingProject) {
      operation.projects = projects.filter(({ id }) => id !== current.id)
      if (removing) {
        operation.boards = boards.map((board) => ({
          ...board,
          project_ids: board.project_ids.filter((id) => id !== current.id),
        }))
      } else {
        const previous = projects.find(({ id }) => id === current.id)
        const highestPosition = projects.reduce(
          (highest, project) => Math.max(highest, project.position ?? -1),
          -1,
        )
        operation.projects.push({
          id: current.id,
          name,
          color: current.color.toUpperCase(),
          position: previous
            ? previous.position
            : highestPosition >= 0
              ? highestPosition + 1
              : null,
        })
      }
    } else {
      operation.boards = boards.filter(({ id }) => id !== current.id)
      if (!removing) {
        const projectIDs = new Set(projects.map(({ id }) => id))
        operation.boards.push({
          id: current.id,
          name,
          icon: current.icon,
          project_ids: current.projectIDs.filter((id) => projectIDs.has(id)),
        })
      }
    }
    void persist(operation)
  }

  return (
    <section className="collection-panel" aria-label="管理 Project 與 Board">
      <div className="collection-heading">
        <h1>Project 與 Board</h1>
        <button type="button" onClick={onClose} disabled={!!pending}>
          返回任務
        </button>
      </div>
      {writeError && (
        <p className="notice error" role="alert">
          {writeError}
        </p>
      )}
      {pending && (
        <div className="notice" role="status">
          <span>{saving ? '正在儲存…' : '這次變更尚未確認。'}</span>
          {!saving && (
            <button type="button" onClick={() => void persist(pending)}>
              重試 Project 與 Board
            </button>
          )}
        </div>
      )}
      {editor ? (
        <form className="collection-editor" onSubmit={submit}>
          <fieldset disabled={!!pending}>
            <legend>
              {editor.isNew ? '新增' : '編輯'}{' '}
              {editor.kind === 'project' ? 'Project' : 'Board'}
            </legend>
            <label className="collection-field">
              {editor.kind === 'project' ? 'Project 名稱' : 'Board 名稱'}
              <input
                value={editor.name}
                onChange={(event) =>
                  setEditor({ ...editor, name: event.target.value })
                }
                required
              />
            </label>
            {editor.kind === 'project' ? (
              <label className="collection-field">
                Project 顏色
                <input
                  type="color"
                  value={editor.color.toLowerCase()}
                  onChange={(event) =>
                    setEditor({ ...editor, color: event.target.value })
                  }
                />
              </label>
            ) : (
              <>
                <label className="collection-field">
                  Board 圖示
                  <select
                    aria-label="Board 圖示"
                    value={editor.icon}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        icon: event.target.value as Board['icon'],
                      })
                    }
                  >
                    {Object.entries(boardIcons).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="collection-projects">
                  <legend>顯示的 Projects</legend>
                  {projects.length === 0 && (
                    <p>建立 Project 後就能加入這個 Board。</p>
                  )}
                  {projects.map((project) => (
                    <label key={project.id}>
                      <input
                        type="checkbox"
                        checked={editor.projectIDs.includes(project.id)}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            projectIDs: event.target.checked
                              ? [...editor.projectIDs, project.id]
                              : editor.projectIDs.filter(
                                  (id) => id !== project.id,
                                ),
                          })
                        }
                      />
                      {project.name}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            {reviewingConflict && remoteEntry && (
              <p className="notice collection-review">
                最新版本：{remoteEntry.name}
                {'color' in remoteEntry
                  ? ` · ${remoteEntry.color}`
                  : ` · ${boardIcons[remoteEntry.icon]} · ${
                      projects
                        .filter(({ id }) =>
                          remoteEntry.project_ids.includes(id),
                        )
                        .map(({ name }) => name)
                        .join('、') || '無 Project'
                    }`}
              </p>
            )}
            {validationError && (
              <p className="notice error" role="alert">
                {validationError}
              </p>
            )}
            {confirmDelete && (
              <p className="notice" role="status">
                {editor.kind === 'project'
                  ? '刪除後會移除 Board 篩選中的 Project，原有任務仍會保留。'
                  : '刪除後，原有任務和 Projects 仍會保留。'}
              </p>
            )}
            <div className="collection-actions">
              {confirmDelete ? (
                <>
                  <button
                    className="collection-delete"
                    type="button"
                    onClick={() => update(editor, true)}
                  >
                    確認刪除
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)}>
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button className="collection-save" type="submit">
                    儲存
                  </button>
                  <button type="button" onClick={() => setEditor(null)}>
                    取消
                  </button>
                  {!editor.isNew && (
                    <button
                      className="collection-delete"
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                    >
                      刪除 {editor.kind === 'project' ? 'Project' : 'Board'}
                    </button>
                  )}
                </>
              )}
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <div className="collection-heading">
            <h2>Projects</h2>
            <button
              type="button"
              disabled={!!pending}
              onClick={() => edit('project')}
            >
              <Plus size={15} aria-hidden="true" /> 新增 Project
            </button>
          </div>
          <ul className="collection-items">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  aria-label={`編輯 Project ${project.name}`}
                  disabled={!!pending}
                  onClick={() => edit('project', project)}
                >
                  <span
                    className="project-dot"
                    style={{ background: project.color }}
                  />
                  {project.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="collection-heading">
            <h2>Boards</h2>
            <button
              type="button"
              disabled={!!pending}
              onClick={() => edit('board')}
            >
              <Plus size={15} aria-hidden="true" /> 新增 Board
            </button>
          </div>
          <ul className="collection-items">
            {boards.map((board) => (
              <li key={board.id}>
                <button
                  type="button"
                  aria-label={`編輯 Board ${board.name}`}
                  disabled={!!pending}
                  onClick={() => edit('board', board)}
                >
                  <span className="board-icon-label" aria-hidden="true">
                    {boardIcons[board.icon]}
                  </span>
                  {board.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

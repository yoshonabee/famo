import type { Locale } from './i18n'

// API clients continue to receive the original error strings. Translate known
// errors at the UI boundary and preserve any diagnostic text from the server.
const errors = new Map([
  ['操作失敗，請重試', 'Something went wrong. Try again.'],
  ['資料存取失敗，請重試', 'Could not access the data. Try again.'],
  ['伺服器發生錯誤，請重試', 'A server error occurred. Try again.'],
  ['無效的輸入', 'Invalid input'],
  ['請填寫任務名稱', 'Enter a task name'],
  [
    '任務日期須為有效的 YYYY-MM-DD，或留空',
    'Enter a valid YYYY-MM-DD date or leave it blank',
  ],
  ['連結需要有效的 HTTP / HTTPS URL', 'Enter a valid HTTP or HTTPS URL'],
  ['標題不可空白', 'Enter a task title'],
  ['任務尚未完成', 'The task is incomplete'],
  ['請提供相關連結', 'Add a related link'],
  ['找不到指定的連結', 'The link could not be found'],
  ['刪除連結時不可同時新增連結', 'Delete and add links in separate operations'],
  ['任務已完成', 'The task is already completed'],
  ['不支援的操作', 'Unsupported action'],
  ['找不到任務', 'Task not found'],
  [
    '任務已被更新，請重新讀取後再操作',
    'The task has changed. Reload it and try again',
  ],
  [
    'Project 名稱須為 1 到 80 個字元，且不可換行',
    'Project names must be 1–80 characters and fit on one line',
  ],
  [
    'Project 顏色須為 #RRGGBB 色碼',
    'Project colors must use #RRGGBB hex codes',
  ],
  ['已有同名的 Project', 'A Project with that name already exists'],
  ['找不到 Project', 'Project not found'],
  ['找不到指定的 Project', 'The selected Project was not found'],
  ['Project 已被更新', 'The Project has changed'],
  ['排序至少需要兩個 Project', 'Select at least two Projects to reorder'],
  [
    'Project 列表已變更，請重新讀取後再排序',
    'The Project list has changed. Reload it and try again',
  ],
  [
    'Board 名稱須為 1 到 80 個字元，且不可換行',
    'Board names must be 1–80 characters and fit on one line',
  ],
  ['請選擇支援的 Board 圖示', 'Choose a supported Board icon'],
  ['Project ID 不可空白或重複', 'Project IDs must be unique and nonempty'],
  ['已有同名的 Board', 'A Board with that name already exists'],
  ['找不到 Board', 'Board not found'],
  ['Board 已被更新', 'The Board has changed'],
  [
    '請在 Famo 內變更 Project 工作區',
    'Change the Project workspace within Famo',
  ],
  ['工作區請使用完整路徑', 'Enter an absolute workspace path'],
  [
    '找不到工作區資料夾或無法存取',
    'The workspace folder could not be found or accessed',
  ],
  [
    '工作區指引最多 2000 字',
    'Workspace instructions must be 2,000 characters or shorter',
  ],
  ['請選擇至少一件任務', 'Select at least one task'],
  [
    '每件任務須有唯一的 ID 與有效版本',
    'Each task must have a unique ID and a valid version',
  ],
  ['排序至少需要兩件任務', 'Select at least two tasks to reorder'],
  ['任務 ID 不可空白或重複', 'Task IDs must be unique and nonempty'],
  [
    '排序包含不存在或已完成的任務，請重新讀取',
    'The order includes missing or completed tasks. Reload the list',
  ],
  ['請先確認永久清理', 'Confirm the permanent purge'],
  ['請只提供一個 JSON 物件', 'Send exactly one JSON object'],
  ['無效的 JSON', 'Invalid JSON'],
  ['請使用 application/json', 'Use application/json'],
  ['找不到 API', 'API not found'],
])

export function translateError(locale: Locale, error: string): string {
  if (locale === 'zh-TW' || !error) return error
  const direct = errors.get(error)
  if (direct) return direct

  const separator = error.indexOf('：')
  if (separator === -1) return error
  const prefix = errors.get(error.slice(0, separator))
  if (!prefix) return error

  const detail = error.slice(separator + 1)
  return `${prefix}: ${errors.get(detail) ?? detail}`
}

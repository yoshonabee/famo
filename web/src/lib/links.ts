export function linkLabel(value: string): string {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const parts = url.pathname.split('/').filter(Boolean)
    if (host === 'github.com' && parts.length >= 4) {
      const [, repo, kind, number] = parts
      if (/^\d+$/.test(number)) {
        if (kind === 'pull') return `${repo} PR #${number}`
        if (kind === 'issues') return `${repo} Issue #${number}`
      }
    }
    if (host === 'slack.com' || host.endsWith('.slack.com')) return 'Slack 討論'
    if (host === 'asana.com' || host.endsWith('.asana.com')) return 'Asana'
    if (host === 'docs.google.com' || host === 'drive.google.com') return '文件'
    return `${host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return value
  }
}

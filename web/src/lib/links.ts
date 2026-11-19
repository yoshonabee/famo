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
    if (host === 'slack.com' || host.endsWith('.slack.com')) return 'Slack'
    if (host === 'asana.com' || host.endsWith('.asana.com')) return 'Asana'
    if (
      host === 'claude.ai' &&
      /^\/(?:public\/)?artifact[s]?\/[^/]+/.test(url.pathname)
    )
      return 'Claude Artifact'
    if (host === 'docs.google.com') {
      const kind = url.pathname.match(
        /^\/(?:a\/[^/]+\/)?(document|presentation|spreadsheets|forms)\/(?:u\/\d+\/)?d\/[^/]+/,
      )?.[1]
      if (kind === 'document') return 'Google Doc'
      if (kind === 'presentation') return 'Google Slides'
      if (kind === 'spreadsheets') return 'Google Sheets'
      if (kind === 'forms') return 'Google Forms'
    }
    if (host === 'drive.google.com') return 'Google Drive'
    return `${host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return value
  }
}

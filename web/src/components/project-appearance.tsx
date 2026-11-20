import type { Project } from '@/lib/api'

export const projectColors = [
  { label: 'coralRed', value: '#E06464' },
  { label: 'amberOrange', value: '#D98738' },
  { label: 'mustardYellow', value: '#BD9229' },
  { label: 'forestGreen', value: '#4F9D69' },
  { label: 'teal', value: '#32958E' },
  { label: 'oceanBlue', value: '#4F87CC' },
  { label: 'lightPurple', value: '#8A6BCC' },
  { label: 'rosePink', value: '#C369A0' },
  { label: 'slateGray', value: '#64748B' },
] as const

export function ProjectColorDot({ color }: { color: string }) {
  return (
    <span
      className="project-color-dot"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  )
}

export function ProjectBadge({ project }: { project: Project }) {
  return (
    <span className="task-chip task-project" title={project.name}>
      <ProjectColorDot color={project.color} />
      <span>{project.name}</span>
    </span>
  )
}

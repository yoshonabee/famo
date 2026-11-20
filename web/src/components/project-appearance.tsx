import type { Project } from '@/lib/api'

export const projectColors = [
  { label: '珊瑚紅', value: '#E06464' },
  { label: '琥珀橙', value: '#D98738' },
  { label: '芥末黃', value: '#BD9229' },
  { label: '森林綠', value: '#4F9D69' },
  { label: '青綠', value: '#32958E' },
  { label: '海藍', value: '#4F87CC' },
  { label: '淡紫', value: '#8A6BCC' },
  { label: '玫瑰粉', value: '#C369A0' },
  { label: '石板灰', value: '#64748B' },
]

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

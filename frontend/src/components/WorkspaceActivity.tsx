import type { CSSProperties } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, GitBranch, HardDriveDownload, Router, Sparkles } from 'lucide-react'
import type { Deployment, DeploymentEvent } from '../api/client'
import { useWorkspaceEvents } from '../hooks/useWorkspaceEvents'

const EVENT_ICON: Record<DeploymentEvent['type'], typeof Clock3> = {
  deployment_created: Clock3,
  addons_provisioning: Clock3,
  addons_ready: CheckCircle2,
  clone_started: GitBranch,
  clone_completed: CheckCircle2,
  build_started: HardDriveDownload,
  build_completed: CheckCircle2,
  container_started: Sparkles,
  healthcheck_passed: CheckCircle2,
  route_configured: Router,
  runtime_live: Sparkles,
  redeploy_started: Clock3,
  traffic_shifted: Router,
  old_runtime_stopped: CheckCircle2,
  deployment_deleted: AlertTriangle,
  deployment_failed: AlertTriangle,
}

interface Props {
  deployments: Deployment[]
}

export function WorkspaceActivity({ deployments }: Props) {
  const { data: events = [], isLoading } = useWorkspaceEvents()
  const byId = new Map(deployments.map((deployment) => [deployment.id, deployment]))
  const summaries = summarizeDeployments(events)

  if (isLoading && events.length === 0) {
    return <div style={emptyStyle}>Loading deployment activity...</div>
  }

  if (summaries.length === 0) {
    return <div style={emptyStyle}>No deployment activity yet.</div>
  }

  return (
    <div style={feedStyle}>
      {summaries.map((summary) => {
        const deployment = byId.get(summary.deploymentId)
        const Icon = EVENT_ICON[summary.latest.type]
        const failed = summary.latest.type === 'deployment_failed'

        return (
          <div key={summary.deploymentId} style={eventRowStyle}>
            <div style={failed ? failedIconWrapStyle : iconWrapStyle}>
              <Icon size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={headlineStyle}>
                <strong style={serviceNameStyle}>{deployment?.name ?? summary.deploymentId}</strong>
                <span style={timeStyle}>{timeAgo(summary.latest.created_at)}</span>
              </div>
              <div style={messageStyle}>{summary.latest.message}</div>
              <div style={metaStyle}>
                <span>{deployment?.branch ?? 'main'}</span>
                <span>/</span>
                <span>{summary.total} activity events</span>
                {deployment?.status && (
                  <>
                    <span>/</span>
                    <span style={failed ? failedStatusStyle : statusStyle}>{deployment.status}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function summarizeDeployments(events: DeploymentEvent[]) {
  const grouped = new Map<string, { latest: DeploymentEvent; total: number }>()

  for (const event of events) {
    const existing = grouped.get(event.deployment_id)
    if (!existing) {
      grouped.set(event.deployment_id, { latest: event, total: 1 })
      continue
    }
    existing.total += 1
  }

  return [...grouped.entries()]
    .map(([deploymentId, value]) => ({
      deploymentId,
      latest: value.latest,
      total: value.total,
    }))
    .sort((a, b) => Date.parse(b.latest.created_at) - Date.parse(a.latest.created_at))
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const feedStyle: CSSProperties = {
  border: '1px solid var(--line)',
  display: 'grid',
}

const eventRowStyle: CSSProperties = {
  borderBottom: '1px solid var(--line)',
  display: 'grid',
  gap: 12,
  gridTemplateColumns: '34px minmax(0, 1fr)',
  padding: '14px 16px',
}

const iconWrapStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  color: 'var(--ink-muted)',
  display: 'flex',
  height: 28,
  justifyContent: 'center',
  width: 28,
}

const failedIconWrapStyle: CSSProperties = {
  ...iconWrapStyle,
  color: 'var(--danger)',
}

const headlineStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 10,
  justifyContent: 'space-between',
}

const serviceNameStyle: CSSProperties = {
  color: 'var(--ink)',
  fontSize: 14,
}

const timeStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-code)',
  fontSize: 11,
}

const messageStyle: CSSProperties = {
  color: 'var(--ink-soft)',
  fontSize: 13,
  lineHeight: 1.45,
  marginTop: 4,
}

const metaStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--ink-muted)',
  display: 'flex',
  flexWrap: 'wrap',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  gap: 7,
  marginTop: 8,
  textTransform: 'uppercase',
}

const statusStyle: CSSProperties = {
  color: 'var(--ink-soft)',
}

const failedStatusStyle: CSSProperties = {
  color: 'var(--danger)',
}

const emptyStyle: CSSProperties = {
  border: '1px solid var(--line)',
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  padding: 32,
  textAlign: 'center',
  textTransform: 'uppercase',
}

import type { CSSProperties } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Container,
  GitBranch,
  HardDriveDownload,
  Layers3,
  Router,
  Sparkles,
} from 'lucide-react'
import type { DeploymentEvent } from '../api/client'
import { useDeploymentEvents } from '../hooks/useDeploymentEvents'

const EVENT_STYLES: Record<DeploymentEvent['type'], {
  label: string
  icon: typeof Clock3
  tone: string
  rail: string
}> = {
  deployment_created: { label: 'Queued', icon: Clock3, tone: 'var(--blue)', rail: 'rgba(102,124,255,0.28)' },
  addons_provisioning: { label: 'Resources', icon: Layers3, tone: 'var(--amber)', rail: 'rgba(255,178,79,0.28)' },
  addons_ready: { label: 'Resources ready', icon: CheckCircle2, tone: 'var(--success)', rail: 'rgba(85,155,98,0.26)' },
  clone_started: { label: 'Clone', icon: GitBranch, tone: 'var(--blue)', rail: 'rgba(102,124,255,0.28)' },
  clone_completed: { label: 'Clone ready', icon: CheckCircle2, tone: 'var(--success)', rail: 'rgba(85,155,98,0.26)' },
  build_started: { label: 'Build', icon: HardDriveDownload, tone: 'var(--amber)', rail: 'rgba(255,178,79,0.28)' },
  build_completed: { label: 'Build ready', icon: CheckCircle2, tone: 'var(--success)', rail: 'rgba(85,155,98,0.26)' },
  container_started: { label: 'Container', icon: Container, tone: 'var(--blue)', rail: 'rgba(102,124,255,0.28)' },
  healthcheck_passed: { label: 'Health', icon: CheckCircle2, tone: 'var(--success)', rail: 'rgba(85,155,98,0.26)' },
  route_configured: { label: 'Ingress', icon: Router, tone: 'var(--ink)', rail: 'rgba(18,18,14,0.16)' },
  runtime_live: { label: 'Live', icon: Sparkles, tone: 'var(--success)', rail: 'rgba(85,155,98,0.26)' },
  redeploy_started: { label: 'Redeploy', icon: Clock3, tone: 'var(--blue)', rail: 'rgba(102,124,255,0.28)' },
  traffic_shifted: { label: 'Traffic shift', icon: Router, tone: 'var(--ink)', rail: 'rgba(18,18,14,0.16)' },
  old_runtime_stopped: { label: 'Cleanup', icon: CheckCircle2, tone: 'var(--ink-muted)', rail: 'rgba(18,18,14,0.10)' },
  deployment_deleted: { label: 'Delete', icon: AlertTriangle, tone: 'var(--ink-muted)', rail: 'rgba(18,18,14,0.10)' },
  deployment_failed: { label: 'Failed', icon: AlertTriangle, tone: 'var(--danger)', rail: 'rgba(210,67,67,0.24)' },
}

interface Props {
  deploymentId: string
  enabled: boolean
}

export function DeploymentTimeline({ deploymentId, enabled }: Props) {
  const { data: events = [], isLoading, error } = useDeploymentEvents(deploymentId, enabled)

  if (isLoading) {
    return <div style={emptyStyle}>Loading deployment timeline...</div>
  }

  if (error) {
    return <div style={emptyStyle}>Timeline unavailable right now.</div>
  }

  if (events.length === 0) {
    return <div style={emptyStyle}>No lifecycle events recorded yet.</div>
  }

  return (
    <div style={timelineStyle}>
      {events.map((event, index) => {
        const config = EVENT_STYLES[event.type]
        const Icon = config.icon
        const metadata = parseMetadata(event.metadata)
        return (
          <div key={event.id} style={itemStyle}>
            <div style={railWrapStyle}>
              <span style={{ ...dotStyle, background: config.tone }}>
                <Icon size={13} />
              </span>
              {index < events.length - 1 && <span style={{ ...railStyle, background: config.rail }} />}
            </div>
            <div style={contentStyle}>
              <div style={headlineStyle}>
                <span style={{ ...eventLabelStyle, color: config.tone }}>{config.label}</span>
                <span style={timeStyle}>{formatEventTime(event.created_at)}</span>
              </div>
              <div style={messageStyle}>{event.message}</div>
              {metadata.length > 0 && (
                <div style={metaRowStyle}>
                  {metadata.map(([key, value]) => (
                    <span key={`${event.id}-${key}`} style={metaPillStyle}>
                      {key}: {String(value)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function parseMetadata(raw: string): Array<[string, string | number | boolean | null]> {
  try {
    return Object.entries(JSON.parse(raw) as Record<string, string | number | boolean | null>)
      .filter(([, value]) => value !== null && value !== '')
  } catch {
    return []
  }
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const timelineStyle: CSSProperties = {
  display: 'grid',
  gap: 0,
}

const itemStyle: CSSProperties = {
  display: 'grid',
  gap: 14,
  gridTemplateColumns: '28px minmax(0, 1fr)',
  padding: '14px 0',
}

const railWrapStyle: CSSProperties = {
  alignItems: 'center',
  display: 'grid',
  gridTemplateRows: '20px 1fr',
  justifyItems: 'center',
}

const dotStyle: CSSProperties = {
  alignItems: 'center',
  borderRadius: 999,
  color: 'var(--paper)',
  display: 'flex',
  height: 20,
  justifyContent: 'center',
  width: 20,
}

const railStyle: CSSProperties = {
  marginTop: 4,
  width: 2,
}

const contentStyle: CSSProperties = {
  borderBottom: '1px solid var(--line)',
  display: 'grid',
  gap: 7,
  paddingBottom: 14,
}

const headlineStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 10,
  justifyContent: 'space-between',
}

const eventLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const timeStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-code)',
  fontSize: 11,
}

const messageStyle: CSSProperties = {
  color: 'var(--ink)',
  fontSize: 14,
  lineHeight: 1.45,
}

const metaRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const metaPillStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-code)',
  fontSize: 11,
  padding: '4px 7px',
}

const emptyStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontSize: 13,
  padding: '18px 0',
}

import type { CSSProperties, ReactNode } from 'react'
import { Activity, Box, Database, Globe, HardDriveDownload, Server } from 'lucide-react'
import type { Deployment } from '../api/client'
import { useDeploymentHealth } from '../hooks/useDeploymentHealth'

interface Props {
  deployment: Deployment
  enabled: boolean
}

export function DeploymentSystem({ deployment, enabled }: Props) {
  const { data: health = [] } = useDeploymentHealth(deployment.id, enabled)
  const samples = [...health].reverse()
  const healthySamples = samples.filter((sample) => sample.ok === 1).length
  const uptime = samples.length > 0 ? Math.round((healthySamples / samples.length) * 100) : null
  const avgLatency = samples.length > 0
    ? Math.round(
      samples
        .filter((sample) => sample.latency_ms !== null)
        .reduce((total, sample) => total + (sample.latency_ms ?? 0), 0) /
      Math.max(1, samples.filter((sample) => sample.latency_ms !== null).length),
    )
    : null

  return (
    <div style={systemStyle}>
      <section style={metricsGridStyle}>
        <MetricCard label="Health uptime" value={uptime === null ? 'Pending' : `${uptime}%`} icon={<Activity size={16} />} />
        <MetricCard label="Avg latency" value={avgLatency === null ? 'n/a' : `${avgLatency}ms`} icon={<Globe size={16} />} />
        <MetricCard label="Build duration" value={formatDuration(deployment.build_duration_ms)} icon={<HardDriveDownload size={16} />} />
        <MetricCard label="Deploy duration" value={formatDuration(deployment.deploy_duration_ms)} icon={<Server size={16} />} />
      </section>

      <section style={panelStyle}>
        <div style={panelHeaderStyle}>Application profile</div>
        <div style={kvGridStyle}>
          <KeyValue label="Language" value={deployment.detected_language ?? 'Unknown'} />
          <KeyValue label="Framework" value={deployment.detected_framework ?? 'Unknown'} />
          <KeyValue label="Port" value={String(deployment.app_port)} />
          <KeyValue label="Start command" value={deployment.detected_start_command ?? 'Auto-detected by Railpack'} />
          <KeyValue label="Last failure" value={deployment.last_failure_stage ? `${deployment.last_failure_stage}${deployment.last_failure_at ? ` / ${timeAgo(deployment.last_failure_at)}` : ''}` : 'None'} />
        </div>
      </section>

      <section style={panelStyle}>
        <div style={panelHeaderStyle}>Topology</div>
        <div style={topologyStyle}>
          <TopologyNode icon={<Globe size={15} />} title="Public URL" value={deployment.url ?? 'Provisioning route'} />
          <TopologyArrow />
          <TopologyNode icon={<Box size={15} />} title="App container" value={deployment.container_name ?? `dep-${deployment.id}`} />
          {(deployment.addon_statuses ?? []).map((addon) => (
            <div key={addon.type} style={topologyBranchStyle}>
              <TopologyArrow vertical />
              <TopologyNode
                icon={addon.type === 'postgres' ? <Database size={15} /> : <Database size={15} />}
                title={addon.type === 'postgres' ? 'PostgreSQL' : 'Redis'}
                value={`${addon.connectionEnv}${addon.persistent ? ' / disk' : ''}`}
              />
            </div>
          ))}
        </div>
      </section>

      <section style={panelStyle}>
        <div style={panelHeaderStyle}>Recent health checks</div>
        {samples.length === 0 ? (
          <div style={emptyStyle}>Health checks will appear after the service has been running long enough for the poller to sample it.</div>
        ) : (
          <div style={healthStreamStyle}>
            {samples.map((sample) => (
              <div key={sample.id} style={healthRowStyle}>
                <span style={sample.ok === 1 ? okPillStyle : failPillStyle}>{sample.ok === 1 ? 'Healthy' : 'Failing'}</span>
                <span style={healthMetaStyle}>{sample.latency_ms === null ? 'timeout' : `${sample.latency_ms}ms`}</span>
                <span style={healthMetaStyle}>{timeAgo(sample.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div style={metricStyle}>
      <div style={metricIconStyle}>{icon}</div>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  )
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div style={keyValueStyle}>
      <div style={keyLabelStyle}>{label}</div>
      <div style={keyValueTextStyle}>{value}</div>
    </div>
  )
}

function TopologyNode({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <div style={nodeStyle}>
      <div style={nodeTitleStyle}>
        {icon}
        {title}
      </div>
      <div style={nodeValueStyle}>{value}</div>
    </div>
  )
}

function TopologyArrow({ vertical = false }: { vertical?: boolean }) {
  return <div style={vertical ? arrowVerticalStyle : arrowStyle}>{vertical ? '|' : '->'}</div>
}

function formatDuration(ms: number | null): string {
  if (ms === null) return 'n/a'
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${(seconds / 60).toFixed(1)}m`
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const systemStyle: CSSProperties = {
  display: 'grid',
  gap: 18,
  padding: 18,
}

const metricsGridStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
}

const metricStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  display: 'grid',
  gap: 8,
  minHeight: 104,
  padding: 14,
}

const metricIconStyle: CSSProperties = {
  color: 'var(--ink-muted)',
}

const metricLabelStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
}

const metricValueStyle: CSSProperties = {
  color: 'var(--ink)',
  fontSize: 24,
  fontWeight: 600,
}

const panelStyle: CSSProperties = {
  border: '1px solid var(--line)',
  display: 'grid',
  gap: 14,
  padding: 16,
}

const panelHeaderStyle: CSSProperties = {
  color: 'var(--ink)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
}

const kvGridStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
}

const keyValueStyle: CSSProperties = {
  display: 'grid',
  gap: 5,
}

const keyLabelStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  textTransform: 'uppercase',
}

const keyValueTextStyle: CSSProperties = {
  color: 'var(--ink)',
  fontFamily: 'var(--font-code)',
  fontSize: 13,
  lineHeight: 1.45,
}

const topologyStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
}

const topologyBranchStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  marginLeft: 24,
}

const nodeStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  display: 'grid',
  gap: 8,
  padding: 12,
}

const nodeTitleStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--ink-soft)',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  gap: 8,
  textTransform: 'uppercase',
}

const nodeValueStyle: CSSProperties = {
  color: 'var(--ink)',
  fontFamily: 'var(--font-code)',
  fontSize: 13,
}

const arrowStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  marginLeft: 10,
}

const arrowVerticalStyle: CSSProperties = {
  ...arrowStyle,
}

const healthStreamStyle: CSSProperties = {
  display: 'grid',
}

const healthRowStyle: CSSProperties = {
  alignItems: 'center',
  borderBottom: '1px solid var(--line)',
  display: 'grid',
  gap: 12,
  gridTemplateColumns: '100px 100px 1fr',
  minHeight: 40,
}

const okPillStyle: CSSProperties = {
  background: 'rgba(22,138,91,0.10)',
  color: 'var(--success)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 700,
  padding: '4px 6px',
  textTransform: 'uppercase',
  width: 'fit-content',
}

const failPillStyle: CSSProperties = {
  ...okPillStyle,
  background: 'rgba(210,67,67,0.10)',
  color: 'var(--danger)',
}

const healthMetaStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-code)',
  fontSize: 12,
}

const emptyStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontSize: 13,
  lineHeight: 1.5,
}

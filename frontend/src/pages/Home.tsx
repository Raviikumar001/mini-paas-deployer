import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Activity,
  Boxes,
  Braces,
  Cloud,
  GitBranch,
  Home,
  Layers,
  Radio,
  Server,
} from 'lucide-react'
import { useDeployments } from '../hooks/useDeployments'
import { DeployForm } from '../components/DeployForm'
import { DeploymentList } from '../components/DeploymentList'
import { WorkspaceActivity } from '../components/WorkspaceActivity'
import { WorkspaceLogs } from '../components/WorkspaceLogs'
import type { Deployment } from '../api/client'

type NavKey = 'home' | 'services' | 'deploys' | 'resources' | 'logs'

function countByStatus(deployments: Deployment[], status: Deployment['status']) {
  return deployments.filter((deployment) => deployment.status === status).length
}

function countAddons(deployments: Deployment[]) {
  return deployments.reduce((total, deployment) => total + (deployment.addon_statuses?.length ?? 0), 0)
}

export function HomePage() {
  const { data: deployments = [], error, isLoading } = useDeployments()
  const layout = useLayoutMode()
  const compact = layout !== 'desktop'
  const stacked = layout === 'mobile'
  const [activeNav, setActiveNav] = useState<NavKey>('home')
  const live = countByStatus(deployments, 'running')
  const active = deployments.filter((deployment) =>
    ['pending', 'building', 'deploying', 'redeploying'].includes(deployment.status),
  ).length
  const deploymentsWithAddons = deployments.filter((deployment) => (deployment.addon_statuses?.length ?? 0) > 0)
  const logFocusedDeployments = [...deployments].sort((a, b) => {
    const score = (deployment: Deployment) => {
      if (['building', 'deploying', 'redeploying'].includes(deployment.status)) return 3
      if (deployment.status === 'failed') return 2
      if (deployment.status === 'running') return 1
      return 0
    }
    return score(b) - score(a)
  })
  const view = getViewModel(activeNav, deployments, deploymentsWithAddons, logFocusedDeployments, live)
  const navItems: Array<{ key: NavKey; label: string; icon: typeof Home; count?: number }> = [
    { key: 'home', label: 'Home', icon: Home },
    { key: 'services', label: 'Services', icon: Server, count: deployments.length },
    { key: 'deploys', label: 'Deploys', icon: GitBranch, count: active },
    { key: 'resources', label: 'Resources', icon: Boxes, count: deploymentsWithAddons.length },
    { key: 'logs', label: 'Logs', icon: Braces },
  ]

  return (
    <div style={stacked ? compactShellStyle : layout === 'tablet' ? tabletShellStyle : shellStyle}>
      <aside style={stacked ? compactSidebarStyle : layout === 'tablet' ? tabletSidebarStyle : sidebarStyle}>
        <div style={brandStyle}>
          <div style={brandMarkStyle}>N</div>
          <div>
            <div style={brandNameStyle}>nobuild</div>
            <div style={brandSubStyle}>local cloud</div>
          </div>
        </div>

        <div style={compact ? compactWorkspaceStyle : workspaceStyle}>
          <span style={workspaceBadgeStyle}>Pro</span>
          <span style={{ minWidth: 0 }}>
            <strong style={workspaceNameStyle}>local-dev</strong>
            <span style={workspaceEnvStyle}>Production-like</span>
          </span>
        </div>

        <nav style={stacked ? compactNavStyle : navStyle}>
          {navItems.map(({ key, label, icon: IconComponent, count }) => {
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveNav(key)}
                style={activeNav === key ? activeNavStyle : navItemStyle}
              >
                <IconComponent size={16} />
                <span style={{ flex: 1 }}>{label}</span>
                {typeof count === 'number' && <span style={navCountStyle}>{count}</span>}
              </button>
            )
          })}
        </nav>
      </aside>

      <main style={stacked ? compactMainStyle : layout === 'tablet' ? tabletMainStyle : mainStyle}>
        <header style={compact ? compactTopbarStyle : topbarStyle}>
          <div style={topbarCopyStyle}>
            <div style={breadcrumbStyle}>
              <Cloud size={14} />
              Deployment platform
            </div>
            <h1 style={compact ? compactTitleStyle : titleStyle}>Services</h1>
            <p style={subtitleStyle}>Deploy from Git, attach resources, stream logs, and redeploy without dropping traffic.</p>
          </div>
          <DeployForm />
        </header>

        <section style={compact ? compactStatsStyle : statsStyle}>
          <Metric label="Services" value={deployments.length} icon={<Server size={18} />} />
          <Metric label="Live" value={live} icon={<Radio size={18} />} />
          <Metric label="In flight" value={active} icon={<Activity size={18} />} />
          <Metric label="Resources" value={countAddons(deployments)} icon={<Layers size={18} />} />
        </section>

        {error instanceof Error && <div style={errorStyle}>{error.message}</div>}

        <div style={compact ? compactGridStyle : gridStyle}>
          <section style={servicesSectionStyle}>
            <div style={sectionHeaderStyle}>
              <div>
                <div style={sectionKickerStyle}>{view.kicker}</div>
                <h2 style={sectionTitleStyle}>{view.title}</h2>
                <p style={sectionCopyStyle}>{view.copy}</p>
              </div>
              <span style={countStyle}>{view.deployments.length}</span>
            </div>
            {isLoading && deployments.length === 0 ? (
              <div style={loadingStyle}>Loading services</div>
            ) : activeNav === 'deploys' ? (
              <WorkspaceActivity deployments={deployments} />
            ) : activeNav === 'logs' ? (
              <WorkspaceLogs deployments={view.deployments} />
            ) : view.deployments.length === 0 ? (
              <div style={loadingStyle}>{view.empty}</div>
            ) : (
              <DeploymentList deployments={view.deployments} />
            )}
          </section>

          <aside style={stacked ? compactOnboardingStyle : layout === 'tablet' ? tabletOnboardingStyle : onboardingStyle}>
            {activeNav === 'home' ? (
              <>
                <div style={sectionKickerStyle}>Golden path</div>
                <h2 style={panelTitleStyle}>Launch flow</h2>
                <div style={stepListStyle}>
                  <Step done={deployments.length > 0} title="Connect Git" copy="Use a public HTTPS repository and choose a branch." />
                  <Step done={deployments.some((deployment) => (deployment.addon_statuses?.length ?? 0) > 0)} title="Attach resources" copy="Add Postgres or Redis and let the platform inject URLs." />
                  <Step done={live > 0} title="Ship and observe" copy="Watch logs, open the URL, then redeploy from the row." />
                </div>
              </>
            ) : (
              <>
                <div style={sectionKickerStyle}>{view.sideKicker}</div>
                <h2 style={panelTitleStyle}>{view.sideTitle}</h2>
                <div style={stepListStyle}>
                  {view.sideNotes.map((note) => (
                    <div key={note.title} style={noteStyle}>
                      <strong style={stepTitleStyle}>{note.title}</strong>
                      <span style={stepCopyStyle}>{note.copy}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  )
}

function getViewModel(
  activeNav: NavKey,
  deployments: Deployment[],
  deploymentsWithAddons: Deployment[],
  logFocusedDeployments: Deployment[],
  live: number,
) {
  switch (activeNav) {
    case 'services':
      return {
        kicker: 'Service catalog',
        title: 'All services',
        copy: 'Every deployment in the workspace, regardless of state.',
        deployments,
        empty: 'No services yet',
        sideKicker: 'Catalog view',
        sideTitle: 'Service inventory',
        sideNotes: [
          { title: `${deployments.length} tracked services`, copy: 'This view keeps the full workspace inventory visible.' },
          { title: `${live} live right now`, copy: 'Running services stay openable from the row actions.' },
        ],
      }
    case 'deploys':
      return {
        kicker: 'Deploy activity',
        title: 'Recent deploys',
        copy: 'Focus on active and recently updated deploy work.',
        deployments: [...deployments].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
        empty: 'No deploy activity yet',
        sideKicker: 'Deploy view',
        sideTitle: 'Release focus',
        sideNotes: [
          { title: 'Use timeline first', copy: 'Open a row and check the timeline tab to understand progress or failure stage.' },
          { title: 'Redeploy is built in', copy: 'Failed or running services can be redeployed directly from the row actions.' },
        ],
      }
    case 'resources':
      return {
        kicker: 'Infrastructure',
        title: 'Attached resources',
        copy: 'Services with Postgres or Redis attached.',
        deployments: deploymentsWithAddons,
        empty: 'No attached resources yet',
        sideKicker: 'Resource view',
        sideTitle: 'Infrastructure map',
        sideNotes: [
          { title: `${deploymentsWithAddons.length} services with add-ons`, copy: 'This view filters for services that carry platform-managed resources.' },
          { title: 'Environment tab shows URLs', copy: 'Injected DATABASE_URL and REDIS_URL values stay visible in each deployment detail panel.' },
        ],
      }
    case 'logs':
      return {
        kicker: 'Runtime focus',
        title: 'Logs and failures',
        copy: 'Start with the noisiest or most active services first.',
        deployments: logFocusedDeployments,
        empty: 'No deployment logs yet',
        sideKicker: 'Log view',
        sideTitle: 'Debug flow',
        sideNotes: [
          { title: 'Open a service row', copy: 'The logs tab is still the raw stream, while timeline gives the higher-level story.' },
          { title: 'Failed items rise first', copy: 'This view prioritizes in-flight and failed services to cut down scanning.' },
        ],
      }
    case 'home':
    default:
      return {
        kicker: 'Service catalog',
        title: 'Deployments',
        copy: 'Your platform workspace, with live status, logs, resources, and deploy detail.',
        deployments,
        empty: 'No services yet',
        sideKicker: 'Golden path',
        sideTitle: 'Launch flow',
        sideNotes: [],
      }
  }
}

type LayoutMode = 'desktop' | 'tablet' | 'mobile'

function useLayoutMode() {
  const [layout, setLayout] = useState<LayoutMode>(() =>
    typeof window === 'undefined' ? 'desktop' : getLayoutMode(window.innerWidth),
  )

  useEffect(() => {
    const onResize = () => setLayout(getLayoutMode(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return layout
}

function getLayoutMode(width: number): LayoutMode {
  if (width < 1100) return 'mobile'
  if (width < 1360) return 'tablet'
  return 'desktop'
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div style={metricStyle}>
      <div style={metricIconStyle}>{icon}</div>
      <div>
        <div style={metricLabelStyle}>{label}</div>
        <div style={metricValueStyle}>{value}</div>
      </div>
    </div>
  )
}

function Step({ done, title, copy }: { done: boolean; title: string; copy: string }) {
  return (
    <div style={stepStyle}>
      <span style={done ? stepDoneStyle : stepIndexStyle}>{done ? '✓' : ''}</span>
      <span>
        <strong style={stepTitleStyle}>{title}</strong>
        <span style={stepCopyStyle}>{copy}</span>
      </span>
    </div>
  )
}

const shellStyle: CSSProperties = {
  background: 'var(--paper)',
  color: 'var(--ink)',
  display: 'grid',
  gridTemplateColumns: '250px minmax(0, 1fr)',
  minHeight: '100vh',
}

const compactShellStyle: CSSProperties = {
  ...shellStyle,
  display: 'block',
}

const tabletShellStyle: CSSProperties = {
  ...shellStyle,
  gridTemplateColumns: '208px minmax(0, 1fr)',
}

const sidebarStyle: CSSProperties = {
  background: 'var(--panel)',
  borderRight: '1px solid var(--line)',
  display: 'flex',
  flexDirection: 'column',
  gap: 22,
  padding: 24,
}

const compactSidebarStyle: CSSProperties = {
  ...sidebarStyle,
  borderBottom: '1px solid var(--line)',
  borderRight: 0,
  gap: 14,
  padding: 18,
}

const tabletSidebarStyle: CSSProperties = {
  ...sidebarStyle,
  gap: 16,
  padding: 18,
}

const brandStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 12,
}

const brandMarkStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--ink)',
  color: 'var(--paper)',
  display: 'flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 18,
  fontWeight: 800,
  height: 38,
  justifyContent: 'center',
  width: 42,
}

const brandNameStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: '-0.01em',
  lineHeight: 1,
}

const brandSubStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  marginTop: 4,
  textTransform: 'uppercase',
}

const workspaceStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  display: 'flex',
  gap: 10,
  padding: 12,
}

const compactWorkspaceStyle: CSSProperties = {
  ...workspaceStyle,
  maxWidth: 1000,
}

const workspaceBadgeStyle: CSSProperties = {
  background: 'var(--blue)',
  color: 'var(--paper)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  padding: '4px 7px',
}

const workspaceNameStyle: CSSProperties = {
  display: 'block',
  fontSize: 13,
}

const workspaceEnvStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  display: 'block',
  fontSize: 12,
  marginTop: 2,
}

const navStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
}

const compactNavStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  overflowX: 'auto',
  paddingBottom: 2,
}

const navItemStyle: CSSProperties = {
  alignItems: 'center',
  background: 'transparent',
  border: 0,
  color: 'var(--ink-soft)',
  cursor: 'pointer',
  display: 'flex',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  gap: 10,
  height: 36,
  padding: '0 10px',
  textAlign: 'left',
}

const activeNavStyle: CSSProperties = {
  ...navItemStyle,
  background: 'rgba(0,0,0,0.07)',
  color: 'var(--ink)',
  fontWeight: 700,
}

const navCountStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  padding: '2px 5px',
}

const mainStyle: CSSProperties = {
  minWidth: 0,
  padding: '32px 40px 48px',
}

const tabletMainStyle: CSSProperties = {
  ...mainStyle,
  padding: '26px 24px 40px',
}

const compactMainStyle: CSSProperties = {
  ...mainStyle,
  padding: '22px 18px 40px',
}

const topbarStyle: CSSProperties = {
  alignItems: 'flex-start',
  display: 'flex',
  gap: 24,
  justifyContent: 'space-between',
  marginBottom: 28,
}

const compactTopbarStyle: CSSProperties = {
  ...topbarStyle,
  alignItems: 'stretch',
  flexDirection: 'column',
}

const topbarCopyStyle: CSSProperties = {
  minWidth: 0,
}

const breadcrumbStyle: CSSProperties = {
  alignItems: 'center',
  background: 'linear-gradient(90deg, var(--blue) 0 34%, var(--lime) 34%)',
  color: 'var(--ink)',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  fontWeight: 700,
  gap: 8,
  letterSpacing: '0.04em',
  marginBottom: 22,
  padding: '7px 12px',
  textTransform: 'uppercase',
}

const titleStyle: CSSProperties = {
  fontSize: 64,
  fontWeight: 500,
  letterSpacing: '-0.03em',
  lineHeight: 0.98,
}

const compactTitleStyle: CSSProperties = {
  ...titleStyle,
  fontSize: 48,
}

const subtitleStyle: CSSProperties = {
  color: 'var(--ink-soft)',
  fontSize: 17,
  lineHeight: 1.45,
  marginTop: 14,
  maxWidth: 680,
}

const statsStyle: CSSProperties = {
  borderBottom: '1px solid var(--line)',
  borderTop: '1px solid var(--line)',
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  marginBottom: 26,
}

const compactStatsStyle: CSSProperties = {
  ...statsStyle,
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
}

const metricStyle: CSSProperties = {
  alignItems: 'center',
  borderRight: '1px solid var(--line)',
  display: 'flex',
  gap: 14,
  minHeight: 96,
  padding: '18px 22px',
}

const metricIconStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  display: 'flex',
  height: 38,
  justifyContent: 'center',
  width: 38,
}

const metricLabelStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const metricValueStyle: CSSProperties = {
  fontSize: 42,
  fontWeight: 500,
  letterSpacing: '-0.04em',
  lineHeight: 1,
}

const gridStyle: CSSProperties = {
  alignItems: 'start',
  display: 'grid',
  gap: 20,
  gridTemplateColumns: 'minmax(0, 1fr) 360px',
}

const compactGridStyle: CSSProperties = {
  ...gridStyle,
  gridTemplateColumns: '1fr',
}

const servicesSectionStyle: CSSProperties = {
  minWidth: 0,
}

const sectionHeaderStyle: CSSProperties = {
  alignItems: 'flex-end',
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 14,
}

const sectionKickerStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  marginBottom: 6,
  textTransform: 'uppercase',
}

const sectionTitleStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 600,
  letterSpacing: '-0.02em',
}

const sectionCopyStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontSize: 14,
  lineHeight: 1.45,
  marginTop: 8,
  maxWidth: 560,
}

const panelTitleStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  marginBottom: 18,
}

const countStyle: CSSProperties = {
  background: 'var(--ink)',
  color: 'var(--paper)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 700,
  padding: '4px 8px',
}

const onboardingStyle: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  padding: 22,
  position: 'sticky',
  top: 24,
}

const tabletOnboardingStyle: CSSProperties = {
  ...onboardingStyle,
  padding: 18,
}

const compactOnboardingStyle: CSSProperties = {
  ...onboardingStyle,
  padding: 16,
  position: 'static',
}

const stepListStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
}

const stepStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: '28px minmax(0, 1fr)',
}

const noteStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
}

const stepIndexStyle: CSSProperties = {
  border: '1px solid var(--line-strong)',
  display: 'block',
  height: 28,
  width: 28,
}

const stepDoneStyle: CSSProperties = {
  ...stepIndexStyle,
  alignItems: 'center',
  background: 'var(--lime)',
  borderColor: 'var(--lime)',
  color: 'var(--ink)',
  display: 'flex',
  fontFamily: 'var(--font-mono)',
  fontWeight: 800,
  justifyContent: 'center',
}

const stepTitleStyle: CSSProperties = {
  display: 'block',
  fontSize: 14,
  marginBottom: 4,
}

const stepCopyStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  display: 'block',
  fontSize: 13,
  lineHeight: 1.45,
}

const errorStyle: CSSProperties = {
  background: 'rgba(210,67,67,0.08)',
  border: '1px solid rgba(210,67,67,0.2)',
  color: 'var(--danger)',
  marginBottom: 18,
  padding: 14,
}

const loadingStyle: CSSProperties = {
  border: '1px solid var(--line)',
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  padding: 32,
  textAlign: 'center',
  textTransform: 'uppercase',
}

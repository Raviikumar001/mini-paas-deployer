import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { TerminalSquare } from 'lucide-react'
import { useLogStream } from '../hooks/useLogStream'
import type { LogEvent } from '../api/client'

const LABEL: Record<LogEvent['stream'], string> = {
  system: 'SYS',
  stdout: 'OUT',
  stderr: 'ERR',
}

const LABEL_STYLE: Record<LogEvent['stream'], CSSProperties> = {
  system: { background: 'rgba(102,124,255,0.14)', color: '#8fa0ff' },
  stdout: { background: 'rgba(217,255,102,0.12)', color: '#d9ff66' },
  stderr: { background: 'rgba(210,67,67,0.16)', color: '#ff8b8b' },
}

interface Props { deploymentId: string }

export function LogPanel({ deploymentId }: Props) {
  const logs = useLogStream(deploymentId)
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [logs, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }

  return (
    <div style={shellStyle}>
      <div style={toolbarStyle}>
        <span style={toolbarTitleStyle}>
          <TerminalSquare size={15} />
          Runtime stream
        </span>
        <span style={toolbarMetaStyle}>{logs.length} lines</span>
      </div>
      <div ref={containerRef} onScroll={handleScroll} style={containerStyle}>
        {logs.length === 0 && (
          <div style={emptyStyle}>Waiting for logs...</div>
        )}
        {logs.map((line, i) => (
          <div key={i} style={lineStyle}>
            <span style={{ ...labelStyle, ...LABEL_STYLE[line.stream] }}>{LABEL[line.stream]}</span>
            <span style={messageStyle}>{line.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

const shellStyle: CSSProperties = {
  background: '#0d0f10',
}

const toolbarStyle: CSSProperties = {
  alignItems: 'center',
  background: '#171a1d',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  color: '#e9eee7',
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 14px',
}

const toolbarTitleStyle: CSSProperties = {
  alignItems: 'center',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 800,
  gap: 8,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const toolbarMetaStyle: CSSProperties = {
  color: '#88908a',
  fontFamily: 'var(--font-code)',
  fontSize: 11,
}

const containerStyle: CSSProperties = {
  fontFamily: 'var(--font-code)',
  fontSize: 12,
  height: 330,
  lineHeight: 1.75,
  overflowY: 'auto',
  padding: '13px 14px',
}

const lineStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: '44px minmax(0, 1fr)',
  minHeight: 22,
}

const labelStyle: CSSProperties = {
  alignSelf: 'start',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.04em',
  padding: '1px 5px',
  textAlign: 'center',
}

const messageStyle: CSSProperties = {
  color: '#d7ded8',
  minWidth: 0,
  overflowWrap: 'anywhere',
}

const emptyStyle: CSSProperties = {
  color: '#69716b',
  fontFamily: 'var(--font-code)',
}

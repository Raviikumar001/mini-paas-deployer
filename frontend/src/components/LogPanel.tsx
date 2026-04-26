import { useRef, useEffect, useState } from 'react'
import { useLogStream } from '../hooks/useLogStream'
import type { LogEvent } from '../api/client'

const LABEL: Record<LogEvent['stream'], string> = {
  system: 'sys',
  stdout: 'out',
  stderr: 'err',
}

const LABEL_COLOR: Record<LogEvent['stream'], string> = {
  system: '#4b5563',
  stdout: '#374151',
  stderr: '#7f1d1d',
}

const MSG_COLOR: Record<LogEvent['stream'], string> = {
  system: '#6b7280',
  stdout: '#d1d5db',
  stderr: '#fca5a5',
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
    <div ref={containerRef} onScroll={handleScroll} style={containerStyle}>
      {logs.length === 0 && (
        <span style={{ color: '#374151' }}>Waiting for logs…</span>
      )}
      {logs.map((line, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, minHeight: 20 }}>
          <span style={{
            color: LABEL_COLOR[line.stream],
            flexShrink: 0,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.3,
            paddingTop: 1,
            userSelect: 'none',
            width: 24,
          }}>
            {LABEL[line.stream]}
          </span>
          <span style={{ color: MSG_COLOR[line.stream], wordBreak: 'break-all' }}>
            {line.message}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  background: '#080a0c',
  borderTop: '1px solid #1a1d23',
  fontFamily: "'Cascadia Code', 'Fira Code', 'Courier New', monospace",
  fontSize: 12.5,
  height: 300,
  lineHeight: 1.75,
  overflowY: 'auto',
  padding: '14px 16px',
}

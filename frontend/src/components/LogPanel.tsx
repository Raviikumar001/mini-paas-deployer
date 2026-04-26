import { useRef, useEffect, useState } from 'react'
import { useLogStream } from '../hooks/useLogStream'
import type { LogEvent } from '../api/client'

const STREAM_COLOR: Record<LogEvent['stream'], string> = {
  system: '#3a3a3a',
  stdout: '#c8c8c8',
  stderr: '#f87171',
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
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={containerStyle}
    >
      {logs.length === 0 && (
        <span style={{ color: '#2a2a2a' }}>Waiting for logs…</span>
      )}
      {logs.map((line, i) => (
        <div key={i} style={{ display: 'flex', gap: 10 }}>
          <span style={{ color: '#252525', flexShrink: 0, userSelect: 'none', width: 28 }}>
            {line.stream === 'system' ? 'sys' : line.stream === 'stderr' ? 'err' : 'out'}
          </span>
          <span style={{ color: STREAM_COLOR[line.stream], wordBreak: 'break-all' }}>
            {line.message}
          </span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  background: '#080808',
  fontFamily: "'Cascadia Code', 'Fira Code', 'Courier New', monospace",
  fontSize: 12,
  height: 300,
  lineHeight: 1.7,
  overflowY: 'auto',
  padding: '12px 16px',
}

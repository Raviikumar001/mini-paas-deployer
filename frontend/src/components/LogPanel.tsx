import { useRef, useEffect, useState } from 'react'
import { useLogStream } from '../hooks/useLogStream'
import type { LogEvent } from '../api/client'

const STREAM_COLOR: Record<LogEvent['stream'], string> = {
  system: '#555',
  stdout: '#d4d4d4',
  stderr: '#f87171',
}

const STREAM_PREFIX: Record<LogEvent['stream'], string> = {
  system: 'sys',
  stdout: 'out',
  stderr: 'err',
}

interface Props {
  deploymentId: string
}

/**
 * Streams build/deploy logs via SSE.
 * Auto-scrolls to the newest line unless the user has scrolled up
 * (detected by checking if the container is within 40px of the bottom).
 */
export function LogPanel({ deploymentId }: Props) {
  const logs = useLogStream(deploymentId)
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [logs, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        borderTop: '1px solid #1a1a1a',
        fontSize: 11,
        height: 280,
        lineHeight: 1.65,
        overflowY: 'auto',
        padding: '10px 14px',
      }}
    >
      {logs.length === 0 && (
        <span style={{ color: '#333' }}>Waiting for logs…</span>
      )}
      {logs.map((line, i) => (
        <div key={i} style={{ color: STREAM_COLOR[line.stream] }}>
          <span style={{ color: '#2a2a2a', userSelect: 'none' }}>
            [{STREAM_PREFIX[line.stream]}]{' '}
          </span>
          {line.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

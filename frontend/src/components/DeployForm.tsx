import { useState, type FormEvent } from 'react'
import { useCreateDeployment } from '../hooks/useDeployments'

export function DeployForm() {
  const [url, setUrl] = useState('')
  const { mutate, isPending, error } = useCreateDeployment()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    mutate(trimmed, { onSuccess: () => setUrl('') })
  }

  return (
    <form onSubmit={submit} style={{ marginBottom: 32 }}>
      <div style={labelStyle}>DEPLOY FROM GIT</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/user/repo"
          required
          style={{
            flex: 1,
            background: '#111',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#e5e5e5',
            fontFamily: 'inherit',
            fontSize: 13,
            outline: 'none',
            padding: '8px 12px',
          }}
        />
        <button
          type="submit"
          disabled={isPending || !url.trim()}
          style={{
            background: isPending ? '#333' : '#a3e635',
            border: 'none',
            borderRadius: 4,
            color: '#0d0d0d',
            cursor: isPending ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            padding: '8px 20px',
            whiteSpace: 'nowrap',
          }}
        >
          {isPending ? 'Queuing…' : '▶ Deploy'}
        </button>
      </div>
      {error && (
        <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>
          {error.message}
        </div>
      )}
    </form>
  )
}

const labelStyle: React.CSSProperties = {
  color: '#555',
  fontSize: 11,
  letterSpacing: 1,
  marginBottom: 8,
}

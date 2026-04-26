import { useState, type FormEvent } from 'react'
import { useCreateDeployment } from '../hooks/useDeployments'

// ── .env file parser ──────────────────────────────────────────────────────────
// Handles: comments, blank lines, quoted values, values containing '='
function parseEnvFile(raw: string): EnvPair[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .flatMap((line) => {
      const idx = line.indexOf('=')
      if (idx === -1) return []
      const key = line.slice(0, idx).trim()
      if (!key) return []
      let value = line.slice(idx + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      return [{ key, value }]
    })
}

interface EnvPair { key: string; value: string }

function pairsToRecord(pairs: EnvPair[]): Record<string, string> {
  return Object.fromEntries(pairs.filter((p) => p.key).map((p) => [p.key, p.value]))
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DeployForm() {
  const [url, setUrl] = useState('')
  const [pairs, setPairs] = useState<EnvPair[]>([])
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [showEnv, setShowEnv] = useState(false)
  const { mutate, isPending, error } = useCreateDeployment()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    const envPairs = pasteMode ? parseEnvFile(pasteText) : pairs
    const envVars = pairsToRecord(envPairs)

    mutate(
      { gitUrl: trimmed, envVars: Object.keys(envVars).length ? envVars : undefined },
      { onSuccess: () => { setUrl(''); setPairs([]); setPasteText('') } },
    )
  }

  const addPair = () => setPairs((p) => [...p, { key: '', value: '' }])
  const removePair = (i: number) => setPairs((p) => p.filter((_, idx) => idx !== i))
  const updatePair = (i: number, field: 'key' | 'value', val: string) =>
    setPairs((p) => p.map((pair, idx) => idx === i ? { ...pair, [field]: val } : pair))

  return (
    <form onSubmit={submit} style={{ marginBottom: 32 }}>
      <div style={labelStyle}>DEPLOY FROM GIT</div>

      {/* URL row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/user/repo"
          required
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={isPending || !url.trim()}
          style={{
            ...deployBtnStyle,
            background: isPending ? '#333' : '#a3e635',
            cursor: isPending ? 'not-allowed' : 'pointer',
          }}
        >
          {isPending ? 'Queuing…' : '▶ Deploy'}
        </button>
      </div>

      {/* Env vars toggle */}
      <button
        type="button"
        onClick={() => setShowEnv((v) => !v)}
        style={ghostBtnStyle}
      >
        {showEnv ? '▾' : '▸'} Environment variables
        {pairs.filter((p) => p.key).length > 0 && !pasteMode && (
          <span style={{ color: '#a3e635', marginLeft: 6 }}>
            ({pairs.filter((p) => p.key).length})
          </span>
        )}
      </button>

      {showEnv && (
        <div style={envBoxStyle}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setPasteMode(false)}
              style={{ ...modeTabStyle, ...(pasteMode ? {} : modeTabActiveStyle) }}
            >
              Key / Value
            </button>
            <button
              type="button"
              onClick={() => setPasteMode(true)}
              style={{ ...modeTabStyle, ...(pasteMode ? modeTabActiveStyle : {}) }}
            >
              Paste .env
            </button>
          </div>

          {pasteMode ? (
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'VITE_API_URL=https://api.example.com\nNODE_ENV=production\n# comments are ignored'}
              rows={6}
              style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'monospace' }}
            />
          ) : (
            <>
              {pairs.map((pair, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input
                    placeholder="KEY"
                    value={pair.key}
                    onChange={(e) => updatePair(i, 'key', e.target.value)}
                    style={{ ...inputStyle, flex: '0 0 38%', fontFamily: 'monospace' }}
                  />
                  <input
                    placeholder="value"
                    value={pair.value}
                    onChange={(e) => updatePair(i, 'value', e.target.value)}
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
                  />
                  <button
                    type="button"
                    onClick={() => removePair(i)}
                    style={{ ...ghostBtnStyle, color: '#ef444466', padding: '4px 8px' }}
                    title="remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={addPair} style={ghostBtnStyle}>
                + Add variable
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>
          {error.message}
        </div>
      )}
    </form>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  color: '#555',
  fontSize: 11,
  letterSpacing: 1,
  marginBottom: 8,
}

const inputStyle: React.CSSProperties = {
  background: '#111',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#e5e5e5',
  fontFamily: 'inherit',
  fontSize: 13,
  outline: 'none',
  padding: '8px 12px',
}

const deployBtnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 4,
  color: '#0d0d0d',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  padding: '8px 20px',
  whiteSpace: 'nowrap',
}

const ghostBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#555',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  marginTop: 8,
  padding: '4px 0',
}

const envBoxStyle: React.CSSProperties = {
  background: '#0d0d0d',
  border: '1px solid #1e1e1e',
  borderRadius: 4,
  marginTop: 4,
  padding: 12,
}

const modeTabStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #2a2a2a',
  borderRadius: 3,
  color: '#555',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 11,
  padding: '3px 10px',
}

const modeTabActiveStyle: React.CSSProperties = {
  borderColor: '#444',
  color: '#e5e5e5',
}

import { useState, type FormEvent } from 'react'
import { useCreateDeployment } from '../hooks/useDeployments'

function parseEnvFile(raw: string): EnvPair[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .flatMap((l) => {
      const idx = l.indexOf('=')
      if (idx === -1) return []
      const key = l.slice(0, idx).trim()
      if (!key) return []
      let value = l.slice(idx + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) value = value.slice(1, -1)
      return [{ key, value }]
    })
}

interface EnvPair { key: string; value: string }

function pairsToRecord(pairs: EnvPair[]): Record<string, string> {
  return Object.fromEntries(pairs.filter((p) => p.key).map((p) => [p.key, p.value]))
}

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

  const envCount = (pasteMode ? parseEnvFile(pasteText) : pairs).filter((p) => p.key).length

  return (
    <form onSubmit={submit} style={{ marginBottom: 32 }}>
      {/* URL + Deploy row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
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
            opacity: isPending || !url.trim() ? 0.5 : 1,
            cursor: isPending || !url.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {isPending ? 'Queuing…' : 'Deploy'}
        </button>
      </div>

      {/* Env toggle */}
      <button type="button" onClick={() => setShowEnv((v) => !v)} style={envToggleStyle}>
        <span style={{ color: showEnv ? '#a3e635' : '#444', marginRight: 6 }}>
          {showEnv ? '▾' : '▸'}
        </span>
        Environment variables
        {envCount > 0 && (
          <span style={{
            background: '#a3e63520',
            borderRadius: 10,
            color: '#a3e635',
            fontSize: 11,
            marginLeft: 8,
            padding: '1px 7px',
          }}>
            {envCount}
          </span>
        )}
      </button>

      {showEnv && (
        <div style={envBoxStyle}>
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
            {(['Key/Value', 'Paste .env'] as const).map((label, i) => {
              const active = i === 0 ? !pasteMode : pasteMode
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setPasteMode(i === 1)}
                  style={{
                    background: active ? '#1e1e1e' : 'none',
                    border: active ? '1px solid #2a2a2a' : '1px solid transparent',
                    borderRadius: 5,
                    color: active ? '#e2e2e2' : '#555',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 12,
                    padding: '4px 12px',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {pasteMode ? (
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'DATABASE_URL=postgres://...\nNODE_ENV=production\n# comments ignored'}
              rows={5}
              style={{
                ...inputStyle,
                fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                fontSize: 12,
                resize: 'vertical',
                width: '100%',
              }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pairs.map((pair, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input
                    placeholder="KEY"
                    value={pair.key}
                    onChange={(e) => updatePair(i, 'key', e.target.value)}
                    style={{
                      ...inputStyle,
                      flex: '0 0 38%',
                      fontFamily: "'Cascadia Code', monospace",
                      fontSize: 12,
                    }}
                  />
                  <input
                    placeholder="value"
                    value={pair.value}
                    onChange={(e) => updatePair(i, 'value', e.target.value)}
                    style={{
                      ...inputStyle,
                      flex: 1,
                      fontFamily: "'Cascadia Code', monospace",
                      fontSize: 12,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removePair(i)}
                    style={iconBtnStyle}
                    title="remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={addPair} style={addVarBtnStyle}>
                + Add variable
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{error.message}</p>
      )}
    </form>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#0f0f0f',
  border: '1px solid #1e1e1e',
  borderRadius: 7,
  color: '#e2e2e2',
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
  padding: '9px 13px',
  flex: 1,
  transition: 'border-color 0.15s',
}

const deployBtnStyle: React.CSSProperties = {
  background: '#a3e635',
  border: 'none',
  borderRadius: 7,
  color: '#0a0a0a',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  padding: '9px 22px',
  whiteSpace: 'nowrap',
  transition: 'opacity 0.15s',
}

const envToggleStyle: React.CSSProperties = {
  alignItems: 'center',
  background: 'none',
  border: 'none',
  color: '#555',
  cursor: 'pointer',
  display: 'flex',
  fontFamily: 'inherit',
  fontSize: 13,
  padding: '2px 0',
}

const envBoxStyle: React.CSSProperties = {
  background: '#0c0c0c',
  border: '1px solid #1a1a1a',
  borderRadius: 8,
  marginTop: 8,
  padding: 14,
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #1e1e1e',
  borderRadius: 5,
  color: '#444',
  cursor: 'pointer',
  fontSize: 11,
  padding: '0 10px',
}

const addVarBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  background: 'none',
  border: 'none',
  color: '#555',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  padding: '4px 0',
}

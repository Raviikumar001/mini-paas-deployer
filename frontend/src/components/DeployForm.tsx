import { useState, type FormEvent, type CSSProperties } from 'react'
import { Search, SlidersHorizontal, Plus, X, Rocket } from 'lucide-react'
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
  const [branch, setBranch] = useState('')
  const [pairs, setPairs] = useState<EnvPair[]>([])
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [showEnv, setShowEnv] = useState(false)
  const [attachPostgres, setAttachPostgres] = useState(false)
  const [attachRedis, setAttachRedis] = useState(false)
  const { mutate, isPending, error } = useCreateDeployment()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    const envPairs = pasteMode ? parseEnvFile(pasteText) : pairs
    const envVars = pairsToRecord(envPairs)
    const params: {
      gitUrl: string
      envVars?: Record<string, string>
      branch?: string
      addons?: Array<{ type: 'postgres' | 'redis' }>
    } = { gitUrl: trimmed }
    if (Object.keys(envVars).length) params.envVars = envVars
    if (branch.trim()) params.branch = branch.trim()
    const addons: Array<{ type: 'postgres' | 'redis' }> = []
    if (attachPostgres) addons.push({ type: 'postgres' })
    if (attachRedis) addons.push({ type: 'redis' })
    if (addons.length) params.addons = addons
    mutate(params, { onSuccess: () => { setUrl(''); setBranch(''); setPairs([]); setPasteText(''); setAttachPostgres(false); setAttachRedis(false) } })
  }

  const addPair = () => setPairs((p) => [...p, { key: '', value: '' }])
  const removePair = (i: number) => setPairs((p) => p.filter((_, idx) => idx !== i))
  const updatePair = (i: number, field: 'key' | 'value', val: string) =>
    setPairs((p) => p.map((pair, idx) => idx === i ? { ...pair, [field]: val } : pair))

  const envCount = (pasteMode ? parseEnvFile(pasteText) : pairs).filter((p) => p.key).length

  return (
    <form onSubmit={submit} style={formStyle}>
      <style>{`.addon-tip:hover .addon-tip-content { opacity: 1 !important; pointer-events: auto !important; }`}</style>
      {/* Input row */}
      <div style={inputRowStyle}>
        {/* Search-style URL input */}
        <div style={searchWrapStyle}>
          <Search size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            required
            style={searchInputStyle}
          />
        </div>

        {/* Branch input */}
        <input
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="main"
          style={branchInputStyle}
        />

        {/* Postgres toggle */}
        <div className="addon-tip" style={tooltipWrapStyle}>
          <button
            type="button"
            onClick={() => setAttachPostgres((v) => !v)}
            style={{
              ...envToggleStyle,
              background: attachPostgres ? 'rgba(96,165,250,0.12)' : 'var(--bg-raised)',
              borderColor: attachPostgres ? 'rgba(96,165,250,0.3)' : 'var(--border-subtle)',
              color: attachPostgres ? '#60a5fa' : 'var(--text-secondary)',
            } as CSSProperties}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500 }}>PG</span>
          </button>
          <div className="addon-tip-content" style={tooltipStyle}>
            <strong>PostgreSQL</strong><br />
            Spins up a Postgres sidecar container.<br />
            <span style={{ color: 'var(--success)' }}>DATABASE_URL</span> is injected automatically.
          </div>
        </div>

        {/* Redis toggle */}
        <div className="addon-tip" style={tooltipWrapStyle}>
          <button
            type="button"
            onClick={() => setAttachRedis((v) => !v)}
            style={{
              ...envToggleStyle,
              background: attachRedis ? 'rgba(245,166,35,0.12)' : 'var(--bg-raised)',
              borderColor: attachRedis ? 'rgba(245,166,35,0.3)' : 'var(--border-subtle)',
              color: attachRedis ? 'var(--warning)' : 'var(--text-secondary)',
            } as CSSProperties}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500 }}>RD</span>
          </button>
          <div className="addon-tip-content" style={tooltipStyle}>
            <strong>Redis</strong><br />
            Spins up a Redis sidecar container.<br />
            <span style={{ color: 'var(--warning)' }}>REDIS_URL</span> is injected automatically.
          </div>
        </div>

        {/* Env toggle */}
        <button
          type="button"
          onClick={() => setShowEnv((v) => !v)}
          title="Environment variables"
          style={{
            ...envToggleStyle,
            background: showEnv ? 'var(--bg-hover)' : 'var(--bg-raised)',
            borderColor: showEnv ? 'var(--border-emphasis)' : 'var(--border-subtle)',
            color: showEnv ? 'var(--text-primary)' : 'var(--text-secondary)',
          } as CSSProperties}
        >
          <SlidersHorizontal size={14} />
          {envCount > 0 && (
            <span style={envCountBadge}>{envCount}</span>
          )}
        </button>

        {/* Deploy CTA */}
        <button
          type="submit"
          disabled={isPending || !url.trim()}
          style={{
            ...deployBtnStyle,
            opacity: isPending || !url.trim() ? 0.4 : 1,
            cursor: isPending || !url.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          <Rocket size={13} />
          {isPending ? 'Queuing…' : 'Deploy'}
        </button>
      </div>

      {/* Env vars panel */}
      {showEnv && (
        <div style={envPanelStyle}>
          {/* Panel header */}
          <div style={envPanelHeaderStyle}>
            <SlidersHorizontal size={12} color="var(--text-muted)" />
            <span style={{ color: 'var(--text-secondary)' as string, fontSize: 12, fontWeight: 500 }}>
              Environment Variables
            </span>
            {envCount > 0 && <span style={envCountBadge}>{envCount}</span>}
            <div style={{ flex: 1 }} />
            {/* Mode pills */}
            <div style={modePillsStyle}>
              {(['Key/Value', 'Paste .env'] as const).map((label, i) => {
                const active = i === 0 ? !pasteMode : pasteMode
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setPasteMode(i === 1)}
                    style={{
                      ...modePillStyle,
                      background: active ? 'var(--bg-hover)' : 'transparent',
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    } as CSSProperties}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {pasteMode ? (
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'DATABASE_URL=postgres://...\nNODE_ENV=production\n# comments ignored'}
              rows={5}
              style={textareaStyle}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {pairs.length === 0 && (
                <p style={{ color: 'var(--text-muted)' as string, fontSize: 12, marginBottom: 4 }}>
                  No variables added yet.
                </p>
              )}
              {pairs.map((pair, i) => (
                <div key={i} style={{ alignItems: 'center', display: 'flex', gap: 5 }}>
                  <input
                    placeholder="KEY"
                    value={pair.key}
                    onChange={(e) => updatePair(i, 'key', e.target.value)}
                    style={{ ...kvInputStyle, flex: '0 0 36%' }}
                  />
                  <input
                    placeholder="value"
                    value={pair.value}
                    onChange={(e) => updatePair(i, 'value', e.target.value)}
                    style={{ ...kvInputStyle, flex: 1 }}
                  />
                  <button type="button" onClick={() => removePair(i)} style={removeVarBtnStyle}>
                    <X size={11} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addPair} style={addVarBtnStyle}>
                <Plus size={12} />
                Add variable
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--danger)' as string, fontSize: 12, marginTop: 8 }}>{error.message}</p>
      )}
    </form>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const formStyle: CSSProperties = { marginBottom: 24 }

const inputRowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 6,
}

const searchWrapStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--bg-raised)' as string,
  border: '0.5px solid var(--border-subtle)' as string,
  borderRadius: 8,
  display: 'flex',
  flex: 1,
  gap: 10,
  padding: '0 14px',
  transition: 'border-color 0.15s',
}

const searchInputStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)' as string,
  flex: 1,
  fontFamily: 'var(--font-body)' as string,
  fontSize: 14,
  outline: 'none',
  padding: '10px 0',
}

const branchInputStyle: CSSProperties = {
  background: 'var(--bg-raised)' as string,
  border: '0.5px solid var(--border-subtle)' as string,
  borderRadius: 8,
  color: 'var(--text-primary)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 13,
  outline: 'none',
  padding: '9px 12px',
  width: 110,
}

const envToggleStyle: CSSProperties = {
  alignItems: 'center',
  border: '0.5px solid',
  borderRadius: 8,
  cursor: 'pointer',
  display: 'flex',
  flexShrink: 0,
  fontFamily: 'inherit',
  gap: 5,
  padding: '9px 12px',
  transition: 'background 0.12s, border-color 0.12s, color 0.12s',
}

const envCountBadge: CSSProperties = {
  background: 'rgba(232,255,71,0.12)',
  borderRadius: 9,
  color: 'var(--accent)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 10,
  fontWeight: 500,
  padding: '1px 6px',
}

const deployBtnStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--accent)' as string,
  border: 'none',
  borderRadius: 8,
  color: 'var(--accent-text)' as string,
  cursor: 'pointer',
  display: 'flex',
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 12,
  fontWeight: 500,
  gap: 7,
  padding: '10px 18px',
  transition: 'opacity 0.15s, transform 0.1s',
  whiteSpace: 'nowrap',
}

const envPanelStyle: CSSProperties = {
  background: 'var(--bg-surface)' as string,
  border: '0.5px solid var(--border-subtle)' as string,
  borderRadius: 8,
  marginTop: 6,
  padding: '12px 14px',
}

const envPanelHeaderStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 8,
  marginBottom: 12,
}

const modePillsStyle: CSSProperties = {
  background: 'var(--bg-raised)' as string,
  border: '0.5px solid var(--border-subtle)' as string,
  borderRadius: 6,
  display: 'flex',
  padding: 2,
}

const modePillStyle: CSSProperties = {
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'var(--font-body)' as string,
  fontSize: 11,
  fontWeight: 500,
  padding: '3px 10px',
  transition: 'background 0.1s, color 0.1s',
}

const kvInputStyle: CSSProperties = {
  background: 'var(--bg-raised)' as string,
  border: '0.5px solid var(--border-subtle)' as string,
  borderRadius: 6,
  color: 'var(--text-primary)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 12,
  outline: 'none',
  padding: '7px 10px',
  transition: 'border-color 0.15s',
}

const textareaStyle: CSSProperties = {
  background: 'var(--bg-raised)' as string,
  border: '0.5px solid var(--border-subtle)' as string,
  borderRadius: 6,
  color: 'var(--text-primary)' as string,
  fontFamily: 'var(--font-mono)' as string,
  fontSize: 12,
  outline: 'none',
  padding: '9px 12px',
  resize: 'vertical',
  width: '100%',
}

const removeVarBtnStyle: CSSProperties = {
  alignItems: 'center',
  background: 'none',
  border: '0.5px solid var(--border-subtle)' as string,
  borderRadius: 6,
  color: 'var(--text-muted)' as string,
  cursor: 'pointer',
  display: 'flex',
  padding: '0 8px',
  height: 32,
}

const addVarBtnStyle: CSSProperties = {
  alignItems: 'center',
  alignSelf: 'flex-start',
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)' as string,
  cursor: 'pointer',
  display: 'flex',
  fontFamily: 'var(--font-body)' as string,
  fontSize: 12,
  gap: 5,
  marginTop: 4,
  padding: '3px 0',
  transition: 'color 0.15s',
}

const tooltipWrapStyle: CSSProperties = {
  position: 'relative' as const,
}

const tooltipStyle: CSSProperties = {
  background: 'var(--bg-surface)' as string,
  border: '0.5px solid var(--border-default)' as string,
  borderRadius: 8,
  bottom: 'calc(100% + 8px)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  color: 'var(--text-secondary)' as string,
  fontSize: 11,
  left: '50%',
  lineHeight: 1.5,
  opacity: 0,
  padding: '8px 10px',
  pointerEvents: 'none' as const,
  position: 'absolute' as const,
  transform: 'translateX(-50%)',
  transition: 'opacity 0.15s',
  whiteSpace: 'nowrap' as const,
  zIndex: 50,
}

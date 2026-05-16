import { useDeferredValue, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import {
  Check,
  Database,
  GitBranch,
  KeyRound,
  Lock,
  Plus,
  Rocket,
  Server,
  Shield,
  Trash2,
  Unlock,
  X,
  Zap,
} from 'lucide-react'
import { api } from '../api/client'
import { useCreateDeployment } from '../hooks/useDeployments'

interface EnvPair { key: string; value: string; secret: boolean }

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
      return [{ key, value, secret: false }]
    })
}

function splitPairs(pairs: EnvPair[]): {
  envVars: Record<string, string>
  secretEnvVars: Record<string, string>
} {
  const envVars: Record<string, string> = {}
  const secretEnvVars: Record<string, string> = {}
  for (const pair of pairs) {
    if (!pair.key.trim()) continue
    if (pair.secret) secretEnvVars[pair.key.trim()] = pair.value
    else envVars[pair.key.trim()] = pair.value
  }
  return { envVars, secretEnvVars }
}

export function DeployForm() {
  const compact = useCompactLayout()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const deferredUrl = useDeferredValue(url.trim())
  const [branch, setBranch] = useState('main')
  const [branches, setBranches] = useState<string[]>([])
  const [branchLookup, setBranchLookup] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [branchLookupError, setBranchLookupError] = useState('')
  const [pairs, setPairs] = useState<EnvPair[]>([])
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [attachPostgres, setAttachPostgres] = useState(false)
  const [attachRedis, setAttachRedis] = useState(false)
  const [persistRedis, setPersistRedis] = useState(false)
  const { mutate, isPending, error } = useCreateDeployment()

  const reset = () => {
    setUrl('')
    setBranch('main')
    setBranches([])
    setBranchLookup('idle')
    setBranchLookupError('')
    setPairs([])
    setPasteText('')
    setPasteMode(false)
    setAttachPostgres(false)
    setAttachRedis(false)
    setPersistRedis(false)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    const envPairs = pasteMode ? parseEnvFile(pasteText) : pairs
    const { envVars, secretEnvVars } = splitPairs(envPairs)
    const addons: Array<{ type: 'postgres' | 'redis'; persistent?: boolean }> = []
    if (attachPostgres) addons.push({ type: 'postgres', persistent: true })
    if (attachRedis) addons.push({ type: 'redis', persistent: persistRedis })

    mutate(
      {
        gitUrl: trimmed,
        ...(branch.trim() ? { branch: branch.trim() } : {}),
        ...(Object.keys(envVars).length ? { envVars } : {}),
        ...(Object.keys(secretEnvVars).length ? { secretEnvVars } : {}),
        ...(addons.length ? { addons } : {}),
      },
      {
        onSuccess: () => {
          reset()
          setOpen(false)
        },
      },
    )
  }

  const envPairs = pasteMode ? parseEnvFile(pasteText) : pairs
  const envCount = envPairs.filter((pair) => pair.key.trim()).length
  const secretCount = envPairs.filter((pair) => pair.key.trim() && pair.secret).length
  const branchOptions = branch && !branches.includes(branch) ? [branch, ...branches] : branches

  const addPair = () => setPairs((prev) => [...prev, { key: '', value: '', secret: false }])
  const removePair = (i: number) => setPairs((prev) => prev.filter((_, idx) => idx !== i))
  const updatePair = (i: number, field: 'key' | 'value', value: string) =>
    setPairs((prev) => prev.map((pair, idx) => idx === i ? { ...pair, [field]: value } : pair))
  const toggleSecret = (i: number) =>
    setPairs((prev) => prev.map((pair, idx) => idx === i ? { ...pair, secret: !pair.secret } : pair))

  useEffect(() => {
    if (!deferredUrl || !/^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\//i.test(deferredUrl)) {
      setBranches([])
      setBranchLookup('idle')
      setBranchLookupError('')
      return
    }

    let cancelled = false
    setBranches([])
    setBranchLookup('loading')
    setBranchLookupError('')

    const timer = window.setTimeout(() => {
      api.repositories.branches(deferredUrl)
        .then(({ branches: nextBranches }) => {
          if (cancelled) return
          setBranches(nextBranches)
          setBranchLookup('loaded')
          setBranch((current) => {
            if (current.trim() && current !== 'main') return current
            return nextBranches.includes('main') ? 'main' : nextBranches[0] ?? current
          })
        })
        .catch((err: Error) => {
          if (cancelled) return
          setBranches([])
          setBranchLookup('error')
          setBranchLookupError(err.message || 'Could not load branches')
        })
    }, 450)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [deferredUrl])

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={launchButtonStyle}>
        <Rocket size={16} />
        New service
      </button>

      {open && (
        <div style={compact ? compactOverlayStyle : overlayStyle} role="presentation">
          <form onSubmit={submit} style={compact ? compactModalStyle : modalStyle}>
            <div style={compact ? compactModalHeaderStyle : modalHeaderStyle}>
              <div>
                <div style={modalKickerStyle}>Deploy service</div>
                <h2 style={compact ? compactModalTitleStyle : modalTitleStyle}>Connect a repository</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={closeButtonStyle} aria-label="Close deploy modal">
                <X size={18} />
              </button>
            </div>

            <div style={compact ? compactModalBodyStyle : modalBodyStyle}>
              <section style={sectionStyle}>
                <div style={sectionHeadingStyle}>
                  <Server size={16} />
                  Source
                </div>
                <label style={labelStyle}>
                  Git repository
                  <input
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://github.com/org/service"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Branch
                  <div style={branchInputWrapStyle}>
                    <GitBranch size={15} color="var(--ink-muted)" />
                    {branches.length > 0 ? (
                      <select
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        style={branchSelectStyle}
                        aria-label="Select repository branch"
                      >
                        {branchOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        placeholder="main"
                        style={branchInputStyle}
                      />
                    )}
                  </div>
                  {branchLookup === 'loading' && (
                    <span style={branchHintStyle}>Inspecting repository branches...</span>
                  )}
                  {branchLookup === 'loaded' && branches.length > 0 && (
                    <span style={branchHintStyle}>{branches.length} branches found. Pick the deploy target.</span>
                  )}
                  {branchLookup === 'loaded' && branches.length === 0 && (
                    <span style={branchHintStyle}>No remote branches found. You can type one manually.</span>
                  )}
                  {branchLookup === 'error' && (
                    <span style={branchErrorStyle}>
                      Branches unavailable. Type one manually. {branchLookupError}
                    </span>
                  )}
                </label>
              </section>

              <section style={sectionStyle}>
                <div style={sectionHeadingStyle}>
                  <Database size={16} />
                  Resources
                </div>
                <button
                  type="button"
                  onClick={() => setAttachPostgres((value) => !value)}
                  style={attachPostgres ? selectedResourceStyle : resourceStyle}
                >
                  <span style={resourceIconStyle}>PG</span>
                  <span style={{ flex: 1 }}>
                    <strong style={resourceTitleStyle}>PostgreSQL</strong>
                    <span style={resourceCopyStyle}>Persistent volume and injected DATABASE_URL</span>
                  </span>
                  {attachPostgres && <Check size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttachRedis((value) => {
                      if (value) setPersistRedis(false)
                      return !value
                    })
                  }}
                  style={attachRedis ? selectedResourceStyle : resourceStyle}
                >
                  <span style={redisIconStyle}>RD</span>
                  <span style={{ flex: 1 }}>
                    <strong style={resourceTitleStyle}>Redis</strong>
                    <span style={resourceCopyStyle}>Cache by default, optional append-only persistence</span>
                  </span>
                  {attachRedis && <Check size={16} />}
                </button>
                {attachRedis && (
                  <button
                    type="button"
                    onClick={() => setPersistRedis((value) => !value)}
                    style={persistRedis ? selectedPersistStyle : persistStyle}
                  >
                    <Zap size={14} />
                    Append-only Redis persistence
                  </button>
                )}
              </section>

              <section style={sectionStyle}>
                <div style={sectionHeadingStyle}>
                  <KeyRound size={16} />
                  Environment
                  {envCount > 0 && <span style={countPillStyle}>{envCount}</span>}
                  {secretCount > 0 && <span style={secretPillStyle}>{secretCount} secret</span>}
                </div>

                <div style={modeSwitchStyle}>
                  <button type="button" onClick={() => setPasteMode(false)} style={!pasteMode ? activeModeStyle : modeStyle}>
                    Key/value
                  </button>
                  <button type="button" onClick={() => setPasteMode(true)} style={pasteMode ? activeModeStyle : modeStyle}>
                    Paste .env
                  </button>
                </div>

                {pasteMode ? (
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={'VITE_API_URL=https://api.example.com\nAPI_TOKEN=secret'}
                    rows={6}
                    style={textareaStyle}
                  />
                ) : (
                  <div style={envListStyle}>
                    {pairs.length === 0 && (
                      <button type="button" onClick={addPair} style={emptyEnvStyle}>
                        <Plus size={16} />
                        Add the first environment variable
                      </button>
                    )}
                    {pairs.map((pair, i) => (
                      <div key={i} style={compact ? compactEnvRowStyle : envRowStyle}>
                        <input
                          value={pair.key}
                          onChange={(e) => updatePair(i, 'key', e.target.value)}
                          placeholder="KEY"
                          style={envKeyInputStyle}
                        />
                        <input
                          value={pair.value}
                          onChange={(e) => updatePair(i, 'value', e.target.value)}
                          placeholder="value"
                          type={pair.secret ? 'password' : 'text'}
                          style={envValueInputStyle}
                        />
                        <button
                          type="button"
                          onClick={() => toggleSecret(i)}
                          title={pair.secret ? 'Stored as secret' : 'Stored as plain env'}
                          style={pair.secret ? secretToggleActiveStyle : secretToggleStyle}
                        >
                          {pair.secret ? <Lock size={14} /> : <Unlock size={14} />}
                        </button>
                        <button type="button" onClick={() => removePair(i)} style={iconButtonStyle} title="Remove variable">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {pairs.length > 0 && (
                      <button type="button" onClick={addPair} style={addVarStyle}>
                        <Plus size={14} />
                        Add variable
                      </button>
                    )}
                  </div>
                )}
              </section>

              {error && <div style={errorStyle}>{error.message}</div>}
            </div>

            <div style={compact ? compactModalFooterStyle : modalFooterStyle}>
              <div style={guardrailStyle}>
                <Shield size={15} />
                HTTPS Git URLs only. Secret values stay server-side.
              </div>
              <button type="submit" disabled={isPending || !url.trim()} style={{
                ...primaryButtonStyle,
                opacity: isPending || !url.trim() ? 0.45 : 1,
              }}>
                <Rocket size={16} />
                {isPending ? 'Queuing deploy' : 'Deploy service'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

function useCompactLayout() {
  const [compact, setCompact] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < 720,
  )

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 720)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return compact
}

const launchButtonStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--ink)',
  border: '1px solid var(--ink)',
  borderRadius: 0,
  color: 'var(--paper)',
  cursor: 'pointer',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  fontWeight: 600,
  gap: 10,
  height: 44,
  justifyContent: 'center',
  letterSpacing: '0.02em',
  padding: '0 18px',
  textTransform: 'uppercase',
}

const overlayStyle: CSSProperties = {
  alignItems: 'center',
  background: 'rgba(18,18,14,0.52)',
  backdropFilter: 'blur(10px)',
  display: 'flex',
  inset: 0,
  justifyContent: 'center',
  padding: 24,
  position: 'fixed',
  zIndex: 100,
}

const compactOverlayStyle: CSSProperties = {
  ...overlayStyle,
  alignItems: 'flex-start',
  padding: 10,
}

const modalStyle: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--line-strong)',
  boxShadow: '0 30px 90px rgba(10,10,8,0.28)',
  maxHeight: 'calc(100vh - 48px)',
  maxWidth: 880,
  overflow: 'hidden',
  width: '100%',
}

const compactModalStyle: CSSProperties = {
  ...modalStyle,
  maxHeight: 'calc(100vh - 20px)',
}

const modalHeaderStyle: CSSProperties = {
  alignItems: 'flex-start',
  borderBottom: '1px solid var(--line)',
  display: 'flex',
  justifyContent: 'space-between',
  padding: '24px 28px',
}

const compactModalHeaderStyle: CSSProperties = {
  ...modalHeaderStyle,
  padding: '18px 18px',
}

const modalKickerStyle: CSSProperties = {
  color: 'var(--blue)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  marginBottom: 8,
  textTransform: 'uppercase',
}

const modalTitleStyle: CSSProperties = {
  color: 'var(--ink)',
  fontSize: 30,
  fontWeight: 500,
  letterSpacing: 0,
  lineHeight: 1.05,
}

const compactModalTitleStyle: CSSProperties = {
  ...modalTitleStyle,
  fontSize: 27,
}

const closeButtonStyle: CSSProperties = {
  alignItems: 'center',
  background: 'transparent',
  border: '1px solid var(--line)',
  color: 'var(--ink-muted)',
  cursor: 'pointer',
  display: 'flex',
  height: 34,
  justifyContent: 'center',
  width: 34,
}

const modalBodyStyle: CSSProperties = {
  display: 'grid',
  gap: 18,
  maxHeight: 'calc(100vh - 210px)',
  overflowY: 'auto',
  padding: 28,
}

const compactModalBodyStyle: CSSProperties = {
  ...modalBodyStyle,
  maxHeight: 'calc(100vh - 190px)',
  padding: 16,
}

const sectionStyle: CSSProperties = {
  border: '1px solid var(--line)',
  display: 'grid',
  gap: 14,
  padding: 18,
}

const sectionHeadingStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--ink)',
  display: 'flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 700,
  gap: 8,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const labelStyle: CSSProperties = {
  color: 'var(--ink-soft)',
  display: 'grid',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  gap: 7,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const inputStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  height: 44,
  outline: 'none',
  padding: '0 13px',
  textTransform: 'none',
}

const branchInputWrapStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  display: 'flex',
  gap: 10,
  height: 44,
  padding: '0 13px',
}

const branchInputStyle: CSSProperties = {
  background: 'transparent',
  border: 0,
  color: 'var(--ink)',
  flex: 1,
  fontFamily: 'var(--font-mono)',
  fontSize: 14,
  outline: 'none',
}

const branchSelectStyle: CSSProperties = {
  ...branchInputStyle,
  appearance: 'none',
  cursor: 'pointer',
  width: '100%',
}

const branchHintStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: 0,
  lineHeight: 1.35,
  textTransform: 'none',
}

const branchErrorStyle: CSSProperties = {
  ...branchHintStyle,
  color: 'var(--danger)',
}

const resourceStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  color: 'var(--ink)',
  cursor: 'pointer',
  display: 'flex',
  gap: 13,
  minHeight: 66,
  padding: '12px 14px',
  textAlign: 'left',
}

const selectedResourceStyle: CSSProperties = {
  ...resourceStyle,
  background: 'var(--blue-soft)',
  borderColor: 'var(--blue)',
}

const resourceIconStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--ink)',
  color: 'var(--paper)',
  display: 'flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  height: 30,
  justifyContent: 'center',
  width: 34,
}

const redisIconStyle: CSSProperties = {
  ...resourceIconStyle,
  background: 'var(--amber)',
  color: 'var(--ink)',
}

const resourceTitleStyle: CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 3,
}

const resourceCopyStyle: CSSProperties = {
  color: 'var(--ink-muted)',
  display: 'block',
  fontSize: 12,
  lineHeight: 1.35,
}

const persistStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--paper)',
  border: '1px dashed var(--line-strong)',
  color: 'var(--ink-muted)',
  cursor: 'pointer',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 700,
  gap: 8,
  height: 38,
  justifyContent: 'center',
  textTransform: 'uppercase',
}

const selectedPersistStyle: CSSProperties = {
  ...persistStyle,
  background: 'rgba(255,178,79,0.18)',
  borderColor: 'var(--amber)',
  color: 'var(--ink)',
}

const modeSwitchStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  display: 'flex',
  padding: 3,
  width: 'fit-content',
}

const modeStyle: CSSProperties = {
  background: 'transparent',
  border: 0,
  color: 'var(--ink-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 700,
  padding: '7px 12px',
  textTransform: 'uppercase',
}

const activeModeStyle: CSSProperties = {
  ...modeStyle,
  background: 'var(--ink)',
  color: 'var(--paper)',
}

const countPillStyle: CSSProperties = {
  background: 'var(--lime)',
  color: 'var(--ink)',
  fontSize: 10,
  padding: '2px 6px',
}

const secretPillStyle: CSSProperties = {
  background: 'var(--ink)',
  color: 'var(--paper)',
  fontSize: 10,
  padding: '2px 6px',
}

const textareaStyle: CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-code)',
  fontSize: 13,
  lineHeight: 1.6,
  outline: 'none',
  padding: 12,
  resize: 'vertical',
  width: '100%',
}

const envListStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const emptyEnvStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--paper)',
  border: '1px dashed var(--line-strong)',
  color: 'var(--ink-muted)',
  cursor: 'pointer',
  display: 'flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 700,
  gap: 8,
  height: 44,
  justifyContent: 'center',
  textTransform: 'uppercase',
}

const envRowStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  gridTemplateColumns: 'minmax(150px, 0.9fr) minmax(180px, 1.2fr) 40px 40px',
}

const compactEnvRowStyle: CSSProperties = {
  ...envRowStyle,
  gridTemplateColumns: '1fr',
}

const envKeyInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: 'var(--font-code)',
  fontSize: 13,
  height: 40,
}

const envValueInputStyle: CSSProperties = {
  ...envKeyInputStyle,
}

const secretToggleStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  color: 'var(--ink-muted)',
  cursor: 'pointer',
  display: 'flex',
  height: 40,
  justifyContent: 'center',
}

const secretToggleActiveStyle: CSSProperties = {
  ...secretToggleStyle,
  background: 'var(--ink)',
  borderColor: 'var(--ink)',
  color: 'var(--paper)',
}

const iconButtonStyle: CSSProperties = {
  ...secretToggleStyle,
}

const addVarStyle: CSSProperties = {
  alignItems: 'center',
  background: 'transparent',
  border: 0,
  color: 'var(--blue)',
  cursor: 'pointer',
  display: 'inline-flex',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 700,
  gap: 6,
  justifySelf: 'start',
  padding: '7px 0',
  textTransform: 'uppercase',
}

const errorStyle: CSSProperties = {
  background: 'rgba(210,67,67,0.09)',
  border: '1px solid rgba(210,67,67,0.22)',
  color: 'var(--danger)',
  fontSize: 13,
  padding: 12,
}

const modalFooterStyle: CSSProperties = {
  alignItems: 'center',
  borderTop: '1px solid var(--line)',
  display: 'flex',
  gap: 18,
  justifyContent: 'space-between',
  padding: '18px 28px',
}

const compactModalFooterStyle: CSSProperties = {
  ...modalFooterStyle,
  alignItems: 'stretch',
  flexDirection: 'column',
  padding: '16px 18px',
}

const guardrailStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--ink-muted)',
  display: 'flex',
  fontSize: 12,
  gap: 8,
}

const primaryButtonStyle: CSSProperties = {
  ...launchButtonStyle,
  minWidth: 170,
}

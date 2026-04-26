import { describe, it, expect } from 'vitest'
import { parsePortFromInfo } from '../services/builder.js'

describe('parsePortFromInfo', () => {
  it('reads PORT from deploy.variables', () => {
    const json = JSON.stringify({ deploy: { variables: { PORT: '4000' } } })
    expect(parsePortFromInfo(json)).toBe(4000)
  })

  it('falls back to top-level variables', () => {
    const json = JSON.stringify({ variables: { PORT: '8080' } })
    expect(parsePortFromInfo(json)).toBe(8080)
  })

  it('falls back to config.deploy.variables', () => {
    const json = JSON.stringify({ config: { deploy: { variables: { PORT: '5000' } } } })
    expect(parsePortFromInfo(json)).toBe(5000)
  })

  it('prefers deploy.variables over deeper paths', () => {
    const json = JSON.stringify({
      deploy: { variables: { PORT: '3001' } },
      variables: { PORT: '9999' },
    })
    expect(parsePortFromInfo(json)).toBe(3001)
  })

  it('returns null when PORT is absent', () => {
    expect(parsePortFromInfo(JSON.stringify({ deploy: {} }))).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(parsePortFromInfo('not json')).toBeNull()
  })

  it('returns null for PORT = 0', () => {
    expect(parsePortFromInfo(JSON.stringify({ variables: { PORT: '0' } }))).toBeNull()
  })

  it('returns null for a negative PORT', () => {
    expect(parsePortFromInfo(JSON.stringify({ variables: { PORT: '-1' } }))).toBeNull()
  })

  it('returns null for a non-numeric PORT string', () => {
    expect(parsePortFromInfo(JSON.stringify({ variables: { PORT: 'auto' } }))).toBeNull()
  })
})

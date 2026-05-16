import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import {
  insertDeploymentMetricSample,
  listDeployments,
} from '../db/schema.js'

const exec = promisify(execCb)
const METRICS_INTERVAL_MS = 15_000

interface DockerStatsPayload {
  CPUPerc?: string
  MemUsage?: string
  NetIO?: string
}

function parsePercent(raw: string | undefined): number | null {
  if (!raw) return null
  const value = Number(raw.replace('%', '').trim())
  return Number.isFinite(value) ? value : null
}

function parseHumanBytes(raw: string): number | null {
  const match = raw.trim().match(/^([\d.]+)\s*([kmgtp]?i?b)$/i)
  if (!match) return null

  const value = Number(match[1])
  if (!Number.isFinite(value)) return null

  const unit = match[2].toLowerCase()
  const powers: Record<string, number> = {
    b: 0,
    kb: 1,
    mb: 2,
    gb: 3,
    tb: 4,
    pb: 5,
    kib: 1,
    mib: 2,
    gib: 3,
    tib: 4,
    pib: 5,
  }

  const power = powers[unit]
  if (power === undefined) return null
  const base = unit.endsWith('ib') ? 1024 : 1000
  return Math.round(value * (base ** power))
}

function parseMemory(raw: string | undefined): { used: number | null; limit: number | null } {
  if (!raw) return { used: null, limit: null }
  const [used, limit] = raw.split('/').map((part) => part.trim())
  return {
    used: used ? parseHumanBytes(used) : null,
    limit: limit ? parseHumanBytes(limit) : null,
  }
}

function parseNetwork(raw: string | undefined): { rx: number | null; tx: number | null } {
  if (!raw) return { rx: null, tx: null }
  const [rx, tx] = raw.split('/').map((part) => part.trim())
  return {
    rx: rx ? parseHumanBytes(rx) : null,
    tx: tx ? parseHumanBytes(tx) : null,
  }
}

async function readContainerStats(containerName: string): Promise<DockerStatsPayload | null> {
  try {
    const { stdout } = await exec(`docker stats --no-stream --format '{{ json . }}' ${containerName}`)
    return JSON.parse(stdout.trim()) as DockerStatsPayload
  } catch {
    return null
  }
}

export async function runMetricsSweep(): Promise<void> {
  const deployments = listDeployments().filter((deployment) =>
    deployment.status === 'running' && deployment.container_name,
  )

  for (const deployment of deployments) {
    const stats = await readContainerStats(deployment.container_name!)
    if (!stats) continue

    const memory = parseMemory(stats.MemUsage)
    const network = parseNetwork(stats.NetIO)

    insertDeploymentMetricSample(deployment.id, {
      cpuPct: parsePercent(stats.CPUPerc),
      memoryUsedBytes: memory.used,
      memoryLimitBytes: memory.limit,
      networkRxBytes: network.rx,
      networkTxBytes: network.tx,
    })
  }
}

export function startMetricsMonitor(): void {
  runMetricsSweep().catch((err) => console.error('metrics sweep error:', err))
  setInterval(() => {
    runMetricsSweep().catch((err) => console.error('metrics sweep error:', err))
  }, METRICS_INTERVAL_MS)
}

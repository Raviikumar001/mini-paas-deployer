import { join } from 'path'
import { rm } from 'fs/promises'
import { updateDeployment, type Addon } from '../db/schema.js'
import { emitLog, emitStatus, emitDone } from '../lib/emitter.js'
import { cloneRepo, buildImage, detectPort } from './builder.js'
import { runContainer, stopAndRemove, waitForContainer } from './runner.js'
import { addRoute, updateRoute } from './caddy.js'
import {
  runPostgres, waitForPostgres, buildDatabaseUrl,
  runRedis, waitForRedis, buildRedisUrl,
} from './addons.js'
import { startRuntimeLogs, stopRuntimeLogs } from './runtime-logs.js'

const TMP = '/tmp'


function toSubdomain(name: string, id: string, branch?: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  const branchSlug = branch && branch !== 'main'
    ? branch
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 16) + '-'
    : ''
  return `${branchSlug}${slug}-${id.slice(0, 4)}`
}

export async function runPipeline(
  deploymentId: string,
  gitUrl: string,
  name: string,
  envVars: Record<string, string> = {},
  branch?: string,
  addons: Addon[] = [],
): Promise<void> {
  const srcPath = join(TMP, `build-${deploymentId}`)
  const mergedEnv = { ...envVars }
  let containerName = ''
  let reachedRunning = false

  try {
    // ── 0. Start addons ───────────────────────────────────────────────────────
    const hasPostgres = addons.some((a) => a.type === 'postgres')
    if (hasPostgres) {
      await runPostgres(deploymentId)
      await waitForPostgres(deploymentId)
      mergedEnv.DATABASE_URL = buildDatabaseUrl(deploymentId)
    }

    const hasRedis = addons.some((a) => a.type === 'redis')
    if (hasRedis) {
      await runRedis(deploymentId, addons.find((a) => a.type === 'redis')?.persistent === true)
      await waitForRedis(deploymentId)
      mergedEnv.REDIS_URL = buildRedisUrl(deploymentId)
    }

    // ── 1. Clone ──────────────────────────────────────────────────────────────
    emitStatus(deploymentId, 'building')
    updateDeployment(deploymentId, { status: 'building' })
    await cloneRepo(gitUrl, srcPath, deploymentId, branch)

    // ── 2. Detect port + build image in parallel ──────────────────────────────
    const id = deploymentId.toLowerCase().replace(/[^a-z0-9]/g, '')
    const imageTag = `nobuild-${id}:latest`

    const [appPort] = await Promise.all([
      detectPort(srcPath).then((p) => p ?? 3000),
      buildImage(srcPath, imageTag, deploymentId, name, envVars),
    ])

    updateDeployment(deploymentId, { app_port: appPort, image_tag: imageTag })

    // ── 3. Run container ──────────────────────────────────────────────────────
    emitStatus(deploymentId, 'deploying')
    updateDeployment(deploymentId, { status: 'deploying' })

    containerName = `dep-${id}`
    await stopAndRemove(containerName).catch(() => {})

    const containerId = await runContainer(containerName, imageTag, appPort, mergedEnv)
    updateDeployment(deploymentId, { container_id: containerId, container_name: containerName })

    // ── 4. Wait for app to accept connections ─────────────────────────────────
    emitLog(deploymentId, 'system', `Waiting for ${containerName}:${appPort}…`)
    await waitForContainer(containerName, appPort)

    // ── 5. Wire up Caddy ingress ──────────────────────────────────────────────
    emitLog(deploymentId, 'system', 'Configuring ingress…')
    const subdomain = toSubdomain(name, id, branch)
    await addRoute(deploymentId, subdomain, containerName, appPort)

    const baseDomain = process.env.BASE_DOMAIN || 'localhost'
    const url = `http://${subdomain}.${baseDomain}`
    updateDeployment(deploymentId, { status: 'running', url })
    emitStatus(deploymentId, 'running')
    emitLog(deploymentId, 'system', `Live → ${url}`)

    reachedRunning = true
    startRuntimeLogs(deploymentId, containerName)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    updateDeployment(deploymentId, { status: 'failed', error: message })
    emitStatus(deploymentId, 'failed')
    emitLog(deploymentId, 'system', `Pipeline failed: ${message}`)
    throw err
  } finally {
    if (!reachedRunning) {
      emitDone(deploymentId)
    }
    await rm(srcPath, { recursive: true, force: true })
  }
}

// ── Zero-downtime redeploy ────────────────────────────────────────────────────
// Old container keeps serving traffic the entire time.
// New container is built and probed, then Caddy upstream is swapped atomically.
// Only after the swap succeeds does the old container get stopped.

export async function runRedeployPipeline(
  deploymentId: string,
  gitUrl: string,
  name: string,
  oldContainerName: string,
  envVars: Record<string, string> = {},
  branch?: string,
  addons: Addon[] = [],
): Promise<void> {
  const id = deploymentId.toLowerCase().replace(/[^a-z0-9]/g, '')
  const srcPath = join(TMP, `build-${deploymentId}-redeploy`)
  const nextContainerName = `dep-${id}-${Date.now().toString(36)}`
  const mergedEnv = { ...envVars }
  let reachedRunning = false

  try {
    // ── 0. Ensure addons are running ──────────────────────────────────────────
    const hasPostgres = addons.some((a) => a.type === 'postgres')
    if (hasPostgres) {
      await runPostgres(deploymentId)
      await waitForPostgres(deploymentId)
      mergedEnv.DATABASE_URL = buildDatabaseUrl(deploymentId)
    }

    const hasRedis = addons.some((a) => a.type === 'redis')
    if (hasRedis) {
      await runRedis(deploymentId, addons.find((a) => a.type === 'redis')?.persistent === true)
      await waitForRedis(deploymentId)
      mergedEnv.REDIS_URL = buildRedisUrl(deploymentId)
    }

    // ── 1. Clone fresh copy ───────────────────────────────────────────────────
    emitStatus(deploymentId, 'redeploying')
    updateDeployment(deploymentId, { status: 'redeploying' })
    await cloneRepo(gitUrl, srcPath, deploymentId, branch)

    // ── 2. Detect port + build new image in parallel ──────────────────────────
    const imageTag = `nobuild-${id}:latest`

    const [appPort] = await Promise.all([
      detectPort(srcPath).then((p) => p ?? 3000),
      buildImage(srcPath, imageTag, deploymentId, name, envVars),
    ])

    updateDeployment(deploymentId, { app_port: appPort, image_tag: imageTag })

    // ── 3. Start next container (old still serving) ───────────────────────────
    emitLog(deploymentId, 'system', 'Starting new container…')
    const containerId = await runContainer(nextContainerName, imageTag, appPort, mergedEnv)

    // ── 4. Probe next container ───────────────────────────────────────────────
    emitLog(deploymentId, 'system', `Waiting for ${nextContainerName}:${appPort}…`)
    await waitForContainer(nextContainerName, appPort)

    // ── 5. Atomic Caddy upstream swap — zero gap ──────────────────────────────
    emitLog(deploymentId, 'system', 'New version ready — swapping traffic…')
    await updateRoute(deploymentId, nextContainerName, appPort)

    // ── 6. Tear down old container (traffic already on next) ──────────────────
    emitLog(deploymentId, 'system', `Stopping old container ${oldContainerName}…`)
    await stopAndRemove(oldContainerName).catch(() => {})

    const subdomain = toSubdomain(name, id, branch)
    const baseDomain = process.env.BASE_DOMAIN || 'localhost'
    const url = `http://${subdomain}.${baseDomain}`
    updateDeployment(deploymentId, {
      status: 'running',
      url,
      container_id: containerId,
      container_name: nextContainerName,
    })
    emitStatus(deploymentId, 'running')
    emitLog(deploymentId, 'system', `Redeployed → ${url}`)

    reachedRunning = true
    startRuntimeLogs(deploymentId, nextContainerName)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    updateDeployment(deploymentId, { status: 'failed', error: message })
    emitStatus(deploymentId, 'failed')
    emitLog(deploymentId, 'system', `Redeploy failed: ${message}`)
    await stopAndRemove(nextContainerName).catch(() => {})
    throw err
  } finally {
    if (!reachedRunning) {
      emitDone(deploymentId)
    }
    await rm(srcPath, { recursive: true, force: true })
  }
}

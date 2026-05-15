import { join } from 'path'
import { rm } from 'fs/promises'
import { updateDeployment, type Addon } from '../db/schema.js'
import { emitLog, emitStatus, emitDone } from '../lib/emitter.js'
import { recordDeploymentEvent } from './deployment-events.js'
import { detectAppProfile } from './app-profile.js'
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
  let currentStage = 'initialize'
  const pipelineStartedAt = Date.now()
  let deployStartedAt = 0
  let buildStartedAt = 0

  try {
    // ── 0. Start addons ───────────────────────────────────────────────────────
    const hasPostgres = addons.some((a) => a.type === 'postgres')
    const hasRedis = addons.some((a) => a.type === 'redis')
    if (hasPostgres || hasRedis) {
      currentStage = 'addons'
      recordDeploymentEvent(
        deploymentId,
        'addons_provisioning',
        'Provisioning attached resources',
        { postgres: hasPostgres, redis: hasRedis },
      )
      if (hasPostgres) {
        await runPostgres(deploymentId)
        await waitForPostgres(deploymentId)
        mergedEnv.DATABASE_URL = buildDatabaseUrl(deploymentId)
      }

      if (hasRedis) {
        await runRedis(deploymentId, addons.find((a) => a.type === 'redis')?.persistent === true)
        await waitForRedis(deploymentId)
        mergedEnv.REDIS_URL = buildRedisUrl(deploymentId)
      }

      recordDeploymentEvent(
        deploymentId,
        'addons_ready',
        'Attached resources are ready',
        { postgres: hasPostgres, redis: hasRedis },
      )
    }

    // ── 1. Clone ──────────────────────────────────────────────────────────────
    currentStage = 'clone'
    recordDeploymentEvent(deploymentId, 'clone_started', 'Cloning repository', { gitUrl, branch: branch ?? 'main' })
    emitStatus(deploymentId, 'building')
    updateDeployment(deploymentId, { status: 'building' })
    await cloneRepo(gitUrl, srcPath, deploymentId, branch)
    recordDeploymentEvent(deploymentId, 'clone_completed', 'Repository cloned', { branch: branch ?? 'main' })

    // ── 2. Detect port + build image in parallel ──────────────────────────────
    const id = deploymentId.toLowerCase().replace(/[^a-z0-9]/g, '')
    const imageTag = `nobuild-${id}:latest`

    currentStage = 'build'
    buildStartedAt = Date.now()
    recordDeploymentEvent(deploymentId, 'build_started', 'Building runtime image', { imageTag })
    const [appPort, profile] = await Promise.all([
      detectPort(srcPath).then((p) => p ?? 3000),
      detectAppProfile(srcPath),
      buildImage(srcPath, imageTag, deploymentId, name, envVars),
    ])

    updateDeployment(deploymentId, {
      app_port: appPort,
      image_tag: imageTag,
      build_duration_ms: Date.now() - buildStartedAt,
      detected_language: profile.language,
      detected_framework: profile.framework,
      detected_start_command: profile.startCommand,
    })
    recordDeploymentEvent(deploymentId, 'build_completed', 'Image built successfully', { imageTag, appPort })

    // ── 3. Run container ──────────────────────────────────────────────────────
    currentStage = 'container'
    deployStartedAt = Date.now()
    emitStatus(deploymentId, 'deploying')
    updateDeployment(deploymentId, { status: 'deploying' })

    containerName = `dep-${id}`
    await stopAndRemove(containerName).catch(() => {})

    const containerId = await runContainer(containerName, imageTag, appPort, mergedEnv)
    updateDeployment(deploymentId, { container_id: containerId, container_name: containerName })
    recordDeploymentEvent(deploymentId, 'container_started', 'Application container started', {
      containerName,
      appPort,
    })

    // ── 4. Wait for app to accept connections ─────────────────────────────────
    currentStage = 'healthcheck'
    emitLog(deploymentId, 'system', `Waiting for ${containerName}:${appPort}…`)
    await waitForContainer(containerName, appPort)
    recordDeploymentEvent(deploymentId, 'healthcheck_passed', 'Health check passed', { containerName, appPort })

    // ── 5. Wire up Caddy ingress ──────────────────────────────────────────────
    currentStage = 'route'
    emitLog(deploymentId, 'system', 'Configuring ingress…')
    const subdomain = toSubdomain(name, id, branch)
    await addRoute(deploymentId, subdomain, containerName, appPort)
    recordDeploymentEvent(deploymentId, 'route_configured', 'Ingress route configured', { subdomain, appPort })

    const baseDomain = process.env.BASE_DOMAIN || 'localhost'
    const url = `http://${subdomain}.${baseDomain}`
    updateDeployment(deploymentId, {
      status: 'running',
      url,
      deploy_duration_ms: Date.now() - deployStartedAt,
      last_failure_at: null,
      last_failure_stage: null,
    })
    emitStatus(deploymentId, 'running')
    emitLog(deploymentId, 'system', `Live → ${url}`)
    recordDeploymentEvent(deploymentId, 'runtime_live', 'Deployment is live', {
      url,
      totalDurationMs: Date.now() - pipelineStartedAt,
    })

    reachedRunning = true
    startRuntimeLogs(deploymentId, containerName)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    updateDeployment(deploymentId, { status: 'failed', error: message })
    emitStatus(deploymentId, 'failed')
    emitLog(deploymentId, 'system', `Pipeline failed: ${message}`)
    updateDeployment(deploymentId, {
      last_failure_at: new Date().toISOString(),
      last_failure_stage: currentStage,
    })
    recordDeploymentEvent(deploymentId, 'deployment_failed', 'Deployment failed', {
      stage: currentStage,
      error: message,
    })
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
  let currentStage = 'initialize'
  const pipelineStartedAt = Date.now()
  let deployStartedAt = 0
  let buildStartedAt = 0

  try {
    // ── 0. Ensure addons are running ──────────────────────────────────────────
    const hasPostgres = addons.some((a) => a.type === 'postgres')
    const hasRedis = addons.some((a) => a.type === 'redis')
    currentStage = 'redeploy'
    recordDeploymentEvent(deploymentId, 'redeploy_started', 'Starting zero-downtime redeploy', {
      branch: branch ?? 'main',
    })
    if (hasPostgres || hasRedis) {
      recordDeploymentEvent(
        deploymentId,
        'addons_provisioning',
        'Checking attached resources before redeploy',
        { postgres: hasPostgres, redis: hasRedis },
      )
      if (hasPostgres) {
        await runPostgres(deploymentId)
        await waitForPostgres(deploymentId)
        mergedEnv.DATABASE_URL = buildDatabaseUrl(deploymentId)
      }

      if (hasRedis) {
        await runRedis(deploymentId, addons.find((a) => a.type === 'redis')?.persistent === true)
        await waitForRedis(deploymentId)
        mergedEnv.REDIS_URL = buildRedisUrl(deploymentId)
      }

      recordDeploymentEvent(
        deploymentId,
        'addons_ready',
        'Attached resources confirmed ready',
        { postgres: hasPostgres, redis: hasRedis },
      )
    }

    // ── 1. Clone fresh copy ───────────────────────────────────────────────────
    currentStage = 'clone'
    recordDeploymentEvent(deploymentId, 'clone_started', 'Cloning repository for redeploy', { gitUrl, branch: branch ?? 'main' })
    emitStatus(deploymentId, 'redeploying')
    updateDeployment(deploymentId, { status: 'redeploying' })
    await cloneRepo(gitUrl, srcPath, deploymentId, branch)
    recordDeploymentEvent(deploymentId, 'clone_completed', 'Fresh copy cloned', { branch: branch ?? 'main' })

    // ── 2. Detect port + build new image in parallel ──────────────────────────
    const imageTag = `nobuild-${id}:latest`

    currentStage = 'build'
    buildStartedAt = Date.now()
    recordDeploymentEvent(deploymentId, 'build_started', 'Building replacement image', { imageTag })
    const [appPort, profile] = await Promise.all([
      detectPort(srcPath).then((p) => p ?? 3000),
      detectAppProfile(srcPath),
      buildImage(srcPath, imageTag, deploymentId, name, envVars),
    ])

    updateDeployment(deploymentId, {
      app_port: appPort,
      image_tag: imageTag,
      build_duration_ms: Date.now() - buildStartedAt,
      detected_language: profile.language,
      detected_framework: profile.framework,
      detected_start_command: profile.startCommand,
    })
    recordDeploymentEvent(deploymentId, 'build_completed', 'Replacement image built', { imageTag, appPort })

    // ── 3. Start next container (old still serving) ───────────────────────────
    currentStage = 'container'
    deployStartedAt = Date.now()
    emitLog(deploymentId, 'system', 'Starting new container…')
    const containerId = await runContainer(nextContainerName, imageTag, appPort, mergedEnv)
    recordDeploymentEvent(deploymentId, 'container_started', 'Replacement container started', {
      containerName: nextContainerName,
      appPort,
    })

    // ── 4. Probe next container ───────────────────────────────────────────────
    currentStage = 'healthcheck'
    emitLog(deploymentId, 'system', `Waiting for ${nextContainerName}:${appPort}…`)
    await waitForContainer(nextContainerName, appPort)
    recordDeploymentEvent(deploymentId, 'healthcheck_passed', 'Replacement health check passed', {
      containerName: nextContainerName,
      appPort,
    })

    // ── 5. Atomic Caddy upstream swap — zero gap ──────────────────────────────
    currentStage = 'route-swap'
    emitLog(deploymentId, 'system', 'New version ready — swapping traffic…')
    await updateRoute(deploymentId, nextContainerName, appPort)
    recordDeploymentEvent(deploymentId, 'traffic_shifted', 'Traffic switched to replacement container', {
      containerName: nextContainerName,
      appPort,
    })

    // ── 6. Tear down old container (traffic already on next) ──────────────────
    currentStage = 'cleanup'
    emitLog(deploymentId, 'system', `Stopping old container ${oldContainerName}…`)
    await stopAndRemove(oldContainerName).catch(() => {})
    recordDeploymentEvent(deploymentId, 'old_runtime_stopped', 'Previous container stopped', {
      containerName: oldContainerName,
    })

    const subdomain = toSubdomain(name, id, branch)
    const baseDomain = process.env.BASE_DOMAIN || 'localhost'
    const url = `http://${subdomain}.${baseDomain}`
    updateDeployment(deploymentId, {
      status: 'running',
      url,
      container_id: containerId,
      container_name: nextContainerName,
      deploy_duration_ms: Date.now() - deployStartedAt,
      last_failure_at: null,
      last_failure_stage: null,
    })
    emitStatus(deploymentId, 'running')
    emitLog(deploymentId, 'system', `Redeployed → ${url}`)
    recordDeploymentEvent(deploymentId, 'runtime_live', 'Redeploy is live', {
      url,
      totalDurationMs: Date.now() - pipelineStartedAt,
    })

    reachedRunning = true
    startRuntimeLogs(deploymentId, nextContainerName)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    updateDeployment(deploymentId, { status: 'failed', error: message })
    emitStatus(deploymentId, 'failed')
    emitLog(deploymentId, 'system', `Redeploy failed: ${message}`)
    updateDeployment(deploymentId, {
      last_failure_at: new Date().toISOString(),
      last_failure_stage: currentStage,
    })
    recordDeploymentEvent(deploymentId, 'deployment_failed', 'Redeploy failed', {
      stage: currentStage,
      error: message,
    })
    await stopAndRemove(nextContainerName).catch(() => {})
    throw err
  } finally {
    if (!reachedRunning) {
      emitDone(deploymentId)
    }
    await rm(srcPath, { recursive: true, force: true })
  }
}

import { join } from 'path'
import { rm } from 'fs/promises'
import { updateDeployment } from '../db/schema.js'
import { emitLog, emitStatus, emitDone } from '../lib/emitter.js'
import { cloneRepo, buildImage, detectPort } from './builder.js'
import { runContainer, stopAndRemove, waitForContainer } from './runner.js'
import { addRoute, updateRoute } from './caddy.js'

const TMP = '/tmp'

// e.g. ("shopify-dashboard-v1", "a4o0486ad4") → "shopify-dashboard-v1-a4o0"
function toSubdomain(name: string, id: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return `${slug}-${id.slice(0, 4)}`
}

export async function runPipeline(
  deploymentId: string,
  gitUrl: string,
  name: string,
  envVars: Record<string, string> = {},
): Promise<void> {
  const srcPath = join(TMP, `build-${deploymentId}`)

  try {
    // ── 1. Clone ──────────────────────────────────────────────────────────────
    emitStatus(deploymentId, 'building')
    updateDeployment(deploymentId, { status: 'building' })
    await cloneRepo(gitUrl, srcPath, deploymentId)

    // ── 2. Detect port + build image in parallel ──────────────────────────────
    // detectPort only reads files already in srcPath; buildImage only reads
    // srcPath too — they share no mutable state so can run concurrently.
    const id = deploymentId.toLowerCase().replace(/[^a-z0-9]/g, '')
    const imageTag = `brimble-${id}:latest`

    const [appPort] = await Promise.all([
      detectPort(srcPath).then((p) => p ?? 3000),
      buildImage(srcPath, imageTag, deploymentId, name, envVars),
    ])

    updateDeployment(deploymentId, { app_port: appPort, image_tag: imageTag })

    // ── 3. Run container ──────────────────────────────────────────────────────
    emitStatus(deploymentId, 'deploying')
    updateDeployment(deploymentId, { status: 'deploying' })

    const containerName = `dep-${id}`
    await stopAndRemove(containerName).catch(() => {})

    const containerId = await runContainer(containerName, imageTag, appPort, envVars)
    updateDeployment(deploymentId, { container_id: containerId, container_name: containerName })

    // ── 4. Wait for app to accept connections ─────────────────────────────────
    emitLog(deploymentId, 'system', `Waiting for ${containerName}:${appPort}…`)
    await waitForContainer(containerName, appPort)

    // ── 5. Wire up Caddy ingress ──────────────────────────────────────────────
    emitLog(deploymentId, 'system', 'Configuring ingress…')
    const subdomain = toSubdomain(name, id)
    await addRoute(deploymentId, subdomain, containerName, appPort)

    const url = `http://${subdomain}.localhost`
    updateDeployment(deploymentId, { status: 'running', url })
    emitStatus(deploymentId, 'running')
    emitLog(deploymentId, 'system', `Live → ${url}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    updateDeployment(deploymentId, { status: 'failed', error: message })
    emitStatus(deploymentId, 'failed')
    emitLog(deploymentId, 'system', `Pipeline failed: ${message}`)
    throw err
  } finally {
    emitDone(deploymentId)
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
): Promise<void> {
  const id = deploymentId.toLowerCase().replace(/[^a-z0-9]/g, '')
  const srcPath = join(TMP, `build-${deploymentId}-redeploy`)
  // Unique name each redeploy so it never collides with the currently-serving
  // container (which may itself be named dep-<id>-<prev-ts> from a prior redeploy).
  const nextContainerName = `dep-${id}-${Date.now().toString(36)}`

  try {
    // ── 1. Clone fresh copy ───────────────────────────────────────────────────
    emitStatus(deploymentId, 'redeploying')
    updateDeployment(deploymentId, { status: 'redeploying' })
    await cloneRepo(gitUrl, srcPath, deploymentId)

    // ── 2. Detect port + build new image in parallel ──────────────────────────
    const imageTag = `brimble-${id}:latest`

    const [appPort] = await Promise.all([
      detectPort(srcPath).then((p) => p ?? 3000),
      buildImage(srcPath, imageTag, deploymentId, name, envVars),
    ])

    updateDeployment(deploymentId, { app_port: appPort, image_tag: imageTag })

    // ── 3. Start next container (old still serving) ───────────────────────────
    emitLog(deploymentId, 'system', 'Starting new container…')
    const containerId = await runContainer(nextContainerName, imageTag, appPort, envVars)

    // ── 4. Probe next container ───────────────────────────────────────────────
    emitLog(deploymentId, 'system', `Waiting for ${nextContainerName}:${appPort}…`)
    await waitForContainer(nextContainerName, appPort)

    // ── 5. Atomic Caddy upstream swap — zero gap ──────────────────────────────
    emitLog(deploymentId, 'system', 'New version ready — swapping traffic…')
    await updateRoute(deploymentId, nextContainerName, appPort)

    // ── 6. Tear down old container (traffic already on next) ──────────────────
    emitLog(deploymentId, 'system', `Stopping old container ${oldContainerName}…`)
    await stopAndRemove(oldContainerName).catch(() => {})

    const subdomain = toSubdomain(name, id)
    const url = `http://${subdomain}.localhost`
    updateDeployment(deploymentId, {
      status: 'running',
      url,
      container_id: containerId,
      container_name: nextContainerName,
    })
    emitStatus(deploymentId, 'running')
    emitLog(deploymentId, 'system', `Redeployed → ${url}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // On failure the old container may still be running — don't overwrite
    // container_name so the URL keeps working if the old one survived.
    updateDeployment(deploymentId, { status: 'failed', error: message })
    emitStatus(deploymentId, 'failed')
    emitLog(deploymentId, 'system', `Redeploy failed: ${message}`)
    await stopAndRemove(nextContainerName).catch(() => {})
    throw err
  } finally {
    emitDone(deploymentId)
    await rm(srcPath, { recursive: true, force: true })
  }
}

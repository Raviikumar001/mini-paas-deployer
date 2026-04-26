import { join } from 'path'
import { rm } from 'fs/promises'
import { updateDeployment } from '../db/schema.js'
import { emitLog, emitStatus, emitDone } from '../lib/emitter.js'
import { cloneRepo, buildImage, detectPort } from './builder.js'
import { runContainer, stopAndRemove, waitForContainer } from './runner.js'
import { addRoute } from './caddy.js'

const TMP = '/tmp'

export async function runPipeline(
  deploymentId: string,
  gitUrl: string,
  name: string, // repo name — stable across redeploys, used as build cache key
): Promise<void> {
  const srcPath = join(TMP, `build-${deploymentId}`)

  try {
    // ── 1. Clone ──────────────────────────────────────────────────────────────
    emitStatus(deploymentId, 'building')
    updateDeployment(deploymentId, { status: 'building' })
    await cloneRepo(gitUrl, srcPath, deploymentId)

    // ── 2. Detect port (best-effort; fallback 3000) ───────────────────────────
    const appPort = (await detectPort(srcPath)) ?? 3000
    updateDeployment(deploymentId, { app_port: appPort })

    // ── 3. Build image ────────────────────────────────────────────────────────
    const id = deploymentId.toLowerCase().replace(/[^a-z0-9]/g, '')
    const imageTag = `brimble-${id}:latest`
    await buildImage(srcPath, imageTag, deploymentId, name)
    updateDeployment(deploymentId, { image_tag: imageTag })

    // ── 4. Run container ──────────────────────────────────────────────────────
    emitStatus(deploymentId, 'deploying')
    updateDeployment(deploymentId, { status: 'deploying' })

    const containerName = `dep-${id}`
    await stopAndRemove(containerName).catch(() => {}) // safe no-op on first deploy

    const containerId = await runContainer(containerName, imageTag, appPort)
    updateDeployment(deploymentId, { container_id: containerId, container_name: containerName })

    // ── 5. Wait for app to accept connections ─────────────────────────────────
    emitLog(deploymentId, 'system', `Waiting for ${containerName}:${appPort}…`)
    await waitForContainer(containerName, appPort)

    // ── 6. Wire up Caddy ingress ──────────────────────────────────────────────
    emitLog(deploymentId, 'system', 'Configuring ingress…')
    await addRoute(deploymentId, containerName, appPort)

    const url = `http://${id}.localhost`
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

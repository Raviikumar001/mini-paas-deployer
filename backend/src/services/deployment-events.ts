import {
  insertDeploymentEvent,
  type DeploymentEventType,
} from '../db/schema.js'

type EventMetadata = Record<string, string | number | boolean | null>

export function recordDeploymentEvent(
  deploymentId: string,
  type: DeploymentEventType,
  message: string,
  metadata: EventMetadata = {},
): void {
  insertDeploymentEvent(deploymentId, type, message, metadata)
}

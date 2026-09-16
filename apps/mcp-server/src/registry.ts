import type { WidgetResourceUri } from '@keyforta/types';

export interface RegistryEntry {
  readonly contractVersion: number;
  readonly resourceUri: WidgetResourceUri;
  readonly toolName: string;
}

export function assertUniqueRegistry(entries: readonly RegistryEntry[]): void {
  const toolNames = new Set<string>();
  const resourceUris = new Set<string>();

  for (const entry of entries) {
    if (entry.contractVersion !== 1) {
      throw new Error(`Unsupported contract version for ${entry.toolName}`);
    }
    if (toolNames.has(entry.toolName)) {
      throw new Error(`Duplicate tool name: ${entry.toolName}`);
    }
    if (resourceUris.has(entry.resourceUri)) {
      throw new Error(`Duplicate resource URI: ${entry.resourceUri}`);
    }
    toolNames.add(entry.toolName);
    resourceUris.add(entry.resourceUri);
  }
}
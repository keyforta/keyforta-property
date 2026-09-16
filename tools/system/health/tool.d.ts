import type { z } from 'zod';

export const healthResource: {
  readonly uri: 'ui://keyforta/system/health';
};
export const healthDescription: string;
export const healthInputSchema: z.ZodType;
export const healthResultSchema: z.ZodType;
export function createHealthTool(options?: {
  now?: () => string;
}): {
  readonly description: string;
  readonly execute: (input: unknown, context: unknown) => Promise<unknown>;
  readonly inputSchema: z.ZodType;
  readonly name: string;
  readonly resource: typeof healthResource;
  readonly resultSchema: z.ZodType;
};

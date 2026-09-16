import type { z } from 'zod';
import type { WidgetResourceDescriptor } from '@keyforta/types';

export const healthResource: WidgetResourceDescriptor;
export const healthDescription: string;
export const healthInputSchema: z.ZodType;
export const healthStructuredContentSchema: z.ZodType;
export const healthWidgetDataSchema: z.ZodType;
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

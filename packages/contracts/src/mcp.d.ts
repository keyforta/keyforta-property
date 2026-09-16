import { z } from 'zod';
import type {
	HeadlessToolResult,
	HostToWidgetMessage,
	JsonObject,
	JsonValue,
	SafeToolError,
	ToolExecutionContext,
	ToolResult,
	WidgetResourceDescriptor,
	WidgetResourceUri,
	WidgetToHostMessage,
} from '@keyforta/types';

export const jsonValueSchema: z.ZodType<JsonValue>;
export const jsonObjectSchema: z.ZodType<JsonObject>;
export const widgetResourceUriSchema: z.ZodType<WidgetResourceUri>;
export const safeToolErrorSchema: z.ZodType<SafeToolError>;
export const toolTextContentSchema: z.ZodType<{
	readonly text: string;
	readonly type: 'text';
}>;
export const widgetResourceDescriptorSchema: z.ZodType<WidgetResourceDescriptor>;
export const toolExecutionContextSchema: z.ZodType<ToolExecutionContext>;
export const widgetToHostMessageSchema: z.ZodType<WidgetToHostMessage>;
export const hostToWidgetMessageSchema: z.ZodType<HostToWidgetMessage>;
export const toolDescriptionSchema: z.ZodType<string>;

export function createToolResultSchema<
	TStructuredContent extends JsonObject,
	TWidgetData extends JsonObject,
>(schemas: {
	structuredContentSchema: z.ZodType<TStructuredContent> & z.ZodObject;
	widgetDataSchema: z.ZodType<TWidgetData> & z.ZodObject;
}): z.ZodType<ToolResult<TStructuredContent, TWidgetData>>;
export function createToolResultSchema<
	TStructuredContent extends JsonObject,
>(schemas: {
	structuredContentSchema: z.ZodType<TStructuredContent> & z.ZodObject;
	widgetDataSchema?: undefined;
}): z.ZodType<HeadlessToolResult<TStructuredContent>>;
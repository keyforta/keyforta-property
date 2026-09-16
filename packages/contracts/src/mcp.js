import { z } from 'zod';

const forbiddenResultKeyFragments = [
	'accessToken',
	'authorization',
	'clientSecret',
	'connectionString',
	'cookie',
	'credential',
	'organization',
	'password',
	'refreshToken',
	'secret',
	'tenant',
	'token',
];

const normalizedForbiddenFragments = forbiddenResultKeyFragments.map((key) => key.toLowerCase());

const jsonPrimitiveSchema = z.union([z.boolean(), z.number().finite(), z.string(), z.null()]);

export const jsonValueSchema = z.lazy(() => z.union([
	jsonPrimitiveSchema,
	z.array(jsonValueSchema),
	z.record(z.string(), jsonValueSchema),
]));

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export const widgetResourceUriSchema = z.string().regex(
	/^ui:\/\/keyforta\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
	'Widget resource URI must match ui://keyforta/<domain>/<tool-name>',
);

export const safeToolErrorSchema = z.object({
	code: z.string().trim().min(1).max(64),
	correlationId: z.string().trim().min(1).max(128),
	messageKey: z.string().trim().min(1).max(128),
	retryable: z.boolean(),
}).strict();

export const toolTextContentSchema = z.object({
	text: z.string().max(4096),
	type: z.literal('text'),
}).strict();

export const widgetResourceDescriptorSchema = z.object({
	accessibility: z.object({
		descriptionKey: z.string().trim().min(1).max(128),
		titleKey: z.string().trim().min(1).max(128),
	}).strict(),
	contractVersion: z.literal(1),
	csp: z.object({
		connectDomains: z.array(z.string().url()).max(16),
		resourceDomains: z.array(z.string().url()).max(16),
	}).strict(),
	mimeType: z.literal('text/html+skybridge'),
	uri: widgetResourceUriSchema,
}).strict();

export const toolExecutionContextSchema = z.object({
	correlationId: z.string().trim().min(1).max(128),
	grantedScopes: z.array(z.string().trim().min(1).max(128)).max(32),
	locale: z.string().trim().min(2).max(35),
	principalReference: z.string().trim().min(1).max(256),
}).strict();

const widgetReadyMessageSchema = z.object({
	kind: z.literal('widget.ready'),
	protocolVersion: z.literal(1),
	resourceUri: widgetResourceUriSchema,
}).strict();

const widgetResizeMessageSchema = z.object({
	height: z.number().int().min(0).max(10000),
	kind: z.literal('widget.resize'),
	protocolVersion: z.literal(1),
	resourceUri: widgetResourceUriSchema,
}).strict();

const hostThemeMessageSchema = z.object({
	kind: z.literal('host.theme'),
	protocolVersion: z.literal(1),
	theme: z.enum(['dark', 'high-contrast', 'light']),
}).strict();

const hostLocaleMessageSchema = z.object({
	kind: z.literal('host.locale'),
	locale: z.string().trim().min(2).max(35),
	protocolVersion: z.literal(1),
}).strict();

export const widgetToHostMessageSchema = z.discriminatedUnion('kind', [
	widgetReadyMessageSchema,
	widgetResizeMessageSchema,
]);

export const hostToWidgetMessageSchema = z.discriminatedUnion('kind', [
	hostLocaleMessageSchema,
	hostThemeMessageSchema,
]);

export const toolDescriptionSchema = z.string().trim().min(1).superRefine((description, context) => {
	if (new TextEncoder().encode(description).byteLength >= 1024) {
		context.addIssue({
			code: 'custom',
			message: 'Tool description must be shorter than 1024 UTF-8 bytes',
		});
	}
});

const findForbiddenResultKey = (value, currentPath = []) => {
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			const match = findForbiddenResultKey(item, [...currentPath, index]);
			if (match) return match;
		}
		return undefined;
	}

	if (!value || typeof value !== 'object') return undefined;

	for (const [key, item] of Object.entries(value)) {
		const normalizedKey = key.replaceAll(/[^a-z0-9]/gi, '').toLowerCase();
		if (normalizedForbiddenFragments.some((fragment) => normalizedKey.includes(fragment))) {
			return [...currentPath, key];
		}

		const match = findForbiddenResultKey(item, [...currentPath, key]);
		if (match) return match;
	}

	return undefined;
};

export const createToolResultSchema = ({ structuredContentSchema, widgetDataSchema }) => z.object({
	_meta: z.object({
		'openai/outputTemplate': widgetResourceUriSchema,
		widgetData: widgetDataSchema,
	}).strict(),
	content: z.array(toolTextContentSchema).max(8),
	structuredContent: structuredContentSchema,
}).strict().superRefine((result, context) => {
	const forbiddenPath = findForbiddenResultKey(result);
	if (forbiddenPath) {
		context.addIssue({
			code: 'custom',
			message: 'Tool result contains a prohibited security or authority field',
			path: forbiddenPath,
		});
	}
});
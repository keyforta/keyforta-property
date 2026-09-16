import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
	createToolResultSchema,
	hostToWidgetMessageSchema,
	toolDescriptionSchema,
	toolExecutionContextSchema,
	widgetResourceDescriptorSchema,
	widgetToHostMessageSchema,
} from '../src/mcp.js';

const healthResultSchema = createToolResultSchema({
	structuredContentSchema: z.object({ status: z.literal('healthy') }).strict(),
	widgetDataSchema: z.object({ checkedAt: z.string().datetime() }).strict(),
});

const validResult = {
	structuredContent: { status: 'healthy' },
	content: [{ type: 'text', text: 'KEYFORTA MCP is healthy.' }],
	_meta: {
		'openai/outputTemplate': 'ui://keyforta/system/health',
		widgetData: { checkedAt: '2026-09-15T00:00:00Z' },
	},
};

test('accepts an exact dual-layer synthetic tool result', () => {
	assert.deepEqual(healthResultSchema.parse(validResult), validResult);
});

test('rejects unknown result fields', () => {
	assert.equal(healthResultSchema.safeParse({ ...validResult, debug: true }).success, false);
});

test('rejects security and authority fields in every result channel', () => {
	const forbiddenKeys = [
		'accessToken',
		'authorization',
		'clientSecret',
		'connectionString',
		'cookie',
		'credential',
		'organizationId',
		'password',
		'refreshToken',
		'secret',
		'tenantId',
	];

	for (const forbiddenKey of forbiddenKeys) {
		const result = structuredClone(validResult);
		result._meta.widgetData.presentation = { [forbiddenKey]: 'prohibited' };
		assert.equal(healthResultSchema.safeParse(result).success, false, forbiddenKey);
	}
});

test('enforces App SDK widget resource descriptors', () => {
	const descriptor = {
		accessibility: {
			descriptionKey: 'health.description',
			titleKey: 'health.title',
		},
		contractVersion: 1,
		csp: { connectDomains: [], resourceDomains: [] },
		mimeType: 'text/html+skybridge',
		uri: 'ui://keyforta/system/health',
	};

	assert.equal(widgetResourceDescriptorSchema.safeParse(descriptor).success, true);
	assert.equal(widgetResourceDescriptorSchema.safeParse({
		...descriptor,
		uri: 'skill://system/health/ui',
	}).success, false);
});

test('keeps raw tokens outside execution context', () => {
	const context = {
		correlationId: 'correlation-1',
		grantedScopes: ['mcp.tools.read'],
		locale: 'fr-CD',
		principalReference: 'principal-1',
	};

	assert.equal(toolExecutionContextSchema.safeParse(context).success, true);
	assert.equal(toolExecutionContextSchema.safeParse({
		...context,
		accessToken: 'prohibited',
	}).success, false);
});

test('validates versioned widget bridge messages', () => {
	assert.equal(widgetToHostMessageSchema.safeParse({
		kind: 'widget.ready',
		protocolVersion: 1,
		resourceUri: 'ui://keyforta/system/health',
	}).success, true);
	assert.equal(hostToWidgetMessageSchema.safeParse({
		kind: 'host.theme',
		protocolVersion: 2,
		theme: 'dark',
	}).success, false);
});

test('keeps tool descriptions below 1024 UTF-8 bytes', () => {
	assert.equal(toolDescriptionSchema.safeParse('a'.repeat(1023)).success, true);
	assert.equal(toolDescriptionSchema.safeParse('a'.repeat(1024)).success, false);
	assert.equal(toolDescriptionSchema.safeParse('e'.repeat(1022) + 'é').success, false);
});
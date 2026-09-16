import { describe, expect, it, vi } from 'vitest';
import { createWidgetBridge, parseHostMessage, resolveLocale } from '../src/index.js';

describe('widget bridge', () => {
  const sourceWindow = {} as MessageEventSource;
  const validEvent = {
    data: { kind: 'host.locale', locale: 'fr-CA', protocolVersion: 1 },
    origin: 'https://chatgpt.com',
    source: sourceWindow,
  };

  it('accepts only exact source, origin, version, kind, and payload', () => {
    expect(parseHostMessage(validEvent, {
      allowedOrigin: 'https://chatgpt.com',
      sourceWindow,
    })).toEqual(validEvent.data);
    expect(parseHostMessage({ ...validEvent, origin: 'https://example.com' }, {
      allowedOrigin: 'https://chatgpt.com',
      sourceWindow,
    })).toBeUndefined();
    expect(parseHostMessage({ ...validEvent, source: {} as MessageEventSource }, {
      allowedOrigin: 'https://chatgpt.com',
      sourceWindow,
    })).toBeUndefined();
    expect(parseHostMessage({ ...validEvent, data: { ...validEvent.data, protocolVersion: 2 } }, {
      allowedOrigin: 'https://chatgpt.com',
      sourceWindow,
    })).toBeUndefined();
    expect(parseHostMessage({ ...validEvent, data: { ...validEvent.data, accessToken: 'no' } }, {
      allowedOrigin: 'https://chatgpt.com',
      sourceWindow,
    })).toBeUndefined();
  });

  it('posts a versioned ready message only to the configured origin', () => {
    const postMessage = vi.fn();
    const bridge = createWidgetBridge({
      allowedOrigin: 'https://chatgpt.com',
      hostWindow: { postMessage },
      resourceUri: 'ui://keyforta/system/health',
      sourceWindow,
    });
    bridge.ready();
    expect(postMessage).toHaveBeenCalledWith({
      kind: 'widget.ready',
      protocolVersion: 1,
      resourceUri: 'ui://keyforta/system/health',
    }, 'https://chatgpt.com');
  });
});

describe('locale resolution', () => {
  const tables = { en: 'English', fr: 'Francais' };

  it('uses exact, language, and deterministic fallback tables', () => {
    expect(resolveLocale('fr', tables)).toBe('Francais');
    expect(resolveLocale('fr-CA', tables)).toBe('Francais');
    expect(resolveLocale('de-DE', tables)).toBe('English');
  });
});
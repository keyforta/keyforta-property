import { describe, expect, it } from 'vitest';

import { authenticateLocalSyntheticRequest } from '../src/auth.js';
import {
  assertSyntheticLoopbackHost,
  localAllowedHosts,
  resolveRuntimeAuthenticator,
} from '../src/runtime-auth.js';

describe('runtime authentication selection', () => {
  it('uses only the synthetic authenticator outside production', () => {
    expect(resolveRuntimeAuthenticator({
      MCP_ENABLE_LOCAL_SYNTHETIC_AUTH: 'true',
      NODE_ENV: 'development',
    })).toBe(authenticateLocalSyntheticRequest);
  });

  it('fails closed without explicit local opt-in and in production', () => {
    expect(() => resolveRuntimeAuthenticator({ NODE_ENV: 'development' }))
      .toThrow('Local synthetic MCP authentication is not explicitly enabled');
    expect(() => resolveRuntimeAuthenticator({
      MCP_ENABLE_LOCAL_SYNTHETIC_AUTH: 'true',
      NODE_ENV: 'production',
    })).toThrow('Local synthetic MCP authentication is not explicitly enabled');
  });

  it('allows synthetic authentication only on loopback hosts', () => {
    expect(() => assertSyntheticLoopbackHost('127.0.0.1')).not.toThrow();
    expect(() => assertSyntheticLoopbackHost('0.0.0.0'))
      .toThrow('Local synthetic MCP authentication requires a loopback host');
  });

  it('allows HTTP Host forms for IPv4, hostname, and IPv6 loopback', () => {
    expect(localAllowedHosts(3200)).toEqual([
      '127.0.0.1:3200',
      'localhost:3200',
      '[::1]:3200',
    ]);
  });
});
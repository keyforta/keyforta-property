import {
  authenticateLocalSyntheticRequest,
  type RequestAuthenticator,
} from './auth.js';

export function resolveRuntimeAuthenticator(
  environment: NodeJS.ProcessEnv,
): RequestAuthenticator {
  if (
    environment.NODE_ENV === 'production' ||
    environment.MCP_ENABLE_LOCAL_SYNTHETIC_AUTH !== 'true'
  ) {
    throw new Error('Local synthetic MCP authentication is not explicitly enabled');
  }
  return authenticateLocalSyntheticRequest;
}

  export function assertSyntheticLoopbackHost(host: string): void {
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
      throw new Error('Local synthetic MCP authentication requires a loopback host');
    }
  }

  export function localAllowedHosts(port: number): readonly string[] {
    return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  }
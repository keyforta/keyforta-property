import type { FastifyRequest } from 'fastify';

export interface AuthenticatedPrincipal {
  readonly grantedScopes: readonly string[];
  readonly locale: string;
  readonly principalReference: string;
}

export type RequestAuthenticator = (
  request: FastifyRequest,
) => Promise<AuthenticatedPrincipal>;

export class AuthenticationError extends Error {
  constructor() {
    super('MCP request authentication failed');
    this.name = 'AuthenticationError';
  }
}

export const localSyntheticBearer = 'Bearer keyforta-local-synthetic';

export const authenticateLocalSyntheticRequest: RequestAuthenticator = async (request) => {
  if (request.headers.authorization !== localSyntheticBearer) {
    throw new AuthenticationError();
  }

  return {
    grantedScopes: ['mcp:health'],
    locale: 'en',
    principalReference: 'synthetic:local-development',
  };
};
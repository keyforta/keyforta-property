import { randomBytes } from "node:crypto";

import type { SupportedProtocolVersion } from "./protocol.js";

export interface SessionBinding {
  readonly originKey: string;
  readonly protocolVersion: SupportedProtocolVersion;
  readonly subjectReference: string;
}

export interface SessionMatch {
  readonly originKey: string;
  readonly protocolVersion?: SupportedProtocolVersion | undefined;
  readonly subjectReference: string;
}

export interface McpSession extends SessionBinding {
  readonly createdAt: number;
  readonly id: string;
  lastSeenAt: number;
}

export type SessionDenialReason =
  | "expired_session"
  | "mismatched_session_binding"
  | "unknown_session";

export type SessionLookup =
  | { ok: false; reason: SessionDenialReason }
  | { ok: true; session: McpSession };

export class SessionCapacityError extends Error {
  constructor() {
    super("The MCP session limit was reached.");
    this.name = "SessionCapacityError";
  }
}

export interface SessionStoreOptions {
  absoluteTtlMs?: number;
  idleTtlMs?: number;
  maxSessions?: number;
  now?: () => number;
}

export interface SessionStore {
  close: (sessionId: string, match: SessionMatch) => boolean;
  open: (binding: SessionBinding) => McpSession;
  size: () => number;
  touch: (sessionId: string, match: SessionMatch) => SessionLookup;
}

const defaultIdleTtlMs = 15 * 60 * 1000;
const defaultAbsoluteTtlMs = 8 * 60 * 60 * 1000;
const defaultMaxSessions = 64;

/**
 * Ephemeral, single-replica session store. Sessions are opaque, bound to the
 * authenticated subject, origin class, and negotiated protocol version, and
 * expire on idle and absolute limits.
 */
export function createSessionStore(
  options: SessionStoreOptions = {},
): SessionStore {
  const absoluteTtlMs = options.absoluteTtlMs ?? defaultAbsoluteTtlMs;
  const idleTtlMs = options.idleTtlMs ?? defaultIdleTtlMs;
  const maxSessions = options.maxSessions ?? defaultMaxSessions;
  const now = options.now ?? (() => Date.now());
  const sessions = new Map<string, McpSession>();

  const isExpired = (session: McpSession, currentTime: number): boolean =>
    currentTime - session.lastSeenAt >= idleTtlMs ||
    currentTime - session.createdAt >= absoluteTtlMs;

  const prune = (currentTime: number): void => {
    for (const [sessionId, session] of sessions) {
      if (isExpired(session, currentTime)) sessions.delete(sessionId);
    }
  };

  const matchesBinding = (session: McpSession, match: SessionMatch): boolean =>
    session.originKey === match.originKey &&
    (match.protocolVersion === undefined ||
      session.protocolVersion === match.protocolVersion) &&
    session.subjectReference === match.subjectReference;

  return {
    close(sessionId, match) {
      const currentTime = now();
      prune(currentTime);
      const session = sessions.get(sessionId);
      if (!session || !matchesBinding(session, match)) return false;
      sessions.delete(sessionId);
      return true;
    },
    open(binding) {
      const currentTime = now();
      prune(currentTime);
      if (sessions.size >= maxSessions) throw new SessionCapacityError();
      const session: McpSession = {
        ...binding,
        createdAt: currentTime,
        id: randomBytes(32).toString("base64url"),
        lastSeenAt: currentTime,
      };
      sessions.set(session.id, session);
      return session;
    },
    size() {
      prune(now());
      return sessions.size;
    },
    touch(sessionId, match) {
      const currentTime = now();
      const session = sessions.get(sessionId);
      if (!session) return { ok: false, reason: "unknown_session" };
      if (isExpired(session, currentTime)) {
        sessions.delete(sessionId);
        return { ok: false, reason: "expired_session" };
      }
      if (!matchesBinding(session, match)) {
        return { ok: false, reason: "mismatched_session_binding" };
      }
      session.lastSeenAt = currentTime;
      return { ok: true, session };
    },
  };
}

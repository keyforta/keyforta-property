import { afterEach, describe, expect, it, vi } from "vitest";
import { Client, type Pool } from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  assertRuntimeDatabaseReady,
  createDatabasePool,
  createRuntimeDatabaseClient,
} from "../src/database.js";

const migrationPath = fileURLToPath(
  new URL(
    "../../../infra/postgres/migrations/0028_rental_property_and_unit_commands.sql",
    import.meta.url,
  ),
);
const databaseSourcePath = fileURLToPath(new URL("../src/database.ts", import.meta.url));

function extractCreateRentalPropertyParameterTypes(): string[] {
  const migration = readFileSync(migrationPath, "utf8");
  const match = migration.match(
    /create function app\.create_rental_property\(([\s\S]*?)\)\s*returns/,
  );
  if (!match) {
    throw new Error(
      "Could not locate the app.create_rental_property declaration in migration 0028.",
    );
  }
  return (match[1] ?? "")
    .split(",")
    .map((parameter) => parameter.trim().split(/\s+/).pop())
    .filter((type): type is string => Boolean(type));
}

function extractFallbackSignatureParameterTypes(): string[] {
  const source = readFileSync(databaseSourcePath, "utf8");
  const match = source.match(
    /to_regprocedure\('app\.create_rental_property\(([^)]*)\)'\)/,
  );
  if (!match) {
    throw new Error(
      "Could not locate the create_rental_property readiness fallback in database.ts.",
    );
  }
  return (match[1] ?? "").split(",").filter(Boolean);
}

function extractFunctionBody(functionName: string): string {
  const migration = readFileSync(migrationPath, "utf8");
  const startMatch = migration.match(
    new RegExp(`create function app\\.${functionName}\\(`),
  );
  if (!startMatch || startMatch.index === undefined) {
    throw new Error(`Could not locate app.${functionName} in migration 0028.`);
  }
  const bodyStart = migration.indexOf("as $$", startMatch.index);
  const bodyEnd = migration.indexOf("$$;", bodyStart);
  if (bodyStart === -1 || bodyEnd === -1) {
    throw new Error(`Could not locate the $$ body for app.${functionName}.`);
  }
  return migration.slice(bodyStart, bodyEnd);
}

function firstRowLockedTable(body: string): "properties" | "units" | undefined {
  const propertiesIndex = body.search(/from\s+app\.properties[\s\S]{0,220}?for update/i);
  const unitsIndex = body.search(/from\s+app\.units[\s\S]{0,220}?for update/i);
  if (propertiesIndex === -1 && unitsIndex === -1) return undefined;
  if (propertiesIndex === -1) return "units";
  if (unitsIndex === -1) return "properties";
  return propertiesIndex < unitsIndex ? "properties" : "units";
}

describe("assertRuntimeDatabaseReady", () => {
  it("accepts only the current runtime schema marker", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ready: true }] });

    await expect(assertRuntimeDatabaseReady({ query })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(
      "select app.runtime_schema_v0028_ready() as ready",
    );
  });

  it("rejects a missing runtime schema marker", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(assertRuntimeDatabaseReady({ query })).rejects.toThrow(
      "The runtime database schema is not ready.",
    );
  });

  it("falls back to a matching create_rental_property signature when the readiness marker is unavailable", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ ready: false }] })
      .mockResolvedValueOnce({ rows: [{ ready: true }] });

    await expect(assertRuntimeDatabaseReady({ query })).resolves.toBeUndefined();
  });

  it("falls back when the readiness marker function does not exist yet", async () => {
    // Regression test: on a partially upgraded database,
    // app.runtime_schema_v0028_ready() itself may not exist yet, which
    // PostgreSQL surfaces as an undefined_function error rather than a
    // normal result row. Previously this error would propagate straight out
    // of assertRuntimeDatabaseReady, so the fallback check below was
    // unreachable and a rolling upgrade would fail startup even though the
    // command function already existed.
    const query = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('function app.runtime_schema_v0028_ready() does not exist'), {
          code: "42883",
        }),
      )
      .mockResolvedValueOnce({ rows: [{ ready: true }] });

    await expect(assertRuntimeDatabaseReady({ query })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("keeps the readiness fallback signature in sync with app.create_rental_property", () => {
    // Regression test: the fallback string previously dropped the trailing
    // `requested_source text` parameter, so during a rolling/partially
    // upgraded deployment (where runtime_schema_v0028_ready() is not yet
    // available) the fallback would report the schema as not ready even
    // though app.create_rental_property already existed, blocking API
    // startup. This asserts the fallback's parameter list always matches
    // the migration's declared signature exactly.
    expect(extractFallbackSignatureParameterTypes()).toEqual(
      extractCreateRentalPropertyParameterTypes(),
    );
  });
});

describe("migration 0028 archive lock ordering", () => {
  it("locks app.properties before app.units in both archive_rental_unit and archive_rental_property", () => {
    // Regression test: archive_rental_unit previously locked its Unit row
    // before locking the parent Property, while archive_rental_property has
    // always locked the Property before its Units. Two sessions taking
    // opposite lock orders on the same two resources is a textbook
    // PostgreSQL deadlock. This was independently verified with a direct
    // two-session reproduction using the same lock statements: with the old
    // (Unit-then-Property vs Property-then-Unit) order, PostgreSQL reliably
    // raised a 40P01 deadlock error on one of the two concurrent sessions;
    // with both sides locking Property-then-Unit, the two sessions only
    // ever serialize and never deadlock. Asserting the lock order here
    // (rather than only the end-to-end integration test, whose deadlock
    // window depends on incidental timing) gives a deterministic guard
    // against this ever regressing.
    expect(firstRowLockedTable(extractFunctionBody("archive_rental_unit"))).toBe(
      "properties",
    );
    expect(firstRowLockedTable(extractFunctionBody("archive_rental_property"))).toBe(
      "properties",
    );
  });
});

describe("createDatabasePool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an empty PostgreSQL access token", async () => {
    const pool = createDatabasePool(
      {
        DATABASE_AUTH: "entra",
        DATABASE_URL: "postgresql://migration@example.test:5432/keyforta",
      },
      {
        getToken: vi.fn().mockResolvedValue({
          expiresOnTimestamp: Date.now() + 60_000,
          token: "",
        }),
      },
    );
    const password = pool.options.password;

    expect(password).toBeTypeOf("function");
    await expect((password as () => Promise<string>)()).rejects.toThrow(
      "Unable to acquire a PostgreSQL access token.",
    );

    await pool.end();
  });

  it("uses an Azure PostgreSQL access token as the database password", async () => {
    const getToken = vi.fn().mockResolvedValue({
      expiresOnTimestamp: Date.now() + 60_000,
      token: "synthetic-access-token",
    });
    const pool = createDatabasePool(
      {
        DATABASE_AUTH: "entra",
        DATABASE_URL: "postgresql://migration@example.test:5432/keyforta",
      },
      { getToken },
    );
    const password = pool.options.password;
    const client = new Client(pool.options);

    await expect((password as () => Promise<string>)()).resolves.toBe(
      "synthetic-access-token",
    );
    expect(
      (client as unknown as { password: unknown }).password,
    ).toBeTypeOf("function");
    expect(getToken).toHaveBeenCalledWith(
      "https://ossrdbms-aad.database.windows.net/.default",
    );

    await pool.end();
  });
});

describe("createRuntimeDatabaseClient", () => {
  it("runs a callback in one runtime-role transaction", async () => {
    const statements: string[] = [];
    const connection = {
      query: vi.fn(async (text: string) => {
        statements.push(text);
        return { rows: text === "select protected_operation()" ? [{ ok: true }] : [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => connection),
    } as unknown as Pool;
    const client = createRuntimeDatabaseClient(pool);

    await expect(client.transaction(async (session) => {
      const result = await session.query("select protected_operation()");
      return result.rows[0];
    })).resolves.toEqual({ ok: true });

    expect(statements).toEqual([
      "begin",
      "set local role keyforta_runtime",
      "select protected_operation()",
      "commit",
    ]);
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases the connection when a callback fails", async () => {
    const statements: string[] = [];
    const connection = {
      query: vi.fn(async (text: string) => {
        statements.push(text);
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => connection),
    } as unknown as Pool;
    const client = createRuntimeDatabaseClient(pool);

    await expect(client.transaction(async () => {
      throw new Error("synthetic command failure");
    })).rejects.toThrow("synthetic command failure");

    expect(statements).toEqual([
      "begin",
      "set local role keyforta_runtime",
      "rollback",
    ]);
    expect(connection.release).toHaveBeenCalledOnce();
  });
});
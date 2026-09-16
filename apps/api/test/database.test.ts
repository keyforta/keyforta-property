import { afterEach, describe, expect, it, vi } from "vitest";

import { createDatabasePool } from "../src/database.js";

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

    await expect((password as () => Promise<string>)()).resolves.toBe(
      "synthetic-access-token",
    );
    expect(getToken).toHaveBeenCalledWith(
      "https://ossrdbms-aad.database.windows.net/.default",
    );

    await pool.end();
  });
});
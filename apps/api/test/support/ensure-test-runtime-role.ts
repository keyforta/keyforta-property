import type { PoolClient } from "pg";

/**
 * Several integration test files each spin up their own per-file database
 * but must all bootstrap the same cluster-wide `keyforta_test_runtime`
 * login role. Because PostgreSQL advisory locks are scoped to the session's
 * connected database (not the cluster), they cannot serialize this
 * cross-database race, so concurrently running files intermittently fail
 * with the generic "tuple concurrently updated" error (SQLSTATE XX000)
 * while creating/altering that shared role. That failure is a transient
 * catalog-contention artifact, not a real error, so retrying is the
 * standard, safe recovery for this exact PostgreSQL error.
 */
export async function ensureTestRuntimeRole(client: PoolClient): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.query(`
        do $$
        begin
          if not exists (select 1 from pg_roles where rolname = 'keyforta_test_runtime') then
            create role keyforta_test_runtime login password 'synthetic-test-runtime-password'
              nosuperuser nocreatedb nocreaterole noinherit;
          end if;
        end
        $$;
        alter role keyforta_test_runtime login password 'synthetic-test-runtime-password' noinherit;
        grant keyforta_runtime to keyforta_test_runtime;
      `);
      return;
    } catch (error) {
      const isTransientCatalogContention =
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string" &&
        (error as { message: string }).message.includes("tuple concurrently updated");
      if (!isTransientCatalogContention || attempt === maxAttempts) throw error;
      await new Promise((resolvePause) => setTimeout(resolvePause, 25 * attempt));
    }
  }
}

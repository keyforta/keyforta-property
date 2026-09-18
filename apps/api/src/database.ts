import {
  DefaultAzureCredential,
  ManagedIdentityCredential,
  type TokenCredential,
} from "@azure/identity";
import { Pool, type PoolConfig } from "pg";
import { parseIntoClientConfig } from "pg-connection-string";

const postgresTokenScope =
  "https://ossrdbms-aad.database.windows.net/.default";

export interface DatabaseConfiguration {
  AZURE_CLIENT_ID?: string;
  DATABASE_AUTH?: string;
  DATABASE_URL?: string;
}

export interface DatabaseSession {
  query(
    text: string,
    parameters?: readonly unknown[],
  ): Promise<{ rows: readonly unknown[] }>;
}

export interface DatabaseClient extends DatabaseSession {
  transaction<T>(operation: (session: DatabaseSession) => Promise<T>): Promise<T>;
}

export async function assertRuntimeDatabaseReady(
  database: DatabaseSession,
): Promise<void> {
  const result = await database.query(
    "select app.runtime_schema_v0021_ready() as ready",
  );
  if ((result.rows[0] as { ready?: unknown } | undefined)?.ready !== true) {
    throw new Error("The runtime database schema is not ready.");
  }
}

export function createDatabasePool(
  configuration: DatabaseConfiguration = process.env,
  credential?: TokenCredential,
): Pool {
  if (!configuration.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL persistence.");
  }

  const connectionConfiguration =
    configuration.DATABASE_AUTH === "entra"
      ? parseIntoClientConfig(configuration.DATABASE_URL)
      : { connectionString: configuration.DATABASE_URL };
  const poolConfiguration: PoolConfig = {
    ...connectionConfiguration,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  };

  if (configuration.DATABASE_AUTH === "entra") {
    const tokenCredential =
      credential ??
      (configuration.AZURE_CLIENT_ID
        ? new ManagedIdentityCredential(configuration.AZURE_CLIENT_ID)
        : new DefaultAzureCredential());
    poolConfiguration.password = async () => {
      const accessToken = await tokenCredential.getToken(postgresTokenScope);
      if (!accessToken?.token.trim()) {
        throw new Error("Unable to acquire a PostgreSQL access token.");
      }
      return accessToken.token;
    };
  }

  return new Pool(poolConfiguration);
}

export function createRuntimeDatabaseClient(pool: Pool): DatabaseClient {
  return {
    async query(text, parameters = []) {
      return this.transaction((session) => session.query(text, parameters));
    },
    async transaction(operation) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("set local role keyforta_runtime");
        const result = await operation({
          async query(text, parameters = []) {
            return client.query(text, [...parameters]);
          },
        });
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
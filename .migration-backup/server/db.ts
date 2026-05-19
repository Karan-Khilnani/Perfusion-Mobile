import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

function getPoolConfig(): pg.PoolConfig {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }
  
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGUSER && PGDATABASE) {
    return {
      host: PGHOST,
      port: Number(PGPORT ?? 5432),
      user: PGUSER,
      password: PGPASSWORD,
      database: PGDATABASE,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }
  
  throw new Error(
    "DATABASE_URL or PG* environment variables must be set. Did you forget to provision a database?",
  );
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    try {
      const config = getPoolConfig();
      pool = new Pool(config);
      
      pool.on("error", (err) => {
        console.error("Unexpected database pool error:", err);
      });
    } catch (error) {
      console.error("Failed to create database pool:", error);
      throw error;
    }
  }
  return pool;
}

export const db = drizzle(getPool(), { schema });

export async function testConnection(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    await client.query("SELECT 1");
    client.release();
    console.log("Database connection successful");
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGUSER && PGDATABASE) {
    const port = PGPORT || "5432";
    const password = PGPASSWORD ? `:${PGPASSWORD}` : "";
    return `postgresql://${PGUSER}${password}@${PGHOST}:${port}/${PGDATABASE}`;
  }
  
  throw new Error(
    "DATABASE_URL or PG* environment variables must be set. Did you forget to provision a database?",
  );
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    try {
      const connectionString = getDatabaseUrl();
      pool = new Pool({ 
        connectionString,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
      
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

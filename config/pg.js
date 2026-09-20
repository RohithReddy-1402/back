import pg from "pg";

// Postgres backs the forum only; everything else stays in MongoDB.
// Neon (and most hosted Postgres) require TLS; local Docker doesn't.
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || "");

// COUNT(*) and other int8 results arrive as strings by default; forum counts
// always fit in a JS number.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: true },
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 5_000,
});

pool.on("error", (err) => console.error("Postgres pool error:", err.message));

export const query = (text, params) => pool.query(text, params);

/** Runs `fn(client)` inside BEGIN/COMMIT, rolling back if it throws. */
export const withTx = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

export default pool;

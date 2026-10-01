import { RateLimiterPostgres, type RateLimiterRes } from "rate-limiter-flexible";
import { getDb } from "./db.js";

type Options = Omit<ConstructorParameters<typeof RateLimiterPostgres>[0], "storeClient" | "storeType" | "tableCreated">;

export interface PostgresLimiter {
  consume(key: string, points?: number): Promise<RateLimiterRes>;
  delete(key: string): Promise<boolean>;
}

// A Postgres-backed rate limiter, shared by every PM2 worker. RateLimiterPostgres creates its table
// asynchronously from its constructor and rejects any consume() that arrives before that's done
// with "Table is not created yet" — which the first requests after every process start (or dev
// reload) could, refusing a sign-in or form submission for no reason. So it's only created on first
// use, and every call waits for its table. A failed creation (e.g. Postgres not reachable yet) is
// retried on the next call rather than leaving the limiter broken until a restart.
export function postgresLimiter(options: Options): PostgresLimiter {
  let ready: Promise<RateLimiterPostgres> | undefined;
  const instance = () => {
    ready ??= new Promise<RateLimiterPostgres>((resolve, reject) => {
      const created = new RateLimiterPostgres(
        { ...options, storeClient: getDb().$client, storeType: "pool" },
        (err?: unknown) => (err ? reject(err) : resolve(created)),
      );
    }).catch((err: unknown) => {
      ready = undefined;
      throw err;
    });
    return ready;
  };
  return {
    consume: async (key, points) => (await instance()).consume(key, points),
    delete: async (key) => (await instance()).delete(key),
  };
}

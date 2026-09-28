import { createHash } from "node:crypto";
import { RateLimiterPostgres, RateLimiterRes } from "rate-limiter-flexible";
import { getDb } from "../db/db.js";
import { verify } from "../password/index.js";

// Sign-in throttling. Backed by Postgres (like the form limiter in purplepanda/forms/[id]/submit.ts)
// so every PM2 worker shares one count. Three limits, each counting attempts within its window:
//   - account + address: the tight one — a typo-prone human never gets near it, a guesser does.
//   - address: one client spraying many accounts.
//   - account: many clients (or a spoofed X-Forwarded-For, which the address limits trust) guessing
//     one account's password. Looser, since hitting it locks the real owner out too.
// A successful sign-in clears the account+address and account counts, so earlier typos don't
// linger.
const WINDOW_SECONDS = 15 * 60;

function limiter(keyPrefix: string, points: number, duration: number) {
  return new RateLimiterPostgres({
    storeClient: getDb().$client,
    storeType: "pool",
    tableName: "purplepanda_login_limits",
    keyPrefix,
    points,
    duration,
    blockDuration: duration,
  });
}

const perAccountAddress = limiter("login_account_address", 10, WINDOW_SECONDS);
const perAddress = limiter("login_address", 100, WINDOW_SECONDS);
const perAccount = limiter("login_account", 50, 60 * 60);

// Emails aren't case-normalized in storage, but one person typing different cases is still one
// target, so the counters are. Hashed because the limiter's key column is varchar(255) and a
// username may be up to 255 characters before the address is appended.
const accountKey = (username: string) => createHash("sha256").update(username.toLowerCase()).digest("base64url");

// Records a sign-in attempt against every limit. Resolves false when any of them is exhausted, in
// which case the attempt must be refused without checking the password at all.
export async function recordLoginAttempt(username: string, address: string): Promise<boolean> {
  const account = accountKey(username);
  const results = await Promise.allSettled([
    perAccountAddress.consume(`${account}|${address}`),
    perAddress.consume(address),
    perAccount.consume(account),
  ]);
  for (const result of results) {
    if (result.status === "fulfilled") continue;
    // A limit being hit rejects with a RateLimiterRes; anything else is a store failure.
    if (result.reason instanceof RateLimiterRes) return false;
    throw result.reason;
  }
  return true;
}

export async function clearLoginAttempts(username: string, address: string): Promise<void> {
  const account = accountKey(username);
  await Promise.all([perAccountAddress.delete(`${account}|${address}`), perAccount.delete(account)]);
}

// Each verify() runs scrypt with 128MB of working memory on a libuv threadpool thread, so a burst of
// sign-in POSTs — even ones the limits above let through, from many addresses — could exhaust
// memory and starve every other threadpool user (fs, dns, other crypto). Caps how many run at once
// in this process and how many may wait; past that the attempt is refused as busy.
const MAX_CONCURRENT_VERIFIES = 2;
const MAX_QUEUED_VERIFIES = 16;
let activeVerifies = 0;
const verifyQueue: (() => void)[] = [];

// Resolves undefined, without verifying, when too many verifications are already queued.
export async function verifyPasswordThrottled(password: string, hash: string): Promise<boolean | undefined> {
  if (activeVerifies >= MAX_CONCURRENT_VERIFIES) {
    if (verifyQueue.length >= MAX_QUEUED_VERIFIES) return undefined;
    await new Promise<void>((resolve) => verifyQueue.push(resolve));
  } else {
    activeVerifies++;
  }
  try {
    return await verify(password, hash);
  } finally {
    // Hands the slot straight to the next waiter (activeVerifies stays the same) or frees it.
    const next = verifyQueue.shift();
    if (next) next();
    else activeVerifies--;
  }
}

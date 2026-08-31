import crypto from "node:crypto";
import type { APIContext } from "astro";
import { eq } from 'drizzle-orm';
import { addAction } from '../../actions/index.js';
import { getDb } from "../../db/db.js";
import {users} from "../../db/schema.js";
import { emit } from "../../hooks/index.js";
import { hash, verify } from '../../password/index.js';

// A hash() of a random, unguessable password, computed once per process and reused —
// used only as verify()'s target when no user was found, so a nonexistent email still
// pays the same scrypt cost as a real one with a wrong password (otherwise the response
// time itself would reveal which emails have accounts). Its exact value never matters:
// the caller always requires `!user` to reject too, so nothing depends on how verify()
// against it turns out.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = hash(crypto.randomBytes(32).toString("hex"));
  return dummyHash;
}

export async function POST(context: APIContext): Promise<Response> {
  const db = getDb();
  const formData = await context.request.formData();
  const password = formData.get("password");
  const username = formData.get("username");

  if (!username || typeof username !== "string" || !password || typeof password !== "string") {
    return context.redirect("/admin/login?error=invalid");
  }

  const [user] = await db.select().from(users).where(eq(users.email, username)).limit(1);

  // Always run verify(), even for an unknown user, so a nonexistent email costs the same
  // scrypt time as a wrong password for a real one — otherwise the response-time gap
  // between the two leaks which emails have accounts.
  const isValid = await verify(password, user?.password ?? await getDummyHash());
  if (!user || !isValid) {
    await emit("auth:loginFailed", { username });
    return context.redirect("/admin/login?error=invalid");
  }

  context.session?.set("userId", user.id);
  await addAction(
    "auth:login",
    { method: "password" },
    user.id,
    {
      message: "Logged in via {method}",
    },
  );
  return context.redirect("/admin");
}

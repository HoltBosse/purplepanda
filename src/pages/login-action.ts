import crypto, { randomUUID } from "node:crypto";
import type { APIContext } from "astro";
import { eq } from 'drizzle-orm';
import * as z from "zod";
import { addAction } from '../audit/index.js';
import { loginDestination, parseLoginTarget } from "../auth/login-target.js";
import { getDb } from "../db/db.js";
import {users} from "../db/schema.js";
import { emit } from "../hooks/index.js";
import { hash, verify } from '../password/index.js';

// A hash() of a random, unguessable password, computed once per process and reused —
// used only as verify()'s target when no user was found, so a nonexistent email still
// pays the same scrypt cost as a real one with a wrong password (otherwise the response
// time itself would reveal which emails have accounts). Its exact value never matters:
// the caller always requires `!user` to reject too, so nothing depends on how verify()
// against it turns out.
// Bounded so an oversized field can't make scrypt (or the lookup) chew on megabytes of input.
// `username` is the account's email; its format isn't enforced here since it only has to match one.
const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(1024),
});

let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = hash(crypto.randomBytes(32).toString("hex"));
  return dummyHash;
}

// The universal sign-in (see login.astro), root site only. Any live account from any site can sign
// in here: this session only proves who someone is, on the root domain. What they may then open is
// decided per site — the dashboard lists only the sites they can administer, and each site checks
// again when redeeming the handoff (admin/sso.ts).
export async function POST(context: APIContext): Promise<Response> {
  if (!context.locals.tenant.isRoot) {
    return context.rewrite("/404");
  }

  const db = getDb();
  const formData = await context.request.formData();
  const credentials = credentialsSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  const target = parseLoginTarget(formData);
  const failed = () => {
    const params = new URLSearchParams({ error: "invalid", ...target });
    return context.redirect(`/login?${params}`);
  };

  if (!credentials.success) {
    return failed();
  }
  const { username, password } = credentials.data;

  const [user] = await db.select().from(users).where(eq(users.email, username)).limit(1);

  // Always run verify(), even for an unknown user, so a nonexistent email costs the same
  // scrypt time as a wrong password for a real one — otherwise the response-time gap
  // between the two leaks which emails have accounts.
  const isValid = await verify(password, user?.password ?? await getDummyHash());
  if (!user || !isValid || user.state < 1) {
    await emit("auth:loginFailed", { username, tenantId: context.locals.tenant.id });
    return failed();
  }

  // A fresh session id on every sign-in, so an id planted in the browser beforehand (e.g. a cookie
  // set from a sibling tenant subdomain) can't become a signed-in session.
  await context.session?.regenerate();
  context.session?.set("userId", user.id);
  // Binds the session to this tenant — see getSessionUser() in auth/index.ts.
  context.session?.set("tenantId", context.locals.tenant.id);
  // Identifies this sign-in: every site this browser is then handed over to joins it, and signing
  // out ends it everywhere at once (see signOut() in auth/index.ts).
  context.session?.set("loginId", randomUUID());
  await addAction(
    "auth:login",
    { method: "password" },
    user.id,
    {
      message: "Logged in via {method}",
    },
  );
  return context.redirect(loginDestination(target));
}

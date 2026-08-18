import type { APIContext } from "astro";
import { eq } from 'drizzle-orm';
import { addAction } from '../../actions/index.js';
import { getDb } from "../../db/db.js";
import {users} from "../../db/schema.js";
import { emit } from "../../hooks/index.js";
import { verify } from '../../password/index.js';

export async function POST(context: APIContext): Promise<Response> {
  const db = getDb();
  const formData = await context.request.formData();
  const password = formData.get("password");
  const username = formData.get("username");

  if (!username || typeof username !== "string" || !password || typeof password !== "string") {
    return context.redirect("/admin/login?error=invalid");
  }

  const [user] = await db.select().from(users).where(eq(users.email, username)).limit(1);

  if (!user) {
    await emit("auth:loginFailed", { username });
    return context.redirect("/admin/login?error=invalid");
  }

  const isValid = await verify(password, user.password);
  if (!isValid) {
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

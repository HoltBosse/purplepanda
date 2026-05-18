import type { APIContext } from "astro";
import { getDb } from "../../db/db.js";
import {users} from "../../db/schema.js";
import { eq } from 'drizzle-orm';
import { hash, verify } from '../../password/index.js';

const ADMIN_PASSWORD = "password";

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
    return context.redirect("/admin/login?error=invalid");
  }

  const isValid = await verify(password, user.password);
  if (!isValid) {
    return context.redirect("/admin/login?error=invalid");
  }

  await context.session?.set("userId", user.id);
  return context.redirect("/admin");
}

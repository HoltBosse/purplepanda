import type { APIContext } from "astro";

const ADMIN_PASSWORD = "password";

export async function POST(context: APIContext): Promise<Response> {
  const formData = await context.request.formData();
  const password = formData.get("password");

  if (typeof password !== "string" || password !== ADMIN_PASSWORD) {
    return context.redirect("/admin/login?error=invalid");
  }

  await context.session?.set("userId", 1);
  return context.redirect("/admin");
}

import type { APIContext } from "astro";
import { createTransport } from "nodemailer";
import { isAdminSession } from "../../../../auth/index.js";

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}

export async function POST(context: APIContext): Promise<Response> {
    if (!(await isAdminSession(context.session))) {
        return json({ success: false, message: "Forbidden." }, 403);
    }

    const body = await context.request.json().catch(() => null) as { host?: string; email?: string; password?: string } | null;
    const host = body?.host?.trim();
    const email = body?.email?.trim();
    const password = body?.password;

    if (!host || !email || !password) {
        return json({ success: false, message: "Host, email, and password are required." }, 400);
    }

    const transporter = createTransport({
        host,
        port: 587,
        secure: false,
        auth: { user: email, pass: password },
    });

    try {
        await transporter.verify();
        return json({ success: true, message: "Connection successful." });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to connect.";
        return json({ success: false, message });
    }
}

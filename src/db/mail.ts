import { inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { settings } from "./schema.js";

export interface EmailSettings {
  host: string;
  address: string;
  password: string;
}

export async function resolveEmailSettings(
  db: NodePgDatabase<Record<string, unknown>>,
): Promise<EmailSettings | undefined> {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, ["email_host", "email_address", "email_password"]));

  const host = rows.find((row) => row.key === "email_host")?.value as string | undefined;
  const address = rows.find((row) => row.key === "email_address")?.value as string | undefined;
  const password = rows.find((row) => row.key === "email_password")?.value as string | undefined;

  return host && address && password ? { host, address, password } : undefined;
}

export interface SendMailOptions {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string | undefined;
}

// Silently no-ops when SMTP hasn't been configured in Settings — notification email is a
// best-effort side effect of form submission, not something that should block or fail a
// visitor's submission just because the site hasn't set up outbound mail yet.
export async function sendMail(db: NodePgDatabase<Record<string, unknown>>, options: SendMailOptions): Promise<void> {
  if (options.to.length === 0) return;

  const emailSettings = await resolveEmailSettings(db);
  if (!emailSettings) return;

  const { createTransport } = await import("nodemailer");
  const transporter = createTransport({
    host: emailSettings.host,
    port: 587,
    secure: false,
    auth: { user: emailSettings.address, pass: emailSettings.password },
  });

  await transporter.sendMail({
    from: emailSettings.address,
    to: options.to,
    subject: options.subject,
    text: options.text,
    replyTo: options.replyTo,
  });
}

import { getDb } from "../db/db.js";
import { type SendMailOptions, sendMail } from "../db/mail.js";
import { requireTenant, runWithTenant } from "../tenant/context.js";
import { getRootDomain, getRootTenant, urlOnDomain } from "../tenant/index.js";
import type { LoginTarget } from "./login-target.js";
import { createPasswordResetToken, INVITE_TOKEN_TTL_MS, RESET_TOKEN_TTL_MS } from "./password-reset.js";

// Email about an account itself: a link to reset (or, for someone invited, first set) its password,
// and word that it's been added to a site. Each resolves whether an email actually went out, so an
// admin can be told when it didn't.

interface Recipient {
  id: string;
  email: string;
  fname: string;
}

// Sent with the current site's mail settings, or the root site's when it hasn't configured its
// own — account email is the install's, not only the site's, so it shouldn't just vanish.
async function sendAccountMail(options: SendMailOptions): Promise<boolean> {
  const db = getDb();
  if (await sendMail(db, options)) return true;
  const root = await getRootTenant(db);
  if (!root || root.id === requireTenant().id) return false;
  return runWithTenant(root, () => sendMail(getDb(), options));
}

// A link to /reset-password on the root site. Built on its registered hostname, never from the
// request's Host, so a forged Host header can't make an email point somewhere else. `welcome` only
// changes the page's wording, for an account setting its first password.
async function passwordLink(current: URL, token: string, target: LoginTarget, welcome: boolean): Promise<string | null> {
  const rootDomain = await getRootDomain(getDb());
  if (!rootDomain) return null;
  const params = new URLSearchParams({ token, ...(welcome ? { welcome: "1" } : {}), ...target });
  return urlOnDomain(current, rootDomain, `/reset-password?${params}`);
}

// A reset link, whether the account's owner asked for one (/forgot-password) or a site's admin sent
// it. Sending one changes nothing about the account: it stays signed in, with its password, until
// the link is used.
export async function sendPasswordResetEmail(current: URL, user: Recipient, siteName: string, target: LoginTarget): Promise<boolean> {
  const token = await createPasswordResetToken(user.id, RESET_TOKEN_TTL_MS);
  const link = await passwordLink(current, token, target, false);
  if (!link) return false;
  return sendAccountMail({
    to: [user.email],
    subject: `Reset your ${siteName} password`,
    text: [
      `Hi ${user.fname},`,
      "",
      `Someone asked to reset the password for your ${siteName} account. To choose a new one, open this link within the next hour:`,
      "",
      link,
      "",
      "If you didn't ask for this, you can ignore this email: your password won't change.",
    ].join("\n"),
  });
}

// For an account just created by inviting it to a site: it has no usable password until its owner
// sets one from this link.
export async function sendInviteEmail(current: URL, user: Recipient, siteName: string, target: LoginTarget): Promise<boolean> {
  const token = await createPasswordResetToken(user.id, INVITE_TOKEN_TTL_MS);
  const link = await passwordLink(current, token, target, true);
  if (!link) return false;
  return sendAccountMail({
    to: [user.email],
    subject: `You've been invited to ${siteName}`,
    text: [
      `Hi ${user.fname},`,
      "",
      `You've been invited to help manage ${siteName}. To set up your account, choose a password by opening this link within the next 7 days:`,
      "",
      link,
      "",
      "If you weren't expecting this, you can ignore this email.",
    ].join("\n"),
  });
}

// For an account that already existed, added to another site: it signs in as it always has.
export async function sendAddedToSiteEmail(user: Recipient, siteName: string, adminUrl: string): Promise<boolean> {
  return sendAccountMail({
    to: [user.email],
    subject: `You've been added to ${siteName}`,
    text: [
      `Hi ${user.fname},`,
      "",
      `Your account has been added to ${siteName}. Sign in with your existing email and password here:`,
      "",
      adminUrl,
    ].join("\n"),
  });
}

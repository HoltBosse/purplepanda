import type { AstroCookies } from "astro";
import * as z from "zod";

// The viewer's IANA timezone (e.g. "America/New_York"), which TimeZoneScript.astro writes to this
// cookie from the browser on every admin page load. The server stores and compares everything in
// UTC, but a date a user types (e.g. a `created:2024-01-01` search) means *their* calendar day, so
// it needs their timezone to turn into the right UTC range. A cookie rather than a form field so
// it rides along on every request — pagination links, the CSV export, bookmarked searches — not
// just the one form that set it.
export const TIME_ZONE_COOKIE = "tz";

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// The cookie is client-controlled, so it has to name a zone Intl actually knows. Postgres keeps its
// own copy of the IANA database, so a zone newer than the server's tzdata could still pass here and
// fail there. The length cap keeps junk from ever reaching the Intl constructor.
//
// Names only, never bare offsets: Intl accepts "+05:30" as five and a half hours *east* of UTC, but
// Postgres reads an offset given as a zone name with the POSIX sign convention — *west* — so the
// two would disagree by twice the offset. Browsers always report a name (resolvedOptions), so this
// only turns away hand-edited cookies. ("Etc/GMT+5" is fine: both sides read that one as POSIX.)
const IANA_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(IANA_NAME, "Expected an IANA timezone name")
  .refine(isValidTimeZone, "Unknown timezone");

/** The request's timezone from the cookie, or "UTC" when it's missing or not a real IANA zone. */
export function requestTimeZone(cookies: AstroCookies): string {
  const result = timeZoneSchema.safeParse(cookies.get(TIME_ZONE_COOKIE)?.value);
  return result.success ? result.data : "UTC";
}

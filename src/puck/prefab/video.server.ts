import { getPublicComponentSettings } from "../component-settings.server.js";
import { type VideoConsentOptions, videoSiteSettings } from "./video-settings.js";

// The consent notice's options for the current site, or undefined when the site doesn't ask.
export async function getVideoConsentOptions(): Promise<VideoConsentOptions | undefined> {
  const settings = await getPublicComponentSettings("Video", videoSiteSettings);
  if (!settings.consent) return undefined;
  return { message: settings.consentMessage, button: settings.consentButton, remember: settings.rememberConsent };
}

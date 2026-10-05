import { parseCloudflareSource } from "@videojs/media/dom/cloudflare";
import { parseSpotifySource } from "@videojs/media/dom/spotify";
import { parseTikTokSource } from "@videojs/media/dom/tiktok";
import { parseTwitchSource } from "@videojs/media/dom/twitch";
import { parseVimeoSource } from "@videojs/media/dom/vimeo";
import { parseYouTubeSource } from "@videojs/media/dom/youtube";

// Kept out of VideoPlayer.tsx so Video.tsx can tell which service a URL belongs to (for the consent
// notice) without loading the player chunk. Only the URL parsers are imported; @videojs/media is
// side-effect free, so the players themselves are tree-shaken out of this module.

export type EmbedProvider = "youtube" | "vimeo" | "cloudflare" | "tiktok" | "twitch" | "spotify";

// Ordered by how likely a pasted URL is to be one of these — doesn't affect correctness, since
// each provider's matcher is specific to its own domain(s).
export function detectEmbedProvider(src: string): EmbedProvider | null {
  if (parseYouTubeSource(src)) return "youtube";
  if (parseVimeoSource(src)) return "vimeo";
  if (parseCloudflareSource(src)) return "cloudflare";
  if (parseTikTokSource(src)) return "tiktok";
  if (parseTwitchSource(src)) return "twitch";
  if (parseSpotifySource(src)) return "spotify";
  return null;
}

export const EMBED_PROVIDERS: Record<EmbedProvider, { name: string; privacyUrl: string }> = {
  youtube: { name: "YouTube", privacyUrl: "https://policies.google.com/privacy" },
  vimeo: { name: "Vimeo", privacyUrl: "https://vimeo.com/privacy" },
  cloudflare: { name: "Cloudflare Stream", privacyUrl: "https://www.cloudflare.com/privacypolicy/" },
  tiktok: { name: "TikTok", privacyUrl: "https://www.tiktok.com/legal/privacy-policy" },
  twitch: { name: "Twitch", privacyUrl: "https://www.twitch.tv/p/legal/privacy-notice/" },
  spotify: { name: "Spotify", privacyUrl: "https://www.spotify.com/legal/privacy-policy/" },
};

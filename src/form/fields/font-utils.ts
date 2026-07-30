export const BUNNY_FONT_LIST_URL = 'https://fonts.bunny.net/list';

export interface BunnyFont {
  familyName: string;
  category: string;
  weights: number[];
  styles: string[];
}

export function pickDefaultWeights(weights: number[]): number[] {
  const preferred = [400, 700].filter((w) => weights.includes(w));
  if (preferred.length > 0) return preferred;
  return weights.length > 0 ? [weights[0]!] : [400];
}

export function buildFontLink(familyName: string, weights: number[]): string {
  const url = new URL('https://fonts.bunny.net/css2');
  url.searchParams.set('family', `${familyName}:wght@${weights.join(';')}`);
  url.searchParams.set('display', 'swap');
  return url.toString();
}

export function extractFamilyFromLink(link?: string | null): string | undefined {
  if (!link) return undefined;
  try {
    const family = new URL(link).searchParams.get('family');
    return family ? family.split(':')[0] : undefined;
  } catch {
    return undefined;
  }
}

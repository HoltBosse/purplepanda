// Components size things in steps of a quarter rem: Space's size, Flex and card-grid gaps, Margin,
// the button image gap, and every size in the site theme (text sizes, radii, padding presets).
// Kept in one place so the theme and the components can't disagree on what a unit is.
export const UNIT_REM = 0.25;

export function units(n: number): string {
  return `${n * UNIT_REM}rem`;
}

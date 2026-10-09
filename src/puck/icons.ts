/**
 * Curated re-export of the lucide-react icons actually used in this package.
 *
 * Import icons from here instead of "lucide-react" directly. The vendor barrel
 * re-exports all ~4,000 icons from one entry point, and Vite's dev dependency
 * pre-bundler bundles that entire barrel as a single ~1.1MB chunk regardless of
 * which named exports are used, even though production (Rollup) tree-shakes it
 * fine. Deep-importing each icon from its own file avoids that dev-only cost.
 *
 * To add an icon: find its kebab-case filename under
 * node_modules/lucide-react/dist/esm/icons/ and add one line below.
 */
export { default as ArrowUp } from "lucide-react/dist/esm/icons/arrow-up.mjs";
export { default as CalendarClock } from "lucide-react/dist/esm/icons/calendar-clock.mjs";
export { default as Check } from "lucide-react/dist/esm/icons/check.mjs";
export { default as ChevronDown } from "lucide-react/dist/esm/icons/chevron-down.mjs";
export { default as ChevronUp } from "lucide-react/dist/esm/icons/chevron-up.mjs";
export { default as CircleCheckBig } from "lucide-react/dist/esm/icons/circle-check-big.mjs";
export { default as CircleX } from "lucide-react/dist/esm/icons/circle-x.mjs";
export { default as Code } from "lucide-react/dist/esm/icons/code.mjs";
export { default as Info } from "lucide-react/dist/esm/icons/info.mjs";
export { default as Link } from "lucide-react/dist/esm/icons/link.mjs";
export { default as Lock } from "lucide-react/dist/esm/icons/lock.mjs";
export { default as Monitor } from "lucide-react/dist/esm/icons/monitor.mjs";
export { default as Moon } from "lucide-react/dist/esm/icons/moon.mjs";
export { default as MousePointerClick } from "lucide-react/dist/esm/icons/mouse-pointer-click.mjs";
export { default as Palette } from "lucide-react/dist/esm/icons/palette.mjs";
export { default as Paperclip } from "lucide-react/dist/esm/icons/paperclip.mjs";
export { default as Plus } from "lucide-react/dist/esm/icons/plus.mjs";
export { default as RotateCcw } from "lucide-react/dist/esm/icons/rotate-ccw.mjs";
export { default as Save } from "lucide-react/dist/esm/icons/save.mjs";
export { default as Smartphone } from "lucide-react/dist/esm/icons/smartphone.mjs";
export { default as Sparkles } from "lucide-react/dist/esm/icons/sparkles.mjs";
export { default as Square } from "lucide-react/dist/esm/icons/square.mjs";
export { default as SquareDashed } from "lucide-react/dist/esm/icons/square-dashed.mjs";
export { default as Subscript } from "lucide-react/dist/esm/icons/subscript.mjs";
export { default as Sun } from "lucide-react/dist/esm/icons/sun.mjs";
export { default as Superscript } from "lucide-react/dist/esm/icons/superscript.mjs";
export { default as SwatchBook } from "lucide-react/dist/esm/icons/swatch-book.mjs";
export { default as Tablet } from "lucide-react/dist/esm/icons/tablet.mjs";
export { default as Trash2 } from "lucide-react/dist/esm/icons/trash-2.mjs";
export { default as TriangleAlert } from "lucide-react/dist/esm/icons/triangle-alert.mjs";
export { default as Type } from "lucide-react/dist/esm/icons/type.mjs";
export { default as X } from "lucide-react/dist/esm/icons/x.mjs";

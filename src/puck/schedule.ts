// Shared by page.astro (gates public rendering), PublishStateIcon.astro (admin list status icon),
// and the pages/content admin index pages (which link to a preview instead of the live URL for a
// page that's currently outside its window) — see DateTimeField.tsx for where start/end come from.
export function isWithinSchedule(
    props: { start?: string | null | undefined; end?: string | null | undefined } | undefined,
    now: number = Date.now(),
): boolean {
    const startTime = props?.start ? Date.parse(props.start) : NaN;
    const endTime = props?.end ? Date.parse(props.end) : NaN;
    if (!Number.isNaN(startTime) && now < startTime) return false;
    if (!Number.isNaN(endTime) && now > endTime) return false;
    return true;
}

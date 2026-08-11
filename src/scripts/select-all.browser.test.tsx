// select-all.ts is a side-effect script: importing it binds listeners to the `.select-all` /
// `.row-select` elements present at that moment. The browser module registry only evaluates it
// once (vi.resetModules() cannot force a re-run here), so the fixture is built at module scope
// *before* the import, and each test resets the checkbox states rather than rebuilding the DOM.
import { beforeEach, describe, expect, it } from 'vitest';

document.body.innerHTML = `
    <input type="checkbox" class="select-all" id="head" />
    <input type="checkbox" class="row-select" />
    <input type="checkbox" class="row-select" />
    <input type="checkbox" class="row-select" />
    <input type="checkbox" class="select-all" id="foot" />
`;

await import('./select-all');

const selectAlls = () => [...document.querySelectorAll<HTMLInputElement>('.select-all')];
const rows = () => [...document.querySelectorAll<HTMLInputElement>('.row-select')];
const head = () => document.querySelector<HTMLInputElement>('#head')!;
const foot = () => document.querySelector<HTMLInputElement>('#foot')!;

/** Ticks a checkbox the way a user would, so the change listener fires. */
function toggle(box: HTMLInputElement, checked: boolean) {
    box.checked = checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
    for (const box of [...selectAlls(), ...rows()]) box.checked = false;
});

describe('select-all script', () => {
    it('checks every row when the header box is ticked', () => {
        toggle(head(), true);

        expect(rows().every((r) => r.checked)).toBe(true);
    });

    it('unchecks every row when the header box is cleared', () => {
        toggle(head(), true);
        expect(rows().every((r) => r.checked)).toBe(true);

        toggle(head(), false);

        expect(rows().some((r) => r.checked)).toBe(false);
    });

    it('overrides rows that were individually checked', () => {
        rows()[1]!.checked = true;

        toggle(head(), false);

        expect(rows().every((r) => !r.checked)).toBe(true);
    });

    // A table can carry a select-all in both header and footer; ticking either must sync both.
    it('keeps multiple select-all boxes in sync with each other', () => {
        toggle(head(), true);

        expect(foot().checked).toBe(true);
    });

    it('syncs rows from whichever select-all was used', () => {
        toggle(foot(), true);

        expect(rows().every((r) => r.checked)).toBe(true);
        expect(head().checked).toBe(true);
    });

    it('clears both select-alls when either is cleared', () => {
        toggle(head(), true);
        toggle(foot(), false);

        expect(head().checked).toBe(false);
        expect(foot().checked).toBe(false);
        expect(rows().some((r) => r.checked)).toBe(false);
    });

    it('leaves rows alone until a select-all actually changes', () => {
        expect(rows().every((r) => !r.checked)).toBe(true);
    });
});

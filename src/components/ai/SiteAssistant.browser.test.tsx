import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import SiteAssistant from './SiteAssistant';

const baseJob = {
    id: 'job-1',
    request: 'Create a Main template and an About page using it.',
    summary: 'A Main template with header and footer, and an About page.',
    designNotes: 'Warm and friendly.',
    error: null,
    costUsd: 0.026,
    createdAt: '2026-10-08T10:00:00.000Z',
    updatedAt: '2026-10-08T10:01:00.000Z',
    stale: false,
    log: [{ at: '2026-10-08T10:01:00.000Z', text: 'Ready for review' }],
};

const reviewJob = {
    ...baseJob,
    status: 'review',
    steps: [
        { index: 0, kind: 'create_template', description: 'Create template “Main”', brief: 'Header and footer', status: 'built', note: 'Built the header and footer.', error: null, result: null, outline: '- Section', previewable: true },
        { index: 1, kind: 'create_page', description: 'Create page “About” (/about) using Main', brief: 'Our story', status: 'failed', note: null, error: 'Building this step failed.', result: null, outline: null, previewable: false },
        { index: 2, kind: 'set_page_template', description: 'Set “Demo” to use template “Main”', brief: null, status: 'pending', note: null, error: null, result: null, outline: null, previewable: false },
    ],
};

function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SiteAssistant', () => {
    it('reviews a job and applies only the ticked, buildable steps', async () => {
        const fetchMock = vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
            const url = String(input);
            if (url.endsWith('/apply')) {
                return respond({
                    ...reviewJob,
                    status: 'applied',
                    steps: reviewJob.steps.map((s) => (s.index === 0 ? { ...s, status: 'applied', result: { entity: 'template', id: 't1' } } : s)),
                });
            }
            if (url === '/admin/ai/site/jobs' && init?.method !== 'POST') return respond([]);
            return respond(reviewJob);
        });

        const screen = await render(
            <SiteAssistant initialJobs={[{ id: 'job-1', status: 'review', request: reviewJob.request, costUsd: 0.026, createdAt: reviewJob.createdAt }]} stockPhotos={false} />,
        );
        await screen.getByText(reviewJob.request, { exact: false }).first().click();

        await expect.poll(() => document.querySelector('[data-job-status="review"]')).not.toBeNull();
        const box = (index: number) => document.querySelector<HTMLInputElement>(`[data-step="${index}"] input[type="checkbox"]`)!;
        // Built steps and template assignments start ticked; a step that failed to build can't be applied.
        await expect.poll(() => box(0).checked).toBe(true);
        expect(box(1).disabled).toBe(true);
        expect(box(2).checked).toBe(true);
        expect(document.querySelector('[data-step="0"] a[href="/admin/ai/site/jobs/job-1/preview/0"]')).not.toBeNull();

        box(2).click();
        await screen.getByText('Apply 1 step').click();

        await expect.poll(() => document.querySelector('[data-job-status="applied"]')).not.toBeNull();
        const applyCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/apply'))!;
        expect(JSON.parse(String((applyCall[1] as RequestInit).body))).toEqual({ approved: [0], mode: 'draft' });
        expect(document.querySelector('[data-step="0"] a[href="/admin/templates/edit/t1"]')?.textContent).toBe('Open template');
    });

    it('starts a job from a request', async () => {
        const fetchMock = vi.spyOn(window, 'fetch').mockImplementation(async (_input, init) =>
            init?.method === 'POST' ? respond({ ...baseJob, status: 'planning', steps: [], summary: null }, 201) : respond([]),
        );
        const screen = await render(<SiteAssistant initialJobs={[]} stockPhotos={true} />);

        await screen.getByPlaceholder('What should the assistant do?').fill('Add a Services page');
        await screen.getByText('Start', { exact: true }).click();

        await expect.poll(() => document.querySelector('[data-job-status="planning"]')).not.toBeNull();
        const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')!;
        expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ request: 'Add a Services page' });
    });
});

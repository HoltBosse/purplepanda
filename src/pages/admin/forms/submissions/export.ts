import externalPuckConfig from 'virtual:purplepanda/puck-config';
import type { Config, Data } from '@puckeditor/core';
import type { APIRoute } from 'astro';
import { and, desc, gt } from 'drizzle-orm';
import { getDb } from '../../../../db/db.js';
import { formSubmissions, forms } from '../../../../db/schema.js';
import {
    collectSubmissionFieldMeta,
    formatSubmissionValue,
    resolveFieldLabel,
    type SubmissionFieldMeta,
    visibleSubmissionFields,
} from '../../../../puck/form/submission-display.js';
import { filterConfigByLocation } from '../../../../puck/index.js';
import { resolveDataForSSR } from '../../../../puck/server-data-wrapper.js';
import { applySearchJoins, buildSearchWhere } from '../../../../search/drizzle.js';
import { parseSearchQuery } from '../../../../search/parser.js';
import { searchConfig } from './search-config.js';

function csvCell(value: string): string {
    // Spreadsheet apps treat a leading =, +, -, or @ as a formula; prefix with a quote to
    // force those apps to treat the cell as text and neutralize CSV/formula injection.
    const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const GET: APIRoute = async ({ url }) => {
    const db = getDb();

    const q = url.searchParams.get('q') ?? '';
    const searchWhere = buildSearchWhere(parseSearchQuery(q), searchConfig);
    // Same soft-delete filter as index.astro; deliberately no pagination limit/offset here.
    const listFilter = and(gt(formSubmissions.state, -1), searchWhere);

    const submissions = await applySearchJoins(
        db
            .select({
                id: formSubmissions.id,
                createdAt: formSubmissions.createdAt,
                data: formSubmissions.data,
                formId: formSubmissions.formId,
                formContent: forms.content,
            })
            .from(formSubmissions)
            .$dynamic(),
        searchConfig.joins,
    )
        .where(listFilter)
        .orderBy(desc(formSubmissions.createdAt));

    const formConfig = filterConfigByLocation((externalPuckConfig as Config) ?? ({} as Config), 'form');

    // Submissions here span every form, each with its own field set, so the CSV columns are the
    // union of field labels encountered (in first-seen order) rather than a fixed list — each row
    // fills in only the columns its own form has. Meta is resolved once per form, not per row.
    const metaByFormId = new Map<string, SubmissionFieldMeta>();
    const columns: string[] = [];
    const columnIndexByLabel = new Map<string, number>();
    const rows: { form: string; submitted: string; values: string[] }[] = [];

    for (const submission of submissions) {
        let meta = metaByFormId.get(submission.formId);
        if (!meta) {
            const resolvedFormContent = await resolveDataForSSR(formConfig, submission.formContent as Data);
            meta = collectSubmissionFieldMeta(formConfig, resolvedFormContent);
            metaByFormId.set(submission.formId, meta);
        }

        const submissionUrl = new URL(`/admin/forms/submissions/${submission.id}`, url).toString();
        const values: string[] = [];
        for (const [key, value] of visibleSubmissionFields(meta, submission.data as Record<string, unknown>)) {
            const label = resolveFieldLabel(meta, key);
            let index = columnIndexByLabel.get(label);
            if (index === undefined) {
                index = columns.length;
                columnIndexByLabel.set(label, index);
                columns.push(label);
            }
            values[index] = formatSubmissionValue(meta, key, value, submissionUrl);
        }

        rows.push({
            form: (submission.formContent as any)?.root?.props?.name || 'Untitled',
            submitted: submission.createdAt.toISOString(),
            values,
        });
    }

    const lines = [['Form', 'Submitted', ...columns].map(csvCell).join(',')];
    for (const row of rows) {
        const cells = [row.form, row.submitted];
        for (let i = 0; i < columns.length; i++) cells.push(row.values[i] ?? '');
        lines.push(cells.map(csvCell).join(','));
    }
    // Leading BOM so Excel (which otherwise guesses the system codepage) reads non-ASCII text correctly.
    const csv = `﻿${lines.join('\r\n')}\r\n`;

    return new Response(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="form-submissions.csv"',
        },
    });
};

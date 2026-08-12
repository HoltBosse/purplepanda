import { eq, sql } from 'drizzle-orm';
import { formSubmissions, forms } from '../../../../db/schema.js';
import type { DrizzleSearchConfig } from '../../../../search/drizzle.js';
import type { SearchFieldSpec } from '../../../../search/types.js';

// Shared between the submissions list (paginated) and the CSV export (unpaginated) so both apply
// the exact same search semantics to `q` — see index.astro and export.ts.

// The submitted answers as text, mirroring what [id].astro actually displays.
//
// Two things this has to get right:
//  1. Only VALUES, never keys. A naive `data::text` would also expose the jsonb keys — here field
//     ids like "text-input"/"radio-group" — so searching "input" would match every submission of
//     any form containing a text input rather than anything a visitor typed.
//  2. Choice fields store an opaque code (`"option-1"`), but the visitor saw — and [id].astro
//     renders — the option's label ("Yes please"). Those labels live in the form definition, not
//     the submission, so they're resolved back out of the form's Puck tree the same way
//     `resolveDisplayValue` there does: match a props node by field name, then the option by value
//     (or take `checkboxLabel`). `$.**` recurses the tree since fields nest arbitrarily deep.
//
// Both the raw code and the resolved label are indexed, so `option-1` and `Yes please` both find
// it. UNION dedupes, which matters because Puck stores each props node more than once in the tree.
// jsonb_each_text only deconstructs objects, so non-object payloads fall back to their text form.
const submissionValuesExpr = sql`
    case when jsonb_typeof(${formSubmissions.data}) = 'object' then (
        select string_agg(txt, ' ')
        from (
            select entry.value as txt
              from jsonb_each_text(${formSubmissions.data}) as entry
            union
            select o ->> 'label'
              from jsonb_each_text(${formSubmissions.data}) as entry
              cross join lateral jsonb_path_query(${forms.content}, '$.**.props') p
              cross join lateral jsonb_array_elements(
                  case when jsonb_typeof(p -> 'options') = 'array' then p -> 'options' else '[]'::jsonb end) o
             where p ->> 'name' = entry.key and o ->> 'value' = entry.value
            union
            select p ->> 'checkboxLabel'
              from jsonb_each_text(${formSubmissions.data}) as entry
              cross join lateral jsonb_path_query(${forms.content}, '$.**.props') p
             where p ->> 'name' = entry.key and p ? 'checkboxLabel'
        ) parts
        where txt is not null
    ) else ${formSubmissions.data} #>> '{}' end`;

const formNameExpr = sql`${forms.content} -> 'root' -> 'props' ->> 'name'`;

// Client-safe field descriptions passed to <SearchBar>: drive its validation, github-style
// valid/invalid highlighting, and the qualifier/value autocomplete dropdown.
// No `state:` qualifier: submissions are only ever active or soft-deleted, and this listing already
// hard-filters the deleted ones out, so there would be nothing left to filter on.
export const searchFields: SearchFieldSpec[] = [
    { name: 'form', type: 'text', label: 'Form', description: 'Form name contains' },
    {
        name: 'submitted',
        type: 'date',
        label: 'Submitted',
        description: 'Date submitted (YYYY-MM-DD); prefix with >, >=, <, or <= to search a range',
    },
];

export const searchConfig: DrizzleSearchConfig = {
    fields: [
        { name: 'form', type: 'text', column: formNameExpr, matchMode: 'contains' },
        { name: 'submitted', type: 'date', column: formSubmissions.createdAt },
    ],
    // A bare term searches what people actually submitted.
    fulltext: { columns: [submissionValuesExpr] },
    // Inner, matching the original query: a submission is only listed alongside its form. Joining
    // on the forms primary key is one-to-one, so this can't fan out rows and needs no DISTINCT.
    joins: [{ table: forms, on: eq(formSubmissions.formId, forms.id), type: 'inner' }],
};

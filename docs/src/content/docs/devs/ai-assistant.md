---
title: AI Assistant
description: The editors' AI tab, the site-wide AI assistant, and how components describe themselves to them.
---

Every Puck editor has an **AI** tab in its left panel, next to Blocks and Outline. Authors describe a change ("add an FAQ with five questions", "make the selected button say Book now", or a pasted screenshot to recreate) and the assistant edits the open document. Its edit lands as one change, so a single undo takes it back, and nothing is saved until the author saves or publishes as usual.

## Setup

Set `CLAUDE_API_KEY` in `.env` to an Anthropic API key, then turn on **Enable AI** in each site's **AI** section under `/dashboard/admin/sites` (it's off for new sites). Without both, the editors' AI tab and the home page's AI Assistant button are hidden, `/admin/ai` redirects to the admin home, and the AI routes refuse requests.

## Budget

Each site has a **Monthly budget** in USD (default `10`, in the same AI section), covering both assistants. Every model call's cost is added to the site's total for the current calendar month (UTC) in the `ai_spend` table, and the site form shows what's been spent so far. Once the total reaches the budget, new messages and jobs are refused until the next month. The check runs before every model call (`assertAiAvailable` in `src/puck/ai/enabled.server.ts`), so a turn or job already under way stops too. A call already in progress still finishes, so spend can go slightly over. Turning AI off for a site stops work in progress the same way.

## How it works

* The browser builds a **component catalog** from the editor's own config (`src/puck/ai/catalog.ts`), after location filtering and with the site's disabled components left out, so the assistant is offered exactly what the palette offers.
* `POST /admin/ai/chat` (`src/pages/admin/ai/chat.ts`) receives the message, the document, the catalog and any attached images, then streams back newline-delimited JSON events: progress, the edited document, the reply and the token usage.
* The harness (`src/puck/ai/harness.server.ts`) runs Claude Haiku 5.5 (adaptive thinking at low effort) in a tool loop over a server-side copy of the document. It sees a one-line-per-component outline and reads full props only when it needs them. It edits through small tools (`add_components`, `update_props`, `move_component`, `remove_components`), finds images with `search_media`, and saves attached images into the media library with `save_attachment` only when it actually uses them. Search results include a small thumbnail of each image, so it chooses by what an image shows rather than its file name. They leave out images in hidden folders, which aren't served publicly, as the editor's own image picker does (`src/media/hidden-folders.ts`). Any edit that carries a media id the assistant wasn't given (by a search, by saving an attachment, or because the image was already on the page) is refused before it touches the document, so a made-up id can't become a broken image. Each message also carries what the editor's "fields need attention" badge currently lists, and the name of the editor's page-settings schema (`src/puck/ai/root-schemas.ts`), so the assistant can be asked to fix exactly those fields, page settings included. Before it hands the document back it runs `validateContentTree` with that schema, and gets one follow-up to fix anything it left invalid or any flagged field still outstanding (or to explain why it can't).

## Cost

A typical turn, even building a whole landing page, costs around a tenth of a cent ($0.10 / $0.50 per million input/output tokens; prompts over 100k tokens are billed at the higher tier, which the estimate accounts for). The panel shows the estimated cost of each reply and of the conversation. What keeps it low:

* Claude Haiku 5.5 at `low` effort. Thinking is left on: switching it off saved only a few percent in testing, and risks the model writing a tool call as text instead of making it.
* The outline-plus-`get_props` approach and targeted edit tools, so the model neither reads nor rewrites the whole document as JSON.
* Prompt caching. The tools, instructions and catalog form a static prefix of about 5,000 tokens that later requests within five minutes read at a tenth of the price, and a rolling breakpoint caches each step of the tool loop.
* Only the last eight messages are replayed, as plain text. Attached images are downscaled to 1024px in the browser and sent with the message they belong to, never again.
* Rate limits: 60 messages per user per hour and 1,000 per site per day (`perUserLimiter` / `perSiteLimiter` in the route), on top of the site's monthly budget.

## Site assistant

The **AI Assistant** button on the admin home page (`/admin/ai`) handles changes across the whole site from one request: new templates, new pages in the page tree, edits to existing pages and templates, and which template a page uses. A request runs as a background job (`src/puck/ai/site-agent.server.ts`, stored in the `ai_jobs` table) in three stages:

1. **Planning.** Claude Sonnet 5.5 looks at the site through read-only tools (pages, templates, outlines) and submits a plan: a list of steps (`src/puck/ai/site-plan.ts`) with a brief for each, plus shared design direction. Plans are checked for broken references before they're accepted. If the request is too vague, it asks a question instead.
2. **Building.** Each page or template in the plan is built by the same Claude Haiku 5.5 harness as the editor tab, three at a time. The results are held on the job, not written to the site. The exception is images the builders import, which go into the media library because the built pages refer to them.
3. **Review.** The author reviews each step, with a preview rendered in the template it would use, and applies the ones they want. **As drafts** creates new pages unpublished and turns changes to existing pages into drafts; **Publish** makes everything live. Templates have no drafts, so template changes and template assignments take effect either way, and history keeps the previous versions.

Applying goes through `src/services/content.ts`, the same service layer the admin's own page and template forms now use, so AI changes are validated, versioned, cache-invalidated and audited exactly like an author's.

A typical job (a template and a few pages) takes about a minute and costs a few cents. Each job stops at a budget, `AI_JOB_BUDGET_USD` (default `1`), and each user can start 20 jobs a day, with no more than 50 per site. If the server restarts mid-job, the job screen offers **Resume**, which carries on from the last built step.

## Stock photos

Set `PEXELS_API_KEY` (free from [pexels.com/api](https://www.pexels.com/api/)) to let both assistants search Pexels when the media library has nothing suitable (`src/media/stock.server.ts`). They see thumbnails, and only photos they actually use are imported, into an **AI imports** media folder. Each title credits the photographer and Pexels, as Pexels asks. Downloads are only accepted from Pexels' image host.

## Describing custom fields

Puck's built-in field types describe themselves, but a `custom` field is only a render function, so the catalog can't tell what it stores. Custom fields the assistant should be able to set carry a hint, attached with `withAiHint`: a short description of the value, or a function returning one when the choices are only known at runtime.

```tsx
import { withAiHint } from "../src/puck/ai/hint.js";

const ratingField = withAiHint<CustomField<number>>(
  {
    type: "custom",
    label: "Rating",
    render: ({ value, onChange }) => <Stars value={value} onChange={onChange} />,
  },
  "integer from 1 to 5",
);
```

The built-in image, theme (scheme, button style, text style, border, border sides), layout, alias, date and notes fields already have hints. A custom field without a hint is shown to the assistant as "leave unchanged", unless it is a `categoryField` (its `objectFields` are described) or has a default value (described as "shaped like its default").

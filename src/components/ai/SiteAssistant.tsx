import { useCallback, useEffect, useState } from "react";
import type { JobView } from "../../puck/ai/site-agent.server.js";
import { Sparkles } from "../../puck/icons.js";

// The AI site assistant's screen (admin/ai): ask for changes across the site, follow the job as it
// plans and builds, then review each step — with a preview of what was built — and apply the ones
// you want. See puck/ai/site-agent.server.ts for how jobs run.

type JobSummary = { id: string; status: JobView["status"]; request: string; costUsd: number; createdAt: string };

const API = "/admin/ai/site/jobs";
const POLL_MS = 2000;
const ACTIVE: JobView["status"][] = ["planning", "building", "applying"];

const STATUS_LABEL: Record<JobView["status"], string> = {
  planning: "Planning",
  building: "Building",
  review: "Ready for review",
  applying: "Applying",
  applied: "Applied",
  failed: "Failed",
  cancelled: "Cancelled",
  clarify: "Needs more detail",
};

const STATUS_CLASS: Record<JobView["status"], string> = {
  planning: "badge-info",
  building: "badge-info",
  review: "badge-warning",
  applying: "badge-info",
  applied: "badge-success",
  failed: "badge-error",
  cancelled: "badge-ghost",
  clarify: "badge-warning",
};

const EXAMPLES = [
  "Create a template with a header (logo text and navigation to every top-level page) and a footer, and use it for all pages.",
  "Add an About section: an About page with our story, plus Team and Careers pages under it.",
  "Build a Services page with a card for each service, using fitting images from the media library.",
];

function cost(usd: number): string {
  return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error((body as { error?: string } | null)?.error ?? `Request failed (${response.status}).`);
  return body as T;
}

// False during SSR and the first client render (so hydration matches), true from the next render onward.
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

function resultLink(step: JobView["steps"][number]): { href: string; label: string } | null {
  const result = step.result;
  if (!result) return null;
  if (result.draftId) return { href: `/admin/pages/drafts/edit/${result.draftId}`, label: "Open draft" };
  return result.entity === "page" ? { href: `/admin/pages/edit/${result.id}`, label: "Open page" } : { href: `/admin/templates/edit/${result.id}`, label: "Open template" };
}

export default function SiteAssistant({ initialJobs, stockPhotos }: { initialJobs: JobSummary[]; stockPhotos: boolean }) {
  const [jobs, setJobs] = useState<JobSummary[]>(initialJobs);
  const [job, setJob] = useState<JobView | null>(null);
  const [request, setRequest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"draft" | "publish">("draft");
  // The server formats dates in its own locale and time zone; pin both until hydrated, then switch to the viewer's.
  const hydrated = useHydrated();

  const refreshList = useCallback(async () => {
    setJobs(await api<JobSummary[]>(API));
  }, []);

  const open = useCallback(async (id: string) => {
    setError(null);
    try {
      setJob(await api<JobView>(`${API}/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the job.");
    }
  }, []);

  // While a job is working, follow it.
  useEffect(() => {
    if (!job || !ACTIVE.includes(job.status) || job.stale) return;
    const timer = window.setTimeout(() => void open(job.id), POLL_MS);
    return () => window.clearTimeout(timer);
  }, [job, open]);

  // Once a job is ready for review, start with every step that can be applied ticked.
  const reviewKey = job?.status === "review" ? job.id : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when a different job becomes reviewable
  useEffect(() => {
    if (job?.status !== "review") return;
    setApproved(new Set(job.steps.filter((s) => s.status === "built" || s.kind === "set_page_template").map((s) => s.index)));
    void refreshList();
  }, [reviewKey]);

  const start = async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<JobView>(API, { method: "POST", body: JSON.stringify({ request: text }) });
      setJob(created);
      setRequest("");
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the job.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: "cancel" | "resume" | "apply") => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const body = action === "apply" ? JSON.stringify({ approved: [...approved], mode }) : undefined;
      const updated = await api<JobView>(`${API}/${job.id}/${action}`, { method: "POST", ...(body ? { body } : {}) });
      setJob(action === "resume" ? { ...updated, status: updated.status, stale: false } : updated);
      if (action === "resume") window.setTimeout(() => void open(job.id), POLL_MS);
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (index: number) => {
    setApproved((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row" data-site-assistant>
      <aside className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body gap-3 p-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles size={18} className="text-primary" /> Site assistant
            </h2>
            <p className="text-sm text-base-content/70">
              Describe changes across your site — new pages, templates, which template pages use. The assistant plans and builds them, and nothing changes
              until you review and apply.
            </p>
            <textarea
              className="textarea textarea-bordered min-h-28 w-full"
              placeholder="What should the assistant do?"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void start(request);
              }}
            />
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !request.trim()} onClick={() => void start(request)}>
              Start
            </button>
            {!stockPhotos && <p className="text-xs text-base-content/60">Images come from your media library. Set PEXELS_API_KEY to also allow free stock photos.</p>}
            <div className="flex flex-col gap-1">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="rounded-box border border-base-300 px-2 py-1.5 text-left text-xs hover:bg-base-200" onClick={() => setRequest(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card border border-base-300 bg-base-100">
          <div className="card-body gap-2 p-4">
            <h3 className="text-sm font-semibold">Recent jobs</h3>
            {jobs.length === 0 ? (
              <p className="text-xs text-base-content/60">None yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <button
                      type="button"
                      className={`w-full rounded-box px-2 py-1.5 text-left text-xs hover:bg-base-200 ${job?.id === j.id ? "bg-base-200" : ""}`}
                      onClick={() => void open(j.id)}
                    >
                      <span className="line-clamp-2">{j.request}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-base-content/60">
                        <span className={`badge badge-xs ${STATUS_CLASS[j.status]}`}>{STATUS_LABEL[j.status]}</span>
                        {new Date(j.createdAt).toLocaleString(hydrated ? undefined : "en-US", hydrated ? undefined : { timeZone: "UTC" })} · {cost(j.costUsd)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        {error && (
          <div role="alert" className="alert alert-error mb-4 text-sm">
            {error}
          </div>
        )}
        {!job ? (
          <div className="rounded-box border border-dashed border-base-300 p-10 text-center text-sm text-base-content/60">Start a job or open a recent one.</div>
        ) : (
          <div className="flex flex-col gap-4" data-job={job.id} data-job-status={job.status}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className={`badge ${STATUS_CLASS[job.status]}`}>{STATUS_LABEL[job.status]}</span>
                  {ACTIVE.includes(job.status) && !job.stale && <span className="loading loading-spinner loading-xs" />}
                  <span className="text-xs text-base-content/60">{cost(job.costUsd)} so far</span>
                </div>
                <p className="whitespace-pre-wrap font-medium">{job.request}</p>
                {job.summary && <p className="mt-1 text-sm text-base-content/80">{job.summary}</p>}
              </div>
              <div className="flex gap-2">
                {(job.stale || job.status === "failed") && (
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void act("resume")}>
                    Resume
                  </button>
                )}
                {(["planning", "building", "review", "clarify"] as JobView["status"][]).includes(job.status) && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void act("cancel")}>
                    {job.status === "review" ? "Discard" : "Cancel"}
                  </button>
                )}
              </div>
            </div>

            {job.stale && <div className="alert alert-warning text-sm">This job stopped making progress (the server may have restarted). Resume it to carry on from where it got to.</div>}
            {job.error && job.status !== "clarify" && <div className="alert alert-error text-sm">{job.error}</div>}
            {job.status === "clarify" && (
              <div className="alert text-sm">
                <div className="flex flex-col gap-2">
                  <p className="whitespace-pre-wrap">{job.error}</p>
                  <button type="button" className="btn btn-sm self-start" onClick={() => setRequest(`${job.request}\n\n`)}>
                    Add detail and start again
                  </button>
                </div>
              </div>
            )}

            {job.designNotes && (
              <details className="rounded-box border border-base-300 px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium">Design direction</summary>
                <p className="mt-2 whitespace-pre-wrap text-base-content/80">{job.designNotes}</p>
              </details>
            )}

            {job.steps.length > 0 && (
              <ol className="flex flex-col gap-2">
                {job.steps.map((step) => {
                  const link = resultLink(step);
                  const selectable = job.status === "review" && (step.status === "built" || step.kind === "set_page_template");
                  return (
                    <li key={step.index} className="rounded-box border border-base-300 bg-base-100 p-3" data-step={step.index} data-step-status={step.status}>
                      <div className="flex items-start gap-3">
                        {job.status === "review" && (
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm mt-0.5"
                            aria-label={`Apply: ${step.description}`}
                            disabled={!selectable}
                            checked={approved.has(step.index)}
                            onChange={() => toggle(step.index)}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{step.description}</span>
                            <span className="badge badge-sm badge-ghost">{step.status}</span>
                            {step.previewable && (
                              <a className="link text-xs" href={`${API}/${job.id}/preview/${step.index}`} target="_blank" rel="noreferrer">
                                Preview
                              </a>
                            )}
                            {link && (
                              <a className="link text-xs" href={link.href}>
                                {link.label}
                              </a>
                            )}
                          </div>
                          {step.note && <p className="mt-1 text-sm text-base-content/80">{step.note}</p>}
                          {step.error && <p className="mt-1 text-sm text-error">{step.error}</p>}
                          {(step.brief || step.outline) && (
                            <details className="mt-1 text-xs">
                              <summary className="cursor-pointer text-base-content/60">Details</summary>
                              {step.brief && <p className="mt-1 whitespace-pre-wrap text-base-content/80">{step.brief}</p>}
                              {step.outline && <pre className="mt-2 max-h-64 overflow-auto rounded bg-base-200 p-2 text-[11px] leading-snug">{step.outline}</pre>}
                            </details>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {job.status === "review" && (
              <div className="rounded-box border border-base-300 bg-base-200/50 p-4">
                <fieldset className="flex flex-col gap-2 text-sm">
                  <legend className="mb-1 font-medium">Apply the ticked steps</legend>
                  <label className="flex items-start gap-2">
                    <input type="radio" className="radio radio-sm mt-0.5" name="mode" checked={mode === "draft"} onChange={() => setMode("draft")} />
                    <span>As drafts — new pages are created unpublished, changes to existing pages become drafts you can review and publish.</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="radio" className="radio radio-sm mt-0.5" name="mode" checked={mode === "publish"} onChange={() => setMode("publish")} />
                    <span>Publish — everything goes live now (each page's history keeps the previous version).</span>
                  </label>
                  <p className="text-xs text-base-content/60">Template changes and template assignments take effect either way; a template's history keeps its previous version.</p>
                </fieldset>
                <button type="button" className="btn btn-primary btn-sm mt-3" disabled={busy || approved.size === 0} onClick={() => void act("apply")}>
                  Apply {approved.size} step{approved.size === 1 ? "" : "s"}
                </button>
              </div>
            )}

            {job.log.length > 0 && (
              <details className="text-xs" open={ACTIVE.includes(job.status)}>
                <summary className="cursor-pointer text-base-content/60">Activity</summary>
                <ul className="mt-1 flex flex-col gap-0.5 text-base-content/70">
                  {job.log.slice(-15).map((entry) => (
                    <li key={`${entry.at}-${entry.text}`}>
                      {new Date(entry.at).toLocaleTimeString(hydrated ? undefined : "en-US", hydrated ? undefined : { timeZone: "UTC" })} · {entry.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

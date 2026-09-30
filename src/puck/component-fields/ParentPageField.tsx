import type { CustomField } from "@puckeditor/core";
import CornerDownRight from "lucide-react/dist/esm/icons/corner-down-right.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import { useCallback, useEffect, useRef, useState } from "react";

type ParentOption = { id: string; title: string; depth: number };

// Picks a page's parentPage from a dialog modeled on ImageField's media picker: paginated, with
// the same nesting the pages admin list draws (see pages/admin/pages/api/parents.ts). The value is
// the parent's page id, or "" for top level.
function ParentPageFieldInner({
  id,
  label,
  value,
  onChange,
  excludeId,
}: {
  id: string;
  label: string | undefined;
  value: string | undefined;
  onChange: (value: string) => void;
  excludeId: string | undefined;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ParentOption[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fetching, setFetching] = useState(false);
  // The value is only an id, so the button's label is looked up separately (and kept from the
  // dialog's own rows when picking, to skip the round trip).
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setSelectedTitle(null);
      return;
    }
    let cancelled = false;
    fetch(`/admin/pages/api/parents?id=${encodeURIComponent(value)}`, { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<{ title: string }>) : null))
      .then((data) => {
        // An unresolvable parent (unpublished/deleted) is treated as top level by routing.
        if (!cancelled) setSelectedTitle(data ? data.title : "Unknown page");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [value]);

  const fetchOptions = useCallback(
    async (q: string, p: number) => {
      setFetching(true);
      const params = new URLSearchParams();
      if (q) params.set("search", q);
      if (excludeId) params.set("exclude", excludeId);
      params.set("page", String(p));
      const res = await fetch(`/admin/pages/api/parents?${params.toString()}`, { credentials: "same-origin" });
      if (res.ok) {
        const data = (await res.json()) as { pages: ParentOption[]; totalPages: number };
        setOptions(data.pages);
        setTotalPages(data.totalPages);
      }
      setFetching(false);
    },
    [excludeId],
  );

  // Listen for native dialog close (Escape key or form method="dialog")
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => setIsOpen(false);
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  // Fetch when the dialog opens, the query changes, or the user pages; debounce search typing,
  // immediate otherwise.
  useEffect(() => {
    if (!isOpen) return;
    const delay = query ? 300 : 0;
    const t = setTimeout(() => fetchOptions(query, page), delay);
    return () => clearTimeout(t);
  }, [isOpen, query, page, fetchOptions]);

  const openDialog = () => {
    setQuery("");
    setPage(1);
    setOptions([]);
    setIsOpen(true);
    dialogRef.current?.showModal();
  };

  const select = (option: { id: string; title: string } | null) => {
    setSelectedTitle(option?.title ?? null);
    onChange(option?.id ?? "");
    dialogRef.current?.close();
  };

  return (
    <div className="w-full">
      {/* Puck doesn't auto-render a label for "custom" fields, so this field renders its own. */}
      {label && (
        <label className="mb-1 block text-sm font-medium" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="join w-full">
        <button id={id} type="button" onClick={openDialog} className="btn btn-outline join-item flex-1 min-w-0 justify-start font-normal">
          <span className="truncate">{value ? (selectedTitle ?? "Loading...") : "None (top level)"}</span>
        </button>
        {value && (
          <button type="button" onClick={() => select(null)} className="btn btn-outline join-item px-2" aria-label="Clear parent page">
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <dialog ref={dialogRef} className="modal">
        <div className="modal-box w-11/12 max-w-2xl">
          <h3 className="font-bold text-lg mb-4">Select Parent Page</h3>

          <input
            type="search"
            placeholder="Search pages..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="input input-bordered w-full mb-4"
            autoFocus
          />

          <div className="min-h-48 max-h-[60vh] overflow-y-auto">
            {fetching && options.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <span className="loading loading-spinner loading-lg" />
              </div>
            ) : (
              <ul className="menu w-full p-0">
                {!query && page === 1 && (
                  <li>
                    <button type="button" className={!value ? "menu-active" : ""} onClick={() => select(null)}>
                      <span className="italic">None (top level)</span>
                    </button>
                  </li>
                )}
                {options.map((option) => (
                  <li key={option.id}>
                    <button type="button" className={option.id === value ? "menu-active" : ""} onClick={() => select(option)}>
                      <span className="flex min-w-0 items-center gap-1">
                        {option.depth > 1 && <span className="whitespace-pre">{" ".repeat((option.depth - 2) * 2)}</span>}
                        {option.depth > 1 && <CornerDownRight className="size-3.5 shrink-0 text-base-content/50" aria-hidden="true" />}
                        <span className="truncate">{option.title}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!fetching && options.length === 0 && query && <p className="text-center text-base-content/50 py-12">No pages found</p>}
          </div>

          {!fetching && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button type="button" className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </button>
              <span className="text-sm text-base-content/70">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}

          <div className="modal-action">
            <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
          </div>
        </div>
        <button type="button" className="modal-backdrop" onClick={() => dialogRef.current?.close()} aria-label="Close" />
      </dialog>
    </div>
  );
}

// `excludeId` is the page being edited (undefined for a new page): it and its descendants are
// left out of the picker, since parenting under either would create a cycle.
export function parentPageField(excludeId?: string): CustomField<string> {
  return {
    type: "custom",
    label: "Parent Page",
    render: ({ field, id, value, onChange }) => (
      <ParentPageFieldInner id={id} label={field.label} value={value} onChange={onChange} excludeId={excludeId} />
    ),
  };
}

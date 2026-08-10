import type { CustomField } from "@puckeditor/core";
import { useEffect, useRef, useState } from "react";

export type MediaFolderRef = { id: string; name: string; visibility: number };

// Breadcrumb trail while browsing; empty means "at root". Root itself can't be selected (it's
// not a real mediafolders row), only navigated into.
type FolderCrumb = MediaFolderRef;

function FolderIcon() {
  return (
    <div className="flex items-center justify-center rounded bg-info p-2 text-white shrink-0">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden="true"
      >
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      </svg>
    </div>
  );
}

function FolderPickerField({
  value,
  onChange,
}: {
  value: MediaFolderRef | null;
  onChange: (value: MediaFolderRef | null) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [folders, setFolders] = useState<MediaFolderRef[]>([]);
  const [folderPath, setFolderPath] = useState<FolderCrumb[]>([]);
  const [fetching, setFetching] = useState(false);

  const currentFolder = folderPath[folderPath.length - 1] ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => setIsOpen(false);
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setFetching(true);
    const params = new URLSearchParams();
    if (currentFolder) params.set("folder", currentFolder.id);
    params.set("foldersOnly", "1");
    params.set("includeHidden", "1");
    fetch(`/admin/media/api/lookup?${params.toString()}`, { credentials: "same-origin" })
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { folders: MediaFolderRef[] };
        if (!cancelled) setFolders(data.folders);
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentFolder]);

  const openDialog = () => {
    setFolderPath([]);
    setFolders([]);
    setIsOpen(true);
    dialogRef.current?.showModal();
  };

  const openFolder = (folder: MediaFolderRef) => {
    setFolderPath((path) => [...path, folder]);
  };

  const goToCrumb = (index: number) => {
    setFolderPath((path) => path.slice(0, index + 1));
  };

  const selectCurrent = () => {
    if (!currentFolder) return;
    onChange(currentFolder);
    dialogRef.current?.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={`btn btn-outline w-full h-auto py-2 justify-start font-normal ${!value ? "border-error text-error" : ""}`}
      >
        <div className="flex flex-col items-start gap-1 min-w-0 w-full">
          <span className="truncate w-full text-left">{value ? value.name : "Select a folder..."}</span>
          {value?.visibility === -1 && <span className="badge badge-warning badge-sm">Hidden</span>}
        </div>
      </button>
      <p className="text-xs text-base-content/60 mt-1">
        For privacy, we recommend picking a folder with no visibility (hidden) so uploaded images
        aren&apos;t publicly browsable in the media library.
      </p>
      {!value && <p className="text-xs text-error mt-1">A destination folder is required.</p>}

      <dialog ref={dialogRef} className="modal">
        <div className="modal-box w-11/12 max-w-4xl">
          <h3 className="font-bold text-lg mb-4">Select Folder</h3>

          <div className="flex flex-wrap items-center gap-1 text-sm text-base-content/70 mb-3">
            <button
              type="button"
              onClick={() => goToCrumb(-1)}
              className={`hover:text-primary ${folderPath.length === 0 ? "font-semibold text-base-content" : ""}`}
            >
              Root
            </button>
            {folderPath.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center gap-1">
                <span aria-hidden="true" className="text-base-content/40">&gt;</span>
                <button
                  type="button"
                  onClick={() => goToCrumb(index)}
                  className={`hover:text-primary ${
                    index === folderPath.length - 1 ? "font-semibold text-base-content" : ""
                  }`}
                >
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>

          <div className="min-h-48 max-h-[60vh] overflow-y-auto">
            {fetching ? (
              <div className="flex items-center justify-center py-12">
                <span className="loading loading-spinner loading-lg" />
              </div>
            ) : folders.length === 0 ? (
              <p className="text-center text-base-content/50 py-12">No subfolders</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => openFolder(folder)}
                    className="flex items-center gap-3 rounded-lg border border-base-300 bg-base-100 p-3 text-left transition-colors hover:border-primary hover:bg-base-200 focus:outline-none focus:border-primary"
                  >
                    <FolderIcon />
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                      <span className="break-words text-sm font-medium">{folder.name}</span>
                      {folder.visibility === -1 && (
                        <span className="badge badge-warning badge-sm self-start">Hidden</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="modal-action justify-between">
            <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!currentFolder} onClick={selectCurrent}>
              {currentFolder ? `Select "${currentFolder.name}"` : "Select current folder"}
            </button>
          </div>
        </div>
        <button
          type="button"
          className="modal-backdrop"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close"
        />
      </dialog>
    </>
  );
}

// A required picker: fields using this never default to a usable value (see Image.tsx's
// defaultProps.folder = null), and the field itself surfaces the "required" state and the
// hidden-folder recommendation inline rather than relying on Puck's field config (which has no
// built-in required/validation option — see toSubmissionSchema for the pattern used elsewhere).
export const folderField: CustomField<MediaFolderRef | null> = {
  type: "custom",
  render: ({ value, onChange }) => <FolderPickerField value={value} onChange={onChange} />,
};

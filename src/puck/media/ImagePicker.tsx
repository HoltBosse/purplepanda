import { useState, useEffect, useRef, useCallback } from "react";
import type { ComponentConfig } from "@puckeditor/core";

/* 
  TODO:
  * make cropping button work, this requires a cropping ui + support in the media serving api
  * folders within the media library, pagination
  * upload support from media picker, may require porting some of the existing upload stuff into react land
*/

export type MediaRef = { id: string; title: string; alt: string };

export type ImageConfig = MediaRef & {
  // null means "100%" (auto); otherwise a pixel value bounded by the image's natural size
  width: number | null;
  height: number | null;
  // null means the browser default ("50% 50%"); otherwise "xx% xx%" for CSS object-position
  objectPosition: string | null;
};

export type ImagePickerProps = {
  image: ImageConfig | null;
};

function ImageDisplay({ image }: { image: ImageConfig }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
  }, [image.id]);

  const base = `/image/${image.id}`;

  return (
    <div className="relative min-h-12">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-base-200/50">
          <span className="loading loading-spinner loading-xl" />
        </div>
      )}
      <picture>
        <source srcSet={`${base}?fmt=webp`} type="image/webp" />
        <source srcSet={`${base}?fmt=png`} type="image/png" />
        <img
          src={`${base}?fmt=png`}
          style={{
            objectFit: "cover",
            objectPosition: image.objectPosition ?? "50% 50%",
            width: image.width != null ? `${image.width}px` : "100%",
            height: image.height != null ? `${image.height}px` : "100%",
          }}
          alt={image.alt}
          title={image.title}
          onLoad={() => setLoading(false)}
        />
      </picture>
    </div>
  );
}

function ImagePickerField({
  value,
  onChange,
}: {
  value: ImageConfig | null;
  onChange: (value: ImageConfig | null) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<MediaRef[]>([]);
  const [fetching, setFetching] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const focusDialogRef = useRef<HTMLDialogElement>(null);
  const focusAreaRef = useRef<HTMLDivElement>(null);
  const [focusPos, setFocusPos] = useState({ x: 50, y: 50 });

  const fetchImages = useCallback(async (q: string) => {
    setFetching(true);
    const params = q ? `?search=${encodeURIComponent(q)}` : "";
    const res = await fetch(`/admin/media/api/lookup${params}`, { credentials: "same-origin" });
    if (res.ok) setImages(await res.json());
    setFetching(false);
  }, []);

  // Listen for native dialog close (Escape key or form method="dialog")
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => setIsOpen(false);
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  // Load the full-size image to determine the natural dimensions the sliders are bounded by
  useEffect(() => {
    if (!value?.id) {
      setNaturalSize(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = `/image/${value.id}?fmt=png`;
    return () => {
      cancelled = true;
    };
  }, [value?.id]);

  // Fetch when dialog opens or query changes; debounce search, immediate on open
  useEffect(() => {
    if (!isOpen) return;
    const delay = query ? 300 : 0;
    const t = setTimeout(() => fetchImages(query), delay);
    return () => clearTimeout(t);
  }, [isOpen, query, fetchImages]);

  const openDialog = () => {
    setQuery("");
    setIsOpen(true);
    dialogRef.current?.showModal();
  };

  const select = (img: MediaRef) => {
    onChange({ ...img, width: null, height: null, objectPosition: null });
    dialogRef.current?.close();
  };

  const setWidthAuto = (auto: boolean) => {
    if (!value) return;
    onChange({ ...value, width: auto ? null : naturalSize?.width ?? 0 });
  };

  const setHeightAuto = (auto: boolean) => {
    if (!value) return;
    onChange({ ...value, height: auto ? null : naturalSize?.height ?? 0 });
  };

  const openFocusDialog = () => {
    if (!value) return;
    const match = value.objectPosition?.match(/^([\d.]+)%\s+([\d.]+)%$/);
    setFocusPos(match ? { x: parseFloat(match[1] ?? "50"), y: parseFloat(match[2] ?? "50") } : { x: 50, y: 50 });
    focusDialogRef.current?.showModal();
  };

  const updateFocusFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = focusAreaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    setFocusPos({ x, y });
  };

  const onFocusPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFocusFromPointer(e);
  };

  const onFocusPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    updateFocusFromPointer(e);
  };

  const saveFocus = () => {
    if (!value) return;
    onChange({ ...value, objectPosition: `${Math.round(focusPos.x)}% ${Math.round(focusPos.y)}%` });
    focusDialogRef.current?.close();
  };

  return (
    <>
      <div className="join w-full">
        <button
          type="button"
          onClick={openDialog}
          className="btn btn-outline join-item flex-1 min-w-0 justify-start font-normal rounded-bl-none"
        >
          <span className="truncate">{value ? value.title || value.id : "Select an image..."}</span>
        </button>
        <button type="button" className="btn btn-outline join-item px-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="M6 2v14a2 2 0 0 0 2 2h14" />
            <path d="M18 22V8a2 2 0 0 0-2-2H2" />
          </svg>
        </button>
        <button
          type="button"
          onClick={openFocusDialog}
          disabled={!value}
          className="btn btn-outline join-item px-2 rounded-br-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          </svg>
        </button>
      </div>

      <details className="collapse collapse-arrow border bg-base-100 rounded-tl-none rounded-tr-none">
        <summary className="collapse-title text-sm font-medium py-3">Sizing</summary>
        <div className="collapse-content space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-base-content/60">Width</span>
              <input
                type="range"
                className="range range-primary w-full"
                value={value?.width ?? naturalSize?.width ?? 0}
                min={0}
                max={naturalSize?.width ?? 0}
                disabled={!value || value.width == null}
                onChange={(e) => onChange(value ? { ...value, width: Number(e.target.value) } : value)}
              />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-base-content/60">100%</span>
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={!value || value.width == null}
                disabled={!value}
                onChange={(e) => setWidthAuto(e.target.checked)}
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-base-content/60">Height</span>
              <input
                type="range"
                className="range range-primary w-full"
                value={value?.height ?? naturalSize?.height ?? 0}
                min={0}
                max={naturalSize?.height ?? 0}
                disabled={!value || value.height == null}
                onChange={(e) => onChange(value ? { ...value, height: Number(e.target.value) } : value)}
              />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs text-base-content/60">100%</span>
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={!value || value.height == null}
                disabled={!value}
                onChange={(e) => setHeightAuto(e.target.checked)}
              />
            </div>
          </div>
        </div>
      </details>

      <dialog ref={dialogRef} className="modal">
        <div className="modal-box w-11/12 max-w-4xl">
          <h3 className="font-bold text-lg mb-4">Select Image</h3>

          <input
            type="search"
            placeholder="Search images..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input input-bordered w-full mb-4"
            autoFocus
          />

          <div className="min-h-48 max-h-[60vh] overflow-y-auto">
            {fetching ? (
              <div className="flex items-center justify-center py-12">
                <span className="loading loading-spinner loading-lg" />
              </div>
            ) : images.length === 0 ? (
              <p className="text-center text-base-content/50 py-12">No images found</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => select(img)}
                    className={`group relative rounded-lg overflow-hidden border-2 transition-colors hover:border-primary focus:outline-none focus:border-primary ${
                      value?.id === img.id ? "border-primary" : "border-base-300"
                    }`}
                  >
                    <img
                      src={`/image/${img.id}?fmt=webp&w=100&q=80`}
                      alt={img.alt}
                      className="w-full h-28 object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-white text-xs truncate text-left">
                      {img.title || img.id}
                    </div>
                    {value?.id === img.id && (
                      <div className="absolute top-1.5 right-1.5 bg-primary text-primary-content rounded-full p-0.5">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3">
                          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="modal-action">
            <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
              Cancel
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

      <dialog ref={focusDialogRef} className="modal">
        <div className="modal-box w-11/12 max-w-4xl">
          <h3 className="font-bold text-lg mb-4">Set Focus Point</h3>

          {value && (
            <div className="flex justify-center bg-base-200 rounded-lg p-2">
              <div
                ref={focusAreaRef}
                onPointerDown={onFocusPointerDown}
                onPointerMove={onFocusPointerMove}
                className="relative inline-block cursor-crosshair touch-none select-none"
              >
                <img
                  src={`/image/${value.id}?fmt=png`}
                  alt={value.alt}
                  draggable={false}
                  className="block max-h-[60vh] max-w-full"
                />
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: `${focusPos.x}%`, top: `${focusPos.y}%` }}
                >
                  <div className="flex items-center justify-center size-8 rounded-full border-2 border-primary bg-primary/20 shadow">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="size-4 text-primary"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="modal-action">
            <button type="button" className="btn" onClick={() => focusDialogRef.current?.close()}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={saveFocus}>
              Save
            </button>
          </div>
        </div>
        <button
          type="button"
          className="modal-backdrop"
          onClick={() => focusDialogRef.current?.close()}
          aria-label="Close"
        />
      </dialog>
    </>
  );
}

const ImagePicker: ComponentConfig<ImagePickerProps> = {
  label: "Image",
  fields: {
    image: {
      type: "custom",
      render: ({ value, onChange }) => (
        <ImagePickerField value={value} onChange={onChange} />
      ),
    },
  },
  defaultProps: {
    image: null,
  },
  render: ({ image }: ImagePickerProps) => {
    if (!image?.id) {
      return (
        <div className="rounded-lg border-2 border-dashed border-base-300 bg-base-200 p-6 text-center text-base-content/50">
          No image selected
        </div>
      );
    }

    return <ImageDisplay image={image} />;
  },
};

export default ImagePicker;

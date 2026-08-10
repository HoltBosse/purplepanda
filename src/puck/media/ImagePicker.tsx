import { useState, useEffect, useRef, useCallback } from "react";
import type { ComponentConfig, CustomField } from "@puckeditor/core";
// Type-only: cropperjs defines custom elements (`class X extends HTMLElement`) at module
// scope, which throws under SSR. It must only ever be loaded via dynamic import in the browser.
import type Cropper from "cropperjs";
import type { CropperImage } from "cropperjs";

/*
  TODO:
  * upload support from media picker, may require porting some of the existing upload stuff into react land
*/

export type MediaRef = { id: string; title: string; alt: string };

export type MediaFolder = { id: string; name: string };

// One entry in the picker's folder breadcrumb trail; the root has a null id.
type FolderCrumb = { id: string | null; name: string };

export type CropBox = { x1: number; y1: number; x2: number; y2: number };

export type ImageConfig = MediaRef & {
  // null means "100%" (auto); otherwise a pixel value bounded by the image's natural size
  width: number | null;
  height: number | null;
  // null means the browser default ("50% 50%"); otherwise "xx% xx%" for CSS object-position
  objectPosition: string | null;
  // null means uncropped; otherwise pixel bounds (in the original image's natural size) to extract
  crop: CropBox | null;
};

// Appends/removes the crop query params (x1/y1/x2/y2) the media serving API understands.
function withCropParams(url: string, crop: CropBox | null): string {
  const [path = "", query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.delete("x1");
  params.delete("y1");
  params.delete("x2");
  params.delete("y2");
  if (crop) {
    params.set("x1", String(crop.x1));
    params.set("y1", String(crop.y1));
    params.set("x2", String(crop.x2));
    params.set("y2", String(crop.y2));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

const CROP_MAX_WIDTH = 640;
const CROP_MAX_HEIGHT = 480;

// The crop dialog renders the image scaled down to fit the modal; selection coordinates read
// from cropperjs are in that scaled-down space, so this factor converts them back to the
// original image's natural pixel coordinates (what the media API's x1/y1/x2/y2 expect).
function getCropDisplaySize(natural: { width: number; height: number }) {
  const scale = Math.min(1, CROP_MAX_WIDTH / natural.width, CROP_MAX_HEIGHT / natural.height);
  return { scale, width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) };
}

// A cropper-canvas sized exactly to the display dimensions, with a freeform (no fixed aspect
// ratio) resizable/movable selection defaulting to a centered half-width/half-height box.
function buildCropTemplate(width: number, height: number): string {
  return (
    `<cropper-canvas background style="width:${width}px;height:${height}px">` +
    "<cropper-image></cropper-image>" +
    "<cropper-shade></cropper-shade>" +
    '<cropper-handle action="select" plain></cropper-handle>' +
    '<cropper-selection initial-coverage="0.5" movable resizable outlined>' +
    '<cropper-grid role="grid" bordered covered></cropper-grid>' +
    "<cropper-crosshair centered></cropper-crosshair>" +
    '<cropper-handle action="move" theme-color="rgba(255, 255, 255, 0.35)"></cropper-handle>' +
    '<cropper-handle action="n-resize"></cropper-handle>' +
    '<cropper-handle action="e-resize"></cropper-handle>' +
    '<cropper-handle action="s-resize"></cropper-handle>' +
    '<cropper-handle action="w-resize"></cropper-handle>' +
    '<cropper-handle action="ne-resize"></cropper-handle>' +
    '<cropper-handle action="nw-resize"></cropper-handle>' +
    '<cropper-handle action="se-resize"></cropper-handle>' +
    '<cropper-handle action="sw-resize"></cropper-handle>' +
    "</cropper-selection>" +
    "</cropper-canvas>"
  );
}

// cropperjs centers/scales the image within the canvas itself (which can letterbox it rather
// than filling the canvas exactly, e.g. from sub-pixel rounding), so the mapping between
// selection coordinates (relative to the canvas) and natural image pixels can't just assume the
// canvas and image line up 1:1 — it has to be measured from the actual rendered rects.
function getCropTransform(cropper: Cropper, natural: { width: number; height: number }) {
  const canvasEl = cropper.getCropperCanvas();
  const imageEl = cropper.getCropperImage();
  if (!canvasEl || !imageEl) return null;
  const canvasRect = canvasEl.getBoundingClientRect();
  const imageRect = imageEl.getBoundingClientRect();
  if (imageRect.width === 0 || imageRect.height === 0) return null;
  return {
    offsetX: imageRect.left - canvasRect.left,
    offsetY: imageRect.top - canvasRect.top,
    scaleX: natural.width / imageRect.width,
    scaleY: natural.height / imageRect.height,
  };
}

// cropperjs's own initial-centering math (CropperImage.$center, triggered automatically once the
// image loads) can leave the image visibly offset within the canvas instead of filling it exactly,
// even though the canvas is sized to the image's own aspect ratio. Since the canvas and image
// share that aspect ratio by construction, the correct transform is just "scale to fit, anchored
// at the image's own top-left" — set it directly rather than relying on $center to get it right.
// Uses the actually-loaded image's own natural size (cropperImage.$image), not the original's
// full natural size, since the dialog loads a server-resized (w=1000) preview of the image.
function fillCropCanvas(cropperImage: CropperImage, dispWidth: number) {
  const loadedWidth = cropperImage.$image.naturalWidth;
  const loadedHeight = cropperImage.$image.naturalHeight;
  if (!loadedWidth || !loadedHeight) return;
  const scale = dispWidth / loadedWidth;
  const originX = loadedWidth / 2;
  const originY = loadedHeight / 2;
  // $setTransform is a no-op unless one of these flags is set; toggle translatable on just for
  // this call, matching how $center itself temporarily overrides it for non-interactive images.
  const wasTranslatable = cropperImage.translatable;
  cropperImage.translatable = true;
  cropperImage.$setTransform(scale, 0, 0, scale, originX * (scale - 1), originY * (scale - 1));
  cropperImage.translatable = wasTranslatable;
}

export type ImagePickerProps = {
  image: ImageConfig | null;
};

function ImageDisplay({ image, isEditing }: { image: ImageConfig; isEditing: boolean }) {
  const [loading, setLoading] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // On a server-rendered page, the browser can finish loading this <img> (from the markup
    // it already parsed) before React hydrates and attaches the onLoad handler below, so that
    // real "load" event fires into the void and loading would otherwise never clear. Re-check
    // completeness directly whenever the image identity changes to catch that race.
    setLoading(!imgRef.current?.complete);
  }, [image.id]);

  const base = `/image/${image.id}`;
  const webpSrc = withCropParams(`${base}?fmt=webp`, image.crop);
  const pngSrc = withCropParams(`${base}?fmt=png`, image.crop);

  return (
    <div className="relative min-h-12">
      {(loading && isEditing) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-base-200/50">
          <span className="loading loading-spinner loading-xl" />
        </div>
      )}
      <picture>
        <source srcSet={webpSrc} type="image/webp" />
        <source srcSet={pngSrc} type="image/png" />
        <img
          ref={imgRef}
          src={pngSrc}
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
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [folderPath, setFolderPath] = useState<FolderCrumb[]>([{ id: null, name: "Root" }]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fetching, setFetching] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const currentFolderId = folderPath[folderPath.length - 1]?.id ?? null;

  const focusDialogRef = useRef<HTMLDialogElement>(null);
  const focusAreaRef = useRef<HTMLDivElement>(null);
  const [focusPos, setFocusPos] = useState({ x: 50, y: 50 });

  const cropDialogRef = useRef<HTMLDialogElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);
  // Guards against openCropDialog running twice concurrently (e.g. rapid double-clicks while the
  // dynamic import of cropperjs is still resolving), which would otherwise spin up multiple
  // cropper instances stacked in the same container.
  const cropOpeningRef = useRef(false);

  // A search spans every folder (no folder scoping, no folders returned); browsing without a search
  // lists the folders and images inside the current folder, paginated.
  const fetchImages = useCallback(async (q: string, folderId: string | null, p: number) => {
    setFetching(true);
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    else if (folderId) params.set("folder", folderId);
    params.set("page", String(p));
    const res = await fetch(`/admin/media/api/lookup?${params.toString()}`, { credentials: "same-origin" });
    if (res.ok) {
      const data = (await res.json()) as { folders: MediaFolder[]; images: MediaRef[]; totalPages: number };
      setFolders(q ? [] : data.folders);
      setImages(data.images);
      setTotalPages(data.totalPages);
    }
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

  // Determine the image's natural pixel dimensions (used to bound the sizing sliders and for the
  // crop dialog's coordinate math). This image is never displayed, only measured, so request the
  // smallest possible transfer — quality doesn't affect the decoded width/height, only the resize
  // (w/h) params would, so a heavily-compressed webp still reports the correct natural size.
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
    img.src = `/image/${value.id}?fmt=webp&q=1`;
    return () => {
      cancelled = true;
    };
  }, [value?.id]);

  // Fetch when the dialog opens, the query changes, or the user navigates folders/pages; debounce
  // search typing, immediate otherwise.
  useEffect(() => {
    if (!isOpen) return;
    const delay = query ? 300 : 0;
    const t = setTimeout(() => fetchImages(query, currentFolderId, page), delay);
    return () => clearTimeout(t);
  }, [isOpen, query, currentFolderId, page, fetchImages]);

  const openDialog = () => {
    setQuery("");
    setFolderPath([{ id: null, name: "Root" }]);
    setPage(1);
    setFolders([]);
    setImages([]);
    setIsOpen(true);
    dialogRef.current?.showModal();
  };

  // Changing the search resets to the first page; a non-empty query also flattens away folders.
  const onQueryChange = (q: string) => {
    setQuery(q);
    setPage(1);
  };

  const openFolder = (folder: MediaFolder) => {
    setFolderPath((path) => [...path, { id: folder.id, name: folder.name }]);
    setPage(1);
  };

  const goToCrumb = (index: number) => {
    setFolderPath((path) => path.slice(0, index + 1));
    setPage(1);
  };

  const select = (img: MediaRef) => {
    onChange({ ...img, width: null, height: null, objectPosition: null, crop: null });
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

  // Escape-key close (or any native dialog close) must also tear down the cropper instance,
  // since it mutates the DOM directly (inserts a cropper-canvas next to the hidden <img>).
  useEffect(() => {
    const dialog = cropDialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      cropperRef.current?.destroy();
      cropperRef.current = null;
    };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, []);

  const openCropDialog = async () => {
    if (!value || !naturalSize || cropOpeningRef.current) return;
    const container = cropContainerRef.current;
    const img = cropImgRef.current;
    if (!container || !img) return;

    const natural = naturalSize;
    cropOpeningRef.current = true;
    try {
      cropperRef.current?.destroy();

      const { width, height } = getCropDisplaySize(natural);
      const { default: CropperCtor } = await import("cropperjs");
      const cropper = new CropperCtor(img, { container, template: buildCropTemplate(width, height) });
      cropperRef.current = cropper;

      const selection = cropper.getCropperSelection();
      const cropperImage = cropper.getCropperImage();
      if (selection && cropperImage) {
        // The library doesn't clamp the selection to the image on its own; reject any move/resize
        // that would push it outside the image's actual rendered rect within the canvas (which may
        // be letterboxed, so this can't just be measured against the canvas's own bounds).
        selection.addEventListener("change", (event) => {
          const { x, y, width: selWidth, height: selHeight } = (event as CustomEvent).detail;
          const t = getCropTransform(cropper, natural);
          if (!t) return;
          const minX = t.offsetX;
          const minY = t.offsetY;
          const maxX = minX + natural.width / t.scaleX;
          const maxY = minY + natural.height / t.scaleY;
          const epsilon = 0.5;
          if (x < minX - epsilon || y < minY - epsilon || x + selWidth > maxX + epsilon || y + selHeight > maxY + epsilon) {
            event.preventDefault();
          }
        });

        cropperImage.$ready(() => {
          fillCropCanvas(cropperImage, width);

          if (value.crop) {
            const t = getCropTransform(cropper, natural);
            if (!t) return;
            const { x1, y1, x2, y2 } = value.crop;
            selection.$change(
              t.offsetX + x1 / t.scaleX,
              t.offsetY + y1 / t.scaleY,
              (x2 - x1) / t.scaleX,
              (y2 - y1) / t.scaleY,
            );
          }
        });
      }

      cropDialogRef.current?.showModal();
    } finally {
      cropOpeningRef.current = false;
    }
  };

  const closeCropDialog = () => {
    cropperRef.current?.destroy();
    cropperRef.current = null;
    cropDialogRef.current?.close();
  };

  const saveCrop = () => {
    const natural = naturalSize;
    const cropper = cropperRef.current;
    if (!value || !natural || !cropper) return;
    const selection = cropper.getCropperSelection();
    if (!selection) return;
    const t = getCropTransform(cropper, natural);
    if (!t) return;
    const x1 = Math.max(0, Math.round((selection.x - t.offsetX) * t.scaleX));
    const y1 = Math.max(0, Math.round((selection.y - t.offsetY) * t.scaleY));
    const x2 = Math.min(natural.width, Math.round((selection.x + selection.width - t.offsetX) * t.scaleX));
    const y2 = Math.min(natural.height, Math.round((selection.y + selection.height - t.offsetY) * t.scaleY));
    onChange({ ...value, crop: { x1, y1, x2, y2 } });
    closeCropDialog();
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
        <button
          type="button"
          onClick={openCropDialog}
          disabled={!value || !naturalSize}
          className="btn btn-outline join-item px-2"
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
            onChange={(e) => onQueryChange(e.target.value)}
            className="input input-bordered w-full mb-4"
            autoFocus
          />

          {!query && folderPath.length > 1 && (
            <div className="flex flex-wrap items-center gap-1 text-sm text-base-content/70 mb-3">
              {folderPath.map((crumb, index) => (
                <div key={crumb.id ?? "root"} className="flex items-center gap-1">
                  {index > 0 && <span aria-hidden="true" className="text-base-content/40">&gt;</span>}
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
          )}

          <div className="min-h-48 max-h-[60vh] overflow-y-auto">
            {fetching ? (
              <div className="flex items-center justify-center py-12">
                <span className="loading loading-spinner loading-lg" />
              </div>
            ) : folders.length === 0 && images.length === 0 ? (
              <p className="text-center text-base-content/50 py-12">No images found</p>
            ) : (
              <>
                {folders.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => openFolder(folder)}
                        className="flex items-center gap-3 rounded-lg border border-base-300 bg-base-100 p-3 text-left transition-colors hover:border-primary hover:bg-base-200 focus:outline-none focus:border-primary"
                      >
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
                          >
                            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                          </svg>
                        </div>
                        <span className="min-w-0 break-words text-sm font-medium">{folder.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {images.length > 0 && (
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
              </>
            )}
          </div>

          {!fetching && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
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
                  src={withCropParams(`/image/${value.id}?fmt=png&w=1000&q=80`, value.crop)}
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

      <dialog ref={cropDialogRef} className="modal">
        <div className="modal-box w-11/12 max-w-4xl">
          <h3 className="font-bold text-lg mb-4">Crop Image</h3>

          {value && (
            <div className="flex justify-center bg-base-200 rounded-lg p-2">
              <div ref={cropContainerRef} className="relative">
                <img
                  ref={cropImgRef}
                  src={withCropParams(`/image/${value.id}?fmt=png&w=1000&q=80`, null)}
                  alt={value.alt}
                  style={{ display: "none" }}
                />
              </div>
            </div>
          )}

          <div className="modal-action">
            <button type="button" className="btn" onClick={closeCropDialog}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={saveCrop}>
              Save
            </button>
          </div>
        </div>
        <button type="button" className="modal-backdrop" onClick={closeCropDialog} aria-label="Close" />
      </dialog>
    </>
  );
}

// Reusable field for content types that need an image field of the same shape used here, so
// items of that type can be bound to by ImagePicker's `image` prop when nested in a card
// template (see bindableFields below and ../data-binding.js).
export const imageField: CustomField<ImageConfig | null> = {
  type: "custom",
  label: "Image",
  render: ({ value, onChange }) => (
    <ImagePickerField value={value} onChange={onChange} />
  ),
};

export type ImageSizeOverride = { width: number | null; height: number | null };

// A cap for the size sliders below. Unlike ImagePickerField's own Sizing section, this control
// isn't attached to any one photo (it's setting a size shared across every item in a
// collection), so there's no natural width/height to bound the slider by — a fixed generous cap
// is used instead.
const SIZE_OVERRIDE_SLIDER_MAX = 2000;

// Same "slider + 100% checkbox" pattern as ImagePickerField's Sizing section, but standalone:
// edits a plain { width, height } pair rather than a full image, for pinning a collection-wide
// size that's independent of whichever image was used to design the card template.
function ImageSizeOverrideField({
  value,
  onChange,
}: {
  value: ImageSizeOverride | null;
  onChange: (value: ImageSizeOverride) => void;
}) {
  const current = value ?? { width: null, height: null };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-base-content/60">Width</span>
          <input
            type="range"
            className="range range-primary w-full"
            value={current.width ?? SIZE_OVERRIDE_SLIDER_MAX}
            min={0}
            max={SIZE_OVERRIDE_SLIDER_MAX}
            disabled={current.width == null}
            onChange={(e) => onChange({ ...current, width: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-base-content/60">100%</span>
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={current.width == null}
            onChange={(e) => onChange({ ...current, width: e.target.checked ? null : SIZE_OVERRIDE_SLIDER_MAX / 2 })}
          />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-base-content/60">Height</span>
          <input
            type="range"
            className="range range-primary w-full"
            value={current.height ?? SIZE_OVERRIDE_SLIDER_MAX}
            min={0}
            max={SIZE_OVERRIDE_SLIDER_MAX}
            disabled={current.height == null}
            onChange={(e) => onChange({ ...current, height: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-base-content/60">100%</span>
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={current.height == null}
            onChange={(e) => onChange({ ...current, height: e.target.checked ? null : SIZE_OVERRIDE_SLIDER_MAX / 2 })}
          />
        </div>
      </div>
    </div>
  );
}

const imageSizeOverrideField: CustomField<ImageSizeOverride | null> = {
  type: "custom",
  render: ({ value, onChange }) => <ImageSizeOverrideField value={value} onChange={onChange} />,
};

const ImagePicker: ComponentConfig<ImagePickerProps> = {
  label: "Image",
  bindableFields: {
    image: {
      label: "Image",
      fieldTypes: ["custom"],
      // The picture itself varies per item, but sizing is usually a design decision — let width
      // and height be pinned to one shared value (set with the same slider/checkbox control used
      // above) instead of varying with whatever size each item's own image happens to have.
      overridable: {
        label: "Size",
        keys: ["width", "height"],
        field: imageSizeOverrideField,
      },
    },
  },
  fields: {
    image: imageField,
  },
  defaultProps: {
    image: null,
  },
  render: ({ image, puck }) => {
    if (!image?.id) {
      return (
        <div className="rounded-lg border-2 border-dashed border-base-300 bg-base-200 p-6 text-center text-base-content/50">
          No image selected
        </div>
      );
    }

    return <ImageDisplay image={image} isEditing={puck.isEditing} />;
  },
};

export default ImagePicker;

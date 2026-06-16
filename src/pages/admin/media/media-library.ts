import { DragDropManager, Draggable, Droppable } from "@dnd-kit/dom";

document.body.dataset.mediaSelectMode = "false";

const deleteConfirmDialog = document.querySelector("#delete-confirm-dialog") as HTMLDialogElement | null;
const deleteConfirmForm = document.querySelector("#delete-confirm-form") as HTMLFormElement | null;
const deleteConfirmSummary = document.querySelector("#delete-confirm-summary") as HTMLElement | null;
const deleteFolderWarning = document.querySelector("#delete-folder-warning") as HTMLElement | null;
const deleteCancelBtn = document.querySelector("#delete-cancel-btn") as HTMLButtonElement | null;

document.querySelector(".select-mode-toggable.btn")?.addEventListener("click", () => {
    if (!deleteConfirmDialog || !deleteConfirmForm) return;

    const checkedMedia = mediaCards.filter((card) => {
        const cb = card.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        return cb?.checked === true;
    });
    const checkedFolders = folderCards.filter((card) => {
        const cb = card.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        return cb?.checked === true;
    });

    if (checkedMedia.length === 0 && checkedFolders.length === 0) return;

    // Build summary text
    const parts: string[] = [];
    if (checkedFolders.length > 0) parts.push(`${checkedFolders.length} folder${checkedFolders.length === 1 ? "" : "s"}`);
    if (checkedMedia.length > 0) parts.push(`${checkedMedia.length} asset${checkedMedia.length === 1 ? "" : "s"}`);
    if (deleteConfirmSummary) deleteConfirmSummary.textContent = `Delete ${parts.join(" and ")}?`;
    if (deleteFolderWarning) deleteFolderWarning.classList.toggle("hidden", checkedFolders.length === 0);

    // Clear previously injected id inputs, keep the currentfolderid hidden input
    deleteConfirmForm.querySelectorAll('input[name="mediaid[]"], input[name="folderid[]"]').forEach((el) => el.remove());

    checkedMedia.forEach((card) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "mediaid[]";
        input.value = card.dataset.id ?? "";
        deleteConfirmForm.append(input);
    });

    checkedFolders.forEach((card) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "folderid[]";
        input.value = card.dataset.id ?? "";
        deleteConfirmForm.append(input);
    });

    deleteConfirmDialog.showModal();
});

deleteCancelBtn?.addEventListener("click", () => deleteConfirmDialog?.close());

document.querySelector("#select-mode-trigger")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const selectModeActive = document.body.dataset.mediaSelectMode !== "true";

    document.body.dataset.mediaSelectMode = selectModeActive ? "true" : "false";
    target.innerText = selectModeActive ? "Unselect" : "Select";
    document.querySelectorAll(".select-mode-toggable").forEach(el => {
        el.classList.toggle("hidden");
        if (el instanceof HTMLInputElement && el.type === "checkbox") {
            el.checked = false;
        }
    });

    document.dispatchEvent(new CustomEvent("media-select-mode-change", {
        detail: { active: selectModeActive }
    }));
});

const uploadInput = document.querySelector("#asset-upload") as HTMLInputElement | null;
const uploadDropzone = document.querySelector("#asset-dropzone") as HTMLElement | null;
const uploadDialog = document.querySelector("#new-image-dialog") as HTMLDialogElement | null;
const imagesConfigDialog = document.querySelector("#new-images-configuration") as HTMLDialogElement | null;
const newImagesForm = document.querySelector("#new-images-form") as HTMLFormElement | null;
const newImagesList = document.querySelector("#new-images-list") as HTMLElement | null;
const newImageItemTemplate = document.querySelector("#new-image-item-template") as HTMLTemplateElement | null;
const newImagesSubmit = document.querySelector("#new-images-submit") as HTMLButtonElement | null;
const mediaCards = Array.from(document.querySelectorAll(".media-item")) as HTMLElement[];
const folderCards = Array.from(document.querySelectorAll(".folder-item")) as HTMLElement[];
let dragActive = false;

let previewObjectUrls: string[] = [];

const clearImageConfigurations = () => {
    previewObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    previewObjectUrls = [];

    if (newImagesList) {
        newImagesList.innerHTML = "";
    }
};

const toDefaultImageText = (filename: string) => {
    const withoutExtension = filename.replace(/\.[^/.]+$/, "");
    return withoutExtension
        .replace(/[\-_]+/g, " ")
        .replace(/\s*\(\d+\)$/g, "")
        .replace(/\s+/g, " ")
        .trim();
};

const createImageConfigurationRows = (files: FileList | null) => {
    if (!newImagesList || !newImageItemTemplate || !newImagesForm) {
        return;
    }

    if (newImagesSubmit) {
        newImagesSubmit.textContent = "Upload";
    }

    clearImageConfigurations();

    if (!files || files.length === 0) {
        return;
    }

    Array.from(files)
        .filter((file) => file.type.startsWith("image/"))
        .forEach((file, index) => {
            const fragment = newImageItemTemplate.content.cloneNode(true) as DocumentFragment;
            const section = fragment.querySelector("[data-image-config]") as HTMLElement | null;
            if (!section) {
                return;
            }

            const titleInput = section.querySelector('input[name="title[]"]') as HTMLInputElement | null;
            const altInput = section.querySelector('input[name="alt[]"]') as HTMLInputElement | null;
            const idInput = section.querySelector('input[name="id[]"]') as HTMLInputElement | null;
            const fileInput = section.querySelector("[data-image-file]") as HTMLInputElement | null;
            const imagePreview = section.querySelector("[data-image-preview]") as HTMLImageElement | null;
            const imageName = section.querySelector("[data-image-name]") as HTMLElement | null;
            const titleLabel = section.querySelector('label[for="image-title-template"]') as HTMLLabelElement | null;
            const altLabel = section.querySelector('label[for="image-alt-template"]') as HTMLLabelElement | null;

            if (idInput) {
                // Upload flow creates new assets, so id[] must be blank.
                idInput.value = "";
            }

            if (titleInput) {
                const titleId = `image-title-${index}`;
                titleInput.id = titleId;
                titleInput.value = toDefaultImageText(file.name);
                if (titleLabel) {
                    titleLabel.setAttribute("for", titleId);
                }
            }

            if (altInput) {
                const altId = `image-alt-${index}`;
                altInput.id = altId;
                altInput.value = toDefaultImageText(file.name);
                if (altLabel) {
                    altLabel.setAttribute("for", altId);
                }
            }

            if (fileInput) {
                const transfer = new DataTransfer();
                transfer.items.add(file);
                fileInput.files = transfer.files;
            }

            if (imagePreview) {
                const objectUrl = URL.createObjectURL(file);
                previewObjectUrls.push(objectUrl);
                imagePreview.src = objectUrl;
            }

            if (imageName) {
                imageName.textContent = file.name;
            }

            newImagesList.append(section);
        });

    if (newImagesList.children.length > 0) {
        uploadDialog?.close();
        imagesConfigDialog?.showModal();
    }
};

if (uploadInput && uploadDropzone) {
    const setDragState = (isActive: boolean) => {
        uploadDropzone.classList.toggle("border-primary", isActive);
        uploadDropzone.classList.toggle("bg-base-200", isActive);
    };

    ["dragenter", "dragover"].forEach((eventName) => {
        uploadDropzone.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragState(true);
        });
    });

    ["dragleave", "dragend"].forEach((eventName) => {
        uploadDropzone.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragState(false);
        });
    });

    uploadDropzone.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragState(false);

        const droppedFiles = event.dataTransfer?.files;
        if (!droppedFiles || droppedFiles.length === 0) {
            return;
        }

        const transfer = new DataTransfer();
        Array.from(droppedFiles).forEach((file) => transfer.items.add(file));
        uploadInput.files = transfer.files;
        uploadInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    uploadInput.addEventListener("change", () => {
        createImageConfigurationRows(uploadInput.files);
    });
}

newImagesForm?.addEventListener("submit", () => {
    // Do not clear configurations here — clearing the DOM before the browser
    // serializes form data would cause all fields to be missing from the POST body.
});

imagesConfigDialog?.addEventListener("close", () => {
    clearImageConfigurations();
    if (uploadInput) {
        uploadInput.value = "";
    }
});

const fileFromMediaCardImage = async (item: Element, id: string): Promise<File | null> => {
    const image = item.querySelector("img") as HTMLImageElement | null;
    if (!image) {
        return null;
    }

    try {
        if (!image.complete) {
            await image.decode();
        }

        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (!width || !height) {
            return null;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
            return null;
        }

        context.drawImage(image, 0, 0, width, height);

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((result) => resolve(result), "image/webp", 0.92);
        });

        if (!blob) {
            return null;
        }

        return new File([blob], `${id}.webp`, { type: blob.type || "image/webp" });
    } catch {
        return null;
    }
};

const getCheckedMediaCards = () => {
    return mediaCards.filter((card) => {
        const checkbox = card.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        return checkbox?.checked === true;
    });
};

const postMoveMediaToFolder = (mediaIds: string[], folderId: string) => {
    if (!folderId || mediaIds.length === 0) {
        return;
    }

    const form = document.createElement("form");
    form.method = "post";
    form.action = "/admin/media/movemediatofolder";
    form.style.display = "none";

    mediaIds.forEach((mediaId) => {
        const mediaInput = document.createElement("input");
        mediaInput.type = "hidden";
        mediaInput.name = "mediaid[]";
        mediaInput.value = mediaId;
        form.append(mediaInput);
    });

    const folderInput = document.createElement("input");
    folderInput.type = "hidden";
    folderInput.name = "folderid";
    folderInput.value = folderId;
    form.append(folderInput);

    document.body.append(form);
    form.submit();
};

const dragDropManager = new DragDropManager();
const draggableInstances: Draggable[] = [];
const droppableInstances: Droppable[] = [];
const activeFolderStates = new Map<HTMLElement, boolean>();
let dragPreviewEl: HTMLDivElement | null = null;
let activeDragMediaIds: string[] = [];
let suppressFolderClickUntil = 0;

const getMediaCardCheckbox = (mediaCard: HTMLElement) => {
    return mediaCard.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
};

const isMediaCardChecked = (mediaCard: HTMLElement) => {
    return getMediaCardCheckbox(mediaCard)?.checked === true;
};

const hasCheckedMediaCards = () => {
    return getCheckedMediaCards().length > 0;
};

const isSelectModeActive = () => {
    return document.body.dataset.mediaSelectMode === "true";
};

const removeDragPreview = () => {
    dragPreviewEl?.remove();
    dragPreviewEl = null;
};

const updateDragPreviewPosition = (event?: Event) => {
    if (!dragPreviewEl) {
        return;
    }

    if (event instanceof PointerEvent || event instanceof MouseEvent) {
        dragPreviewEl.style.left = `${event.clientX + 16}px`;
        dragPreviewEl.style.top = `${event.clientY + 16}px`;
        return;
    }

    dragPreviewEl.style.left = "16px";
    dragPreviewEl.style.top = "16px";
};

const createDragPreview = (mediaIds: string[], nativeEvent?: Event) => {
    removeDragPreview();

    const preview = document.createElement("div");
    preview.className = "pointer-events-none fixed z-[9999] rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm shadow-lg";

    const countLine = document.createElement("p");
    countLine.className = "font-semibold text-base-content";
    countLine.textContent = `${mediaIds.length} asset${mediaIds.length === 1 ? "" : "s"}`;
    preview.append(countLine);

    const sampleTitles = mediaCards
        .filter((card) => mediaIds.includes(card.dataset.id || ""))
        .map((card) => card.dataset.title || card.dataset.id || "")
        .filter((value) => value.length > 0)
        .slice(0, 3);

    if (sampleTitles.length > 0) {
        const detailsLine = document.createElement("p");
        detailsLine.className = "max-w-64 truncate text-xs text-base-content/70";
        detailsLine.textContent = sampleTitles.join(", ");
        preview.append(detailsLine);
    }

    if (mediaIds.length > 3) {
        const extraLine = document.createElement("p");
        extraLine.className = "text-xs text-base-content/60";
        extraLine.textContent = `+${mediaIds.length - 3} more`;
        preview.append(extraLine);
    }

    document.body.append(preview);
    dragPreviewEl = preview;
    updateDragPreviewPosition(nativeEvent);
};

const setFolderDropActive = (folderCard: HTMLElement, isActive: boolean) => {
    folderCard.style.outlineColor = isActive ? "var(--color-primary)" : "transparent";
};

const getDropTargetFolderIdFromNativeEvent = (nativeEvent?: Event) => {
    if (!(nativeEvent instanceof PointerEvent || nativeEvent instanceof MouseEvent)) {
        return "";
    }

    const element = document.elementFromPoint(nativeEvent.clientX, nativeEvent.clientY) as HTMLElement | null;
    const folderCard = element?.closest(".folder-item") as HTMLElement | null;
    return folderCard?.dataset.id || "";
};

const setActiveFolderHighlight = (targetFolderId: string) => {
    folderCards.forEach((folderCard) => {
        const isActive = folderCard.dataset.id === targetFolderId;
        const wasActive = activeFolderStates.get(folderCard) === true;

        if (isActive !== wasActive) {
            activeFolderStates.set(folderCard, isActive);
            setFolderDropActive(folderCard, isActive);
        }
    });
};

const syncDraggableDisabledStates = () => {
    const shouldRequireCheckedSource = hasCheckedMediaCards();

    mediaCards.forEach((mediaCard, index) => {
        const checkbox = getMediaCardCheckbox(mediaCard);
        const draggable = draggableInstances[index];

        if (!draggable) {
            return;
        }

        draggable.disabled = shouldRequireCheckedSource
            ? checkbox?.checked !== true
            : !isSelectModeActive();
    });
};

folderCards.forEach((folderCard) => {
    const folderId = folderCard.dataset.id;
    if (!folderId) {
        return;
    }

    // Keep outline geometry stable to avoid visual flashing when toggling drop highlight.
    folderCard.style.outline = "2px solid transparent";
    folderCard.style.outlineOffset = "2px";

    folderCard.addEventListener("click", (event) => {
        if (dragActive || Date.now() < suppressFolderClickUntil) {
            event.preventDefault();
            event.stopPropagation();
        }
    });

    const droppable = new Droppable({
        id: folderId,
        element: folderCard,
        data: { folderId }
    }, dragDropManager);

    droppableInstances.push(droppable);
    activeFolderStates.set(folderCard, false);
});

mediaCards.forEach((mediaCard) => {
    const mediaId = mediaCard.dataset.id;
    if (!mediaId) {
        return;
    }

    const draggable = new Draggable({
        id: mediaId,
        element: mediaCard,
        data: { mediaId },
        feedback: "none"
    }, dragDropManager);

    draggableInstances.push(draggable);

    const checkbox = getMediaCardCheckbox(mediaCard);

    checkbox?.addEventListener("change", () => {
        syncDraggableDisabledStates();
    });

    mediaCard.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.addEventListener("pointerdown", (event) => {
            event.stopPropagation();
        });
    });
});

syncDraggableDisabledStates();

document.addEventListener("media-select-mode-change", () => {
    syncDraggableDisabledStates();
});

dragDropManager.monitor.addEventListener("beforedragstart", (event) => {
    const sourceId = event.operation.source?.id?.toString() || "";
    const sourceCard = mediaCards.find((card) => card.dataset.id === sourceId);

    if (!sourceCard) {
        event.preventDefault();
        return;
    }

    const checkedMediaIds = getCheckedMediaCards()
        .map((card) => card.dataset.id || "")
        .filter((value): value is string => value.length > 0);

    if (checkedMediaIds.length === 0 && !isSelectModeActive()) {
        event.preventDefault();
        return;
    }

    if (checkedMediaIds.length > 0 && !isMediaCardChecked(sourceCard)) {
        event.preventDefault();
        return;
    }

    activeDragMediaIds = checkedMediaIds.includes(sourceId)
        ? checkedMediaIds
        : [sourceId];
});

dragDropManager.monitor.addEventListener("dragstart", (event) => {
    dragActive = true;

    const sourceId = event.operation.source?.id?.toString() || "";
    if (!activeDragMediaIds.length && sourceId) {
        activeDragMediaIds = [sourceId];
    }

    createDragPreview(activeDragMediaIds, event.nativeEvent);
});

dragDropManager.monitor.addEventListener("dragmove", (event) => {
    updateDragPreviewPosition(event.nativeEvent);

    const pointerFolderId = getDropTargetFolderIdFromNativeEvent(event.nativeEvent);
    setActiveFolderHighlight(pointerFolderId);
});

dragDropManager.monitor.addEventListener("dragover", (event) => {
    const targetId = event.operation.target?.id?.toString() || "";
    setActiveFolderHighlight(targetId);
});

dragDropManager.monitor.addEventListener("dragend", (event) => {
    dragActive = false;
    removeDragPreview();

    folderCards.forEach((folderCard) => {
        activeFolderStates.set(folderCard, false);
        setFolderDropActive(folderCard, false);
    });

    if (event.canceled) {
        return;
    }

    const sourceId = event.operation.source?.id?.toString() || "";
    const targetFolderId = event.operation.target?.id?.toString() || getDropTargetFolderIdFromNativeEvent(event.nativeEvent);
    if (!sourceId || !targetFolderId) {
        activeDragMediaIds = [];
        return;
    }

    const mediaIdsToMove = activeDragMediaIds.length > 0
        ? activeDragMediaIds
        : [sourceId];

    activeDragMediaIds = [];
    suppressFolderClickUntil = Date.now() + 400;
    postMoveMediaToFolder(mediaIdsToMove, targetFolderId);
});

window.addEventListener("pagehide", () => {
    removeDragPreview();
    draggableInstances.forEach((instance) => instance.destroy());
    droppableInstances.forEach((instance) => instance.destroy());
    dragDropManager.destroy();
}, { once: true });

document.querySelectorAll(".media-item").forEach((item) => {
    item.addEventListener("click", async (event) => {
        if (dragActive) {
            return;
        }

        if (isSelectModeActive()) {
            const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event("change", { bubbles: true }));
            }
            return;
        }

        if ((event.target as HTMLElement).classList.contains("checkbox")) {
            // Let checkbox clicks pass through for selection without opening the config dialog.
            return;
        }
        event.preventDefault();

        const title = item.getAttribute("data-title") || "";
        const alt = item.getAttribute("data-alt") || "";
        const id = item.getAttribute("data-id") || "";

        if (!id) {
            return;
        }

        try {
            let file = await fileFromMediaCardImage(item, id);

            if (!file) {
                const response = await fetch(`/image/${id}`);
                if (!response.ok) {
                    return;
                }

                const blob = await response.blob();
                const extension = blob.type.split("/")[1] || "bin";
                file = new File([blob], `${id}.${extension}`, { type: blob.type || "application/octet-stream" });
            }

            const transfer = new DataTransfer();
            transfer.items.add(file);
            createImageConfigurationRows(transfer.files);

            const titleInput = newImagesList?.querySelector('input[name="title[]"]') as HTMLInputElement | null;
            const altInput = newImagesList?.querySelector('input[name="alt[]"]') as HTMLInputElement | null;
            const idInput = newImagesList?.querySelector('input[name="id[]"]') as HTMLInputElement | null;

            if (titleInput) {
                titleInput.value = title;
            }

            if (altInput) {
                altInput.value = alt;
            }

            if (idInput) {
                idInput.value = id;
            }

            if (newImagesSubmit) {
                newImagesSubmit.textContent = "Update";
            }
        } catch {
            // Keep the UI silent on network failures; user can retry.
        }
    });
});

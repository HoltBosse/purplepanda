const uploadInput = document.querySelector("#document-upload") as HTMLInputElement | null;
const uploadDropzone = document.querySelector("#document-dropzone") as HTMLElement | null;
const uploadDialog = document.querySelector("#new-document-dialog") as HTMLDialogElement | null;
const documentsConfigDialog = document.querySelector("#new-documents-configuration") as HTMLDialogElement | null;
const newDocumentsList = document.querySelector("#new-documents-list") as HTMLElement | null;
const newDocumentItemTemplate = document.querySelector("#new-document-item-template") as HTMLTemplateElement | null;

const toDefaultDocumentTitle = (filename: string) => {
    const withoutExtension = filename.replace(/\.[^/.]+$/, "");
    return withoutExtension
        .replace(/[-_]+/g, " ")
        .replace(/\s*\(\d+\)$/g, "")
        .replace(/\s+/g, " ")
        .trim();
};

const clearDocumentConfigurations = () => {
    if (newDocumentsList) {
        newDocumentsList.innerHTML = "";
    }
};

const createDocumentConfigurationRows = (files: FileList | null) => {
    if (!newDocumentsList || !newDocumentItemTemplate) {
        return;
    }

    clearDocumentConfigurations();

    if (!files || files.length === 0) {
        return;
    }

    Array.from(files).forEach((file, index) => {
        const fragment = newDocumentItemTemplate.content.cloneNode(true) as DocumentFragment;
        const section = fragment.querySelector("[data-document-config]") as HTMLElement | null;
        if (!section) {
            return;
        }

        const titleInput = section.querySelector('input[name="title[]"]') as HTMLInputElement | null;
        const fileInput = section.querySelector("[data-document-file]") as HTMLInputElement | null;
        const documentName = section.querySelector("[data-document-name]") as HTMLElement | null;
        const titleLabel = section.querySelector('label[for="document-title-template"]') as HTMLLabelElement | null;

        if (titleInput) {
            const titleId = `document-title-${index}`;
            titleInput.id = titleId;
            titleInput.value = toDefaultDocumentTitle(file.name);
            if (titleLabel) {
                titleLabel.setAttribute("for", titleId);
            }
        }

        if (fileInput) {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            fileInput.files = transfer.files;
        }

        if (documentName) {
            documentName.textContent = file.name;
        }

        newDocumentsList.append(section);
    });

    if (newDocumentsList.children.length > 0) {
        uploadDialog?.close();
        documentsConfigDialog?.showModal();
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
        Array.from(droppedFiles).forEach((file) => { transfer.items.add(file); });
        uploadInput.files = transfer.files;
        uploadInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    uploadInput.addEventListener("change", () => {
        createDocumentConfigurationRows(uploadInput.files);
    });
}

documentsConfigDialog?.addEventListener("close", () => {
    clearDocumentConfigurations();
    if (uploadInput) {
        uploadInput.value = "";
    }
});

const editDialog = document.querySelector("#edit-document-dialog") as HTMLDialogElement | null;
const editIdInput = document.querySelector("#edit-doc-id") as HTMLInputElement | null;
const editTitleInput = document.querySelector("#edit-doc-title") as HTMLInputElement | null;
const editFileInput = document.querySelector("#edit-doc-file") as HTMLInputElement | null;

document.querySelectorAll<HTMLButtonElement>("button[data-edit-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
        if (editIdInput) editIdInput.value = btn.dataset.editId ?? "";
        if (editTitleInput) editTitleInput.value = btn.dataset.editTitle ?? "";
        if (editFileInput) editFileInput.value = "";
        editDialog?.showModal();
    });
});

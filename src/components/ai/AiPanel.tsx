import type { Config, Data, Plugin } from "@puckeditor/core";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import { type ClipboardEvent, type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type * as z from "zod";
import { buildRootCatalog } from "../../puck/ai/catalog.js";
import { rootSchemaName } from "../../puck/ai/root-schemas.js";
import { ArrowUp, Paperclip, Sparkles, Square, Trash2, X } from "../../puck/icons.js";
import type { Location } from "../../puck/index.js";
import { sanitizeHtml } from "../../puck/sanitize-html.js";
import { sanitizeRichtextData } from "../../puck/sanitize-richtext.js";
import { getInjectedDisabledComponents } from "../../puck/site-components.js";
import { validateContentTree } from "../../puck/validate-content.js";

// The editors' "AI" tab: a chat with an assistant that edits the open document. Each message
// goes to /admin/ai/chat (see puck/ai/harness.server.ts) with the document, the editor's
// component catalog and any attached images; the edited document comes back and is applied as
// one change, so Puck's undo takes it back in one step.

const ENDPOINT = "/admin/ai/chat";
const MAX_ATTACHMENTS = 4;
// Images are scaled down before the model sees them: past this the model gains little detail
// and each image costs more tokens. The original is still kept for saving to the media library.
const PREVIEW_MAX_EDGE = 1024;
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
// Earlier turns are replayed as text so follow-ups ("make it shorter") work; only the most recent
// ones, since every replayed turn is paid for again.
const HISTORY_TURNS = 8;
const ACCEPTED_IMAGES = "image/png,image/jpeg,image/webp,image/gif";

const SUGGESTIONS = [
  "Build a landing page with a hero, three feature cards and a call to action",
  "Rewrite the selected text to be shorter and clearer",
  "Add an FAQ section with five common questions",
  "Add an image from the media library to the top of the page",
];

type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number };

type ServerEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "data"; data: Data }
  | { type: "usage"; usage: Usage }
  | { type: "error"; message: string };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: string[];
  steps?: string[];
  usage?: Usage;
  error?: boolean;
  pending?: boolean;
  note?: string;
};

type PendingAttachment = { id: string; file: File; url: string };

// Validation failures beyond this many aren't worth the tokens; the assistant can fix the first
// batch and the author can ask again.
const MAX_ATTENTION_ITEMS = 40;

// What the panel needs from its editor, read fresh on every send.
export type AiEditorContext = {
  config: Config;
  // The editor's page-settings schema (see PuckEditor's rootPropsSchema prop).
  rootPropsSchema: ((props: Record<string, unknown>) => z.ZodTypeAny) | undefined;
};

const useTypedPuck = createUsePuck();

function formatCost(usd: number): string {
  return usd < 0.01 ? `<$0.01` : `$${usd.toFixed(2)}`;
}

function formatTokens(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

async function makePreview(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  // JPEG has no transparency; paint it onto white rather than black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode image"))), "image/jpeg", 0.85),
  );
}

function imageFiles(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const files: File[] = [];
  for (const item of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = item instanceof File ? item : item.kind === "file" ? item.getAsFile() : null;
    if (file && ACCEPTED_IMAGES.split(",").includes(file.type)) files.push(file);
  }
  return files;
}

function AiPanel({ getEditor, location }: { getEditor: () => AiEditorContext; location: Location }) {
  const getPuck = useGetPuck();
  const selectedType = useTypedPuck((state) => state.selectedItem?.type as string | undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const sessionCost = messages.reduce((sum, message) => sum + (message.usage?.costUsd ?? 0), 0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls whenever the transcript changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    setAttachments((current) => [
      ...current,
      ...files.slice(0, MAX_ATTACHMENTS - current.length).map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) })),
    ]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  };

  const updateMessage = (id: string, update: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) => current.map((message) => (message.id === id ? update(message) : message)));
  };

  const applyData = (data: Data, snapshot: Data): string | undefined => {
    const puck = getPuck();
    if (puck.appState.data !== snapshot && !window.confirm("The page changed while the assistant was working. Replace it with the assistant's version? (You can undo this.)")) {
      return "Not applied — the page changed while the assistant was working.";
    }
    puck.dispatch({ type: "setData", data: sanitizeRichtextData(getEditor().config, data, sanitizeHtml) });
    return undefined;
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;

    const puck = getPuck();
    const snapshot = puck.appState.data;
    const selectedId = (puck.selectedItem?.props as { id?: string } | undefined)?.id ?? null;
    const sending = attachments;
    const history = messages
      .filter((m) => !m.error && !m.pending && m.text.trim())
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 4000) }));
    while (history[0]?.role === "assistant") history.shift();

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: message, images: sending.map((a) => a.url) };
    const replyId = crypto.randomUUID();
    setMessages((current) => [...current, userMessage, { id: replyId, role: "assistant", text: "", steps: [], pending: true }]);
    setInput("");
    setAttachments([]);
    setBusy(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const { config, rootPropsSchema } = getEditor();
      const disabled = getInjectedDisabledComponents();
      // The same check behind the editor's "fields need attention" badge, so the assistant can be
      // asked to fix exactly those.
      const attention = validateContentTree(config, snapshot, { rootPropsSchema, disabledComponents: disabled }).slice(0, MAX_ATTENTION_ITEMS);
      const form = new FormData();
      const previews = await Promise.all(sending.map((a) => makePreview(a.file)));
      for (const [i, attachment] of sending.entries()) {
        form.append("preview[]", previews[i] as Blob, "preview.jpg");
        form.append("original[]", attachment.file.size <= MAX_ORIGINAL_BYTES ? attachment.file : new Blob([]), attachment.file.name);
      }
      form.append(
        "payload",
        JSON.stringify({
          message,
          location,
          // Only the page settings: the server describes the components itself.
          rootCatalog: buildRootCatalog(config),
          rootSchema: rootSchemaName(rootPropsSchema),
          attention,
          data: JSON.stringify(snapshot),
          selectedId,
          history,
          attachmentNames: sending.map((a) => a.file.name || "image"),
        }),
      );

      const response = await fetch(ENDPOINT, { method: "POST", body: form, signal: abort.signal });
      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => ({ error: `Request failed (${response.status}).` }));
        throw new Error((error as { error?: string }).error ?? "Request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = (event: ServerEvent) => {
        switch (event.type) {
          case "status":
            updateMessage(replyId, (m) => ({ ...m, steps: [...(m.steps ?? []), event.text] }));
            break;
          case "data": {
            const note = applyData(event.data, snapshot);
            if (note) updateMessage(replyId, (m) => ({ ...m, note }));
            break;
          }
          case "text":
            updateMessage(replyId, (m) => ({ ...m, text: event.text }));
            break;
          case "usage":
            updateMessage(replyId, (m) => ({ ...m, usage: event.usage }));
            break;
          case "error":
            updateMessage(replyId, (m) => ({ ...m, text: event.message, error: true }));
            break;
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) handle(JSON.parse(line) as ServerEvent);
          newline = buffer.indexOf("\n");
        }
      }
      updateMessage(replyId, (m) => ({ ...m, pending: false, text: m.text || (m.error ? m.text : "No response.") }));
    } catch (error) {
      const aborted = abort.signal.aborted;
      updateMessage(replyId, (m) => ({
        ...m,
        pending: false,
        error: !aborted,
        text: aborted ? "Stopped." : error instanceof Error ? error.message : "Something went wrong.",
      }));
    } finally {
      abortRef.current = null;
      setBusy(false);
      textareaRef.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(input);
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = imageFiles(event.clipboardData.items);
    if (files.length) {
      event.preventDefault();
      addFiles(files);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const files = imageFiles(event.dataTransfer.files);
    if (!files.length) return;
    event.preventDefault();
    setDragging(false);
    addFiles(files);
  };

  return (
    <section
      data-ai-panel
      aria-label="AI assistant"
      className={`flex h-full min-h-0 flex-col text-sm ${dragging ? "outline-2 -outline-offset-4 outline-dashed outline-primary" : ""}`}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2 border-b border-base-300 px-3 py-2">
        <Sparkles size={16} className="text-primary" />
        <span className="font-semibold">AI assistant</span>
        <span className="ml-auto text-xs text-base-content/60" title="Estimated cost of this conversation">
          {sessionCost > 0 ? formatCost(sessionCost) : ""}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          title="Clear conversation"
          aria-label="Clear conversation"
          disabled={busy || messages.length === 0}
          onClick={() => setMessages([])}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-base-content/70">
              Describe what you want and the assistant will edit this page for you. Attach or paste screenshots and images to work from. Every change can be undone.
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rounded-box border border-base-300 px-3 py-2 text-left text-xs hover:bg-base-200"
                onClick={() => void send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} data-ai-message={message.role} className={message.role === "user" ? "self-end max-w-[90%]" : "max-w-full"}>
              {message.images?.length ? (
                <div className="mb-1 flex flex-wrap justify-end gap-1">
                  {message.images.map((url) => (
                    <img key={url} src={url} alt="" className="size-12 rounded object-cover" />
                  ))}
                </div>
              ) : null}
              {message.role === "user" ? (
                <div className="whitespace-pre-wrap rounded-box bg-primary px-3 py-2 text-primary-content">{message.text}</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {message.steps?.length ? (
                    <ul className="flex flex-col gap-0.5 text-xs text-base-content/60">
                      {message.steps.map((step, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: steps only ever append
                        <li key={i}>· {step}</li>
                      ))}
                    </ul>
                  ) : null}
                  {message.pending && !message.text ? <span className="loading loading-dots loading-sm text-base-content/60" /> : null}
                  {message.text ? (
                    <div className={`whitespace-pre-wrap ${message.error ? "text-error" : ""}`}>{message.text}</div>
                  ) : null}
                  {message.note ? <div className="text-xs text-warning">{message.note}</div> : null}
                  {message.usage ? (
                    <div
                      className="text-[11px] text-base-content/50"
                      title={`${message.usage.inputTokens} input, ${message.usage.cacheReadTokens} cached, ${message.usage.cacheWriteTokens} cache-write, ${message.usage.outputTokens} output tokens`}
                    >
                      {formatTokens(message.usage.inputTokens + message.usage.cacheReadTokens + message.usage.cacheWriteTokens)} in · {formatTokens(message.usage.outputTokens)} out ·{" "}
                      {formatCost(message.usage.costUsd)}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-base-300 p-2">
        {attachments.length ? (
          <div className="flex flex-wrap gap-1">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="relative">
                <img src={attachment.url} alt={attachment.file.name} className="size-12 rounded object-cover" />
                <button
                  type="button"
                  className="btn btn-circle btn-xs absolute -right-1 -top-1"
                  aria-label={`Remove ${attachment.file.name}`}
                  onClick={() => removeAttachment(attachment.id)}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {selectedType ? <div className="text-xs text-base-content/60">Selected: {selectedType}</div> : null}
        <textarea
          ref={textareaRef}
          className="textarea textarea-bordered textarea-sm min-h-16 w-full resize-y"
          placeholder="Ask for a change…"
          value={input}
          rows={3}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGES}
            multiple
            hidden
            onChange={(event) => {
              addFiles(imageFiles(event.target.files));
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            title="Attach images"
            aria-label="Attach images"
            disabled={busy || attachments.length >= MAX_ATTACHMENTS}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={16} />
          </button>
          <span className="text-[11px] text-base-content/50" title="Shift+Enter for a new line">Enter to send</span>
          {busy ? (
            <button type="button" className="btn btn-sm btn-square ml-auto" title="Stop" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
              <Square size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm btn-square ml-auto"
              title="Send"
              aria-label="Send"
              disabled={!input.trim()}
              onClick={() => void send(input)}
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// Puck mounts a plugin's render as a component, so a new plugin object would remount the panel
// and lose the conversation. The editor's config and schema are therefore read through a getter,
// letting the editor create the plugin once while still handing the panel their latest values.
export function createAiPlugin(getEditor: () => AiEditorContext, location: Location): Plugin {
  return {
    name: "ai",
    label: "AI",
    icon: <Sparkles />,
    render: () => <AiPanel getEditor={getEditor} location={location} />,
  };
}

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Columns2, FileText, GripVertical, Loader2, MessageCircle, SendHorizontal, Square } from "lucide-react";
import { ChatMessage, Citation, WorkspaceDocument } from "../../types";
import { documentStatusLabel, isProcessingStatus } from "./status";
import type { PdfSelectionAction } from "./PdfSelectionToolbar";

const PdfViewer = lazy(() => import("./PdfViewer").then((module) => ({ default: module.PdfViewer })));

interface DocumentWorkspaceProps {
  document: WorkspaceDocument;
  messages: ChatMessage[];
  isLoading?: boolean;
  isChatLoading?: boolean;
  onSendMessage?: (message: string) => Promise<void> | void;
  onCancelMessage?: () => void;
}

const suggestedPrompts = [
  "Summarize this document.",
  "What are the key takeaways?",
  "List action items.",
  "What should I pay attention to?"
];
const MAX_SELECTED_TEXT_CHARS = 4000;
const CHAT_WIDTH_STORAGE_KEY = "mychatpdf:workspace-chat-width";
const VIEW_MODE_STORAGE_KEY = "mychatpdf:workspace-view-mode";
const DEFAULT_CHAT_WIDTH_PERCENT = 42;
const MIN_CHAT_PANEL_WIDTH = 360;
const MIN_PDF_PANEL_WIDTH = 420;
const RESIZER_WIDTH = 18;
const RESIZER_KEYBOARD_STEP = 3;

type WorkspaceViewMode = "pdf" | "split" | "chat";

export function DocumentWorkspace({
  document,
  messages,
  isLoading = false,
  isChatLoading = false,
  onSendMessage,
  onCancelMessage
}: DocumentWorkspaceProps) {
  const documentPageCount = document.pageCount ?? 1;
  const [activePage, setActivePage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [viewerPageCount, setViewerPageCount] = useState(documentPageCount);
  const [activeMobilePane, setActiveMobilePane] = useState<"pdf" | "chat">("pdf");
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [pdfScrollRequestId, setPdfScrollRequestId] = useState(0);
  const [workspaceViewMode, setWorkspaceViewMode] = useState<WorkspaceViewMode>(() => readWorkspaceViewMode());
  const [chatWidthPercent, setChatWidthPercent] = useState(() => readChatWidthPercent());
  const [isResizingWorkspace, setIsResizingWorkspace] = useState(false);
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const workspaceBodyRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const totalPages = Math.max(1, documentPageCount, viewerPageCount);
  const isReady = document.status === "ready";
  const canSend = isReady && draft.trim().length > 0 && !isGenerating;
  const isSplitView = workspaceViewMode === "split";
  const showPdfOnDesktop = workspaceViewMode !== "chat";
  const showChatOnDesktop = workspaceViewMode !== "pdf";
  const showPdfOnMobile = workspaceViewMode === "pdf" || (isSplitView && activeMobilePane === "pdf");
  const showChatOnMobile = workspaceViewMode === "chat" || (isSplitView && activeMobilePane === "chat");
  const workspaceBodyStyle: CSSProperties | undefined = isSplitView
    ? {
        gridTemplateColumns: `minmax(${MIN_PDF_PANEL_WIDTH}px, 1fr) ${RESIZER_WIDTH}px minmax(${MIN_CHAT_PANEL_WIDTH}px, ${chatWidthPercent}%)`
      }
    : undefined;

  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  );
  const streamingAssistant = isGenerating ? [...orderedMessages].reverse().find((message) => message.role === "assistant") : undefined;
  const activeSource = useMemo(() => {
    if (!activeSourceId) {
      return undefined;
    }

    return orderedMessages.flatMap((message) => message.sources ?? []).find((source) => source.sourceId === activeSourceId);
  }, [activeSourceId, orderedMessages]);

  async function sendMessage(message: string) {
    if (!isReady || !message.trim() || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setDraft("");
    try {
      await onSendMessage?.(message.trim());
    } finally {
      setIsGenerating(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function cancelMessage() {
    onCancelMessage?.();
    setIsGenerating(false);
  }

  function changeWorkspaceViewMode(nextMode: WorkspaceViewMode) {
    setWorkspaceViewMode(nextMode);
    if (nextMode === "pdf") {
      setActiveMobilePane("pdf");
      return;
    }

    if (nextMode === "chat") {
      setActiveMobilePane("chat");
    }
  }

  function askAboutSelection(action: PdfSelectionAction, selectedText: string, pageNumber: number) {
    changeWorkspaceViewMode("split");
    setActiveMobilePane("chat");
    if (action === "ask") {
      setDraft((currentDraft) => appendSelectionQuestionDraft(currentDraft, selectedText, pageNumber));
      window.setTimeout(() => {
        const composer = composerRef.current;
        composer?.focus();
        composer?.setSelectionRange(composer.value.length, composer.value.length);
      }, 0);
      return;
    }

    void sendMessage(buildSelectionPrompt(action, selectedText, pageNumber));
  }

  function jumpToPage(page: number, sourceId?: string) {
    setActivePage(Math.min(totalPages, Math.max(1, page)));
    setActiveSourceId(sourceId ?? null);
    changeWorkspaceViewMode("split");
    setActiveMobilePane("pdf");
    setPdfScrollRequestId((current) => current + 1);
  }

  const updateVisiblePage = useCallback(
    (page: number) => {
      setActivePage(Math.min(totalPages, Math.max(1, page)));
    },
    [totalPages]
  );

  const updateTotalPages = useCallback((pageCount: number) => {
    setViewerPageCount(Math.max(1, pageCount));
  }, []);

  const updateChatWidthFromPointer = useCallback((clientX: number) => {
    const workspaceBody = workspaceBodyRef.current;
    if (!workspaceBody) {
      return;
    }

    const rect = workspaceBody.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const minPercent = (MIN_CHAT_PANEL_WIDTH / rect.width) * 100;
    const maxPercent = ((rect.width - MIN_PDF_PANEL_WIDTH - RESIZER_WIDTH) / rect.width) * 100;
    const nextPercent = ((rect.right - clientX) / rect.width) * 100;
    setChatWidthPercent(roundPercent(clampNumber(nextPercent, minPercent, maxPercent)));
  }, []);

  function startWorkspaceResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isSplitView) {
      return;
    }

    event.preventDefault();
    setIsResizingWorkspace(true);
    updateChatWidthFromPointer(event.clientX);
  }

  function resizeWorkspaceFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!isSplitView) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setChatWidthPercent((current) => clampChatWidthPercent(current + RESIZER_KEYBOARD_STEP, workspaceBodyRef.current));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setChatWidthPercent((current) => clampChatWidthPercent(current - RESIZER_KEYBOARD_STEP, workspaceBodyRef.current));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setChatWidthPercent((current) => clampChatWidthPercent(0, workspaceBodyRef.current) || current);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setChatWidthPercent((current) => clampChatWidthPercent(100, workspaceBodyRef.current) || current);
    }
  }

  useEffect(() => {
    setViewerPageCount(documentPageCount);
    setActivePage(1);
    setActiveSourceId(null);
    setPdfScrollRequestId(0);
  }, [document.id, documentPageCount]);

  useEffect(() => {
    writeWorkspaceViewMode(workspaceViewMode);
  }, [workspaceViewMode]);

  useEffect(() => {
    writeChatWidthPercent(chatWidthPercent);
  }, [chatWidthPercent]);

  useEffect(() => {
    if (!isSplitView) {
      return;
    }

    function clampStoredWidth() {
      setChatWidthPercent((current) => clampChatWidthPercent(current, workspaceBodyRef.current));
    }

    clampStoredWidth();
    window.addEventListener("resize", clampStoredWidth);
    return () => window.removeEventListener("resize", clampStoredWidth);
  }, [isSplitView]);

  useEffect(() => {
    if (!isResizingWorkspace) {
      return;
    }

    const previousCursor = window.document.body.style.cursor;
    const previousUserSelect = window.document.body.style.userSelect;
    window.document.body.style.cursor = "col-resize";
    window.document.body.style.userSelect = "none";

    function onPointerMove(event: PointerEvent) {
      updateChatWidthFromPointer(event.clientX);
    }

    function stopResize() {
      setIsResizingWorkspace(false);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("blur", stopResize, { once: true });

    return () => {
      window.document.body.style.cursor = previousCursor;
      window.document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("blur", stopResize);
    };
  }, [isResizingWorkspace, updateChatWidthFromPointer]);

  useEffect(() => {
    const scrollContainer = chatScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight });
  }, [orderedMessages, isGenerating]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-mist">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sea">Workspace</p>
            <p className="truncate text-sm font-medium text-slate-600">{document.originalFilename}</p>
          </div>
          <WorkspaceViewControls mode={workspaceViewMode} onModeChange={changeWorkspaceViewMode} />
        </div>
      </div>

      {isSplitView ? (
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div role="tablist" aria-label="Document workspace panes" className="grid grid-cols-2 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              role="tab"
              aria-selected={activeMobilePane === "pdf"}
              onClick={() => setActiveMobilePane("pdf")}
              className={`min-h-10 rounded px-3 text-sm font-semibold ${activeMobilePane === "pdf" ? "bg-white text-ink shadow-sm" : "text-slate-600"}`}
            >
              PDF
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeMobilePane === "chat"}
              onClick={() => setActiveMobilePane("chat")}
              className={`min-h-10 rounded px-3 text-sm font-semibold ${activeMobilePane === "chat" ? "bg-white text-ink shadow-sm" : "text-slate-600"}`}
            >
              Chat
            </button>
          </div>
        </div>
      ) : null}

      <div
        ref={workspaceBodyRef}
        className={`min-h-0 flex-1 overflow-hidden ${isSplitView ? "lg:grid" : ""}`}
        style={workspaceBodyStyle}
      >
        <div
          className={`${showPdfOnMobile ? "block" : "hidden"} ${
            showPdfOnDesktop ? "lg:block" : "lg:hidden"
          } h-full min-h-0 bg-slate-100 ${showChatOnDesktop && !isSplitView ? "lg:border-r lg:border-slate-200" : ""}`}
        >
          <Suspense fallback={<PdfViewerFallback />}>
            <PdfViewer
              document={document}
              activePage={activePage}
              totalPages={totalPages}
              zoom={zoom}
              scrollRequestId={pdfScrollRequestId}
              activeSource={activeSource}
              onPageChange={jumpToPage}
              onTotalPagesChange={updateTotalPages}
              onVisiblePageChange={updateVisiblePage}
              onZoomChange={setZoom}
              onSelectionAction={askAboutSelection}
              isSelectionActionDisabled={!isReady || isGenerating}
            />
          </Suspense>
        </div>

        {isSplitView ? (
          <WorkspaceResizeHandle
            chatWidthPercent={chatWidthPercent}
            isResizing={isResizingWorkspace}
            onKeyDown={resizeWorkspaceFromKeyboard}
            onPointerDown={startWorkspaceResize}
          />
        ) : null}

        <div
          className={`${showChatOnMobile ? "flex" : "hidden"} ${
            showChatOnDesktop ? "lg:flex" : "lg:hidden"
          } h-full min-h-0 flex-col bg-white`}
        >
          <header className="shrink-0 border-b border-slate-200 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sea">Document chat</p>
            <h1 className="mt-1 truncate text-xl font-semibold text-ink">{document.originalFilename}</h1>
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
              {documentStatusLabel(document.status)}
            </p>
            <ProcessingProgress status={document.status} />
            {!isLoading && document.status === "failed" ? (
              <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {document.failureMessage ?? "Processing failed. Retry or delete this document."}
              </p>
            ) : !isLoading && !isReady ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Questions unlock when processing finishes. If extraction fails, retry or delete this document.
              </p>
            ) : null}
          </header>

          <div ref={chatScrollRef} className="scrollbar-soft min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {isReady && orderedMessages.length > 0 ? (
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    disabled={isGenerating}
                    className="min-h-11 rounded-md border border-slate-200 px-3 py-2 text-left text-sm font-medium text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="space-y-4">
              {isChatLoading && orderedMessages.length === 0 ? <ChatLoadingSkeleton /> : null}

              {!isChatLoading && orderedMessages.length === 0 ? (
                isReady ? (
                  <ChatWelcomeCard
                    documentName={document.originalFilename}
                    prompts={suggestedPrompts}
                    disabled={isGenerating}
                    onPromptSelect={sendMessage}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                    The PDF is being prepared. Chat will unlock as soon as text extraction and indexing finish.
                  </div>
                )
              ) : null}

              {orderedMessages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-lg border px-4 py-3 ${
                    message.role === "user" ? "ml-auto max-w-[88%] border-ink bg-ink text-white" : "mr-auto max-w-[92%] border-slate-200 bg-white text-ink"
                  }`}
                >
                  {message.role === "assistant" && !message.content && message.id === streamingAssistant?.id ? (
                    <p className="inline-flex items-center gap-2 text-sm leading-6 text-slate-600">
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      Drafting grounded answer...
                    </p>
                  ) : (
                    <FormattedChatMessage
                      activeSourceId={activeSourceId}
                      content={message.content}
                      isStreaming={message.id === streamingAssistant?.id && Boolean(message.content)}
                      role={message.role}
                      sources={message.sources ?? []}
                      onOpenPage={(page, sourceId) => jumpToPage(page, sourceId)}
                    />
                  )}
                </article>
              ))}

              {isGenerating && !streamingAssistant ? (
                <div
                  role="status"
                  aria-label="Generating answer"
                  className="mr-auto inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                >
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  Generating grounded answer...
                </div>
              ) : null}
            </div>
          </div>

          <form onSubmit={onSubmit} className="shrink-0 border-t border-slate-200 bg-white p-4">
            <label htmlFor="chat-composer" className="sr-only">
              Ask this document
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="chat-composer"
                ref={composerRef}
                aria-label="Ask this document"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={!isReady || isGenerating}
                rows={3}
                placeholder={isReady ? "Ask this document..." : "Waiting for processing to finish..."}
                className="min-h-24 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 text-ink disabled:bg-slate-100"
              />
              {isGenerating ? (
                <button
                  type="button"
                  aria-label="Stop generating"
                  onClick={cancelMessage}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-ink hover:bg-slate-50"
                >
                  <Square size={16} fill="currentColor" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={!canSend}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-sea text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <SendHorizontal size={18} aria-hidden="true" />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

const workspaceViewOptions = [
  { mode: "pdf" as const, label: "PDF only", Icon: FileText },
  { mode: "split" as const, label: "PDF and chat", Icon: Columns2 },
  { mode: "chat" as const, label: "Chat only", Icon: MessageCircle }
];

function WorkspaceViewControls({
  mode,
  onModeChange
}: {
  mode: WorkspaceViewMode;
  onModeChange: (mode: WorkspaceViewMode) => void;
}) {
  return (
    <div role="group" aria-label="Workspace view" className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
      {workspaceViewOptions.map(({ mode: optionMode, label, Icon }) => {
        const isActive = mode === optionMode;

        return (
          <button
            key={optionMode}
            type="button"
            aria-label={label}
            aria-pressed={isActive}
            title={label}
            onClick={() => onModeChange(optionMode)}
            className={`grid h-9 w-10 place-items-center rounded text-sm transition ${
              isActive ? "bg-white text-sea shadow-sm" : "text-slate-600 hover:bg-white hover:text-ink"
            }`}
          >
            <Icon size={17} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function ChatWelcomeCard({
  disabled,
  documentName,
  prompts,
  onPromptSelect
}: {
  disabled: boolean;
  documentName: string;
  prompts: string[];
  onPromptSelect: (prompt: string) => Promise<void> | void;
}) {
  return (
    <div className="mr-auto max-w-[92%] rounded-lg border border-slate-200 bg-white px-4 py-4 text-ink shadow-sm">
      <div className="flex gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-sea">
          <MessageCircle size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Your PDF is ready.</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Ask anything about <span className="font-medium text-ink">{documentName}</span>. I will answer from the document and link
            cited pages inline when the answer references them.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => void onPromptSelect(prompt)}
            disabled={disabled}
            className="min-h-11 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-ink hover:border-sea hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

type ChatMessageBlock =
  | { type: "paragraph"; text: string }
  | { type: "bulletList"; items: string[] }
  | { type: "numberedList"; items: string[] }
  | { type: "heading"; text: string };

interface PageReference {
  pageStart: number;
  pageEnd: number;
  label: string;
}

function FormattedChatMessage({
  activeSourceId,
  content,
  isStreaming,
  role,
  sources,
  onOpenPage
}: {
  activeSourceId: string | null;
  content: string;
  isStreaming: boolean;
  role: ChatMessage["role"];
  sources: Citation[];
  onOpenPage: (page: number, sourceId?: string) => void;
}) {
  const blocks = parseChatMessageBlocks(content);
  const textClassName = role === "user" ? "text-white" : "text-ink";

  return (
    <div className={`space-y-3 text-sm leading-6 ${textClassName}`}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "heading") {
          return (
            <h2 key={`heading-${blockIndex}`} className="text-sm font-semibold">
              {renderInlineText(block.text, `heading-${blockIndex}`, role, activeSourceId, sources, onOpenPage)}
            </h2>
          );
        }

        if (block.type === "bulletList") {
          return (
            <ul key={`bullet-${blockIndex}`} className="space-y-1 pl-5 marker:text-current">
              {block.items.map((item, itemIndex) => (
                <li key={`bullet-${blockIndex}-${itemIndex}`} className="list-disc">
                  {renderInlineText(item, `bullet-${blockIndex}-${itemIndex}`, role, activeSourceId, sources, onOpenPage)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "numberedList") {
          return (
            <ol key={`numbered-${blockIndex}`} className="space-y-1 pl-5 marker:text-current">
              {block.items.map((item, itemIndex) => (
                <li key={`numbered-${blockIndex}-${itemIndex}`} className="list-decimal">
                  {renderInlineText(item, `numbered-${blockIndex}-${itemIndex}`, role, activeSourceId, sources, onOpenPage)}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={`paragraph-${blockIndex}`}>
            {renderInlineText(block.text, `paragraph-${blockIndex}`, role, activeSourceId, sources, onOpenPage)}
          </p>
        );
      })}
      {isStreaming ? (
        <span className="inline-block h-4 w-1 animate-pulse rounded bg-sea align-[-2px]" aria-hidden="true" />
      ) : null}
    </div>
  );
}

function WorkspaceResizeHandle({
  chatWidthPercent,
  isResizing,
  onKeyDown,
  onPointerDown
}: {
  chatWidthPercent: number;
  isResizing: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-label="Resize PDF and chat panes"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(chatWidthPercent)}
      aria-valuetext={`Chat area ${Math.round(chatWidthPercent)} percent wide`}
      tabIndex={0}
      title="Drag to resize PDF and chat"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      className={`group relative z-20 hidden h-full cursor-col-resize touch-none bg-white outline-none transition lg:block ${
        isResizing ? "bg-teal-50" : "hover:bg-slate-50"
      }`}
    >
      <span
        className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition ${
          isResizing ? "bg-sea" : "bg-slate-300 group-hover:bg-sea group-focus-visible:bg-sea"
        }`}
        aria-hidden="true"
      />
      <span className="absolute left-1/2 top-1/2 grid h-11 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition group-hover:border-sea/40 group-hover:text-sea group-focus-visible:border-sea/40 group-focus-visible:text-sea">
        <GripVertical size={16} aria-hidden="true" />
      </span>
    </div>
  );
}

const processingSteps = [
  { status: "uploaded", label: "Uploaded" },
  { status: "extracting", label: "Extracting" },
  { status: "chunking", label: "Chunking" },
  { status: "embedding", label: "Embedding" },
  { status: "indexing", label: "Indexing" }
] as const;

function PdfViewerFallback() {
  return (
    <div className="grid h-full min-h-0 place-items-center bg-slate-100 text-sm text-slate-600">
      <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
        <Loader2 size={16} className="animate-spin text-sea" aria-hidden="true" />
        Loading PDF preview...
      </div>
    </div>
  );
}

function ChatLoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading document chat" className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-12 animate-pulse rounded-md border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <div className="ml-auto h-14 max-w-[72%] animate-pulse rounded-lg bg-slate-200" />
      <div className="mr-auto space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="h-4 w-11/12 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
      </div>
    </div>
  );
}

function ProcessingProgress({ status }: { status: WorkspaceDocument["status"] }) {
  if (!isProcessingStatus(status)) {
    return null;
  }

  const activeIndex = Math.max(
    processingSteps.findIndex((step) => step.status === status),
    0
  );

  return (
    <div aria-label="Processing progress" className="mt-3">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-sea transition-all"
          style={{ width: `${((activeIndex + 1) / processingSteps.length) * 100}%` }}
        />
      </div>
      <ol className="mt-2 grid grid-cols-5 gap-1 text-[11px] font-medium text-slate-500">
        {processingSteps.map((step, index) => (
          <li key={step.status} className={index <= activeIndex ? "text-sea" : undefined}>
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function parseChatMessageBlocks(content: string): ChatMessageBlock[] {
  const blocks: ChatMessageBlock[] = [];
  const paragraphLines: string[] = [];
  let activeListType: "bulletList" | "numberedList" | null = null;
  let activeListItems: string[] = [];

  function flushParagraph() {
    const text = paragraphLines.join(" ").trim();
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
    paragraphLines.length = 0;
  }

  function flushList() {
    if (activeListType && activeListItems.length) {
      blocks.push({ type: activeListType, items: activeListItems });
    }
    activeListType = null;
    activeListItems = [];
  }

  for (const rawLine of content.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: heading[2].trim() });
      continue;
    }

    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (activeListType !== "bulletList") {
        flushList();
        activeListType = "bulletList";
      }
      activeListItems.push(bullet[1].trim());
      continue;
    }

    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (numbered) {
      flushParagraph();
      if (activeListType !== "numberedList") {
        flushList();
        activeListType = "numberedList";
      }
      activeListItems.push(numbered[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderInlineText(
  text: string,
  keyPrefix: string,
  role: ChatMessage["role"],
  activeSourceId: string | null,
  sources: Citation[],
  onOpenPage: (page: number, sourceId?: string) => void
) {
  const nodes: ReactNode[] = [];
  const citationPattern = /\((p{1,2})\.\s*([^)]+)\)/gi;
  let cursor = 0;
  let matchIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(...renderStrongText(text.slice(cursor, match.index), `${keyPrefix}-text-${matchIndex}`));
    }

    const references = parsePageReferences(match[2]);
    if (references.length) {
      nodes.push(
        <InlinePageReferences
          key={`${keyPrefix}-pages-${matchIndex}`}
          activeSourceId={activeSourceId}
          references={references}
          role={role}
          sources={sources}
          onOpenPage={onOpenPage}
        />
      );
    } else {
      nodes.push(match[0]);
    }

    cursor = match.index + match[0].length;
    matchIndex += 1;
  }

  if (cursor < text.length) {
    nodes.push(...renderStrongText(text.slice(cursor), `${keyPrefix}-text-end`));
  }

  return nodes;
}

function renderStrongText(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = [];
  const strongPattern = /(\*\*|__)(.+?)\1/g;
  let cursor = 0;
  let matchIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = strongPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    nodes.push(
      <strong key={`${keyPrefix}-strong-${matchIndex}`} className="font-semibold">
        {match[2]}
      </strong>
    );
    cursor = match.index + match[0].length;
    matchIndex += 1;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function InlinePageReferences({
  activeSourceId,
  references,
  role,
  sources,
  onOpenPage
}: {
  activeSourceId: string | null;
  references: PageReference[];
  role: ChatMessage["role"];
  sources: Citation[];
  onOpenPage: (page: number, sourceId?: string) => void;
}) {
  return (
    <span className="mx-1 inline-flex flex-wrap items-center gap-1 align-baseline">
      {references.map((reference, index) => {
        const source = findSourceForPage(sources, reference.pageStart, reference.pageEnd);
        const isActive = Boolean(source?.sourceId && source.sourceId === activeSourceId);
        const isUserMessage = role === "user";

        return (
          <button
            key={`${reference.pageStart}-${reference.pageEnd}-${index}`}
            type="button"
            aria-label={`Open page ${reference.pageStart} in PDF`}
            onClick={() => onOpenPage(reference.pageStart, source?.sourceId)}
            className={`inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold leading-none transition ${
              isUserMessage
                ? "bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25"
                : isActive
                  ? "bg-sea text-white"
                  : "bg-teal-50 text-sea ring-1 ring-teal-100 hover:bg-teal-100"
            }`}
            title={`Open ${reference.label}`}
          >
            {reference.label}
          </button>
        );
      })}
    </span>
  );
}

function parsePageReferences(value: string): PageReference[] {
  return Array.from(value.matchAll(/\d+(?:\s*[-–—]\s*\d+)?/g))
    .map((match) => {
      const [startText, endText] = match[0].split(/[-–—]/).map((part) => part.trim());
      const pageStart = Number.parseInt(startText, 10);
      const parsedPageEnd = endText ? Number.parseInt(endText, 10) : pageStart;
      const pageEnd = Number.isFinite(parsedPageEnd) ? Math.max(pageStart, parsedPageEnd) : pageStart;

      if (!Number.isFinite(pageStart) || pageStart < 1) {
        return null;
      }

      return {
        pageStart,
        pageEnd,
        label: pageStart === pageEnd ? `p. ${pageStart}` : `pp. ${pageStart}-${pageEnd}`
      };
    })
    .filter((reference): reference is PageReference => reference !== null);
}

function findSourceForPage(sources: Citation[], pageStart: number, pageEnd: number) {
  return (
    sources.find((source) => source.pageStart <= pageStart && source.pageEnd >= pageEnd) ??
    sources.find((source) => pageStart <= source.pageEnd && pageEnd >= source.pageStart)
  );
}

function buildSelectionPrompt(action: PdfSelectionAction, selectedText: string, pageNumber: number) {
  const clippedSelection = clipSelectedText(selectedText);

  switch (action) {
    case "explain":
      return `Explain this selected passage from page ${pageNumber} in clear terms:\n\n"${clippedSelection}"`;
    case "summarize":
      return `Summarize this selected passage from page ${pageNumber} into concise bullets:\n\n"${clippedSelection}"`;
    case "rewrite":
      return `Rewrite this selected passage from page ${pageNumber} in simpler, clearer language while preserving the meaning:\n\n"${clippedSelection}"`;
    case "ask":
      return appendSelectionQuestionDraft("", selectedText, pageNumber);
  }
}

function appendSelectionQuestionDraft(currentDraft: string, selectedText: string, pageNumber: number) {
  const clippedSelection = clipSelectedText(selectedText);
  const selectionDraft = `Selected passage from page ${pageNumber}:\n\n"${clippedSelection}"\n\nMy question: `;
  const trimmedDraft = currentDraft.trim();

  return trimmedDraft ? `${trimmedDraft}\n\n${selectionDraft}` : selectionDraft;
}

function clipSelectedText(selectedText: string) {
  const normalizedSelection = selectedText.replace(/\s+/g, " ").trim();

  return normalizedSelection.length > MAX_SELECTED_TEXT_CHARS
    ? `${normalizedSelection.slice(0, MAX_SELECTED_TEXT_CHARS)}...`
    : normalizedSelection;
}

function readWorkspaceViewMode(): WorkspaceViewMode {
  const storedMode = readStorageItem(VIEW_MODE_STORAGE_KEY);
  return storedMode === "pdf" || storedMode === "split" || storedMode === "chat" ? storedMode : "split";
}

function writeWorkspaceViewMode(mode: WorkspaceViewMode) {
  writeStorageItem(VIEW_MODE_STORAGE_KEY, mode);
}

function readChatWidthPercent() {
  const storedValue = readStorageItem(CHAT_WIDTH_STORAGE_KEY);
  if (!storedValue) {
    return DEFAULT_CHAT_WIDTH_PERCENT;
  }

  const storedPercent = Number(storedValue);
  return Number.isFinite(storedPercent) ? clampNumber(storedPercent, 28, 68) : DEFAULT_CHAT_WIDTH_PERCENT;
}

function writeChatWidthPercent(percent: number) {
  writeStorageItem(CHAT_WIDTH_STORAGE_KEY, String(roundPercent(percent)));
}

function readStorageItem(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageItem(key: string, value: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function clampChatWidthPercent(percent: number, workspaceBody: HTMLElement | null) {
  if (!workspaceBody) {
    return roundPercent(clampNumber(percent, 28, 68));
  }

  const rect = workspaceBody.getBoundingClientRect();
  if (rect.width <= 0) {
    return roundPercent(clampNumber(percent, 28, 68));
  }

  const minPercent = (MIN_CHAT_PANEL_WIDTH / rect.width) * 100;
  const maxPercent = ((rect.width - MIN_PDF_PANEL_WIDTH - RESIZER_WIDTH) / rect.width) * 100;
  return roundPercent(clampNumber(percent, minPercent, maxPercent));
}

function clampNumber(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

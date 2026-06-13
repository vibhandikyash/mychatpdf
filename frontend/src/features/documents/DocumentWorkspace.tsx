import { FormEvent, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus, SendHorizontal } from "lucide-react";
import { ChatMessage, WorkspaceDocument } from "../../types";
import { documentStatusLabel } from "./status";

interface DocumentWorkspaceProps {
  document: WorkspaceDocument;
  messages: ChatMessage[];
  onSendMessage?: (message: string) => Promise<void> | void;
}

const suggestedPrompts = [
  "Summarize this document.",
  "What are the key takeaways?",
  "List action items.",
  "What should I pay attention to?"
];

export function DocumentWorkspace({ document, messages, onSendMessage }: DocumentWorkspaceProps) {
  const totalPages = document.pageCount ?? 1;
  const [activePage, setActivePage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [activeMobilePane, setActiveMobilePane] = useState<"pdf" | "chat">("pdf");
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const isReady = document.status === "ready";
  const canSend = isReady && draft.trim().length > 0 && !isGenerating;

  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [messages]
  );

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

  function jumpToPage(page: number) {
    setActivePage(Math.min(totalPages, Math.max(1, page)));
    setActiveMobilePane("pdf");
  }

  return (
    <section className="flex h-full min-h-[calc(100vh-56px)] flex-col bg-mist">
      <div className="border-b border-slate-200 bg-white px-4 py-3 md:hidden">
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

      <div className="grid flex-1 overflow-hidden lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className={`${activeMobilePane === "pdf" ? "block" : "hidden"} min-h-[520px] border-r border-slate-200 bg-slate-100 lg:block`}>
          <PdfPane
            document={document}
            activePage={activePage}
            totalPages={totalPages}
            zoom={zoom}
            onPageChange={jumpToPage}
            onZoomChange={setZoom}
          />
        </div>

        <div className={`${activeMobilePane === "chat" ? "flex" : "hidden"} min-h-[520px] flex-col bg-white lg:flex`}>
          <header className="border-b border-slate-200 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sea">Document chat</p>
            <h1 className="mt-1 truncate text-xl font-semibold text-ink">{document.originalFilename}</h1>
            <p className="mt-2 text-sm text-slate-600">{documentStatusLabel(document.status)}</p>
            {!isReady ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Questions unlock when processing finishes. If extraction fails, retry or delete this document.
              </p>
            ) : null}
          </header>

          <div className="scrollbar-soft flex-1 overflow-y-auto px-5 py-4">
            {isReady ? (
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
              {orderedMessages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                  Ask a question, request a summary, or use a prompt above once this PDF is ready.
                </div>
              ) : null}

              {orderedMessages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-lg border px-4 py-3 ${
                    message.role === "user" ? "ml-auto max-w-[88%] border-ink bg-ink text-white" : "mr-auto max-w-[92%] border-slate-200 bg-white text-ink"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  {message.sources?.length ? (
                    <div className="mt-3 space-y-2">
                      {message.sources.map((source) => (
                        <button
                          key={source.sourceId}
                          type="button"
                          onClick={() => jumpToPage(source.pageStart)}
                          aria-label={`Open source page ${source.pageStart}`}
                          className="block w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs leading-5 text-slate-700 hover:border-sea hover:bg-teal-50"
                        >
                          <span className="font-semibold text-sea">
                            Page {source.pageStart}
                            {source.pageEnd !== source.pageStart ? `-${source.pageEnd}` : ""}
                          </span>
                          <span className="mt-1 block">{source.excerpt}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}

              {isGenerating ? (
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

          <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white p-4">
            <label htmlFor="chat-composer" className="sr-only">
              Ask this document
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="chat-composer"
                aria-label="Ask this document"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={!isReady || isGenerating}
                rows={3}
                placeholder={isReady ? "Ask this document..." : "Waiting for processing to finish..."}
                className="min-h-24 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 text-ink disabled:bg-slate-100"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={!canSend}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-sea text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <SendHorizontal size={18} aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

interface PdfPaneProps {
  document: WorkspaceDocument;
  activePage: number;
  totalPages: number;
  zoom: number;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
}

function PdfPane({ document, activePage, totalPages, zoom, onPageChange, onZoomChange }: PdfPaneProps) {
  const pdfSrc = document.signedPdfUrl ? `${document.signedPdfUrl}#page=${activePage}&zoom=${zoom}` : undefined;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sea">PDF viewer</p>
          <p className="text-sm font-medium text-ink">
            Page {activePage} of {totalPages}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous page"
            onClick={() => onPageChange(activePage - 1)}
            disabled={activePage <= 1}
            className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-ink disabled:opacity-40"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next page"
            onClick={() => onPageChange(activePage + 1)}
            disabled={activePage >= totalPages}
            className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-ink disabled:opacity-40"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => onZoomChange(Math.max(75, zoom - 10))}
            className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-ink"
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <span className="w-14 text-center text-sm font-medium text-slate-600">{zoom}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => onZoomChange(Math.min(150, zoom + 10))}
            className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-ink"
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="scrollbar-soft flex-1 overflow-auto p-5">
        <div className="mx-auto min-h-[640px] max-w-5xl rounded-md border border-slate-300 bg-white shadow-panel">
          {pdfSrc ? (
            <iframe
              title="PDF preview"
              src={pdfSrc}
              className="h-[calc(100vh-150px)] min-h-[640px] w-full rounded-md bg-white"
            />
          ) : (
            <div className="p-8">
              <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4 text-sm text-slate-500">
                <span>{document.originalFilename}</span>
                <span>Page {activePage}</span>
              </div>
              <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm leading-6 text-slate-500">
                PDF preview will appear when the signed file URL is available.
              </div>
            </div>
          )}
          <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
            Showing page {activePage} at {zoom}%
          </div>
        </div>
      </div>
    </div>
  );
}

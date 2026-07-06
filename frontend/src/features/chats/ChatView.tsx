import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Folder, Loader2, SendHorizontal } from "lucide-react";
import { ChatDocumentRef, ChatMessage, ChatModelTier, ChatSummary, Citation } from "../../types";
import { citationPageLabel } from "../documents/status";
import { chatTitle } from "./ChatHistory";
import { chatModelTier, FastQualityToggle } from "./FastQualityToggle";

interface ChatViewProps {
  chat: ChatSummary | null;
  messages: ChatMessage[];
  isLoading?: boolean;
  onSendMessage?: (content: string, model: ChatModelTier) => Promise<void> | void;
}

function findSourceDocument(chat: ChatSummary | null, source: Citation): ChatDocumentRef | undefined {
  if (!chat) {
    return undefined;
  }

  return (
    chat.documents.find((document) => document.id === source.documentId) ??
    chat.documents.find((document) => document.originalFilename === source.documentFilename)
  );
}

function SourceCitation({ chat, source }: { chat: ChatSummary | null; source: Citation }) {
  const document = findSourceDocument(chat, source);
  const format = document?.format ?? "pdf";
  const label = `${source.documentFilename ?? document?.originalFilename ?? "Document"} · ${citationPageLabel(
    format,
    source.pageStart,
    source.pageEnd
  )}`;

  if (format === "pdf" && document) {
    return (
      <Link
        to={`/app/documents/${document.id}`}
        title={source.excerpt}
        className="inline-flex min-h-6 max-w-full items-center truncate rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold leading-none text-sea ring-1 ring-teal-100 transition hover:bg-teal-100"
      >
        {label}
      </Link>
    );
  }

  return (
    <span
      title={source.excerpt}
      className="inline-flex min-h-6 max-w-full items-center truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold leading-none text-slate-600 ring-1 ring-slate-200"
    >
      {label}
    </span>
  );
}

export function ChatView({ chat, messages, isLoading = false, onSendMessage }: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [tier, setTier] = useState<ChatModelTier>("fast");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const canSend = Boolean(chat) && draft.trim().length > 0 && !isGenerating;

  useEffect(() => {
    if (chat) {
      setTier(chatModelTier(chat.model));
    }
  }, [chat?.id, chat?.model]);

  useEffect(() => {
    const scrollContainer = chatScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    if (typeof scrollContainer.scrollTo === "function") {
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight });
      return;
    }

    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, [messages, isGenerating]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isGenerating || !onSendMessage) {
      return;
    }

    setIsGenerating(true);
    setDraft("");
    try {
      await onSendMessage(content, tier);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <header className="shrink-0 border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sea">Conversation</p>
        <h1 className="mt-1 truncate text-xl font-semibold text-ink">{chat ? chatTitle(chat) : "Loading conversation..."}</h1>
        {chat?.folder ? (
          <span className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-sea ring-1 ring-teal-100">
            <Folder size={13} aria-hidden="true" />
            <span className="truncate">{chat.folder.name}</span>
          </span>
        ) : null}
        {chat?.documents.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {chat.documents.map((document) => (
              <li
                key={document.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200"
              >
                <span className="truncate font-medium">{document.originalFilename}</span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {document.format ?? "pdf"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <div ref={chatScrollRef} className="scrollbar-soft min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {isLoading ? (
          <p className="inline-flex items-center gap-2 text-sm text-slate-600">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Loading conversation...
          </p>
        ) : (
          <div className="space-y-4">
            {messages.length === 0 && chat ? (
              <div className="mr-auto max-w-[92%] rounded-lg border border-teal-100 bg-white px-4 py-4 text-sm leading-6 text-slate-600 shadow-sm">
                Ask anything across {chat.documents.length === 1 ? "this document" : `these ${chat.documents.length} documents`}.
                Answers cite the document and page they come from.
              </div>
            ) : null}

            {messages.map((message) => (
              <article
                key={message.id}
                className={`rounded-lg border px-4 py-3 ${
                  message.role === "user"
                    ? "brand-gradient ml-auto max-w-[88%] border-transparent text-white shadow-sm"
                    : "mr-auto max-w-[92%] border-slate-200 bg-white text-ink"
                }`}
              >
                {message.role === "assistant" && !message.content ? (
                  <p className="inline-flex items-center gap-2 text-sm leading-6 text-slate-600">
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    Drafting grounded answer...
                  </p>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                )}
                {message.sources?.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate-500">Sources:</span>
                    {message.sources.map((source) => (
                      <SourceCitation key={source.sourceId} chat={chat} source={source} />
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 border-t border-slate-200 bg-white p-4">
        <label htmlFor="chat-view-composer" className="sr-only">
          Ask across these documents
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="chat-view-composer"
            aria-label="Ask across these documents"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!chat || isGenerating}
            rows={3}
            placeholder="Ask across these documents..."
            className="min-h-24 flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-sea focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!canSend}
            className="brand-gradient grid h-11 w-11 shrink-0 place-items-center rounded-md text-white shadow-sm hover:shadow-[0_12px_24px_rgba(32,104,248,0.22)] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
          >
            <SendHorizontal size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <FastQualityToggle value={tier} onChange={setTier} disabled={!chat} />
        </div>
      </form>
    </section>
  );
}

// ponytail: M2 expands this into the full MultiDocChat (scope picker, grouped
// citations with click-through to the cited page). Until then this is the
// minimal resume view for chats scoped to more than one document.
import { FormEvent, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { ChatMessage, ChatSummary } from "../../types";
import { chatTitle } from "./ChatHistory";

interface ChatViewProps {
  chat: ChatSummary | null;
  messages: ChatMessage[];
  isLoading?: boolean;
  onSendMessage?: (content: string) => Promise<void> | void;
}

export function ChatView({ chat, messages, isLoading = false, onSendMessage }: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const canSend = Boolean(chat) && draft.trim().length > 0 && !isGenerating;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isGenerating || !onSendMessage) {
      return;
    }

    setIsGenerating(true);
    setDraft("");
    try {
      await onSendMessage(content);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <header className="shrink-0 border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sea">Conversation</p>
        <h1 className="mt-1 truncate text-xl font-semibold text-ink">{chat ? chatTitle(chat) : "Loading conversation..."}</h1>
        {chat?.documents.length ? (
          <p className="mt-1 truncate text-sm text-slate-600">
            {chat.documents.map((document) => document.originalFilename).join(", ")}
          </p>
        ) : null}
      </header>

      <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {isLoading ? (
          <p className="inline-flex items-center gap-2 text-sm text-slate-600">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Loading conversation...
          </p>
        ) : (
          <div className="space-y-4">
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
                  <p className="mt-2 text-xs text-slate-500">
                    Sources:{" "}
                    {message.sources
                      .map((source) => {
                        const pages =
                          source.pageEnd > source.pageStart
                            ? `pp. ${source.pageStart}-${source.pageEnd}`
                            : `p. ${source.pageStart}`;
                        return source.documentFilename ? `${source.documentFilename} ${pages}` : pages;
                      })
                      .join(", ")}
                  </p>
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
      </form>
    </section>
  );
}

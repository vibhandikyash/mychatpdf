import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AuthenticateWithRedirectCallback, ClerkProvider, UserButton, useAuth } from "@clerk/clerk-react";
import {
  FilePlus2,
  FileText,
  Library,
  Menu,
  MessagesSquare,
  X
} from "lucide-react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { AuthPage } from "./features/auth/AuthPages";
import { ApiClient, createAuthenticatedApiClient } from "./api/client";
import {
  deleteDocument,
  getDocument,
  getDocumentChat,
  getDocumentProcessingStatus,
  listDocuments,
  retryDocumentProcessing,
  sendChatMessage,
  uploadDocument
} from "./api/documents";
import { deleteChat, getChat, listChats, renameChat, streamChatMessage } from "./api/chats";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { BrandLockup } from "./features/brand/Brand";
import { ChatHistory } from "./features/chats/ChatHistory";
import { ChatView } from "./features/chats/ChatView";
import { DocumentLibrary } from "./features/documents/DocumentLibrary";
import { DocumentWorkspace } from "./features/documents/DocumentWorkspace";
import { UploadHome } from "./features/upload/UploadHome";
import { ChatMessage, ChatSummary, DocumentStatus, DocumentSummary, WorkspaceDocument } from "./types";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const e2eAuthBypassEnabled = import.meta.env.VITE_E2E_AUTH_BYPASS === "true";
const clerkAuthEnabled = Boolean(clerkPublishableKey) && !e2eAuthBypassEnabled;
const PROCESSING_POLL_MS = 2500;
const FILE_URL_RETRY_MS = 3000;
const DOCUMENTS_CHANGED_EVENT = "mychatpdf:documents-changed";

interface DocumentsChangedDetail {
  document?: DocumentSummary;
  documents?: DocumentSummary[];
  removedDocumentId?: string;
}

export function App() {
  const navigate = useNavigate();
  const activeClerkPublishableKey = clerkAuthEnabled ? clerkPublishableKey : undefined;
  const routes = (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route
        path="/sso-callback"
        element={clerkAuthEnabled ? <AuthenticateWithRedirectCallback /> : <Navigate to="/sign-in" replace />}
      />
      <Route path="/sign-in/*" element={<AuthPage mode="sign-in" />} />
      <Route path="/sign-up/*" element={<AuthPage mode="sign-up" />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell>
              <HomeRoute />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/app/documents"
        element={
          <RequireAuth>
            <AppShell>
              <LibraryRoute />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/app/documents/:documentId"
        element={
          <RequireAuth>
            <AppShell fullBleed>
              <WorkspaceRoute />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/app/chats"
        element={
          <RequireAuth>
            <AppShell>
              <ChatsRoute />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/app/chats/:chatId"
        element={
          <RequireAuth>
            <AppShell fullBleed>
              <ChatRoute />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/app/settings"
        element={<Navigate to="/app/documents" replace />}
      />
    </Routes>
  );

  if (!activeClerkPublishableKey) {
    return routes;
  }

  return (
    <ClerkProvider
      publishableKey={activeClerkPublishableKey}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/app"
    >
      {routes}
    </ClerkProvider>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  if (e2eAuthBypassEnabled) {
    return <>{children}</>;
  }

  if (!clerkAuthEnabled) {
    return <ProtectedRoute authState={{ isLoaded: true, isSignedIn: false }}>{children}</ProtectedRoute>;
  }

  return <ProtectedRoute>{children}</ProtectedRoute>;
}

interface AppShellProps {
  children: ReactNode;
  fullBleed?: boolean;
}

function AppShell({ children, fullBleed = false }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const shellClassName = "h-screen overflow-hidden bg-mist text-ink md:grid md:grid-cols-[280px_minmax(0,1fr)]";
  const sidebarClassName = "hidden h-screen overflow-hidden border-r border-slate-200 bg-white md:block";
  const mainClassName = fullBleed
    ? "h-full min-h-0 min-w-0 overflow-hidden"
    : "scrollbar-soft h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain pt-16 md:pt-0";

  return (
    <div className={shellClassName}>
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setDrawerOpen(true)}
        className="fixed left-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-ink shadow-panel md:hidden"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <aside className={sidebarClassName}>
        <Sidebar />
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation backdrop"
            className="absolute inset-0 bg-slate-900/35"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-80 max-w-[86vw] bg-white shadow-panel">
            <div className="flex justify-end p-3">
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md border border-slate-200"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      ) : null}

      <main className={mainClassName}>{children}</main>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const api = useAuthenticatedApiClient();
  const location = useLocation();
  const [recentDocuments, setRecentDocuments] = useState<DocumentSummary[]>([]);

  useEffect(() => {
    if (!api) {
      return;
    }

    const apiClient = api;
    let cancelled = false;

    async function refreshIfActive() {
      try {
        const documents = await listDocuments(apiClient);
        if (!cancelled) {
          setRecentDocuments(toSidebarDocuments(documents));
        }
      } catch {
        if (!cancelled) {
          setRecentDocuments([]);
        }
      }
    }

    function onDocumentsChanged(event: Event) {
      const detail = readDocumentsChangedDetail(event);
      if (!detail) {
        void refreshIfActive();
        return;
      }

      if (detail.documents) {
        setRecentDocuments(toSidebarDocuments(detail.documents));
        return;
      }

      const changedDocument = detail.document;
      if (changedDocument) {
        setRecentDocuments((current) => upsertSidebarDocument(current, changedDocument));
        return;
      }

      if (detail.removedDocumentId) {
        setRecentDocuments((current) => current.filter((document) => document.id !== detail.removedDocumentId));
      }
    }

    function refreshWhenVisible() {
      if (window.document.visibilityState === "visible") {
        void refreshIfActive();
      }
    }

    void refreshIfActive();
    window.addEventListener(DOCUMENTS_CHANGED_EVENT, onDocumentsChanged);
    window.addEventListener("focus", refreshWhenVisible);
    window.document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.removeEventListener(DOCUMENTS_CHANGED_EVENT, onDocumentsChanged);
      window.removeEventListener("focus", refreshWhenVisible);
      window.document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [api, location.pathname]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white px-4 py-5">
      <Link to="/app" onClick={onNavigate} className="mb-5 flex items-center gap-3 rounded-lg px-1 text-ink">
        <BrandLockup markClassName="h-12 w-auto max-w-[220px] object-contain" />
      </Link>

      <Link
        to="/app"
        onClick={onNavigate}
        className={`mb-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
          location.pathname === "/app"
            ? "brand-gradient text-white shadow-sm ring-4 ring-teal-100"
            : "brand-gradient text-white shadow-sm hover:shadow-[0_14px_28px_rgba(32,104,248,0.22)]"
        }`}
      >
        <FilePlus2 size={18} aria-hidden="true" />
        New upload
      </Link>

      <nav aria-label="Primary">
        <section>
          <SidebarSectionTitle>Workspace</SidebarSectionTitle>
          <div className="mt-2 space-y-1">
            <NavItem to="/app/documents" icon={<Library size={17} aria-hidden="true" />} onNavigate={onNavigate}>
              Documents
            </NavItem>
            <NavItem to="/app/chats" icon={<MessagesSquare size={17} aria-hidden="true" />} onNavigate={onNavigate}>
              Conversations
            </NavItem>
          </div>
        </section>
      </nav>

      <section className="scrollbar-soft mt-6 min-h-0 flex-1 overflow-y-auto">
        <div className="px-2">
          <SidebarSectionTitle>Recent PDFs</SidebarSectionTitle>
        </div>
        <ul className="mt-2 space-y-1">
          {recentDocuments.length ? recentDocuments.map((document) => (
            <li key={document.id}>
              <Link
                to={`/app/documents/${document.id}`}
                onClick={onNavigate}
                className={`group flex min-w-0 items-center gap-2 rounded-lg px-2 py-2.5 text-sm transition ${
                  location.pathname === `/app/documents/${document.id}`
                    ? "bg-teal-50 text-ink ring-1 ring-teal-100"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white text-sea ring-1 ring-slate-200">
                  <FileText size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{document.originalFilename}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{document.status === "ready" ? "Ready" : "Processing"}</span>
                </span>
              </Link>
            </li>
          )) : (
            <li className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-sm leading-5 text-slate-500">
              Uploaded PDFs will appear here.
            </li>
          )}
        </ul>
      </section>

      <div className="mt-4 border-t border-slate-200 pt-4">
        {clerkAuthEnabled ? (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-2">
            <UserButton afterSignOutUrl="/sign-in" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Account</p>
              <p className="text-xs text-slate-500">Workspace controls</p>
            </div>
          </div>
        ) : (
          <p className="rounded-md bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-600">
            Configure Clerk to enable account controls.
          </p>
        )}
      </div>
    </div>
  );
}

function SidebarSectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{children}</h2>;
}

function NavItem({
  to,
  icon,
  children,
  onNavigate
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium transition ${
          isActive ? "bg-teal-50 text-ink ring-1 ring-teal-100" : "text-slate-700 hover:bg-slate-50"
        }`
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}

function HomeRoute() {
  const navigate = useNavigate();
  const api = useAuthenticatedApiClient();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);

  useEffect(() => {
    if (!api) {
      return;
    }

    void listDocuments(api)
      .then((nextDocuments) => {
        setDocuments(nextDocuments);
        notifyDocumentsChanged({ documents: nextDocuments });
      })
      .catch(() => undefined);
  }, [api]);

  async function onUploadFile(file: File) {
    if (!api) {
      return;
    }

    const localPreviewUrl = URL.createObjectURL(file);
    try {
      const result = await uploadDocument(api, file);
      const uploadedDocument = createUploadedDocumentSummary(result.documentId, result.status, file);
      setDocuments((current) => [uploadedDocument, ...current.filter((document) => document.id !== uploadedDocument.id)]);
      notifyDocumentsChanged({ document: uploadedDocument });
      navigate(`/app/documents/${result.documentId}`, {
        state: {
          localPreviewUrl,
          originalFilename: file.name,
          fileSizeBytes: file.size,
          createdAt: new Date().toISOString()
        }
      });
    } catch (error) {
      URL.revokeObjectURL(localPreviewUrl);
      throw error;
    }
  }

  return (
    <UploadHome
      documents={documents}
      onUploadFile={onUploadFile}
      onOpenDocument={(documentId) => navigate(documentId === "documents" ? "/app/documents" : `/app/documents/${documentId}`)}
    />
  );
}

function LibraryRoute() {
  const navigate = useNavigate();
  const api = useAuthenticatedApiClient();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);

  async function refreshDocuments() {
    if (!api) {
      return;
    }

    const nextDocuments = await listDocuments(api);
    setDocuments(nextDocuments);
    notifyDocumentsChanged({ documents: nextDocuments });
  }

  useEffect(() => {
    void refreshDocuments().catch(() => undefined);
  }, [api]);

  return (
    <DocumentLibrary
      documents={documents}
      onOpen={(documentId) => navigate(`/app/documents/${documentId}`)}
      onDelete={(documentId) => {
        if (!api) {
          return;
        }
        notifyDocumentsChanged({ removedDocumentId: documentId });
        void deleteDocument(api, documentId).then(refreshDocuments).catch(() => undefined);
      }}
      onRetry={(documentId) => {
        if (!api) {
          return;
        }
        void retryDocumentProcessing(api, documentId).then(refreshDocuments).catch(() => undefined);
      }}
    />
  );
}

function ChatsRoute() {
  const navigate = useNavigate();
  const api = useAuthenticatedApiClient();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    if (!api) {
      return;
    }

    let cancelled = false;
    void listChats(api)
      .then((page) => {
        if (!cancelled) {
          setChats(page.items);
          setNextCursor(page.nextCursor);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [api]);

  async function loadMore() {
    if (!api || !nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const page = await listChats(api, nextCursor);
      setChats((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      // Keep the loaded page on failure; the button stays available for retry.
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <ChatHistory
      chats={chats}
      hasMore={Boolean(nextCursor)}
      isLoadingMore={isLoadingMore}
      onOpen={(chat) =>
        navigate(chat.documents.length === 1 ? `/app/documents/${chat.documents[0].id}` : `/app/chats/${chat.id}`)
      }
      onRename={(chatId, title) => {
        if (!api) {
          return;
        }
        void renameChat(api, chatId, title)
          .then((updated) => setChats((current) => current.map((chat) => (chat.id === chatId ? updated : chat))))
          .catch(() => undefined);
      }}
      onDelete={(chatId) => {
        if (!api) {
          return;
        }
        setChats((current) => current.filter((chat) => chat.id !== chatId));
        void deleteChat(api, chatId).catch(() => undefined);
      }}
      onLoadMore={() => void loadMore()}
    />
  );
}

function ChatRoute() {
  const { chatId } = useParams();
  const api = useAuthenticatedApiClient();
  const [chat, setChat] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!api || !chatId) {
      return;
    }

    const apiClient = api;
    const currentChatId = chatId;
    let cancelled = false;

    setChat(null);
    setMessages([]);
    setErrorMessage(null);
    setIsLoading(true);

    void getChat(apiClient, currentChatId)
      .then((detail) => {
        if (!cancelled) {
          setChat(detail.chat);
          setMessages(detail.messages);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage("Unable to load this conversation.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, chatId]);

  async function handleSendMessage(content: string) {
    if (!api || !chatId) {
      return;
    }

    const localMessagePrefix = `local-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: `${localMessagePrefix}-user`,
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    const pendingAssistantId = `${localMessagePrefix}-assistant`;
    let streamedAssistantId = pendingAssistantId;
    const assistantDraft: ChatMessage = {
      id: pendingAssistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      sources: []
    };

    setMessages((current) => [...current, userMessage, assistantDraft]);
    setErrorMessage(null);

    try {
      const assistantMessage = await streamChatMessage(api, chatId, content, {
        onStart: (messageId) => {
          setMessages((current) => replaceMessageId(current, pendingAssistantId, messageId));
          streamedAssistantId = messageId;
        },
        onToken: (token) => {
          setMessages((current) => appendMessageContent(current, streamedAssistantId, token));
        },
        onSources: (sources) => {
          setMessages((current) => updateMessageSources(current, streamedAssistantId, sources));
        }
      });
      setMessages((current) => upsertMessage(current, streamedAssistantId, assistantMessage));
    } catch (error) {
      setMessages((current) => removeEmptyAssistantDraft(current, [pendingAssistantId, streamedAssistantId]));
      setErrorMessage(readableChatError(error));
    }
  }

  return (
    <>
      {errorMessage ? (
        <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}
      <ChatView chat={chat} messages={messages} isLoading={isLoading} onSendMessage={handleSendMessage} />
    </>
  );
}

function WorkspaceRoute() {
  const { documentId } = useParams();
  const location = useLocation();
  const api = useAuthenticatedApiClient();
  const [document, setDocument] = useState<WorkspaceDocument>(() => findWorkspaceDocument(documentId, location.state));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const previewUrl = document.signedPdfUrl;
    return () => revokePreviewUrl(previewUrl);
  }, [document.signedPdfUrl]);

  useEffect(() => {
    if (!api || !documentId) {
      return;
    }

    const apiClient = api;
    const currentDocumentId = documentId;
    const routeState = location.state;
    let cancelled = false;

    setDocument((current) => {
      const optimisticDocument = findWorkspaceDocument(currentDocumentId, routeState);
      return current.id === currentDocumentId ? mergeWorkspaceDocument(optimisticDocument, current) : optimisticDocument;
    });
    setMessages([]);
    setErrorMessage(null);
    setIsWorkspaceLoading(true);
    setIsChatLoading(true);

    async function loadDocumentDetails() {
      try {
        const documentSummary = await getDocument(apiClient, currentDocumentId);
        if (cancelled) {
          return;
        }
        setDocument((current) => mergeWorkspaceDocument(current, documentSummary));
        notifyDocumentsChanged({ document: documentSummary });
        setErrorMessage(null);
      } catch {
        if (!cancelled) {
          setErrorMessage("Unable to load this document.");
        }
      } finally {
        if (!cancelled) {
          setIsWorkspaceLoading(false);
        }
      }
    }

    async function loadChatMessages() {
      try {
        const chatMessages = await getDocumentChat(apiClient, currentDocumentId);
        if (!cancelled) {
          setMessages(chatMessages);
        }
      } catch {
        // Chat history is optional for opening the document workspace.
      } finally {
        if (!cancelled) {
          setIsChatLoading(false);
        }
      }
    }

    async function preparePdfAccess() {
      const pdfAccess = await getDocumentPreviewAccess(apiClient, currentDocumentId);
      if (!cancelled) {
        setDocument((current) =>
          current.id === currentDocumentId
            ? { ...current, signedPdfUrl: pdfAccess.url, pdfHttpHeaders: pdfAccess.headers }
            : current
        );
      }
    }

    void loadDocumentDetails();
    void loadChatMessages();
    void preparePdfAccess().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [api, documentId, location.state]);

  useEffect(() => {
    if (!api || !documentId || !isProcessingStatus(document.status)) {
      return;
    }

    const apiClient = api;
    const currentDocumentId = documentId;
    let cancelled = false;
    let refreshTimeout: number | undefined;

    async function refreshProcessingStatus() {
      try {
        const status = await getDocumentProcessingStatus(apiClient, currentDocumentId);
        if (cancelled) {
          return;
        }

        setDocument((current) =>
          current.id === currentDocumentId
            ? { ...current, status: status.status, failureMessage: status.failureMessage }
            : current
        );

        if (isProcessingStatus(status.status)) {
          refreshTimeout = window.setTimeout(refreshProcessingStatus, PROCESSING_POLL_MS);
          return;
        }

        const [documentSummary, chatMessages] = await Promise.all([
          getDocument(apiClient, currentDocumentId),
          optionalRequest(getDocumentChat(apiClient, currentDocumentId))
        ]);
        if (cancelled) {
          return;
        }
        setDocument((current) => mergeWorkspaceDocument(current, documentSummary));
        notifyDocumentsChanged({ document: documentSummary });
        if (chatMessages) {
          setMessages(chatMessages);
        }
        setErrorMessage(null);
      } catch {
        if (!cancelled) {
          refreshTimeout = window.setTimeout(refreshProcessingStatus, PROCESSING_POLL_MS);
        }
      }
    }

    refreshTimeout = window.setTimeout(refreshProcessingStatus, PROCESSING_POLL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimeout);
    };
  }, [api, documentId, document.status]);

  useEffect(() => {
    if (!api || !documentId || document.signedPdfUrl || document.status === "deleting") {
      return;
    }

    const apiClient = api;
    const currentDocumentId = documentId;
    let cancelled = false;
    let retryTimeout: number | undefined;

    async function refreshFileUrl() {
      try {
        const pdfAccess = await getDocumentPreviewAccess(apiClient, currentDocumentId);
        if (!cancelled) {
          setDocument((current) =>
            current.id === currentDocumentId
              ? { ...current, signedPdfUrl: pdfAccess.url, pdfHttpHeaders: pdfAccess.headers }
              : current
          );
        }
      } catch {
        if (!cancelled) {
          retryTimeout = window.setTimeout(refreshFileUrl, FILE_URL_RETRY_MS);
        }
      }
    }

    void refreshFileUrl();

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimeout);
    };
  }, [api, documentId, document.signedPdfUrl, document.status]);

  useEffect(() => {
    return () => {
      chatAbortControllerRef.current?.abort();
      chatAbortControllerRef.current = null;
    };
  }, [documentId]);

  async function handleSendMessage(content: string) {
    if (!api || !documentId) {
      return;
    }

    chatAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    chatAbortControllerRef.current = abortController;
    const localMessagePrefix = `local-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: `${localMessagePrefix}-user`,
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    const pendingAssistantId = `${localMessagePrefix}-assistant`;
    let streamedAssistantId = pendingAssistantId;
    const assistantDraft: ChatMessage = {
      id: pendingAssistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      sources: []
    };

    setMessages((current) => [...current, userMessage, assistantDraft]);
    setErrorMessage(null);

    try {
      const assistantMessage = await sendChatMessage(api, documentId, content, {
        signal: abortController.signal,
        onStart: (messageId) => {
          streamedAssistantId = messageId;
          setMessages((current) => replaceMessageId(current, pendingAssistantId, messageId));
        },
        onToken: (token) => {
          setMessages((current) => appendMessageContent(current, streamedAssistantId, token));
        },
        onSources: (sources) => {
          setMessages((current) => updateMessageSources(current, streamedAssistantId, sources));
        }
      });
      const chatMessages = await getDocumentChat(api, documentId).catch(() => null);
      setMessages((current) => (chatMessages ? chatMessages : upsertMessage(current, streamedAssistantId, assistantMessage)));
    } catch (error) {
      if (isAbortError(error)) {
        setMessages((current) => removeEmptyAssistantDraft(current, [pendingAssistantId, streamedAssistantId]));
        return;
      }

      setMessages((current) => removeEmptyAssistantDraft(current, [pendingAssistantId, streamedAssistantId]));
      setErrorMessage(readableChatError(error));
    } finally {
      if (chatAbortControllerRef.current === abortController) {
        chatAbortControllerRef.current = null;
      }
    }
  }

  function handleCancelMessage() {
    chatAbortControllerRef.current?.abort();
  }

  return (
    <>
      {errorMessage ? (
        <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}
      <DocumentWorkspace
        document={document}
        messages={messages}
        isLoading={isWorkspaceLoading}
        isChatLoading={isChatLoading}
        onSendMessage={handleSendMessage}
        onCancelMessage={handleCancelMessage}
      />
    </>
  );
}

function isProcessingStatus(status: DocumentStatus) {
  return ["uploaded", "extracting", "chunking", "embedding", "indexing"].includes(status);
}

function notifyDocumentsChanged(detail: DocumentsChangedDetail) {
  window.dispatchEvent(new CustomEvent<DocumentsChangedDetail>(DOCUMENTS_CHANGED_EVENT, { detail }));
}

function readDocumentsChangedDetail(event: Event): DocumentsChangedDetail | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") {
    return null;
  }

  return event.detail as DocumentsChangedDetail;
}

function toSidebarDocuments(documents: DocumentSummary[]) {
  return [...documents].sort(compareRecentDocuments);
}

function upsertSidebarDocument(documents: DocumentSummary[], nextDocument: DocumentSummary) {
  return toSidebarDocuments([nextDocument, ...documents.filter((document) => document.id !== nextDocument.id)]);
}

function compareRecentDocuments(left: DocumentSummary, right: DocumentSummary) {
  return documentTimestamp(right) - documentTimestamp(left);
}

function documentTimestamp(document: DocumentSummary) {
  return Date.parse(document.lastOpenedAt ?? document.createdAt) || 0;
}

function createUploadedDocumentSummary(documentId: string, status: DocumentStatus, file: File): DocumentSummary {
  return {
    id: documentId,
    originalFilename: file.name,
    status,
    fileSizeBytes: file.size,
    createdAt: new Date().toISOString()
  };
}

interface PdfAccess {
  url: string;
  headers: Record<string, string>;
}

async function getDocumentPreviewAccess(apiClient: ApiClient, documentId: string): Promise<PdfAccess> {
  return {
    url: apiClient.url(`/api/documents/${documentId}/file`),
    headers: await apiClient.authHeaders()
  };
}

async function optionalRequest<T>(request: Promise<T>): Promise<T | undefined> {
  try {
    return await request;
  } catch {
    return undefined;
  }
}

function mergeWorkspaceDocument(current: WorkspaceDocument, next: WorkspaceDocument): WorkspaceDocument {
  return {
    ...next,
    signedPdfUrl: next.signedPdfUrl ?? (current.id === next.id ? current.signedPdfUrl : undefined),
    pdfHttpHeaders: next.pdfHttpHeaders ?? (current.id === next.id ? current.pdfHttpHeaders : undefined)
  };
}

function revokePreviewUrl(url?: string) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

function replaceMessageId(messages: ChatMessage[], currentId: string, nextId: string): ChatMessage[] {
  if (currentId === nextId) {
    return messages;
  }

  return messages.map((message) => (message.id === currentId ? { ...message, id: nextId } : message));
}

function appendMessageContent(messages: ChatMessage[], messageId: string, token: string): ChatMessage[] {
  if (!token) {
    return messages;
  }

  return messages.map((message) =>
    message.id === messageId ? { ...message, content: `${message.content}${token}` } : message
  );
}

function updateMessageSources(messages: ChatMessage[], messageId: string, sources: ChatMessage["sources"]): ChatMessage[] {
  return messages.map((message) => (message.id === messageId ? { ...message, sources } : message));
}

function upsertMessage(messages: ChatMessage[], replaceId: string, nextMessage: ChatMessage): ChatMessage[] {
  let replaced = false;
  const nextMessages = messages.map((message) => {
    if (message.id === replaceId || message.id === nextMessage.id) {
      replaced = true;
      return nextMessage;
    }
    return message;
  });

  return replaced ? nextMessages : [...nextMessages, nextMessage];
}

function removeEmptyAssistantDraft(messages: ChatMessage[], messageIds: string[]): ChatMessage[] {
  const removableIds = new Set(messageIds);
  return messages.filter(
    (message) => !(removableIds.has(message.id) && message.role === "assistant" && message.content.trim().length === 0)
  );
}

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function readableChatError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unable to send this message right now.";
}

function findWorkspaceDocument(documentId?: string, routeState?: unknown): WorkspaceDocument {
  const uploadPreview = readUploadPreviewState(routeState);

  return {
    id: documentId ?? "unknown",
    originalFilename: uploadPreview?.originalFilename ?? "Opening document...",
    status: "uploaded",
    fileSizeBytes: uploadPreview?.fileSizeBytes ?? 0,
    createdAt: uploadPreview?.createdAt ?? new Date().toISOString(),
    signedPdfUrl: uploadPreview?.localPreviewUrl
  };
}

function readUploadPreviewState(state: unknown) {
  if (!state || typeof state !== "object") {
    return null;
  }

  const maybeState = state as Partial<{
    localPreviewUrl: unknown;
    originalFilename: unknown;
    fileSizeBytes: unknown;
    createdAt: unknown;
  }>;

  if (typeof maybeState.localPreviewUrl !== "string") {
    return null;
  }

  return {
    localPreviewUrl: maybeState.localPreviewUrl,
    originalFilename:
      typeof maybeState.originalFilename === "string" && maybeState.originalFilename.trim()
        ? maybeState.originalFilename
        : "Uploaded PDF",
    fileSizeBytes: typeof maybeState.fileSizeBytes === "number" ? maybeState.fileSizeBytes : 0,
    createdAt: typeof maybeState.createdAt === "string" ? maybeState.createdAt : new Date().toISOString()
  };
}

function useAuthenticatedApiClient() {
  if (e2eAuthBypassEnabled) {
    return useMemo(
      () =>
        new ApiClient({
          baseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
          getToken: async () => "e2e-token"
        }),
      []
    );
  }

  const { getToken } = useAuth();
  return useMemo(() => {
    if (!clerkAuthEnabled) {
      return null;
    }

    return createAuthenticatedApiClient(getToken);
  }, [getToken]);
}

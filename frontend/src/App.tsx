import { ReactNode, useEffect, useMemo, useState } from "react";
import { ClerkProvider, UserButton, useAuth } from "@clerk/clerk-react";
import { FilePlus2, FileText, Library, Menu, Settings, X } from "lucide-react";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { AuthPage } from "./features/auth/AuthPages";
import { createAuthenticatedApiClient } from "./api/client";
import {
  deleteDocument,
  getDocumentChat,
  getDocumentFileUrl,
  getDocumentProcessingStatus,
  listDocuments,
  retryDocumentProcessing,
  sendChatMessage,
  uploadDocument
} from "./api/documents";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { DocumentLibrary } from "./features/documents/DocumentLibrary";
import { DocumentWorkspace } from "./features/documents/DocumentWorkspace";
import { UploadHome } from "./features/upload/UploadHome";
import { ChatMessage, DocumentStatus, DocumentSummary, WorkspaceDocument } from "./types";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export function App() {
  const navigate = useNavigate();
  const routes = (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
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
        path="/app/settings"
        element={
          <RequireAuth>
            <AppShell>
              <SettingsRoute />
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  );

  if (!clerkPublishableKey) {
    return routes;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
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
  if (!clerkPublishableKey) {
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

  return (
    <div className="min-h-screen bg-mist text-ink md:grid md:grid-cols-[280px_minmax(0,1fr)]">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setDrawerOpen(true)}
        className="fixed left-4 top-4 z-30 grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-ink shadow-panel md:hidden"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <aside className="hidden border-r border-slate-200 bg-white md:block">
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

      <main className={fullBleed ? "min-w-0" : "min-w-0 pt-16 md:pt-0"}>{children}</main>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const recentDocuments: DocumentSummary[] = [];

  return (
    <div className="flex h-full min-h-screen flex-col p-4">
      <Link to="/app" onClick={onNavigate} className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-white">
          <FileText size={20} aria-hidden="true" />
        </span>
        <span className="text-lg font-semibold">MyChatPDF</span>
      </Link>

      <Link
        to="/app"
        onClick={onNavigate}
        className="mb-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-800"
      >
        <FilePlus2 size={18} aria-hidden="true" />
        New upload
      </Link>

      <nav aria-label="Primary" className="space-y-1">
        <NavItem to="/app/documents" icon={<Library size={17} aria-hidden="true" />} onNavigate={onNavigate}>
          Documents
        </NavItem>
        <NavItem to="/app/settings" icon={<Settings size={17} aria-hidden="true" />} onNavigate={onNavigate}>
          Settings
        </NavItem>
      </nav>

      <section className="mt-6 min-h-0 flex-1">
        <h2 className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recent chats</h2>
        <ul className="mt-2 space-y-1">
          {recentDocuments.length ? recentDocuments.map((document) => (
            <li key={document.id}>
              <Link
                to={`/app/documents/${document.id}`}
                onClick={onNavigate}
                className="block truncate rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                {document.originalFilename}
              </Link>
            </li>
          )) : (
            <li className="px-2 py-2 text-sm text-slate-500">No recent chats yet</li>
          )}
        </ul>
      </section>

      <div className="border-t border-slate-200 pt-4">
        {clerkPublishableKey ? (
          <UserButton afterSignOutUrl="/sign-in" />
        ) : (
          <p className="rounded-md bg-slate-100 px-3 py-2 text-xs leading-5 text-slate-600">
            Configure Clerk to enable account controls.
          </p>
        )}
      </div>
    </div>
  );
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
    <Link to={to} onClick={onNavigate} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
      {icon}
      {children}
    </Link>
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

    void listDocuments(api).then(setDocuments).catch(() => undefined);
  }, [api]);

  async function onUploadFile(file: File) {
    if (!api) {
      return;
    }

    const result = await uploadDocument(api, file);
    navigate(`/app/documents/${result.documentId}`);
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

    setDocuments(await listDocuments(api));
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

function WorkspaceRoute() {
  const { documentId } = useParams();
  const api = useAuthenticatedApiClient();
  const [document, setDocument] = useState<WorkspaceDocument>(() => findWorkspaceDocument(documentId));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!api || !documentId) {
      return;
    }

    const apiClient = api;
    const currentDocumentId = documentId;
    let cancelled = false;

    async function loadWorkspace() {
      const [documents, chatMessages, fileUrl] = await Promise.all([
        listDocuments(apiClient),
        getDocumentChat(apiClient, currentDocumentId),
        getDocumentFileUrl(apiClient, currentDocumentId).catch(() => undefined)
      ]);
      if (cancelled) {
        return;
      }
      const currentDocument = documents.find((item) => item.id === currentDocumentId);
      if (currentDocument) {
        setDocument({ ...currentDocument, signedPdfUrl: fileUrl?.url });
      }
      setMessages(chatMessages);
      setErrorMessage(null);
    }

    void loadWorkspace().catch(() => setErrorMessage("Unable to load this document."));
    return () => {
      cancelled = true;
    };
  }, [api, documentId]);

  useEffect(() => {
    if (!api || !documentId || !isProcessingStatus(document.status)) {
      return;
    }

    const apiClient = api;
    const currentDocumentId = documentId;
    const interval = window.setInterval(() => {
      void getDocumentProcessingStatus(apiClient, currentDocumentId)
        .then((status) => {
          setDocument((current) => ({ ...current, status: status.status, failureMessage: status.failureMessage }));
          if (status.status === "ready") {
            void Promise.all([
              listDocuments(apiClient),
              getDocumentChat(apiClient, currentDocumentId),
              getDocumentFileUrl(apiClient, currentDocumentId).catch(() => undefined)
            ]).then(([documents, chatMessages, fileUrl]) => {
              const currentDocument = documents.find((item) => item.id === currentDocumentId);
              if (currentDocument) {
                setDocument({ ...currentDocument, signedPdfUrl: fileUrl?.url });
              }
              setMessages(chatMessages);
            });
          }
        })
        .catch(() => setErrorMessage("Unable to refresh processing status."));
    }, 2500);

    return () => window.clearInterval(interval);
  }, [api, documentId, document.status]);

  async function handleSendMessage(content: string) {
    if (!api || !documentId) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, userMessage]);
    setErrorMessage(null);

    try {
      const assistantMessage = await sendChatMessage(api, documentId, content);
      const chatMessages = await getDocumentChat(api, documentId).catch(() => null);
      setMessages((current) => (chatMessages ? chatMessages : [...current, assistantMessage]));
    } catch {
      setErrorMessage("Unable to send this message right now.");
    }
  }

  return (
    <>
      {errorMessage ? (
        <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}
      <DocumentWorkspace document={document} messages={messages} onSendMessage={handleSendMessage} />
    </>
  );
}

function isProcessingStatus(status: DocumentStatus) {
  return ["uploaded", "extracting", "chunking", "embedding", "indexing"].includes(status);
}

function findWorkspaceDocument(documentId?: string): WorkspaceDocument {
  return {
    id: documentId ?? "unknown",
    originalFilename: "Document",
    status: "uploaded",
    fileSizeBytes: 0,
    createdAt: new Date().toISOString()
  };
}

function SettingsRoute() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">Settings</p>
      <h1 className="mt-1 text-3xl font-semibold text-ink">Account</h1>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-panel">
        Clerk manages profile, session, and sign-out controls. Production settings can expand here after Phase 1.
      </div>
    </section>
  );
}

function useAuthenticatedApiClient() {
  const { getToken } = useAuth();
  return useMemo(() => {
    if (!clerkPublishableKey) {
      return null;
    }

    return createAuthenticatedApiClient(getToken);
  }, [getToken]);
}

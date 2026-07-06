import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AuthenticateWithRedirectCallback, ClerkProvider, UserButton, useAuth } from "@clerk/clerk-react";
import {
  CreditCard,
  FilePlus2,
  FileText,
  Folder,
  Library,
  Menu,
  MessagesSquare,
  Plus,
  X
} from "lucide-react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { AuthPage } from "./features/auth/AuthPages";
import { ApiClient, createAuthenticatedApiClient, LimitExceededError } from "./api/client";
import {
  deleteDocument,
  getDocument,
  getDocumentChat,
  getDocumentProcessingStatus,
  listDocuments,
  moveDocument,
  retryDocumentProcessing,
  sendChatMessage,
  uploadDocument
} from "./api/documents";
import { createChat, deleteChat, getChat, listChats, renameChat, streamChatMessage } from "./api/chats";
import { createFolder, listFolders } from "./api/folders";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import { BillingPage } from "./features/billing/BillingPage";
import { LimitExceededNotice } from "./features/billing/LimitExceededNotice";
import { BrandLockup } from "./features/brand/Brand";
import { ChatHistory, chatTitle } from "./features/chats/ChatHistory";
import { ChatView } from "./features/chats/ChatView";
import { ScopePicker } from "./features/chats/ScopePicker";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { DocumentLibrary } from "./features/documents/DocumentLibrary";
import { DocumentWorkspace } from "./features/documents/DocumentWorkspace";
import { FolderView } from "./features/folders/FolderView";
import {
  ChatMessage,
  ChatSummary,
  DocumentFormat,
  DocumentStatus,
  DocumentSummary,
  FolderSummary,
  WorkspaceDocument
} from "./types";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const e2eAuthBypassEnabled = import.meta.env.VITE_E2E_AUTH_BYPASS === "true";
const clerkAuthEnabled = Boolean(clerkPublishableKey) && !e2eAuthBypassEnabled;
const PROCESSING_POLL_MS = 2500;
const FILE_URL_RETRY_MS = 3000;
const DOCUMENTS_CHANGED_EVENT = "mychatpdf:documents-changed";
const FOLDERS_CHANGED_EVENT = "mychatpdf:folders-changed";

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
              <DashboardRoute />
            </AppShell>
          </RequireAuth>
        }
      />
      <Route
        path="/app/billing"
        element={
          <RequireAuth>
            <AppShell>
              <BillingRoute />
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
        path="/app/folders/:folderId"
        element={
          <RequireAuth>
            <AppShell>
              <FolderRoute />
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
        path="/app/chats/new"
        element={
          <RequireAuth>
            <AppShell>
              <NewChatRoute />
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
  const navigate = useNavigate();
  const [recentDocuments, setRecentDocuments] = useState<DocumentSummary[]>([]);
  const [recentChats, setRecentChats] = useState<ChatSummary[]>([]);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderNameDraft, setFolderNameDraft] = useState("");

  useEffect(() => {
    if (!api) {
      return;
    }

    const apiClient = api;
    let cancelled = false;

    function refresh() {
      void listChats(apiClient)
        .then((page) => {
          if (!cancelled) {
            setRecentChats(page.items.slice(0, 6));
          }
        })
        .catch(() => undefined);
      void listFolders(apiClient)
        .then((items) => {
          if (!cancelled) {
            setFolders(items);
          }
        })
        .catch(() => undefined);
    }

    refresh();
    window.addEventListener(FOLDERS_CHANGED_EVENT, refresh);

    return () => {
      cancelled = true;
      window.removeEventListener(FOLDERS_CHANGED_EVENT, refresh);
    };
  }, [api, location.pathname]);

  async function submitNewFolder() {
    const name = folderNameDraft.trim();
    if (!api || !name) {
      setIsCreatingFolder(false);
      setFolderNameDraft("");
      return;
    }

    try {
      const folder = await createFolder(api, name);
      setFolders((current) => [...current, folder]);
      setIsCreatingFolder(false);
      setFolderNameDraft("");
      onNavigate?.();
      navigate(`/app/folders/${folder.id}`);
    } catch {
      // Keep the input open so the name can be adjusted and retried.
    }
  }

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
            <NavItem to="/app/billing" icon={<CreditCard size={17} aria-hidden="true" />} onNavigate={onNavigate}>
              Billing
            </NavItem>
          </div>
        </section>
      </nav>

      <section className="scrollbar-soft mt-6 min-h-0 flex-1 overflow-y-auto">
        <div className="px-2">
          <SidebarSectionTitle>Chats</SidebarSectionTitle>
        </div>
        <ul className="mt-2 space-y-1">
          {recentChats.length ? (
            recentChats.map((chat) => (
              <li key={chat.id}>
                <Link
                  to={`/app/chats/${chat.id}`}
                  onClick={onNavigate}
                  className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-sm transition ${
                    location.pathname === `/app/chats/${chat.id}`
                      ? "bg-teal-50 text-ink ring-1 ring-teal-100"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <MessagesSquare size={15} aria-hidden="true" className="shrink-0 text-sea" />
                  <span className="min-w-0 truncate font-medium">{chatTitle(chat)}</span>
                </Link>
              </li>
            ))
          ) : (
            <li>
              <Link
                to="/app/chats/new"
                onClick={onNavigate}
                className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:border-sea hover:bg-teal-50 hover:text-ink"
              >
                <Plus size={15} aria-hidden="true" />
                Start your first chat
              </Link>
            </li>
          )}
        </ul>

        <div className="mt-6 px-2">
          <SidebarSectionTitle>Folders</SidebarSectionTitle>
        </div>
        <ul className="mt-2 space-y-1">
          {folders.map((folder) => (
            <li key={folder.id}>
              <Link
                to={`/app/folders/${folder.id}`}
                onClick={onNavigate}
                className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-sm transition ${
                  location.pathname === `/app/folders/${folder.id}`
                    ? "bg-teal-50 text-ink ring-1 ring-teal-100"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Folder size={15} aria-hidden="true" className="shrink-0 text-sea" />
                <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {folder.documentCount}
                </span>
              </Link>
            </li>
          ))}
          <li>
            {isCreatingFolder ? (
              <input
                autoFocus
                aria-label="New folder name"
                value={folderNameDraft}
                onChange={(event) => setFolderNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitNewFolder();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setIsCreatingFolder(false);
                    setFolderNameDraft("");
                  }
                }}
                onBlur={() => {
                  setIsCreatingFolder(false);
                  setFolderNameDraft("");
                }}
                placeholder="Folder name..."
                maxLength={255}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-ink outline-none focus:border-sea focus:ring-4 focus:ring-teal-100"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsCreatingFolder(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-ink"
              >
                <Plus size={15} aria-hidden="true" />
                New folder
              </button>
            )}
          </li>
        </ul>

        <div className="mt-6 px-2">
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

async function uploadAndOpenDocument(
  api: ApiClient,
  navigate: ReturnType<typeof useNavigate>,
  file: File,
  folderId?: string
) {
  const format = documentFormatFromFilename(file.name);
  const localPreviewUrl = format === "pdf" ? URL.createObjectURL(file) : undefined;
  try {
    const result = await uploadDocument(api, file, folderId);
    const uploadedDocument = createUploadedDocumentSummary(result.documentId, result.status, file);
    notifyDocumentsChanged({ document: uploadedDocument });
    navigate(`/app/documents/${result.documentId}`, {
      state: {
        localPreviewUrl,
        format,
        originalFilename: file.name,
        fileSizeBytes: file.size,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    throw error;
  }
}

function DashboardRoute() {
  const navigate = useNavigate();
  const api = useAuthenticatedApiClient();

  async function onUploadFile(file: File) {
    if (!api) {
      return;
    }
    await uploadAndOpenDocument(api, navigate, file);
  }

  return (
    <DashboardPage
      api={api}
      onUploadFile={onUploadFile}
      onOpenChat={(chat) => navigate(`/app/chats/${chat.id}`)}
    />
  );
}

function FolderRoute() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const api = useAuthenticatedApiClient();

  if (!folderId) {
    return <Navigate to="/app/documents" replace />;
  }

  return (
    <FolderView
      api={api}
      folderId={folderId}
      onOpenDocument={(documentId) => navigate(`/app/documents/${documentId}`)}
      onOpenChat={(chatId) => navigate(`/app/chats/${chatId}`)}
      onDeleted={() => navigate("/app/documents")}
      onUploadFile={async (file) => {
        if (!api) {
          return;
        }
        await uploadAndOpenDocument(api, navigate, file, folderId);
      }}
      onFoldersChanged={notifyFoldersChanged}
    />
  );
}

function BillingRoute() {
  const api = useAuthenticatedApiClient();
  return <BillingPage api={api} />;
}

type RouteError = string | LimitExceededError | null;

function ErrorBanner({ error }: { error: RouteError }) {
  if (!error) {
    return null;
  }

  return (
    <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
      {typeof error === "string" ? error : <LimitExceededNotice error={error} />}
    </div>
  );
}

function LibraryRoute() {
  const navigate = useNavigate();
  const api = useAuthenticatedApiClient();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [folders, setFolders] = useState<FolderSummary[]>([]);

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
    if (api) {
      void listFolders(api).then(setFolders).catch(() => undefined);
    }
  }, [api]);

  return (
    <DocumentLibrary
      documents={documents}
      folders={folders}
      onOpen={(documentId) => navigate(`/app/documents/${documentId}`)}
      onMove={(documentId, folderId) => {
        if (!api) {
          return;
        }
        void moveDocument(api, documentId, folderId)
          .then(() => {
            notifyFoldersChanged();
            return refreshDocuments();
          })
          .catch(() => undefined);
      }}
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
      onNew={() => navigate("/app/chats/new")}
      onOpen={(chat) => navigate(`/app/chats/${chat.id}`)}
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

function NewChatRoute() {
  const navigate = useNavigate();
  const api = useAuthenticatedApiClient();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<RouteError>(null);

  useEffect(() => {
    if (!api) {
      return;
    }

    let cancelled = false;
    void listDocuments(api)
      .then((nextDocuments) => {
        if (!cancelled) {
          setDocuments(nextDocuments.filter((document) => document.status === "ready"));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  async function handleCreate(documentIds: string[], title?: string) {
    if (!api || isCreating) {
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);
    try {
      const chat = await createChat(api, documentIds, title);
      navigate(`/app/chats/${chat.id}`);
    } catch (error) {
      setErrorMessage(error instanceof LimitExceededError ? error : "Unable to start this conversation right now.");
      setIsCreating(false);
    }
  }

  return (
    <>
      <ErrorBanner error={errorMessage} />
      <ScopePicker
        documents={documents}
        isLoading={isLoading}
        isCreating={isCreating}
        onCreate={(documentIds, title) => void handleCreate(documentIds, title)}
      />
    </>
  );
}

function ChatRoute() {
  const { chatId } = useParams();
  const api = useAuthenticatedApiClient();
  const [chat, setChat] = useState<ChatSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<RouteError>(null);
  const [isLoading, setIsLoading] = useState(true);
  const chatAbortControllerRef = useRef<AbortController | null>(null);

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
      chatAbortControllerRef.current?.abort();
      chatAbortControllerRef.current = null;
    };
  }, [api, chatId]);

  async function handleSendMessage(content: string) {
    if (!api || !chatId) {
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
      const assistantMessage = await streamChatMessage(api, chatId, content, {
        signal: abortController.signal,
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
      if (!isAbortError(error)) {
        setErrorMessage(error instanceof LimitExceededError ? error : readableChatError(error));
      }
    } finally {
      if (chatAbortControllerRef.current === abortController) {
        chatAbortControllerRef.current = null;
      }
    }
  }

  return (
    <>
      <ErrorBanner error={errorMessage} />
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
  const [errorMessage, setErrorMessage] = useState<RouteError>(null);
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
      setErrorMessage(error instanceof LimitExceededError ? error : readableChatError(error));
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
      <ErrorBanner error={errorMessage} />
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

function notifyFoldersChanged() {
  window.dispatchEvent(new Event(FOLDERS_CHANGED_EVENT));
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
    format: documentFormatFromFilename(file.name),
    status,
    fileSizeBytes: file.size,
    createdAt: new Date().toISOString()
  };
}

const DOCUMENT_FORMATS: DocumentFormat[] = ["pdf", "docx", "pptx", "txt", "rtf"];

function documentFormatFromFilename(filename: string): DocumentFormat | undefined {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return DOCUMENT_FORMATS.find((format) => format === extension);
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
    format: uploadPreview?.format,
    status: "uploaded",
    fileSizeBytes: uploadPreview?.fileSizeBytes ?? 0,
    createdAt: uploadPreview?.createdAt ?? new Date().toISOString(),
    signedPdfUrl: uploadPreview?.format && uploadPreview.format !== "pdf" ? undefined : uploadPreview?.localPreviewUrl
  };
}

function readUploadPreviewState(state: unknown) {
  if (!state || typeof state !== "object") {
    return null;
  }

  const maybeState = state as Partial<{
    localPreviewUrl: unknown;
    format: unknown;
    originalFilename: unknown;
    fileSizeBytes: unknown;
    createdAt: unknown;
  }>;

  const localPreviewUrl = typeof maybeState.localPreviewUrl === "string" ? maybeState.localPreviewUrl : undefined;
  const originalFilename =
    typeof maybeState.originalFilename === "string" && maybeState.originalFilename.trim()
      ? maybeState.originalFilename
      : undefined;
  if (!localPreviewUrl && !originalFilename) {
    return null;
  }

  return {
    localPreviewUrl,
    format: DOCUMENT_FORMATS.find((format) => format === maybeState.format),
    originalFilename: originalFilename ?? "Uploaded PDF",
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

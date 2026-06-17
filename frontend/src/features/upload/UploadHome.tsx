import { type ReactNode, useState } from "react";
import { ArrowRight, FileClock, FileText, MessageCircle } from "lucide-react";
import { DocumentSummary } from "../../types";
import { documentStatusLabel, formatDate, formatFileSize, isProcessingStatus } from "../documents/status";
import { UploadDropzone } from "./UploadDropzone";

interface UploadHomeProps {
  documents: DocumentSummary[];
  onOpenDocument: (documentId: string) => void;
  onUploadFile?: (file: File) => Promise<void> | void;
}

const supportedFlow = [
  {
    title: "Preview the PDF",
    text: "Open the uploaded file inside the workspace.",
    icon: <FileText size={18} aria-hidden="true" />
  },
  {
    title: "Ask grounded questions",
    text: "Chat answers use retrieved text from this document.",
    icon: <MessageCircle size={18} aria-hidden="true" />
  },
  {
    title: "Jump to cited pages",
    text: "Inline page links take you back to the source page.",
    icon: <ArrowRight size={18} aria-hidden="true" />
  }
];

export function UploadHome({ documents, onOpenDocument, onUploadFile }: UploadHomeProps) {
  const [acceptedFile, setAcceptedFile] = useState<File | null>(null);
  const recentDocuments = documents.slice(0, 3);
  const processingDocuments = documents.filter((document) => isProcessingStatus(document.status));

  return (
    <main className="min-h-full bg-white px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="mx-auto w-full max-w-4xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sea">Workspace</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Chat with any PDF</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600">
            Upload a text-based PDF, ask questions, and jump back to cited pages from the answer.
          </p>
        </section>

        <section className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.86fr)]">
            <UploadDropzone
              onAccepted={(file) => {
                setAcceptedFile(file);
                void onUploadFile?.(file);
              }}
              initialProgress={72}
            />

            <div className="flex min-h-[280px] flex-col rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sea">Supported flow</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Upload once, chat with citations</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This workspace currently supports text-based PDFs, document preview, grounded chat, and page-linked citations.
              </p>
              <div className="mt-5 grid gap-3">
                {supportedFlow.map((item) => (
                  <div key={item.title} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-sea">
                      {item.icon}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">{item.title}</span>
                      <span className="mt-0.5 block text-sm leading-5 text-slate-600">{item.text}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {acceptedFile ? (
            <div role="status" aria-label="Upload accepted" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <span className="font-semibold">{acceptedFile.name}</span> is uploaded. Opening your workspace...
            </div>
          ) : null}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sea">Library</p>
                <h2 className="mt-1 text-2xl font-semibold text-ink">Recent documents</h2>
              </div>
              <button type="button" onClick={() => onOpenDocument("documents")} className="text-sm font-semibold text-sea hover:text-teal-800">
                View library
              </button>
            </div>
            <RecentDocuments documents={recentDocuments} onOpenDocument={onOpenDocument} />
          </section>

          <aside className="space-y-4">
            <DashboardInfoCard
              icon={<FileText size={20} aria-hidden="true" />}
              title={documents.length ? `${documents.length} PDFs` : "Empty state"}
              text={documents.length ? "Your latest files are ready from this dashboard." : "Upload directly from this screen to begin."}
              tone="teal"
            />

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-700">
                  <FileClock size={20} aria-hidden="true" />
                </span>
                <h2 className="font-semibold text-ink">Processing</h2>
              </div>
              {processingDocuments.length ? (
                <ul className="space-y-3">
                  {processingDocuments.map((document) => (
                    <li key={document.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="truncate text-sm font-medium text-ink">{document.originalFilename}</p>
                      <p className="mt-1 text-xs text-slate-600">{documentStatusLabel(document.status)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-6 text-slate-600">No documents are currently processing.</p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function RecentDocuments({
  documents,
  onOpenDocument
}: {
  documents: DocumentSummary[];
  onOpenDocument: (documentId: string) => void;
}) {
  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <h3 className="font-semibold text-ink">No PDFs yet</h3>
        <p className="mt-1 text-sm text-slate-600">Upload a PDF above to start asking grounded questions.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
      {documents.map((document) => (
        <li key={document.id}>
          <button
            type="button"
            onClick={() => onOpenDocument(document.id)}
            className="grid w-full gap-3 bg-white px-4 py-4 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_120px_100px]"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-sea">
                <FileText size={19} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{document.originalFilename}</span>
                <span className="mt-1 block text-sm text-slate-500">
                  Uploaded {formatDate(document.createdAt)} - {formatFileSize(document.fileSizeBytes)}
                </span>
              </span>
            </span>
            <StatusBadge document={document} />
            <span className="text-sm text-slate-600 md:text-right">{document.pageCount ? `${document.pageCount} pages` : "Pages pending"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ document }: { document: DocumentSummary }) {
  const tone =
    document.status === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : document.status === "failed"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span className={`inline-flex h-7 w-max items-center rounded-full border px-2.5 text-xs font-semibold ${tone}`}>
      {documentStatusLabel(document.status)}
    </span>
  );
}

function DashboardInfoCard({
  icon,
  title,
  text,
  tone
}: {
  icon: ReactNode;
  title: string;
  text: string;
  tone: "teal" | "amber";
}) {
  const toneClass = tone === "teal" ? "bg-teal-50 text-sea" : "bg-amber-50 text-amber-700";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-lg ${toneClass}`}>{icon}</span>
        <div>
          <h2 className="font-semibold text-ink">{title}</h2>
          <p className="text-sm leading-5 text-slate-600">{text}</p>
        </div>
      </div>
    </section>
  );
}

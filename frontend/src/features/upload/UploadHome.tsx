import { useState } from "react";
import { FileClock, FileText } from "lucide-react";
import { DocumentSummary } from "../../types";
import { DocumentLibrary } from "../documents/DocumentLibrary";
import { documentStatusLabel, isProcessingStatus } from "../documents/status";
import { UploadDropzone } from "./UploadDropzone";

interface UploadHomeProps {
  documents: DocumentSummary[];
  onOpenDocument: (documentId: string) => void;
}

export function UploadHome({ documents, onOpenDocument }: UploadHomeProps) {
  const [acceptedFile, setAcceptedFile] = useState<File | null>(null);
  const recentDocuments = documents.slice(0, 3);
  const processingDocuments = documents.filter((document) => isProcessingStatus(document.status));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">Upload</p>
            <h1 className="mt-1 text-3xl font-semibold text-ink">Start with a PDF</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Upload one text-based PDF at a time. Phase 1 supports PDF files up to 20 MB.
            </p>
          </section>

          <UploadDropzone onAccepted={setAcceptedFile} initialProgress={68} />

          {acceptedFile ? (
            <div role="status" aria-label="Upload accepted" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <span className="font-semibold">{acceptedFile.name}</span> is uploaded. Reading document...
            </div>
          ) : null}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-ink">Recent documents</h2>
              <button
                type="button"
                onClick={() => onOpenDocument("documents")}
                className="text-sm font-semibold text-sea hover:text-teal-800"
              >
                View library
              </button>
            </div>
            <DocumentLibrary documents={recentDocuments} onOpen={onOpenDocument} />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-teal-50 text-sea">
                <FileText size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold text-ink">Empty state</h2>
                <p className="text-sm text-slate-600">First-time users can upload directly from this screen.</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-amber-50 text-amber-700">
                <FileClock size={20} aria-hidden="true" />
              </span>
              <h2 className="font-semibold text-ink">Processing</h2>
            </div>
            {processingDocuments.length ? (
              <ul className="space-y-3">
                {processingDocuments.map((document) => (
                  <li key={document.id} className="rounded-md border border-slate-200 p-3">
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
    </main>
  );
}

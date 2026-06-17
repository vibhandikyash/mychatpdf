import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { FileUp, Loader2, UploadCloud } from "lucide-react";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

interface UploadDropzoneProps {
  onAccepted: (file: File) => void;
  initialProgress?: number;
}

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function UploadDropzone({ onAccepted, initialProgress = 100 }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  function acceptFile(file: File) {
    if (!isPdf(file)) {
      setError("Only PDF files are supported in Phase 1.");
      setFileName(null);
      setProgress(0);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("File too large. Upload a PDF under 20 MB.");
      setFileName(null);
      setProgress(0);
      return;
    }

    setError(null);
    setFileName(file.name);
    setProgress(initialProgress);
    onAccepted(file);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      acceptFile(file);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      acceptFile(file);
    }
  }

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={`flex min-h-[280px] flex-col justify-center rounded-xl border-2 border-dashed bg-white p-6 text-center transition ${
        isDragging ? "border-sea bg-teal-50/40 ring-4 ring-teal-100" : "border-slate-300"
      }`}
    >
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-teal-50 text-sea">
        <UploadCloud size={26} aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-ink">Drop your PDF here</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
        Drag a text-based PDF here or choose one from your computer. Uploads are validated before processing starts.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <input ref={inputRef} id="pdf-upload" type="file" accept="application/pdf,.pdf" onChange={onInputChange} className="sr-only" />
        <label
          htmlFor="pdf-upload"
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <FileUp size={18} aria-hidden="true" />
          Choose PDF
        </label>
        {fileName ? <span className="text-sm font-medium text-slate-700">{fileName}</span> : null}
      </div>

      {error ? (
        <p role="alert" className="mx-auto mt-4 max-w-md rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {progress > 0 ? (
        <div className="mx-auto mt-5 max-w-lg text-left">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Uploading PDF...
            </span>
            <span>{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 overflow-hidden rounded-full bg-slate-200"
          >
            <div className="h-full rounded-full bg-sea" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

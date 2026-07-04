export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "chunking"
  | "embedding"
  | "indexing"
  | "ready"
  | "failed"
  | "deleting";

export type DocumentFormat = "pdf" | "docx" | "pptx" | "txt" | "rtf";

export interface DocumentSummary {
  id: string;
  originalFilename: string;
  format?: DocumentFormat;
  status: DocumentStatus;
  fileSizeBytes: number;
  pageCount?: number;
  chunkCount?: number;
  createdAt: string;
  processedAt?: string;
  lastOpenedAt?: string;
  failureMessage?: string;
}

export interface Citation {
  sourceId: string;
  chunkId: string;
  pageStart: number;
  pageEnd: number;
  excerpt: string;
  score?: number;
  documentId?: string;
  documentFilename?: string;
}

export interface ChatDocumentRef {
  id: string;
  originalFilename: string;
  format?: DocumentFormat;
}

export interface ChatSummary {
  id: string;
  title: string | null;
  documents: ChatDocumentRef[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  sources?: Citation[];
}

export interface WorkspaceDocument extends DocumentSummary {
  signedPdfUrl?: string;
  pdfHttpHeaders?: Record<string, string>;
}

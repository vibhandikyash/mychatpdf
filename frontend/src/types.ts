export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "chunking"
  | "embedding"
  | "indexing"
  | "ready"
  | "failed"
  | "deleting";

export interface DocumentSummary {
  id: string;
  originalFilename: string;
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

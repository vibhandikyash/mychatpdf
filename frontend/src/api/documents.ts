import { ApiClient } from "./client";
import { ChatMessage, Citation, DocumentStatus, DocumentSummary } from "../types";

interface BackendDocumentSummary {
  id: string;
  original_filename: string;
  status: DocumentStatus;
  file_size_bytes: number;
  page_count?: number | null;
  chunk_count?: number | null;
  created_at: string;
  processed_at?: string | null;
  failure_message?: string | null;
}

interface BackendDocumentsResponse {
  items: BackendDocumentSummary[];
  next_cursor: string | null;
}

interface BackendProcessingStatus {
  document_id: string;
  status: DocumentStatus;
  current_step: string | null;
  failure_code: string | null;
  failure_message: string | null;
}

interface BackendUploadResponse {
  id: string;
  status: DocumentStatus;
  processing_job_id: string;
}

interface BackendChatResponse {
  chat: {
    id: string;
    document_id: string;
    title: string | null;
  };
  messages: Array<{
    id: string;
    role: ChatMessage["role"];
    content: string;
    created_at: string;
    sources: Array<{
      source_id: string;
      chunk_id: string;
      page_start: number;
      page_end: number;
      excerpt: string;
      score?: number | null;
    }>;
  }>;
}

export function mapDocumentSummary(document: BackendDocumentSummary): DocumentSummary {
  return {
    id: document.id,
    originalFilename: document.original_filename,
    status: document.status,
    fileSizeBytes: document.file_size_bytes,
    pageCount: document.page_count ?? undefined,
    chunkCount: document.chunk_count ?? undefined,
    createdAt: document.created_at,
    processedAt: document.processed_at ?? undefined,
    failureMessage: document.failure_message ?? undefined
  };
}

function mapCitation(source: BackendChatResponse["messages"][number]["sources"][number]): Citation {
  return {
    sourceId: source.source_id,
    chunkId: source.chunk_id,
    pageStart: source.page_start,
    pageEnd: source.page_end,
    excerpt: source.excerpt,
    score: source.score ?? undefined
  };
}

function mapStreamCitation(source: {
  chunk_id: string;
  page_start: number;
  page_end: number;
  excerpt: string;
  score?: number | null;
}, index: number): Citation {
  return {
    sourceId: `${source.chunk_id}-${index}`,
    chunkId: source.chunk_id,
    pageStart: source.page_start,
    pageEnd: source.page_end,
    excerpt: source.excerpt,
    score: source.score ?? undefined
  };
}

function parseServerSentEvents(raw: string): Array<{ event: string; data: Record<string, unknown> }> {
  return raw
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));
      return {
        event: eventLine?.slice(7) ?? "message",
        data: dataLine ? JSON.parse(dataLine.slice(6)) : {}
      };
    });
}

export async function listDocuments(client: ApiClient): Promise<DocumentSummary[]> {
  const response = await client.request<BackendDocumentsResponse>("/api/documents");
  return response.items.map(mapDocumentSummary);
}

export async function uploadDocument(client: ApiClient, file: File) {
  const formData = new FormData();
  formData.set("file", file);
  const response = await client.request<BackendUploadResponse>("/api/documents", {
    method: "POST",
    body: formData
  });
  return {
    documentId: response.id,
    status: response.status,
    processingJobId: response.processing_job_id
  };
}

export async function getDocumentFileUrl(client: ApiClient, documentId: string) {
  return client.request<{ url: string; expires_at: string }>(`/api/documents/${documentId}/file-url`);
}

export async function getDocumentProcessingStatus(client: ApiClient, documentId: string) {
  const response = await client.request<BackendProcessingStatus>(`/api/documents/${documentId}/processing-status`);
  return {
    documentId: response.document_id,
    status: response.status,
    currentStep: response.current_step ?? undefined,
    failureCode: response.failure_code ?? undefined,
    failureMessage: response.failure_message ?? undefined
  };
}

export async function getDocumentChat(client: ApiClient, documentId: string): Promise<ChatMessage[]> {
  const response = await client.request<BackendChatResponse>(`/api/documents/${documentId}/chat`);
  return response.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.created_at,
    sources: message.sources.map(mapCitation)
  }));
}

export async function sendChatMessage(client: ApiClient, documentId: string, content: string): Promise<ChatMessage> {
  const raw = await client.requestText(`/api/documents/${documentId}/chat/stream`, {
    method: "POST",
    body: JSON.stringify({ content })
  });
  const events = parseServerSentEvents(raw);
  const errorEvent = events.find((event) => event.event === "error");
  if (errorEvent) {
    throw new Error(String(errorEvent.data.message ?? "Unable to generate an answer right now."));
  }

  const start = events.find((event) => event.event === "message_start");
  const messageId = String(start?.data.message_id ?? crypto.randomUUID());
  const contentText = events
    .filter((event) => event.event === "token")
    .map((event) => String(event.data.text ?? ""))
    .join("");
  const sourceItems = events.find((event) => event.event === "sources")?.data.items;
  const sources = Array.isArray(sourceItems)
    ? sourceItems.map((source, index) =>
        mapStreamCitation(
          source as {
            chunk_id: string;
            page_start: number;
            page_end: number;
            excerpt: string;
            score?: number | null;
          },
          index
        )
      )
    : [];

  return {
    id: messageId,
    role: "assistant",
    content: contentText,
    createdAt: new Date().toISOString(),
    sources
  };
}

export async function deleteDocument(client: ApiClient, documentId: string) {
  return client.request<{ status: DocumentStatus }>(`/api/documents/${documentId}`, {
    method: "DELETE"
  });
}

export async function retryDocumentProcessing(client: ApiClient, documentId: string) {
  return client.request<{ processing_job_id: string; status: string }>(`/api/documents/${documentId}/retry`, {
    method: "POST"
  });
}

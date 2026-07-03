import { ApiClient } from "./client";
import { SendChatMessageHandlers, streamAssistantMessage } from "./documents";
import { ChatMessage, ChatSummary } from "../types";

interface BackendChatSummary {
  id: string;
  title: string | null;
  documents: Array<{ id: string; original_filename: string }>;
  created_at: string;
  updated_at: string;
}

interface BackendChatsResponse {
  items: BackendChatSummary[];
  next_cursor: string | null;
}

interface BackendChatDetail {
  chat: BackendChatSummary;
  messages: Array<{
    id: string;
    role: ChatMessage["role"];
    content: string;
    created_at: string;
    sources: Array<{
      source_id: string;
      chunk_id: string | null;
      document_filename: string;
      page_start: number;
      page_end: number;
      excerpt: string;
      score?: number | null;
    }>;
  }>;
}

export interface ChatsPage {
  items: ChatSummary[];
  nextCursor: string | null;
}

export interface ChatDetail {
  chat: ChatSummary;
  messages: ChatMessage[];
}

export function mapChatSummary(chat: BackendChatSummary): ChatSummary {
  return {
    id: chat.id,
    title: chat.title,
    documents: chat.documents.map((document) => ({
      id: document.id,
      originalFilename: document.original_filename
    })),
    createdAt: chat.created_at,
    updatedAt: chat.updated_at
  };
}

function mapChatMessage(message: BackendChatDetail["messages"][number]): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.created_at,
    sources: message.sources.map((source) => ({
      sourceId: source.source_id,
      chunkId: source.chunk_id ?? "",
      documentFilename: source.document_filename,
      pageStart: source.page_start,
      pageEnd: source.page_end,
      excerpt: source.excerpt,
      score: source.score ?? undefined
    }))
  };
}

export async function listChats(client: ApiClient, cursor?: string): Promise<ChatsPage> {
  const params = new URLSearchParams({ limit: "50" });
  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await client.request<BackendChatsResponse>(`/api/chats?${params.toString()}`);
  return {
    items: response.items.map(mapChatSummary),
    nextCursor: response.next_cursor
  };
}

export async function createChat(client: ApiClient, documentIds: string[], title?: string): Promise<ChatSummary> {
  const response = await client.request<BackendChatSummary>("/api/chats", {
    method: "POST",
    body: JSON.stringify(title ? { document_ids: documentIds, title } : { document_ids: documentIds })
  });
  return mapChatSummary(response);
}

export async function getChat(client: ApiClient, chatId: string): Promise<ChatDetail> {
  const response = await client.request<BackendChatDetail>(`/api/chats/${chatId}`);
  return {
    chat: mapChatSummary(response.chat),
    messages: response.messages.map(mapChatMessage)
  };
}

export async function renameChat(client: ApiClient, chatId: string, title: string): Promise<ChatSummary> {
  const response = await client.request<BackendChatSummary>(`/api/chats/${chatId}`, {
    method: "PATCH",
    body: JSON.stringify({ title })
  });
  return mapChatSummary(response);
}

export async function deleteChat(client: ApiClient, chatId: string) {
  return client.request<{ status: string }>(`/api/chats/${chatId}`, {
    method: "DELETE"
  });
}

export async function streamChatMessage(
  client: ApiClient,
  chatId: string,
  content: string,
  handlers: SendChatMessageHandlers = {}
): Promise<ChatMessage> {
  return streamAssistantMessage(client, `/api/chats/${chatId}/messages/stream`, content, handlers);
}

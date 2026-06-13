import { describe, expect, it } from "vitest";
import { ApiClient } from "./client";
import { getDocumentProcessingStatus, listDocuments, mapDocumentSummary, sendChatMessage, uploadDocument } from "./documents";

describe("document API helpers", () => {
  it("maps backend document summaries to frontend document shape", () => {
    expect(
      mapDocumentSummary({
        id: "doc-1",
        original_filename: "paper.pdf",
        status: "ready",
        file_size_bytes: 1024,
        page_count: 4,
        chunk_count: 8,
        created_at: "2026-06-13T00:00:00Z",
        processed_at: "2026-06-13T00:01:00Z",
        failure_message: null
      })
    ).toMatchObject({
      id: "doc-1",
      originalFilename: "paper.pdf",
      status: "ready",
      fileSizeBytes: 1024,
      pageCount: 4,
      chunkCount: 8
    });
  });

  it("lists documents through the authenticated API client", async () => {
    const client = new ApiClient({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: "doc-1",
                original_filename: "paper.pdf",
                status: "ready",
                file_size_bytes: 1024,
                created_at: "2026-06-13T00:00:00Z"
              }
            ],
            next_cursor: null
          }),
          { status: 200 }
        )
    });

    await expect(listDocuments(client)).resolves.toHaveLength(1);
  });

  it("uploads PDF files as multipart form data", async () => {
    let uploadedBody: BodyInit | null | undefined;
    const client = new ApiClient({
      fetcher: async (_input, init) => {
        uploadedBody = init?.body;
        return new Response(JSON.stringify({ id: "doc-1", status: "uploaded", processing_job_id: "job-1" }), {
          status: 201
        });
      }
    });

    const result = await uploadDocument(client, new File(["%PDF"], "paper.pdf", { type: "application/pdf" }));

    expect(result.documentId).toBe("doc-1");
    expect(uploadedBody).toBeInstanceOf(FormData);
  });

  it("gets document processing status", async () => {
    const client = new ApiClient({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            document_id: "doc-1",
            status: "embedding",
            current_step: "embedding",
            failure_code: null,
            failure_message: null
          }),
          { status: 200 }
        )
    });

    await expect(getDocumentProcessingStatus(client, "doc-1")).resolves.toMatchObject({
      documentId: "doc-1",
      status: "embedding",
      currentStep: "embedding"
    });
  });

  it("parses streamed chat responses into an assistant message", async () => {
    const client = new ApiClient({
      fetcher: async (_input, init) => {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ content: "What changed?" }));
        return new Response(
          [
            'event: message_start\ndata: {"message_id":"msg-1"}',
            'event: token\ndata: {"text":"Hello "}',
            'event: token\ndata: {"text":"world"}',
            'event: sources\ndata: {"items":[{"chunk_id":"chunk-1","page_start":2,"page_end":2,"excerpt":"Source text","score":0.9}]}',
            'event: message_done\ndata: {"message_id":"msg-1"}'
          ].join("\n\n"),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        );
      }
    });

    await expect(sendChatMessage(client, "doc-1", "What changed?")).resolves.toMatchObject({
      id: "msg-1",
      role: "assistant",
      content: "Hello world",
      sources: [
        {
          chunkId: "chunk-1",
          pageStart: 2,
          pageEnd: 2,
          excerpt: "Source text",
          score: 0.9
        }
      ]
    });
  });
});

import { describe, expect, it } from "vitest";
import { ApiClient } from "./client";
import { listDocuments, mapDocumentSummary, uploadDocument } from "./documents";

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
});


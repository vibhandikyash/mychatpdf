import { describe, expect, it } from "vitest";
import { ApiClient } from "./client";

describe("ApiClient", () => {
  it("attaches Clerk bearer tokens to protected requests", async () => {
    let requestInit: RequestInit | undefined;
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const client = new ApiClient({
      baseUrl: "https://api.example.test",
      getToken: async () => "clerk-token",
      fetcher
    });

    await client.request("/documents");

    expect((requestInit?.headers as Headers).get("Authorization")).toBe("Bearer clerk-token");
  });
});

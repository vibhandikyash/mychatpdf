import { screen, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { App } from "./App";

vi.mock("@clerk/clerk-react", () => ({
  AuthenticateWithRedirectCallback: () => <div>Completing sign in</div>,
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  UserButton: () => <button type="button">Account</button>,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: async () => "test-token"
  }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      authenticateWithRedirect: vi.fn(),
      create: vi.fn()
    },
    setActive: vi.fn()
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      authenticateWithRedirect: vi.fn(),
      attemptEmailAddressVerification: vi.fn(),
      create: vi.fn(),
      prepareEmailAddressVerification: vi.fn()
    },
    setActive: vi.fn()
  })
}));

describe("App auth routes", () => {
  it("renders the sign-up shell on Clerk verification subroutes", () => {
    render(
      <MemoryRouter initialEntries={["/sign-up/verify-email-address"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Upload, ask, and verify answers against the original PDF." })).toBeInTheDocument();
    expect(screen.getByText("MyPDFChat")).toBeInTheDocument();
  });
});

describe("App shell", () => {
  it("loads real recent documents into the sidebar", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "doc-1",
              original_filename: "contract.pdf",
              status: "ready",
              file_size_bytes: 100,
              created_at: "2026-06-14T00:00:00Z"
            }
          ],
          next_cursor: null
        }),
        { status: 200 }
      );

    try {
      render(
        <MemoryRouter initialEntries={["/app"]}>
          <App />
        </MemoryRouter>
      );

      expect(await screen.findByRole("link", { name: /contract\.pdf/i })).toHaveAttribute(
        "href",
        "/app/documents/doc-1"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps the workspace open when optional PDF resources are not ready yet", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(requestUrl);

      if (url.pathname === "/api/documents") {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "doc-1",
                original_filename: "contract.pdf",
                status: "ready",
                file_size_bytes: 100,
                page_count: 3,
                created_at: "2026-06-14T00:00:00Z"
              }
            ],
            next_cursor: null
          }),
          { status: 200 }
        );
      }

      if (url.pathname === "/api/documents/doc-1") {
        return new Response(
          JSON.stringify({
            id: "doc-1",
            original_filename: "contract.pdf",
            status: "ready",
            file_size_bytes: 100,
            page_count: 3,
            created_at: "2026-06-14T00:00:00Z"
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ detail: "temporarily unavailable" }), { status: 503 });
    };

    try {
      render(
        <MemoryRouter initialEntries={["/app/documents/doc-1"]}>
          <App />
        </MemoryRouter>
      );

      expect(await screen.findByText("Ready to chat")).toBeInTheDocument();
      expect(screen.getByRole("status", { name: /opening pdf preview/i })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText("Unable to load this document.")).not.toBeInTheDocument());
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

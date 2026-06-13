import { screen } from "@testing-library/react";
import { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { App } from "./App";

vi.mock("@clerk/clerk-react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignIn: () => <div />,
  SignUp: () => <div />,
  UserButton: () => <button type="button">Account</button>,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: async () => "test-token"
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
    expect(screen.getByText("MyChatPDF")).toBeInTheDocument();
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

      expect(await screen.findByRole("link", { name: "contract.pdf" })).toHaveAttribute(
        "href",
        "/app/documents/doc-1"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

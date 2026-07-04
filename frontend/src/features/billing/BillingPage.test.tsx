import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiClient } from "../../api/client";
import { renderWithRouter } from "../../test/test-utils";
import { BillingPage } from "./BillingPage";

const plans = [
  {
    id: "free",
    name: "Free",
    interval: null,
    limit_ai_messages: 25,
    limit_uploads: 3,
    limit_storage_mb: 50,
    limit_document_scope: 2,
    allowed_chat_models: ["gpt-4.1-mini"]
  },
  {
    id: "pro_monthly",
    name: "Pro Monthly",
    interval: "month",
    limit_ai_messages: 1000,
    limit_uploads: 100,
    limit_storage_mb: 2048,
    limit_document_scope: 10,
    allowed_chat_models: ["gpt-4.1-mini", "gpt-4.1"]
  }
];

const freeSubscription = {
  plan: { id: "free", name: "Free", interval: null },
  status: null,
  current_period_end: null,
  cancel_at_period_end: false
};

const usage = {
  plan: { id: "free", name: "Free" },
  period_start: "2026-07-01T00:00:00Z",
  period_end: "2026-08-01T00:00:00Z",
  ai_messages: { used: 12, limit: 25 },
  uploads: { used: 1, limit: 3 },
  storage_mb: { used: 10, limit: 50 }
};

function fakeApi({ portalStatus = 200 }: { portalStatus?: number } = {}) {
  return new ApiClient({
    fetcher: async (input) => {
      const url = String(input);
      if (url.endsWith("/api/billing/plans")) {
        return new Response(JSON.stringify({ items: plans }), { status: 200 });
      }
      if (url.endsWith("/api/billing/me")) {
        return new Response(JSON.stringify(freeSubscription), { status: 200 });
      }
      if (url.endsWith("/api/usage")) {
        return new Response(JSON.stringify(usage), { status: 200 });
      }
      if (url.endsWith("/api/billing/portal")) {
        return new Response(JSON.stringify({ detail: "Billing is not configured" }), { status: portalStatus });
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  });
}

describe("BillingPage", () => {
  it("renders the plan matrix with the current plan marked", async () => {
    renderWithRouter(<BillingPage api={fakeApi()} />, ["/app/billing"]);

    expect(await screen.findByRole("heading", { name: "Pro Monthly" })).toBeInTheDocument();
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.getByText("1000 AI messages per period")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose this plan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manage billing/i })).toBeInTheDocument();
  });

  it("shows usage meters for the three quotas", async () => {
    renderWithRouter(<BillingPage api={fakeApi()} />, ["/app/billing"]);

    expect(await screen.findByRole("progressbar", { name: "AI messages usage" })).toHaveAttribute("aria-valuenow", "12");
    expect(screen.getByRole("progressbar", { name: "Uploads usage" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("progressbar", { name: "Storage usage" })).toHaveAttribute("aria-valuenow", "10");
    expect(screen.getByText("10 MB / 50 MB")).toBeInTheDocument();
  });

  it("shows a quiet note when billing is not configured", async () => {
    const user = userEvent.setup();
    renderWithRouter(<BillingPage api={fakeApi({ portalStatus: 503 })} />, ["/app/billing"]);

    await user.click(await screen.findByRole("button", { name: /manage billing/i }));

    expect(await screen.findByText("Billing is not configured in this environment.")).toBeInTheDocument();
  });

  it("shows a banner when returning from a successful checkout", async () => {
    renderWithRouter(<BillingPage api={fakeApi()} />, ["/app/billing?checkout=success"]);

    expect(await screen.findByText(/payment complete/i)).toBeInTheDocument();
  });

  it("shows a banner when checkout was cancelled", async () => {
    renderWithRouter(<BillingPage api={fakeApi()} />, ["/app/billing?checkout=canceled"]);

    expect(await screen.findByText(/checkout was cancelled/i)).toBeInTheDocument();
  });
});

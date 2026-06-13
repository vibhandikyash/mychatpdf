import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { App } from "./App";

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

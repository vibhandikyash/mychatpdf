import { screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentWorkspace } from "./DocumentWorkspace";
import { mockWorkspaceDocument, mockMessages } from "../../mocks/documents";
import { WorkspaceDocument } from "../../types";

describe("DocumentWorkspace", () => {
  it("updates the active PDF page when a citation is clicked", async () => {
    const user = userEvent.setup();

    render(<DocumentWorkspace document={mockWorkspaceDocument} messages={mockMessages} />);

    expect(screen.getByText(/page 1 of 24/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open source page 7/i }));

    expect(screen.getByText(/page 7 of 24/i)).toBeInTheDocument();
  });

  it("renders the signed PDF URL in the viewer", () => {
    render(
      <DocumentWorkspace
        document={{ ...mockWorkspaceDocument, signedPdfUrl: "https://files.example.com/paper.pdf" }}
        messages={[]}
      />
    );

    expect(screen.getByTitle("PDF preview")).toHaveAttribute(
      "src",
      "https://files.example.com/paper.pdf#page=1&zoom=100"
    );
  });

  it("disables the composer when the document is not ready", () => {
    const processingDocument: WorkspaceDocument = {
      ...mockWorkspaceDocument,
      status: "embedding"
    };

    render(<DocumentWorkspace document={processingDocument} messages={[]} />);

    expect(screen.getByRole("textbox", { name: /ask this document/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
    expect(screen.getByText(/preparing document for chat/i)).toBeInTheDocument();
  });

  it("shows mobile PDF and chat segment controls", async () => {
    const user = userEvent.setup();

    render(<DocumentWorkspace document={mockWorkspaceDocument} messages={mockMessages} />);

    expect(screen.getByRole("tab", { name: /pdf/i })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: /chat/i }));

    expect(screen.getByRole("tab", { name: /chat/i })).toHaveAttribute("aria-selected", "true");
  });

  it("shows a generating state while a message is being sent", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn(() => new Promise<void>(() => undefined));

    render(<DocumentWorkspace document={mockWorkspaceDocument} messages={[]} onSendMessage={onSendMessage} />);

    await user.type(screen.getByRole("textbox", { name: /ask this document/i }), "Summarize this document.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(onSendMessage).toHaveBeenCalledWith("Summarize this document.");
    expect(screen.getByRole("status", { name: /generating answer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
  });
});

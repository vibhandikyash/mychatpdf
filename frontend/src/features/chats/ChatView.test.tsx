import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatView } from "./ChatView";
import { renderWithRouter } from "../../test/test-utils";
import { ChatMessage, ChatSummary } from "../../types";

const chat: ChatSummary = {
  id: "chat-1",
  title: "Contract vs deck",
  documents: [
    { id: "doc-1", originalFilename: "contract-a.pdf", format: "pdf" },
    { id: "doc-2", originalFilename: "kickoff-deck.pptx", format: "pptx" }
  ],
  createdAt: "2026-06-10T09:30:00Z",
  updatedAt: "2026-06-12T15:15:00Z"
};

const messages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "user",
    content: "Compare the payment terms.",
    createdAt: "2026-06-12T15:14:00Z"
  },
  {
    id: "msg-2",
    role: "assistant",
    content: "Contract A nets 30 days; the deck proposes 45.",
    createdAt: "2026-06-12T15:15:00Z",
    sources: [
      {
        sourceId: "src-1",
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentFilename: "contract-a.pdf",
        pageStart: 12,
        pageEnd: 13,
        excerpt: "Payment is due within 30 days."
      },
      {
        sourceId: "src-2",
        chunkId: "chunk-2",
        documentId: "doc-2",
        documentFilename: "kickoff-deck.pptx",
        pageStart: 3,
        pageEnd: 3,
        excerpt: "Proposed terms: net 45."
      }
    ]
  }
];

describe("ChatView", () => {
  it("shows the scope header with document names and formats", () => {
    renderWithRouter(<ChatView chat={chat} messages={messages} />);

    expect(screen.getByRole("heading", { name: "Contract vs deck" })).toBeInTheDocument();
    expect(screen.getByText("contract-a.pdf")).toBeInTheDocument();
    expect(screen.getByText("kickoff-deck.pptx")).toBeInTheDocument();
  });

  it("links PDF citations to the document workspace with a page label", () => {
    renderWithRouter(<ChatView chat={chat} messages={messages} />);

    const pdfCitation = screen.getByRole("link", { name: "contract-a.pdf · pp. 12-13" });
    expect(pdfCitation).toHaveAttribute("href", "/app/documents/doc-1");
  });

  it("renders non-PDF citations as plain slide labels", () => {
    renderWithRouter(<ChatView chat={chat} messages={messages} />);

    const pptxCitation = screen.getByText("kickoff-deck.pptx · slide 3");
    expect(pptxCitation).toBeInTheDocument();
    expect(pptxCitation.closest("a")).toBeNull();
  });
});

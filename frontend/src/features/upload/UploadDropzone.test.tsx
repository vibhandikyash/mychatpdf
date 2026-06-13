import { fireEvent, screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadDropzone } from "./UploadDropzone";

describe("UploadDropzone", () => {
  it("rejects non-PDF files with clear validation copy", async () => {
    const onAccepted = vi.fn();
    const user = userEvent.setup();

    render(<UploadDropzone onAccepted={onAccepted} />);

    const input = screen.getByLabelText(/choose pdf/i);
    fireEvent.change(input, {
      target: { files: [new File(["notes"], "notes.txt", { type: "text/plain" })] }
    });

    expect(onAccepted).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/only pdf files are supported/i);
  });

  it("shows upload progress when a valid PDF is accepted", async () => {
    const user = userEvent.setup();

    render(<UploadDropzone onAccepted={() => undefined} initialProgress={42} />);

    const input = screen.getByLabelText(/choose pdf/i);
    await user.upload(input, new File(["%PDF"], "report.pdf", { type: "application/pdf" }));

    expect(screen.getByRole("progressbar", { name: /upload progress/i })).toHaveAttribute("aria-valuenow", "42");
  });

  it("rejects PDFs larger than 20 MB before upload", async () => {
    const onAccepted = vi.fn();
    const user = userEvent.setup();
    const largePdf = new File([new Uint8Array(21 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });

    render(<UploadDropzone onAccepted={onAccepted} />);

    await user.upload(screen.getByLabelText(/choose pdf/i), largePdf);

    expect(onAccepted).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/under 20 mb/i);
  });
});

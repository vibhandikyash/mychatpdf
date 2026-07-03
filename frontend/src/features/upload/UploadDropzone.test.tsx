import { fireEvent, screen } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SUPPORTED_UPLOAD_EXTENSIONS, UPLOAD_ACCEPT, UploadDropzone } from "./UploadDropzone";

describe("UploadDropzone", () => {
  it("exposes the full supported accept list on the file input", () => {
    render(<UploadDropzone onAccepted={() => undefined} />);

    expect(UPLOAD_ACCEPT).toBe(".pdf,.docx,.pptx,.txt,.rtf");
    expect(screen.getByLabelText(/choose file/i)).toHaveAttribute("accept", ".pdf,.docx,.pptx,.txt,.rtf");
  });

  it.each(SUPPORTED_UPLOAD_EXTENSIONS.map((extension) => [extension]))(
    "accepts a %s file",
    async (extension) => {
      const onAccepted = vi.fn();
      const user = userEvent.setup();

      render(<UploadDropzone onAccepted={onAccepted} />);

      await user.upload(
        screen.getByLabelText(/choose file/i),
        new File(["content"], `sample${extension}`, { type: "application/octet-stream" })
      );

      expect(onAccepted).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects unsupported files with clear validation copy", async () => {
    const onAccepted = vi.fn();

    render(<UploadDropzone onAccepted={onAccepted} />);

    const input = screen.getByLabelText(/choose file/i);
    fireEvent.change(input, {
      target: { files: [new File(["binary"], "setup.exe", { type: "application/octet-stream" })] }
    });

    expect(onAccepted).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/unsupported file type\. upload a pdf, docx, pptx, txt, or rtf file/i);
  });

  it("shows upload progress when a valid PDF is accepted", async () => {
    const user = userEvent.setup();

    render(<UploadDropzone onAccepted={() => undefined} initialProgress={42} />);

    const input = screen.getByLabelText(/choose file/i);
    await user.upload(input, new File(["%PDF"], "report.pdf", { type: "application/pdf" }));

    expect(screen.getByRole("progressbar", { name: /upload progress/i })).toHaveAttribute("aria-valuenow", "42");
  });

  it("rejects files larger than 20 MB before upload", async () => {
    const onAccepted = vi.fn();
    const user = userEvent.setup();
    const largePdf = new File([new Uint8Array(21 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });

    render(<UploadDropzone onAccepted={onAccepted} />);

    await user.upload(screen.getByLabelText(/choose file/i), largePdf);

    expect(onAccepted).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/under 20 mb/i);
  });
});

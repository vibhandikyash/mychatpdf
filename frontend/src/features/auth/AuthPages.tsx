import { SignIn, SignUp } from "@clerk/clerk-react";
import { FileText } from "lucide-react";

interface AuthPageProps {
  mode: "sign-in" | "sign-up";
}

export function AuthPage({ mode }: AuthPageProps) {
  const hasClerkKey = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  const title = mode === "sign-in" ? "Sign in to MyChatPDF" : "Create your MyChatPDF account";

  return (
    <main className="grid min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.14),_transparent_32%),#f6f8fb] px-4 py-8 lg:grid-cols-[1fr_480px] lg:px-12">
      <section className="flex flex-col justify-between py-6">
        <div className="flex items-center gap-3 text-ink">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-ink text-white">
            <FileText size={22} aria-hidden="true" />
          </span>
          <span className="text-xl font-semibold">MyChatPDF</span>
        </div>
        <div className="max-w-2xl py-14">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-sea">Document-first AI</p>
          <h1 className="text-4xl font-semibold leading-tight text-ink sm:text-5xl">
            Upload, ask, and verify answers against the original PDF.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            Phase 1 keeps the flow focused: authenticated uploads, document status visibility, grounded chat,
            and citations that jump back to the page.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
          {hasClerkKey ? (
            mode === "sign-in" ? (
              <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
            ) : (
              <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
            )
          ) : (
            <div className="p-6">
              <h2 className="text-xl font-semibold text-ink">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Add <code className="rounded bg-slate-100 px-1.5 py-0.5">VITE_CLERK_PUBLISHABLE_KEY</code> to
                enable the hosted Clerk form in this shell.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

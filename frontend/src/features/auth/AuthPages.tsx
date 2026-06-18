import { SignIn, SignUp } from "@clerk/clerk-react";
import { CheckCircle2, FileSearch, LockKeyhole, MessageSquareText, Sparkles } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BrandLockup, BrandMark, PRODUCT_NAME } from "../brand/Brand";

interface AuthPageProps {
  mode: "sign-in" | "sign-up";
}

export function AuthPage({ mode }: AuthPageProps) {
  const hasClerkKey = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  const title = mode === "sign-in" ? `Sign in to ${PRODUCT_NAME}` : `Create your ${PRODUCT_NAME} account`;
  const location = useLocation();
  const authCardRef = useRef<HTMLDivElement>(null);
  const [showEmptyNestedRouteFallback, setShowEmptyNestedRouteFallback] = useState(false);
  const basePath = mode === "sign-in" ? "/sign-in" : "/sign-up";
  const isNestedAuthPath = hasClerkKey && location.pathname.startsWith(`${basePath}/`);

  useEffect(() => {
    setShowEmptyNestedRouteFallback(false);

    if (!isNestedAuthPath) {
      return;
    }

    const hasRenderedClerkUi = () => {
      const clerkRoot = authCardRef.current?.querySelector(".cl-rootBox");
      return Boolean(
        clerkRoot &&
          ((clerkRoot.textContent?.trim().length ?? 0) > 0 || clerkRoot.querySelector("input, button, a"))
      );
    };

    const refreshFallback = () => {
      setShowEmptyNestedRouteFallback(!hasRenderedClerkUi());
    };

    const timer = window.setTimeout(refreshFallback, 1800);
    const observer = new MutationObserver(refreshFallback);

    if (authCardRef.current) {
      observer.observe(authCardRef.current, { childList: true, subtree: true, characterData: true });
    }

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [isNestedAuthPath, location.pathname]);

  return (
    <main className="auth-page min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#f8fbfc_0%,#eef7f6_46%,#f8fafc_100%)] px-3 py-5 text-ink sm:px-6 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-7xl flex-col">
        <header className="flex items-center justify-between gap-4 py-2">
          <Link to="/app" className="rounded-xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-teal-200">
            <BrandLockup markClassName="h-11 w-11 shrink-0" textClassName="text-xl font-semibold tracking-tight" />
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-teal-100 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm sm:flex">
            <LockKeyhole size={16} className="text-sea" aria-hidden="true" />
            Private document workspace
          </div>
        </header>

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_440px] xl:gap-14">
          <section className="order-2 min-w-0 lg:order-1">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sea">PDF intelligence, grounded</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-5xl lg:text-6xl">
                Chat with every PDF and keep the source in view.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                A focused workspace for upload, preview, streaming answers, and cited pages that stay connected to
                the original document.
              </p>
            </div>

            <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
              <AuthSignal icon={<FileSearch size={18} aria-hidden="true" />} title="Preview" body="Read beside the chat." />
              <AuthSignal
                icon={<MessageSquareText size={18} aria-hidden="true" />}
                title="Ask"
                body="Stream answers as they form."
              />
              <AuthSignal icon={<CheckCircle2 size={18} aria-hidden="true" />} title="Verify" body="Jump back to pages." />
            </div>

            <div className="mt-9 max-w-4xl rounded-lg border border-slate-200 bg-white/90 p-4 shadow-panel backdrop-blur">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sea">PDF viewer</p>
                      <p className="mt-1 truncate text-sm font-semibold text-ink">market-analysis-brief.pdf</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      Ready
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="h-3 w-3/4 rounded-full bg-slate-300" />
                    <div className="h-3 w-full rounded-full bg-slate-200" />
                    <div className="h-3 w-11/12 rounded-full bg-slate-200" />
                    <div className="rounded-md border border-teal-200 bg-white p-3">
                      <div className="h-2.5 w-2/3 rounded-full bg-teal-200" />
                      <div className="mt-2 h-2.5 w-5/6 rounded-full bg-slate-200" />
                      <div className="mt-2 h-2.5 w-3/5 rounded-full bg-slate-200" />
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <BrandMark className="h-8 w-8 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sea">Document chat</p>
                      <p className="text-sm font-semibold text-ink">Source-backed answer</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-md bg-ink px-4 py-3 text-sm leading-6 text-white">
                    Which pages explain the revenue risk?
                  </div>
                  <div className="mt-4 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                    <div className="h-2.5 w-full rounded-full bg-slate-300" />
                    <div className="h-2.5 w-11/12 rounded-full bg-slate-200" />
                    <div className="h-2.5 w-4/5 rounded-full bg-slate-200" />
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-sea">Page 4</span>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Page 8
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="order-1 flex min-w-0 justify-center px-1 lg:order-2 lg:justify-end lg:px-0">
            <div
              ref={authCardRef}
              className="auth-clerk-card w-full min-w-0 max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-[0_28px_70px_rgba(23,33,43,0.14)] sm:p-5"
            >
              <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sea">
                    {mode === "sign-in" ? "Welcome back" : "New workspace"}
                  </p>
                  <h2 className="mt-2 break-words text-xl font-semibold leading-tight text-ink sm:text-2xl">
                    {title}
                  </h2>
                </div>
                <span className="auth-card-icon grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-teal-50 text-sea">
                  <Sparkles size={22} aria-hidden="true" />
                </span>
              </div>

              <div className="auth-clerk-inner">
                {hasClerkKey ? (
                  mode === "sign-in" ? (
                    <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" appearance={clerkAppearance} />
                  ) : (
                    <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" appearance={clerkAppearance} />
                  )
                ) : (
                  <div className="p-6">
                    <h2 className="text-xl font-semibold text-ink">{title}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      Authentication is not configured for this environment yet. Add the Clerk publishable key before
                      opening this workspace to users.
                    </p>
                  </div>
                )}
                {showEmptyNestedRouteFallback ? (
                  <div className="p-6 text-center">
                    <h2 className="text-xl font-semibold text-ink">Continue securely</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      This step needs the active authentication session from the same browser tab.
                    </p>
                    <Link
                      to={basePath}
                      className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      {mode === "sign-in" ? "Back to sign in" : "Start sign up"}
                    </Link>
                  </div>
                ) : null}
              </div>
              <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
                Uploaded PDFs stay in your authenticated workspace and answers are grounded in retrieved document
                pages.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function AuthSignal({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sea">
        {icon}
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-600">{body}</p>
    </div>
  );
}

const clerkAppearance = {
  variables: {
    colorPrimary: "#0f766e",
    colorText: "#17212b",
    colorTextSecondary: "#475569",
    colorBackground: "#ffffff",
    borderRadius: "8px",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  },
  elements: {
    rootBox: "w-full min-w-0",
    cardBox: "w-full min-w-0 border-0 bg-transparent shadow-none",
    card: "w-full min-w-0 border-0 bg-transparent p-0 shadow-none",
    header: "hidden",
    main: "w-full min-w-0",
    form: "w-full min-w-0",
    formField: "w-full min-w-0",
    formFieldRow: "w-full min-w-0",
    socialButtons: "w-full min-w-0",
    socialButtonsBlockButtonArrow: "hidden",
    socialButtonsBlockButton:
      "box-border min-h-11 w-full min-w-0 rounded-md border-slate-200 text-sm font-semibold text-ink hover:bg-slate-50",
    formButtonPrimary:
      "box-border min-h-11 w-full min-w-0 rounded-md bg-[#17212b] text-sm font-semibold hover:bg-slate-800",
    formFieldInput:
      "box-border min-h-11 w-full min-w-0 rounded-md border-slate-200 bg-white text-ink focus:outline-none focus:ring-0 focus-visible:outline-none",
    footer: "w-full min-w-0",
    footerAction: "w-full min-w-0",
    footerActionLink: "font-semibold text-[#0f766e] hover:text-teal-800",
    dividerRow: "w-full min-w-0",
    dividerLine: "bg-slate-200",
    dividerText: "text-slate-500",
    formFieldLabel: "text-sm font-semibold text-ink"
  }
};

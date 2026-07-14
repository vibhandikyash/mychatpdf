import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClerkAuthFlow, withGoogleAccountSelection } from "./AuthFlow";
import { authCopy, type AuthMode } from "./authConfig";

const clerkMocks = vi.hoisted(() => ({
  isSignedIn: false,
  signOut: vi.fn(async () => undefined),
  signInCreate: vi.fn(),
  signUpCreate: vi.fn()
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: clerkMocks.isSignedIn,
    signOut: clerkMocks.signOut
  }),
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      authenticateWithRedirect: vi.fn(),
      create: clerkMocks.signInCreate
    },
    setActive: vi.fn()
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      authenticateWithRedirect: vi.fn(),
      attemptEmailAddressVerification: vi.fn(),
      create: clerkMocks.signUpCreate,
      prepareEmailAddressVerification: vi.fn()
    },
    setActive: vi.fn()
  })
}));

describe("ClerkAuthFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clerkMocks.isSignedIn = false;
    clerkMocks.signInCreate.mockResolvedValue({
      firstFactorVerification: {
        externalVerificationRedirectURL: null
      }
    });
    clerkMocks.signUpCreate.mockResolvedValue({
      verifications: {
        externalAccount: {
          externalVerificationRedirectURL: null
        }
      }
    });
  });

  it("starts Google sign in with account selection and redirects without account hints", async () => {
    renderAuthFlow("sign-in");

    await userEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => {
      expect(clerkMocks.signInCreate).toHaveBeenCalledWith({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}/sso-callback`,
        actionCompleteRedirectUrl: `${window.location.origin}/app/documents`,
        oidcPrompt: "select_account consent"
      });
    });

  });


  it("removes Google account hints from external OAuth URLs", () => {
    const redirectUrl = new URL(
      withGoogleAccountSelection(
        new URL("https://accounts.google.com/o/oauth2/v2/auth?authuser=2&login_hint=old%40example.com&prompt=none")
      )
    );

    expect(redirectUrl.searchParams.get("prompt")).toBe("select_account consent");
    expect(redirectUrl.searchParams.has("authuser")).toBe(false);
    expect(redirectUrl.searchParams.has("login_hint")).toBe(false);
  });
  it("clears an active Clerk session before starting Google sign in", async () => {
    clerkMocks.isSignedIn = true;

    renderAuthFlow("sign-in");

    await userEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(clerkMocks.signOut).toHaveBeenCalledTimes(1));
    expect(clerkMocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      clerkMocks.signInCreate.mock.invocationCallOrder[0]
    );
  });

  it("starts Google sign up with account selection", async () => {
    renderAuthFlow("sign-up");

    await userEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => {
      expect(clerkMocks.signUpCreate).toHaveBeenCalledWith({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}/sso-callback`,
        actionCompleteRedirectUrl: `${window.location.origin}/app/documents`,
        oidcPrompt: "select_account consent"
      });
    });
  });
});

function renderAuthFlow(mode: AuthMode) {
  return render(
    <MemoryRouter>
      <ClerkAuthFlow mode={mode} copy={authCopy[mode]} redirectPath="/app/documents" />
    </MemoryRouter>
  );
}
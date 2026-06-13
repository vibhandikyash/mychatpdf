import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

export interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
}

interface ProtectedRouteProps {
  children: ReactNode;
  authState?: AuthState;
}

function ProtectedContent({ authState, children }: Required<ProtectedRouteProps>) {
  const location = useLocation();

  if (!authState.isLoaded) {
    return (
      <main className="grid min-h-screen place-items-center bg-mist px-6">
        <div
          role="status"
          aria-label="Checking session"
          className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-panel"
        >
          Checking your session...
        </div>
      </main>
    );
  }

  if (!authState.isSignedIn) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

function ClerkProtectedRoute({ children }: Pick<ProtectedRouteProps, "children">) {
  const { isLoaded, isSignedIn } = useAuth();
  return <ProtectedContent authState={{ isLoaded, isSignedIn: Boolean(isSignedIn) }}>{children}</ProtectedContent>;
}

export function ProtectedRoute({ authState, children }: ProtectedRouteProps) {
  if (authState) {
    return <ProtectedContent authState={authState}>{children}</ProtectedContent>;
  }

  return <ClerkProtectedRoute>{children}</ClerkProtectedRoute>;
}

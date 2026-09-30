import { useGoogleLogin } from "@react-oauth/google";
import { toast } from "sonner";
import { useAuthStore } from "../../store/auth";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useState } from "react";

/**
 * Login always uses real Google OAuth.
 * When API MOCK=true, any Google account that is not yet in the DB is
 * auto-created as SUPER_ADMIN (for demo / App Review tenants only).
 */
export function LoginPage() {
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        const credential = tokenResponse.access_token;
        if (!credential) throw new Error("Google did not return an access token");

        // Confirm Google session is usable before hitting our API
        const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${credential}` },
        });
        if (!userInfoRes.ok) {
          throw new Error("Failed to verify Google account. Try again.");
        }

        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/api/v1/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Login failed",
          );
        }

        login(data.token, { id: data.id, username: data.username, role: data.role });
        toast.success(`Welcome, ${data.username}!`);
        navigate("/inbox");
      } catch (err: any) {
        toast.error(err?.message || "Google sign-in failed");
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      toast.error("Google sign-in was cancelled or failed");
    },
    flow: "implicit",
  });

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-4 w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight" aria-label="FyBud">
            <span className="text-foreground">Fy</span>
            <span className="bg-[linear-gradient(110deg,#b8a7f5_0%,#8b7df0_45%,#5c4db5_70%,#b8a7f5_100%)] bg-[length:200%_auto] bg-clip-text text-transparent">
              Bud
            </span>
          </h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-2xl">
          <h2 className="mb-2 text-center text-xl font-semibold text-foreground">Sign in</h2>
          <p className="mb-6 text-center text-sm text-muted-foreground">
            Use your Google account to continue
          </p>

          <button
            id="google-signin-btn"
            type="button"
            onClick={() => googleLogin()}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-all hover:bg-muted active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            {loading ? "Signing in…" : "Continue with Google"}
          </button>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Sign in with Google. On demo, new accounts are created automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

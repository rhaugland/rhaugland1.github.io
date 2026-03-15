"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TrackerLoginProps {
  slug: string;
  businessName: string;
}

export function TrackerLogin({ slug, businessName }: TrackerLoginProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // password change state
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentTempPassword, setCurrentTempPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/track/${slug}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "login failed");
        return;
      }

      if (data.mustChangePassword) {
        setMustChangePassword(true);
        setCurrentTempPassword(password);
      } else {
        router.refresh();
      }
    } catch {
      setError("something went wrong. please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("passwords don't match");
      return;
    }
    if (newPassword.length < 6) {
      setError("password must be at least 6 characters");
      return;
    }

    setChangingPassword(true);
    setError(null);

    try {
      const res = await fetch(`/api/track/${slug}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: currentTempPassword,
          newPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "failed to change password");
        return;
      }

      // password changed, refresh to load tracker
      router.refresh();
    } catch {
      setError("something went wrong. please try again.");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center slushie-gradient px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-primary">slushie</h1>
          <p className="mt-2 text-sm text-foreground">
            {mustChangePassword
              ? "set your password"
              : `log in to view your ${businessName} tracker`}
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 shadow-lg backdrop-blur-sm p-6">
          {!mustChangePassword ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-medium text-muted mb-1">
                  email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-xs font-medium text-muted mb-1">
                  password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="from your confirmation email"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 font-medium">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50"
              >
                {loading ? "logging in..." : "log in"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <p className="text-xs text-muted">
                choose a password you'll remember. this replaces the temporary one from your email.
              </p>
              <div>
                <label htmlFor="new-password" className="block text-xs font-medium text-muted mb-1">
                  new password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="at least 6 characters"
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-xs font-medium text-muted mb-1">
                  confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="type it again"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-primary focus:outline-none"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 font-medium">{error}</p>
              )}
              <button
                type="submit"
                disabled={changingPassword}
                className="w-full rounded-lg bg-gradient-to-r from-primary to-secondary px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-[0.98] hover:shadow-lg disabled:opacity-50"
              >
                {changingPassword ? "saving..." : "set password & continue"}
              </button>
              <button
                type="button"
                onClick={() => router.refresh()}
                className="w-full text-xs text-muted hover:text-primary transition-colors"
              >
                skip for now
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted/60">
          check your confirmation email for login details
        </p>
      </div>
    </main>
  );
}

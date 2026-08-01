import React, { useState, useEffect } from "react";
import { User } from "../types";
import { Mail, Key, ShieldCheck, UserCheck, AlertCircle, Sparkles, LogOut, CheckCircle2, ArrowRight, Loader2, X, Lock } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  userCount: number;
  onLoginSuccess: (user: User, settings?: any) => void;
  onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  userCount,
  onLoginSuccess,
  onLogout,
}) => {
  const [email, setEmail] = useState("");
  const [ownerPin, setOwnerPin] = useState("");
  const [pinOrToken, setPinOrToken] = useState("");
  const [authMode, setAuthMode] = useState<"magic" | "owner_pin">(userCount === 0 ? "owner_pin" : "magic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [step, setStep] = useState<"email" | "verify">("email");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get("token");
    if (tokenFromUrl) {
      handleVerifyToken(tokenFromUrl);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (userCount === 0) {
      setAuthMode("owner_pin");
    }
  }, [userCount]);

  if (!isOpen) return null;

  const handleRequestMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    setGeneratedLink(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to process authentication request.");
      }

      if (data.status === "pending") {
        setMessage(data.message || "Registration submitted! An Administrator will review your account request.");
        setStep("email");
      } else {
        setMessage(data.message || "Magic link generated!");
        if (data.magicLink) setGeneratedLink(data.magicLink);
        setStep("verify");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerPinSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!ownerPin || ownerPin.trim().length < 4) {
      setError("Please enter a secure PIN (at least 4 characters).");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
        credentials: "include",
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error || "Failed to register owner.");

      const res = await fetch("/api/auth/owner-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), pin: ownerPin.trim() }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set owner PIN.");

      onLoginSuccess(data.user, data.settings);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to setup System Owner PIN.");
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerPinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !ownerPin.trim()) {
      setError("Email and PIN are required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/owner-pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), pin: ownerPin.trim() }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Incorrect PIN or not an admin account.");

      onLoginSuccess(data.user, data.settings);
      onClose();
    } catch (err: any) {
      setError(err.message || "Owner login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyToken = async (tokenToUse?: string) => {
    const token = tokenToUse || pinOrToken;
    if (!token.trim()) {
      setError("Please enter your magic token.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Invalid or expired token.");
      }

      onLoginSuccess(data.user, data.settings);
      onClose();
    } catch (err: any) {
      setError(err.message || "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base">User Account & Settings Sync</h3>
              <p className="text-xs text-slate-400 font-mono">SQLite Server-Side Storage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {currentUser ? (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">Status</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Connected
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">Email Address</span>
                  <span className="text-sm font-semibold text-pink-300 font-mono">{currentUser.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">Role</span>
                  <span className="text-xs font-bold text-violet-300 capitalize">{currentUser.role}</span>
                </div>
              </div>

              <div className="p-3.5 bg-pink-950/20 border border-pink-800/30 rounded-xl text-xs text-pink-200/90 leading-relaxed">
                ✨ Your Waifu profiles, voice configuration, and AI settings are saved directly to server-side SQLite storage and persistent volumes!
              </div>

              <button
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-200 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Sign Out of Account
              </button>
            </div>
          ) : (
            <>
              {/* Mode Selector for Owner vs Regular User */}
              {userCount > 0 && (
                <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => { setAuthMode("magic"); setError(null); setMessage(null); setStep("email"); }}
                    className={`flex-1 py-2 rounded-lg font-semibold transition cursor-pointer ${
                      authMode === "magic" ? "bg-pink-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Magic Link (Users)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthMode("owner_pin"); setError(null); setMessage(null); }}
                    className={`flex-1 py-2 rounded-lg font-semibold transition cursor-pointer ${
                      authMode === "owner_pin" ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    System Owner PIN
                  </button>
                </div>
              )}

              {userCount === 0 && (
                <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-xs text-amber-200/90 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold text-amber-300">System Owner Setup:</strong> SMTP is not configured yet. Set your persistent owner PIN for instant server access.
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl text-xs text-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {message && (
                <div className="p-3 bg-indigo-950/50 border border-indigo-800/80 rounded-xl text-xs text-indigo-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>{message}</span>
                </div>
              )}

              {authMode === "owner_pin" ? (
                /* System Owner PIN Form (Setup or Login) */
                <form onSubmit={userCount === 0 ? handleOwnerPinSetup : handleOwnerPinLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-300 mb-1.5">
                      System Owner Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="owner@example.com"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-violet-500/60"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-300 mb-1.5">
                      {userCount === 0 ? "Set Owner Login PIN (Min 4 chars)" : "Owner Login PIN"}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                      <input
                        type="password"
                        value={ownerPin}
                        onChange={(e) => setOwnerPin(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-violet-500/60"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2.5 rounded-xl text-xs shadow-lg shadow-violet-500/10 transition cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>{userCount === 0 ? "Save Owner PIN & Initialize" : "Sign In with Owner PIN"}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* Regular User Magic Link Flow - STRICTLY NO PIN FOR REGULAR USERS */
                <div>
                  {step === "email" ? (
                    <form onSubmit={handleRequestMagicLink} className="space-y-4">
                      <div>
                        <label className="block text-xs font-mono text-slate-300 mb-1.5">
                          Email Address
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500/60"
                            required
                          />
                        </div>
                      </div>

                      <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl text-[11px] text-slate-400">
                        ℹ️ Regular users receive and authenticate exclusively via Magic Link.
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 text-white font-semibold py-2.5 rounded-xl text-xs shadow-lg shadow-pink-500/10 transition cursor-pointer disabled:opacity-50"
                      >
                        {loading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <span>Request Magic Link</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-4">
                      {generatedLink && (
                        <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                          <div className="text-xs text-slate-300">
                            🔑 <strong>Direct Access Magic Link (SMTP Not Configured):</strong>
                          </div>
                          <button
                            onClick={() => {
                              const urlParams = new URLSearchParams(generatedLink.split("?")[1]);
                              const token = urlParams.get("token");
                              if (token) handleVerifyToken(token);
                            }}
                            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 rounded-xl text-xs transition cursor-pointer"
                          >
                            <UserCheck className="w-4 h-4" />
                            <span>Instant One-Click Login</span>
                          </button>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-mono text-slate-300 mb-1.5">
                          Enter Magic Token
                        </label>
                        <div className="relative">
                          <Key className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                          <input
                            type="text"
                            value={pinOrToken}
                            onChange={(e) => setPinOrToken(e.target.value)}
                            placeholder="Paste magic token"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 font-mono placeholder-slate-600 focus:outline-none focus:border-pink-500/60"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setStep("email")}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-mono transition cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVerifyToken()}
                          disabled={loading}
                          className="flex-1 flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-500 text-white font-semibold py-2 rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify Magic Link"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from "react";
import { User, SmtpConfig, EmotionType, MotionType, EMOTION_TYPES } from "../types";
import { logLive2DDiagnostic, subscribeLive2DLogs, Live2DLogEntry, getLive2DLogHistory } from "../lib/live2dDiagnosticLogger";
import {
  Users,
  Mail,
  CheckCircle2,
  XCircle,
  Trash2,
  Shield,
  ShieldAlert,
  Send,
  RefreshCw,
  X,
  Loader2,
  KeyRound,
  Activity,
  Smile,
  Play,
  Sliders,
  PanelRight,
  Maximize2,
  Sparkles,
  Heart,
  Flame,
  Volume2,
} from "lucide-react";

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  trackingEngineEnabled?: boolean;
  currentEmotion?: EmotionType;
  currentMotion?: MotionType;
  activeCharacterName?: string;
  onToggleTrackingEngine?: (enabled: boolean) => void;
  onTestEmotion?: (emotion: EmotionType) => void;
  onTestMotion?: (motion: MotionType) => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  trackingEngineEnabled = true,
  currentEmotion = "happy",
  currentMotion = "none",
  activeCharacterName = "Waifu",
  onToggleTrackingEngine,
  onTestEmotion,
  onTestMotion,
}) => {
  const [activeTab, setActiveTab] = useState<"users" | "smtp" | "pin" | "tracking" | "emotions">("users");
  const [activeTestEmotion, setActiveTestEmotion] = useState<EmotionType>(currentEmotion);
  const [activeTestMotion, setActiveTestMotion] = useState<MotionType>(currentMotion);
  const [emotionViewMode, setEmotionViewMode] = useState<"docked" | "modal">("docked");
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (currentEmotion) {
      setActiveTestEmotion(currentEmotion);
    }
  }, [currentEmotion]);

  useEffect(() => {
    if (currentMotion) {
      setActiveTestMotion(currentMotion);
    }
  }, [currentMotion]);

  const [smtp, setSmtp] = useState<SmtpConfig>({
    host: "",
    port: 587,
    secure: false,
    authUser: "",
    authPass: "",
    fromEmail: "",
    adminEmail: currentUser?.email || "",
  });
  const [loadingSmtp, setLoadingSmtp] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  const [trackingEnabled, setTrackingEnabled] = useState<boolean>(trackingEngineEnabled ?? true);
  const [savingTracking, setSavingTracking] = useState(false);

  const [diagnosticLogs, setDiagnosticLogs] = useState<Live2DLogEntry[]>([]);

  useEffect(() => {
    setDiagnosticLogs(getLive2DLogHistory());
    const unsub = subscribeLive2DLogs((entry) => {
      setDiagnosticLogs((prev) => [...prev.slice(-49), entry]);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (trackingEngineEnabled !== undefined) {
      setTrackingEnabled(trackingEngineEnabled);
    }
  }, [trackingEngineEnabled]);

  const getAuthHeaders = (): Record<string, string> => {
    const savedToken = localStorage.getItem("waifu_session_token") || "";
    const headers: Record<string, string> = {};
    if (savedToken) {
      headers["Authorization"] = `Bearer ${savedToken}`;
    }
    return headers;
  };

  // Load Users, SMTP, and Tracking config on mount/tab change
  useEffect(() => {
    if (isOpen && currentUser?.role === "admin") {
      fetchUsers();
      fetchSmtp();
      fetchTracking();
    }
  }, [isOpen, currentUser]);

  const fetchTracking = async () => {
    try {
      const res = await fetch("/api/system/settings", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      if (data?.settings?.trackingEngineEnabled !== undefined) {
        setTrackingEnabled(Boolean(data.settings.trackingEngineEnabled));
      }
    } catch (e) {
      console.error("Failed to fetch tracking engine state:", e);
    }
  };

  const handleToggleTracking = async (newState: boolean) => {
    setSavingTracking(true);
    setStatusMessage(null);
    try {
      setTrackingEnabled(newState);
      if (onToggleTrackingEngine) {
        onToggleTrackingEngine(newState);
      }
      const res = await fetch("/api/system/settings", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ trackingEngineEnabled: newState }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update tracking engine state.");
      setStatusMessage({
        type: "success",
        text: `Tracking Engine module successfully ${newState ? "ENABLED (active cursor & physics tracking)" : "DISABLED (resting idle mode)"}.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setSavingTracking(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        if (text.includes("403 Forbidden") || text.includes("<html")) {
          throw new Error("403 Forbidden: Administrator access required.");
        }
        throw new Error(text || "Failed to fetch users.");
      }
      if (!res.ok) throw new Error(data.error || "Failed to fetch users.");
      setUsers(data.users || []);
    } catch (err: any) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchSmtp = async () => {
    setLoadingSmtp(true);
    try {
      // Clear any legacy client cache if present
      try {
        localStorage.removeItem("waifu_smtp_config_cache");
      } catch (e) {}

      const res = await fetch("/api/admin/smtp", {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        if (text.includes("403 Forbidden") || text.includes("<html")) {
          throw new Error("403 Forbidden: Administrator access required.");
        }
        throw new Error(text || "Failed to fetch SMTP config.");
      }
      if (!res.ok && !data.smtp) throw new Error(data.error || "Failed to fetch SMTP config.");
      if (data.smtp) {
        setSmtp(data.smtp);
      }
    } catch (err: any) {
      console.error("Failed to fetch SMTP config:", err);
    } finally {
      setLoadingSmtp(false);
    }
  };

  const handleApproveUser = async (id: string) => {
    setActionLoading(id);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${id}/approve`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed.");

      setStatusMessage({
        type: "success",
        text: data.message,
      });
      fetchUsers();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectUser = async (id: string) => {
    setActionLoading(id);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${id}/reject`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Rejection failed.");
      fetchUsers();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user account?")) return;
    setActionLoading(id);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion failed.");
      fetchUsers();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleRole = async (id: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/role`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Role update failed.");
      fetchUsers();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSmtp(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/smtp", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(smtp),
        credentials: "include",
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        if (text.includes("403 Forbidden") || text.includes("<html")) {
          throw new Error("403 Forbidden: Administrator access required. Please sign in with your System Owner account.");
        }
        throw new Error(text || "Server error occurred while saving SMTP.");
      }
      if (!res.ok) throw new Error(data.error || "Failed to save SMTP.");

      setStatusMessage({ type: "success", text: "SMTP configuration successfully saved to server database!" });
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/smtp/test", {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        if (text.includes("403 Forbidden") || text.includes("<html")) {
          throw new Error("403 Forbidden: Administrator access required. Please sign in with your System Owner account.");
        }
        throw new Error(text || "SMTP test failed.");
      }
      if (!res.ok) throw new Error(data.error || "SMTP test failed.");
      setStatusMessage({ type: "success", text: data.message });
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handlePinChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    if (!newPin || newPin.trim().length < 4) {
      setStatusMessage({ type: "error", text: "New PIN must be at least 4 characters." });
      return;
    }
    if (newPin !== confirmPin) {
      setStatusMessage({ type: "error", text: "New PIN and confirmation do not match." });
      return;
    }

    setSavingPin(true);
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update PIN.");

      setStatusMessage({ type: "success", text: "System Owner PIN updated successfully!" });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setSavingPin(false);
    }
  };

  if (!isOpen || currentUser?.role !== "admin") return null;

  const pendingCount = users.filter((u) => u.status === "pending").length;

  const isEmotionTab = activeTab === "emotions";
  const isDocked = isEmotionTab && emotionViewMode === "docked";

  return (
    <div
      className={`fixed inset-0 z-50 animate-fade-in ${
        isDocked
          ? "pointer-events-none bg-slate-950/20 backdrop-blur-[1px] flex items-stretch justify-end p-4"
          : "flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
      }`}
    >
      <div
        className={`relative w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col pointer-events-auto transition-all duration-300 ${
          isDocked ? "max-w-md h-full max-h-none border-pink-500/30" : "max-w-3xl max-h-[90vh]"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                {isEmotionTab ? "Live2D Emotion & Motion Inspector" : "System Administration"}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {isEmotionTab
                  ? `Active Model: ${activeCharacterName} (Live Preview)`
                  : "User Approvals, Roles & SMTP Configuration"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isEmotionTab && (
              <button
                onClick={() => setEmotionViewMode(isDocked ? "modal" : "docked")}
                title={isDocked ? "Switch to Centered Modal" : "Dock Right to see Live Model"}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-mono border border-slate-700 transition cursor-pointer"
              >
                {isDocked ? (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-pink-400" />
                    <span className="hidden sm:inline">Center</span>
                  </>
                ) : (
                  <>
                    <PanelRight className="w-3.5 h-3.5 text-pink-400" />
                    <span className="hidden sm:inline">Dock Right</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selection Bar */}
        <div className="flex items-center gap-1.5 px-4 sm:px-6 pt-3 border-b border-slate-800 bg-slate-950/40 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl font-mono text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === "users"
                ? "border-pink-500 text-pink-400 bg-slate-900/80"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Users</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("smtp")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl font-mono text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === "smtp"
                ? "border-pink-500 text-pink-400 bg-slate-900/80"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>SMTP</span>
          </button>

          <button
            onClick={() => setActiveTab("pin")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl font-mono text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === "pin"
                ? "border-pink-500 text-pink-400 bg-slate-900/80"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>PIN</span>
          </button>

          <button
            onClick={() => setActiveTab("tracking")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl font-mono text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === "tracking"
                ? "border-pink-500 text-pink-400 bg-slate-900/80"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Tracking</span>
          </button>

          <button
            onClick={() => setActiveTab("emotions")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl font-mono text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === "emotions"
                ? "border-pink-500 text-pink-400 bg-slate-900/80"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Smile className="w-3.5 h-3.5" />
            <span>Emotion Testing</span>
          </button>
        </div>

        {/* Status Message Display */}
        {statusMessage && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl text-xs flex items-center justify-between ${
              statusMessage.type === "success"
                ? "bg-emerald-950/60 border border-emerald-800/80 text-emerald-200"
                : "bg-rose-950/60 border border-rose-800/80 text-rose-200"
            }`}
          >
            <span>{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === "users" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">Total Registered Accounts: {users.length}</span>
                <button
                  onClick={fetchUsers}
                  disabled={loadingUsers}
                  className="flex items-center gap-1.5 text-xs text-pink-400 hover:text-pink-300 font-mono transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? "animate-spin" : ""}`} /> Refresh List
                </button>
              </div>

              {loadingUsers ? (
                <div className="p-8 text-center text-slate-400 text-xs font-mono">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-pink-400" />
                  Loading accounts...
                </div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs font-mono bg-slate-950/40 rounded-xl border border-slate-800">
                  No accounts registered yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-100">{u.email}</span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              u.role === "admin"
                                ? "bg-violet-950 text-violet-300 border border-violet-800"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {u.role}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                              u.status === "approved"
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : u.status === "pending"
                                ? "bg-amber-950 text-amber-300 border border-amber-800 animate-pulse"
                                : "bg-rose-950 text-rose-300 border border-rose-800"
                            }`}
                          >
                            {u.status}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          Joined: {new Date(u.created_at).toLocaleDateString()}
                          {u.last_login && ` • Last Active: ${new Date(u.last_login).toLocaleDateString()}`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {u.status === "pending" && (
                          <button
                            onClick={() => handleApproveUser(u.id)}
                            disabled={actionLoading === u.id}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                          </button>
                        )}

                        {u.status === "approved" && (
                          <button
                            onClick={() => handleRejectUser(u.id)}
                            disabled={actionLoading === u.id}
                            className="flex items-center gap-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-800 text-amber-200 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Suspend
                          </button>
                        )}

                        <button
                          onClick={() => handleToggleRole(u.id, u.role)}
                          disabled={actionLoading === u.id}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono transition cursor-pointer"
                          title="Toggle Admin Role"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                        </button>

                        {currentUser.id !== u.id && (
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            disabled={actionLoading === u.id}
                            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/50 rounded-lg transition cursor-pointer"
                            title="Delete Account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === "smtp" ? (
            <form onSubmit={handleSaveSmtp} className="space-y-4">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400">
                💡 <strong>Optional SMTP Setup:</strong> If SMTP is configured, Magic Links and Approval notifications will automatically be emailed to users and Admin. If left blank, direct Magic Links are safely displayed inside the UI!
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">SMTP Host</label>
                  <input
                    type="text"
                    value={smtp.host}
                    onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                    placeholder="smtp.gmail.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Port</label>
                  <input
                    type="number"
                    value={smtp.port}
                    onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) || 587 })}
                    placeholder="587"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-pink-500/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">SMTP Username / Email</label>
                  <input
                    type="text"
                    value={smtp.authUser}
                    onChange={(e) => setSmtp({ ...smtp, authUser: e.target.value })}
                    placeholder="user@domain.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">SMTP Password</label>
                  <input
                    type="password"
                    value={smtp.authPass}
                    onChange={(e) => setSmtp({ ...smtp, authPass: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-pink-500/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">From Email Header</label>
                  <input
                    type="text"
                    value={smtp.fromEmail}
                    onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })}
                    placeholder="no-reply@domain.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500/60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Admin Notification Email</label>
                  <input
                    type="email"
                    value={smtp.adminEmail}
                    onChange={(e) => setSmtp({ ...smtp, adminEmail: e.target.value })}
                    placeholder="admin@domain.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500/60"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <label className="flex items-center gap-2 text-xs text-slate-300 font-mono cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smtp.secure}
                    onChange={(e) => {
                      const newSecure = e.target.checked;
                      let newPort = smtp.port;
                      if (newSecure && (smtp.port === 587 || !smtp.port)) {
                        newPort = 465;
                      } else if (!newSecure && smtp.port === 465) {
                        newPort = 587;
                      }
                      setSmtp({ ...smtp, secure: newSecure, port: newPort });
                    }}
                    className="rounded border-slate-800 text-pink-500 focus:ring-pink-500 bg-slate-950"
                  />
                  Use SSL/TLS Secure Connection (Port 465)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleTestSmtp}
                  disabled={testingSmtp || !smtp.host}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-mono transition cursor-pointer disabled:opacity-50"
                >
                  {testingSmtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Send Test Email</span>
                </button>

                <button
                  type="submit"
                  disabled={savingSmtp}
                  className="flex items-center gap-2 px-5 py-2 bg-pink-600 hover:bg-pink-500 text-white font-semibold rounded-xl text-xs transition cursor-pointer disabled:opacity-50 shadow-lg shadow-pink-500/10"
                >
                  {savingSmtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save SMTP Settings"}
                </button>
              </div>
            </form>
          ) : activeTab === "pin" ? (
            <form onSubmit={handlePinChange} className="space-y-4">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400">
                🔒 <strong>System Owner Security:</strong> Update your Administrator PIN used for secure System Owner login.
              </div>

              <div className="space-y-3 max-w-md">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Current PIN</label>
                  <input
                    type="password"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value)}
                    placeholder="Enter current PIN"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-pink-500/60 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">New PIN (at least 4 characters)</label>
                  <input
                    type="password"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="Enter new PIN"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-pink-500/60 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1">Confirm New PIN</label>
                  <input
                    type="password"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    placeholder="Confirm new PIN"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-pink-500/60 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 max-w-md">
                <button
                  type="submit"
                  disabled={savingPin}
                  className="flex items-center gap-2 px-5 py-2 bg-pink-600 hover:bg-pink-500 text-white font-semibold rounded-xl text-xs transition cursor-pointer disabled:opacity-50 shadow-lg shadow-pink-500/10"
                >
                  {savingPin ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Update Owner PIN"}
                </button>
              </div>
            </form>
          ) : activeTab === "tracking" ? (
            <div className="space-y-6">
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400">
                ⚙️ <strong>Tracking Engine Module:</strong> Controls the Live2D Tracking &amp; Multi-Joint Kinematics Engine (<code className="text-pink-400 font-mono">src/lib/live2dTracking.ts</code>). Disabling tracking switches the avatars to a static resting pose while maintaining audio lip-sync and expressions.
              </div>

              <div className="p-5 bg-slate-950/80 border border-slate-800/90 rounded-2xl flex items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <h4 className="font-semibold text-slate-100 text-sm">Tracking Engine Subsystem</h4>
                    {trackingEnabled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        Active (ON)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 border border-slate-700 text-slate-400">
                        <XCircle className="w-3 h-3" />
                        Disabled (OFF)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {trackingEnabled
                      ? "Real-time mouse pointer tracking, head/body angle coupling, and physics spring inertia are currently ACTIVE."
                      : "Avatars will remain in neutral idle position without following mouse cursor movement."}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={trackingEnabled}
                  disabled={savingTracking}
                  onClick={() => handleToggleTracking(!trackingEnabled)}
                  className={`relative inline-flex h-8 w-15 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-pink-500/40 ${
                    trackingEnabled ? "bg-pink-600" : "bg-slate-700"
                  } ${savingTracking ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                      trackingEnabled ? "translate-x-7" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 font-mono pt-2 border-t border-slate-800/80">
                <span>Persistence: SQLite system_config (tracking_engine_enabled)</span>
                <span>Current State: {trackingEnabled ? "Enabled" : "Disabled"}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Telemetry & Active Status Display Card */}
              <div className="p-4 bg-slate-950 border border-slate-800/90 rounded-2xl space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/40 text-2xl select-none">
                      {EMOTION_TYPES.find((e) => e.id === activeTestEmotion)?.emoji || "😊"}
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-950 animate-ping" />
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-950" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-100 capitalize">
                          {EMOTION_TYPES.find((e) => e.id === activeTestEmotion)?.label || "Happy"}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-pink-500/15 border border-pink-500/30 text-pink-300 font-semibold">
                          [emotion:{activeTestEmotion || "happy"}]
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        Target Model: <span className="text-slate-200 font-medium">{activeCharacterName}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setActiveTestEmotion("happy");
                      setActiveTestMotion("none");
                      if (onTestEmotion) onTestEmotion("happy");
                      if (onTestMotion) onTestMotion("none");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-mono border border-slate-800 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Reset to Default</span>
                  </button>
                </div>

                {/* Facial Parameter Simulation Meters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-900 text-xs font-mono">
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 block uppercase">Cheek Blush</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-slate-200 font-semibold">
                        {["embarrassed", "flirty", "tipsy", "excited"].includes(activeTestEmotion)
                          ? "85%"
                          : ["happy", "smirk"].includes(activeTestEmotion)
                          ? "35%"
                          : "0%"}
                      </span>
                      <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-pink-500 rounded-full transition-all duration-300"
                          style={{
                            width: ["embarrassed", "flirty", "tipsy", "excited"].includes(activeTestEmotion)
                              ? "85%"
                              : ["happy", "smirk"].includes(activeTestEmotion)
                              ? "35%"
                              : "0%",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 block uppercase">Eye Expression</span>
                    <span className="text-slate-200 font-semibold block mt-1 truncate">
                      {["surprised", "scared"].includes(activeTestEmotion)
                        ? "Wide Open"
                        : ["wink"].includes(activeTestEmotion)
                        ? "Left Wink"
                        : ["tired", "sleepy"].includes(activeTestEmotion)
                        ? "Half Lidded"
                        : ["happy", "excited"].includes(activeTestEmotion)
                        ? "Squint Smile"
                        : "Normal"}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 block uppercase">Mouth Form</span>
                    <span className="text-slate-200 font-semibold block mt-1 truncate">
                      {["happy", "excited", "flirty"].includes(activeTestEmotion)
                        ? "Curved Smile"
                        : ["sad", "crying", "angry"].includes(activeTestEmotion)
                        ? "Down Frown"
                        : ["surprised", "scared"].includes(activeTestEmotion)
                        ? "Open O-Shape"
                        : ["smirk", "evil"].includes(activeTestEmotion)
                        ? "Asymmetric"
                        : "Neutral"}
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 block uppercase">Gesture Motion</span>
                    <span className="text-purple-300 font-semibold block mt-1 truncate">
                      {activeTestMotion && activeTestMotion !== "none" ? `[${activeTestMotion}]` : "Idle Rest"}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 bg-slate-900/40 p-2 rounded-xl border border-slate-800/40 flex items-center gap-2">
                  <span className="text-pink-400">👀</span>
                  <span>
                    <strong>Live Canvas View:</strong> Watch the character react on the screen in real-time as you click buttons below.
                  </span>
                </div>
              </div>

              {/* Emotion Buttons Section */}
              <div>
                <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Smile className="w-3.5 h-3.5 text-pink-400" />
                    Facial Emotion Triggers ({EMOTION_TYPES.length})
                  </span>
                  <span className="text-[10px] text-slate-500 lowercase font-normal">click to trigger Live2D expression</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {EMOTION_TYPES.map((emo) => {
                    const isCurrent = activeTestEmotion === emo.id;
                    return (
                      <button
                        key={emo.id}
                        type="button"
                        onClick={() => {
                          logLive2DDiagnostic("admin", `User clicked Emotion Button -> "${emo.id}" (${emo.label})`);
                          setActiveTestEmotion(emo.id);
                          if (onTestEmotion) {
                            onTestEmotion(emo.id);
                          }
                        }}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl text-left border transition cursor-pointer ${
                          isCurrent
                            ? "bg-pink-950/70 border-pink-500 text-pink-200 shadow-md shadow-pink-500/15 ring-1 ring-pink-500/50"
                            : "bg-slate-950/70 border-slate-800/80 hover:border-slate-700 text-slate-300 hover:bg-slate-900"
                        }`}
                      >
                        <span className="text-lg select-none">{emo.emoji}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold leading-none capitalize truncate">{emo.label}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-1">[{emo.id}]</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Motion Gestures Section */}
              <div className="pt-3 border-t border-slate-800/80">
                <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 text-purple-400" />
                    Live2D Kinematic Gestures
                  </span>
                  <span className="text-[10px] text-slate-500 lowercase font-normal">triggers head &amp; body motions</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {[
                    { id: "nod", label: "Nod Yes", emoji: "👇" },
                    { id: "shake", label: "Shake Head", emoji: "↔️" },
                    { id: "wave", label: "Wave Hand", emoji: "👋" },
                    { id: "bow", label: "Polite Bow", emoji: "🙇" },
                    { id: "laugh", label: "Hearty Laugh", emoji: "😄" },
                    { id: "wink", label: "Playful Wink", emoji: "😉" },
                    { id: "curious_glance", label: "Curious Glance", emoji: "👀" },
                    { id: "jiggle_dance", label: "Jiggle Dance", emoji: "💃" },
                  ].map((motion) => {
                    const isCurrent = activeTestMotion === motion.id;
                    return (
                      <button
                        key={motion.id}
                        type="button"
                        onClick={() => {
                          logLive2DDiagnostic("admin", `User clicked Motion Button -> "${motion.id}" (${motion.label})`);
                          setActiveTestMotion(motion.id as MotionType);
                          if (onTestMotion) {
                            onTestMotion(motion.id as MotionType);
                          }
                          setTimeout(() => setActiveTestMotion("none"), 3000);
                        }}
                        className={`flex items-center gap-2 p-2 rounded-xl text-left border transition cursor-pointer ${
                          isCurrent
                            ? "bg-purple-950/70 border-purple-500 text-purple-200 ring-1 ring-purple-500/50"
                            : "bg-slate-950/70 border-slate-800/80 hover:border-slate-700 text-slate-300 hover:bg-slate-900"
                        }`}
                      >
                        <span className="text-sm select-none">{motion.emoji}</span>
                        <div className="min-w-0">
                          <div className="text-xs font-medium leading-none truncate">{motion.label}</div>
                          <div className="text-[9px] text-slate-500 font-mono mt-0.5">{motion.id}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Diagnostic Telemetry Log Stream */}
              <div className="pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    Live Diagnostic Telemetry Log ({diagnosticLogs.length})
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">Real-time signal probe</span>
                </div>
                <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-2.5 font-mono text-[11px] max-h-40 overflow-y-auto space-y-1.5 select-text">
                  {diagnosticLogs.length === 0 ? (
                    <div className="text-slate-600 italic py-2 text-center">
                      No events logged yet. Click any emotion or motion button above to inspect data flow.
                    </div>
                  ) : (
                    diagnosticLogs.map((log, idx) => (
                      <div key={idx} className="leading-tight flex items-start gap-2">
                        <span className="text-slate-600 shrink-0 text-[10px]">{log.timestamp}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
                            log.category === "admin"
                              ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                              : log.category === "avatar"
                              ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              : log.category === "cubism"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : log.category === "expression"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : log.category === "model-file"
                              ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                              : log.category === "procedural"
                              ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30"
                              : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                          }`}
                        >
                          {log.category}
                        </span>
                        <span className="text-slate-300 break-all">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

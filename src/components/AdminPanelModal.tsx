import React, { useState, useEffect } from "react";
import { User, SmtpConfig } from "../types";
import { Users, Mail, CheckCircle2, XCircle, Trash2, Shield, ShieldAlert, Send, RefreshCw, X, Loader2, KeyRound, Activity } from "lucide-react";

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  trackingEngineEnabled?: boolean;
  onToggleTrackingEngine?: (enabled: boolean) => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  trackingEngineEnabled = true,
  onToggleTrackingEngine,
}) => {
  const [activeTab, setActiveTab] = useState<"users" | "smtp" | "pin" | "tracking">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base">System Administration & Management</h3>
              <p className="text-xs text-slate-400 font-mono">User Approvals, Roles & SMTP Configuration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection Bar */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-800 bg-slate-950/40">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-mono text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === "users"
                ? "border-pink-500 text-pink-400 bg-slate-900/80"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Accounts & Approvals</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("smtp")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-mono text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === "smtp"
                ? "border-pink-500 text-pink-400 bg-slate-900/80"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Email & SMTP Config</span>
          </button>

          <button
            onClick={() => setActiveTab("pin")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-mono text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === "pin"
                ? "border-pink-500 text-pink-400 bg-slate-900/80"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Security & PIN</span>
          </button>

          <button
            onClick={() => setActiveTab("tracking")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-mono text-xs font-semibold border-b-2 transition cursor-pointer ${
              activeTab === "tracking"
                ? "border-pink-500 text-pink-400 bg-slate-900/80"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Tracking Engine</span>
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
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
};

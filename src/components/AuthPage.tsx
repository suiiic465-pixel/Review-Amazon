import React, { useState } from "react";
import { Lock, UserCheck, ShieldAlert, ArrowLeft, Eye, EyeOff, Sun, Moon } from "lucide-react";
import { UserRole } from "../types";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../firebase";

interface AuthPageProps {
  onBack: () => void;
  onSuccess: (role: UserRole) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export default function AuthPage({ onBack, onSuccess, theme, onToggleTheme }: AuthPageProps) {
  const [role, setRole] = useState<UserRole | "">("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Hardcoded passwords requested:
  // Mr. Password: Shubham.17
  // Mrs. Password: Cutie.20
  const passcodes: Record<UserRole, string> = {
    Mr: "Shubham.17",
    Mrs: "Cutie.20",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!role) {
      setError("Please select your identity role first.");
      return;
    }

    const expectedPassword = passcodes[role];
    if (password !== expectedPassword) {
      setError("Incorrect passcode credentials. Connection rejected.");
      return;
    }

    setLoading(true);
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
    } catch (err) {
      console.warn("Silent login error during form submit bypass:", err);
    }

    // Persist session locally and transition
    localStorage.setItem("userRole", role);
    onSuccess(role);
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 flex flex-col justify-center min-h-[85vh] relative">
      
      {/* Floating Theme Toggle Button */}
      <div className="absolute top-4 right-4 z-20">
        <button
          type="button"
          id="theme-toggle-auth"
          onClick={onToggleTheme}
          className={`p-2 rounded-full border shadow-sm transition-all cursor-pointer active:scale-95 ${
            theme === "dark"
              ? "bg-[#202c33] border-neutral-800 text-amber-300 hover:bg-[#2a3942]"
              : "bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-100"
          }`}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className={`rounded-3xl p-8 shadow-md border relative overflow-hidden transition-colors duration-300 ${
        theme === "dark" 
          ? "bg-[#202c33] border-neutral-800 text-neutral-100" 
          : "bg-white border-neutral-100 text-neutral-800"
      }`}>
        
        {/* Subtle decorative elements */}
        {theme !== "dark" && (
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-full blur-2xl -mr-6 -mt-6" />
        )}

        {/* Escape Back Button */}
        <button
          type="button"
          id="auth-back-btn"
          onClick={onBack}
          className={`inline-flex items-center gap-1 text-xs font-semibold mb-6 cursor-pointer transition-colors ${
            theme === "dark" ? "text-neutral-400 hover:text-neutral-200" : "text-neutral-400 hover:text-neutral-700"
          }`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit Gate</span>
        </button>

        {/* Typography */}
        <div className="mb-6">
          <div className={`inline-flex items-center justify-center p-2.5 rounded-xl mb-3 shadow-inner ${
            theme === "dark" ? "bg-rose-950/40 text-rose-400" : "bg-rose-50 text-rose-500"
          }`}>
            <Lock className="w-5 h-5" />
          </div>
          <h2 className={`font-title text-xl font-bold tracking-tight ${theme === "dark" ? "text-white" : "text-neutral-800"}`}>
            Secure Cryptographic Gate
          </h2>
          <p className={`text-xs mt-1 ${theme === "dark" ? "text-neutral-400" : "text-neutral-400"}`}>
            Access to this channel requires dual authentication verify tokens.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Role selector buttons */}
          <div className="space-y-2">
            <span className={`block text-xs font-semibold font-title uppercase tracking-wider ${
              theme === "dark" ? "text-neutral-350" : "text-neutral-500"
            }`}>
              Identity Verification Role
            </span>
            <div className="grid grid-cols-2 gap-3.5">
              <button
                type="button"
                id="select-role-mr"
                onClick={() => {
                  setRole("Mr");
                  setError("");
                }}
                className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  role === "Mr"
                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                    : theme === "dark"
                    ? "bg-[#2a3942] hover:bg-[#34424b] text-neutral-200 border-neutral-700"
                    : "bg-[#f4f6fa] hover:bg-[#e9edf5] text-neutral-800 border-neutral-200"
                }`}
              >
                <span>🤵 Mr.</span>
              </button>
              <button
                type="button"
                id="select-role-mrs"
                onClick={() => {
                  setRole("Mrs");
                  setError("");
                }}
                className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  role === "Mrs"
                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                    : theme === "dark"
                    ? "bg-[#2a3942] hover:bg-[#34424b] text-neutral-200 border-neutral-700"
                    : "bg-[#f4f6fa] hover:bg-[#e9edf5] text-neutral-800 border-neutral-200"
                }`}
              >
                <span>👸 Mrs.</span>
              </button>
            </div>
          </div>

          {/* Passcode input field */}
          <div className="space-y-1.5 relative">
            <label htmlFor="gate-passcode" className={`block text-xs font-semibold font-title uppercase tracking-wider ${
              theme === "dark" ? "text-neutral-350" : "text-neutral-500"
            }`}>
              Verification Password
            </label>
            <div className="relative">
              <input
                id="gate-passcode"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={role ? `Enter password for ${role}` : "Choose role first"}
                disabled={!role}
                className={`w-full text-sm border rounded-xl py-3 pl-3 pr-10 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  theme === "dark"
                    ? "bg-[#2a3942] border-neutral-700 text-neutral-100 focus:border-rose-500 focus:bg-[#34424b]"
                    : "bg-neutral-50 border-neutral-200 text-neutral-800 focus:border-rose-400 focus:bg-white focus:ring-2 focus:ring-rose-50"
                }`}
              />
              {role && (
                <button
                  type="button"
                  id="toggle-passcode"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 top-3.5 cursor-pointer transition-colors ${
                    theme === "dark" ? "text-neutral-400 hover:text-neutral-200" : "text-neutral-400 hover:text-neutral-600"
                  }`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          {/* Error notice */}
          {error && (
            <div className={`p-3 border rounded-xl text-xs flex items-start gap-1.5 animate-bounce ${
              theme === "dark" ? "bg-red-950/40 text-red-300 border-red-900/40" : "bg-red-50 text-red-700 border-red-100"
            }`}>
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit code */}
          <button
            type="submit"
            id="password-gate-submit"
            disabled={loading || !role || !password}
            className={`w-full py-3.5 font-semibold rounded-xl text-sm transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2 ${
              theme === "dark"
                ? "bg-[#00a884] hover:bg-[#008f72] text-white disabled:bg-neutral-800 disabled:text-neutral-600"
                : "bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-[#f4f6fa] disabled:text-neutral-400"
            }`}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <UserCheck className="w-4 h-4" />
            )}
            <span>Decrypt Connection</span>
          </button>
        </form>
      </div>
    </div>
  );
}

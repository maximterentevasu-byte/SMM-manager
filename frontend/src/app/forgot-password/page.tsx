"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

type Step = "email" | "code";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const sendCode = async () => {
    if (!email) { setError("Введите email"); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setStep("code");
    } catch {
      setError("Ошибка отправки. Попробуйте снова.");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    const fullCode = code.join("");
    if (fullCode.length < 6) { setError("Введите 6-значный код"); return; }
    if (newPassword.length < 8) { setError("Пароль минимум 8 символов"); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { email, code: fullCode, new_password: newPassword });
      setSuccess("Пароль успешно изменён");
      setTimeout(() => router.push("/login"), 2000);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Неверный код или ошибка");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeInput = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    if (digit && i < 5) codeRefs.current[i + 1]?.focus();
  };

  const handleCodeKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[i] && i > 0) codeRefs.current[i - 1]?.focus();
    if (e.key === "Enter") resetPassword();
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "11px 14px", border: "1px solid #E5E7EB",
    borderRadius: 10, fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none",
    boxSizing: "border-box", background: "#fff", color: "#1F2937",
  };

  const passStrength = newPassword.length >= 12 ? 4 : newPassword.length >= 10 ? 3 : newPassword.length >= 8 ? 2 : newPassword.length > 0 ? 1 : 0;
  const strengthColors = ["#E5E7EB", "#FF6B5E", "#F59E0B", "#00B5A6", "#0D9488"];

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', sans-serif", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E5E7EB",
        boxShadow: "0 4px 24px rgba(13,27,42,0.07)",
        padding: "2.5rem", width: "100%", maxWidth: 400 }}>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 26, fontWeight: 800,
            color: "#0D1B2A", marginBottom: 6, letterSpacing: -0.5 }}>
            smm<span style={{ color: "#3478F6" }}>platform</span>
          </div>
          <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 700,
            margin: "0 0 4px", color: "#0D1B2A" }}>
            {step === "email" ? "Восстановление пароля" : "Новый пароль"}
          </h1>
          <p style={{ color: "#9CA3AF", fontSize: 13, margin: 0 }}>
            {step === "email"
              ? "Введите email и мы отправим код"
              : `Код отправлен на ${email}`}
          </p>
        </div>

        {step === "email" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151",
                display: "block", marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" style={inp}
                onKeyDown={(e) => e.key === "Enter" && sendCode()} />
            </div>

            {error && (
              <div style={{ padding: "10px 14px", background: "#FEF2F2",
                borderRadius: 8, fontSize: 13, color: "#DC2626",
                border: "1px solid #FECACA" }}>{error}</div>
            )}

            <button onClick={sendCode} disabled={loading}
              style={{ padding: "13px", background: loading ? "#9CA3AF" : "#3478F6",
                color: "#fff", border: "none", borderRadius: 10,
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 15, fontWeight: 600,
                fontFamily: "'Inter', sans-serif" }}>
              {loading ? "Отправляем..." : "Отправить код"}
            </button>

            <a href="/login" style={{ display: "block", textAlign: "center", padding: "11px",
              background: "#F5F7FA", border: "1px solid #E5E7EB", borderRadius: 10,
              fontSize: 14, color: "#1F2937", textDecoration: "none", fontWeight: 500 }}>
              Войти
            </a>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151",
                display: "block", marginBottom: 12, textAlign: "center" }}>
                Код из письма
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { codeRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeInput(i, e.target.value)}
                    onKeyDown={(e) => handleCodeKey(i, e)}
                    style={{
                      width: 44, height: 52, textAlign: "center",
                      fontSize: 22, fontWeight: 700, fontFamily: "'Manrope', sans-serif",
                      border: `2px solid ${digit ? "#3478F6" : "#E5E7EB"}`,
                      borderRadius: 10, outline: "none", background: "#fff",
                      color: "#0D1B2A", transition: "border-color 0.15s",
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151",
                display: "block", marginBottom: 6 }}>Новый пароль</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPass ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  style={{ ...inp, paddingRight: 44 }}
                  onKeyDown={(e) => e.key === "Enter" && resetPassword()}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    display: "flex", alignItems: "center", color: "#9CA3AF" }}>
                  {showPass ? (
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {newPassword && (
                <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2,
                      background: i <= passStrength ? strengthColors[passStrength] : "#E5E7EB",
                      transition: "background 0.2s" }} />
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div style={{ padding: "10px 14px", background: "#FEF2F2",
                borderRadius: 8, fontSize: 13, color: "#DC2626",
                border: "1px solid #FECACA" }}>{error}</div>
            )}

            {success && (
              <div style={{ padding: "10px 14px", background: "#E0F7F5",
                borderRadius: 8, fontSize: 13, color: "#00B5A6",
                border: "1px solid #99E6DF", textAlign: "center" }}>{success}</div>
            )}

            <button onClick={resetPassword} disabled={loading}
              style={{ padding: "13px", background: loading ? "#9CA3AF" : "#3478F6",
                color: "#fff", border: "none", borderRadius: 10,
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 15, fontWeight: 600,
                fontFamily: "'Inter', sans-serif" }}>
              {loading ? "Сохраняем..." : "Сохранить новый пароль"}
            </button>

            <div style={{ textAlign: "center" }}>
              <button onClick={sendCode}
                style={{ background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, color: "#3478F6", textDecoration: "underline" }}>
                Отправить код снова
              </button>
              <span style={{ fontSize: 13, color: "#9CA3AF", margin: "0 8px" }}>·</span>
              <button onClick={() => { setStep("email"); setError(""); setCode(["","","","","",""]); }}
                style={{ background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, color: "#6B7280" }}>
                Другой email
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

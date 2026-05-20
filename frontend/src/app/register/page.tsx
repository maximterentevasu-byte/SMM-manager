"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

type Step = "form" | "verify";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const register = async () => {
    if (!email || !password) { setError("Заполните все поля"); return; }
    if (password.length < 8) { setError("Пароль минимум 8 символов"); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/register", { email, password });
      setStep("verify");
    } catch (e: any) {
      setError(e.response?.data?.detail || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    const fullCode = code.join("");
    if (fullCode.length < 6) { setError("Введите 6-значный код"); return; }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/verify-email", { email, code: fullCode });
      // токен хранится в httpOnly cookie, установленном сервером
      router.push("/plans");
    } catch (e: any) {
      setError(e.response?.data?.detail || "Неверный код");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError("");
    try {
      await api.post("/auth/register", { email, password });
      setCode(["", "", "", "", "", ""]);
      codeRefs.current[0]?.focus();
    } catch {}
  };

  const handleCodeInput = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    if (digit && i < 5) codeRefs.current[i + 1]?.focus();
  };

  const handleCodeKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      codeRefs.current[i - 1]?.focus();
    }
    if (e.key === "Enter") verify();
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "11px 14px", border: "1px solid #E5E7EB",
    borderRadius: 10, fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none",
    boxSizing: "border-box", background: "#fff", color: "#1F2937",
  };

  const passStrength = password.length >= 12 ? 4 : password.length >= 10 ? 3 : password.length >= 8 ? 2 : password.length > 0 ? 1 : 0;
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
            {step === "form" ? "Создать аккаунт" : "Подтвердите email"}
          </h1>
          <p style={{ color: "#9CA3AF", fontSize: 13, margin: 0 }}>
            {step === "form"
              ? "AI-платформа для системного SMM"
              : `Код отправлен на ${email}`}
          </p>
        </div>

        {step === "form" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151",
                display: "block", marginBottom: 6 }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" style={inp}
                onKeyDown={(e) => e.key === "Enter" && register()} />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151",
                display: "block", marginBottom: 6 }}>Пароль</label>
              <div style={{ position: "relative" }}>
                <input type={showPass ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  style={{ ...inp, paddingRight: 44 }}
                  onKeyDown={(e) => e.key === "Enter" && register()} />
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
              {password && (
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

            <button onClick={register} disabled={loading}
              style={{ padding: "13px", background: loading ? "#9CA3AF" : "#3478F6",
                color: "#fff", border: "none", borderRadius: 10,
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 15, fontWeight: 600, marginTop: 4,
                fontFamily: "'Inter', sans-serif",
                transition: "background 0.15s" }}>
              {loading ? "Создаём аккаунт..." : "Зарегистрироваться →"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
              <span style={{ fontSize: 12, color: "#D1D5DB" }}>уже есть аккаунт?</span>
              <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
            </div>

            <a href="/login" style={{ display: "block", textAlign: "center", padding: "11px",
              background: "#F5F7FA", border: "1px solid #E5E7EB", borderRadius: 10,
              fontSize: 14, color: "#1F2937", textDecoration: "none", fontWeight: 500 }}>
              Войти
            </a>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151",
                display: "block", marginBottom: 12, textAlign: "center" }}>
                Введите 6-значный код из письма
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

            {error && (
              <div style={{ padding: "10px 14px", background: "#FEF2F2",
                borderRadius: 8, fontSize: 13, color: "#DC2626",
                border: "1px solid #FECACA", textAlign: "center" }}>{error}</div>
            )}

            <button onClick={verify} disabled={loading}
              style={{ padding: "13px", background: loading ? "#9CA3AF" : "#3478F6",
                color: "#fff", border: "none", borderRadius: 10,
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 15, fontWeight: 600,
                fontFamily: "'Inter', sans-serif",
                transition: "background 0.15s" }}>
              {loading ? "Проверяем..." : "Подтвердить"}
            </button>

            <div style={{ textAlign: "center" }}>
              <button onClick={resend}
                style={{ background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, color: "#3478F6", textDecoration: "underline" }}>
                Отправить код снова
              </button>
              <span style={{ fontSize: 13, color: "#9CA3AF", margin: "0 8px" }}>·</span>
              <button onClick={() => { setStep("form"); setError(""); setCode(["","","","","",""]); }}
                style={{ background: "none", border: "none", cursor: "pointer",
                  fontSize: 13, color: "#6B7280" }}>
                Изменить email
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

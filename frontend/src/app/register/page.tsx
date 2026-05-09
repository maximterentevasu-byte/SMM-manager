"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:8000/api" });

type Step = "register" | "verify";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Обратный отсчёт для повторной отправки
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const register = async () => {
    if (!email || !password) { setError("Заполните все поля"); return; }
    if (password.length < 8) { setError("Пароль минимум 8 символов"); return; }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/register", { email, password });
      localStorage.setItem("token", data.access_token);
      setStep("verify");
      setCountdown(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeInput = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...code];
    next[i] = val.slice(-1);
    setCode(next);
    if (val && i < 5) inputRefs.current[i + 1]?.focus();
    if (next.every(Boolean)) verifyCode(next.join(""));
  };

  const handleCodeKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const next = pasted.split("");
      setCode(next);
      inputRefs.current[5]?.focus();
      verifyCode(pasted);
    }
  };

  const verifyCode = async (fullCode: string) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/verify-email", { email, code: fullCode });
      localStorage.setItem("token", data.access_token);
      router.push("/onboarding");
    } catch (e: any) {
      setError(e.response?.data?.detail || "Неверный код");
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError("");
    try {
      await api.post("/auth/resend-code", { email });
      setCountdown(60);
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Ошибка отправки");
    } finally {
      setResending(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "11px 14px", border: "1px solid #E0DED8",
    borderRadius: 10, fontSize: 15, fontFamily: "inherit", outline: "none",
    boxSizing: "border-box", background: "#fff", color: "#1a1a1a",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EAE8E2",
        padding: "2.5rem", width: "100%", maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🍕</div>
          <h1 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 4px", color: "#1a1a1a" }}>
            {step === "register" ? "Создать аккаунт" : "Подтвердите email"}
          </h1>
          <p style={{ color: "#999", fontSize: 13, margin: 0 }}>
            {step === "register"
              ? "SMM-платформа на AI-агентах"
              : `Код отправлен на ${email}`}
          </p>
        </div>

        {/* STEP: Register */}
        {step === "register" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#444", display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" style={inp}
                onKeyDown={(e) => e.key === "Enter" && register()} />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#444", display: "block", marginBottom: 6 }}>
                Пароль
              </label>
              <div style={{ position: "relative" }}>
                <input type={showPass ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  style={{ ...inp, paddingRight: 44 }}
                  onKeyDown={(e) => e.key === "Enter" && register()} />
                <button onClick={() => setShowPass(!showPass)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#aaa" }}>
                  {showPass ? "🙈" : "👁"}
                </button>
              </div>
              {/* Password strength */}
              {password && (
                <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                  {[...Array(4)].map((_, i) => (
                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background:
                      password.length >= 8 && i < 1 ? "#E24B4A" :
                      password.length >= 10 && i < 2 ? "#EF9F27" :
                      password.length >= 12 && i < 3 ? "#1D9E75" :
                      password.length >= 14 && i < 4 ? "#0F6E56" : "#E0DED8" }} />
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div style={{ padding: "10px 14px", background: "#FCEBEB", borderRadius: 8, fontSize: 13, color: "#A32D2D" }}>
                {error}
              </div>
            )}

            <button onClick={register} disabled={loading}
              style={{ padding: "13px", background: loading ? "#888" : "#1a1a1a", color: "#fff",
                border: "none", borderRadius: 10, cursor: loading ? "not-allowed" : "pointer",
                fontSize: 15, fontWeight: 600, marginTop: 4 }}>
              {loading ? "Отправляем код..." : "Продолжить →"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: "#EAE8E2" }} />
              <span style={{ fontSize: 12, color: "#bbb" }}>уже есть аккаунт?</span>
              <div style={{ flex: 1, height: 1, background: "#EAE8E2" }} />
            </div>

            <a href="/login" style={{ display: "block", textAlign: "center", padding: "11px",
              background: "#F8F7F4", border: "1px solid #E0DED8", borderRadius: 10,
              fontSize: 14, color: "#1a1a1a", textDecoration: "none", fontWeight: 500 }}>
              Войти
            </a>
          </div>
        )}

        {/* STEP: Verify */}
        {step === "verify" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Code input */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}
              onPaste={handleCodePaste}>
              {code.map((digit, i) => (
                <input key={i} type="text" inputMode="numeric" maxLength={1}
                  value={digit}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  onChange={(e) => handleCodeInput(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  style={{ width: 48, height: 56, textAlign: "center", fontSize: 22,
                    fontWeight: 700, border: `2px solid ${digit ? "#1a1a1a" : "#E0DED8"}`,
                    borderRadius: 10, fontFamily: "'Courier New', monospace",
                    outline: "none", background: "#fff", color: "#1a1a1a",
                    transition: "border-color 0.15s" }} />
              ))}
            </div>

            {loading && (
              <div style={{ textAlign: "center", fontSize: 13, color: "#888" }}>
                Проверяем код...
              </div>
            )}

            {error && (
              <div style={{ padding: "10px 14px", background: "#FCEBEB", borderRadius: 8,
                fontSize: 13, color: "#A32D2D", textAlign: "center" }}>
                {error}
              </div>
            )}

            {/* Resend */}
            <div style={{ textAlign: "center" }}>
              {countdown > 0 ? (
                <span style={{ fontSize: 13, color: "#aaa" }}>
                  Отправить повторно через {countdown} сек.
                </span>
              ) : (
                <button onClick={resend} disabled={resending}
                  style={{ background: "none", border: "none", cursor: "pointer",
                    fontSize: 13, color: "#533AB7", fontWeight: 500, textDecoration: "underline" }}>
                  {resending ? "Отправляем..." : "Отправить код повторно"}
                </button>
              )}
            </div>

            <button onClick={() => { setStep("register"); setCode(["","","","","",""]); setError(""); }}
              style={{ padding: "11px", background: "#F8F7F4", border: "1px solid #E0DED8",
                borderRadius: 10, cursor: "pointer", fontSize: 14, color: "#555" }}>
              ← Изменить email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
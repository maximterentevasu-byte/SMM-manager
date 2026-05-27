"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = async () => {
    if (!email || !password) { setError("Введите email и пароль"); return; }
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("username", email);
      form.append("password", password);
      const { data } = await api.post("/auth/login", form);
      // токен хранится в httpOnly cookie, установленном сервером

      if (!data.is_verified) {
        router.push("/register");
        return;
      }

      localStorage.removeItem("businessId");
      let hasBusiness = false;
      try {
        const { data: businesses } = await api.get("/businesses/");
        if (businesses.length > 0) {
          localStorage.setItem("businessId", businesses[0].id);
          hasBusiness = true;
        }
      } catch {}

      // Если у пользователя нет бизнеса — отправляем на онбординг
      router.push(hasBusiness ? "/home" : "/onboarding");
    } catch (e: any) {
      const detail = e.response?.data?.detail || "";
      if (detail.includes("не подтверждён")) {
        setError("Email не подтверждён. Проверьте почту или зарегистрируйтесь снова.");
      } else {
        setError("Неверный email или пароль");
      }
    } finally {
      setLoading(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "11px 14px", border: "1px solid #E5E7EB",
    borderRadius: 10, fontSize: 15, fontFamily: "'Inter', sans-serif", outline: "none",
    boxSizing: "border-box", background: "#fff", color: "#1F2937",
  };

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
            Войти в платформу
          </h1>
          <p style={{ color: "#9CA3AF", fontSize: 13, margin: 0 }}>
            AI-платформа для системного SMM
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#374151",
              display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com" style={inp}
              onKeyDown={(e) => e.key === "Enter" && login()} />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Пароль</label>
              <a href="/forgot-password" style={{ fontSize: 12, color: "#3478F6", textDecoration: "none" }}>
                Забыли пароль?
              </a>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...inp, paddingRight: 44 }}
                onKeyDown={(e) => e.key === "Enter" && login()}
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
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "#FFF0EF",
              borderRadius: 8, fontSize: 13, color: "#FF6B5E",
              border: "1px solid #FFBDB9" }}>
              {error}
            </div>
          )}

          <button onClick={login} disabled={loading}
            style={{ padding: "13px", background: loading ? "#9CA3AF" : "#3478F6",
              color: "#fff", border: "none", borderRadius: 10,
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 15, fontWeight: 600, marginTop: 4,
              fontFamily: "'Inter', sans-serif",
              transition: "background 0.15s" }}>
            {loading ? "Входим..." : "Войти"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
            <span style={{ fontSize: 12, color: "#D1D5DB" }}>нет аккаунта?</span>
            <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
          </div>

          <a href="/register"
            style={{ display: "block", textAlign: "center", padding: "12px",
              background: "#F5F7FA", border: "1px solid #E5E7EB", borderRadius: 10,
              fontSize: 14, color: "#1F2937", textDecoration: "none", fontWeight: 500 }}>
            Зарегистрироваться →
          </a>
        </div>
      </div>
    </div>
  );
}

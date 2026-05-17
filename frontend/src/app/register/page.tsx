"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const register = async () => {
    if (!email || !password) { setError("Заполните все поля"); return; }
    if (password.length < 8) { setError("Пароль минимум 8 символов"); return; }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/register", { email, password });
      localStorage.setItem("token", data.access_token);
      router.push("/plans");
    } catch (e: any) {
      setError(e.response?.data?.detail || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
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
            Создать аккаунт
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
              <button onClick={() => setShowPass(!showPass)}
                style={{ position: "absolute", right: 12, top: "50%",
                  transform: "translateY(-50%)", background: "none",
                  border: "none", cursor: "pointer", fontSize: 16, color: "#9CA3AF" }}>
                {showPass ? "🙈" : "👁"}
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
      </div>
    </div>
  );
}

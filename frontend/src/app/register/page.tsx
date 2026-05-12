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
    width: "100%", padding: "11px 14px", border: "1px solid #E0DED8",
    borderRadius: 10, fontSize: 15, fontFamily: "inherit", outline: "none",
    boxSizing: "border-box", background: "#fff", color: "#1a1a1a",
  };

  const passStrength = password.length >= 12 ? 4 : password.length >= 10 ? 3 : password.length >= 8 ? 2 : password.length > 0 ? 1 : 0;
  const strengthColors = ["#E0DED8", "#E24B4A", "#EF9F27", "#1D9E75", "#0F6E56"];

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI', sans-serif", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EAE8E2",
        padding: "2.5rem", width: "100%", maxWidth: 400 }}>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🍕</div>
          <h1 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 4px", color: "#1a1a1a" }}>
            Создать аккаунт
          </h1>
          <p style={{ color: "#999", fontSize: 13, margin: 0 }}>
            SMM-платформа на AI-агентах
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#444",
              display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com" style={inp}
              onKeyDown={(e) => e.key === "Enter" && register()} />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#444",
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
                  border: "none", cursor: "pointer", fontSize: 16, color: "#aaa" }}>
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
            {password && (
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{ flex: 1, height: 3, borderRadius: 2,
                    background: i <= passStrength ? strengthColors[passStrength] : "#E0DED8",
                    transition: "background 0.2s" }} />
                ))}
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "#FCEBEB",
              borderRadius: 8, fontSize: 13, color: "#A32D2D" }}>{error}</div>
          )}

          <button onClick={register} disabled={loading}
            style={{ padding: "13px", background: loading ? "#888" : "#1a1a1a",
              color: "#fff", border: "none", borderRadius: 10,
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 15, fontWeight: 600, marginTop: 4 }}>
            {loading ? "Создаём аккаунт..." : "Зарегистрироваться →"}
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
      </div>
    </div>
  );
}
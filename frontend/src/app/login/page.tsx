"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const { data } = await axios.post("http://localhost:8000/api/auth/login", form);
      localStorage.setItem("token", data.access_token);
      if (!localStorage.getItem("businessId")) {
        localStorage.setItem("businessId", "7e0fe5ef-71fd-4113-8df4-be129e34bd69");
      }
      if (!data.is_verified) {
        router.push("/register");
      } else if (!data.has_business) {
        router.push("/onboarding");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Неверный email или пароль");
    } finally {
      setLoading(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "11px 14px", border: "1px solid #E0DED8",
    borderRadius: 10, fontSize: 15, fontFamily: "inherit", outline: "none",
    boxSizing: "border-box", background: "#fff", color: "#1a1a1a",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI', sans-serif", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EAE8E2",
        padding: "2.5rem", width: "100%", maxWidth: 400 }}>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🍕</div>
          <h1 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 4px", color: "#1a1a1a" }}>
            Войти в платформу
          </h1>
          <p style={{ color: "#999", fontSize: 13, margin: 0 }}>
            SMM-автоматизация на AI-агентах
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#444",
              display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com" style={inp}
              onKeyDown={(e) => e.key === "Enter" && login()} />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#444",
              display: "block", marginBottom: 6 }}>Пароль</label>
            <input type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" style={inp}
              onKeyDown={(e) => e.key === "Enter" && login()} />
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "#FCEBEB",
              borderRadius: 8, fontSize: 13, color: "#A32D2D" }}>
              {error}
            </div>
          )}

          <button onClick={login} disabled={loading}
            style={{ padding: "13px", background: loading ? "#888" : "#1a1a1a",
              color: "#fff", border: "none", borderRadius: 10,
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 15, fontWeight: 600, marginTop: 4 }}>
            {loading ? "Входим..." : "Войти"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: "#EAE8E2" }} />
            <span style={{ fontSize: 12, color: "#bbb" }}>нет аккаунта?</span>
            <div style={{ flex: 1, height: 1, background: "#EAE8E2" }} />
          </div>

          <a href="/register"
            style={{ display: "block", textAlign: "center", padding: "12px",
              background: "#F8F7F4", border: "1px solid #E0DED8", borderRadius: 10,
              fontSize: 14, color: "#1a1a1a", textDecoration: "none", fontWeight: 500 }}>
            Зарегистрироваться →
          </a>
        </div>
      </div>
    </div>
  );
}
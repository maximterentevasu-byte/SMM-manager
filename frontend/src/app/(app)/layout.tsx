"use client";

import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/home",         icon: "⌂",  label: "Главная" },
  { href: "/post-creator", icon: "⚡", label: "Быстрый пост" },
  { href: "/analytics",    icon: "📊", label: "Аналитика" },
  { href: "/content",      icon: "📅", label: "Контент-план" },
  { href: "/strategy",     icon: "🎯", label: "Стратегия и онбординг" },
  { href: "/platforms",    icon: "🔗", label: "Подключение платформ" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("businessId");
    router.push("/login");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F5F7FA", fontFamily: "'Inter', sans-serif" }}>
      <nav style={{
        width: 224, background: "#0D1B2A", borderRight: "none",
        padding: "20px 12px", display: "flex", flexDirection: "column", gap: 2,
        position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 100,
        boxSizing: "border-box",
      }}>
        {/* Logo */}
        <div style={{ padding: "6px 10px 24px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 800,
            color: "#fff", letterSpacing: -0.5, lineHeight: 1 }}>
            smm<span style={{ color: "#3478F6" }}>platform</span>
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 500, letterSpacing: 0.3 }}>
            AI-платформа для системного SMM
          </div>
        </div>

        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 10, border: "none",
                cursor: "pointer", width: "100%", textAlign: "left",
                background: active ? "#3478F6" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.55)",
                fontSize: 13, fontWeight: active ? 600 : 400,
                transition: "background 0.15s, color 0.15s",
                lineHeight: 1.3,
              }}>
              <span style={{ fontSize: 14, flexShrink: 0, opacity: active ? 1 : 0.7 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* АИСТ hint */}
        <div style={{ padding: "10px 12px", borderRadius: 10,
          background: "rgba(52,120,246,0.12)", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3478F6", marginBottom: 2 }}>
            🐦 АИСТ
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
            Авто-генерация · Идеи · Стратегия · Тексты
          </div>
        </div>

        <button onClick={logout}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 12px", borderRadius: 10, border: "none",
            cursor: "pointer", width: "100%", textAlign: "left",
            background: "transparent", color: "rgba(255,255,255,0.35)",
            fontSize: 13, fontWeight: 400,
            transition: "background 0.15s, color 0.15s",
          }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⏻</span>
          <span>Выйти</span>
        </button>
      </nav>
      <div style={{ marginLeft: 224, flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

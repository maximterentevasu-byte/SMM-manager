"use client";

import { usePathname, useRouter } from "next/navigation";

const NAV = [
  {
    href: "/home", label: "Главная",
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: "/post-creator", label: "Быстрый пост",
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
  },
  {
    href: "/analytics", label: "Аналитика",
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
        <line x1="2" y1="20" x2="22" y2="20"/>
      </svg>
    ),
  },
  {
    href: "/content", label: "Контент-план",
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    href: "/strategy", label: "Стратегия и онбординг",
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="3"/>
        <line x1="12" y1="2" x2="12" y2="5"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="5" y2="12"/>
        <line x1="19" y1="12" x2="22" y2="12"/>
      </svg>
    ),
  },
  {
    href: "/platforms", label: "Подключение платформ",
    icon: (
      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </svg>
    ),
  },
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
              <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7, display: "flex", alignItems: "center" }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* АИСТ hint */}
        <div style={{ padding: "10px 12px", borderRadius: 10,
          background: "rgba(52,120,246,0.12)", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3478F6", marginBottom: 2 }}>
            АИСТ
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
          <span style={{ display: "flex", alignItems: "center" }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </span>
          <span>Выйти</span>
        </button>
      </nav>
      <div style={{ marginLeft: 224, flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

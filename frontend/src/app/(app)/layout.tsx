"use client";

import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/home",         icon: "⌂",  label: "Главная" },
  { href: "/post-creator", icon: "✏️", label: "Создание постов" },
  { href: "/analytics",    icon: "📊", label: "Аналитика" },
  { href: "/content",      icon: "📅", label: "Контент-план" },
  { href: "/strategy",     icon: "🎯", label: "Стратегия и онбординг" },
  { href: "/platforms",    icon: "🔗", label: "Подключение платформ" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      <nav style={{
        width: 220, background: "#fff", borderRight: "1px solid #EAE8E2",
        padding: "20px 12px", display: "flex", flexDirection: "column", gap: 4,
        position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 100,
        boxSizing: "border-box",
      }}>
        <div style={{ padding: "4px 8px 20px", fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>
          🍕 SMM Platform
        </div>
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 14, border: "none",
                cursor: "pointer", width: "100%", textAlign: "left",
                background: active ? "#1a1a1a" : "transparent",
                color: active ? "#fff" : "#666",
                fontSize: 13, fontWeight: active ? 600 : 400,
                transition: "background 0.15s",
                lineHeight: 1.3,
              }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div style={{ marginLeft: 220, flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

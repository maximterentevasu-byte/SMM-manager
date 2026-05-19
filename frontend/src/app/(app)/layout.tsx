"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import api from "@/lib/api";
import { useMobile } from "@/hooks/useMobile";

const NAV = [
  {
    href: "/home", label: "Главная",
    icon: (active: boolean) => (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: "/content", label: "Контент-план",
    icon: (active: boolean) => (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    href: "/post-creator", label: "Быстрый пост",
    icon: (active: boolean) => (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
  },
  {
    href: "/analytics", label: "Аналитика",
    icon: (active: boolean) => (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
      </svg>
    ),
  },
  {
    href: "/strategy", label: "Стратегия",
    icon: (active: boolean) => (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
        <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
      </svg>
    ),
  },
  {
    href: "/platforms", label: "Платформы",
    icon: (active: boolean) => (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </svg>
    ),
  },
];

// Bottom nav — 4 основных + «Ещё»
const BOTTOM_NAV = NAV.slice(0, 4);

const PLAN_CARDS = [
  { id: "demo", name: "Демо", price: "0 ₽", period: "3 дня", color: "#5F5E5A", bg: "#F1EFE8", features: ["10 постов", "1 площадка", "AI-стратегия", "AI-тексты", "Автопостинг"] },
  { id: "start", name: "Старт", price: "2 990 ₽", period: "месяц", color: "#185FA5", bg: "#E6F1FB", features: ["12 постов/мес", "1 площадка", "AI-тексты + картинки", "Аналитика"] },
  { id: "business", name: "Бизнес", price: "5 990 ₽", period: "месяц", color: "#0F6E56", bg: "#E1F5EE", badge: "Популярный", features: ["30 постов/мес", "3 площадки", "AI-тексты + картинки", "Полная аналитика"] },
  { id: "pro", name: "Про", price: "11 990 ₽", period: "месяц", color: "#533AB7", bg: "#EEEDFE", features: ["Без ограничений", "Все площадки", "White label", "API доступ"] },
];

function PaywallScreen({ demoUsed, onLogout }: { demoUsed: boolean; onLogout: () => void }) {
  const router = useRouter();
  const isMobile = useMobile();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");

  const startDemo = async () => {
    setActivating(true);
    setError("");
    try {
      await api.post("/subscriptions/activate", { plan: "demo" });
      router.push("/onboarding");
    } catch (e: any) {
      setError(e.response?.data?.detail || "Ошибка активации");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#F8F7F4", display: "flex", flexDirection: "column",
      alignItems: "center", overflowY: "auto",
      padding: isMobile ? "2rem 1rem" : "3rem 1rem",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 800, color: "#0D1B2A", marginBottom: 24 }}>
        smm<span style={{ color: "#3478F6" }}>platform</span>
      </div>
      <div style={{
        background: "#fff", borderRadius: 20, padding: isMobile ? "24px 20px" : "32px 36px",
        maxWidth: 480, width: "100%", textAlign: "center",
        boxShadow: "0 4px 24px rgba(0,0,0,0.07)", marginBottom: 32,
        border: "1px solid #EAE8E2",
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>{demoUsed ? "⏰" : "👋"}</div>
        <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: "#1a1a1a", margin: "0 0 10px" }}>
          {demoUsed ? "Пробный период завершён" : "Выберите тариф для начала работы"}
        </h2>
        <p style={{ color: "#888", fontSize: 14, lineHeight: 1.6, margin: "0 0 8px" }}>
          {demoUsed ? "Платные тарифы скоро станут доступны — следите за обновлениями." : "Начните бесплатно с демо-периода на 3 дня. Карта не нужна."}
        </p>
        {demoUsed && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, background: "#FFF8E1", border: "1px solid #FFD54F", borderRadius: 20, padding: "5px 14px", fontSize: 13, color: "#7B6200" }}>
            🔒 Платные тарифы скоро будут доступны
          </div>
        )}
        {error && <div style={{ marginTop: 12, padding: "10px 14px", background: "#FCEBEB", borderRadius: 10, fontSize: 13, color: "#A32D2D" }}>{error}</div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, maxWidth: 1000, width: "100%", marginBottom: 28 }}>
        {PLAN_CARDS.map((plan) => {
          const isPaid = plan.id !== "demo";
          const isDemoDisabled = plan.id === "demo" && demoUsed;
          const isDisabled = isPaid || isDemoDisabled;
          return (
            <div key={plan.id} style={{ background: isDisabled ? "#FAFAFA" : "#fff", border: "1px solid #EAE8E2", borderRadius: 16, padding: "16px 14px", position: "relative", display: "flex", flexDirection: "column", opacity: isDisabled ? 0.6 : 1 }}>
              {"badge" in plan && plan.badge && (
                <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: plan.color, color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>{plan.badge}</div>
              )}
              {isPaid && <div style={{ position: "absolute", top: 10, right: 10, background: "#F3F4F6", color: "#6B7280", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>Скоро</div>}
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: plan.bg, color: plan.color, display: "inline-block", marginBottom: 10, alignSelf: "flex-start" }}>{plan.name}</span>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: isDisabled ? "#9CA3AF" : "#1a1a1a" }}>{plan.price}</span>
                <span style={{ fontSize: 11, color: "#999", marginLeft: 2 }}>/{plan.period}</span>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: "flex", gap: 5 }}>
                    <span style={{ color: isDisabled ? "#9CA3AF" : plan.color, fontSize: 12 }}>✓</span>
                    <span style={{ fontSize: 11, color: isDisabled ? "#9CA3AF" : "#444", lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={!isDisabled ? startDemo : undefined} disabled={isDisabled || activating} style={{ width: "100%", padding: "9px", background: isDisabled ? "#E5E7EB" : "#1a1a1a", color: isDisabled ? "#9CA3AF" : "#fff", border: "none", borderRadius: 8, cursor: isDisabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}>
                {isDisabled ? (isDemoDisabled ? "Использован" : "Скоро") : activating ? "..." : "Начать бесплатно"}
              </button>
            </div>
          );
        })}
      </div>
      <p style={{ color: "#aaa", fontSize: 13, textAlign: "center", marginBottom: 10 }}>
        По вопросам: <a href="mailto:support@smmplatform.ru" style={{ color: "#3478F6", textDecoration: "none" }}>support@smmplatform.ru</a>
      </p>
      <button onClick={onLogout} style={{ background: "transparent", border: "1px solid #E5E7EB", color: "#888", borderRadius: 10, padding: "9px 24px", fontSize: 13, cursor: "pointer" }}>
        Выйти из аккаунта
      </button>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useMobile();

  const [subChecked, setSubChecked] = useState(false);
  const [hasActiveSub, setHasActiveSub] = useState(true);
  const [demoUsed, setDemoUsed] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  // Mobile nav state
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) { router.push("/login"); return; }
    api.get("/subscriptions/my")
      .then(({ data }) => {
        setHasActiveSub(data.has_subscription ?? false);
        setDemoUsed(data.demo_used ?? false);
        setDaysLeft(data.days_left ?? null);
      })
      .catch(() => {})
      .finally(() => setSubChecked(true));
  }, []);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("businessId");
    router.push("/login");
  };

  if (!subChecked) return null;
  if (!hasActiveSub) return <PaywallScreen demoUsed={demoUsed} onLogout={logout} />;

  // ── MOBILE LAYOUT ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F7FA", fontFamily: "'Inter', sans-serif" }}>

        {/* Top bar */}
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
          height: 56, background: "#0D1B2A",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>
            smm<span style={{ color: "#3478F6" }}>platform</span>
          </div>
          <button onClick={() => setDrawerOpen(true)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            width: 40, height: 40, borderRadius: 8,
          }}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Slide-out drawer */}
        {drawerOpen && (
          <>
            <div onClick={() => setDrawerOpen(false)} style={{
              position: "fixed", inset: 0, zIndex: 300,
              background: "rgba(0,0,0,0.5)",
            }} />
            <div style={{
              position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 400,
              width: 260, background: "#0D1B2A",
              display: "flex", flexDirection: "column",
              padding: "0 12px 24px",
              animation: "slideIn 0.22s ease",
            }}>
              {/* Drawer header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, paddingLeft: 4 }}>
                <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 800, color: "#fff" }}>
                  smm<span style={{ color: "#3478F6" }}>platform</span>
                </div>
                <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex", padding: 6 }}>
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* Nav items */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, paddingTop: 8 }}>
                {NAV.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <button key={item.href} onClick={() => router.push(item.href)} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "11px 12px", borderRadius: 10, border: "none",
                      cursor: "pointer", width: "100%", textAlign: "left",
                      background: active ? "#3478F6" : "transparent",
                      color: active ? "#fff" : "rgba(255,255,255,0.6)",
                      fontSize: 14, fontWeight: active ? 600 : 400,
                    }}>
                      <span style={{ opacity: active ? 1 : 0.7, display: "flex" }}>{item.icon(active)}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Trial warning */}
              {daysLeft !== null && daysLeft <= 3 && (
                <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(239,68,68,0.15)", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#F87171" }}>Демо заканчивается</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>Осталось {daysLeft} {daysLeft === 1 ? "день" : "дня"}</div>
                </div>
              )}

              {/* АИСТ */}
              <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(52,120,246,0.12)", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#3478F6", marginBottom: 1 }}>АИСТ</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>Авто-генерация · Идеи · Стратегия · Тексты</div>
              </div>

              <button onClick={logout} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 10, border: "none",
                cursor: "pointer", background: "transparent",
                color: "rgba(255,255,255,0.35)", fontSize: 13,
              }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Выйти
              </button>
            </div>
          </>
        )}

        {/* Page content */}
        <div style={{ paddingTop: 56, paddingBottom: 72, minHeight: "100vh" }}>
          {children}
        </div>

        {/* Bottom navigation */}
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          height: 64, background: "#0D1B2A",
          display: "flex", alignItems: "center",
          boxShadow: "0 -2px 12px rgba(0,0,0,0.2)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}>
          {BOTTOM_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <button key={item.href} onClick={() => router.push(item.href)} style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 3,
                border: "none", background: "none", cursor: "pointer",
                color: active ? "#3478F6" : "rgba(255,255,255,0.45)",
                padding: "6px 0",
              }}>
                <span style={{ display: "flex" }}>{item.icon(active)}</span>
                <span style={{ fontSize: 9, fontWeight: active ? 600 : 400, letterSpacing: 0.2 }}>
                  {item.label.split(" ")[0]}
                </span>
              </button>
            );
          })}
          {/* "Ещё" opens drawer */}
          <button onClick={() => setDrawerOpen(true)} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 3,
            border: "none", background: "none", cursor: "pointer",
            color: ["/strategy", "/platforms"].some(h => pathname.startsWith(h)) ? "#3478F6" : "rgba(255,255,255,0.45)",
            padding: "6px 0",
          }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
            </svg>
            <span style={{ fontSize: 9, fontWeight: 400 }}>Ещё</span>
          </button>
        </div>
      </div>
    );
  }

  // ── DESKTOP LAYOUT (без изменений) ──────────────────────────────────────
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F5F7FA", fontFamily: "'Inter', sans-serif" }}>
      <nav style={{
        width: 224, background: "#0D1B2A",
        padding: "20px 12px", display: "flex", flexDirection: "column", gap: 2,
        position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 100,
        boxSizing: "border-box",
      }}>
        <div style={{ padding: "6px 10px 24px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: -0.5, lineHeight: 1 }}>
            smm<span style={{ color: "#3478F6" }}>platform</span>
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 500, letterSpacing: 0.3 }}>
            AI-платформа для системного SMM
          </div>
        </div>

        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <button key={item.href} onClick={() => router.push(item.href)} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 10, border: "none",
              cursor: "pointer", width: "100%", textAlign: "left",
              background: active ? "#3478F6" : "transparent",
              color: active ? "#fff" : "rgba(255,255,255,0.55)",
              fontSize: 13, fontWeight: active ? 600 : 400,
              transition: "background 0.15s, color 0.15s", lineHeight: 1.3,
            }}>
              <span style={{ flexShrink: 0, opacity: active ? 1 : 0.7, display: "flex", alignItems: "center" }}>
                {item.icon(active)}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        {daysLeft !== null && daysLeft <= 3 && (
          <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(239,68,68,0.15)", marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#F87171", marginBottom: 1 }}>Демо заканчивается</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>Осталось {daysLeft} {daysLeft === 1 ? "день" : "дня"}</div>
          </div>
        )}

        <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(52,120,246,0.12)", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#3478F6", marginBottom: 2 }}>АИСТ</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>Авто-генерация · Идеи · Стратегия · Тексты</div>
        </div>

        <button onClick={logout} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px", borderRadius: 10, border: "none",
          cursor: "pointer", width: "100%", textAlign: "left",
          background: "transparent", color: "rgba(255,255,255,0.35)",
          fontSize: 13, fontWeight: 400,
        }}>
          <span style={{ display: "flex", alignItems: "center" }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
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

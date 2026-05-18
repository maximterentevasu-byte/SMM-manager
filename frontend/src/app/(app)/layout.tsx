"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import api from "@/lib/api";

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

const PLAN_CARDS = [
  {
    id: "demo",
    name: "Демо",
    price: "0 ₽",
    period: "3 дня",
    color: "#5F5E5A",
    bg: "#F1EFE8",
    features: ["10 постов", "1 площадка", "AI-стратегия", "AI-тексты", "Автопостинг"],
  },
  {
    id: "start",
    name: "Старт",
    price: "2 990 ₽",
    period: "месяц",
    color: "#185FA5",
    bg: "#E6F1FB",
    features: ["12 постов/мес", "1 площадка", "AI-тексты + картинки", "Аналитика"],
  },
  {
    id: "business",
    name: "Бизнес",
    price: "5 990 ₽",
    period: "месяц",
    color: "#0F6E56",
    bg: "#E1F5EE",
    badge: "Популярный",
    features: ["30 постов/мес", "3 площадки", "AI-тексты + картинки", "Полная аналитика", "Приоритетная поддержка"],
  },
  {
    id: "pro",
    name: "Про",
    price: "11 990 ₽",
    period: "месяц",
    color: "#533AB7",
    bg: "#EEEDFE",
    features: ["Без ограничений", "Все площадки", "White label", "API доступ", "Персональный менеджер"],
  },
];

function PaywallScreen({
  demoUsed,
  onLogout,
}: {
  demoUsed: boolean;
  onLogout: () => void;
}) {
  const router = useRouter();
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
      alignItems: "center", overflowY: "auto", padding: "3rem 1rem 2rem",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      {/* Logo */}
      <div style={{
        fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 800,
        color: "#0D1B2A", marginBottom: 32,
      }}>
        smm<span style={{ color: "#3478F6" }}>platform</span>
      </div>

      {/* Status card */}
      <div style={{
        background: "#fff", borderRadius: 20, padding: "32px 36px",
        maxWidth: 480, width: "100%", textAlign: "center",
        boxShadow: "0 4px 24px rgba(0,0,0,0.07)", marginBottom: 40,
        border: "1px solid #EAE8E2",
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>
          {demoUsed ? "⏰" : "👋"}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", margin: "0 0 10px" }}>
          {demoUsed ? "Пробный период завершён" : "Выберите тариф для начала работы"}
        </h2>
        <p style={{ color: "#888", fontSize: 14, lineHeight: 1.6, margin: "0 0 8px" }}>
          {demoUsed
            ? "Ваш 3-дневный пробный период закончился. Платные тарифы скоро станут доступны — следите за обновлениями."
            : "Начните бесплатно с демо-периода на 3 дня. Карта не нужна."}
        </p>
        {demoUsed && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
            background: "#FFF8E1", border: "1px solid #FFD54F",
            borderRadius: 20, padding: "5px 14px", fontSize: 13, color: "#7B6200",
          }}>
            <span>🔒</span>
            <span>Платные тарифы скоро будут доступны</span>
          </div>
        )}
        {error && (
          <div style={{
            marginTop: 12, padding: "10px 14px", background: "#FCEBEB",
            borderRadius: 10, fontSize: 13, color: "#A32D2D",
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Plan cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16, maxWidth: 1000, width: "100%", marginBottom: 32,
      }}>
        {PLAN_CARDS.map((plan) => {
          const isPaid = plan.id !== "demo";
          const isDemoDisabled = plan.id === "demo" && demoUsed;
          const isDisabled = isPaid || isDemoDisabled;

          return (
            <div key={plan.id} style={{
              background: isDisabled ? "#FAFAFA" : "#fff",
              border: plan.id === "business" && !isDisabled
                ? `2px solid ${plan.color}`
                : "1px solid #EAE8E2",
              borderRadius: 20, padding: "24px 20px", position: "relative",
              display: "flex", flexDirection: "column",
              opacity: isDisabled ? 0.6 : 1,
            }}>
              {"badge" in plan && plan.badge && (
                <div style={{
                  position: "absolute", top: -12, left: "50%",
                  transform: "translateX(-50%)",
                  background: isDisabled ? "#9CA3AF" : plan.color,
                  color: "#fff", fontSize: 11, fontWeight: 600,
                  padding: "3px 12px", borderRadius: 20, whiteSpace: "nowrap",
                }}>
                  {plan.badge}
                </div>
              )}
              {isPaid && (
                <div style={{
                  position: "absolute", top: 12, right: 12,
                  background: "#F3F4F6", color: "#6B7280",
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                }}>
                  Скоро
                </div>
              )}
              <span style={{
                fontSize: 12, fontWeight: 600, padding: "2px 8px",
                borderRadius: 20, background: plan.bg, color: plan.color,
                display: "inline-block", marginBottom: 12, alignSelf: "flex-start",
              }}>
                {plan.name}
              </span>
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: isDisabled ? "#9CA3AF" : "#1a1a1a" }}>
                  {plan.price}
                </span>
                <span style={{ fontSize: 13, color: "#999", marginLeft: 4 }}>/ {plan.period}</span>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <span style={{ color: isDisabled ? "#9CA3AF" : plan.color, fontSize: 14, marginTop: 1 }}>✓</span>
                    <span style={{ fontSize: 13, color: isDisabled ? "#9CA3AF" : "#444", lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={!isDisabled ? startDemo : undefined}
                disabled={isDisabled || activating}
                style={{
                  width: "100%", padding: "11px",
                  background: isDisabled ? "#E5E7EB" : activating ? "#888" : plan.id === "business" ? plan.color : "#1a1a1a",
                  color: isDisabled ? "#9CA3AF" : "#fff",
                  border: "none", borderRadius: 10,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  fontSize: 14, fontWeight: 600,
                }}
              >
                {isDisabled
                  ? isDemoDisabled ? "Уже использован" : "Скоро доступно"
                  : activating ? "Подождите..." : "Начать бесплатно"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Support & logout */}
      <p style={{ color: "#aaa", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
        По вопросам:{" "}
        <a href="mailto:support@smmplatform.ru" style={{ color: "#3478F6", textDecoration: "none" }}>
          support@smmplatform.ru
        </a>
      </p>
      <button
        onClick={onLogout}
        style={{
          background: "transparent", border: "1px solid #E5E7EB",
          color: "#888", borderRadius: 10, padding: "9px 24px",
          fontSize: 13, cursor: "pointer",
        }}
      >
        Выйти из аккаунта
      </button>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [subChecked, setSubChecked] = useState(false);
  const [hasActiveSub, setHasActiveSub] = useState(true);
  const [demoUsed, setDemoUsed] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      router.push("/login");
      return;
    }
    api.get("/subscriptions/my")
      .then(({ data }) => {
        setHasActiveSub(data.has_subscription ?? false);
        setDemoUsed(data.demo_used ?? false);
        setDaysLeft(data.days_left ?? null);
      })
      .catch(() => {
        // 401 перехватчик сам редиректит на /login
      })
      .finally(() => setSubChecked(true));
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("businessId");
    router.push("/login");
  };

  // Пока проверяем — не рендерим ничего (избегаем мигания)
  if (!subChecked) return null;

  // Подписка истекла или не активирована — показываем пейвол
  if (!hasActiveSub) {
    return <PaywallScreen demoUsed={demoUsed} onLogout={logout} />;
  }

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

        {/* Trial badge */}
        {daysLeft !== null && daysLeft <= 3 && (
          <div style={{
            padding: "8px 12px", borderRadius: 10,
            background: "rgba(239,68,68,0.15)", marginBottom: 4,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#F87171", marginBottom: 1 }}>
              Демо заканчивается
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>
              Осталось {daysLeft} {daysLeft === 1 ? "день" : "дня"}
            </div>
          </div>
        )}

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

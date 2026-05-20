"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

const PLANS = [
  {
    id: "demo",
    name: "Демо",
    price: "0 ₽",
    period: "3 дня",
    color: "#6B7280",
    bg: "#F5F7FA",
    badge: "Без карты",
    available: true,
    features: [
      "10 постов",
      "1 площадка",
      "AI-стратегия",
      "AI-тексты постов",
      "Автопостинг",
    ],
    cta: "Начать бесплатно",
  },
  {
    id: "start",
    name: "Старт",
    price: "2 990 ₽",
    period: "месяц",
    color: "#3478F6",
    bg: "#EAF4FF",
    badge: null,
    available: false,
    features: [
      "12 постов в месяц",
      "1 площадка",
      "AI-стратегия и план",
      "AI-тексты + картинки",
      "Автопостинг",
      "Базовая аналитика",
    ],
    cta: "Выбрать Старт",
  },
  {
    id: "business",
    name: "Бизнес",
    price: "5 990 ₽",
    period: "месяц",
    color: "#00B5A6",
    bg: "#E0F7F6",
    badge: "Популярный",
    available: false,
    features: [
      "30 постов в месяц",
      "3 площадки",
      "AI-стратегия и план",
      "AI-тексты + картинки",
      "Автопостинг",
      "Полная аналитика",
      "Приоритетная поддержка",
    ],
    cta: "Выбрать Бизнес",
  },
  {
    id: "pro",
    name: "Про",
    price: "11 990 ₽",
    period: "месяц",
    color: "#1F2937",
    bg: "#F5F7FA",
    badge: "Максимум",
    available: false,
    features: [
      "Без ограничений",
      "Все площадки",
      "AI-тексты + картинки",
      "AI-видеоконтент",
      "White label",
      "API доступ",
      "Персональный менеджер",
    ],
    cta: "Выбрать Про",
  },
];

export default function PlansPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selectPlan = async (planId: string) => {
    if (planId !== "demo") return;
    setLoading(planId);
    setError("");
    try {
      const { data } = await api.post("/subscriptions/activate", { plan: planId });
      if (data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        router.push("/onboarding");
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || "Ошибка. Попробуйте ещё раз.");
      setLoading(null);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#F5F7FA",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", padding: "3rem 1rem",
    }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "'Manrope', sans-serif", fontSize: 22, fontWeight: 800,
          color: "#0D1B2A", marginBottom: 20,
        }}>
          smm<span style={{ color: "#3478F6" }}>platform</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#0D1B2A", margin: "0 0 10px" }}>
          Выберите тариф
        </h1>
        <p style={{ color: "#6B7280", fontSize: 15, margin: "0 0 8px" }}>
          Начните бесплатно — демо на 3 дня, карта не нужна
        </p>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "#EAF4FF", border: "1px solid #93C3FD",
          borderRadius: 20, padding: "5px 14px", fontSize: 13, color: "#3478F6",
        }}>
          <span>🔒</span>
          <span>Платные тарифы скоро будут доступны</span>
        </div>
      </div>

      {error && (
        <div style={{
          maxWidth: 400, margin: "0 auto 24px", padding: "12px 16px",
          background: "#FCEBEB", borderRadius: 10, fontSize: 14,
          color: "#A32D2D", textAlign: "center",
        }}>
          {error}
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 16, maxWidth: 1100, margin: "0 auto",
      }}>
        {PLANS.map((plan) => (
          <div key={plan.id} style={{
            background: plan.available ? "#fff" : "#FAFAFA",
            border: plan.id === "business" && plan.available
              ? `2px solid ${plan.color}`
              : "1px solid #E5E7EB",
            borderRadius: 20, padding: "28px 24px", position: "relative",
            display: "flex", flexDirection: "column",
            opacity: plan.available ? 1 : 0.65,
          }}>
            {/* Badge */}
            {plan.badge && (
              <div style={{
                position: "absolute", top: -12, left: "50%",
                transform: "translateX(-50%)",
                background: plan.available ? plan.color : "#9CA3AF",
                color: "#fff", fontSize: 12, fontWeight: 600,
                padding: "4px 14px", borderRadius: 20, whiteSpace: "nowrap",
              }}>
                {plan.badge}
              </div>
            )}

            {/* "Coming soon" ribbon for paid */}
            {!plan.available && (
              <div style={{
                position: "absolute", top: 14, right: 14,
                background: "#F3F4F6", color: "#6B7280",
                fontSize: 11, fontWeight: 600, padding: "3px 10px",
                borderRadius: 20,
              }}>
                Скоро
              </div>
            )}

            <span style={{
              fontSize: 13, fontWeight: 600, padding: "3px 10px",
              borderRadius: 20, background: plan.bg, color: plan.color,
              display: "inline-block", marginBottom: 16, alignSelf: "flex-start",
            }}>
              {plan.name}
            </span>

            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: plan.available ? "#0D1B2A" : "#9CA3AF" }}>
                {plan.price}
              </span>
              <span style={{ fontSize: 14, color: "#999", marginLeft: 4 }}>/ {plan.period}</span>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {plan.features.map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ color: plan.available ? plan.color : "#9CA3AF", fontSize: 15, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 14, color: plan.available ? "#1F2937" : "#9CA3AF", lineHeight: 1.4 }}>{f}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => plan.available ? selectPlan(plan.id) : undefined}
              disabled={!plan.available || loading !== null}
              style={{
                width: "100%", padding: "13px",
                background: !plan.available
                  ? "#E5E7EB"
                  : loading === plan.id ? "#6B7280" : plan.color,
                color: !plan.available ? "#9CA3AF" : "#fff",
                border: "none", borderRadius: 12,
                cursor: !plan.available ? "not-allowed" : loading !== null ? "not-allowed" : "pointer",
                fontSize: 15, fontWeight: 600,
                opacity: plan.available && loading !== null && loading !== plan.id ? 0.5 : 1,
              }}
            >
              {!plan.available
                ? "Скоро доступно"
                : loading === plan.id ? "Подождите..." : plan.cta}
            </button>
          </div>
        ))}
      </div>

      <p style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, marginTop: 32 }}>
        По вопросам: <a href="mailto:support@smmplatform.ru" style={{ color: "#3478F6", textDecoration: "none" }}>support@smmplatform.ru</a>
      </p>
    </div>
  );
}

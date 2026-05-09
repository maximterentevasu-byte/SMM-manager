"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:8000/api" });
api.interceptors.request.use((c) => {
  const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

const PLANS = [
  {
    id: "demo",
    name: "Демо",
    price: "0 ₽",
    period: "3 дня",
    color: "#5F5E5A",
    bg: "#F1EFE8",
    badge: "Без карты",
    features: [
      "10 постов на месяц",
      "1 площадка",
      "AI-стратегия",
      "AI-тексты постов",
      "Автопостинг",
    ],
    limits: "Лимит 10 постов",
    cta: "Начать бесплатно",
  },
  {
    id: "start",
    name: "Старт",
    price: "2 990 ₽",
    period: "месяц",
    color: "#185FA5",
    bg: "#E6F1FB",
    badge: null,
    features: [
      "12 постов в месяц",
      "1 площадка",
      "AI-стратегия и план",
      "AI-тексты + картинки",
      "Автопостинг",
      "Базовая аналитика",
    ],
    limits: null,
    cta: "Выбрать Старт",
  },
  {
    id: "business",
    name: "Бизнес",
    price: "5 990 ₽",
    period: "месяц",
    color: "#0F6E56",
    bg: "#E1F5EE",
    badge: "Популярный",
    features: [
      "30 постов в месяц",
      "3 площадки",
      "AI-стратегия и план",
      "AI-тексты + картинки",
      "Автопостинг",
      "Полная аналитика",
      "Приоритетная поддержка",
    ],
    limits: null,
    cta: "Выбрать Бизнес",
  },
  {
    id: "pro",
    name: "Про",
    price: "11 990 ₽",
    period: "месяц",
    color: "#533AB7",
    bg: "#EEEDFE",
    badge: "Максимум",
    features: [
      "Без ограничений",
      "Все площадки",
      "AI-стратегия и план",
      "AI-тексты + картинки",
      "AI-видеоконтент",
      "White label",
      "API доступ",
      "Персональный менеджер",
    ],
    limits: null,
    cta: "Выбрать Про",
  },
];

export default function PlansPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selectPlan = async (planId: string) => {
    setLoading(planId);
    setError("");
    try {
      const { data } = await api.post("/subscriptions/activate", { plan: planId });

      if (planId === "demo") {
        router.push("/onboarding");
      } else {
        // Редирект на ЮКасса
        if (data.payment_url) {
          window.location.href = data.payment_url;
        } else {
          router.push("/onboarding");
        }
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || "Ошибка. Попробуйте ещё раз.");
      setLoading(null);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#F8F7F4",
      fontFamily: "'Segoe UI', sans-serif", padding: "3rem 1rem",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🍕</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a", margin: "0 0 10px" }}>
          Выберите тариф
        </h1>
        <p style={{ color: "#888", fontSize: 15, margin: 0 }}>
          Начните бесплатно — демо на 3 дня, карта не нужна
        </p>
      </div>

      {error && (
        <div style={{ maxWidth: 400, margin: "0 auto 24px", padding: "12px 16px",
          background: "#FCEBEB", borderRadius: 10, fontSize: 14, color: "#A32D2D", textAlign: "center" }}>
          {error}
        </div>
      )}

      {/* Plans grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 16,
        maxWidth: 1100,
        margin: "0 auto",
      }}>
        {PLANS.map((plan) => (
          <div key={plan.id} style={{
            background: "#fff",
            border: plan.id === "business" ? `2px solid ${plan.color}` : "1px solid #EAE8E2",
            borderRadius: 20,
            padding: "28px 24px",
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}>
            {/* Badge */}
            {plan.badge && (
              <div style={{
                position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                background: plan.color, color: "#fff", fontSize: 12, fontWeight: 600,
                padding: "4px 14px", borderRadius: 20, whiteSpace: "nowrap",
              }}>
                {plan.badge}
              </div>
            )}

            {/* Plan name */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16,
            }}>
              <span style={{
                fontSize: 13, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                background: plan.bg, color: plan.color,
              }}>
                {plan.name}
              </span>
            </div>

            {/* Price */}
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: "#1a1a1a" }}>
                {plan.price}
              </span>
              <span style={{ fontSize: 14, color: "#999", marginLeft: 4 }}>
                / {plan.period}
              </span>
              {plan.limits && (
                <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>{plan.limits}</div>
              )}
            </div>

            {/* Features */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {plan.features.map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ color: plan.color, fontSize: 15, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 14, color: "#444", lineHeight: 1.4 }}>{f}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={() => selectPlan(plan.id)}
              disabled={loading !== null}
              style={{
                width: "100%", padding: "13px",
                background: loading === plan.id ? "#888" : plan.id === "business" ? plan.color : "#1a1a1a",
                color: "#fff", border: "none", borderRadius: 12,
                cursor: loading !== null ? "not-allowed" : "pointer",
                fontSize: 15, fontWeight: 600,
                opacity: loading !== null && loading !== plan.id ? 0.5 : 1,
              }}
            >
              {loading === plan.id ? "Подождите..." : plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p style={{ textAlign: "center", color: "#bbb", fontSize: 13, marginTop: 32 }}>
        Автопродление · Отмена в любой момент · Поддержка 24/7
      </p>
    </div>
  );
}
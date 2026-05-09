"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:8000/api" });
api.interceptors.request.use((c) => {
  const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

export default function PaymentSuccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  const plan = params.get("plan");
  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking");

  useEffect(() => {
    const check = async () => {
      try {
        await new Promise((r) => setTimeout(r, 2000));
        const { data } = await api.get("/subscriptions/my");
        if (data.has_subscription) {
          setStatus("ok");
          setTimeout(() => router.push("/onboarding"), 2000);
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    };
    check();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EAE8E2",
        padding: "3rem 2rem", textAlign: "center", maxWidth: 400, width: "100%" }}>

        {status === "checking" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
              Проверяем оплату...
            </h2>
            <p style={{ color: "#888", fontSize: 14, margin: 0 }}>Это займёт несколько секунд</p>
          </>
        )}

        {status === "ok" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
              Оплата прошла!
            </h2>
            <p style={{ color: "#888", fontSize: 14, margin: "0 0 24px" }}>
              Тариф активирован. Переходим к настройке...
            </p>
            <div style={{ width: "100%", height: 4, background: "#E1F5EE", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: "100%", height: "100%", background: "#0F6E56",
                animation: "progress 2s linear" }} />
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
              Не удалось подтвердить
            </h2>
            <p style={{ color: "#888", fontSize: 14, margin: "0 0 24px" }}>
              Платёж мог пройти, но подтверждение задержалось. Свяжитесь с поддержкой.
            </p>
            <button onClick={() => router.push("/plans")}
              style={{ padding: "12px 28px", background: "#1a1a1a", color: "#fff",
                border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
              Вернуться к тарифам
            </button>
          </>
        )}
      </div>
    </div>
  );
}
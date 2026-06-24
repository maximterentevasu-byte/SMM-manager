"use client";

import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";

type Session = {
  id: string;
  tg_user_id: number;
  tg_username: string | null;
  tg_first_name: string | null;
  channel_title: string | null;
  state: string;
  created_at: string | null;
};

const STATE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  waiting_channel:  { label: "Ожидает канал",     color: "#6B7280", bg: "#F3F4F6" },
  waiting_confirm:  { label: "Ожидает подтверждения", color: "#D97706", bg: "#FFFBEB" },
  pending_approval: { label: "Ожидает одобрения", color: "#2563EB", bg: "#EFF6FF" },
  active:           { label: "Активен",            color: "#059669", bg: "#ECFDF5" },
  rejected:         { label: "Отклонён",           color: "#DC2626", bg: "#FEF2F2" },
};

export default function StoriesPage() {
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [infoRes, sessRes] = await Promise.all([
        api.get("/story-bot/info"),
        api.get("/story-bot/sessions"),
      ]);
      setBotUsername(infoRes.data.username || null);
      setSessions(sessRes.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: string) => {
    setActionLoading(id + "_approve");
    try { await api.post(`/story-bot/approve/${id}`); await load(); } catch {}
    setActionLoading(null);
  };

  const reject = async (id: string) => {
    setActionLoading(id + "_reject");
    try { await api.post(`/story-bot/reject/${id}`); await load(); } catch {}
    setActionLoading(null);
  };

  const remove = async (id: string) => {
    setActionLoading(id + "_delete");
    try { await api.delete(`/story-bot/session/${id}`); await load(); } catch {}
    setActionLoading(null);
  };

  const pending = sessions.filter(s => s.state === "pending_approval");
  const active  = sessions.filter(s => s.state === "active");
  const others  = sessions.filter(s => !["pending_approval", "active"].includes(s.state));

  const card: React.CSSProperties = {
    background: "#fff", borderRadius: 14, border: "1px solid #EDEAE3",
    padding: "16px 20px", display: "flex", alignItems: "center",
    gap: 16, marginBottom: 10,
  };

  const btn = (color: string, bg: string): React.CSSProperties => ({
    padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600, color, background: bg,
  });

  return (
    <div style={{ padding: "32px 24px", maxWidth: 720, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>

      {/* Заголовок */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#0D1B2A" }}>
          Сторис
        </h1>
        <p style={{ margin: "6px 0 0", color: "#6B7280", fontSize: 15 }}>
          Подключение пользователей через Telegram-бот для публикации историй
        </p>
      </div>

      {/* Инструкция */}
      <div style={{
        background: "linear-gradient(135deg, #EEF4FF 0%, #F0FDF4 100%)",
        border: "1px solid #DBEAFE", borderRadius: 16, padding: "24px 28px", marginBottom: 32,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#3478F6", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
          Инструкция
        </div>
        <div style={{ fontSize: 15, color: "#1F2937", lineHeight: 1.7 }}>
          <b>Шаг 1.</b> Пройди идентификацию — напиши боту{" "}
          {botUsername ? (
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#3478F6", fontWeight: 700, textDecoration: "none" }}
            >
              @{botUsername}
            </a>
          ) : (
            <span style={{ color: "#9CA3AF" }}>загрузка...</span>
          )}
          <br />
          <b>Шаг 2.</b> Укажи @username канала публикации<br />
          <b>Шаг 3.</b> Подтверди отправку запроса в боте<br />
          <b>Шаг 4.</b> Дождись одобрения в этом разделе<br />
          <b>Шаг 5.</b> После одобрения — отправляй фото прямо в бот
        </div>
        {botUsername && (
          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-block", marginTop: 16,
              padding: "10px 22px", background: "#3478F6", color: "#fff",
              borderRadius: 10, fontWeight: 600, fontSize: 14, textDecoration: "none",
            }}
          >
            Открыть бот @{botUsername}
          </a>
        )}
      </div>

      {loading ? (
        <div style={{ color: "#9CA3AF", fontSize: 14 }}>Загрузка...</div>
      ) : (
        <>
          {/* Ожидают одобрения */}
          {pending.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#D97706", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
                Ожидают одобрения ({pending.length})
              </div>
              {pending.map(s => (
                <div key={s.id} style={{ ...card, borderColor: "#FDE68A" }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%", background: "#FEF3C7",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, flexShrink: 0,
                  }}>👤</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "#0D1B2A" }}>
                      {s.tg_first_name || "Пользователь"}
                      {s.tg_username && <span style={{ color: "#6B7280", fontWeight: 400 }}> @{s.tg_username}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                      Канал: <b>{s.channel_title || "—"}</b>
                      {s.created_at && (
                        <span> · {new Date(s.created_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => approve(s.id)}
                      disabled={!!actionLoading}
                      style={btn("#fff", "#059669")}
                    >
                      {actionLoading === s.id + "_approve" ? "..." : "✅ Одобрить"}
                    </button>
                    <button
                      onClick={() => reject(s.id)}
                      disabled={!!actionLoading}
                      style={btn("#fff", "#DC2626")}
                    >
                      {actionLoading === s.id + "_reject" ? "..." : "❌ Отклонить"}
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Активные */}
          {active.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#059669", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
                Активные ({active.length})
              </div>
              {active.map(s => (
                <div key={s.id} style={card}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%", background: "#ECFDF5",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, flexShrink: 0,
                  }}>✅</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "#0D1B2A" }}>
                      {s.tg_first_name || "Пользователь"}
                      {s.tg_username && <span style={{ color: "#6B7280", fontWeight: 400 }}> @{s.tg_username}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                      Канал: <b>{s.channel_title || "—"}</b>
                    </div>
                  </div>
                  <button
                    onClick={() => remove(s.id)}
                    disabled={!!actionLoading}
                    style={{ ...btn("#6B7280", "#F3F4F6"), fontSize: 12 }}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </section>
          )}

          {/* Остальные */}
          {others.length > 0 && (
            <section>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>
                Прочие
              </div>
              {others.map(s => {
                const meta = STATE_LABEL[s.state] || { label: s.state, color: "#6B7280", bg: "#F3F4F6" };
                return (
                  <div key={s.id} style={{ ...card, opacity: 0.7 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#0D1B2A" }}>
                        {s.tg_first_name || "Пользователь"}
                        {s.tg_username && <span style={{ color: "#9CA3AF", fontWeight: 400 }}> @{s.tg_username}</span>}
                      </div>
                    </div>
                    <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, color: meta.color, background: meta.bg }}>
                      {meta.label}
                    </span>
                    <button onClick={() => remove(s.id)} disabled={!!actionLoading} style={{ ...btn("#9CA3AF", "#F3F4F6"), fontSize: 12 }}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </section>
          )}

          {sessions.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 15 }}>Запросов пока нет</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                Пользователи появятся здесь после того как напишут боту
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

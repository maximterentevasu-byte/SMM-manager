"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

type TGWeek = {
  week_start: string; week_end: string; channel_name: string;
  subscribers: number; posts_count: number;
  total_views: number; avg_views: number; median_views: number;
  avg_reactions: number; avg_comments: number; avg_reposts: number;
  er_views_pct: number; er_activity_pct: number;
  virality_pct: number; quality_index: number;
  best_day: string; best_hour: string;
  collected_at: string;
};

type VKWeek = {
  week_start: string; week_end: string; group_name: string;
  members: number; posts_count: number;
  total_views: number; avg_views: number; median_views: number;
  avg_likes: number; avg_comments: number; avg_reposts: number;
  er_subscribers_pct: number; er_views_pct: number;
  virality_pct: number; engagement_index: number;
  net_growth: number | null; best_day: string; best_hour: string;
  collected_at: string;
};

const fmt = (n: number | undefined | null, decimals = 0) =>
  n == null ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: decimals });

const delta = (curr: number, prev: number) => {
  if (!prev) return null;
  const d = ((curr - prev) / prev) * 100;
  return d;
};

export default function AnalyticsPage() {
  const [tab, setTab] = useState<"tg" | "vk">("tg");
  const [tgData, setTgData] = useState<TGWeek[]>([]);
  const [vkData, setVkData] = useState<VKWeek[]>([]);
  const [loadingTg, setLoadingTg] = useState(true);
  const [loadingVk, setLoadingVk] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState("");

  const [businessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );

  useEffect(() => {
    if (!businessId) return;
    api.get(`/analytics/${businessId}/tg`)
      .then(({ data }) => setTgData(data))
      .catch(() => {})
      .finally(() => setLoadingTg(false));
    api.get(`/analytics/${businessId}/vk`)
      .then(({ data }) => setVkData(data))
      .catch(() => {})
      .finally(() => setLoadingVk(false));
  }, [businessId]);

  const collect = async () => {
    setCollecting(true);
    setCollectMsg("");
    try {
      await api.post(`/analytics/${businessId}/collect`);
      setCollectMsg("Сбор запущен! Данные появятся через 1–5 минут. Обнови страницу.");
    } catch {
      setCollectMsg("Ошибка запуска сбора");
    } finally {
      setCollecting(false);
    }
  };

  const exportExcel = (platform: "tg" | "vk") => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/analytics/${businessId}/${platform}/export`, "_blank");
  };

  const lastUpdated = (data: (TGWeek | VKWeek)[]) =>
    data.length > 0 ? new Date(data[0].collected_at).toLocaleDateString("ru-RU") : null;

  // Cards for last week
  const tgLast = tgData[0];
  const vkLast = vkData[0];
  const tgPrev = tgData[1];
  const vkPrev = vkData[1];

  const card = (label: string, value: string, suffix = "", trend?: number | null) => (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 14,
      padding: "16px 20px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#999", fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>
        {value}<span style={{ fontSize: 14, fontWeight: 400, color: "#888", marginLeft: 3 }}>{suffix}</span>
      </div>
      {trend != null && (
        <div style={{ fontSize: 12, marginTop: 6,
          color: trend > 0 ? "#0F6E56" : trend < 0 ? "#A32D2D" : "#888" }}>
          {trend > 0 ? "▲" : trend < 0 ? "▼" : "•"} {Math.abs(trend).toFixed(1)}% к прошлой неделе
        </div>
      )}
    </div>
  );

  const tg_cols = [
    { key: "week_start", label: "Неделя", render: (r: TGWeek) => `${r.week_start} — ${r.week_end}`, w: 200 },
    { key: "subscribers", label: "Подписчики", render: (r: TGWeek) => fmt(r.subscribers), w: 110 },
    { key: "posts_count", label: "Постов", render: (r: TGWeek) => String(r.posts_count), w: 70 },
    { key: "avg_views", label: "Ср. охват", render: (r: TGWeek) => fmt(r.avg_views, 0), w: 100 },
    { key: "er_views_pct", label: "ER просм.", render: (r: TGWeek) => fmt(r.er_views_pct, 2) + "%", w: 90 },
    { key: "er_activity_pct", label: "ER актив.", render: (r: TGWeek) => fmt(r.er_activity_pct, 2) + "%", w: 90 },
    { key: "virality_pct", label: "Вирусность", render: (r: TGWeek) => fmt(r.virality_pct, 3) + "%", w: 100 },
    { key: "avg_reactions", label: "Ср. реакции", render: (r: TGWeek) => fmt(r.avg_reactions, 1), w: 100 },
    { key: "quality_index", label: "Индекс", render: (r: TGWeek) => fmt(r.quality_index, 2), w: 80 },
    { key: "best_day", label: "Лучший день", render: (r: TGWeek) => `${r.best_day} ${r.best_hour}`, w: 110 },
  ];

  const vk_cols = [
    { key: "week_start", label: "Неделя", render: (r: VKWeek) => `${r.week_start} — ${r.week_end}`, w: 200 },
    { key: "members", label: "Участников", render: (r: VKWeek) => fmt(r.members), w: 110 },
    { key: "posts_count", label: "Постов", render: (r: VKWeek) => String(r.posts_count), w: 70 },
    { key: "avg_views", label: "Ср. охват", render: (r: VKWeek) => fmt(r.avg_views, 0), w: 100 },
    { key: "er_subscribers_pct", label: "ER подп.", render: (r: VKWeek) => fmt(r.er_subscribers_pct, 2) + "%", w: 90 },
    { key: "er_views_pct", label: "ER просм.", render: (r: VKWeek) => fmt(r.er_views_pct, 2) + "%", w: 90 },
    { key: "virality_pct", label: "Вирусность", render: (r: VKWeek) => fmt(r.virality_pct, 3) + "%", w: 100 },
    { key: "engagement_index", label: "Индекс", render: (r: VKWeek) => fmt(r.engagement_index, 2), w: 80 },
    { key: "net_growth", label: "Прирост", render: (r: VKWeek) => r.net_growth != null ? (r.net_growth >= 0 ? "+" : "") + r.net_growth : "н/д", w: 80 },
    { key: "best_day", label: "Лучший день", render: (r: VKWeek) => `${r.best_day} ${r.best_hour}`, w: 110 },
  ];

  const noTgCreds = !tgData.length && !loadingTg;
  const noVkData = !vkData.length && !loadingVk;

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAE8E2", padding: "0 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 64,
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Аналитика</h1>
            <div style={{ display: "flex", gap: 4 }}>
              {(["tg", "vk"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  style={{ padding: "6px 18px", borderRadius: 20, border: "1px solid",
                    cursor: "pointer", fontSize: 13, fontWeight: tab === t ? 600 : 400,
                    borderColor: tab === t ? "#1a1a1a" : "#E0DED8",
                    background: tab === t ? "#1a1a1a" : "#fff",
                    color: tab === t ? "#fff" : "#666" }}>
                  {t === "tg" ? "✈ Telegram" : "В ВКонтакте"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {(tab === "tg" ? lastUpdated(tgData) : lastUpdated(vkData)) && (
              <span style={{ fontSize: 12, color: "#aaa" }}>
                Обновлено: {tab === "tg" ? lastUpdated(tgData) : lastUpdated(vkData)}
              </span>
            )}
            <button onClick={collect} disabled={collecting}
              style={{ padding: "8px 16px", background: collecting ? "#888" : "#1a1a1a",
                color: "#fff", border: "none", borderRadius: 10,
                cursor: collecting ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {collecting ? "Запускаю..." : "⟳ Собрать сейчас"}
            </button>
            <button onClick={() => exportExcel(tab)}
              style={{ padding: "8px 16px", background: "#0F6E56", color: "#fff",
                border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              ⬇ Excel
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem" }}>
        {collectMsg && (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "#E1F5EE",
            borderRadius: 10, fontSize: 13, color: "#0F6E56" }}>
            {collectMsg}
          </div>
        )}

        {/* ── TELEGRAM ── */}
        {tab === "tg" && (
          <>
            {loadingTg ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>Загружаем...</div>
            ) : noTgCreds ? (
              <TGEmptyState />
            ) : (
              <>
                {/* Cards */}
                {tgLast && (
                  <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
                    {card("Подписчики", fmt(tgLast.subscribers))}
                    {card("Ср. охват", fmt(tgLast.avg_views), "просм.",
                      tgPrev ? delta(tgLast.avg_views, tgPrev.avg_views) : null)}
                    {card("ER по просмотрам", fmt(tgLast.er_views_pct, 2), "%",
                      tgPrev ? delta(tgLast.er_views_pct, tgPrev.er_views_pct) : null)}
                    {card("Индекс качества", fmt(tgLast.quality_index, 2), "",
                      tgPrev ? delta(tgLast.quality_index, tgPrev.quality_index) : null)}
                  </div>
                )}

                {/* Table */}
                <WeeklyTable
                  rows={tgData}
                  cols={tg_cols}
                  emptyText="Нет данных по Telegram"
                />
              </>
            )}
          </>
        )}

        {/* ── VK ── */}
        {tab === "vk" && (
          <>
            {loadingVk ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>Загружаем...</div>
            ) : noVkData ? (
              <VKEmptyState />
            ) : (
              <>
                {vkLast && (
                  <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
                    {card("Участников", fmt(vkLast.members))}
                    {card("Ср. охват", fmt(vkLast.avg_views), "просм.",
                      vkPrev ? delta(vkLast.avg_views, vkPrev.avg_views) : null)}
                    {card("ER подписчики", fmt(vkLast.er_subscribers_pct, 2), "%",
                      vkPrev ? delta(vkLast.er_subscribers_pct, vkPrev.er_subscribers_pct) : null)}
                    {card("Индекс вовлечённости", fmt(vkLast.engagement_index, 2), "",
                      vkPrev ? delta(vkLast.engagement_index, vkPrev.engagement_index) : null)}
                  </div>
                )}

                <WeeklyTable
                  rows={vkData}
                  cols={vk_cols}
                  emptyText="Нет данных по ВКонтакте"
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function WeeklyTable({ rows, cols, emptyText }: { rows: any[]; cols: any[]; emptyText: string }) {
  if (!rows.length) {
    return (
      <div style={{ textAlign: "center", padding: "3rem", color: "#999",
        background: "#fff", borderRadius: 16, border: "1px solid #EAE8E2" }}>
        {emptyText}
      </div>
    );
  }
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#F8F7F4" }}>
            {cols.map((c) => (
              <th key={c.key} style={{ padding: "11px 14px", textAlign: "left",
                fontWeight: 600, color: "#888", fontSize: 11, letterSpacing: 0.4,
                borderBottom: "1px solid #EAE8E2", whiteSpace: "nowrap",
                minWidth: c.w }}>
                {c.label.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #F2F0EC",
              background: i === 0 ? "#FFFEF8" : "transparent" }}>
              {cols.map((c) => (
                <td key={c.key} style={{ padding: "11px 14px", color: i === 0 ? "#1a1a1a" : "#444",
                  fontWeight: i === 0 ? 500 : 400, whiteSpace: "nowrap" }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TGEmptyState() {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16, padding: "32px" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>✈</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
        Данных по Telegram ещё нет
      </h3>
      <p style={{ color: "#888", fontSize: 14, margin: "0 0 20px", lineHeight: 1.6 }}>
        Для сбора аналитики нужно добавить MTProto-credentials в .env файл сервера.
        Это отдельные от бот-токена данные — они дают доступ к статистике канала.
      </p>
      <div style={{ background: "#F8F7F4", borderRadius: 12, padding: "20px", fontSize: 13, color: "#444" }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Шаги настройки:</div>
        {[
          <>1. Зайди на <strong>my.telegram.org</strong> → API development tools → создай приложение</>,
          <>2. Скопируй <code style={{ background: "#EAE8E2", padding: "1px 5px", borderRadius: 4 }}>App api_id</code> и <code style={{ background: "#EAE8E2", padding: "1px 5px", borderRadius: 4 }}>App api_hash</code></>,
          <>3. Сгенерируй сессионную строку (одноразово, на своём компьютере):</>,
          <code style={{ display: "block", background: "#1a1a1a", color: "#4ade80", padding: "10px 14px",
            borderRadius: 8, fontFamily: "monospace", fontSize: 12, margin: "4px 0 8px" }}>
            python -c "from telethon.sync import TelegramClient; c=TelegramClient('s',API_ID,'API_HASH'); c.start(); print(c.session.save())"
          </code>,
          <>4. Добавь в <code style={{ background: "#EAE8E2", padding: "1px 5px", borderRadius: 4 }}>.env</code> три переменные:</>,
          <code style={{ display: "block", background: "#1a1a1a", color: "#93c5fd", padding: "10px 14px",
            borderRadius: 8, fontFamily: "monospace", fontSize: 12, margin: "4px 0" }}>
            TG_API_ID=12345678{"\n"}TG_API_HASH=abcdef...{"\n"}TG_STRING_SESSION=1Bv...
          </code>,
          <>5. Перезапусти сервер и нажми «Собрать сейчас»</>,
        ].map((step, i) => (
          <div key={i} style={{ marginBottom: 6, lineHeight: 1.6 }}>{step}</div>
        ))}
      </div>
    </div>
  );
}

function VKEmptyState() {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16, padding: "32px",
      textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>В</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
        Данных по ВКонтакте ещё нет
      </h3>
      <p style={{ color: "#888", fontSize: 14, margin: "0 0 16px", lineHeight: 1.6 }}>
        Убедись что сообщество ВКонтакте подключено в разделе «Подключение платформ»,
        а затем нажми «Собрать сейчас».
      </p>
      <p style={{ color: "#aaa", fontSize: 13, margin: 0 }}>
        Для доступа к расширенной статистике (охват, подписки) убедись что при создании
        токена выбраны права <strong>Статистика сообщества</strong>.
      </p>
    </div>
  );
}

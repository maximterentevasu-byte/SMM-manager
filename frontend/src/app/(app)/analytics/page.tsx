"use client";

import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import PostsTab from "./PostsTab";
import StoriesTab from "./StoriesTab";
import VKPostsTab from "./VKPostsTab";
import VKStoriesTab from "./VKStoriesTab";
import { useMobile } from "@/hooks/useMobile";

type TGWeek = {
  week_start: string; week_end: string; channel_name: string;
  subscribers: number | null;
  posts_count: number;
  total_views: number | null;
  avg_views: number | null;
  median_views: number | null;
  avg_reactions: number | null;
  avg_comments: number | null;
  avg_reposts: number | null;
  er_reach_pct: number | null;
  er_activity_pct: number | null;
  engagement_per_post: number | null;
  virality_pct: number | null;
  best_post_views: number | null;
  worst_post_views: number | null;
  best_day: string; best_hour: string;
  ai_status: string | null;
  collected_at: string;
};

type VKWeek = {
  week_start: string; week_end: string; group_name: string;
  members: number; posts_count: number;
  total_views: number; avg_views: number; median_views: number;
  avg_likes: number; avg_comments: number; avg_reposts: number;
  er_subscribers_pct: number; er_views_pct: number;
  reach_pct: number | null;
  virality_pct: number; engagement_index: number;
  engagement_per_post: number | null;
  subscribed: number | null;
  unsubscribed: number | null;
  net_growth: number | null; best_day: string; best_hour: string;
  best_post_views: number | null;
  worst_post_views: number | null;
  ai_status: string | null;
  collected_at: string;
};

type TGCredsStatus = {
  configured: boolean;
  has_connection: boolean;
  channel_name?: string;
};

type DashTabKey = "weeks" | "posts" | "stories" | "timing" | "ai";

const fmt = (n: number | undefined | null, decimals = 0) =>
  n == null ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: decimals });

const delta = (curr: number, prev: number) => {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
};

export default function AnalyticsPage() {
  const isMobile = useMobile();
  const [tab, setTab] = useState<"tg" | "vk">("tg");
  const [tgData, setTgData] = useState<TGWeek[]>([]);
  const [vkData, setVkData] = useState<VKWeek[]>([]);
  const [loadingTg, setLoadingTg] = useState(true);
  const [loadingVk, setLoadingVk] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState("");
  const [showSetup, setShowSetup] = useState(false);

  const [tgCredsStatus, setTgCredsStatus] = useState<TGCredsStatus | null>(null);
  const [tgPhone, setTgPhone] = useState("");
  const [tgCode, setTgCode] = useState("");
  const [tgCodeHash, setTgCodeHash] = useState("");
  const [tgPassword, setTgPassword] = useState("");
  const [tgStep, setTgStep] = useState<1 | 2 | 3>(1);
  const [tgPhoneLoading, setTgPhoneLoading] = useState(false);
  const [tgPhoneMsg, setTgPhoneMsg] = useState("");

  const [vkCredsStatus, setVkCredsStatus] = useState<{ configured: boolean; has_connection: boolean } | null>(null);
  const [vkUserToken, setVkUserToken] = useState("");
  const [savingVkCreds, setSavingVkCreds] = useState(false);
  const [vkCredsMsg, setVkCredsMsg] = useState("");
  const [numWeeks, setNumWeeks] = useState(8);
  const [dashTab, setDashTab] = useState<DashTabKey>("weeks");

  const [businessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );

  const [aiModal, setAiModal] = useState<{ period: string; text: string } | null>(null);
  const [subsEditor, setSubsEditor] = useState(false);
  const [subsEdits, setSubsEdits] = useState<Record<string, string>>({});
  const [savingSubs, setSavingSubs] = useState(false);
  const [subsMsg, setSubsMsg] = useState("");

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
    api.get(`/analytics/${businessId}/tg-credentials`)
      .then(({ data }) => setTgCredsStatus(data))
      .catch(() => setTgCredsStatus({ configured: false, has_connection: false }));
    api.get(`/analytics/${businessId}/vk-credentials`)
      .then(({ data }) => setVkCredsStatus(data))
      .catch(() => setVkCredsStatus({ configured: false, has_connection: false }));
  }, [businessId]);

  const collect = async () => {
    setCollecting(true);
    setCollectMsg("");
    try {
      const { data } = await api.post(`/analytics/${businessId}/collect`);
      const parts: string[] = [];
      if (data.vk) {
        parts.push(data.vk.error
          ? `ВКонтакте: ${data.vk.error}`
          : `ВКонтакте: собрано ${data.vk.weeks} нед.`);
      }
      if (data.tg) {
        parts.push(data.tg.error
          ? `Telegram: ${data.tg.error}`
          : `Telegram: собрано ${data.tg.weeks} нед.`);
      }
      const hasData = (data.vk && !data.vk.error) || (data.tg && !data.tg.error);
      setCollectMsg((hasData ? "✓ " : "⚠ ") + (parts.join(" · ") || "Нет подключённых платформ"));
      if (hasData) {
        // перезагружаем данные
        const [tgRes, vkRes] = await Promise.allSettled([
          api.get(`/analytics/${businessId}/tg`),
          api.get(`/analytics/${businessId}/vk`),
        ]);
        if (tgRes.status === "fulfilled") setTgData(tgRes.value.data);
        if (vkRes.status === "fulfilled") setVkData(vkRes.value.data);
      }
    } catch (e: any) {
      setCollectMsg("⚠ " + (e?.response?.data?.detail || "Ошибка сбора"));
    } finally {
      setCollecting(false);
    }
  };

  const sendTgCode = async () => {
    setTgPhoneLoading(true);
    setTgPhoneMsg("");
    try {
      const { data } = await api.post(`/analytics/${businessId}/tg-send-code`, { phone: tgPhone });
      setTgCodeHash(data.phone_code_hash);
      setTgStep(2);
      setTgPhoneMsg("Код отправлен в Telegram. Введи его ниже.");
    } catch (e: any) {
      setTgPhoneMsg(e?.response?.data?.detail || "Ошибка отправки кода");
    } finally {
      setTgPhoneLoading(false);
    }
  };

  const signInTg = async () => {
    setTgPhoneLoading(true);
    setTgPhoneMsg("");
    try {
      const { data } = await api.post(`/analytics/${businessId}/tg-sign-in`, {
        phone: tgPhone,
        code: tgCode,
        phone_code_hash: tgCodeHash,
      });
      if (data.status === "password_required") {
        setTgStep(3);
        setTgPhoneMsg("На аккаунте включена двухэтапная проверка. Введите пароль.");
        return;
      }
      setTgCredsStatus((prev) => prev ? { ...prev, configured: true } : null);
      setTgPhoneMsg("✓ Telegram подключён! Нажмите «Собрать сейчас».");
      setTgStep(1);
      setTgCode("");
    } catch (e: any) {
      const detail: string = e?.response?.data?.detail || "";
      if (detail.toLowerCase().includes("expired") || detail.includes("истёк")) {
        setTgPhoneMsg("Код истёк — нажмите «← Назад» и запросите новый код.");
      } else if (detail.toLowerCase().includes("invalid") || detail.includes("неверн")) {
        setTgPhoneMsg("Неверный код. Проверьте и попробуйте ещё раз.");
      } else {
        setTgPhoneMsg(detail || "Ошибка входа");
      }
    } finally {
      setTgPhoneLoading(false);
    }
  };

  const signIn2FA = async () => {
    setTgPhoneLoading(true);
    setTgPhoneMsg("");
    try {
      await api.post(`/analytics/${businessId}/tg-sign-in-2fa`, { password: tgPassword });
      setTgCredsStatus((prev) => prev ? { ...prev, configured: true } : null);
      setTgPhoneMsg("✓ Telegram подключён! Нажмите «Собрать сейчас».");
      setTgStep(1);
      setTgCode("");
      setTgPassword("");
    } catch (e: any) {
      const detail: string = e?.response?.data?.detail || "";
      setTgPhoneMsg(detail || "Неверный пароль. Попробуйте ещё раз.");
    } finally {
      setTgPhoneLoading(false);
    }
  };

  const saveVkCreds = async () => {
    setSavingVkCreds(true);
    setVkCredsMsg("");
    try {
      await api.post(`/analytics/${businessId}/vk-credentials`, { user_token: vkUserToken });
      setVkCredsStatus((prev) => prev ? { ...prev, configured: true } : null);
      setVkCredsMsg("✓ Токен сохранён. Нажмите «Собрать сейчас».");
    } catch (e: any) {
      setVkCredsMsg(e?.response?.data?.detail || "Ошибка сохранения");
    } finally {
      setSavingVkCreds(false);
    }
  };

  const exportExcel = (platform: "tg" | "vk") => {
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL || ""}/api/analytics/${businessId}/${platform}/export`,
      "_blank"
    );
  };

  const lastUpdated = (data: (TGWeek | VKWeek)[]) =>
    data.length > 0 ? new Date(data[0].collected_at).toLocaleDateString("ru-RU") : null;

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

  const isBasicMode = tgData.length > 0 && (tgData[0] as any)._mode === "basic";

  const dash = (v: number | null | undefined, dec = 0) =>
    v == null ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: dec });
  const pct = (v: number | null | undefined, dec = 2) =>
    v == null ? "—" : fmt(v, dec) + "%";

  const tg_cols_full = [
    { key: "week_start",        label: "Период",           render: (r: TGWeek) => `${r.week_start} — ${r.week_end}`, w: 200 },
    { key: "subscribers",       label: "Подписчики",       render: (r: TGWeek) => dash(r.subscribers),               w: 110 },
    { key: "avg_views",         label: "Ср. просмотр",     render: (r: TGWeek) => dash(r.avg_views, 0),              w: 120 },
    { key: "median_views",      label: "Медиана просм.",   render: (r: TGWeek) => dash(r.median_views, 0),           w: 130 },
    { key: "er_reach_pct",      label: "ER (просм.)%",     render: (r: TGWeek) => pct(r.er_reach_pct),               w: 115 },
    { key: "er_activity_pct",   label: "ER (акт.)%",       render: (r: TGWeek) => pct(r.er_activity_pct),            w: 105 },
    { key: "avg_reactions",     label: "Ср. реакции",      render: (r: TGWeek) => dash(r.avg_reactions, 1),          w: 105 },
    { key: "avg_comments",      label: "Ср. комментарии",  render: (r: TGWeek) => dash(r.avg_comments, 1),           w: 140 },
    { key: "avg_reposts",       label: "Ср. репосты",      render: (r: TGWeek) => dash(r.avg_reposts, 1),            w: 105 },
    { key: "posts_count",       label: "Посты",            render: (r: TGWeek) => String(r.posts_count),             w: 70 },
    { key: "total_views",       label: "Просмотры Σ",      render: (r: TGWeek) => dash(r.total_views),               w: 120 },
    { key: "engagement_per_post", label: "Eng/пост",       render: (r: TGWeek) => dash(r.engagement_per_post, 1),    w: 95 },
    { key: "virality_pct",      label: "Вираль %",         render: (r: TGWeek) => pct(r.virality_pct, 3),            w: 90 },
    { key: "best_post_views",   label: "Лучший пост",      render: (r: TGWeek) => dash(r.best_post_views),           w: 115 },
    { key: "worst_post_views",  label: "Худший пост",      render: (r: TGWeek) => dash(r.worst_post_views),          w: 115 },
    {
      key: "ai_status", label: "Статус недели",
      render: (r: TGWeek) => r.ai_status
        ? <button onClick={() => setAiModal({ period: `${r.week_start} — ${r.week_end}`, text: r.ai_status! })}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
              color: "#3478F6", fontSize: 13, textDecoration: "underline", fontFamily: "inherit" }}>
            Рекомендации
          </button>
        : <span style={{ color: "#ccc" }}>—</span>,
      w: 130,
    },
  ];

  const tg_cols_basic = [
    { key: "week_start", label: "Неделя", render: (r: TGWeek) => `${r.week_start} — ${r.week_end}`, w: 200 },
    { key: "subscribers", label: "Подписчики", render: (r: TGWeek) => fmt(r.subscribers), w: 130 },
    { key: "posts_count", label: "Постов опубликовано", render: (r: TGWeek) => String(r.posts_count), w: 160 },
  ];

  const tg_cols = isBasicMode ? tg_cols_basic : tg_cols_full;

  const vk_cols = [
    { key: "week_start",          label: "Период",          render: (r: VKWeek) => `${r.week_start} — ${r.week_end}`, w: 200 },
    { key: "members",             label: "Участников",      render: (r: VKWeek) => dash(r.members),                   w: 110 },
    { key: "subscribed",          label: "Подписались",     render: (r: VKWeek) => r.subscribed != null ? <span style={{ color: "#0F6E56", fontWeight: 600 }}>+{r.subscribed}</span> : <span style={{ color: "#ccc" }}>н/д</span>, w: 105 },
    { key: "unsubscribed",        label: "Отписались",      render: (r: VKWeek) => r.unsubscribed != null ? <span style={{ color: "#A32D2D", fontWeight: 600 }}>−{r.unsubscribed}</span> : <span style={{ color: "#ccc" }}>н/д</span>, w: 105 },
    { key: "avg_views",           label: "Ср. просмотр",    render: (r: VKWeek) => dash(r.avg_views, 0),              w: 120 },
    { key: "median_views",        label: "Медиана просм.",  render: (r: VKWeek) => dash(r.median_views, 0),           w: 130 },
    { key: "reach_pct",           label: "Охват %",         render: (r: VKWeek) => pct(r.reach_pct),                  w: 90 },
    { key: "er_subscribers_pct",  label: "ER (вовл.)%",    render: (r: VKWeek) => pct(r.er_subscribers_pct),         w: 105 },
    { key: "er_views_pct",        label: "ER (просм.)%",    render: (r: VKWeek) => pct(r.er_views_pct),              w: 105 },
    { key: "avg_likes",           label: "Ср. лайки",       render: (r: VKWeek) => dash(r.avg_likes, 1),              w: 95 },
    { key: "avg_comments",        label: "Ср. комментарии", render: (r: VKWeek) => dash(r.avg_comments, 1),           w: 140 },
    { key: "avg_reposts",         label: "Ср. репосты",     render: (r: VKWeek) => dash(r.avg_reposts, 1),            w: 105 },
    { key: "posts_count",         label: "Посты",           render: (r: VKWeek) => String(r.posts_count),             w: 70 },
    { key: "total_views",         label: "Просмотры Σ",     render: (r: VKWeek) => dash(r.total_views),               w: 120 },
    { key: "engagement_per_post", label: "Eng/пост",        render: (r: VKWeek) => dash(r.engagement_per_post, 1),    w: 95 },
    { key: "virality_pct",        label: "Вираль %",        render: (r: VKWeek) => pct(r.virality_pct, 3),            w: 90 },
    { key: "best_post_views",     label: "Лучший пост",     render: (r: VKWeek) => dash(r.best_post_views),           w: 115 },
    { key: "worst_post_views",    label: "Худший пост",     render: (r: VKWeek) => dash(r.worst_post_views),          w: 115 },
    {
      key: "ai_status", label: "Статус недели",
      render: (r: VKWeek) => r.ai_status
        ? <button onClick={() => setAiModal({ period: `${r.week_start} — ${r.week_end}`, text: r.ai_status! })}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
              color: "#3478F6", fontSize: 13, textDecoration: "underline", fontFamily: "inherit" }}>
            Рекомендации
          </button>
        : <span style={{ color: "#ccc" }}>—</span>,
      w: 130,
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Header */}
      {!isMobile ? (
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
      ) : (
        <div style={{ background: "#fff", borderBottom: "1px solid #EAE8E2", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Аналитика</h1>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={collect} disabled={collecting}
                style={{ padding: "7px 12px", background: collecting ? "#888" : "#1a1a1a",
                  color: "#fff", border: "none", borderRadius: 10,
                  cursor: collecting ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600 }}>
                {collecting ? "..." : "⟳ Собрать"}
              </button>
              <button onClick={() => exportExcel(tab)}
                style={{ padding: "7px 12px", background: "#0F6E56", color: "#fff",
                  border: "none", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                ⬇ Excel
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["tg", "vk"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1px solid",
                  cursor: "pointer", fontSize: 13, fontWeight: tab === t ? 600 : 400,
                  borderColor: tab === t ? "#1a1a1a" : "#E0DED8",
                  background: tab === t ? "#1a1a1a" : "#fff",
                  color: tab === t ? "#fff" : "#666" }}>
                {t === "tg" ? "✈ Telegram" : "В ВКонтакте"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "12px 12px" : "2rem" }}>
        {collectMsg && (
          <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: 10, fontSize: 13,
            background: collectMsg.startsWith("✓") ? "#E1F5EE" : "#FFF3CD",
            color: collectMsg.startsWith("✓") ? "#0F6E56" : "#856404" }}>
            {collectMsg}
          </div>
        )}

        {/* Кнопка-тоггл инструкции */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => setShowSetup((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 8,
              background: "#fff", border: "1px solid #EAE8E2", borderRadius: 12,
              padding: "10px 18px", cursor: "pointer", fontSize: 14,
              color: "#444", fontWeight: 500, width: "100%", textAlign: "left" }}>
            <span style={{ fontSize: 16 }}>⚙</span>
            <span>Как запустить автосбор (Celery)</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#aaa" }}>
              {showSetup ? "▲ Скрыть" : "▼ Показать"}
            </span>
          </button>
          {showSetup && <CelerySetupGuide />}
        </div>

        {/* ── TELEGRAM ── */}
        {tab === "tg" && (
          <>
            {loadingTg ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>Загружаем...</div>
            ) : tgData.length > 0 ? (
              <>
                <DashTabBar active={dashTab} onChange={setDashTab} />

                {dashTab === "weeks" && (
                  <>
                    {!isBasicMode && (
                      <TGDashboard data={tgData} numWeeks={numWeeks} onNumWeeksChange={setNumWeeks} />
                    )}
                    {isBasicMode && tgLast && (
                      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                        {card("Подписчики", fmt(tgLast.subscribers))}
                        {card("Постов за посл. неделю", String(tgLast.posts_count))}
                      </div>
                    )}
                    {isBasicMode && (
                      <div style={{ background: "#F0F4FF", border: "1px solid #C7D4F5",
                        borderRadius: 12, padding: "14px 18px", marginBottom: 20,
                        display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 18 }}>ℹ</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#2D4A9A", marginBottom: 4 }}>
                            Базовый режим — только подписчики и публикации через платформу
                          </div>
                          <div style={{ fontSize: 12, color: "#4A6AB0", lineHeight: 1.6 }}>
                            Для охватов, просмотров и ER настрой MTProto-реквизиты ниже.
                            Это одноразовая настройка — данные начнут собираться сразу.
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Предупреждение про подписчиков */}
                    {!isBasicMode && (
                      <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A",
                        borderRadius: 12, padding: "12px 16px", marginBottom: 16,
                        display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: "#92400E", lineHeight: 1.6 }}>
                            <strong>Telegram не хранит исторические данные о количестве подписчиков.</strong>{" "}
                            Данные будут актуальны с момента подключения к smmplatform.
                            Если у вас есть исторические данные — вы можете внести их вручную.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const init: Record<string, string> = {};
                            tgData.forEach(w => { init[w.week_start] = w.subscribers != null ? String(w.subscribers) : ""; });
                            setSubsEdits(init);
                            setSubsEditor(v => !v);
                            setSubsMsg("");
                          }}
                          style={{ flexShrink: 0, padding: "6px 14px", background: "#F59E0B",
                            color: "#fff", border: "none", borderRadius: 8, fontSize: 12,
                            fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                          Редактировать
                        </button>
                      </div>
                    )}

                    {/* Редактор подписчиков */}
                    {subsEditor && !isBasicMode && (
                      <div style={{ background: "#fff", border: "1px solid #EAE8E2",
                        borderRadius: 16, padding: "20px 24px", marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#aaa",
                          letterSpacing: 0.6, marginBottom: 14 }}>
                          РУЧНАЯ КОРРЕКТИРОВКА ПОДПИСЧИКОВ
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                          {tgData.map(w => (
                            <div key={w.week_start} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <label style={{ fontSize: 11, color: "#888", fontWeight: 600 }}>
                                {w.week_start} — {w.week_end}
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={subsEdits[w.week_start] ?? ""}
                                onChange={e => setSubsEdits(prev => ({ ...prev, [w.week_start]: e.target.value }))}
                                placeholder="—"
                                style={{ padding: "7px 10px", border: "1px solid #E0DED8",
                                  borderRadius: 8, fontSize: 13, fontFamily: "inherit",
                                  background: "#FAFAF8", outline: "none", width: "100%",
                                  boxSizing: "border-box" as any }}
                              />
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
                          <button
                            disabled={savingSubs}
                            onClick={async () => {
                              setSavingSubs(true); setSubsMsg("");
                              try {
                                const weeks = Object.entries(subsEdits)
                                  .filter(([, v]) => v.trim() !== "")
                                  .map(([week_start, v]) => ({ week_start, subscribers: parseInt(v, 10) }));
                                await api.patch(`/analytics/${businessId}/tg/subscribers`, { weeks });
                                const { data } = await api.get(`/analytics/${businessId}/tg`);
                                setTgData(data);
                                setSubsMsg("✓ Сохранено");
                                setSubsEditor(false);
                              } catch {
                                setSubsMsg("⚠ Ошибка сохранения");
                              } finally {
                                setSavingSubs(false);
                              }
                            }}
                            style={{ padding: "8px 20px", background: savingSubs ? "#888" : "#3478F6",
                              color: "#fff", border: "none", borderRadius: 8, fontSize: 13,
                              fontWeight: 600, cursor: savingSubs ? "not-allowed" : "pointer" }}>
                            {savingSubs ? "Сохраняю..." : "Сохранить"}
                          </button>
                          <button
                            onClick={() => { setSubsEditor(false); setSubsMsg(""); }}
                            style={{ padding: "8px 16px", background: "#F0EEE8",
                              color: "#444", border: "none", borderRadius: 8, fontSize: 13,
                              cursor: "pointer" }}>
                            Отмена
                          </button>
                          {subsMsg && (
                            <span style={{ fontSize: 12, color: subsMsg.startsWith("✓") ? "#0F6E56" : "#A32D2D" }}>
                              {subsMsg}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <WeeklyTable rows={tgData} cols={tg_cols} emptyText="Нет данных по Telegram" />
                    {isBasicMode && (
                      <div style={{ marginTop: 24 }}>
                        <TGPhoneForm
                          step={tgStep} phone={tgPhone} code={tgCode} password={tgPassword}
                          loading={tgPhoneLoading} msg={tgPhoneMsg}
                          onPhoneChange={setTgPhone} onCodeChange={setTgCode} onPasswordChange={setTgPassword}
                          onSendCode={sendTgCode} onSignIn={signInTg} onSignIn2FA={signIn2FA}
                          onBack={() => { setTgStep(1); setTgPhoneMsg(""); }}
                        />
                      </div>
                    )}
                  </>
                )}

                {dashTab === "posts" && <PostsTab businessId={businessId} />}
                {dashTab === "stories" && <StoriesTab businessId={businessId} />}
                {dashTab === "timing" && <BestTimingView data={tgData} />}
                {dashTab === "ai" && <AIAnalyticsTab businessId={businessId} />}
              </>
            ) : tgCredsStatus?.has_connection ? (
              <TGPhoneForm
                step={tgStep} phone={tgPhone} code={tgCode} password={tgPassword}
                loading={tgPhoneLoading} msg={tgPhoneMsg}
                onPhoneChange={setTgPhone} onCodeChange={setTgCode} onPasswordChange={setTgPassword}
                onSendCode={sendTgCode} onSignIn={signInTg} onSignIn2FA={signIn2FA}
                onBack={() => { setTgStep(1); setTgPhoneMsg(""); }}
              />
            ) : (
              <NoConnectionState platform="Telegram" />
            )}
          </>
        )}

        {/* ── VK ── */}
        {tab === "vk" && (
          <>
            {loadingVk ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>Загружаем...</div>
            ) : vkData.length > 0 ? (
              <>
                <DashTabBar active={dashTab} onChange={setDashTab} />

                {dashTab === "weeks" && (
                  <>
                    <VKDashboard data={vkData} numWeeks={numWeeks} onNumWeeksChange={setNumWeeks} />
                    <WeeklyTable rows={vkData} cols={vk_cols} emptyText="Нет данных по ВКонтакте" />
                  </>
                )}
                {dashTab === "posts" && <VKPostsTab businessId={businessId} />}
                {dashTab === "stories" && <VKStoriesTab businessId={businessId} />}
                {dashTab === "timing" && <BestTimingView data={vkData} />}
                {dashTab === "ai" && <AIAnalyticsTab businessId={businessId} platform="vk" />}
              </>
            ) : vkCredsStatus?.has_connection ? (
              <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
                padding: "40px 32px", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>В</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
                  Сообщество подключено
                </h3>
                <p style={{ color: "#888", fontSize: 14, margin: "0 0 20px", lineHeight: 1.6 }}>
                  Нажмите <strong>«⟳ Собрать сейчас»</strong> вверху страницы — данные появятся автоматически.
                </p>
              </div>
            ) : (
              <NoConnectionState platform="ВКонтакте" />
            )}
          </>
        )}
      </div>

      {/* AI-статус модал */}
      {aiModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={() => setAiModal(null)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
          <div style={{ position: "relative", width: "min(520px, 92vw)",
            background: "#fff", borderRadius: 20, padding: "32px 36px",
            boxShadow: "0 24px 80px rgba(0,0,0,0.22)" }}>
            <button onClick={() => setAiModal(null)}
              style={{ position: "absolute", top: 16, right: 16, background: "none",
                border: "none", fontSize: 20, cursor: "pointer", color: "#aaa", lineHeight: 1 }}>
              ×
            </button>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#aaa",
              letterSpacing: 0.7, marginBottom: 6 }}>
              СТАТУС НЕДЕЛИ
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 20 }}>
              {aiModal.period}
            </div>
            <div style={{ fontSize: 14, color: "#444", lineHeight: 1.7 }}>
              {aiModal.text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── вспомогательные компоненты ────────────────────────────────────────────

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
                borderBottom: "1px solid #EAE8E2", whiteSpace: "nowrap", minWidth: c.w }}>
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
                <td key={c.key} style={{
                  padding: "11px 14px", color: i === 0 ? "#1a1a1a" : "#444",
                  fontWeight: i === 0 ? 500 : 400,
                  whiteSpace: c.wrap ? "normal" : "nowrap",
                  lineHeight: c.wrap ? 1.5 : undefined,
                  fontSize: c.wrap ? 12 : undefined,
                  maxWidth: c.wrap ? c.w : undefined,
                }}>
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

function ReadyState({ text }: { text: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
      padding: "40px 32px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
      <p style={{ color: "#444", fontSize: 15, margin: 0 }}>{text}</p>
    </div>
  );
}

function NoConnectionState({ platform }: { platform: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
      padding: "40px 32px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔗</div>
      <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
        {platform} не подключён
      </h3>
      <p style={{ color: "#888", fontSize: 14, margin: 0 }}>
        Сначала подключи {platform} в разделе{" "}
        <a href="/platforms" style={{ color: "#1a1a1a", fontWeight: 600 }}>Подключение платформ</a>.
      </p>
    </div>
  );
}

// ─── TG Phone Auth Form ──────────────────────────────────────────────────────

type TGPhoneFormProps = {
  step: 1 | 2 | 3;
  phone: string;
  code: string;
  password: string;
  loading: boolean;
  msg: string;
  onPhoneChange: (v: string) => void;
  onCodeChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSendCode: () => void;
  onSignIn: () => void;
  onSignIn2FA: () => void;
  onBack: () => void;
};

function TGPhoneForm({ step, phone, code, password, loading, msg, onPhoneChange, onCodeChange, onPasswordChange, onSendCode, onSignIn, onSignIn2FA, onBack }: TGPhoneFormProps) {
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1px solid #E0DED8",
    borderRadius: 10, fontSize: 14, fontFamily: "inherit",
    background: "#FAFAF8", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16, padding: "32px", maxWidth: 480 }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>✈</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 6px" }}>
        Подключи аналитику Telegram
      </h3>
      <p style={{ color: "#888", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
        Введи номер телефона от аккаунта Telegram — пришлём код подтверждения прямо в приложение.
      </p>

      {step === 1 ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>
              Номер телефона
            </label>
            <input
              type="tel"
              placeholder="+79001234567"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
              Укажи в международном формате: +7...
            </div>
          </div>
          <button
            onClick={onSendCode}
            disabled={loading || !phone.trim()}
            style={{ padding: "11px 28px", background: phone.trim() ? "#3478F6" : "#ccc",
              color: "#fff", border: "none", borderRadius: 10, fontSize: 14,
              fontWeight: 600, cursor: phone.trim() ? "pointer" : "not-allowed" }}>
            {loading ? "Отправляю..." : "Получить код →"}
          </button>
        </>
      ) : step === 2 ? (
        <>
          <div style={{ background: "#F0F4FF", border: "1px solid #C7D4F5", borderRadius: 10,
            padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#2D4A9A" }}>
            Код отправлен в Telegram на номер <strong>{phone}</strong>. Открой приложение и введи его ниже.
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>
              Код из Telegram
            </label>
            <input
              type="text"
              placeholder="12345"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              style={{ ...inputStyle, fontSize: 20, letterSpacing: 6, textAlign: "center" }}
              maxLength={6}
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onBack}
              style={{ padding: "11px 18px", background: "#F0F0F0",
                color: "#444", border: "none", borderRadius: 10, fontSize: 14,
                fontWeight: 500, cursor: "pointer" }}>
              ← Назад
            </button>
            <button
              onClick={onSignIn}
              disabled={loading || !code.trim()}
              style={{ padding: "11px 28px", background: code.trim() ? "#3478F6" : "#ccc",
                color: "#fff", border: "none", borderRadius: 10, fontSize: 14,
                fontWeight: 600, cursor: code.trim() ? "pointer" : "not-allowed", flex: 1 }}>
              {loading ? "Подключаю..." : "Подтвердить и подключить"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ background: "#FFF8E1", border: "1px solid #F5C842", borderRadius: 10,
            padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#7A5700" }}>
            На аккаунте включена <strong>двухэтапная проверка</strong>. Введи пароль, который ты задал в Telegram.
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>
              Пароль двухэтапной проверки
            </label>
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              style={inputStyle}
              autoFocus
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onBack}
              style={{ padding: "11px 18px", background: "#F0F0F0",
                color: "#444", border: "none", borderRadius: 10, fontSize: 14,
                fontWeight: 500, cursor: "pointer" }}>
              ← Назад
            </button>
            <button
              onClick={onSignIn2FA}
              disabled={loading || !password.trim()}
              style={{ padding: "11px 28px", background: password.trim() ? "#3478F6" : "#ccc",
                color: "#fff", border: "none", borderRadius: 10, fontSize: 14,
                fontWeight: 600, cursor: password.trim() ? "pointer" : "not-allowed", flex: 1 }}>
              {loading ? "Проверяю..." : "Подтвердить пароль"}
            </button>
          </div>
        </>
      )}

      {msg && (
        <div style={{ marginTop: 14, fontSize: 13,
          color: msg.startsWith("✓") ? "#059669"
            : msg.startsWith("На аккаунте") || msg.startsWith("Код отправлен") ? "#7A5700"
            : "#DC2626" }}>
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── VK User Token Form ──────────────────────────────────────────────────────

type VKUserTokenFormProps = {
  token: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  msg: string;
  configured: boolean;
};

function VKUserTokenForm({ token, onChange, onSave, saving, msg, configured }: VKUserTokenFormProps) {
  const VK_OAUTH_URL =
    "https://oauth.vk.com/authorize?client_id=2685278&display=page" +
    "&redirect_uri=https://oauth.vk.com/blank.html" +
    "&scope=groups,wall,stats,offline&response_type=token&v=5.199";

  const step = (emoji: string, text: React.ReactNode) => (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
      <span style={{ fontSize: 20, lineHeight: 1.4 }}>{emoji}</span>
      <div style={{ fontSize: 14, color: "#444", lineHeight: 1.6 }}>{text}</div>
    </div>
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16, padding: "32px", maxWidth: 520 }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>В</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
        Подключи аналитику ВКонтакте
      </h3>
      <p style={{ color: "#888", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
        Следуй 4 шагам ниже — займёт меньше минуты.
      </p>

      {configured && (
        <div style={{ background: "#E1F5EE", borderRadius: 10, padding: "10px 14px",
          fontSize: 13, color: "#0F6E56", marginBottom: 20 }}>
          ✓ Токен сохранён. Нажмите «Собрать сейчас» для обновления данных.
        </div>
      )}

      <div style={{ background: "#F8F7F4", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
        {step("🚀", (
          <>
            Открой{" "}
            <a href={VK_OAUTH_URL} target="_blank" rel="noopener noreferrer"
              style={{ color: "#4680C2", fontWeight: 600, textDecoration: "underline" }}>
              эту ссылку
            </a>
            {" "}в браузере
          </>
        ))}
        {step("🔐", "Войди в ВКонтакте и разреши доступ")}
        {step("✅", <>Тебя перебросит на пустую страницу — смотри на <strong>адресную строку</strong></>)}
        {step("🔥", (
          <>
            Найди в URL часть{" "}
            <code style={{ background: "#EAE8E2", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>access_token=</code>
            {" "}— скопируй всё <strong>после неё и до ближайшего</strong>{" "}
            <code style={{ background: "#EAE8E2", padding: "1px 6px", borderRadius: 4, fontSize: 12 }}>&amp;</code>
          </>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>
          Вставь токен сюда
        </label>
        <input
          type="password"
          placeholder="vk1.a.xxxxxx..."
          value={token}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", border: "1px solid #E0DED8",
            borderRadius: 10, fontSize: 13, background: "#FAFAF8",
            outline: "none", boxSizing: "border-box" }}
        />
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
          Токен хранится в зашифрованном виде.
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={saving || !token}
        style={{ padding: "11px 28px", background: token ? "#4680C2" : "#ccc",
          color: "#fff", border: "none", borderRadius: 10, fontSize: 14,
          fontWeight: 600, cursor: token ? "pointer" : "not-allowed" }}>
        {saving ? "Сохраняю..." : "Сохранить токен"}
      </button>

      {msg && (
        <div style={{ marginTop: 12, fontSize: 13,
          color: msg.startsWith("✓") ? "#0F6E56" : "#A32D2D" }}>
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── VK Empty State ─────────────────────────────────────────────────────────

function VKEmptyState() {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
      padding: "40px 32px" }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>В</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
        Данных по ВКонтакте ещё нет
      </h3>
      <p style={{ color: "#555", fontSize: 14, margin: "0 0 16px", lineHeight: 1.6 }}>
        Убедись что сообщество подключено в разделе{" "}
        <a href="/platforms" style={{ color: "#1a1a1a", fontWeight: 600 }}>Подключение платформ</a>,
        затем нажми <strong>«⟳ Собрать сейчас»</strong> вверху страницы.
      </p>
      <div style={{ background: "#FFF8E6", border: "1px solid #F5E6A0", borderRadius: 10,
        padding: "12px 16px", fontSize: 13, color: "#7A5C00" }}>
        Для получения данных об охватах и приросте подписчиков убедись, что при создании токена
        выбрано разрешение <strong>«Статистика сообщества»</strong>.
      </div>
    </div>
  );
}

// ─── Celery Setup Guide ──────────────────────────────────────────────────────

function CelerySetupGuide() {
  const pre = (text: string, color = "#4ade80") => (
    <pre style={{ background: "#1a1a1a", color, padding: "12px 16px",
      borderRadius: 10, fontFamily: "monospace", fontSize: 12,
      margin: "8px 0", overflowX: "auto", whiteSpace: "pre-wrap" }}>
      {text}
    </pre>
  );
  const pill = (t: string) => (
    <code style={{ background: "#EAE8E2", padding: "2px 7px", borderRadius: 5, fontSize: 12 }}>{t}</code>
  );

  return (
    <div style={{ border: "1px solid #EAE8E2", borderTop: "none", borderRadius: "0 0 12px 12px",
      background: "#fff", padding: "20px 24px", fontSize: 13, color: "#444", lineHeight: 1.8 }}>
      <p style={{ margin: "0 0 12px", color: "#888" }}>
        Кнопка «Собрать сейчас» работает без Celery. Celery нужен только для
        <strong> еженедельного автосбора</strong> (каждый понедельник в 06:00 МСК).
      </p>
      <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>Запуск вручную</div>
      {pre(`# Воркер\ncelery -A app.workers.celery_app worker -l info -Q default,generation,posting\n\n# Beat-планировщик (в отдельном терминале)\ncelery -A app.workers.celery_app beat -l info`)}
      <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 4, marginTop: 16 }}>Docker Compose</div>
      {pre(`celery_worker:\n  build: ./backend\n  command: celery -A app.workers.celery_app worker -l info\n  depends_on: [redis, db]\n  env_file: .env\n\ncelery_beat:\n  build: ./backend\n  command: celery -A app.workers.celery_app beat -l info\n  depends_on: [redis]\n  env_file: .env`, "#93c5fd")}
      <div style={{ background: "#FFF8E6", border: "1px solid #F5E6A0", borderRadius: 8,
        padding: "10px 14px", marginTop: 12, fontSize: 12, color: "#7A5C00" }}>
        ⚠ Нужен Redis. Укажи {pill("REDIS_URL")} в .env (по умолчанию {pill("redis://localhost:6379/0")}).
      </div>
    </div>
  );
}

// ─── Dashboard Components ─────────────────────────────────────────────────────

function PeriodFilter({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const opts = [
    { label: "2 нед.", v: 2 },
    { label: "1 мес.", v: 4 },
    { label: "2 мес.", v: 8 },
    { label: "3 мес.", v: 13 },
    { label: "6 мес.", v: 26 },
    { label: "Всё время", v: 0 },
  ];
  return (
    <div style={{ display: "flex", gap: 3, background: "#F0EEE8", padding: 3, borderRadius: 10 }}>
      {opts.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)}
          style={{ padding: "5px 13px", borderRadius: 8, border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: o.v === value ? 600 : 400,
            background: o.v === value ? "#fff" : "transparent",
            color: o.v === value ? "#1a1a1a" : "#999",
            boxShadow: o.v === value ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.15s" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Sparkline({ vals, color }: { vals: number[]; color: string }) {
  if (vals.length < 2) return <div style={{ width: 64, height: 28 }} />;
  const max = Math.max(...vals) || 1;
  const min = Math.min(...vals);
  const range = max - min || max || 1;
  const W = 64, H = 28;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / range) * H * 0.85 - H * 0.05;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 64, height: 28, flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DashCard({ label, value, suffix = "", trend, sparkVals, compact = false }: {
  label: string; value: number | null; suffix?: string;
  trend?: number | null; sparkVals: number[]; compact?: boolean;
}) {
  const trendColor = trend == null ? "#aaa" : trend > 0 ? "#0F6E56" : trend < 0 ? "#A32D2D" : "#888";
  const v = value ?? 0;
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 14,
      padding: compact ? "12px 14px" : "18px 20px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, color: "#aaa", fontWeight: 700, letterSpacing: 0.7,
        marginBottom: compact ? 4 : 6 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: compact ? 20 : 24, fontWeight: 700, color: "#1a1a1a",
        lineHeight: 1, marginBottom: compact ? 4 : 6 }}>
        {v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
        {suffix && <span style={{ fontSize: compact ? 11 : 13, fontWeight: 400,
          color: "#888", marginLeft: 2 }}>{suffix}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 10, color: trendColor, fontWeight: 500 }}>
          {trend != null
            ? <>{trend > 0 ? "▲" : trend < 0 ? "▼" : "•"} {Math.abs(trend).toFixed(1)}%</>
            : <span style={{ color: "#ddd" }}>—</span>}
        </div>
        <Sparkline vals={sparkVals} color={trendColor === "#aaa" || trendColor === "#888" ? "#d0cec8" : trendColor} />
      </div>
    </div>
  );
}

function BarChartInner({ data, getValue, getLabel, color, suffix, h }: {
  data: any[]; getValue: (d: any) => number; getLabel: (d: any) => string;
  color: string; suffix: string; h: number;
}) {
  const [hovIdx, setHovIdx] = useState<number | null>(null);
  const vals = data.map(getValue);
  const max = Math.max(...vals, 0.001);
  const n = vals.length;
  const LEFT = 40, W = 400, labelH = 18;
  const chartW = W - LEFT;
  const H = h;

  const fmtY = (v: number) => {
    if (v >= 10000) return (v / 1000).toFixed(0) + "k";
    if (v >= 1000) return (v / 1000).toFixed(1) + "k";
    if (v < 1) return v.toFixed(2);
    if (v < 10) return v.toFixed(1);
    return Math.round(v).toString();
  };

  const yTicks = [0.25, 0.5, 0.75, 1].map(f => ({ f, val: max * f, y: H - H * f }));

  return (
    <svg viewBox={`0 0 ${W} ${H + labelH}`} style={{ width: "100%", height: H + labelH + 4, display: "block", overflow: "visible" }}>
      <line x1={LEFT} y1={H} x2={W} y2={H} stroke="#E0DED8" strokeWidth={1} />
      {yTicks.map(({ f, val, y }) => (
        <g key={f}>
          <line x1={LEFT} y1={y} x2={W} y2={y} stroke="#F0EEE8" strokeWidth={1} />
          <text x={LEFT - 4} y={y + 3} textAnchor="end" fontSize={7.5} fill="#bbb">{fmtY(val)}</text>
        </g>
      ))}
      {vals.map((v, i) => {
        const slotW = chartW / n;
        const barW = Math.max(Math.min(slotW * 0.6, 44), 5);
        const x = LEFT + i * slotW + (slotW - barW) / 2;
        const barH = Math.max((v / max) * H, v > 0 ? 2 : 0);
        const y = H - barH;
        const isHov = hovIdx === i;
        const tipW = 58;
        const tipX = Math.min(Math.max(x + barW / 2 - tipW / 2, LEFT), W - tipW);
        const tipY = Math.max(y - 22, 0);
        return (
          <g key={i} onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(null)} style={{ cursor: "default" }}>
            <rect x={x} y={y} width={barW} height={barH} fill={isHov ? color : color + "88"} rx={3} style={{ transition: "fill 0.1s" }} />
            <text x={x + barW / 2} y={H + labelH - 1} textAnchor="middle" fontSize={8.5} fill={isHov ? "#333" : "#bbb"}>
              {getLabel(data[i])}
            </text>
            {isHov && (
              <g>
                <rect x={tipX} y={tipY} width={tipW} height={17} fill="#1a1a1a" rx={4} opacity={0.88} />
                <text x={tipX + tipW / 2} y={tipY + 12} textAnchor="middle" fontSize={9.5} fill="#fff" fontWeight="700">
                  {v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}{suffix}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function BarChartSVG({ data, getValue, getLabel, color, title, suffix = "" }: {
  data: any[]; getValue: (d: any) => number;
  getLabel: (d: any) => string; color: string; title: string; suffix?: string;
}) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 14, padding: "18px 20px", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", letterSpacing: 0.7 }}>
            {title.toUpperCase()}
          </div>
          <button
            onClick={() => setFullscreen(true)}
            title="Развернуть"
            style={{ background: "none", border: "1px solid #E0DED8", borderRadius: 6, cursor: "pointer",
              padding: "3px 6px", display: "flex", alignItems: "center", color: "#999",
              transition: "border-color 0.15s, color 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#3478F6"; (e.currentTarget as HTMLButtonElement).style.color = "#3478F6"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#E0DED8"; (e.currentTarget as HTMLButtonElement).style.color = "#999"; }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <BarChartInner data={data} getValue={getValue} getLabel={getLabel} color={color} suffix={suffix} h={96} />
      </div>

      {fullscreen && (
        <div
          onClick={() => setFullscreen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 20, padding: "28px 32px",
              width: "min(92vw, 1100px)", maxHeight: "85vh", overflow: "auto",
              boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", letterSpacing: 0.3 }}>
                {title}
              </div>
              <button
                onClick={() => setFullscreen(false)}
                style={{ background: "#F0EEE8", border: "none", borderRadius: 8, cursor: "pointer",
                  width: 32, height: 32, fontSize: 16, color: "#555", display: "flex",
                  alignItems: "center", justifyContent: "center" }}>
                ✕
              </button>
            </div>
            <BarChartInner data={data} getValue={getValue} getLabel={getLabel} color={color} suffix={suffix} h={280} />
          </div>
        </div>
      )}
    </>
  );
}

function LineChartSVG({ data, getValue, getLabel, color, title, suffix = "" }: {
  data: any[]; getValue: (d: any) => number; getLabel: (d: any) => string;
  color: string; title: string; suffix?: string;
}) {
  const vals = data.map(getValue);
  const n = vals.length;
  if (n < 2) return null;
  const max = Math.max(...vals, 0.001);
  const min = Math.min(...vals);
  const range = max - min || max;
  const W = 400, H = 96, labelH = 18;

  const pts = vals.map((v, i) => ({
    x: n > 1 ? (i / (n - 1)) * W : W / 2,
    y: H - ((v - min) / range) * H * 0.82 - H * 0.07,
  }));

  const polyline = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `M${pts[0].x.toFixed(1)},${H} ` +
    pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L${pts[n - 1].x.toFixed(1)},${H} Z`;
  const gradId = `lg-${title.replace(/\s/g, "")}`;

  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", letterSpacing: 0.7, marginBottom: 14 }}>
        {title.toUpperCase()}
      </div>
      <svg viewBox={`0 0 ${W} ${H + labelH}`} style={{ width: "100%", height: H + labelH + 4, display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={0} y1={H - H * f * 0.82 - H * 0.07} x2={W} y2={H - H * f * 0.82 - H * 0.07}
            stroke="#F0EEE8" strokeWidth={1} />
        ))}
        <path d={area} fill={`url(#${gradId})`} />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === n - 1 ? 4 : 2.5}
            fill={i === n - 1 ? color : "#fff"} stroke={color} strokeWidth={1.5} />
        ))}
        {data.map((d, i) => (
          <text key={i} x={pts[i].x} y={H + labelH - 1} textAnchor="middle"
            fontSize={8.5} fill={i === n - 1 ? "#555" : "#bbb"}>
            {getLabel(d)}
          </text>
        ))}
        <text x={2} y={10} fontSize={8} fill="#ddd">
          {max.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}{suffix}
        </text>
      </svg>
    </div>
  );
}

function filterByDateRange<T extends { week_start: string }>(
  data: T[], numWeeks: number
): T[] {
  const asc = [...data].sort((a, b) => a.week_start.localeCompare(b.week_start));
  if (numWeeks === 0 || asc.length === 0) return asc;
  const latestMs = new Date(asc[asc.length - 1].week_start).getTime();
  const cutoffMs = latestMs - numWeeks * 7 * 24 * 3600 * 1000;
  return asc.filter(d => new Date(d.week_start).getTime() >= cutoffMs);
}

function TGDashboard({ data, numWeeks, onNumWeeksChange }: {
  data: TGWeek[]; numWeeks: number; onNumWeeksChange: (v: number) => void;
}) {
  const filtered = filterByDateRange(data, numWeeks);
  const last = filtered[filtered.length - 1];
  const prev = filtered[filtered.length - 2];
  if (!filtered.length || !last) return null;

  const pct = (a: number, b: number | undefined) =>
    b && b > 0 ? ((a - b) / b) * 100 : null;
  const lbl = (d: TGWeek) => d.week_start.slice(5).replace("-", ".");

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>Сравнение периодов</div>
        <PeriodFilter value={numWeeks} onChange={onNumWeeksChange} />
      </div>

      {/* 5 карточек */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 12 }}>
        <DashCard compact label="Подписчики" value={last.subscribers}
          trend={pct(last.subscribers, prev?.subscribers)}
          sparkVals={filtered.map(d => d.subscribers || 0)} />
        <DashCard compact label="Ср. охват" value={last.avg_views}
          trend={pct(last.avg_views, prev?.avg_views)}
          sparkVals={filtered.map(d => d.avg_views || 0)} />
        <DashCard compact label="ER (просмотры)" value={last.er_reach_pct} suffix="%"
          trend={pct(last.er_reach_pct, prev?.er_reach_pct)}
          sparkVals={filtered.map(d => d.er_reach_pct || 0)} />
        <DashCard compact label="ER (активности)" value={last.er_activity_pct} suffix="%"
          trend={pct(last.er_activity_pct, prev?.er_activity_pct)}
          sparkVals={filtered.map(d => d.er_activity_pct || 0)} />
        <DashCard compact label="Постов" value={last.posts_count}
          trend={pct(last.posts_count, prev?.posts_count)}
          sparkVals={filtered.map(d => d.posts_count || 0)} />
      </div>

      {/* Ряд 1: охват + ER просмотры */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 10 }}>
        <BarChartSVG data={filtered} getValue={d => d.avg_views || 0} getLabel={lbl}
          color="#1a1a1a" title="Средний охват по неделям" />
        <BarChartSVG data={filtered} getValue={d => d.er_reach_pct || 0} getLabel={lbl}
          color="#0F6E56" title="ER (просмотры) %" suffix="%" />
      </div>

      {/* Ряд 2: подписчики + ER активности */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 10 }}>
        <BarChartSVG data={filtered} getValue={d => d.subscribers || 0} getLabel={lbl}
          color="#3478F6" title="Подписчики" />
        <BarChartSVG data={filtered} getValue={d => d.er_activity_pct || 0} getLabel={lbl}
          color="#7C5CBF" title="ER (активности) %" suffix="%" />
      </div>

      {/* Ряд 3: реакции / комменты / репосты */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <BarChartSVG data={filtered} getValue={d => d.avg_reactions || 0} getLabel={lbl}
          color="#4680C2" title="Ср. реакции" />
        <BarChartSVG data={filtered} getValue={d => d.avg_comments || 0} getLabel={lbl}
          color="#7C5CBF" title="Ср. комментарии" />
        <BarChartSVG data={filtered} getValue={d => d.avg_reposts || 0} getLabel={lbl}
          color="#C25B46" title="Ср. репосты" />
      </div>
    </div>
  );
}

// ─── Dash Tab Bar ─────────────────────────────────────────────────────────────

const DASH_TABS: { key: DashTabKey; label: string }[] = [
  { key: "weeks",  label: "По неделям" },
  { key: "posts",  label: "По постам" },
  { key: "stories", label: "Сториз" },
  { key: "timing", label: "Лучшее время" },
  { key: "ai",    label: "✦ ИИ аналитика" },
];

function DashTabBar({ active, onChange }: { active: DashTabKey; onChange: (v: DashTabKey) => void }) {
  return (
    <div style={{ display: "flex", gap: 3, marginBottom: 20, background: "#F0EEE8",
      padding: 4, borderRadius: 12, overflowX: "auto", maxWidth: "100%" }}>
      {DASH_TABS.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          style={{
            padding: "7px 14px", borderRadius: 9, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: active === t.key ? 600 : 400,
            background: active === t.key ? "#fff" : "transparent",
            color: active === t.key ? "#0D1B2A" : "#999",
            boxShadow: active === t.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.15s", whiteSpace: "nowrap", flexShrink: 0,
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Coming Soon Tab ──────────────────────────────────────────────────────────

function ComingSoonTab({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16,
      padding: "56px 32px", textAlign: "center" }}>
      <div style={{ display: "inline-flex", alignItems: "center",
        background: "#EEF4FF", border: "1px solid #C7D9F8", borderRadius: 20,
        padding: "4px 14px", marginBottom: 18 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#3478F6", letterSpacing: 0.6 }}>СКОРО</span>
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: "#0D1B2A", margin: "0 0 10px" }}>{title}</h3>
      <p style={{ color: "#6B7280", fontSize: 14, margin: 0, maxWidth: 440,
        marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>{desc}</p>
    </div>
  );
}

// ─── Best Timing View ─────────────────────────────────────────────────────────

function BestTimingView({ data }: { data: (TGWeek | VKWeek)[] }) {
  if (!data.length) return null;

  const dayCount: Record<string, number> = {};
  const hourCount: Record<string, number> = {};
  data.forEach(w => {
    if (w.best_day?.trim()) dayCount[w.best_day.trim()] = (dayCount[w.best_day.trim()] || 0) + 1;
    if (w.best_hour?.trim()) hourCount[w.best_hour.trim()] = (hourCount[w.best_hour.trim()] || 0) + 1;
  });

  const dayOrder = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const sortedDays = Object.entries(dayCount).sort((a, b) => {
    const ai = dayOrder.findIndex(d => a[0].startsWith(d));
    const bi = dayOrder.findIndex(d => b[0].startsWith(d));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const sortedHours = Object.entries(hourCount).sort((a, b) => a[0].localeCompare(b[0]));
  const topDaysByFreq = [...sortedDays].sort((a, b) => b[1] - a[1]);
  const topHoursByFreq = [...sortedHours].sort((a, b) => b[1] - a[1]);

  const topDay = topDaysByFreq[0];
  const topHour = topHoursByFreq[0];
  const total = data.length;
  const maxDay = Math.max(...Object.values(dayCount), 1);
  const maxHour = Math.max(...Object.values(hourCount), 1);

  const HBar = ({ label, count, max, color }: { label: string; count: number; max: number; color: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <div style={{ width: 36, fontSize: 12, fontWeight: 600, color: "#374151",
        textAlign: "right", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 5, height: 22, overflow: "hidden" }}>
        <div style={{ width: `${(count / max) * 100}%`, height: "100%", background: color,
          borderRadius: 5, minWidth: count > 0 ? 6 : 0,
          display: "flex", alignItems: "center", paddingLeft: 8 }}>
          {(count / max) > 0.25 && (
            <span style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>{count}×</span>
          )}
        </div>
      </div>
      {(count / max) <= 0.25 && (
        <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500, minWidth: 20 }}>{count}×</span>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "24px 28px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: 0.8, marginBottom: 8 }}>
            ЛУЧШИЙ ДЕНЬ ПУБЛИКАЦИИ
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, color: "#0D1B2A",
            fontFamily: "'Manrope', sans-serif", marginBottom: 4 }}>
            {topDay?.[0] || "—"}
          </div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            {topDay ? `лидирует в ${topDay[1]} из ${total} недель` : "Нет данных"}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "24px 28px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: 0.8, marginBottom: 8 }}>
            ЛУЧШЕЕ ВРЕМЯ ПУБЛИКАЦИИ
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, color: "#3478F6",
            fontFamily: "'Manrope', sans-serif", marginBottom: 4 }}>
            {topHour?.[0] || "—"}
          </div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>
            {topHour ? `лидирует в ${topHour[1]} из ${total} недель` : "Нет данных"}
          </div>
        </div>
      </div>

      {/* Frequency charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "20px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: 0.8, marginBottom: 14 }}>
            ЧАСТОТА ПО ДНЯМ НЕДЕЛИ
          </div>
          {sortedDays.map(([day, count]) => (
            <HBar key={day} label={day} count={count} max={maxDay} color="#3478F6" />
          ))}
          {!sortedDays.length && <div style={{ color: "#ccc", fontSize: 13 }}>Нет данных</div>}
        </div>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "20px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: 0.8, marginBottom: 14 }}>
            ЧАСТОТА ПО ЧАСАМ
          </div>
          {sortedHours.map(([hour, count]) => (
            <HBar key={hour} label={hour} count={count} max={maxHour} color="#059669" />
          ))}
          {!sortedHours.length && <div style={{ color: "#ccc", fontSize: 13 }}>Нет данных</div>}
        </div>
      </div>

      {/* History table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, overflow: "auto" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6",
          fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: 0.8 }}>
          ИСТОРИЯ ПО НЕДЕЛЯМ
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F9FAFB" }}>
              {["НЕДЕЛЯ", "ЛУЧШИЙ ДЕНЬ", "ЛУЧШЕЕ ВРЕМЯ"].map(h => (
                <th key={h} style={{ padding: "10px 20px", textAlign: "left",
                  fontWeight: 600, color: "#6B7280", fontSize: 11,
                  borderBottom: "1px solid #F3F4F6" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((w, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #F9FAFB",
                background: i === 0 ? "#FAFAFA" : "transparent" }}>
                <td style={{ padding: "10px 20px", color: "#374151", fontWeight: i === 0 ? 600 : 400 }}>
                  {w.week_start} — {w.week_end}
                </td>
                <td style={{ padding: "10px 20px", color: "#374151" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%",
                      background: "#3478F6", display: "inline-block", flexShrink: 0 }} />
                    {w.best_day || "—"}
                  </span>
                </td>
                <td style={{ padding: "10px 20px", color: "#059669", fontWeight: 500 }}>
                  {w.best_hour || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── AI Analytics Tab ────────────────────────────────────────────────────────

const AI_PERIOD_OPTS = [
  { label: "2 нед.", v: 2 },
  { label: "1 мес.", v: 4 },
  { label: "2 мес.", v: 8 },
  { label: "3 мес.", v: 13 },
  { label: "6 мес.", v: 26 },
  { label: "Всё время", v: 0 },
];

type AIPost = {
  post_id: number; published_at: string; text: string;
  views: number; adj_views: number; reactions: number;
  comments: number; reposts: number; er_pct: number;
  score: number; age_days: number; age_label: string | null; media_type: string;
};
type AIResult = {
  analysis: string; top_posts: AIPost[]; worst_posts: AIPost[];
  period: string; channel_name: string; total_posts: number;
  avg_views: number; avg_er: number;
};

function renderAIMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (/^##\s/.test(line)) {
      return <h3 key={i} style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a",
        margin: "20px 0 8px", borderBottom: "1px solid #F0EEE8", paddingBottom: 6 }}>
        {line.replace(/^##\s/, "")}
      </h3>;
    }
    if (/^#\s/.test(line)) {
      return <h2 key={i} style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", margin: "0 0 16px" }}>
        {line.replace(/^#\s/, "")}
      </h2>;
    }
    if (/^[-*]\s/.test(line)) {
      return <div key={i} style={{ display: "flex", gap: 8, margin: "3px 0" }}>
        <span style={{ color: "#3478F6", fontWeight: 700, flexShrink: 0 }}>•</span>
        <span style={{ color: "#333" }}>{inlineBold(line.replace(/^[-*]\s/, ""))}</span>
      </div>;
    }
    if (line.trim() === "") return <div key={i} style={{ height: 6 }} />;
    return <p key={i} style={{ margin: "3px 0", color: "#444", lineHeight: 1.65 }}>
      {inlineBold(line)}
    </p>;
  });
}

function inlineBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} style={{ color: "#1a1a1a" }}>{part.slice(2, -2)}</strong>
      : part
  );
}

function AIPostCard({ post, rank, type }: { post: AIPost; rank: number; type: "top" | "worst" }) {
  const isTop = type === "top";
  const scoreColor = isTop ? "#0F6E56" : "#A32D2D";
  const scoreBg   = isTop ? "#E1F5EE" : "#FEF2F2";
  const ekb = new Date(new Date(post.published_at).getTime() + 5 * 3600 * 1000);
  const dateStr = ekb.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });

  return (
    <div style={{ background: "#FAFAF8", borderRadius: 12, padding: "14px 16px",
      border: "1px solid #EAE8E2", marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: scoreBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: scoreColor, flexShrink: 0 }}>
          {rank}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor,
              background: scoreBg, padding: "2px 8px", borderRadius: 6 }}>
              {post.score.toFixed(0)} pts
            </span>
            <span style={{ fontSize: 11, color: "#888" }}>{dateStr}</span>
            {post.media_type !== "none" && (
              <span style={{ fontSize: 11, color: "#666", background: "#F0EEE8",
                padding: "1px 6px", borderRadius: 4 }}>
                {post.media_type === "photo" ? "📷" : post.media_type === "video" ? "🎬" : "📎"}
              </span>
            )}
            {post.age_label && (
              <span style={{ fontSize: 10, color: "#B45309", background: "#FFFBEB",
                border: "1px solid #FDE68A", padding: "1px 6px", borderRadius: 4 }}>
                {post.age_label}
              </span>
            )}
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#333",
            lineHeight: 1.5, overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
            {post.text || "(без текста)"}
          </p>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#666" }}>
            <span>👁 {post.views.toLocaleString("ru-RU")}</span>
            {post.age_days < 14 && post.adj_views !== post.views && (
              <span style={{ color: "#888" }}>~ {post.adj_views.toLocaleString("ru-RU")} расч.</span>
            )}
            <span>ER {post.er_pct.toFixed(2)}%</span>
            {post.reactions > 0 && <span>❤ {post.reactions}</span>}
            {post.reposts > 0 && <span>↗ {post.reposts}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

const AI_PDF_PRINT_ID = "ai-analysis-pdf-area";

function AIAnalyticsTab({ businessId, platform = "tg" }: { businessId: string; platform?: "tg" | "vk" }) {
  const [weeks, setWeeks] = useState(8);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const { data } = await api.post(`/analytics/${businessId}/${platform}/ai-analysis?weeks=${weeks}`);
      setResult(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Ошибка анализа");
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = () => {
    const styleId = "__ai_pdf_print_style__";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        #${AI_PDF_PRINT_ID} { display: block !important; }
        #${AI_PDF_PRINT_ID} { position: static; font-family: 'Inter', sans-serif; color: #1a1a1a; }
        #${AI_PDF_PRINT_ID} * { box-shadow: none !important; }
        @page { margin: 18mm 15mm; size: A4; }
      }
    `;
    window.print();
    setTimeout(() => style!.remove(), 1000);
  };

  return (
    <div>
      <style>{`@keyframes _spin { to { transform: rotate(360deg); } }`}</style>

      {/* Период + кнопка */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 3, background: "#F0EEE8", padding: 3, borderRadius: 10 }}>
          {AI_PERIOD_OPTS.map(o => (
            <button key={o.v} onClick={() => setWeeks(o.v)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: o.v === weeks ? 600 : 400,
                background: o.v === weeks ? "#fff" : "transparent",
                color: o.v === weeks ? "#1a1a1a" : "#999",
                boxShadow: o.v === weeks ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
              {o.label}
            </button>
          ))}
        </div>
        <button onClick={run} disabled={loading}
          style={{ padding: "10px 26px", background: loading ? "#6B7280" : "#3478F6",
            color: "#fff", border: "none", borderRadius: 10, fontSize: 14,
            fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 10 }}>
          {loading
            ? <><span style={{ display: "inline-block", width: 14, height: 14,
                border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff",
                borderRadius: "50%", animation: "_spin 0.75s linear infinite" }} />
                Анализирую...</>
            : "✦ Запустить ИИ-анализ"}
        </button>
        {result && (
          <>
            <span style={{ fontSize: 12, color: "#aaa" }}>
              {result.channel_name} · {result.period} · {result.total_posts} постов
            </span>
            <button onClick={exportPDF}
              style={{ marginLeft: "auto", padding: "9px 18px", background: "#fff",
                border: "1px solid #E0DED8", borderRadius: 10, fontSize: 13,
                fontWeight: 600, color: "#444", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 7 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <path d="M8 1v9m0 0L5 7m3 3 3-3" stroke="#444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="#444" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Скачать PDF
            </button>
          </>
        )}
      </div>

      {/* Загрузка */}
      {loading && (
        <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
          padding: "48px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 16 }}>✦</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>
            ИИ анализирует канал
          </div>
          <div style={{ fontSize: 13, color: "#888" }}>Обычно занимает 15–30 секунд</div>
        </div>
      )}

      {/* Ошибка */}
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12,
          padding: "14px 18px", color: "#A32D2D", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Результат */}
      {result && (
        <div id={AI_PDF_PRINT_ID}>
          {/* Заголовок PDF */}
          <div style={{ display: "none" }} className="pdf-header-only">
            <div style={{ fontSize: 11, color: "#aaa", marginBottom: 8 }}>
              smmplatform · ИИ-аналитика · сформировано {new Date().toLocaleDateString("ru-RU")}
            </div>
          </div>

          {/* Текст анализа */}
          <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
            padding: "28px 32px", marginBottom: 20, fontSize: 14, lineHeight: 1.7 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#aaa", letterSpacing: 0.7,
              marginBottom: 16 }}>
              ИИ-АНАЛИЗ · {result.channel_name.toUpperCase()} · {result.period.toUpperCase()}
            </div>
            {renderAIMarkdown(result.analysis)}
          </div>

          {/* Посты */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
              padding: "20px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0F6E56",
                letterSpacing: 0.7, marginBottom: 14 }}>
                ТОП ПОСТОВ
              </div>
              {result.top_posts.length === 0
                ? <div style={{ color: "#ccc", fontSize: 13 }}>Нет данных по постам</div>
                : result.top_posts.map((p, i) =>
                    <AIPostCard key={p.post_id} post={p} rank={i + 1} type="top" />
                  )}
            </div>
            <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
              padding: "20px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#A32D2D",
                letterSpacing: 0.7, marginBottom: 14 }}>
                СЛАБЫЕ ПОСТЫ (7+ ДНЕЙ)
              </div>
              {result.worst_posts.length === 0
                ? <div style={{ color: "#ccc", fontSize: 13 }}>Недостаточно зрелых постов для сравнения</div>
                : result.worst_posts.map((p, i) =>
                    <AIPostCard key={p.post_id} post={p} rank={i + 1} type="worst" />
                  )}
            </div>
          </div>
        </div>
      )}

      {/* Пустое состояние */}
      {!loading && !result && !error && (
        <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 16,
          padding: "56px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>✦</div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", margin: "0 0 10px" }}>
            ИИ-разбор канала
          </h3>
          <p style={{ color: "#6B7280", fontSize: 14, margin: "0 auto", maxWidth: 440, lineHeight: 1.6 }}>
            Выбери период и нажми «Запустить ИИ-анализ» — получишь полный разбор метрик,
            рейтинг постов с поправкой на возраст и рекомендации на следующие 4 недели.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── VK Dashboard ──────────────────────────────────────────────────────────────

function VKDashboard({ data, numWeeks, onNumWeeksChange }: {
  data: VKWeek[]; numWeeks: number; onNumWeeksChange: (v: number) => void;
}) {
  const filtered = filterByDateRange(data, numWeeks);
  const last = filtered[filtered.length - 1];
  const prev = filtered[filtered.length - 2];
  if (!filtered.length || !last) return null;

  const pctDelta = (a: number, b: number | undefined) =>
    b && b > 0 ? ((a - b) / b) * 100 : null;
  const lbl = (d: VKWeek) => d.week_start.slice(5).replace("-", ".");

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>Сравнение периодов</div>
        <PeriodFilter value={numWeeks} onChange={onNumWeeksChange} />
      </div>

      {/* 5 карточек */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 12 }}>
        <DashCard compact label="Участников" value={last.members}
          trend={pctDelta(last.members, prev?.members)}
          sparkVals={filtered.map(d => d.members || 0)} />
        <DashCard compact label="Ср. охват" value={last.avg_views}
          trend={pctDelta(last.avg_views, prev?.avg_views)}
          sparkVals={filtered.map(d => d.avg_views || 0)} />
        <DashCard compact label="Охват %" value={last.reach_pct} suffix="%"
          trend={pctDelta(last.reach_pct || 0, prev?.reach_pct || undefined)}
          sparkVals={filtered.map(d => d.reach_pct || 0)} />
        <DashCard compact label="ER (вовл.)" value={last.er_subscribers_pct} suffix="%"
          trend={pctDelta(last.er_subscribers_pct, prev?.er_subscribers_pct)}
          sparkVals={filtered.map(d => d.er_subscribers_pct || 0)} />
        <DashCard compact label="Постов" value={last.posts_count}
          trend={pctDelta(last.posts_count, prev?.posts_count)}
          sparkVals={filtered.map(d => d.posts_count || 0)} />
      </div>

      {/* Ряд 1: средний охват + охват % (просмотры/участников) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 10 }}>
        <BarChartSVG data={filtered} getValue={d => d.avg_views || 0} getLabel={lbl}
          color="#1a1a1a" title="Средний охват (просмотры)" />
        <BarChartSVG data={filtered} getValue={d => d.reach_pct || 0} getLabel={lbl}
          color="#0F6E56" title="Охват % (просм./участников)" suffix="%" />
      </div>

      {/* Ряд 2: участники + ER вовлечённости */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 10 }}>
        <BarChartSVG data={filtered} getValue={d => d.members || 0} getLabel={lbl}
          color="#3478F6" title="Участники" />
        <BarChartSVG data={filtered} getValue={d => d.er_subscribers_pct || 0} getLabel={lbl}
          color="#7C5CBF" title="ER вовлечённости %" suffix="%" />
      </div>

      {/* Ряд 3: подписались / отписались */}
      {filtered.some(d => d.subscribed != null) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 10 }}>
          <BarChartSVG data={filtered} getValue={d => d.subscribed ?? 0} getLabel={lbl}
            color="#0F6E56" title="Подписались" />
          <BarChartSVG data={filtered} getValue={d => d.unsubscribed ?? 0} getLabel={lbl}
            color="#A32D2D" title="Отписались" />
        </div>
      )}

      {/* Ряд 4: лайки / комменты / репосты */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <BarChartSVG data={filtered} getValue={d => d.avg_likes || 0} getLabel={lbl}
          color="#4680C2" title="Ср. лайки" />
        <BarChartSVG data={filtered} getValue={d => d.avg_comments || 0} getLabel={lbl}
          color="#7C5CBF" title="Ср. комментарии" />
        <BarChartSVG data={filtered} getValue={d => d.avg_reposts || 0} getLabel={lbl}
          color="#C25B46" title="Ср. репосты" />
      </div>
    </div>
  );
}

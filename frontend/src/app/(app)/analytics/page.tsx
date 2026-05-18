"use client";

import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import PostsTab from "./PostsTab";
import StoriesTab from "./StoriesTab";

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
  virality_pct: number; engagement_index: number;
  net_growth: number | null; best_day: string; best_hour: string;
  collected_at: string;
};

type TGCredsStatus = {
  configured: boolean;
  has_connection: boolean;
  channel_name?: string;
};

type DashTabKey = "weeks" | "posts" | "stories" | "timing";

const fmt = (n: number | undefined | null, decimals = 0) =>
  n == null ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: decimals });

const delta = (curr: number, prev: number) => {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
};

export default function AnalyticsPage() {
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
  const [tgStep, setTgStep] = useState<1 | 2>(1);
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
      await api.post(`/analytics/${businessId}/tg-sign-in`, {
        phone: tgPhone,
        code: tgCode,
        phone_code_hash: tgCodeHash,
      });
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
    { key: "ai_status",         label: "Статус недели",    render: (r: TGWeek) => r.ai_status || "—",                w: 300, wrap: true },
  ];

  const tg_cols_basic = [
    { key: "week_start", label: "Неделя", render: (r: TGWeek) => `${r.week_start} — ${r.week_end}`, w: 200 },
    { key: "subscribers", label: "Подписчики", render: (r: TGWeek) => fmt(r.subscribers), w: 130 },
    { key: "posts_count", label: "Постов опубликовано", render: (r: TGWeek) => String(r.posts_count), w: 160 },
  ];

  const tg_cols = isBasicMode ? tg_cols_basic : tg_cols_full;

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
                    <WeeklyTable rows={tgData} cols={tg_cols} emptyText="Нет данных по Telegram" />
                    {isBasicMode && (
                      <div style={{ marginTop: 24 }}>
                        <TGPhoneForm
                          step={tgStep} phone={tgPhone} code={tgCode}
                          loading={tgPhoneLoading} msg={tgPhoneMsg}
                          onPhoneChange={setTgPhone} onCodeChange={setTgCode}
                          onSendCode={sendTgCode} onSignIn={signInTg}
                          onBack={() => { setTgStep(1); setTgPhoneMsg(""); }}
                        />
                      </div>
                    )}
                  </>
                )}

                {dashTab === "posts" && <PostsTab businessId={businessId} />}
                {dashTab === "stories" && <StoriesTab businessId={businessId} />}
                {dashTab === "timing" && <BestTimingView data={tgData} />}
              </>
            ) : tgCredsStatus?.has_connection ? (
              <TGPhoneForm
                step={tgStep} phone={tgPhone} code={tgCode}
                loading={tgPhoneLoading} msg={tgPhoneMsg}
                onPhoneChange={setTgPhone} onCodeChange={setTgCode}
                onSendCode={sendTgCode} onSignIn={signInTg}
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
                {dashTab === "posts" && (
                  <ComingSoonTab
                    title="Статистика по постам"
                    desc="Детальная аналитика по каждой публикации: охваты, лайки, ER поста — появится в следующем обновлении."
                  />
                )}
                {dashTab === "stories" && (
                  <ComingSoonTab
                    title="Статистика Сториз"
                    desc="Аналитика историй ВКонтакте: просмотры, ответы, переходы — появится в следующем обновлении."
                  />
                )}
                {dashTab === "timing" && <BestTimingView data={vkData} />}
              </>
            ) : vkCredsStatus?.has_connection ? (
              <VKUserTokenForm
                token={vkUserToken}
                onChange={setVkUserToken}
                onSave={saveVkCreds}
                saving={savingVkCreds}
                msg={vkCredsMsg}
                configured={vkCredsStatus.configured}
              />
            ) : (
              <NoConnectionState platform="ВКонтакте" />
            )}
          </>
        )}
      </div>
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
  step: 1 | 2;
  phone: string;
  code: string;
  loading: boolean;
  msg: string;
  onPhoneChange: (v: string) => void;
  onCodeChange: (v: string) => void;
  onSendCode: () => void;
  onSignIn: () => void;
  onBack: () => void;
};

function TGPhoneForm({ step, phone, code, loading, msg, onPhoneChange, onCodeChange, onSendCode, onSignIn, onBack }: TGPhoneFormProps) {
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
      ) : (
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
      )}

      {msg && (
        <div style={{ marginTop: 14, fontSize: 13,
          color: msg.startsWith("✓") ? "#059669"
            : msg.startsWith("Код отправлен") ? "#2D4A9A"
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
    { label: "4 нед.", v: 4 },
    { label: "8 нед.", v: 8 },
    { label: "12 нед.", v: 12 },
    { label: "Все", v: 0 },
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

function DashCard({ label, value, suffix = "", trend, sparkVals }: {
  label: string; value: number | null; suffix?: string;
  trend?: number | null; sparkVals: number[];
}) {
  const trendColor = trend == null ? "#aaa" : trend > 0 ? "#0F6E56" : trend < 0 ? "#A32D2D" : "#888";
  const v = value ?? 0;
  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 14,
      padding: "18px 20px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "#aaa", fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", lineHeight: 1, marginBottom: 6 }}>
        {v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
        {suffix && <span style={{ fontSize: 13, fontWeight: 400, color: "#888", marginLeft: 2 }}>{suffix}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 11, color: trendColor, fontWeight: 500 }}>
          {trend != null
            ? <>{trend > 0 ? "▲" : trend < 0 ? "▼" : "•"} {Math.abs(trend).toFixed(1)}%</>
            : <span style={{ color: "#ddd" }}>—</span>}
        </div>
        <Sparkline vals={sparkVals} color={trendColor === "#aaa" || trendColor === "#888" ? "#d0cec8" : trendColor} />
      </div>
    </div>
  );
}

function BarChartSVG({ data, getValue, getLabel, color, title }: {
  data: any[]; getValue: (d: any) => number;
  getLabel: (d: any) => string; color: string; title: string;
}) {
  const vals = data.map(getValue);
  const max = Math.max(...vals, 0.001);
  const n = vals.length;
  const W = 400, H = 96, labelH = 18;

  return (
    <div style={{ background: "#fff", border: "1px solid #EAE8E2", borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#aaa", letterSpacing: 0.7, marginBottom: 14 }}>
        {title.toUpperCase()}
      </div>
      <svg viewBox={`0 0 ${W} ${H + labelH}`} style={{ width: "100%", height: H + labelH + 4, display: "block", overflow: "visible" }}>
        {/* gridlines */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={0} y1={H - H * f} x2={W} y2={H - H * f}
            stroke="#F0EEE8" strokeWidth={1} />
        ))}
        {vals.map((v, i) => {
          const slotW = W / n;
          const barW = Math.max(Math.min(slotW * 0.55, 40), 6);
          const x = i * slotW + (slotW - barW) / 2;
          const barH = (v / max) * H;
          const y = H - barH;
          const isLast = i === n - 1;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH}
                fill={isLast ? color : color + "60"} rx={3} />
              <text x={x + barW / 2} y={H + labelH - 1} textAnchor="middle"
                fontSize={8.5} fill={isLast ? "#555" : "#bbb"}>
                {getLabel(data[i])}
              </text>
            </g>
          );
        })}
        <text x={2} y={10} fontSize={8} fill="#ddd">
          {max.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
        </text>
      </svg>
    </div>
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

function TGDashboard({ data, numWeeks, onNumWeeksChange }: {
  data: TGWeek[]; numWeeks: number; onNumWeeksChange: (v: number) => void;
}) {
  const filtered = [...data].slice(0, numWeeks === 0 ? data.length : numWeeks).reverse();
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

      {/* 4 карточки */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
        <DashCard label="Подписчики" value={last.subscribers}
          trend={pct(last.subscribers, prev?.subscribers)}
          sparkVals={filtered.map(d => d.subscribers || 0)} />
        <DashCard label="Ср. охват" value={last.avg_views}
          trend={pct(last.avg_views, prev?.avg_views)}
          sparkVals={filtered.map(d => d.avg_views || 0)} />
        <DashCard label="ER (просмотры)" value={last.er_reach_pct} suffix="%"
          trend={pct(last.er_reach_pct, prev?.er_reach_pct)}
          sparkVals={filtered.map(d => d.er_reach_pct || 0)} />
        <DashCard label="ER (активности)" value={last.er_activity_pct} suffix="%"
          trend={pct(last.er_activity_pct, prev?.er_activity_pct)}
          sparkVals={filtered.map(d => d.er_activity_pct || 0)} />
      </div>

      {/* 2 графика: охват + ER */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <BarChartSVG data={filtered} getValue={d => d.avg_views || 0} getLabel={lbl}
          color="#1a1a1a" title="Средний охват по неделям" />
        <LineChartSVG data={filtered} getValue={d => d.er_reach_pct || 0} getLabel={lbl}
          color="#0F6E56" title="ER (просмотры) %" suffix="%" />
      </div>

      {/* 3 графика: реакции / комменты / репосты */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
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
];

function DashTabBar({ active, onChange }: { active: DashTabKey; onChange: (v: DashTabKey) => void }) {
  return (
    <div style={{ display: "flex", gap: 3, marginBottom: 20, background: "#F0EEE8",
      padding: 4, borderRadius: 12, width: "fit-content" }}>
      {DASH_TABS.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          style={{
            padding: "7px 18px", borderRadius: 9, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: active === t.key ? 600 : 400,
            background: active === t.key ? "#fff" : "transparent",
            color: active === t.key ? "#0D1B2A" : "#999",
            boxShadow: active === t.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.15s",
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

function VKDashboard({ data, numWeeks, onNumWeeksChange }: {
  data: VKWeek[]; numWeeks: number; onNumWeeksChange: (v: number) => void;
}) {
  const filtered = [...data].slice(0, numWeeks === 0 ? data.length : numWeeks).reverse();
  const last = filtered[filtered.length - 1];
  const prev = filtered[filtered.length - 2];
  if (!filtered.length || !last) return null;

  const pct = (a: number, b: number | undefined) =>
    b && b > 0 ? ((a - b) / b) * 100 : null;
  const lbl = (d: VKWeek) => d.week_start.slice(5).replace("-", ".");

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>Сравнение периодов</div>
        <PeriodFilter value={numWeeks} onChange={onNumWeeksChange} />
      </div>

      {/* 4 карточки */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
        <DashCard label="Участников" value={last.members}
          trend={pct(last.members, prev?.members)}
          sparkVals={filtered.map(d => d.members || 0)} />
        <DashCard label="Ср. охват" value={last.avg_views}
          trend={pct(last.avg_views, prev?.avg_views)}
          sparkVals={filtered.map(d => d.avg_views || 0)} />
        <DashCard label="ER подписчики" value={last.er_subscribers_pct} suffix="%"
          trend={pct(last.er_subscribers_pct, prev?.er_subscribers_pct)}
          sparkVals={filtered.map(d => d.er_subscribers_pct || 0)} />
        <DashCard label="ER просмотры" value={last.er_views_pct} suffix="%"
          trend={pct(last.er_views_pct, prev?.er_views_pct)}
          sparkVals={filtered.map(d => d.er_views_pct || 0)} />
      </div>

      {/* 2 графика: охват + ER */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <BarChartSVG data={filtered} getValue={d => d.avg_views || 0} getLabel={lbl}
          color="#1a1a1a" title="Средний охват по неделям" />
        <LineChartSVG data={filtered} getValue={d => d.er_subscribers_pct || 0} getLabel={lbl}
          color="#4680C2" title="ER по подписчикам %" suffix="%" />
      </div>

      {/* 3 графика: лайки / комменты / репосты */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <BarChartSVG data={filtered} getValue={d => d.avg_likes || 0} getLabel={lbl}
          color="#0F6E56" title="Ср. лайки" />
        <BarChartSVG data={filtered} getValue={d => d.avg_comments || 0} getLabel={lbl}
          color="#7C5CBF" title="Ср. комментарии" />
        <BarChartSVG data={filtered} getValue={d => d.avg_reposts || 0} getLabel={lbl}
          color="#C25B46" title="Ср. репосты" />
      </div>
    </div>
  );
}

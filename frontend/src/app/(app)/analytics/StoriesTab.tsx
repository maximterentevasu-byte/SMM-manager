"use client";

import React, { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

type TGStory = {
  story_id: number;
  channel_name: string;
  published_at: string;
  expires_at: string | null;
  caption: string;
  views: number;
  reactions: number;
  forwards: number;
  has_media: boolean;
  media_type: string;
  er_pct: number;
  updated_at: string;
};


const MEDIA_ICON: Record<string, string> = {
  photo: "🖼",
  video: "🎬",
  none: "",
};

function toEKB(iso: string): Date {
  const d = new Date(iso);
  return new Date(d.getTime() + 5 * 60 * 60 * 1000);
}
function fmtDate(iso: string) {
  const d = toEKB(iso);
  return `${d.getUTCDate().toString().padStart(2, "0")}.${(d.getUTCMonth() + 1).toString().padStart(2, "0")}.${d.getUTCFullYear()}`;
}
function fmtTime(iso: string) {
  const d = toEKB(iso);
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
}
function truncate(s: string, n = 60) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function fmt(n: number, dec = 0) {
  return n == null ? "—" : Number(n).toLocaleString("ru-RU", { maximumFractionDigits: dec });
}

export default function StoriesTab({ businessId }: { businessId: string }) {
  const [stories, setStories] = useState<TGStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<TGStory | null>(null);
  const [sortCol, setSortCol] = useState<keyof TGStory>("published_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/analytics/${businessId}/tg/stories`);
      setStories(data);
    } catch {
      // empty
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const collect = async (deeper = false) => {
    setCollecting(true);
    setCollectMsg("");
    try {
      const { data } = await api.post(
        `/analytics/${businessId}/tg/stories/collect?deeper=${deeper}`
      );
      setCollectMsg(`✓ Собрано ${data.collected} историй`);
      await load();
    } catch (e: any) {
      setCollectMsg("⚠ " + (e?.response?.data?.detail || "Ошибка сбора"));
    } finally {
      setCollecting(false);
    }
  };

  const filtered = stories.filter(s => {
    const d = s.published_at.slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortCol] as any;
    let bv = b[sortCol] as any;
    if (typeof av === "string") av = av.toLowerCase();
    if (typeof bv === "string") bv = bv.toLowerCase();
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (col: keyof TGStory) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: keyof TGStory }) => {
    if (sortCol !== col) return <span style={{ color: "#ddd", fontSize: 9, marginLeft: 3 }}>↕</span>;
    return <span style={{ fontSize: 9, marginLeft: 3 }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const thStyle: React.CSSProperties = {
    padding: "10px 12px", textAlign: "left", fontWeight: 600,
    color: "#6B7280", fontSize: 11, letterSpacing: 0.4,
    borderBottom: "1px solid #F3F4F6", whiteSpace: "nowrap",
    cursor: "pointer", userSelect: "none", background: "#F9FAFB",
  };
  const tdStyle: React.CSSProperties = {
    padding: "9px 12px", fontSize: 13, color: "#374151",
    borderBottom: "1px solid #F9FAFB", whiteSpace: "nowrap",
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "3rem", color: "#888" }}>
        Загружаем истории...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Честный дисклеймер */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#FFFBEB",
        border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 16px" }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
        <p style={{ margin: 0, fontSize: 13, color: "#92400E", lineHeight: 1.6 }}>
          <strong>Telegram не хранит историю Сториз.</strong> В статистику попадут только истории,
          опубликованные после подключения к smmplatform. Истории, вышедшие раньше, восстановить невозможно.
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Date range */}
        <div style={{ display: "flex", alignItems: "center", gap: 8,
          background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: "6px 12px" }}>
          <span style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap" }}>с</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ border: "none", outline: "none", fontSize: 13, color: "#0D1B2A",
              background: "transparent", cursor: "pointer" }} />
          <span style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap" }}>по</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ border: "none", outline: "none", fontSize: 13, color: "#0D1B2A",
              background: "transparent", cursor: "pointer" }} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              style={{ background: "none", border: "none", cursor: "pointer",
                fontSize: 14, color: "#9CA3AF", lineHeight: 1, padding: 0 }}>✕</button>
          )}
        </div>

        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
          {sorted.length} историй из {stories.length} сохранённых
        </span>

        <div style={{ flex: 1 }} />

        <button onClick={() => collect(false)} disabled={collecting}
          style={{ padding: "7px 16px", background: collecting ? "#ccc" : "#3478F6",
            color: "#fff", border: "none", borderRadius: 9, fontSize: 13,
            fontWeight: 600, cursor: collecting ? "not-allowed" : "pointer" }}>
          {collecting ? "Собираю..." : "⟳ Обновить"}
        </button>
      </div>

      {collectMsg && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13,
          background: collectMsg.startsWith("✓") ? "#ECFDF5" : "#FEF2F2",
          color: collectMsg.startsWith("✓") ? "#059669" : "#DC2626" }}>
          {collectMsg}
        </div>
      )}

      {/* Empty state */}
      {stories.length === 0 && !collecting && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16,
          padding: "48px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📖</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#0D1B2A", margin: "0 0 8px" }}>
            Нет данных по историям
          </p>
          <p style={{ color: "#6B7280", fontSize: 14, margin: "0 0 20px" }}>
            Нажмите «Обновить» чтобы собрать истории из Telegram-канала.<br />
            Автосбор работает ежедневно в 10:00 по ЕКБ.
          </p>
          <button onClick={() => collect(false)} disabled={collecting}
            style={{ padding: "10px 24px", background: "#3478F6", color: "#fff",
              border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Собрать истории
          </button>
        </div>
      )}

      {/* Table + side panel */}
      {sorted.length > 0 && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0, background: "#fff",
            border: "1px solid #E5E7EB", borderRadius: 16, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {[
                    { col: "published_at" as keyof TGStory, label: "Дата (ЕКБ)",   minWidth: 110 },
                    { col: "published_at" as keyof TGStory, label: "Время (ЕКБ)",  minWidth: 90, noSort: true },
                    { col: "story_id"    as keyof TGStory, label: "ID",             minWidth: 72 },
                    { col: "caption"     as keyof TGStory, label: "Подпись",        minWidth: 220 },
                    { col: "views"       as keyof TGStory, label: "Просмотры",      minWidth: 110 },
                    { col: "reactions"   as keyof TGStory, label: "Реакции",        minWidth: 100 },
                    { col: "forwards"    as keyof TGStory, label: "Пересылки",      minWidth: 110 },
                    { col: "er_pct"      as keyof TGStory, label: "ER %",           minWidth: 80 },
                  ].map(({ col, label, minWidth, noSort }) => (
                    <th key={label} style={{ ...thStyle, minWidth }}
                      onClick={() => !noSort && toggleSort(col)}>
                      {label}{!noSort && <SortIcon col={col} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(s => {
                  const isActive = selected?.story_id === s.story_id;
                  return (
                    <tr key={s.story_id}
                      onClick={() => setSelected(isActive ? null : s)}
                      style={{
                        background: isActive ? "#EEF4FF" : "transparent",
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = "#F9FAFB";
                      }}
                      onMouseLeave={e => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}>
                      <td style={tdStyle}>{fmtDate(s.published_at)}</td>
                      <td style={tdStyle}>{fmtTime(s.published_at)}</td>
                      <td style={{ ...tdStyle, color: "#9CA3AF", fontFamily: "monospace" }}>{s.story_id}</td>
                      <td style={{ ...tdStyle, maxWidth: 240 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          {s.has_media && (
                            <span style={{ fontSize: 14, flexShrink: 0 }}>{MEDIA_ICON[s.media_type] || "📎"}</span>
                          )}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            color: s.caption ? "#374151" : "#9CA3AF",
                            fontStyle: s.caption ? "normal" : "italic" }}>
                            {s.caption ? truncate(s.caption, 55) : "[без подписи]"}
                          </span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{fmt(s.views)}</td>
                      <td style={tdStyle}>{fmt(s.reactions)}</td>
                      <td style={tdStyle}>{fmt(s.forwards)}</td>
                      <td style={{ ...tdStyle, color: s.er_pct > 5 ? "#059669" : s.er_pct > 2 ? "#D97706" : "#374151" }}>
                        {fmt(s.er_pct, 2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <StoryDetail story={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function StoryDetail({ story, onClose }: { story: TGStory; onClose: () => void }) {
  const isValidUsername = (s: string) => /^[a-zA-Z0-9_]{3,}$/.test(s);
  const storyUrl = isValidUsername(story.channel_name)
    ? `https://t.me/${story.channel_name}/s/${story.story_id}`
    : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Backdrop */}
      <div onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />

      {/* Modal */}
      <div style={{ position: "relative", width: "min(720px, 95vw)", maxHeight: "90vh",
        background: "#fff", borderRadius: 20, overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
        display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0D1B2A" }}>
              История #{story.story_id}
            </div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
              {fmtDate(story.published_at)} · {fmtTime(story.published_at)} ЕКБ
              {story.channel_name && ` · @${story.channel_name}`}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "#F3F4F6", border: "none", borderRadius: 8,
              width: 32, height: 32, cursor: "pointer", fontSize: 16, color: "#6B7280",
              display: "flex", alignItems: "center", justifyContent: "center" }}>
            ✕
          </button>
        </div>

        {/* Body — две колонки */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

          {/* Левая: медиа-плейсхолдер в стиле истории */}
          <div style={{
            flex: "0 0 50%", borderRight: "1px solid #F3F4F6",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", position: "relative", overflow: "hidden",
            minHeight: 280,
            background: story.media_type === "video"
              ? "linear-gradient(160deg, #1a0a2e 0%, #2d1b4e 50%, #4a2080 100%)"
              : story.media_type === "photo"
              ? "linear-gradient(160deg, #0a1628 0%, #0f2d4e 50%, #0f4060 100%)"
              : "linear-gradient(160deg, #1a1a1a 0%, #2d2d2d 100%)",
          }}>
            {/* Фоновые круги — имитация глубины */}
            <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%",
              background: "rgba(255,255,255,0.04)", top: -40, right: -40, pointerEvents: "none" }} />
            <div style={{ position: "absolute", width: 140, height: 140, borderRadius: "50%",
              background: "rgba(255,255,255,0.03)", bottom: 20, left: -30, pointerEvents: "none" }} />

            {/* Иконка */}
            <div style={{ fontSize: 72, lineHeight: 1, marginBottom: 12,
              filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.4))" }}>
              {story.has_media ? (story.media_type === "video" ? "🎬" : "🖼") : "📖"}
            </div>

            {/* Бейдж типа */}
            <div style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)",
              borderRadius: 20, padding: "4px 16px", fontSize: 12, fontWeight: 600,
              color: "#fff", marginBottom: story.caption ? 16 : 0 }}>
              {story.has_media ? (story.media_type === "photo" ? "Фото" : "Видео") : "Без медиа"}
            </div>

            {/* Подпись истории */}
            {story.caption && (
              <div style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)",
                borderRadius: 12, padding: "10px 16px", maxWidth: "calc(100% - 48px)",
                fontSize: 13, color: "rgba(255,255,255,0.9)", lineHeight: 1.6,
                textAlign: "center", marginTop: 4 }}>
                {story.caption.length > 140 ? story.caption.slice(0, 140) + "…" : story.caption}
              </div>
            )}

            {/* Нижняя строка */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "12px 16px", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 8,
              background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                Медиа недоступно — история истекла
              </span>
              {storyUrl && (
                <a href={storyUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 18px", background: "#3478F6", color: "#fff",
                    borderRadius: 10, fontSize: 12, fontWeight: 600,
                    textDecoration: "none" }}>
                  ↗ Открыть в Telegram
                </a>
              )}
            </div>
          </div>

          {/* Правая: метрики */}
          <div style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF",
              letterSpacing: 0.6, marginBottom: 14 }}>ПОКАЗАТЕЛИ</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { emoji: "👁", label: "Просмотры", value: story.views.toLocaleString("ru-RU") },
                { emoji: "❤️", label: "Реакции",   value: String(story.reactions) },
                { emoji: "🔁", label: "Пересылки", value: String(story.forwards) },
              ].map(m => (
                <div key={m.label} style={{ background: "#F9FAFB", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{m.emoji}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#0D1B2A" }}>{m.value}</div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{m.label}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10, background: story.er_pct > 5 ? "#ECFDF5" : "#F9FAFB",
              borderRadius: 12, padding: "14px 18px",
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, color: "#6B7280" }}>ER истории</div>
              <div style={{ fontSize: 24, fontWeight: 700,
                color: story.er_pct > 5 ? "#059669" : story.er_pct > 2 ? "#D97706" : "#0D1B2A" }}>
                {story.er_pct.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

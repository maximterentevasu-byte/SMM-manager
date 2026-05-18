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

type Period = "week" | "month" | "3months" | "year" | "all";

const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: "week",    label: "Неделя",    days: 7 },
  { key: "month",   label: "Месяц",     days: 30 },
  { key: "3months", label: "3 месяца",  days: 90 },
  { key: "year",    label: "Год",       days: 365 },
  { key: "all",     label: "Всё время", days: 0 },
];

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
  const [period, setPeriod] = useState<Period>("all");
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

  const now = Date.now();
  const filtered = stories.filter(s => {
    if (period === "all") return true;
    const days = PERIODS.find(x => x.key === period)!.days;
    return new Date(s.published_at).getTime() > now - days * 86400_000;
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
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 3, background: "#F0EEE8", padding: 4, borderRadius: 10 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: period === p.key ? 600 : 400,
                background: period === p.key ? "#fff" : "transparent",
                color: period === p.key ? "#0D1B2A" : "#999",
                boxShadow: period === p.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
          {sorted.length} историй из {stories.length} сохранённых
        </span>

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

          {/* Левая: медиа-плейсхолдер */}
          <div style={{ flex: "0 0 50%", borderRight: "1px solid #F3F4F6",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 12, background: "#F9FAFB",
            padding: 24, color: "#6B7280" }}>
            <span style={{ fontSize: 64 }}>
              {story.has_media ? (MEDIA_ICON[story.media_type] || "📎") : "📖"}
            </span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>
              {story.has_media
                ? (story.media_type === "photo" ? "Фото" : "Видео")
                : "Без медиа"}
            </span>
            <span style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center",
              maxWidth: 260, lineHeight: 1.6 }}>
              Предпросмотр историй Telegram недоступен — откройте канал напрямую
            </span>
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

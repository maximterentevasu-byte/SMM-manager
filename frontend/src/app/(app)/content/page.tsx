"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  content_ready: { label: "Готов",       color: "#0F6E56", bg: "#E1F5EE" },
  published:     { label: "Опубликован", color: "#185FA5", bg: "#E6F1FB" },
  planned:       { label: "Идея",        color: "#5F5E5A", bg: "#F1EFE8" },
  idea_ready:    { label: "Идея готова", color: "#854F0B", bg: "#FAEEDA" },
  failed:        { label: "Ошибка",      color: "#A32D2D", bg: "#FCEBEB" },
};

const PLATFORM_ICON: Record<string, string> = { telegram: "✈", vk: "ВК", ok: "ОК" };
const PLATFORM_COLORS: Record<string, { bg: string; border: string }> = {
  telegram: { bg: "#E3F4FF", border: "#2AABEE" },
  vk:       { bg: "#EBF2FB", border: "#4680C2" },
  ok:       { bg: "#FFF3E0", border: "#FF8C00" },
};

const MONTHS     = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
const MONTHS_RU  = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const DAYS_SHORT = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

type Slot = {
  id: string; platform: string; scheduled_at: string; rubric_name: string;
  idea: { idea: string; hook: string; visual_concept: string } | null;
  post_text: string | null; image_url: string | null; image_base64: string | null;
  image_prompt: string | null; status: string;
};

// ── Calendar utils ────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function getMonthWeeks(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const start    = getMondayOf(firstDay);
  const end      = new Date(lastDay);
  const endDow   = end.getDay();
  if (endDow !== 0) end.setDate(end.getDate() + (7 - endDow));

  const weeks: Date[][] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    weeks.push(week);
  }
  return weeks;
}

function getWeekDays(date: Date): Date[] {
  const monday = getMondayOf(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

// ── Main component ────────────────────────────────────────────────────────────

export default function ContentPage() {
  const router = useRouter();
  const [slots, setSlots]               = useState<Slot[]>([]);
  const [loading, setLoading]           = useState(true);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editText, setEditText]         = useState("");
  const [saving, setSaving]             = useState(false);
  const [generatingImg, setGeneratingImg] = useState<string | null>(null);
  const [reloading, setReloading]       = useState(false);
  const [filter, setFilter]             = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [strategyUpdated, setStrategyUpdated] = useState(false);

  // View state
  const [viewMode, setViewMode]         = useState<"list" | "calendar">("list");
  const [calMode, setCalMode]           = useState<"month" | "week">("month");
  const [calDate, setCalDate]           = useState(new Date());
  const [expanded, setExpanded]         = useState<Slot | null>(null);
  const [modalText, setModalText]       = useState("");
  const [modalSaving, setModalSaving]   = useState(false);
  const [draggingId, setDraggingId]     = useState<string | null>(null);
  const [dragOverKey, setDragOverKey]   = useState<string | null>(null);

  const [businessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const { data } = await api.get(`/content/${businessId}/plan`, {
        params: { year: now.getFullYear(), month: now.getMonth() + 1 },
      });
      setSlots(data);
    } catch (e: any) {
      if (e?.response?.status === 401) router.push("/login");
    } finally { setLoading(false); }
  }, [businessId, router]);

  useEffect(() => {
    load();
    setStrategyUpdated(!!localStorage.getItem("strategyUpdatedAt"));
  }, [load]);

  const reloadPlan = async () => {
    setReloading(true);
    try {
      const now = new Date();
      await api.post(`/content/${businessId}/generate-plan`, { year: now.getFullYear(), month: now.getMonth() + 1 });
      localStorage.removeItem("strategyUpdatedAt");
      setStrategyUpdated(false);
      setTimeout(() => load(), 3000);
    } catch { alert("Ошибка перезагрузки плана"); }
    finally { setReloading(false); }
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      await api.patch(`/content/slot/${id}`, { post_text: editText });
      setSlots(prev => prev.map(s => s.id === id ? { ...s, post_text: editText } : s));
      setEditingId(null);
    } catch { alert("Ошибка сохранения"); }
    finally { setSaving(false); }
  };

  const generateImage = async (slot: Slot) => {
    setGeneratingImg(slot.id);
    try {
      const { data } = await api.post(`/content/slot/${slot.id}/generate-image`);
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, image_url: data.image_url } : s));
      setExpanded(prev => prev?.id === slot.id ? { ...prev, image_url: data.image_url } : prev);
    } catch { alert("Ошибка генерации картинки"); }
    finally { setGeneratingImg(null); }
  };

  const publishNow = async (slot: Slot) => {
    try {
      await api.post(`/content/slot/${slot.id}/publish`);
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, status: "published" } : s));
    } catch { alert("Ошибка публикации"); }
  };

  // Calendar helpers
  const openSlot = (slot: Slot) => { setExpanded(slot); setModalText(slot.post_text || ""); };
  const closeModal = () => setExpanded(null);

  const saveModal = async () => {
    if (!expanded) return;
    setModalSaving(true);
    try {
      await api.patch(`/content/slot/${expanded.id}`, { post_text: modalText });
      setSlots(prev => prev.map(s => s.id === expanded.id ? { ...s, post_text: modalText } : s));
      setExpanded(prev => prev ? { ...prev, post_text: modalText } : null);
    } catch { alert("Ошибка сохранения"); }
    finally { setModalSaving(false); }
  };

  const publishModal = async () => {
    if (!expanded) return;
    try {
      await api.post(`/content/slot/${expanded.id}/publish`);
      setSlots(prev => prev.map(s => s.id === expanded.id ? { ...s, status: "published" } : s));
      setExpanded(prev => prev ? { ...prev, status: "published" } : null);
    } catch { alert("Ошибка публикации"); }
  };

  const moveSlot = async (slotId: string, targetDay: Date) => {
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return;
    const old = new Date(slot.scheduled_at);
    const newDate = new Date(targetDay);
    newDate.setHours(old.getHours(), old.getMinutes(), 0, 0);
    try {
      await api.patch(`/content/slot/${slotId}`, { scheduled_at: newDate.toISOString() });
      setSlots(prev => prev.map(s => s.id === slotId ? { ...s, scheduled_at: newDate.toISOString() } : s));
    } catch { alert("Ошибка перемещения поста"); }
  };

  const navCal = (dir: -1 | 1) => {
    setCalDate(prev => {
      const d = new Date(prev);
      if (calMode === "month") d.setMonth(d.getMonth() + dir);
      else d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  const calTitle = calMode === "month"
    ? `${MONTHS_RU[calDate.getMonth()]} ${calDate.getFullYear()}`
    : (() => {
        const days = getWeekDays(calDate);
        const s = days[0], e = days[6];
        return s.getMonth() === e.getMonth()
          ? `${s.getDate()}–${e.getDate()} ${MONTHS_RU[s.getMonth()]} ${s.getFullYear()}`
          : `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
      })();

  const calWeeks = calMode === "month"
    ? getMonthWeeks(calDate.getFullYear(), calDate.getMonth())
    : [getWeekDays(calDate)];

  const applyFilters = (list: Slot[]) =>
    list.filter(s => {
      const statusOk = filter === "all" || s.status === filter;
      const platOk   = platformFilter === "all" || s.platform === platformFilter;
      return statusOk && platOk;
    });

  const filtered = applyFilters(slots).filter(s => s.post_text);

  const stats = {
    total:     slots.filter(s => s.post_text).length,
    ready:     slots.filter(s => s.status === "content_ready").length,
    published: slots.filter(s => s.status === "published").length,
  };

  const today = new Date();

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#888" }}>
      Загружаем контент-план...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E8E6E0", padding: "0 2rem" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center",
          justifyContent: "space-between", height: 64 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Контент-план</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {strategyUpdated && (
              <button onClick={reloadPlan} disabled={reloading}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px",
                  background: "#533AB7", color: "#fff", border: "none", borderRadius: 20,
                  cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                <span style={{ fontSize: 16 }}>🔄</span>
                {reloading ? "Обновляю..." : "Обновить план под новую стратегию"}
              </button>
            )}
            <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#666" }}>
              <span>Готово: <strong style={{ color: "#0F6E56" }}>{stats.ready}</strong></span>
              <span>Опубликовано: <strong style={{ color: "#185FA5" }}>{stats.published}</strong></span>
              <span>Всего: <strong>{stats.total}</strong></span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem" }}>

        {/* ── Filters + view toggle ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
          {["all", "content_ready", "published", "idea_ready", "failed"].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid",
                cursor: "pointer", fontSize: 13, fontWeight: 500,
                borderColor: filter === s ? "#1a1a1a" : "#E0DED8",
                background:  filter === s ? "#1a1a1a" : "#fff",
                color:       filter === s ? "#fff"    : "#555" }}>
              {s === "all" ? "Все" : STATUS_CONFIG[s]?.label}
            </button>
          ))}
          <div style={{ width: 1, background: "#E0DED8", margin: "0 4px" }} />
          {["all", "telegram", "vk"].map(p => (
            <button key={p} onClick={() => setPlatformFilter(p)}
              style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid",
                cursor: "pointer", fontSize: 13, fontWeight: 500,
                borderColor: platformFilter === p ? "#533AB7" : "#E0DED8",
                background:  platformFilter === p ? "#EEEDFE" : "#fff",
                color:       platformFilter === p ? "#533AB7" : "#555" }}>
              {p === "all" ? "Все площадки" : p === "telegram" ? "✈ Telegram" : "ВК"}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {/* View toggle */}
          <div style={{ display: "flex", background: "#F1EFE8", borderRadius: 10, padding: 3, gap: 2 }}>
            {(["list", "calendar"] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 500,
                  background: viewMode === mode ? "#fff" : "transparent",
                  color:      viewMode === mode ? "#1a1a1a" : "#777",
                  boxShadow:  viewMode === mode ? "0 1px 3px rgba(0,0,0,.12)" : "none",
                  transition: "all .15s" }}>
                {mode === "list" ? "≡ Список" : "⊞ Календарь"}
              </button>
            ))}
          </div>
        </div>

        {/* ── List view ── */}
        {viewMode === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {filtered.map(slot => {
              const st = STATUS_CONFIG[slot.status] || STATUS_CONFIG.planned;
              const date = new Date(slot.scheduled_at);
              const isEditing = editingId === slot.id;
              return (
                <div key={slot.id} style={{ background: "#fff", borderRadius: 16,
                  border: "1px solid #EAE8E2", overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", display: "flex", alignItems: "center",
                    gap: 12, borderBottom: "1px solid #F2F0EC" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#888",
                      background: "#F1EFE8", padding: "3px 8px", borderRadius: 6 }}>
                      {PLATFORM_ICON[slot.platform] || slot.platform.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13, color: "#555", fontWeight: 500 }}>{slot.rubric_name}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, color: "#999" }}>
                      {date.getDate()} {MONTHS[date.getMonth()]} · {String(date.getHours()).padStart(2,"0")}:{String(date.getMinutes()).padStart(2,"0")}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px",
                      borderRadius: 20, color: st.color, background: st.bg }}>{st.label}</span>
                  </div>
                  <div style={{ display: "flex" }}>
                    <div style={{ flex: 1, padding: "16px 20px" }}>
                      {isEditing ? (
                        <div>
                          <textarea value={editText} onChange={e => setEditText(e.target.value)}
                            style={{ width: "100%", minHeight: 200, padding: 12, fontSize: 14,
                              lineHeight: 1.6, border: "1.5px solid #533AB7", borderRadius: 10,
                              resize: "vertical", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <button onClick={() => saveEdit(slot.id)} disabled={saving}
                              style={{ padding: "8px 18px", background: "#1a1a1a", color: "#fff",
                                border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                              {saving ? "Сохраняю..." : "Сохранить"}
                            </button>
                            <button onClick={() => setEditingId(null)}
                              style={{ padding: "8px 18px", background: "#F1EFE8", color: "#555",
                                border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#2a2a2a",
                            margin: 0, whiteSpace: "pre-wrap" }}>{slot.post_text}</p>
                          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                            <button onClick={() => { setEditingId(slot.id); setEditText(slot.post_text || ""); }}
                              style={{ padding: "7px 14px", background: "#F1EFE8", color: "#444",
                                border: "1px solid #E0DED8", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                              ✏️ Редактировать
                            </button>
                            {slot.status === "content_ready" && (
                              <button onClick={() => publishNow(slot)}
                                style={{ padding: "7px 14px", background: "#0F6E56", color: "#fff",
                                  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                ✈ Опубликовать
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ width: 180, borderLeft: "1px solid #F2F0EC", padding: 14,
                      display: "flex", flexDirection: "column", gap: 10, alignItems: "center",
                      justifyContent: "center", background: "#FAFAF8" }}>
                      {slot.image_url || slot.image_base64 ? (
                        <img src={slot.image_url || `data:image/png;base64,${slot.image_base64}`}
                          alt="post" style={{ width: "100%", borderRadius: 10, objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", aspectRatio: "1", background: "#F1EFE8",
                          borderRadius: 10, display: "flex", flexDirection: "column",
                          alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <span style={{ fontSize: 24 }}>🖼</span>
                          <span style={{ fontSize: 10, color: "#999", textAlign: "center" }}>Нет картинки</span>
                        </div>
                      )}
                      {!slot.image_url && !slot.image_base64 && (
                        <button onClick={() => generateImage(slot)} disabled={generatingImg === slot.id}
                          style={{ width: "100%", padding: "7px", background: "#533AB7", color: "#fff",
                            border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          {generatingImg === slot.id ? "Генерирую..." : "✨ Создать"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "4rem 0", color: "#999" }}>
                <div style={{ fontSize: 48 }}>📭</div>
                <p style={{ marginTop: 12 }}>Нет постов с таким фильтром</p>
              </div>
            )}
          </div>
        )}

        {/* ── Calendar view ── */}
        {viewMode === "calendar" && (
          <div>
            {/* Calendar toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <button onClick={() => navCal(-1)}
                style={{ padding: "7px 14px", background: "#fff", border: "1px solid #E0DED8",
                  borderRadius: 8, cursor: "pointer", fontSize: 16, color: "#444" }}>←</button>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", minWidth: 220, textAlign: "center" }}>
                {calTitle}
              </span>
              <button onClick={() => navCal(1)}
                style={{ padding: "7px 14px", background: "#fff", border: "1px solid #E0DED8",
                  borderRadius: 8, cursor: "pointer", fontSize: 16, color: "#444" }}>→</button>
              <button onClick={() => setCalDate(new Date())}
                style={{ padding: "7px 14px", background: "#F1EFE8", border: "1px solid #E0DED8",
                  borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#555" }}>Сегодня</button>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", background: "#F1EFE8", borderRadius: 10, padding: 3, gap: 2 }}>
                {(["month", "week"] as const).map(m => (
                  <button key={m} onClick={() => setCalMode(m)}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                      fontSize: 13, fontWeight: 500,
                      background: calMode === m ? "#fff" : "transparent",
                      color:      calMode === m ? "#1a1a1a" : "#777",
                      boxShadow:  calMode === m ? "0 1px 3px rgba(0,0,0,.12)" : "none" }}>
                    {m === "month" ? "Месяц" : "Неделя"}
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar grid */}
            <div style={{ background: "#fff", border: "1px solid #E0DED8", borderRadius: 14, overflow: "hidden" }}>
              {/* Day headers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
                borderBottom: "1px solid #E0DED8" }}>
                {DAYS_SHORT.map((d, i) => (
                  <div key={d} style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600,
                    color: i >= 5 ? "#888" : "#555", textAlign: "center",
                    borderRight: i < 6 ? "1px solid #E0DED8" : "none" }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Week rows */}
              {calWeeks.map((week, wi) => (
                <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
                  borderBottom: wi < calWeeks.length - 1 ? "1px solid #E0DED8" : "none" }}>
                  {week.map((day, di) => {
                    const key = dayKey(day);
                    const inCurrentMonth = calMode === "week" || day.getMonth() === calDate.getMonth();
                    const isToday = isSameDay(day, today);
                    const isDragTarget = dragOverKey === key;
                    const daySlots = applyFilters(
                      slots.filter(s => isSameDay(new Date(s.scheduled_at), day))
                    );

                    return (
                      <div key={key}
                        style={{
                          minHeight: calMode === "month" ? 110 : 180,
                          padding: "8px 8px 6px",
                          borderRight: di < 6 ? "1px solid #E0DED8" : "none",
                          background: isDragTarget ? "#F0EDFE" : inCurrentMonth ? "#fff" : "#F9F8F6",
                          transition: "background .1s",
                          position: "relative",
                          minWidth: 0,
                          overflow: "hidden",
                        }}
                        onDragOver={e => { e.preventDefault(); setDragOverKey(key); }}
                        onDragLeave={() => setDragOverKey(null)}
                        onDrop={e => {
                          e.preventDefault();
                          setDragOverKey(null);
                          if (draggingId) moveSlot(draggingId, day);
                          setDraggingId(null);
                        }}
                      >
                        {/* Day number */}
                        <div style={{ marginBottom: 6, display: "flex", justifyContent: "center" }}>
                          <span style={{
                            width: 26, height: 26, borderRadius: "50%", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: isToday ? 700 : 400,
                            background: isToday ? "#533AB7" : "transparent",
                            color: isToday ? "#fff" : inCurrentMonth ? (di >= 5 ? "#aaa" : "#444") : "#ccc",
                          }}>{day.getDate()}</span>
                        </div>

                        {/* Slot chips */}
                        {daySlots.map(slot => {
                          const pc  = PLATFORM_COLORS[slot.platform] || { bg: "#F1EFE8", border: "#bbb" };
                          const st  = STATUS_CONFIG[slot.status] || STATUS_CONFIG.planned;
                          const topic = slot.idea?.idea || slot.post_text?.substring(0, 60) || slot.rubric_name;

                          return (
                            <div key={slot.id}
                              draggable
                              onDragStart={e => { e.stopPropagation(); setDraggingId(slot.id); }}
                              onDragEnd={() => { setDraggingId(null); setDragOverKey(null); }}
                              onClick={() => openSlot(slot)}
                              title={topic}
                              style={{
                                background: pc.bg,
                                borderLeft: `3px solid ${pc.border}`,
                                borderRadius: 5,
                                padding: "4px 7px",
                                marginBottom: 3,
                                cursor: "grab",
                                userSelect: "none",
                                opacity: draggingId === slot.id ? 0.4 : 1,
                                overflow: "hidden",
                                minWidth: 0,
                                wordBreak: "break-word",
                              }}
                            >
                              {/* Строка 1: иконка + рубрика (переносится) */}
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 2 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#666", flexShrink: 0, lineHeight: "14px" }}>
                                  {PLATFORM_ICON[slot.platform]}
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: "#333", lineHeight: 1.3 }}>
                                  {slot.rubric_name}
                                </span>
                              </div>
                              {/* Строка 2: статус */}
                              <span style={{ fontSize: 9, fontWeight: 600, color: st.color,
                                background: st.bg, padding: "1px 5px", borderRadius: 4,
                                display: "inline-block" }}>
                                {st.label}
                              </span>
                              {/* Тема поста в режиме недели */}
                              {calMode === "week" && topic && (
                                <div style={{ fontSize: 10, color: "#666", marginTop: 3, lineHeight: 1.3 }}>
                                  {topic.substring(0, 80)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Slot modal ── */}
      {expanded && (
        <div onClick={closeModal}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 20, width: "min(720px, 95vw)",
              maxHeight: "88vh", overflow: "auto", padding: "28px 32px", boxSizing: "border-box" }}>

            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700,
                background: PLATFORM_COLORS[expanded.platform]?.bg || "#F1EFE8",
                border: `2px solid ${PLATFORM_COLORS[expanded.platform]?.border || "#bbb"}`,
                flexShrink: 0 }}>
                {PLATFORM_ICON[expanded.platform]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>{expanded.rubric_name}</div>
                <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
                  {new Date(expanded.scheduled_at).toLocaleDateString("ru-RU", {
                    weekday: "long", year: "numeric", month: "long", day: "numeric",
                  })} · {String(new Date(expanded.scheduled_at).getHours()).padStart(2,"0")}:{String(new Date(expanded.scheduled_at).getMinutes()).padStart(2,"0")}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20,
                  color: (STATUS_CONFIG[expanded.status] || STATUS_CONFIG.planned).color,
                  background: (STATUS_CONFIG[expanded.status] || STATUS_CONFIG.planned).bg }}>
                  {(STATUS_CONFIG[expanded.status] || STATUS_CONFIG.planned).label}
                </span>
                <button onClick={closeModal}
                  style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #E0DED8",
                    background: "#fff", cursor: "pointer", fontSize: 16, color: "#888",
                    display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
            </div>

            {/* Idea block */}
            {expanded.idea && (
              <div style={{ background: "#F8F7F4", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#999", marginBottom: 6, textTransform: "uppercase", letterSpacing: .5 }}>Идея</div>
                <div style={{ fontSize: 14, color: "#333", lineHeight: 1.6 }}>{expanded.idea.idea}</div>
                {expanded.idea.hook && (
                  <div style={{ fontSize: 13, color: "#666", marginTop: 6, fontStyle: "italic" }}>
                    Хук: {expanded.idea.hook}
                  </div>
                )}
              </div>
            )}

            {/* Post text */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#999", marginBottom: 8,
                textTransform: "uppercase", letterSpacing: .5 }}>Текст поста</div>
              <textarea value={modalText} onChange={e => setModalText(e.target.value)}
                style={{ width: "100%", minHeight: 180, padding: "12px 14px", fontSize: 14,
                  lineHeight: 1.7, border: "1.5px solid #E0DED8", borderRadius: 10,
                  resize: "vertical", fontFamily: "inherit", outline: "none",
                  boxSizing: "border-box", color: "#2a2a2a", background: "#FAFAF8" }}
                onFocus={e => (e.target.style.borderColor = "#533AB7")}
                onBlur={e => (e.target.style.borderColor = "#E0DED8")} />
            </div>

            {/* Image */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#999", marginBottom: 8,
                textTransform: "uppercase", letterSpacing: .5 }}>Изображение</div>
              {expanded.image_url || expanded.image_base64 ? (
                <img
                  src={expanded.image_url || `data:image/png;base64,${expanded.image_base64}`}
                  alt="post"
                  style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 12 }} />
              ) : (
                <div style={{ background: "#F8F7F4", borderRadius: 12, padding: "28px 16px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 36 }}>🖼</span>
                  <span style={{ fontSize: 13, color: "#999" }}>Картинка не сгенерирована</span>
                  <button
                    onClick={() => generateImage(expanded)}
                    disabled={generatingImg === expanded.id}
                    style={{ padding: "9px 20px", background: "#533AB7", color: "#fff",
                      border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    {generatingImg === expanded.id ? "Генерирую..." : "✨ Сгенерировать картинку"}
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
              <button onClick={saveModal} disabled={modalSaving}
                style={{ padding: "10px 20px", background: "#1a1a1a", color: "#fff",
                  border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                {modalSaving ? "Сохраняю..." : "💾 Сохранить"}
              </button>
              {expanded.status === "content_ready" && (
                <button onClick={publishModal}
                  style={{ padding: "10px 20px", background: "#0F6E56", color: "#fff",
                    border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  ✈ Опубликовать
                </button>
              )}
              <button onClick={closeModal}
                style={{ padding: "10px 20px", background: "#F1EFE8", color: "#555",
                  border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

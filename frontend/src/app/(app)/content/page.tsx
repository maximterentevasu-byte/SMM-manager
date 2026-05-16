"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  content_ready:     { label: "Готов",              color: "#0F6E56", bg: "#E1F5EE" },
  published:         { label: "Опубликован",        color: "#185FA5", bg: "#E6F1FB" },
  planned:           { label: "Идея",               color: "#5F5E5A", bg: "#F1EFE8" },
  idea_ready:        { label: "Идея готова",        color: "#854F0B", bg: "#FAEEDA" },
  pending_approval:  { label: "Ждёт согласования",  color: "#7C4400", bg: "#FFF3CD" },
  needs_info:        { label: "Нужна информация",   color: "#8B3200", bg: "#FFE5CC" },
  failed:            { label: "Ошибка",             color: "#A32D2D", bg: "#FCEBEB" },
};

const PLATFORM_ICON: Record<string, string> = { telegram: "✈", vk: "ВК", ok: "ОК" };
const PLATFORM_COLORS: Record<string, { bg: string; border: string }> = {
  telegram: { bg: "#E3F4FF", border: "#2AABEE" },
  vk:       { bg: "#EBF2FB", border: "#4680C2" },
  ok:       { bg: "#FFF3E0", border: "#FF8C00" },
};

const NEEDS_INFO_OPTIONS = [
  "Фото товара",
  "Фото точки / заведения",
  "Фото сотрудника",
  "Условия акции",
  "Название новинки",
  "Цена продукта",
  "Дата события",
  "Ссылка на продукт",
  "Другая информация",
];

const MONTHS     = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
const MONTHS_RU  = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const DAYS_SHORT = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

type Slot = {
  id: string; platform: string; scheduled_at: string; rubric_name: string;
  idea: { idea: string; hook: string; visual_concept: string } | null;
  post_text: string | null; image_url: string | null; image_base64: string | null;
  image_prompt: string | null; status: string;
  images: string[] | null;
  needs_info_for: string[] | null;
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
  const [viewMode, setViewMode]         = useState<"list" | "calendar">("calendar");
  const [calMode, setCalMode]           = useState<"month" | "week">("month");
  const [calDate, setCalDate]           = useState(new Date());
  const [expanded, setExpanded]         = useState<Slot | null>(null);
  const [modalText, setModalText]       = useState("");
  const [modalSaving, setModalSaving]   = useState(false);
  const [draggingId, setDraggingId]     = useState<string | null>(null);
  const [dragOverKey, setDragOverKey]   = useState<string | null>(null);

  // Image editing state
  const [modalPrompt, setModalPrompt]   = useState("");
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [carouselIdx, setCarouselIdx]   = useState(0);
  const [generatingCarousel, setGeneratingCarousel] = useState(false);

  // Approval state
  const [showNeedsInfo, setShowNeedsInfo] = useState(false);
  const [selectedInfoItems, setSelectedInfoItems] = useState<string[]>([]);
  const [approvingId, setApprovingId]   = useState<string | null>(null);

  // Category-2 info provision state
  const [infoAnswers, setInfoAnswers]   = useState<string[]>([]);
  const [providingInfo, setProvidingInfo] = useState(false);

  // Modal image section state
  const [modalImageMode, setModalImageMode] = useState<"generate" | "upload" | "edit" | null>(null);
  const [modalGenPrompt, setModalGenPrompt] = useState("");
  const [modalEditInstruction, setModalEditInstruction] = useState("");
  const [modalUploadedImage, setModalUploadedImage] = useState<string | null>(null);
  const [editingModalImg, setEditingModalImg] = useState(false);

  // Date editing state
  const [editingDate, setEditingDate] = useState(false);
  const [modalDate, setModalDate]     = useState("");
  const [savingDate, setSavingDate]   = useState(false);

  const modalUploadRef = useRef<HTMLInputElement>(null);

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

  // Авто-поллинг пока есть слоты в процессе генерации
  useEffect(() => {
    const generating = slots.some(s =>
      s.status === "planned" || s.status === "idea_ready"
    );
    if (!generating) return;
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [slots, load]);

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

  const generateImage = async (slot: Slot, customPrompt?: string) => {
    setGeneratingImg(slot.id);
    try {
      const { data } = await api.post(`/content/slot/${slot.id}/generate-image`,
        customPrompt ? { prompt: customPrompt } : {}
      );
      const updates = {
        image_url: data.image_url ?? null,
        image_base64: data.image_base64 ?? null,
        image_prompt: customPrompt || slot.image_prompt,
      };
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, ...updates } : s));
      setExpanded(prev => prev?.id === slot.id ? { ...prev, ...updates } : prev);
      setEditingPrompt(false);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Ошибка генерации картинки";
      alert(msg);
    } finally { setGeneratingImg(null); }
  };

  const generateCarousel = async (slot: Slot) => {
    setGeneratingCarousel(true);
    try {
      const { data } = await api.post(`/content/slot/${slot.id}/generate-carousel`);
      const updates = { images: data.images, image_base64: data.images?.[0] ?? null };
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, ...updates } : s));
      setExpanded(prev => prev?.id === slot.id ? { ...prev, ...updates } : prev);
      setCarouselIdx(0);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Ошибка генерации карусели");
    } finally { setGeneratingCarousel(false); }
  };

  const publishNow = async (slot: Slot) => {
    try {
      await api.post(`/content/slot/${slot.id}/publish`);
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, status: "published" } : s));
    } catch { alert("Ошибка публикации"); }
  };

  const approveSlot = async (slot: Slot) => {
    setApprovingId(slot.id);
    try {
      await api.post(`/content/slot/${slot.id}/approve`);
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, status: "content_ready", needs_info_for: null } : s));
      setExpanded(prev => prev?.id === slot.id ? { ...prev, status: "content_ready", needs_info_for: null } : prev);
      setShowNeedsInfo(false);
    } catch { alert("Ошибка согласования"); }
    finally { setApprovingId(null); }
  };

  const requestInfo = async (slot: Slot) => {
    if (selectedInfoItems.length === 0) return;
    setApprovingId(slot.id);
    try {
      await api.post(`/content/slot/${slot.id}/request-info`, { items: selectedInfoItems });
      setSlots(prev => prev.map(s => s.id === slot.id
        ? { ...s, status: "needs_info", needs_info_for: selectedInfoItems }
        : s
      ));
      setExpanded(prev => prev?.id === slot.id
        ? { ...prev, status: "needs_info", needs_info_for: selectedInfoItems }
        : prev
      );
      setShowNeedsInfo(false);
      setSelectedInfoItems([]);
    } catch { alert("Ошибка"); }
    finally { setApprovingId(null); }
  };

  const provideInfo = async (slot: Slot) => {
    const questions = slot.needs_info_for || [];
    const answers = questions.map((q, i) => ({ question: q, answer: infoAnswers[i] || "" }));
    if (answers.every(a => !a.answer.trim())) return;
    setProvidingInfo(true);
    try {
      const { data } = await api.post(`/content/slot/${slot.id}/provide-info`, { answers });
      const updates = {
        post_text: data.post_text,
        image_prompt: data.image_prompt,
        status: "pending_approval",
        needs_info_for: null,
      };
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, ...updates } : s));
      setExpanded(prev => prev?.id === slot.id ? { ...prev, ...updates } : prev);
      setModalText(data.post_text || "");
      setInfoAnswers([]);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Ошибка генерации поста");
    } finally { setProvidingInfo(false); }
  };

  // Calendar helpers
  const openSlot = (slot: Slot) => {
    setExpanded(slot);
    setModalText(slot.post_text || "");
    setModalPrompt(slot.image_prompt || "");
    setModalGenPrompt(slot.image_prompt || "");
    setCarouselIdx(0);
    setShowNeedsInfo(false);
    setEditingPrompt(false);
    setSelectedInfoItems(slot.needs_info_for || []);
    setInfoAnswers((slot.needs_info_for || []).map(() => ""));
    setModalDate(new Date(slot.scheduled_at).toISOString().slice(0, 16));
    setModalImageMode(null);
    setModalUploadedImage(null);
    setEditingDate(false);
    setModalEditInstruction("");
  };
  const closeModal = () => {
    setExpanded(null); setShowNeedsInfo(false); setEditingPrompt(false);
    setEditingDate(false); setModalImageMode(null); setModalUploadedImage(null);
  };

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

  const saveModalDate = async () => {
    if (!expanded || !modalDate) return;
    setSavingDate(true);
    try {
      const iso = new Date(modalDate).toISOString();
      await api.patch(`/content/slot/${expanded.id}`, { scheduled_at: iso });
      setSlots(prev => prev.map(s => s.id === expanded.id ? { ...s, scheduled_at: iso } : s));
      setExpanded(prev => prev ? { ...prev, scheduled_at: iso } : null);
      setEditingDate(false);
    } catch { alert("Ошибка сохранения даты"); }
    finally { setSavingDate(false); }
  };

  const handleModalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !expanded) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setModalUploadedImage(dataUrl);
      try {
        await api.patch(`/content/slot/${expanded.id}`, { image_base64: base64 });
        setSlots(prev => prev.map(s => s.id === expanded.id ? { ...s, image_base64: base64 } : s));
        setExpanded(prev => prev ? { ...prev, image_base64: base64 } : null);
        setModalUploadedImage(null);
      } catch { alert("Ошибка загрузки изображения"); }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const editModalImage = async () => {
    if (!expanded || !modalEditInstruction.trim()) return;
    const currentBase64 = expanded.image_base64;
    if (!currentBase64) { alert("Сначала добавьте изображение для редактирования"); return; }
    setEditingModalImg(true);
    try {
      const { data } = await api.post(`/post-creator/${businessId}/edit-image`, {
        base_image: { data: currentBase64, mime: "image/jpeg" },
        reference_images: [],
        instruction_ru: modalEditInstruction,
      });
      const taskId = data.task_id;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const { data: res } = await api.get(`/post-creator/${businessId}/image-task/${taskId}`);
        if (res.status === "done") {
          const b64 = res.image_base64;
          await api.patch(`/content/slot/${expanded.id}`, { image_base64: b64 });
          setSlots(prev => prev.map(s => s.id === expanded.id ? { ...s, image_base64: b64 } : s));
          setExpanded(prev => prev ? { ...prev, image_base64: b64 } : null);
          setModalEditInstruction("");
          break;
        }
        if (res.status === "error") { alert("Ошибка редактирования: " + res.error); break; }
      }
    } catch (e: any) { alert(e?.response?.data?.detail || "Ошибка редактирования"); }
    finally { setEditingModalImg(false); }
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

  // Показываем все слоты, кроме голых "planned" без идеи
  const filtered = applyFilters(slots).filter(s =>
    s.post_text || s.status === "needs_info" || s.status === "pending_approval" ||
    s.status === "content_ready" || s.status === "published" || s.status === "failed" ||
    (s.status === "idea_ready" && s.idea)
  );

  const generatingCount = slots.filter(s => s.status === "planned" || s.status === "idea_ready").length;

  const stats = {
    total:      slots.length,
    ready:      slots.filter(s => s.status === "content_ready").length,
    pending:    slots.filter(s => s.status === "pending_approval").length,
    needsInfo:  slots.filter(s => s.status === "needs_info").length,
    published:  slots.filter(s => s.status === "published").length,
  };

  const today = new Date();

  // Current images for carousel
  const currentImages = expanded?.images && expanded.images.length > 0
    ? expanded.images
    : (expanded?.image_base64 ? [expanded.image_base64] : (expanded?.image_url ? [] : []));

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#888" }}>
      Загружаем контент-план...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

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
            <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#666", alignItems: "center" }}>
              {generatingCount > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 12, border: "2px solid #bbb",
                    borderTopColor: "#533AB7", borderRadius: "50%",
                    animation: "spin 1s linear infinite", display: "inline-block" }} />
                  Генерируется: <strong style={{ color: "#533AB7" }}>{generatingCount}</strong>
                </span>
              )}
              {stats.needsInfo > 0 && (
                <span>Нужна инфо: <strong style={{ color: "#8B3200" }}>{stats.needsInfo}</strong></span>
              )}
              {stats.pending > 0 && (
                <span>На согласовании: <strong style={{ color: "#7C4400" }}>{stats.pending}</strong></span>
              )}
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
          {["all", "pending_approval", "needs_info", "content_ready", "published", "idea_ready", "failed"].map(s => (
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

          <div style={{ display: "flex", background: "#F1EFE8", borderRadius: 10, padding: 3, gap: 2 }}>
            {(["calendar", "list"] as const).map(mode => (
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
              const needsApproval = slot.status === "pending_approval" || slot.status === "needs_info";
              return (
                <div key={slot.id} style={{ background: "#fff", borderRadius: 16,
                  border: `1px solid ${needsApproval ? st.bg : "#EAE8E2"}`,
                  outline: needsApproval ? `2px solid ${st.color}22` : "none",
                  overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", display: "flex", alignItems: "center",
                    gap: 12, borderBottom: "1px solid #F2F0EC",
                    background: needsApproval ? st.bg : "transparent" }}>
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
                      ) : !slot.post_text && slot.status !== "needs_info" ? (
                        /* Слот в процессе генерации текста */
                        <div style={{ display: "flex", alignItems: "center", gap: 12,
                          padding: "12px 0", color: "#888" }}>
                          <div style={{ width: 20, height: 20, border: "2px solid #bbb",
                            borderTopColor: "#533AB7", borderRadius: "50%",
                            animation: "spin 1s linear infinite", flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 13, color: "#555", fontWeight: 500 }}>
                              {slot.idea ? "Генерирую текст поста..." : "Ожидает генерации..."}
                            </div>
                            {slot.idea && (
                              <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>
                                {slot.idea.idea}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : slot.status === "needs_info" && !slot.post_text ? (
                        /* Category 2: нет текста — показываем вопросы */
                        <div>
                          <div style={{ marginBottom: 10, padding: "10px 14px", background: "#FFF8ED",
                            borderRadius: 8, border: "1px solid #FFD699" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#7C4400", marginBottom: 6 }}>
                              📋 Требуется информация для генерации поста
                            </div>
                            {(slot.needs_info_for || []).map((q, i) => (
                              <div key={i} style={{ fontSize: 12, color: "#555", marginBottom: 3 }}>
                                {i + 1}. {q}
                              </div>
                            ))}
                          </div>
                          {slot.idea && (
                            <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px", fontStyle: "italic" }}>
                              Тема: {slot.idea.idea}
                            </p>
                          )}
                          <button onClick={() => openSlot(slot)}
                            style={{ padding: "8px 18px", background: "#EA580C", color: "#fff",
                              border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                            ✏️ Ответить на вопросы
                          </button>
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
                            <button onClick={() => openSlot(slot)}
                              style={{ padding: "7px 14px", background: "#F1EFE8", color: "#444",
                                border: "1px solid #E0DED8", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                              🖼 Картинка
                            </button>
                            {needsApproval && slot.post_text && (
                              <button onClick={() => openSlot(slot)}
                                style={{ padding: "7px 14px", background: st.bg, color: st.color,
                                  border: `1px solid ${st.color}44`, borderRadius: 8, cursor: "pointer",
                                  fontSize: 12, fontWeight: 600 }}>
                                ✓ Согласовать
                              </button>
                            )}
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
                    <div style={{ width: 160, borderLeft: "1px solid #F2F0EC", padding: 12,
                      display: "flex", flexDirection: "column", gap: 8, alignItems: "center",
                      justifyContent: "center", background: "#FAFAF8" }}>
                      {slot.image_url || slot.image_base64 ? (
                        <img src={slot.image_url || `data:image/png;base64,${slot.image_base64}`}
                          alt="post" style={{ width: "100%", borderRadius: 8, objectFit: "cover", cursor: "pointer" }}
                          onClick={() => openSlot(slot)} />
                      ) : (
                        <div style={{ width: "100%", aspectRatio: "1", background: "#F1EFE8",
                          borderRadius: 8, display: "flex", flexDirection: "column",
                          alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" }}
                          onClick={() => openSlot(slot)}>
                          <span style={{ fontSize: 22 }}>🖼</span>
                          <span style={{ fontSize: 10, color: "#999", textAlign: "center" }}>Нет картинки</span>
                        </div>
                      )}
                      <button onClick={() => openSlot(slot)} disabled={generatingImg === slot.id}
                        style={{ width: "100%", padding: "6px", background: "#533AB7", color: "#fff",
                          border: "none", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                        {generatingImg === slot.id ? "..." : slot.image_base64 || slot.image_url ? "🔄 Перегенерировать" : "✨ Создать"}
                      </button>
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

            <div style={{ background: "#fff", border: "1px solid #E0DED8", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #E0DED8" }}>
                {DAYS_SHORT.map((d, i) => (
                  <div key={d} style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600,
                    color: i >= 5 ? "#888" : "#555", textAlign: "center",
                    borderRight: i < 6 ? "1px solid #E0DED8" : "none" }}>{d}</div>
                ))}
              </div>

              {calWeeks.map((week, wi) => (
                <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
                  borderBottom: wi < calWeeks.length - 1 ? "1px solid #E0DED8" : "none" }}>
                  {week.map((day, di) => {
                    const key = dayKey(day);
                    const inCurrentMonth = calMode === "week" || day.getMonth() === calDate.getMonth();
                    const isToday = isSameDay(day, today);
                    const isDragTarget = dragOverKey === key;
                    const daySlots = applyFilters(slots.filter(s => isSameDay(new Date(s.scheduled_at), day)));

                    return (
                      <div key={key} style={{
                        minHeight: calMode === "month" ? 110 : 180,
                        padding: "8px 8px 6px",
                        borderRight: di < 6 ? "1px solid #E0DED8" : "none",
                        background: isDragTarget ? "#F0EDFE" : inCurrentMonth ? "#fff" : "#F9F8F6",
                        transition: "background .1s", position: "relative", minWidth: 0, overflow: "hidden",
                      }}
                        onDragOver={e => { e.preventDefault(); setDragOverKey(key); }}
                        onDragLeave={() => setDragOverKey(null)}
                        onDrop={e => { e.preventDefault(); setDragOverKey(null); if (draggingId) moveSlot(draggingId, day); setDraggingId(null); }}
                      >
                        <div style={{ marginBottom: 6, display: "flex", justifyContent: "center" }}>
                          <span style={{ width: 26, height: 26, borderRadius: "50%", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: isToday ? 700 : 400,
                            background: isToday ? "#533AB7" : "transparent",
                            color: isToday ? "#fff" : inCurrentMonth ? (di >= 5 ? "#aaa" : "#444") : "#ccc",
                          }}>{day.getDate()}</span>
                        </div>

                        {daySlots.map(slot => {
                          const pc  = PLATFORM_COLORS[slot.platform] || { bg: "#F1EFE8", border: "#bbb" };
                          const st  = STATUS_CONFIG[slot.status] || STATUS_CONFIG.planned;
                          const topic = slot.idea?.idea || slot.post_text?.substring(0, 60) || slot.rubric_name;

                          return (
                            <div key={slot.id} draggable
                              onDragStart={e => { e.stopPropagation(); setDraggingId(slot.id); }}
                              onDragEnd={() => { setDraggingId(null); setDragOverKey(null); }}
                              onClick={() => openSlot(slot)}
                              title={topic}
                              style={{
                                background: pc.bg,
                                borderLeft: `3px solid ${slot.status === "pending_approval" ? "#F59E0B" : slot.status === "needs_info" ? "#EA580C" : pc.border}`,
                                borderRadius: 5, padding: "4px 7px", marginBottom: 3,
                                cursor: "grab", userSelect: "none",
                                opacity: draggingId === slot.id ? 0.4 : 1,
                                overflow: "hidden", minWidth: 0, wordBreak: "break-word",
                              }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 2 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#666", flexShrink: 0, lineHeight: "14px" }}>
                                  {PLATFORM_ICON[slot.platform]}
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 600, color: "#333", lineHeight: 1.3 }}>
                                  {slot.rubric_name}
                                </span>
                              </div>
                              <span style={{ fontSize: 9, fontWeight: 600, color: st.color,
                                background: st.bg, padding: "1px 5px", borderRadius: 4, display: "inline-block" }}>
                                {st.label}
                              </span>
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
      {expanded && (() => {
        const st = STATUS_CONFIG[expanded.status] || STATUS_CONFIG.planned;
        const hasImage = !!(expanded.image_base64 || expanded.image_url || modalUploadedImage);
        const hasText  = !!modalText.trim();
        const allInfoDone = !expanded.needs_info_for || infoAnswers.every(a => a?.trim());
        const canApprove  = hasText && hasImage && allInfoDone;
        const imgSrc = expanded.image_base64
          ? `data:image/png;base64,${expanded.image_base64}`
          : expanded.image_url || modalUploadedImage || null;
        const inp13: React.CSSProperties = {
          width: "100%", padding: "9px 12px", border: "1.5px solid #E0DED8",
          borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none",
          resize: "vertical" as const, boxSizing: "border-box" as const, background: "#fff",
        };
        const imgBtn = (active: boolean): React.CSSProperties => ({
          flex: 1, padding: "9px 0", border: `1.5px solid ${active ? "#533AB7" : "#E0DED8"}`,
          borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 500,
          background: active ? "#EEEDFE" : "#fff", color: active ? "#533AB7" : "#555",
        });

        return (
          <div onClick={closeModal}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 20, width: "min(760px, 95vw)",
                maxHeight: "92vh", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>

              {/* ── Header (fixed) ── */}
              <div style={{ padding: "22px 28px 16px", borderBottom: "1px solid #F0EEE8", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700,
                    background: PLATFORM_COLORS[expanded.platform]?.bg || "#F1EFE8",
                    border: `2px solid ${PLATFORM_COLORS[expanded.platform]?.border || "#bbb"}`, flexShrink: 0 }}>
                    {PLATFORM_ICON[expanded.platform]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>
                      {expanded.rubric_name}
                    </div>
                    {editingDate ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="datetime-local" value={modalDate} onChange={e => setModalDate(e.target.value)}
                          style={{ padding: "4px 8px", border: "1.5px solid #533AB7", borderRadius: 8,
                            fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                        <button onClick={saveModalDate} disabled={savingDate}
                          style={{ padding: "4px 12px", background: "#533AB7", color: "#fff",
                            border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          {savingDate ? "..." : "Сохранить"}
                        </button>
                        <button onClick={() => setEditingDate(false)}
                          style={{ padding: "4px 10px", background: "#F1EFE8", border: "none",
                            borderRadius: 8, cursor: "pointer", fontSize: 12, color: "#555" }}>
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, color: "#888" }}>
                          {new Date(expanded.scheduled_at).toLocaleDateString("ru-RU", {
                            weekday: "long", year: "numeric", month: "long", day: "numeric",
                          })} · {String(new Date(expanded.scheduled_at).getHours()).padStart(2,"0")}:{String(new Date(expanded.scheduled_at).getMinutes()).padStart(2,"0")}
                        </span>
                        <button onClick={() => setEditingDate(true)}
                          title="Изменить дату и время"
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14,
                            color: "#aaa", padding: "0 2px", lineHeight: 1 }}>✏️</button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20,
                      color: st.color, background: st.bg }}>{st.label}</span>
                    <button onClick={closeModal}
                      style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #E0DED8",
                        background: "#fff", cursor: "pointer", fontSize: 16, color: "#888",
                        display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                </div>
              </div>

              {/* ── Scrollable body ── */}
              <div style={{ overflowY: "auto", flex: 1, padding: "20px 28px" }}>

                {/* 1. Идея поста — всегда сверху */}
                {expanded.idea && (
                  <div style={{ background: "#F8F7F4", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#999", marginBottom: 6,
                      textTransform: "uppercase", letterSpacing: .5 }}>Идея поста</div>
                    <div style={{ fontSize: 14, color: "#333", lineHeight: 1.6 }}>{expanded.idea.idea}</div>
                    {expanded.idea.hook && (
                      <div style={{ fontSize: 13, color: "#777", marginTop: 5, fontStyle: "italic" }}>
                        Хук: {expanded.idea.hook}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Запрос информации (needs_info без текста) */}
                {expanded.status === "needs_info" && !expanded.post_text && expanded.needs_info_for && (
                  <div style={{ background: "#FFF8ED", borderRadius: 12, padding: "16px 18px",
                    marginBottom: 16, border: "1px solid #FFD699" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#7C4400", marginBottom: 4 }}>
                      📋 Нужна информация для генерации поста
                    </div>
                    <div style={{ fontSize: 13, color: "#8B5500", marginBottom: 14, lineHeight: 1.5 }}>
                      Ответьте на вопросы — AI сгенерирует текст поста на основе ваших ответов
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {expanded.needs_info_for.map((question, i) => (
                        <div key={i}>
                          <label style={{ fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 5 }}>
                            {question}
                          </label>
                          <textarea value={infoAnswers[i] || ""} rows={2}
                            onChange={e => { const next = [...infoAnswers]; next[i] = e.target.value; setInfoAnswers(next); }}
                            placeholder="Ваш ответ..."
                            style={{ ...inp13 }}
                            onFocus={e => (e.target.style.borderColor = "#EA580C")}
                            onBlur={e => (e.target.style.borderColor = "#E0DED8")} />
                        </div>
                      ))}
                    </div>
                    <button onClick={() => provideInfo(expanded)}
                      disabled={providingInfo || infoAnswers.every(a => !a?.trim())}
                      style={{ marginTop: 14, padding: "10px 22px", fontSize: 14, fontWeight: 700,
                        color: "#fff", border: "none", borderRadius: 10, cursor: "pointer",
                        background: providingInfo || infoAnswers.every(a => !a?.trim()) ? "#ccc" : "#EA580C" }}>
                      {providingInfo ? "Генерирую пост..." : "✨ Сгенерировать текст поста"}
                    </button>
                  </div>
                )}

                {/* 3. Текст поста */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#999", marginBottom: 8,
                    textTransform: "uppercase", letterSpacing: .5 }}>Текст поста</div>
                  <textarea value={modalText} onChange={e => setModalText(e.target.value)}
                    style={{ width: "100%", minHeight: 280, padding: "12px 14px", fontSize: 14,
                      lineHeight: 1.75, border: "1.5px solid #E0DED8", borderRadius: 10,
                      resize: "vertical", fontFamily: "inherit", outline: "none",
                      boxSizing: "border-box", color: "#2a2a2a", background: "#FAFAF8" }}
                    onFocus={e => (e.target.style.borderColor = "#533AB7")}
                    onBlur={e => (e.target.style.borderColor = "#E0DED8")} />
                </div>

                {/* 4. Изображение */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#999", marginBottom: 12,
                    textTransform: "uppercase", letterSpacing: .5 }}>Изображение</div>

                  {/* 3 кнопки режима */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <button onClick={() => setModalImageMode(modalImageMode === "generate" ? null : "generate")}
                      style={imgBtn(modalImageMode === "generate")}>
                      ✨ Сгенерировать
                    </button>
                    <button onClick={() => modalUploadRef.current?.click()}
                      style={imgBtn(modalImageMode === "upload")}>
                      📁 Загрузить
                    </button>
                    <button onClick={() => setModalImageMode(modalImageMode === "edit" ? null : "edit")}
                      style={imgBtn(modalImageMode === "edit")}>
                      🖌 Редактировать
                    </button>
                    <input ref={modalUploadRef} type="file" accept="image/*" style={{ display: "none" }}
                      onChange={handleModalUpload} />
                  </div>

                  {/* Подблок: генерация */}
                  {modalImageMode === "generate" && (
                    <div style={{ background: "#F8F7F4", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 8 }}>
                        Промт для генерации
                      </div>
                      <textarea value={modalGenPrompt} onChange={e => setModalGenPrompt(e.target.value)}
                        placeholder="Опишите желаемое изображение на русском или английском..."
                        style={{ ...inp13, minHeight: 80 }}
                        onFocus={e => (e.target.style.borderColor = "#533AB7")}
                        onBlur={e => (e.target.style.borderColor = "#E0DED8")} />
                      <p style={{ margin: "6px 0 12px", fontSize: 11, color: "#aaa" }}>
                        Можно писать на русском — модель понимает оба языка
                      </p>
                      <button onClick={() => generateImage(expanded, modalGenPrompt || undefined)}
                        disabled={generatingImg === expanded.id}
                        style={{ padding: "9px 20px", background: generatingImg === expanded.id ? "#ccc" : "#533AB7",
                          color: "#fff", border: "none", borderRadius: 10, cursor: "pointer",
                          fontSize: 13, fontWeight: 600 }}>
                        {generatingImg === expanded.id ? "Генерирую..." : imgSrc ? "🔄 Перегенерировать" : "✨ Сгенерировать"}
                      </button>
                    </div>
                  )}

                  {/* Подблок: редактирование */}
                  {modalImageMode === "edit" && (
                    <div style={{ background: "#F8F7F4", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      {!expanded.image_base64 && (
                        <div style={{ fontSize: 13, color: "#EA580C", marginBottom: 10 }}>
                          ⚠ Сначала добавьте изображение (загрузите или сгенерируйте)
                        </div>
                      )}
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 8 }}>
                        Инструкция по редактированию
                      </div>
                      <textarea value={modalEditInstruction}
                        onChange={e => setModalEditInstruction(e.target.value)}
                        placeholder="Что изменить в изображении? Например: сделать фон белым, добавить логотип..."
                        style={{ ...inp13, minHeight: 70 }}
                        onFocus={e => (e.target.style.borderColor = "#533AB7")}
                        onBlur={e => (e.target.style.borderColor = "#E0DED8")} />
                      <button onClick={editModalImage}
                        disabled={editingModalImg || !expanded.image_base64 || !modalEditInstruction.trim()}
                        style={{ marginTop: 10, padding: "9px 20px",
                          background: editingModalImg || !expanded.image_base64 ? "#ccc" : "#533AB7",
                          color: "#fff", border: "none", borderRadius: 10, cursor: "pointer",
                          fontSize: 13, fontWeight: 600 }}>
                        {editingModalImg ? "Редактирую..." : "🖌 Редактировать"}
                      </button>
                    </div>
                  )}

                  {/* Превью */}
                  {imgSrc ? (
                    <img src={imgSrc} alt="preview"
                      style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 12 }} />
                  ) : (
                    <div style={{ background: "#F8F7F4", borderRadius: 12, padding: "40px 16px",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                      border: "2px dashed #E0DED8" }}>
                      <span style={{ fontSize: 40 }}>🖼</span>
                      <span style={{ fontSize: 13, color: "#999" }}>Изображение не прикреплено</span>
                    </div>
                  )}
                </div>

                {/* 5. "Нужна доп. информация" expandable (для pending_approval) */}
                {showNeedsInfo && (
                  <div style={{ background: "#fff", borderRadius: 12, padding: 14, marginBottom: 8,
                    border: "1px solid #E0DED8" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 10 }}>
                      Что нужно предоставить?
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      {NEEDS_INFO_OPTIONS.map(item => (
                        <button key={item}
                          onClick={() => setSelectedInfoItems(prev =>
                            prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]
                          )}
                          style={{ padding: "6px 14px", borderRadius: 20, border: "1.5px solid",
                            cursor: "pointer", fontSize: 12,
                            borderColor: selectedInfoItems.includes(item) ? "#EA580C" : "#E0DED8",
                            background: selectedInfoItems.includes(item) ? "#FFE5CC" : "#fff",
                            color: selectedInfoItems.includes(item) ? "#8B3200" : "#555" }}>
                          {item}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => requestInfo(expanded)}
                      disabled={selectedInfoItems.length === 0 || approvingId === expanded.id}
                      style={{ padding: "8px 16px",
                        background: selectedInfoItems.length === 0 ? "#ccc" : "#EA580C",
                        color: "#fff", border: "none", borderRadius: 10, cursor: "pointer",
                        fontSize: 13, fontWeight: 600 }}>
                      Поставить статус «Жду инфо»
                    </button>
                  </div>
                )}

              </div>

              {/* ── Bottom bar (fixed) ── */}
              <div style={{ padding: "14px 28px", borderTop: "1px solid #F0EEE8", flexShrink: 0,
                display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>

                <button onClick={saveModal} disabled={modalSaving}
                  style={{ padding: "10px 18px", background: "#1a1a1a", color: "#fff",
                    border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  {modalSaving ? "Сохраняю..." : "💾 Сохранить текст"}
                </button>

                <button
                  onClick={() => approveSlot(expanded)}
                  disabled={!canApprove || approvingId === expanded.id}
                  title={!canApprove ? "Добавьте текст и изображение, ответьте на все вопросы" : ""}
                  style={{ padding: "10px 18px",
                    background: !canApprove || approvingId === expanded.id ? "#ccc" : "#0F6E56",
                    color: "#fff", border: "none", borderRadius: 10,
                    cursor: !canApprove ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
                  {approvingId === expanded.id ? "..." : "✓ Согласовать"}
                </button>

                {expanded.status === "content_ready" && (
                  <button onClick={publishModal}
                    style={{ padding: "10px 18px", background: "#185FA5", color: "#fff",
                      border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    ✈ Опубликовать
                  </button>
                )}

                <button onClick={() => setShowNeedsInfo(!showNeedsInfo)}
                  style={{ padding: "10px 16px", background: showNeedsInfo ? "#FFE5CC" : "transparent",
                    border: `1.5px solid ${showNeedsInfo ? "#EA580C" : "#E0DED8"}`,
                    borderRadius: 10, cursor: "pointer", fontSize: 13,
                    color: showNeedsInfo ? "#8B3200" : "#555" }}>
                  📋 Нужна доп. информация
                </button>

                <button onClick={closeModal}
                  style={{ marginLeft: "auto", padding: "10px 18px", background: "#F1EFE8",
                    color: "#555", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
                  Закрыть
                </button>

              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

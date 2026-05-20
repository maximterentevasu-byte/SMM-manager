"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useMobile } from "@/hooks/useMobile";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  content_ready:     { label: "Готово",              color: "#00B5A6", bg: "#E0F7F6" },
  published:         { label: "Опубликовано",        color: "#3478F6", bg: "#EAF4FF" },
  planned:           { label: "Нужна информация",    color: "#92400E", bg: "#F2E8D5" },
  idea_ready:        { label: "Нужна информация",    color: "#92400E", bg: "#F2E8D5" },
  pending_approval:  { label: "Согласование",        color: "#3478F6", bg: "#EAF4FF" },
  needs_info:        { label: "Нужна информация",    color: "#92400E", bg: "#F2E8D5" },
  failed:            { label: "Ошибка",              color: "#FF6B5E", bg: "#FFF0EF" },
};

const NEEDS_INFO_STATUSES = ["planned", "idea_ready", "needs_info", "failed"];

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
  event_id: string | null;
  event_post_type: string | null;
};

type CalEvent = {
  id: string; name: string;
  start_date: string; end_date: string;
  status: string;
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

// ── Shared upload utils ───────────────────────────────────────────────────────

type ModalUploadSlot = { data: string; mime: string };

const readFileAsBase64Modal = (f: File): Promise<ModalUploadSlot> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => {
      const s = e.target?.result as string;
      const p = s.split(",");
      res({ data: p[1] || "", mime: p[0].replace("data:", "").replace(";base64", "") || "image/jpeg" });
    };
    r.onerror = rej;
    r.readAsDataURL(f);
  });

const extractVideoFrameModal = (objectUrl: string): Promise<string | null> =>
  new Promise(resolve => {
    const video = document.createElement("video");
    video.muted = true; video.preload = "metadata"; video.crossOrigin = "anonymous"; video.src = objectUrl;
    video.onloadeddata = () => { video.currentTime = 0.001; };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    video.onerror = () => resolve(null);
  });

const PLATFORM_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  vk:       { label: "ВКонтакте", color: "#4680C2", bg: "#EBF2FB" },
  telegram: { label: "Telegram",  color: "#2AABEE", bg: "#E3F4FF" },
  ok:       { label: "Одноклассники", color: "#F57C00", bg: "#FFF3E0" },
};

function SlideToConfirm({ label, onConfirm, color = "#FF6B5E" }: {
  label: string; onConfirm: () => void; color?: string;
}) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const THUMB = 44;

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current || !trackRef.current) return;
      const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
      const rect = trackRef.current.getBoundingClientRect();
      const max = rect.width - THUMB;
      const pct = Math.max(0, Math.min(100, ((cx - startX.current - rect.left) / max) * 100));
      setProgress(pct);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setProgress(p => {
        if (p >= 85) { setDone(true); onConfirm(); return 100; }
        return 0;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [onConfirm]);

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    dragging.current = true;
    startX.current = "touches" in e
      ? e.touches[0].clientX - (trackRef.current?.getBoundingClientRect().left || 0) - (progress / 100) * ((trackRef.current?.clientWidth || 300) - THUMB)
      : e.clientX - (trackRef.current?.getBoundingClientRect().left || 0) - (progress / 100) * ((trackRef.current?.clientWidth || 300) - THUMB);
  };

  return (
    <div ref={trackRef} style={{ position: "relative", height: 44, borderRadius: 22,
      background: done ? `${color}22` : "#F1EFE8",
      border: `1.5px solid ${done ? color : "#E5E7EB"}`,
      overflow: "hidden", userSelect: "none", cursor: "default" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0,
        width: `${progress}%`, background: `${color}20`,
        transition: dragging.current ? "none" : "width .25s" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 12, fontWeight: 600,
        color: done ? color : "#888", pointerEvents: "none", letterSpacing: 0.2 }}>
        {done ? "✓ Подтверждено" : label}
      </div>
      {!done && (
        <div onMouseDown={start} onTouchStart={start}
          style={{ position: "absolute", top: 2,
            left: `calc(${progress / 100} * (100% - ${THUMB}px))`,
            width: THUMB, height: 40, borderRadius: 20,
            background: color, cursor: "grab", display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 18, fontWeight: 700,
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            transition: dragging.current ? "none" : "left .25s" }}>
          →
        </div>
      )}
    </div>
  );
}

function EvPlatformPicker({ platforms, selected, onChange }: {
  platforms: Array<{ platform: string; page_name: string }>;
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (p: string) =>
    onChange(selected.includes(p) ? selected.filter(x => x !== p) : [...selected, p]);
  return (
    <div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Каналы публикации</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {platforms.map(p => {
          const cfg = PLATFORM_LABELS[p.platform] || { label: p.platform, color: "#888", bg: "#F1EFE8" };
          const on = selected.includes(p.platform);
          return (
            <button key={p.platform} type="button" onClick={() => toggle(p.platform)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
                borderRadius: 20, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`,
                background: on ? cfg.bg : "#fff", cursor: "pointer",
                fontSize: 12, color: on ? cfg.color : "#888", fontWeight: on ? 600 : 400,
                transition: "all .15s" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%",
                background: on ? cfg.color : "#ccc", display: "inline-block", flexShrink: 0 }} />
              {p.page_name || cfg.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModalUploadGrid({ slots, onSlotClick, onRemove, onReorder, onFileDrop }: {
  slots: Array<ModalUploadSlot | null>;
  onSlotClick: (idx: number) => void;
  onRemove: (idx: number) => void;
  onReorder: (from: number, to: number) => void;
  onFileDrop: (startIdx: number, files: File[]) => void;
}) {
  const dragFrom = useRef(-1);
  const [dragOver, setDragOver] = useState(-1);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8 }}>
      {slots.map((slot, idx) => (
        <div
          key={idx}
          onClick={() => !slot && onSlotClick(idx)}
          draggable={!!slot}
          onDragStart={() => { dragFrom.current = idx; }}
          onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
          onDragLeave={() => setDragOver(-1)}
          onDrop={e => {
            e.preventDefault(); setDragOver(-1);
            if (e.dataTransfer.files.length > 0) {
              onFileDrop(idx, Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")));
            } else if (dragFrom.current >= 0 && dragFrom.current !== idx) {
              onReorder(dragFrom.current, idx);
            }
            dragFrom.current = -1;
          }}
          onDragEnd={() => { dragFrom.current = -1; setDragOver(-1); }}
          style={{
            position: "relative", aspectRatio: "1",
            background: slot ? "transparent" : "rgba(0,0,0,0.04)",
            border: dragOver === idx ? "2px solid #3478F6" : slot ? "1.5px solid #E5E7EB" : "2px dashed #C0BDB6",
            borderRadius: 10, overflow: "hidden",
            cursor: slot ? "grab" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "border-color 0.15s",
          }}
        >
          {slot ? (
            <>
              <img src={`data:${slot.mime};base64,${slot.data}`} alt={`u-${idx}`}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />
              <button onClick={e => { e.stopPropagation(); onRemove(idx); }}
                style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%",
                  background: "rgba(0,0,0,0.65)", border: "none", color: "#fff", cursor: "pointer",
                  fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, zIndex: 1 }}>✕</button>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.18)",
                fontSize: 8, color: "rgba(255,255,255,0.8)", textAlign: "center", padding: "2px 0",
                letterSpacing: 0.5, pointerEvents: "none" }}>ТЯНУТЬ</div>
            </>
          ) : (
            <span style={{ fontSize: 24, color: "#C0BDB6", lineHeight: 1, userSelect: "none" }}>+</span>
          )}
        </div>
      ))}
    </div>
  );
}

function ModalUploadCarousel({ slots, carouselIdx, setCarouselIdx }: {
  slots: Array<ModalUploadSlot | null>;
  carouselIdx: number;
  setCarouselIdx: (i: number) => void;
}) {
  const filled = slots.filter((s): s is ModalUploadSlot => s !== null);
  if (filled.length === 0) return null;
  const safeIdx = Math.min(carouselIdx, filled.length - 1);
  const current = filled[safeIdx];
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ position: "relative", display: "block" }}>
        <img src={`data:${current.mime};base64,${current.data}`} alt="preview-current"
          style={{ width: "100%", height: "auto", maxHeight: "55vh", objectFit: "contain",
            borderRadius: 12, border: "1px solid #E5E7EB", display: "block", background: "#F5F7FA" }} />
        {filled.length > 1 && (
          <>
            <button onClick={() => setCarouselIdx(Math.max(0, safeIdx - 1))} disabled={safeIdx === 0}
              style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)",
                width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.45)",
                border: "none", color: "#fff", cursor: safeIdx === 0 ? "not-allowed" : "pointer",
                fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <button onClick={() => setCarouselIdx(Math.min(filled.length - 1, safeIdx + 1))} disabled={safeIdx === filled.length - 1}
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.45)",
                border: "none", color: "#fff", cursor: safeIdx === filled.length - 1 ? "not-allowed" : "pointer",
                fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
            <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.4)", borderRadius: 10, padding: "2px 8px", fontSize: 11, color: "#fff" }}>
              {safeIdx + 1} / {filled.length}
            </div>
          </>
        )}
      </div>
      {filled.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", paddingBottom: 4 }}>
          {filled.map((s, i) => (
            <img key={i} src={`data:${s.mime};base64,${s.data}`} alt={`thumb-${i}`}
              onClick={() => setCarouselIdx(i)}
              style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, flexShrink: 0,
                cursor: "pointer", border: i === safeIdx ? "2px solid #0D1B2A" : "2px solid transparent",
                opacity: i === safeIdx ? 1 : 0.6 }} />
          ))}
        </div>
      )}
    </div>
  );
}

const MEDIA_QUESTION_KEYWORDS = ["фото", "видео", "пришли", "загрузи", "прикрепи", "изображение", "снимок", "фотографи"];
const isMediaQuestion = (q: string) => MEDIA_QUESTION_KEYWORDS.some(kw => q.toLowerCase().includes(kw));

// ── Main component ────────────────────────────────────────────────────────────

export default function ContentPage() {
  const isMobile = useMobile();
  const router = useRouter();
  const [slots, setSlots]               = useState<Slot[]>([]);
  const [loading, setLoading]           = useState(true);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editText, setEditText]         = useState("");
  const [saving, setSaving]             = useState(false);
  const [generatingImg, setGeneratingImg] = useState<string | null>(null);
  const [reloading, setReloading]       = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
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
  const [localInfoQuestions, setLocalInfoQuestions]       = useState<string[]>([]);
  const [infoAnswers, setInfoAnswers]                     = useState<string[]>([]);
  const [infoAnsweredFlags, setInfoAnsweredFlags]         = useState<boolean[]>([]);
  const [providingInfo, setProvidingInfo]                 = useState(false);
  const [regeneratingQuestions, setRegeneratingQuestions] = useState(false);

  // Modal image section state
  const [modalImageMode, setModalImageMode] = useState<"generate" | "upload" | "edit" | "video" | null>(null);
  const [modalGenPrompt, setModalGenPrompt] = useState("");
  const [modalEditInstruction, setModalEditInstruction] = useState("");
  const [editingModalImg, setEditingModalImg] = useState(false);
  // Modal upload grid (10 slots)
  const [modalUploadSlots, setModalUploadSlots] = useState<Array<ModalUploadSlot | null>>(Array(10).fill(null));
  const [modalUploadCarouselIdx, setModalUploadCarouselIdx] = useState(0);
  const modalActiveSlotRef = useRef<number>(-1);
  // Modal video (3 slots)
  const [modalVideoFiles, setModalVideoFiles] = useState<Array<File | null>>([null, null, null]);
  const [modalVideoPreviewUrls, setModalVideoPreviewUrls] = useState<Array<string | null>>([null, null, null]);
  const modalVideoActiveRef = useRef<number>(-1);
  // Modal video cover
  const [modalVideoCoverDataUrl, setModalVideoCoverDataUrl] = useState<string | null>(null);
  const [modalVideoCoverAutoDataUrl, setModalVideoCoverAutoDataUrl] = useState<string | null>(null);
  const [modalVideoCoverSource, setModalVideoCoverSource] = useState<"auto" | "upload" | "ai" | null>(null);
  const [modalVideoCoverPrompt, setModalVideoCoverPrompt] = useState("");
  const [modalShowVideoCoverPrompt, setModalShowVideoCoverPrompt] = useState(false);
  const [modalLoadingVideoCover, setModalLoadingVideoCover] = useState(false);
  const [modalVideoCoverRefPhoto, setModalVideoCoverRefPhoto] = useState<ModalUploadSlot | null>(null);
  // Modal AI image history (shared: generate + edit)
  const [modalImageHistory, setModalImageHistory] = useState<string[]>([]);
  const [modalCurrentImageIdx, setModalCurrentImageIdx] = useState(-1);
  const [modalImageGenCount, setModalImageGenCount] = useState(0);
  const [modalEditAttemptCount, setModalEditAttemptCount] = useState(0);
  const [modalInlineEditInstruction, setModalInlineEditInstruction] = useState("");
  const [modalInlineEditCount, setModalInlineEditCount] = useState(0);
  const [modalShowInlineEdit, setModalShowInlineEdit] = useState(false);
  const [modalAiImageSaved, setModalAiImageSaved] = useState(false);
  // Modal edit slots (base + reference)
  const [modalEditSlots, setModalEditSlots] = useState<Array<ModalUploadSlot | null>>(Array(10).fill(null));

  // Date editing state
  const [editingDate, setEditingDate] = useState(false);
  const [modalDate, setModalDate]     = useState("");
  const [savingDate, setSavingDate]   = useState(false);

  const [quickPostOpen, setQuickPostOpen] = useState(false);
  const [quickPostPlatforms, setQuickPostPlatforms] = useState<Array<{platform: string; page_name: string}>>([]);

  const [brandAssetsLabels, setBrandAssetsLabels] = useState<Array<{name: string; label: string; data?: string; mime?: string}>>([]);
  const [modalEditBrandRefs, setModalEditBrandRefs] = useState<Map<number, {data: string; mime: string}>>(new Map());
  const toggleModalEditBrandRef = (idx: number, asset: {data?: string; mime?: string}) => {
    setModalEditBrandRefs(prev => {
      const next = new Map(prev);
      if (next.has(idx)) { next.delete(idx); }
      else if (asset.data) { next.set(idx, { data: asset.data, mime: asset.mime || "image/jpeg" }); }
      return next;
    });
  };
  const [modalPromptUrl, setModalPromptUrl] = useState("");
  const [modalImgElapsed, setModalImgElapsed] = useState(0);
  const [modalAspectRatio, setModalAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");

  // Events
  const [calEvents, setCalEvents] = useState<CalEvent[]>([]);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [evName, setEvName] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evStartDate, setEvStartDate] = useState("");
  const [evEndDate, setEvEndDate] = useState("");
  const [evHasStart, setEvHasStart] = useState(false);
  const [evStartDT, setEvStartDT] = useState("");
  const [evStartPlatforms, setEvStartPlatforms] = useState<string[]>([]);
  const [evHasEnd, setEvHasEnd] = useState(false);
  const [evEndDT, setEvEndDT] = useState("");
  const [evEndPlatforms, setEvEndPlatforms] = useState<string[]>([]);
  const [evHasInter, setEvHasInter] = useState(false);
  const [evInterCount, setEvInterCount] = useState(1);
  const [evInterDTs, setEvInterDTs] = useState<string[]>([""]);
  const [evInterPlatforms, setEvInterPlatforms] = useState<string[]>([]);
  const [evSaving, setEvSaving] = useState(false);
  const [evAvailablePlatforms, setEvAvailablePlatforms] = useState<Array<{platform: string; page_name: string}>>([]);
  const [evEditingId, setEvEditingId] = useState<string | null>(null);
  const [evDeleting, setEvDeleting] = useState(false);
  const [showDeleteSlot, setShowDeleteSlot] = useState(false);
  const [deletingSlot, setDeletingSlot] = useState(false);

  const modalSlotInputRef       = useRef<HTMLInputElement>(null);
  const modalVideoInputRef      = useRef<HTMLInputElement>(null);
  const modalEditSlotInputRef   = useRef<HTMLInputElement>(null);
  const modalEditActiveSlotRef  = useRef<number>(-1);
  const modalVideoCoverInputRef = useRef<HTMLInputElement>(null);
  const modalVideoCoverRefInputRef = useRef<HTMLInputElement>(null);

  const [businessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );

  const loadEvents = useCallback(async () => {
    if (!businessId) return;
    try {
      const { data } = await api.get(`/events/${businessId}`);
      setCalEvents(data || []);
    } catch {}
  }, [businessId]);

  const openEventModal = useCallback(async () => {
    setEvEditingId(null);
    setEvName(""); setEvDesc(""); setEvStartDate(""); setEvEndDate("");
    setEvHasStart(false); setEvStartDT(""); setEvStartPlatforms([]);
    setEvHasEnd(false); setEvEndDT(""); setEvEndPlatforms([]);
    setEvHasInter(false); setEvInterCount(1); setEvInterDTs([""]); setEvInterPlatforms([]);
    setEventModalOpen(true);
    try {
      const { data } = await api.get(`/platforms/list/${businessId}`);
      const active = (data || []).filter((p: any) => p.is_active)
        .map((p: any) => ({ platform: p.platform, page_name: p.page_name }));
      setEvAvailablePlatforms(active);
      const all = active.map((p: any) => p.platform);
      setEvStartPlatforms(all);
      setEvEndPlatforms(all);
      setEvInterPlatforms(all);
    } catch {}
  }, [businessId]);

  const openEventForEdit = useCallback(async (ev: CalEvent) => {
    setEvEditingId(ev.id);
    setEvName(ev.name);
    setEvDesc("");
    setEvStartDate(ev.start_date.split("T")[0]);
    setEvEndDate(ev.end_date.split("T")[0]);
    setEvHasStart(false); setEvStartDT(""); setEvStartPlatforms([]);
    setEvHasEnd(false); setEvEndDT(""); setEvEndPlatforms([]);
    setEvHasInter(false); setEvInterCount(1); setEvInterDTs([""]); setEvInterPlatforms([]);
    setEventModalOpen(true);
    try {
      const { data: evData } = await api.get(`/events/${businessId}/${ev.id}`);
      if (evData.description) setEvDesc(evData.description);
      setEvHasStart(evData.has_start_notification || false);
      if (evData.start_post_datetime) setEvStartDT(evData.start_post_datetime.slice(0, 16));
      setEvHasEnd(evData.has_end_notification || false);
      if (evData.end_post_datetime) setEvEndDT(evData.end_post_datetime.slice(0, 16));
      setEvHasInter(evData.has_intermediate || false);
      setEvInterCount(evData.intermediate_count || 1);
      setEvInterDTs(evData.intermediate_datetimes?.map((d: string) => d.slice(0, 16)) || [""]);
    } catch {}
    try {
      const { data: platData } = await api.get(`/platforms/list/${businessId}`);
      const active = (platData || []).filter((p: any) => p.is_active)
        .map((p: any) => ({ platform: p.platform, page_name: p.page_name }));
      setEvAvailablePlatforms(active);
      const all = active.map((p: any) => p.platform);
      setEvStartPlatforms(all); setEvEndPlatforms(all); setEvInterPlatforms(all);
    } catch {}
  }, [businessId]);

  const deleteCurrentSlot = useCallback(async () => {
    if (!expanded) return;
    setDeletingSlot(true);
    try {
      await api.delete(`/content/slot/${expanded.id}`);
      setSlots(prev => prev.filter(s => s.id !== expanded.id));
      closeModal();
    } catch { alert("Ошибка удаления поста"); }
    finally { setDeletingSlot(false); }
  }, [expanded]);

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
    loadEvents();
    setStrategyUpdated(!!localStorage.getItem("strategyUpdatedAt"));
    if (businessId) {
      api.get(`/post-creator/${businessId}/brand-context`)
        .then(({ data }) => setBrandAssetsLabels(data.brand_assets_labels || []))
        .catch(() => {});
    }
  }, [load, loadEvents]);

  // Синхронизация localInfoQuestions при открытии слота
  useEffect(() => {
    if (expanded?.needs_info_for && expanded.needs_info_for.length > 0 && localInfoQuestions.length === 0) {
      setLocalInfoQuestions(expanded.needs_info_for);
      setInfoAnswers(expanded.needs_info_for.map(() => ""));
      setInfoAnsweredFlags(expanded.needs_info_for.map(() => false));
    }
  }, [expanded?.id]);

  // Авто-поллинг пока есть слоты в процессе генерации
  useEffect(() => {
    const generating = slots.some(s =>
      s.status === "planned" || s.status === "idea_ready"
    );
    if (!generating) return;
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [slots, load]);

  // На мобильном всегда показываем список
  useEffect(() => {
    if (isMobile) setViewMode("list");
  }, [isMobile]);

  const reloadPlan = async () => {
    setReloading(true);
    try {
      const now = new Date();
      await api.post(`/content/${businessId}/generate-plan`, { year: now.getFullYear(), month: now.getMonth() + 1 });
      localStorage.removeItem("strategyUpdatedAt");
      setStrategyUpdated(false);
      setGeneratingPlan(true);
      // Polling: проверяем появление новых слотов каждые 15 секунд
      const prevTotal = slots.length;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const { data } = await api.get(`/content/${businessId}/slots`);
          if ((data.slots?.length ?? 0) !== prevTotal || attempts >= 12) {
            clearInterval(poll);
            setGeneratingPlan(false);
            await load();
          }
        } catch { /* ignore */ }
      }, 15000);
    } catch { alert("Ошибка запуска обновления плана"); }
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
    const textAnswers = answers.filter((_, i) => !isMediaQuestion(questions[i]));
    if (textAnswers.every(a => !a.answer.trim())) return;
    setProvidingInfo(true);
    try {
      const { data } = await api.post(`/content/slot/${slot.id}/provide-info`, { answers });
      const updates = {
        post_text: data.post_text,
        image_prompt: data.image_prompt,
        status: "needs_info",
        needs_info_for: null,
      };
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, ...updates } : s));
      setExpanded(prev => prev?.id === slot.id ? { ...prev, ...updates } : prev);
      setModalText(data.post_text || "");
      if (data.image_prompt) {
        setModalPrompt(data.image_prompt);
        setModalGenPrompt(data.image_prompt);
      }
      setInfoAnswers([]);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Ошибка генерации поста");
    } finally { setProvidingInfo(false); }
  };

  const regenerateQuestions = async (slot: Slot) => {
    setRegeneratingQuestions(true);
    try {
      const { data } = await api.post(`/content/slot/${slot.id}/regenerate-questions`);
      const newQs: string[] = data.needs_info_for || [];
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, needs_info_for: newQs } : s));
      setExpanded(prev => prev?.id === slot.id ? { ...prev, needs_info_for: newQs } : prev);
      setLocalInfoQuestions(newQs);
      setInfoAnswers(newQs.map(() => ""));
      setInfoAnsweredFlags(newQs.map(() => false));
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Ошибка обновления вопросов");
    } finally { setRegeneratingQuestions(false); }
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
    setLocalInfoQuestions(slot.needs_info_for || []);
    setInfoAnswers((slot.needs_info_for || []).map(() => ""));
    setInfoAnsweredFlags((slot.needs_info_for || []).map(() => false));
    setModalDate(new Date(slot.scheduled_at).toISOString().slice(0, 16));
    setModalImageMode(null);
    setModalUploadSlots(Array(10).fill(null)); setModalUploadCarouselIdx(0);
    setModalEditSlots(Array(10).fill(null));
    setModalVideoFiles([null, null, null]);
    setModalVideoPreviewUrls(prev => { prev.forEach(u => u && URL.revokeObjectURL(u)); return [null, null, null]; });
    setModalVideoCoverDataUrl(null); setModalVideoCoverAutoDataUrl(null); setModalVideoCoverSource(null);
    setModalVideoCoverPrompt(""); setModalShowVideoCoverPrompt(false); setModalVideoCoverRefPhoto(null);
    setModalImageHistory([]); setModalCurrentImageIdx(-1); setModalImageGenCount(0);
    setModalEditAttemptCount(0); setModalInlineEditCount(0); setModalShowInlineEdit(false);
    setModalInlineEditInstruction(""); setModalAiImageSaved(false);
    setEditingDate(false);
    setModalEditInstruction("");
    setInfoAnswers([]); setInfoAnsweredFlags([]); setLocalInfoQuestions([]);
    setShowDeleteSlot(false);
  };
  const closeModal = () => {
    setExpanded(null); setShowNeedsInfo(false); setEditingPrompt(false);
    setEditingDate(false); setModalImageMode(null);
    setShowDeleteSlot(false);
    setModalUploadSlots(Array(10).fill(null)); setModalEditSlots(Array(10).fill(null));
    setModalVideoPreviewUrls(prev => { prev.forEach(u => u && URL.revokeObjectURL(u)); return [null, null, null]; });
    setModalVideoFiles([null, null, null]);
    setModalVideoCoverDataUrl(null); setModalVideoCoverAutoDataUrl(null); setModalVideoCoverSource(null);
    setModalImageHistory([]); setModalCurrentImageIdx(-1); setModalImageGenCount(0);
    setModalEditAttemptCount(0); setModalInlineEditCount(0); setModalShowInlineEdit(false);
    setModalAiImageSaved(false);
    setInfoAnswers([]); setInfoAnsweredFlags([]); setLocalInfoQuestions([]);
  };

  const saveModal = async () => {
    if (!expanded) return;
    setModalSaving(true);
    try {
      const payload: Record<string, unknown> = { post_text: modalText };
      if (modalUploadFilled.length === 1) {
        payload.image_base64 = modalUploadFilled[0].data;
      } else if (modalUploadFilled.length > 1) {
        payload.image_base64 = modalUploadFilled[0].data;
        payload.images_base64 = modalUploadFilled.map(s => s.data);
      }
      await api.patch(`/content/slot/${expanded.id}`, payload);
      const updates: Partial<Slot> = { post_text: modalText };
      if (modalUploadFilled.length > 0) updates.image_base64 = modalUploadFilled[0].data;
      setSlots(prev => prev.map(s => s.id === expanded.id ? { ...s, ...updates } : s));
      setExpanded(prev => prev ? { ...prev, ...updates } : null);
      if (modalUploadFilled.length > 0) setModalUploadSlots(Array(10).fill(null));
    } catch { alert("Ошибка сохранения"); }
    finally { setModalSaving(false); }
  };

  const saveModalAiImage = async () => {
    if (!expanded || !modalAiImageB64) return;
    setModalSaving(true);
    try {
      await api.patch(`/content/slot/${expanded.id}`, { image_base64: modalAiImageB64 });
      setSlots(prev => prev.map(s => s.id === expanded.id ? { ...s, image_base64: modalAiImageB64 } : s));
      setExpanded(prev => prev ? { ...prev, image_base64: modalAiImageB64 } : null);
      setModalAiImageSaved(true);
    } catch { alert("Ошибка сохранения изображения"); }
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

  // ── Modal upload slot handlers ─────────────────────────────────────────────

  const onModalSlotClick = (idx: number) => {
    modalActiveSlotRef.current = idx;
    modalSlotInputRef.current?.click();
  };

  const onModalSlotFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    const newSlots = [...modalUploadSlots];
    let startIdx = modalActiveSlotRef.current >= 0 ? modalActiveSlotRef.current : 0;
    for (const file of files) {
      while (startIdx < 10 && newSlots[startIdx] !== null) startIdx++;
      if (startIdx >= 10) break;
      const slot = await readFileAsBase64Modal(file);
      newSlots[startIdx] = slot;
      startIdx++;
    }
    setModalUploadSlots(newSlots);
    modalActiveSlotRef.current = -1;
    e.target.value = "";
  };

  const removeModalUploadSlot = (idx: number) => {
    setModalUploadSlots(prev => { const n = [...prev]; n[idx] = null; return n; });
  };

  const reorderModalUploadSlots = (from: number, to: number) => {
    setModalUploadSlots(prev => {
      const n = [...prev]; [n[from], n[to]] = [n[to], n[from]]; return n;
    });
  };

  const onModalFileDrop = async (startIdx: number, files: File[]) => {
    if (!files.length) return;
    const newSlots = [...modalUploadSlots];
    let idx = startIdx;
    for (const file of files) {
      while (idx < 10 && newSlots[idx] !== null) idx++;
      if (idx >= 10) break;
      newSlots[idx] = await readFileAsBase64Modal(file);
      idx++;
    }
    setModalUploadSlots(newSlots);
  };

  // ── Modal image AI helpers ─────────────────────────────────────────────────

  const pollModalImageTask = async (taskId: string): Promise<string> => {
    for (let i = 0; i < 60; i++) {
      await new Promise<void>(r => setTimeout(r, 5000));
      const { data } = await api.get(`/post-creator/${businessId}/image-task/${taskId}`);
      if (data.status === "done") return data.image_base64 as string;
      if (data.status === "error") throw new Error(data.error || "Ошибка");
    }
    throw new Error("Тайм-аут — попробуйте ещё раз");
  };

  const generateImageModal = async () => {
    if (!expanded || !modalGenPrompt.trim() || modalImageGenCount >= 3) return;
    setEditingModalImg(true);
    setModalImgElapsed(0);
    const timer = setInterval(() => setModalImgElapsed(s => s + 1), 1000);
    try {
      const { data } = await api.post(`/content/slot/${expanded.id}/generate-image`, {
        prompt: modalGenPrompt,
        url: modalPromptUrl.trim() || undefined,
        aspect_ratio: modalAspectRatio,
      });
      const b64 = data.image_base64 || null;
      if (b64) {
        const newH = [...modalImageHistory, b64];
        setModalImageHistory(newH); setModalCurrentImageIdx(newH.length - 1);
        setModalImageGenCount(c => c + 1);
      }
    } catch (e: any) { alert(e?.response?.data?.detail || "Ошибка генерации"); }
    finally { setEditingModalImg(false); clearInterval(timer); }
  };

  const editImageFromModalSlots = async () => {
    if (!expanded || !modalEditInstruction.trim() || modalEditFilled.length === 0 || modalEditAttemptCount >= 3) return;
    setEditingModalImg(true);
    try {
      const baseImage = modalEditFilled[0];
      const refImages = [...modalEditFilled.slice(1), ...Array.from(modalEditBrandRefs.values())];
      const { data: taskData } = await api.post(`/post-creator/${businessId}/edit-image`, {
        base_image: baseImage,
        reference_images: refImages.length > 0 ? refImages : undefined,
        instruction_ru: modalEditInstruction,
      });
      const b64 = await pollModalImageTask(taskData.task_id);
      const newH = [...modalImageHistory, b64];
      setModalImageHistory(newH); setModalCurrentImageIdx(newH.length - 1);
      setModalEditAttemptCount(c => c + 1);
      setModalEditInstruction("");
    } catch (e: any) { alert(e?.response?.data?.detail || "Ошибка редактирования"); }
    finally { setEditingModalImg(false); }
  };

  const editImageModalInline = async () => {
    if (!expanded || !modalInlineEditInstruction.trim() || !modalAiImageB64 || modalInlineEditCount >= 3) return;
    setEditingModalImg(true);
    try {
      const { data: taskData } = await api.post(`/post-creator/${businessId}/edit-image`, {
        base_image: { data: modalAiImageB64, mime: "image/png" },
        instruction_ru: modalInlineEditInstruction,
      });
      const b64 = await pollModalImageTask(taskData.task_id);
      const newH = [...modalImageHistory, b64];
      setModalImageHistory(newH); setModalCurrentImageIdx(newH.length - 1);
      setModalInlineEditCount(c => c + 1);
      setModalInlineEditInstruction(""); setModalShowInlineEdit(false);
    } catch (e: any) { alert(e?.response?.data?.detail || "Ошибка редактирования"); }
    finally { setEditingModalImg(false); }
  };

  // ── Modal edit slot handlers ───────────────────────────────────────────────

  const onModalEditSlotClick = (idx: number) => {
    modalEditActiveSlotRef.current = idx;
    modalEditSlotInputRef.current?.click();
  };

  const onModalEditSlotFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    const newSlots = [...modalEditSlots];
    let startIdx = modalEditActiveSlotRef.current >= 0 ? modalEditActiveSlotRef.current : 0;
    for (const file of files) {
      while (startIdx < 10 && newSlots[startIdx] !== null) startIdx++;
      if (startIdx >= 10) break;
      newSlots[startIdx] = await readFileAsBase64Modal(file);
      startIdx++;
    }
    setModalEditSlots(newSlots);
    modalEditActiveSlotRef.current = -1;
    e.target.value = "";
  };

  const removeModalEditSlot = (idx: number) => {
    setModalEditSlots(prev => { const n = [...prev]; n[idx] = null; return n; });
  };

  const reorderModalEditSlots = (from: number, to: number) => {
    setModalEditSlots(prev => { const n = [...prev]; [n[from], n[to]] = [n[to], n[from]]; return n; });
  };

  const onModalEditFileDrop = async (startIdx: number, files: File[]) => {
    const newSlots = [...modalEditSlots];
    let idx = startIdx;
    for (const file of files) {
      while (idx < 10 && newSlots[idx] !== null) idx++;
      if (idx >= 10) break;
      newSlots[idx] = await readFileAsBase64Modal(file);
      idx++;
    }
    setModalEditSlots(newSlots);
  };

  // ── Modal video handlers ───────────────────────────────────────────────────

  const addModalVideoFiles = async (files: File[], startIdx = -1) => {
    const newFiles = [...modalVideoFiles];
    const newUrls  = [...modalVideoPreviewUrls];
    const hadFirst = newFiles[0] !== null;
    let idx = startIdx >= 0 ? startIdx : 0;
    for (const file of files) {
      while (idx < 3 && newFiles[idx] !== null) idx++;
      if (idx >= 3) break;
      if (newUrls[idx]) URL.revokeObjectURL(newUrls[idx]!);
      newFiles[idx] = file;
      newUrls[idx]  = URL.createObjectURL(file);
      idx++;
    }
    setModalVideoFiles(newFiles);
    setModalVideoPreviewUrls(newUrls);
    if (!hadFirst && newUrls[0]) {
      const dataUrl = await extractVideoFrameModal(newUrls[0]);
      if (dataUrl) {
        setModalVideoCoverAutoDataUrl(dataUrl);
        if (modalVideoCoverSource === null || modalVideoCoverSource === "auto") {
          setModalVideoCoverDataUrl(dataUrl); setModalVideoCoverSource("auto");
        }
      }
    }
  };

  const removeModalVideoFile = (idx: number) => {
    const newFiles = [...modalVideoFiles];
    const newUrls  = [...modalVideoPreviewUrls];
    if (newUrls[idx]) URL.revokeObjectURL(newUrls[idx]!);
    newFiles[idx] = null; newUrls[idx] = null;
    setModalVideoFiles(newFiles); setModalVideoPreviewUrls(newUrls);
    if (idx === 0) {
      setModalVideoCoverAutoDataUrl(null);
      if (modalVideoCoverSource === "auto") { setModalVideoCoverDataUrl(null); setModalVideoCoverSource(null); }
    }
  };

  const generateModalVideoCover = async () => {
    if (!modalVideoCoverPrompt.trim()) return;
    setModalLoadingVideoCover(true);
    try {
      let b64: string;
      if (modalVideoCoverAutoDataUrl) {
        const baseData = modalVideoCoverAutoDataUrl.split(",")[1];
        const refs = modalVideoCoverRefPhoto ? [modalVideoCoverRefPhoto] : [];
        const { data: taskData } = await api.post(`/post-creator/${businessId}/edit-image`, {
          base_image: { data: baseData, mime: "image/jpeg" },
          reference_images: refs.length > 0 ? refs : undefined,
          instruction_ru: modalVideoCoverPrompt.trim(),
        });
        b64 = await pollModalImageTask(taskData.task_id);
      } else {
        const { data: taskData } = await api.post(`/post-creator/${businessId}/generate-image`, {
          prompt_ru: modalVideoCoverPrompt.trim(), aspect_ratio: "16:9",
        });
        b64 = await pollModalImageTask(taskData.task_id);
      }
      setModalVideoCoverDataUrl(`data:image/png;base64,${b64}`);
      setModalVideoCoverSource("ai"); setModalShowVideoCoverPrompt(false);
    } catch (e: any) {
      alert("Ошибка генерации обложки: " + (e?.message || "попробуйте ещё раз"));
    } finally { setModalLoadingVideoCover(false); }
  };

  const onModalVideoCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const { data, mime } = await readFileAsBase64Modal(f);
    setModalVideoCoverDataUrl(`data:${mime};base64,${data}`);
    setModalVideoCoverSource("upload"); e.target.value = "";
  };

  const onModalVideoCoverRefPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const slot = await readFileAsBase64Modal(f);
    setModalVideoCoverRefPhoto(slot); e.target.value = "";
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
      const statusOk = filter === "all"
        || (filter === "needs_info_group" && NEEDS_INFO_STATUSES.includes(s.status))
        || s.status === filter;
      const platOk = platformFilter === "all" || s.platform === platformFilter;
      return statusOk && platOk;
    });

  // Показываем все слоты, кроме голых "planned" без идеи
  const filtered = applyFilters(slots).filter(s =>
    s.post_text || s.status === "needs_info" || s.status === "pending_approval" ||
    s.status === "content_ready" || s.status === "published" || s.status === "failed" ||
    (s.status === "idea_ready" && s.idea)
  );

  const generatingCount = slots.filter(s => s.status === "planned" || s.status === "idea_ready").length;
  const modalUploadFilled = modalUploadSlots.filter((s): s is ModalUploadSlot => s !== null);
  const modalEditFilled   = modalEditSlots.filter((s): s is ModalUploadSlot => s !== null);
  const modalAiImageB64   = modalCurrentImageIdx >= 0 ? modalImageHistory[modalCurrentImageIdx] : "";

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
    <div style={{ minHeight: "100vh", background: "#F5F7FA", fontFamily: "'Inter', sans-serif" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {/* ── Header ── */}
      {!isMobile ? (
        <div style={{ background: "#fff", borderBottom: "1px solid #E8E6E0", padding: "0 2rem" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center",
            justifyContent: "space-between", height: 64 }}>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 700, color: "#0D1B2A", margin: 0 }}>Контент-план</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {generatingPlan ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px",
                  background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 20,
                  fontSize: 13, color: "#1D4ED8", fontWeight: 600 }}>
                  <span style={{ width: 14, height: 14, border: "2px solid #93C5FD",
                    borderTopColor: "#1D4ED8", borderRadius: "50%",
                    animation: "spin 0.9s linear infinite", display: "inline-block", flexShrink: 0 }} />
                  Генерирую новый план... обычно 1–3 минуты
                </div>
              ) : strategyUpdated && (
                <button onClick={reloadPlan} disabled={reloading}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px",
                    background: "#3478F6", color: "#fff", border: "none", borderRadius: 20,
                    cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  <span style={{ fontSize: 16 }}>🔄</span>
                  {reloading ? "Запускаю..." : "Обновить план под новую стратегию"}
                </button>
              )}
              <div style={{ display: "flex", gap: 20, fontSize: 13, color: "#666", alignItems: "center" }}>
                {generatingCount > 0 && (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 12, height: 12, border: "2px solid #bbb",
                      borderTopColor: "#3478F6", borderRadius: "50%",
                      animation: "spin 1s linear infinite", display: "inline-block" }} />
                    Генерируется: <strong style={{ color: "#3478F6" }}>{generatingCount}</strong>
                  </span>
                )}
                {stats.needsInfo > 0 && (
                  <span>Нужна инфо: <strong style={{ color: "#8B3200" }}>{stats.needsInfo}</strong></span>
                )}
                {stats.pending > 0 && (
                  <span>На согласовании: <strong style={{ color: "#7C4400" }}>{stats.pending}</strong></span>
                )}
                <span>Готово: <strong style={{ color: "#00B5A6" }}>{stats.ready}</strong></span>
                <span>Опубликовано: <strong style={{ color: "#3478F6" }}>{stats.published}</strong></span>
                <span>Всего: <strong>{stats.total}</strong></span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderBottom: "1px solid #F3F4F6", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <h1 style={{ fontFamily: "'Manrope', sans-serif", fontSize: 17, fontWeight: 700, color: "#0D1B2A", margin: 0 }}>Контент-план</h1>
            {generatingPlan ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
                background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10,
                fontSize: 11, color: "#1D4ED8", fontWeight: 600 }}>
                <span style={{ width: 10, height: 10, border: "2px solid #93C5FD",
                  borderTopColor: "#1D4ED8", borderRadius: "50%",
                  animation: "spin 0.9s linear infinite", display: "inline-block" }} />
                Генерирую...
              </div>
            ) : strategyUpdated && (
              <button onClick={reloadPlan} disabled={reloading}
                style={{ padding: "6px 12px", background: "#3478F6", color: "#fff",
                  border: "none", borderRadius: 10, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                {reloading ? "..." : "🔄 Обновить"}
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#666" }}>
            {generatingCount > 0 && <span style={{ color: "#3478F6", fontWeight: 600 }}>⟳ {generatingCount}</span>}
            {stats.needsInfo > 0 && <span style={{ color: "#8B3200" }}>⚠ {stats.needsInfo}</span>}
            <span style={{ color: "#6B7280" }}>Готово: {stats.ready}</span>
            <span style={{ color: "#6B7280" }}>Всего: {stats.total}</span>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "10px 12px" : "2rem" }}>

        {/* ── Filters + view toggle ── */}
        <div id="tour-content-plan" style={{ display: "flex", gap: isMobile ? 6 : 8, marginBottom: isMobile ? 12 : 24, flexWrap: "wrap", alignItems: "center" }}>
          {([
            { key: "all",               label: isMobile ? "Все" : "Все" },
            { key: "needs_info_group",  label: isMobile ? "⚠ Инфо" : "Нужна информация" },
            { key: "pending_approval",  label: isMobile ? "🔵 Согл." : "Согласование" },
            { key: "content_ready",     label: isMobile ? "✓ Готово" : "Готово" },
            { key: "published",         label: isMobile ? "📢" : "Опубликовано" },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              style={{ padding: isMobile ? "5px 10px" : "6px 14px", borderRadius: 20, border: "1px solid",
                cursor: "pointer", fontSize: isMobile ? 11 : 13, fontWeight: 500,
                borderColor: filter === key ? "#0D1B2A" : "#E5E7EB",
                background:  filter === key ? "#0D1B2A" : "#fff",
                color:       filter === key ? "#fff"    : "#555" }}>
              {label}
            </button>
          ))}
          {!isMobile && (
            <>
              <div style={{ width: 1, background: "#E5E7EB", margin: "0 4px" }} />
              {["all", "telegram", "vk"].map(p => (
                <button key={p} onClick={() => setPlatformFilter(p)}
                  style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid",
                    cursor: "pointer", fontSize: 13, fontWeight: 500,
                    borderColor: platformFilter === p ? "#3478F6" : "#E5E7EB",
                    background:  platformFilter === p ? "#EEEDFE" : "#fff",
                    color:       platformFilter === p ? "#3478F6" : "#555" }}>
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
                      color:      viewMode === mode ? "#0D1B2A" : "#777",
                      boxShadow:  viewMode === mode ? "0 1px 3px rgba(0,0,0,.12)" : "none",
                      transition: "all .15s" }}>
                    {mode === "list" ? "≡ Список" : "⊞ Календарь"}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── List view ── */}
        {viewMode === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(slot => {
              const st = STATUS_CONFIG[slot.status] || STATUS_CONFIG.planned;
              const date = new Date(slot.scheduled_at);
              const isGenerating = !slot.post_text && !slot.idea && slot.status !== "needs_info";
              const isEvent = !!slot.event_id;
              const hasImage = !!(slot.image_url || slot.image_base64);
              const imgSrc = slot.image_url || (slot.image_base64 ? `data:image/png;base64,${slot.image_base64}` : null);
              const platCfg = PLATFORM_COLORS[slot.platform] || { bg: "#F1EFE8", border: "#bbb" };
              return (
                <div key={slot.id} style={{
                  background: isEvent ? "#FFF0F5" : "#fff",
                  borderRadius: 14,
                  border: isEvent ? "1.5px solid #F4A7C3" : "1px solid #E5E7EB",
                  borderLeft: isEvent ? "4px solid #E91E8C" : "1px solid #E5E7EB",
                  overflow: "hidden",
                }}>

                  {/* Header */}
                  <div style={{ padding: "11px 18px", display: "flex", alignItems: "center",
                    gap: 8, borderBottom: isEvent ? "1px solid #F4A7C3" : "1px solid #F2F0EC",
                    background: isEvent ? "#FCE4EF" : "transparent" }}>
                    {/* Событие-бейдж или платформа */}
                    {isEvent ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff",
                          background: "#E91E8C", padding: "2px 9px", borderRadius: 6, letterSpacing: 0.3 }}>
                          Событие
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: platCfg.border,
                          background: platCfg.bg || "#F1EFE8", padding: "2px 7px", borderRadius: 6, letterSpacing: 0.3 }}>
                          {PLATFORM_ICON[slot.platform] || slot.platform.toUpperCase()}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#fff",
                        background: platCfg.border, padding: "2px 8px", borderRadius: 6,
                        letterSpacing: 0.3, flexShrink: 0 }}>
                        {PLATFORM_ICON[slot.platform] || slot.platform.toUpperCase()}
                      </span>
                    )}
                    <span style={{ fontSize: 13, color: "#555", fontWeight: 500, flex: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {slot.rubric_name}
                    </span>
                    <span style={{ fontSize: 12, color: "#999", flexShrink: 0 }}>
                      {date.getDate()} {MONTHS[date.getMonth()]} · {String(date.getHours()).padStart(2,"0")}:{String(date.getMinutes()).padStart(2,"0")}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px",
                      borderRadius: 20, color: st.color, background: st.bg, flexShrink: 0 }}>{st.label}</span>
                  </div>

                  {/* Body */}
                  <div style={{ display: "flex", gap: 0, flexDirection: isMobile ? "column" : "row" }}>
                    <div style={{ flex: 1, padding: isMobile ? "10px 14px 12px" : "14px 18px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

                      {/* Блок: Идея */}
                      {slot.idea && (slot.idea.idea || slot.idea.hook) && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#888",
                            textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Идея</div>
                          {slot.idea.idea && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0D1B2A", lineHeight: 1.4 }}>
                              {slot.idea.idea}
                            </div>
                          )}
                          {slot.idea.hook && (
                            <div style={{ fontSize: 12, color: "#888", fontStyle: "italic", marginTop: 2 }}>
                              {slot.idea.hook}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Нужна информация */}
                      {slot.needs_info_for && slot.needs_info_for.length > 0 && (
                        <div style={{ padding: "7px 11px", background: "#FFF8ED",
                          borderRadius: 8, border: "1px solid #FFD699" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#7C4400",
                            textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
                            Требуется информация
                          </div>
                          {slot.needs_info_for.map((q, i) => (
                            <div key={i} style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>
                              {i + 1}. {q}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Блок: Текст */}
                      {slot.post_text ? (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#888",
                            textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Текст</div>
                          <p style={{ fontSize: 13, lineHeight: 1.7, color: "#2a2a2a",
                            margin: 0, whiteSpace: "pre-wrap",
                            display: "-webkit-box", WebkitLineClamp: 4,
                            WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
                            {slot.post_text}
                          </p>
                        </div>
                      ) : isGenerating ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#888" }}>
                          <div style={{ width: 14, height: 14, border: "2px solid #bbb",
                            borderTopColor: "#3478F6", borderRadius: "50%",
                            animation: "spin 1s linear infinite", flexShrink: 0 }} />
                          <span style={{ fontSize: 12 }}>Генерирую текст поста...</span>
                        </div>
                      ) : null}

                      {/* Кнопка */}
                      <div>
                        <button onClick={() => openSlot(slot)}
                          style={{ padding: "6px 14px", background: "#F1EFE8", color: "#444",
                            border: "1px solid #E5E7EB", borderRadius: 8, cursor: "pointer",
                            fontSize: 12, fontWeight: 500 }}>
                          ✏️ Редактировать
                        </button>
                      </div>
                    </div>

                    {/* Превью изображения */}
                    {!isMobile && (
                      <div style={{ width: 120, flexShrink: 0, padding: "14px 14px 14px 0",
                        display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
                        {hasImage ? (
                          <img src={imgSrc!} alt="preview"
                            onClick={() => openSlot(slot)}
                            style={{ width: 106, height: 106, objectFit: "cover",
                              borderRadius: 10, cursor: "pointer", border: "1px solid #E5E7EB" }} />
                        ) : (
                          <div onClick={() => openSlot(slot)}
                            style={{ width: 106, height: 106, borderRadius: 10, border: "2px dashed #E5E7EB",
                              display: "flex", flexDirection: "column", alignItems: "center",
                              justifyContent: "center", gap: 4, cursor: "pointer", background: "#FAFAF8" }}>
                            <span style={{ fontSize: 20, opacity: 0.35 }}>🖼</span>
                            <span style={{ fontSize: 9, color: "#bbb", textAlign: "center",
                              lineHeight: 1.3 }}>Нет<br/>изображения</span>
                          </div>
                        )}
                      </div>
                    )}
                    {isMobile && hasImage && (
                      <div style={{ padding: "0 14px 12px" }}>
                        <img src={imgSrc!} alt="preview"
                          onClick={() => openSlot(slot)}
                          style={{ width: "100%", maxHeight: 140, objectFit: "cover",
                            borderRadius: 10, cursor: "pointer", border: "1px solid #E5E7EB" }} />
                      </div>
                    )}
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
                style={{ padding: "7px 14px", background: "#fff", border: "1px solid #E5E7EB",
                  borderRadius: 8, cursor: "pointer", fontSize: 16, color: "#444" }}>←</button>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#0D1B2A", minWidth: 220, textAlign: "center" }}>
                {calTitle}
              </span>
              <button onClick={() => navCal(1)}
                style={{ padding: "7px 14px", background: "#fff", border: "1px solid #E5E7EB",
                  borderRadius: 8, cursor: "pointer", fontSize: 16, color: "#444" }}>→</button>
              <button onClick={() => setCalDate(new Date())}
                style={{ padding: "7px 14px", background: "#F1EFE8", border: "1px solid #E5E7EB",
                  borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#555" }}>Сегодня</button>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", background: "#F1EFE8", borderRadius: 10, padding: 3, gap: 2 }}>
                {(["month", "week"] as const).map(m => (
                  <button key={m} onClick={() => setCalMode(m)}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                      fontSize: 13, fontWeight: 500,
                      background: calMode === m ? "#fff" : "transparent",
                      color:      calMode === m ? "#0D1B2A" : "#777",
                      boxShadow:  calMode === m ? "0 1px 3px rgba(0,0,0,.12)" : "none" }}>
                    {m === "month" ? "Месяц" : "Неделя"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #E5E7EB" }}>
                {DAYS_SHORT.map((d, i) => (
                  <div key={d} style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600,
                    color: i >= 5 ? "#888" : "#555", textAlign: "center",
                    borderRight: i < 6 ? "1px solid #E5E7EB" : "none" }}>{d}</div>
                ))}
              </div>

              {calWeeks.map((week, wi) => (
                <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
                  borderBottom: wi < calWeeks.length - 1 ? "1px solid #E5E7EB" : "none" }}>
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
                        borderRight: di < 6 ? "1px solid #E5E7EB" : "none",
                        background: isDragTarget ? "#F0EDFE" : inCurrentMonth ? "#fff" : "#F9F8F6",
                        transition: "background .1s", position: "relative", minWidth: 0, overflow: "hidden",
                      }}
                        onDragOver={e => { e.preventDefault(); setDragOverKey(key); }}
                        onDragLeave={() => setDragOverKey(null)}
                        onDrop={e => { e.preventDefault(); setDragOverKey(null); if (draggingId) moveSlot(draggingId, day); setDraggingId(null); }}
                      >
                        <div style={{ marginBottom: 6, display: "flex", justifyContent: "space-evenly", alignItems: "center" }}>
                          <button
                            title="Добавить событие"
                            onClick={e => { e.stopPropagation(); openEventModal(); }}
                            style={{ width: 11, height: 11, borderRadius: "50%", border: "none",
                              background: "#FF2D78", position: "relative",
                              cursor: "pointer", padding: 0,
                              opacity: 0.3, transition: "opacity .15s", flexShrink: 0 }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={e => (e.currentTarget.style.opacity = "0.3")}
                          >
                            <span style={{ position: "absolute", top: "50%", left: "50%",
                              transform: "translate(-50%, -50%)", lineHeight: 1,
                              fontSize: 10, color: "rgba(255,255,255,0.9)", fontWeight: 400,
                              userSelect: "none" }}>+</span>
                          </button>

                          <span style={{ width: 30, height: 30, borderRadius: "50%", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: 14, fontWeight: isToday ? 700 : 400,
                            background: isToday ? "#3478F6" : "transparent",
                            color: isToday ? "#fff" : inCurrentMonth ? (di >= 5 ? "#aaa" : "#444") : "#ccc",
                          }}>{day.getDate()}</span>

                          <button
                            title="Быстрый пост"
                            onClick={e => {
                              e.stopPropagation();
                              const bid = localStorage.getItem("businessId");
                              if (bid) {
                                api.get(`/platforms/list/${bid}`)
                                  .then(({ data }) => setQuickPostPlatforms(
                                    (data || []).filter((p: any) => p.is_active)
                                      .map((p: any) => ({ platform: p.platform, page_name: p.page_name }))
                                  )).catch(() => {});
                              }
                              setQuickPostOpen(true);
                            }}
                            style={{ width: 11, height: 11, borderRadius: "50%", border: "none",
                              background: "#3B82F6", position: "relative",
                              cursor: "pointer", padding: 0,
                              opacity: 0.3, transition: "opacity .15s", flexShrink: 0 }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={e => (e.currentTarget.style.opacity = "0.3")}
                          >
                            <span style={{ position: "absolute", top: "50%", left: "50%",
                              transform: "translate(-50%, -50%)", lineHeight: 1,
                              fontSize: 10, color: "rgba(255,255,255,0.9)", fontWeight: 400,
                              userSelect: "none" }}>+</span>
                          </button>
                        </div>

                        {/* Событийные блоки (как в Outlook) */}
                        {calEvents.filter(ev => {
                          const s = new Date(ev.start_date); s.setHours(0,0,0,0);
                          const e = new Date(ev.end_date); e.setHours(23,59,59,999);
                          return day >= s && day <= e;
                        }).map(ev => {
                          const evStart = new Date(ev.start_date); evStart.setHours(0,0,0,0);
                          const evEnd = new Date(ev.end_date); evEnd.setHours(0,0,0,0);
                          const isStart = isSameDay(day, evStart);
                          const isEnd   = isSameDay(day, evEnd);
                          return (
                            <div key={ev.id} title={ev.name}
                              onClick={e => { e.stopPropagation(); openEventForEdit(ev); }}
                              style={{
                              background: ev.status === "completed" ? "#C2185B" : "#E91E8C",
                              color: "#fff", fontSize: 10, fontWeight: 600,
                              padding: "2px 6px", marginBottom: 3,
                              borderRadius: isStart && isEnd ? 4 : isStart ? "4px 0 0 4px" : isEnd ? "0 4px 4px 0" : 0,
                              marginLeft: isStart ? 0 : -8,
                              marginRight: isEnd ? 0 : -8,
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                              cursor: "pointer",
                            }}>
                              {isStart ? ev.name : ""}
                            </div>
                          );
                        })}

                        {daySlots.map(slot => {
                          const isEventSlot = !!slot.event_id;
                          const pc  = isEventSlot
                            ? { bg: "#FFF0F5", border: "#E91E8C" }
                            : (PLATFORM_COLORS[slot.platform] || { bg: "#F1EFE8", border: "#bbb" });
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
                                borderLeft: `3px solid ${isEventSlot ? "#E91E8C" : slot.status === "pending_approval" ? "#F59E0B" : slot.status === "needs_info" ? "#EA580C" : pc.border}`,
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
        const hasImage = !!(expanded.image_base64 || expanded.image_url) ||
                          modalUploadFilled.length > 0 ||
                          modalVideoFiles.some(Boolean) ||
                          modalAiImageSaved;
        const hasText  = !!modalText.trim();
        const allInfoDone = !expanded.needs_info_for ||
          (expanded.needs_info_for || []).every((q, i) => isMediaQuestion(q) || infoAnsweredFlags[i]);
        const canApprove  = hasText && hasImage && allInfoDone;
        // Динамический статус-бейдж в шапке модала
        const displaySt = (expanded.status === "content_ready" || expanded.status === "published")
          ? st
          : canApprove ? STATUS_CONFIG.pending_approval : st;
        const imgSrc = expanded.image_base64
          ? `data:image/png;base64,${expanded.image_base64}`
          : expanded.image_url || null;
        const inp13: React.CSSProperties = {
          width: "100%", padding: "9px 12px", border: "1.5px solid #E5E7EB",
          borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none",
          resize: "vertical" as const, boxSizing: "border-box" as const, background: "#fff",
        };
        const imgBtn = (active: boolean): React.CSSProperties => ({
          padding: "9px 14px", border: `1.5px solid ${active ? "#3478F6" : "#E5E7EB"}`,
          borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 500,
          background: active ? "#EEEDFE" : "#fff", color: active ? "#3478F6" : "#555",
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
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#0D1B2A", marginBottom: 4 }}>
                      {expanded.rubric_name}
                    </div>
                    {editingDate ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="datetime-local" value={modalDate} onChange={e => setModalDate(e.target.value)}
                          style={{ padding: "4px 8px", border: "1.5px solid #3478F6", borderRadius: 8,
                            fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                        <button onClick={saveModalDate} disabled={savingDate}
                          style={{ padding: "4px 12px", background: "#3478F6", color: "#fff",
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
                      color: displaySt.color, background: displaySt.bg }}>{displaySt.label}</span>
                    <button onClick={closeModal}
                      style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #E5E7EB",
                        background: "#fff", cursor: "pointer", fontSize: 16, color: "#888",
                        display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                  </div>
                </div>
              </div>

              {/* ── Scrollable body ── */}
              <div style={{ overflowY: "auto", flex: 1, padding: isMobile ? "14px 16px" : "20px 28px" }}>

                {/* 1. Идея поста — всегда сверху */}
                {expanded.idea && (
                  <div style={{ background: "#F5F7FA", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
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

                {/* 2. Запрос информации */}
                {(() => {
                  const qs = localInfoQuestions.length > 0
                    ? localInfoQuestions
                    : (expanded.needs_info_for || []);
                  if (qs.length === 0) return null;
                  const hasUnfinishedText = qs.some((q, i) => !isMediaQuestion(q) && !infoAnsweredFlags[i]);
                  const hasUnfinishedMedia = qs.some(q => isMediaQuestion(q) && !hasImage);
                  if (!hasUnfinishedText && !hasUnfinishedMedia) return null;
                  return (
                    <div style={{ background: "#FFF8ED", borderRadius: 12, padding: "16px 18px",
                      marginBottom: 16, border: "1px solid #FFD699" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#7C4400" }}>
                          📋 Нужна информация для генерации поста
                        </div>
                        {hasUnfinishedText && (
                          <button onClick={() => regenerateQuestions(expanded)}
                            disabled={regeneratingQuestions || providingInfo}
                            title="Перегенерировать вопросы"
                            style={{ padding: "4px 10px", fontSize: 12, fontWeight: 600,
                              background: "none", border: "1px solid #FFB347", borderRadius: 8,
                              color: "#7C4400", cursor: (regeneratingQuestions || providingInfo) ? "not-allowed" : "pointer",
                              opacity: (regeneratingQuestions || providingInfo) ? 0.5 : 1 }}>
                            {regeneratingQuestions ? "Обновляю..." : "↻ Обновить"}
                          </button>
                        )}
                      </div>

                      {providingInfo ? (
                        <div style={{ padding: "14px 16px", background: "#FFF3E0", borderRadius: 10,
                          fontSize: 13, color: "#7C4400", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>⏳</span> Генерирую текст поста...
                        </div>
                      ) : (
                        <>
                          {hasUnfinishedText && (
                            <div style={{ fontSize: 13, color: "#8B5500", marginBottom: 14, lineHeight: 1.5 }}>
                              Ответьте — текст поста сгенерируется автоматически
                            </div>
                          )}
                          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                            {qs.map((question, i) => {
                              const isMedia = isMediaQuestion(question);
                              if (isMedia) {
                                if (hasImage) return null;
                                return (
                                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10,
                                    padding: "10px 14px", background: "#FFF3E0", borderRadius: 10,
                                    border: "1px solid #FFD580" }}>
                                    <span style={{ fontSize: 18, lineHeight: 1 }}>📎</span>
                                    <span style={{ fontSize: 13, color: "#7C4400", fontWeight: 600, lineHeight: 1.5 }}>
                                      Добавь фото или видео товара
                                      <span style={{ display: "block", fontSize: 12, fontWeight: 400, color: "#9A6000", marginTop: 3 }}>
                                        Загрузите в блоке «Изображение / Видео» ниже
                                      </span>
                                    </span>
                                  </div>
                                );
                              }
                              if (infoAnsweredFlags[i]) return null;
                              return (
                                <div key={i}>
                                  <label style={{ fontSize: 13, fontWeight: 600, color: "#444",
                                    display: "block", marginBottom: 6, lineHeight: 1.5 }}>
                                    {question}
                                  </label>
                                  <textarea value={infoAnswers[i] || ""} rows={2}
                                    onChange={e => { const next = [...infoAnswers]; next[i] = e.target.value; setInfoAnswers(next); }}
                                    placeholder="Ваш ответ..."
                                    style={{ ...inp13 }}
                                    onFocus={e => (e.target.style.borderColor = "#EA580C")}
                                    onBlur={e => (e.target.style.borderColor = "#E5E7EB")} />
                                  <div style={{ marginTop: 6 }}>
                                    <button
                                      onClick={() => {
                                        if (!infoAnswers[i]?.trim()) return;
                                        const nextFlags = [...infoAnsweredFlags];
                                        nextFlags[i] = true;
                                        setInfoAnsweredFlags(nextFlags);
                                        const allTextNowDone = qs.every((q, j) => isMediaQuestion(q) || nextFlags[j]);
                                        if (allTextNowDone && !providingInfo) provideInfo(expanded);
                                      }}
                                      disabled={!infoAnswers[i]?.trim()}
                                      style={{ padding: "7px 18px", fontSize: 13, fontWeight: 600,
                                        border: "none", borderRadius: 8,
                                        cursor: infoAnswers[i]?.trim() ? "pointer" : "not-allowed",
                                        background: infoAnswers[i]?.trim() ? "#EA580C" : "#E5E7EB",
                                        color: infoAnswers[i]?.trim() ? "#fff" : "#999" }}>
                                      Ответить
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* 3. Текст поста */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#999", marginBottom: 8,
                    textTransform: "uppercase", letterSpacing: .5 }}>Текст поста</div>
                  <textarea value={modalText} onChange={e => setModalText(e.target.value)}
                    style={{ width: "100%", minHeight: 280, padding: "12px 14px", fontSize: 14,
                      lineHeight: 1.75, border: "1.5px solid #E5E7EB", borderRadius: 10,
                      resize: "vertical", fontFamily: "inherit", outline: "none",
                      boxSizing: "border-box", color: "#2a2a2a", background: "#FAFAF8" }}
                    onFocus={e => (e.target.style.borderColor = "#3478F6")}
                    onBlur={e => (e.target.style.borderColor = "#E5E7EB")} />
                </div>

                {/* 4. Изображение / Видео */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#999", marginBottom: 12,
                    textTransform: "uppercase", letterSpacing: .5 }}>Изображение / Видео</div>

                  {/* 4 кнопки режима */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                    <button onClick={() => setModalImageMode(modalImageMode === "generate" ? null : "generate")}
                      style={imgBtn(modalImageMode === "generate")}>✨ Сгенерировать</button>
                    <button onClick={() => setModalImageMode(modalImageMode === "upload" ? null : "upload")}
                      style={imgBtn(modalImageMode === "upload")}>📁 Загрузить фото</button>
                    <button onClick={() => setModalImageMode(modalImageMode === "edit" ? null : "edit")}
                      style={imgBtn(modalImageMode === "edit")}>🖌 Редактировать</button>
                    <button onClick={() => setModalImageMode(modalImageMode === "video" ? null : "video")}
                      style={imgBtn(modalImageMode === "video")}>🎬 Загрузить видео</button>
                  </div>

                  {/* ── Генерация (3 попытки + история + 3 инлайн правки) ── */}
                  {modalImageMode === "generate" && (
                    <div style={{ background: "#F5F7FA", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>Промт для генерации</div>
                        {modalImageGenCount > 0 && (
                          <span style={{ fontSize: 11, color: modalImageGenCount >= 3 ? "#FF6B5E" : "#00B5A6",
                            background: (modalImageGenCount >= 3 ? "#FF6B5E" : "#00B5A6") + "15",
                            border: `1px solid ${(modalImageGenCount >= 3 ? "#FF6B5E" : "#00B5A6")}30`,
                            borderRadius: 12, padding: "2px 8px", fontWeight: 600 }}>
                            Генераций: {modalImageGenCount}/3
                          </span>
                        )}
                      </div>
                      {brandAssetsLabels.length > 0 && (
                        <div style={{ marginBottom: 10, padding: "10px 12px", background: "#FFF8F0", border: "1px solid #FED7AA", borderRadius: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#C2410C", marginBottom: 6 }}>Ссылаться на элементы фирменного стиля:</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {brandAssetsLabels.map((a, i) => {
                              const nm = a.label || a.name;
                              return (
                                <button key={i} onClick={() => setModalGenPrompt(p => p ? `${p}\nучитывай элемент фирменного стиля «${nm}»` : `учитывай элемент фирменного стиля «${nm}»`)}
                                  style={{ padding: "4px 10px", background: "#fff", border: "1.5px solid #FED7AA", borderRadius: 16, color: "#C2410C", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                  + {nm}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {expanded?.post_text && (
                        <div style={{ marginBottom: 8 }}>
                          <button onClick={() => setModalGenPrompt(p => p ? `${p}\n${expanded.post_text!.slice(0, 500)}` : expanded.post_text!.slice(0, 500))}
                            style={{ padding: "4px 12px", background: "#EFF6FF", border: "1.5px solid #BFDBFE", borderRadius: 16, color: "#1D4ED8", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                            + Текст поста
                          </button>
                        </div>
                      )}
                      <div style={{ marginBottom: 8 }}>
                        <input type="text" value={modalPromptUrl} onChange={e => setModalPromptUrl(e.target.value)}
                          placeholder="🔗 Ссылка на референс (стиль, пример изображения)..."
                          style={{ width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 12, outline: "none", boxSizing: "border-box", background: "#FAFAF8" }} />
                      </div>
                      <textarea value={modalGenPrompt} onChange={e => setModalGenPrompt(e.target.value)}
                        placeholder="Опишите желаемое изображение на русском или английском..."
                        style={{ ...inp13, minHeight: 80 }}
                        onFocus={e => (e.target.style.borderColor = "#3478F6")}
                        onBlur={e => (e.target.style.borderColor = "#E5E7EB")} />
                      <p style={{ margin: "6px 0 10px", fontSize: 11, color: "#aaa" }}>Можно писать на русском — модель понимает оба языка</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                        <span style={{ fontSize: 11, color: "#888", marginRight: 2 }}>Формат:</span>
                        {(["9:16", "1:1", "16:9"] as const).map(r => (
                          <button key={r} onClick={() => setModalAspectRatio(r)}
                            style={{ padding: "4px 10px", borderRadius: 6, border: `1.5px solid ${modalAspectRatio === r ? "#3478F6" : "#E5E7EB"}`,
                              background: modalAspectRatio === r ? "#EAF4FF" : "#fff",
                              color: modalAspectRatio === r ? "#3478F6" : "#666",
                              fontSize: 11, fontWeight: modalAspectRatio === r ? 700 : 400, cursor: "pointer" }}>
                            {r}
                          </button>
                        ))}
                      </div>
                      <button onClick={generateImageModal}
                        disabled={editingModalImg || !modalGenPrompt.trim() || modalImageGenCount >= 3}
                        style={{ padding: "9px 20px",
                          background: editingModalImg || !modalGenPrompt.trim() || modalImageGenCount >= 3 ? "#ccc" : "#3478F6",
                          color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                        {editingModalImg ? `Генерирую... ${modalImgElapsed}с` : modalAiImageB64 ? "🔄 Перегенерировать" : "✨ Сгенерировать"}
                      </button>
                      {modalImageGenCount >= 3 && <div style={{ marginTop: 6, fontSize: 12, color: "#FF6B5E" }}>Достигнут лимит генераций (3).</div>}

                      {/* Результат + история + инлайн правки */}
                      {(editingModalImg && !modalAiImageB64) && (
                        <div style={{ marginTop: 16, padding: 20, background: "#fff", borderRadius: 12, textAlign: "center", color: "#888" }}>
                          <div>⏳ Генерирую изображение...</div>
                          {modalImgElapsed > 0 && <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>Прошло: {modalImgElapsed}с — обычно 20–60 секунд</div>}
                        </div>
                      )}
                      {modalAiImageB64 && (
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #E8E6E0" }}>
                          {modalImageHistory.length > 1 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                              <button onClick={() => { setModalCurrentImageIdx(i => Math.max(0, i - 1)); setModalAiImageSaved(false); }} disabled={modalCurrentImageIdx <= 0}
                                style={{ padding: "4px 12px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff",
                                  cursor: modalCurrentImageIdx <= 0 ? "not-allowed" : "pointer", fontSize: 12, color: modalCurrentImageIdx <= 0 ? "#ccc" : "#555" }}>← Пред.</button>
                              <span style={{ fontSize: 12, color: "#888" }}>Версия {modalCurrentImageIdx + 1} из {modalImageHistory.length}</span>
                              <button onClick={() => { setModalCurrentImageIdx(i => Math.min(modalImageHistory.length - 1, i + 1)); setModalAiImageSaved(false); }} disabled={modalCurrentImageIdx >= modalImageHistory.length - 1}
                                style={{ padding: "4px 12px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff",
                                  cursor: modalCurrentImageIdx >= modalImageHistory.length - 1 ? "not-allowed" : "pointer", fontSize: 12, color: modalCurrentImageIdx >= modalImageHistory.length - 1 ? "#ccc" : "#555" }}>След. →</button>
                            </div>
                          )}
                          <img src={`data:image/png;base64,${modalAiImageB64}`} alt="generated"
                            style={{ width: "100%", height: "auto", borderRadius: 12, border: "1px solid #E5E7EB", display: "block" }} />

                          {/* Сохранить AI-изображение */}
                          <div style={{ marginTop: 10 }}>
                            {modalAiImageSaved ? (
                              <div style={{ padding: "8px 16px", background: "#E0F7F5", borderRadius: 10, fontSize: 13, color: "#00B5A6", fontWeight: 600 }}>
                                ✓ Изображение сохранено в пост
                              </div>
                            ) : (
                              <button onClick={saveModalAiImage} disabled={modalSaving}
                                style={{ padding: "8px 18px", background: "#3478F6", color: "#fff", border: "none",
                                  borderRadius: 10, cursor: modalSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: modalSaving ? 0.7 : 1 }}>
                                {modalSaving ? "Сохраняю..." : "💾 Использовать это изображение"}
                              </button>
                            )}
                          </div>

                          {/* Инлайн правки */}
                          <div style={{ marginTop: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#0D1B2A" }}>Редактировать результат</div>
                              {modalInlineEditCount > 0 && (
                                <span style={{ fontSize: 11, color: modalInlineEditCount >= 3 ? "#FF6B5E" : "#00B5A6",
                                  background: (modalInlineEditCount >= 3 ? "#FF6B5E" : "#00B5A6") + "15",
                                  border: `1px solid ${(modalInlineEditCount >= 3 ? "#FF6B5E" : "#00B5A6")}30`,
                                  borderRadius: 12, padding: "2px 8px", fontWeight: 600 }}>Правок: {modalInlineEditCount}/3</span>
                              )}
                            </div>
                            {!modalShowInlineEdit && modalInlineEditCount < 3 && (
                              <button onClick={() => setModalShowInlineEdit(true)}
                                style={{ padding: "7px 16px", background: "none", border: "1.5px solid #3478F6",
                                  borderRadius: 10, color: "#3478F6", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✏️ Внести правки</button>
                            )}
                            {modalShowInlineEdit && (
                              <>
                                <textarea value={modalInlineEditInstruction} onChange={e => setModalInlineEditInstruction(e.target.value)}
                                  placeholder="Например: измени фон на белый, добавь тёплые цвета..."
                                  style={{ ...inp13, minHeight: 70 }}
                                  onFocus={e => (e.target.style.borderColor = "#3478F6")}
                                  onBlur={e => (e.target.style.borderColor = "#E5E7EB")} />
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                  <button onClick={editImageModalInline}
                                    disabled={!modalInlineEditInstruction.trim() || editingModalImg || modalInlineEditCount >= 3}
                                    style={{ padding: "7px 14px", background: (!modalInlineEditInstruction.trim() || editingModalImg || modalInlineEditCount >= 3) ? "#ccc" : "#3478F6",
                                      color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                    {editingModalImg ? "Обновляю..." : "Применить"}
                                  </button>
                                  <button onClick={() => { setModalShowInlineEdit(false); setModalInlineEditInstruction(""); }}
                                    style={{ padding: "7px 12px", background: "none", border: "1px solid #E5E7EB", borderRadius: 8, cursor: "pointer", fontSize: 12, color: "#666" }}>Отмена</button>
                                </div>
                              </>
                            )}
                            {modalInlineEditCount >= 3 && <div style={{ fontSize: 12, color: "#FF6B5E", marginTop: 6 }}>Достигнут лимит правок (3).</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Загрузка фото (10 слотов, 5×2) ── */}
                  {modalImageMode === "upload" && (
                    <div
                      style={{ background: "#F5F7FA", borderRadius: 12, padding: 14, marginBottom: 12 }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
                        if (files.length) onModalFileDrop(0, files);
                      }}
                    >
                      <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px" }}>
                        Нажмите на ячейку, чтобы добавить фото (можно выбрать сразу несколько). Или перетащите прямо из папки.
                        {modalUploadFilled.length > 1 && <span style={{ color: "#3478F6", fontWeight: 600 }}> Загружено {modalUploadFilled.length} — будет альбом.</span>}
                      </p>
                      <ModalUploadGrid slots={modalUploadSlots} onSlotClick={onModalSlotClick}
                        onRemove={removeModalUploadSlot} onReorder={reorderModalUploadSlots} onFileDrop={onModalFileDrop} />
                      <input ref={modalSlotInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onModalSlotFileChange} />
                      <div style={{ marginTop: 8, fontSize: 12, color: "#aaa" }}>Можно добавить до 10 изображений</div>
                      {modalUploadFilled.length > 0 && (
                        <ModalUploadCarousel slots={modalUploadSlots} carouselIdx={modalUploadCarouselIdx} setCarouselIdx={setModalUploadCarouselIdx} />
                      )}
                    </div>
                  )}

                  {/* ── Редактирование (10 слотов + инструкция + результат с 3 инлайн правками) ── */}
                  {modalImageMode === "edit" && (
                    <div
                      style={{ background: "#F5F7FA", borderRadius: 12, padding: 14, marginBottom: 12 }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
                        if (files.length) onModalEditFileDrop(0, files);
                      }}
                    >
                      <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px" }}>
                        Загрузите до 10 фото — первое будет основным, остальные — референсы для ИИ. Нажмите на ячейку или перетащите из папки.
                      </p>
                      <ModalUploadGrid slots={modalEditSlots} onSlotClick={onModalEditSlotClick}
                        onRemove={removeModalEditSlot} onReorder={reorderModalEditSlots} onFileDrop={onModalEditFileDrop} />
                      <input ref={modalEditSlotInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onModalEditSlotFileChange} />
                      {modalEditFilled.length > 1 && (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#3478F6", fontWeight: 600 }}>
                          Первое фото — основное, {modalEditFilled.length - 1} {modalEditFilled.length === 2 ? "остальное" : "остальных"} — референс{modalEditFilled.length === 2 ? "" : "ы"} для ИИ
                        </div>
                      )}
                      <div style={{ marginTop: 14, fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 6 }}>Инструкция по редактированию</div>
                      {modalEditAttemptCount > 0 && (
                        <span style={{ fontSize: 11, color: modalEditAttemptCount >= 3 ? "#FF6B5E" : "#00B5A6",
                          background: (modalEditAttemptCount >= 3 ? "#FF6B5E" : "#00B5A6") + "15",
                          border: `1px solid ${(modalEditAttemptCount >= 3 ? "#FF6B5E" : "#00B5A6")}30`,
                          borderRadius: 12, padding: "2px 8px", fontWeight: 600, display: "inline-block", marginBottom: 8 }}>Правок: {modalEditAttemptCount}/3</span>
                      )}
                      {brandAssetsLabels.length > 0 && (
                        <div style={{ marginBottom: 10, padding: "10px 12px", background: "#FFF8F0", border: "1px solid #FED7AA", borderRadius: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#C2410C", marginBottom: 4 }}>Фирменный стиль — референс для изображения:</div>
                          <div style={{ fontSize: 11, color: "#92400E", marginBottom: 6 }}>Выберите — ИИ учтёт визуальный стиль при редактировании</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {brandAssetsLabels.map((a, i) => {
                              const nm = a.label || a.name;
                              const selected = modalEditBrandRefs.has(i);
                              const hasData = !!a.data;
                              return (
                                <button key={i} onClick={() => toggleModalEditBrandRef(i, a)}
                                  style={{ padding: "4px 10px", borderRadius: 16, cursor: hasData ? "pointer" : "default",
                                    fontSize: 11, fontWeight: 600, opacity: hasData ? 1 : 0.5,
                                    background: selected ? "#C2410C" : "#fff",
                                    color: selected ? "#fff" : (hasData ? "#C2410C" : "#aaa"),
                                    border: `1.5px solid ${selected ? "#C2410C" : (hasData ? "#FED7AA" : "#E5E7EB")}` }}>
                                  {selected ? "✓ " : "+ "}{nm}
                                </button>
                              );
                            })}
                          </div>
                          {modalEditBrandRefs.size > 0 && (
                            <div style={{ marginTop: 6, fontSize: 11, color: "#92400E", fontWeight: 600 }}>
                              ✓ {modalEditBrandRefs.size} референс{modalEditBrandRefs.size > 1 ? "а" : ""} будут переданы
                            </div>
                          )}
                        </div>
                      )}
                      <textarea value={modalEditInstruction} onChange={e => setModalEditInstruction(e.target.value)}
                        placeholder="Например: замени фон на белый, добавь тёплые цвета, сохрани общую композицию..."
                        style={{ ...inp13, minHeight: 70 }}
                        onFocus={e => (e.target.style.borderColor = "#3478F6")}
                        onBlur={e => (e.target.style.borderColor = "#E5E7EB")} />
                      <button onClick={editImageFromModalSlots}
                        disabled={editingModalImg || !modalEditInstruction.trim() || modalEditFilled.length === 0 || modalEditAttemptCount >= 3}
                        style={{ marginTop: 10, padding: "9px 20px",
                          background: editingModalImg || !modalEditInstruction.trim() || modalEditFilled.length === 0 || modalEditAttemptCount >= 3 ? "#ccc" : "#3478F6",
                          color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                        {editingModalImg ? "Редактирую..." : "🖌 Редактировать фото"}
                      </button>
                      {modalEditAttemptCount >= 3 && <div style={{ marginTop: 6, fontSize: 12, color: "#FF6B5E" }}>Достигнут лимит правок (3).</div>}

                      {/* Результат редактирования + инлайн правки */}
                      {(editingModalImg && !modalAiImageB64) && (
                        <div style={{ marginTop: 16, padding: 20, background: "#fff", borderRadius: 12, textAlign: "center", color: "#888" }}>⏳ Обрабатываю изображение...</div>
                      )}
                      {modalAiImageB64 && (
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #E8E6E0" }}>
                          {modalImageHistory.length > 1 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                              <button onClick={() => { setModalCurrentImageIdx(i => Math.max(0, i - 1)); setModalAiImageSaved(false); }} disabled={modalCurrentImageIdx <= 0}
                                style={{ padding: "4px 12px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff",
                                  cursor: modalCurrentImageIdx <= 0 ? "not-allowed" : "pointer", fontSize: 12, color: modalCurrentImageIdx <= 0 ? "#ccc" : "#555" }}>← Пред.</button>
                              <span style={{ fontSize: 12, color: "#888" }}>Версия {modalCurrentImageIdx + 1} из {modalImageHistory.length}</span>
                              <button onClick={() => { setModalCurrentImageIdx(i => Math.min(modalImageHistory.length - 1, i + 1)); setModalAiImageSaved(false); }} disabled={modalCurrentImageIdx >= modalImageHistory.length - 1}
                                style={{ padding: "4px 12px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff",
                                  cursor: modalCurrentImageIdx >= modalImageHistory.length - 1 ? "not-allowed" : "pointer", fontSize: 12, color: modalCurrentImageIdx >= modalImageHistory.length - 1 ? "#ccc" : "#555" }}>След. →</button>
                            </div>
                          )}
                          <img src={`data:image/png;base64,${modalAiImageB64}`} alt="edited"
                            style={{ width: "100%", height: "auto", borderRadius: 12, border: "1px solid #E5E7EB", display: "block" }} />

                          {/* Сохранить AI-изображение */}
                          <div style={{ marginTop: 10 }}>
                            {modalAiImageSaved ? (
                              <div style={{ padding: "8px 16px", background: "#E0F7F5", borderRadius: 10, fontSize: 13, color: "#00B5A6", fontWeight: 600 }}>
                                ✓ Изображение сохранено в пост
                              </div>
                            ) : (
                              <button onClick={saveModalAiImage} disabled={modalSaving}
                                style={{ padding: "8px 18px", background: "#3478F6", color: "#fff", border: "none",
                                  borderRadius: 10, cursor: modalSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: modalSaving ? 0.7 : 1 }}>
                                {modalSaving ? "Сохраняю..." : "💾 Использовать это изображение"}
                              </button>
                            )}
                          </div>

                          <div style={{ marginTop: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#0D1B2A" }}>Редактировать результат</div>
                              {modalInlineEditCount > 0 && (
                                <span style={{ fontSize: 11, color: modalInlineEditCount >= 3 ? "#FF6B5E" : "#00B5A6",
                                  background: (modalInlineEditCount >= 3 ? "#FF6B5E" : "#00B5A6") + "15",
                                  border: `1px solid ${(modalInlineEditCount >= 3 ? "#FF6B5E" : "#00B5A6")}30`,
                                  borderRadius: 12, padding: "2px 8px", fontWeight: 600 }}>Правок: {modalInlineEditCount}/3</span>
                              )}
                            </div>
                            {!modalShowInlineEdit && modalInlineEditCount < 3 && (
                              <button onClick={() => setModalShowInlineEdit(true)}
                                style={{ padding: "7px 16px", background: "none", border: "1.5px solid #3478F6",
                                  borderRadius: 10, color: "#3478F6", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✏️ Внести правки</button>
                            )}
                            {modalShowInlineEdit && (
                              <>
                                <textarea value={modalInlineEditInstruction} onChange={e => setModalInlineEditInstruction(e.target.value)}
                                  placeholder="Например: измени фон на белый, добавь тёплые цвета..."
                                  style={{ ...inp13, minHeight: 70 }}
                                  onFocus={e => (e.target.style.borderColor = "#3478F6")}
                                  onBlur={e => (e.target.style.borderColor = "#E5E7EB")} />
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                  <button onClick={editImageModalInline}
                                    disabled={!modalInlineEditInstruction.trim() || editingModalImg || modalInlineEditCount >= 3}
                                    style={{ padding: "7px 14px", background: (!modalInlineEditInstruction.trim() || editingModalImg || modalInlineEditCount >= 3) ? "#ccc" : "#3478F6",
                                      color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                    {editingModalImg ? "Обновляю..." : "Применить"}
                                  </button>
                                  <button onClick={() => { setModalShowInlineEdit(false); setModalInlineEditInstruction(""); }}
                                    style={{ padding: "7px 12px", background: "none", border: "1px solid #E5E7EB", borderRadius: 8, cursor: "pointer", fontSize: 12, color: "#666" }}>Отмена</button>
                                </div>
                              </>
                            )}
                            {modalInlineEditCount >= 3 && <div style={{ fontSize: 12, color: "#FF6B5E", marginTop: 6 }}>Достигнут лимит правок (3).</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Загрузка видео (3 плитки + обложка) ── */}
                  {modalImageMode === "video" && (
                    <div
                      style={{ background: "#F5F7FA", borderRadius: 12, padding: 14, marginBottom: 12 }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("video/"));
                        if (files.length) addModalVideoFiles(files);
                      }}
                    >
                      <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px" }}>Нажмите на ячейку или перетащите видео из папки. Можно добавить до 3 видео.</p>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {modalVideoFiles.map((file, idx) => (
                          <div key={idx}
                            onClick={() => { if (!file) { modalVideoActiveRef.current = idx; modalVideoInputRef.current?.click(); } }}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                              e.preventDefault();
                              const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("video/"));
                              if (dropped.length) addModalVideoFiles(dropped, idx);
                            }}
                            style={{ width: 180, height: 120, borderRadius: 12,
                              border: file ? "1.5px solid #E5E7EB" : "2px dashed #C0BDB6",
                              background: file ? "#000" : "rgba(0,0,0,0.04)", cursor: file ? "default" : "pointer",
                              position: "relative", overflow: "hidden",
                              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {file && modalVideoPreviewUrls[idx] ? (
                              <>
                                <video src={modalVideoPreviewUrls[idx]!} muted preload="metadata"
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  onLoadedMetadata={e => { (e.target as HTMLVideoElement).currentTime = 0.001; }} />
                                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)",
                                  display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                                  <span style={{ fontSize: 28, color: "#fff", opacity: 0.9 }}>▶</span>
                                </div>
                                <button onClick={e => { e.stopPropagation(); removeModalVideoFile(idx); }}
                                  style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: "50%",
                                    background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", cursor: "pointer",
                                    fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, zIndex: 1 }}>✕</button>
                                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 8px",
                                  background: "linear-gradient(transparent, rgba(0,0,0,0.6))", fontSize: 10,
                                  color: "rgba(255,255,255,0.9)", fontWeight: 600, overflow: "hidden",
                                  textOverflow: "ellipsis", whiteSpace: "nowrap", pointerEvents: "none" }}>{file.name}</div>
                              </>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "#C0BDB6", userSelect: "none" }}>
                                <span style={{ fontSize: 30 }}>🎬</span>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>+ Добавить видео</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <input ref={modalVideoInputRef} type="file" accept="video/*" multiple style={{ display: "none" }}
                        onChange={e => {
                          const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("video/"));
                          if (files.length) addModalVideoFiles(files, modalVideoActiveRef.current);
                          modalVideoActiveRef.current = -1; e.target.value = "";
                        }} />
                      <div style={{ marginTop: 8, fontSize: 12, color: "#aaa" }}>Поддерживаются MP4, MOV, AVI, WebM и др.</div>

                      {/* ── Обложка для видео ── */}
                      {modalVideoFiles.some(Boolean) && (
                        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #E8E6E0" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#0D1B2A", marginBottom: 12 }}>Обложка для видео</div>
                          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                            {/* Превью обложки */}
                            <div style={{ flexShrink: 0 }}>
                              {modalVideoCoverDataUrl ? (
                                <div style={{ position: "relative", width: 176, height: 99, borderRadius: 10, overflow: "hidden", border: "1.5px solid #E5E7EB" }}>
                                  <img src={modalVideoCoverDataUrl} alt="cover"
                                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", background: "#000" }} />
                                  <div style={{ position: "absolute", top: 5, left: 5,
                                    background: modalVideoCoverSource === "ai" ? "#3478F6" : modalVideoCoverSource === "upload" ? "#4680C2" : "#00B5A6",
                                    color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 6, padding: "2px 7px" }}>
                                    {modalVideoCoverSource === "ai" ? "ИИ" : modalVideoCoverSource === "upload" ? "Загружено" : "Авто"}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ width: 176, height: 99, borderRadius: 10, border: "2px dashed #C0BDB6",
                                  background: "rgba(0,0,0,0.03)", display: "flex", alignItems: "center",
                                  justifyContent: "center", fontSize: 12, color: "#C0BDB6", fontWeight: 600 }}>Нет обложки</div>
                              )}
                            </div>
                            {/* Кнопки */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
                              <button onClick={() => modalVideoCoverInputRef.current?.click()}
                                style={{ padding: "7px 14px", background: "none", border: "1px solid #E5E7EB", borderRadius: 8,
                                  cursor: "pointer", fontSize: 12, color: "#555", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                                📷 Загрузить обложку
                              </button>
                              <button onClick={() => setModalShowVideoCoverPrompt(v => !v)}
                                style={{ padding: "7px 14px",
                                  background: modalShowVideoCoverPrompt ? "#EEE5FE" : "none",
                                  border: `1px solid ${modalShowVideoCoverPrompt ? "#3478F6" : "#E5E7EB"}`,
                                  borderRadius: 8, cursor: "pointer", fontSize: 12,
                                  color: modalShowVideoCoverPrompt ? "#3478F6" : "#555",
                                  display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                                🤖 Сгенерировать в ИИ
                              </button>
                              {(modalVideoCoverSource === "upload" || modalVideoCoverSource === "ai") && modalVideoCoverAutoDataUrl && (
                                <button onClick={() => { setModalVideoCoverDataUrl(modalVideoCoverAutoDataUrl); setModalVideoCoverSource("auto"); }}
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#3478F6", textDecoration: "underline", padding: 0, textAlign: "left", fontWeight: 600 }}>
                                  ← Вернуть автоматическую обложку
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Промт ИИ-обложки */}
                          {modalShowVideoCoverPrompt && (
                            <div style={{ marginTop: 14 }}>
                              <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>
                                {modalVideoCoverAutoDataUrl ? "ИИ видит первый кадр видео как базу. Опишите что изменить:" : "Опишите обложку:"}
                              </div>
                              <div style={{ position: "relative" }}>
                                <textarea value={modalVideoCoverPrompt} onChange={e => setModalVideoCoverPrompt(e.target.value)}
                                  placeholder="Например: добавь текст с названием бренда, сделай яркий фон, сохрани композицию..."
                                  style={{ ...inp13, minHeight: 70 }}
                                  onFocus={e => (e.target.style.borderColor = "#3478F6")}
                                  onBlur={e => (e.target.style.borderColor = "#E5E7EB")} />
                                <button onClick={() => modalVideoCoverRefInputRef.current?.click()}
                                  title="Прикрепить референс фото"
                                  style={{ position: "absolute", bottom: 10, right: 10,
                                    background: modalVideoCoverRefPhoto ? "#EEE5FE" : "rgba(255,255,255,0.9)",
                                    border: `1px solid ${modalVideoCoverRefPhoto ? "#3478F6" : "#E5E7EB"}`,
                                    borderRadius: 7, cursor: "pointer", fontSize: 14,
                                    color: modalVideoCoverRefPhoto ? "#3478F6" : "#aaa", padding: "3px 7px" }}>📎</button>
                              </div>
                              {modalVideoCoverRefPhoto && (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, padding: "5px 10px", background: "#F5F7FA", borderRadius: 8 }}>
                                  <img src={`data:${modalVideoCoverRefPhoto.mime};base64,${modalVideoCoverRefPhoto.data}`} alt="ref"
                                    style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", border: "1.5px solid #E5E7EB", display: "block" }} />
                                  <span style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>Референс для ИИ</span>
                                  <button onClick={() => setModalVideoCoverRefPhoto(null)}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 14, padding: 0 }}>✕</button>
                                </div>
                              )}
                              <div style={{ marginTop: 10 }}>
                                <button onClick={generateModalVideoCover}
                                  disabled={!modalVideoCoverPrompt.trim() || modalLoadingVideoCover}
                                  style={{ padding: "7px 14px",
                                    background: !modalVideoCoverPrompt.trim() || modalLoadingVideoCover ? "#ccc" : "#3478F6",
                                    color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                                  {modalLoadingVideoCover ? "Генерирую..." : "Сгенерировать обложку"}
                                </button>
                              </div>
                            </div>
                          )}
                          <input ref={modalVideoCoverInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onModalVideoCoverUpload} />
                          <input ref={modalVideoCoverRefInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onModalVideoCoverRefPhoto} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Превью сохранённого изображения ── */}
                  {(modalImageMode === null) && (
                    imgSrc ? (
                      <img src={imgSrc} alt="preview"
                        style={{ width: "100%", height: "auto", objectFit: "contain", borderRadius: 12, display: "block", background: "#F5F7FA" }} />
                    ) : (
                      <div style={{ background: "#F5F7FA", borderRadius: 12, padding: "40px 16px",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                        border: "2px dashed #E5E7EB" }}>
                        <span style={{ fontSize: 40 }}>🖼</span>
                        <span style={{ fontSize: 13, color: "#999" }}>Изображение не прикреплено</span>
                      </div>
                    )
                  )}
                  {/* Существующее изображение видно в режимах upload/edit/video если новых файлов нет */}
                  {(modalImageMode === "upload" || modalImageMode === "edit" || modalImageMode === "video") && imgSrc && modalUploadFilled.length === 0 && !modalAiImageB64 && !modalVideoFiles.some(Boolean) && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Текущее изображение:</div>
                      <img src={imgSrc} alt="current"
                        style={{ width: "100%", height: "auto", objectFit: "contain", borderRadius: 12, display: "block", background: "#F5F7FA" }} />
                    </div>
                  )}
                </div>

                {/* 5. "Нужна доп. информация" expandable (для pending_approval) */}
                {showNeedsInfo && (
                  <div style={{ background: "#fff", borderRadius: 12, padding: 14, marginBottom: 8,
                    border: "1px solid #E5E7EB" }}>
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
                            borderColor: selectedInfoItems.includes(item) ? "#EA580C" : "#E5E7EB",
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
                  style={{ padding: "10px 18px", background: "#0D1B2A", color: "#fff",
                    border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  {modalSaving ? "Сохраняю..." : "💾 Сохранить текст"}
                </button>

                {expanded.status !== "content_ready" && expanded.status !== "published" && (
                  <button
                    onClick={() => approveSlot(expanded)}
                    disabled={!canApprove || approvingId === expanded.id}
                    title={!canApprove ? "Добавьте текст и изображение, ответьте на все вопросы" : ""}
                    style={{ padding: "10px 18px",
                      background: !canApprove || approvingId === expanded.id ? "#ccc" : "#00B5A6",
                      color: "#fff", border: "none", borderRadius: 10,
                      cursor: !canApprove ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
                    {approvingId === expanded.id ? "..." : "✓ Согласовать"}
                  </button>
                )}

                {expanded.status === "content_ready" && (
                  <button onClick={publishModal}
                    style={{ padding: "10px 18px", background: "#3478F6", color: "#fff",
                      border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    ✈ Опубликовать
                  </button>
                )}

                <button onClick={closeModal}
                  style={{ marginLeft: "auto", padding: "10px 18px", background: "#F1EFE8",
                    color: "#555", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
                  Закрыть
                </button>

              </div>

              {/* Удаление поста */}
              <div style={{ padding: "12px 28px 18px", borderTop: "1px solid #F0EEE8" }}>
                {!showDeleteSlot ? (
                  <button onClick={() => setShowDeleteSlot(true)}
                    style={{ fontSize: 12, color: "#FF6B5E", background: "none", border: "none",
                      cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                    Удалить пост
                  </button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "#888" }}>Потяните вправо для подтверждения удаления</div>
                    <SlideToConfirm
                      label="→ Удалить пост"
                      color="#FF6B5E"
                      onConfirm={deleteCurrentSlot}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Модал создания события ── */}
      {eventModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={() => setEventModalOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
          <div style={{ position: "relative", width: "min(580px, 95vw)", maxHeight: "90vh",
            background: "#fff", borderRadius: 20, overflow: "hidden",
            boxShadow: "0 24px 80px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "18px 24px", borderBottom: "1px solid #F2F0EC", background: "#fff", flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 17, color: "#0D1B2A" }}>
                {evEditingId ? "✏️ Редактировать событие" : "🎪 Создать событие"}
              </span>
              <button onClick={() => setEventModalOpen(false)}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "none",
                  background: "#F1EFE8", cursor: "pointer", fontSize: 18, color: "#555",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            {/* Form */}
            <div style={{ overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Block 1 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontWeight: 600, fontSize: 13, color: "#0D1B2A" }}>1. Наименование события</label>
                <input value={evName} onChange={e => setEvName(e.target.value)}
                  placeholder="Например: Летняя акция -20%"
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E5E7EB",
                    fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
              </div>

              {/* Block 2 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontWeight: 600, fontSize: 13, color: "#0D1B2A" }}>2. Краткое описание</label>
                <textarea value={evDesc} onChange={e => setEvDesc(e.target.value)} rows={3}
                  placeholder="Опишите событие..."
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E5E7EB",
                    fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit",
                    width: "100%", boxSizing: "border-box" }} />
                <div style={{ fontSize: 12, color: "#888", background: "#FAFAF8",
                  borderRadius: 8, padding: "8px 12px", lineHeight: 1.6 }}>
                  Если это <b>акция</b> — кратко опишите условия.<br/>
                  Если это <b>ивент</b> — опишите суть мероприятия.<br/>
                  Информация потребуется для генерации текста постов.
                </div>
              </div>

              {/* Block 3 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontWeight: 600, fontSize: 13, color: "#0D1B2A" }}>3. Даты события</label>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "#888" }}>Начало</span>
                    <input type="date" value={evStartDate} onChange={e => setEvStartDate(e.target.value)}
                      style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #E5E7EB",
                        fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "#888" }}>Окончание</span>
                    <input type="date" value={evEndDate} onChange={e => setEvEndDate(e.target.value)}
                      style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #E5E7EB",
                        fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              {/* Block 4 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px",
                borderRadius: 12, border: "1px solid #F2F0EC", background: "#FAFAF8" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={evHasStart} onChange={e => setEvHasStart(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "#E91E8C", cursor: "pointer" }} />
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#0D1B2A" }}>4. Уведомление о старте мероприятия</span>
                </label>
                {evHasStart && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginLeft: 26 }}>
                    <span style={{ fontSize: 12, color: "#888" }}>Дата и время публикации поста о старте</span>
                    <input type="datetime-local" value={evStartDT} onChange={e => setEvStartDT(e.target.value)}
                      style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #E5E7EB",
                        fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
                    {evAvailablePlatforms.length > 0 ? (
                      <EvPlatformPicker
                        platforms={evAvailablePlatforms}
                        selected={evStartPlatforms}
                        onChange={setEvStartPlatforms}
                      />
                    ) : (
                      <div style={{ fontSize: 12, color: "#9CA3AF", padding: "4px 0" }}>
                        Нет подключённых площадок.{" "}
                        <a href="/platforms" style={{ color: "#3478F6", textDecoration: "none" }}>Подключить →</a>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Block 5 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px",
                borderRadius: 12, border: "1px solid #F2F0EC", background: "#FAFAF8" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={evHasEnd} onChange={e => setEvHasEnd(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "#E91E8C", cursor: "pointer" }} />
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#0D1B2A" }}>5. Уведомление о завершении (итоги)</span>
                </label>
                {evHasEnd && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginLeft: 26 }}>
                    <span style={{ fontSize: 12, color: "#888" }}>Дата и время публикации итогового поста</span>
                    <input type="datetime-local" value={evEndDT} onChange={e => setEvEndDT(e.target.value)}
                      style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #E5E7EB",
                        fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
                    {evAvailablePlatforms.length > 0 ? (
                      <EvPlatformPicker
                        platforms={evAvailablePlatforms}
                        selected={evEndPlatforms}
                        onChange={setEvEndPlatforms}
                      />
                    ) : (
                      <div style={{ fontSize: 12, color: "#9CA3AF", padding: "4px 0" }}>
                        Нет подключённых площадок.{" "}
                        <a href="/platforms" style={{ color: "#3478F6", textDecoration: "none" }}>Подключить →</a>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Block 6 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px",
                borderRadius: 12, border: "1px solid #F2F0EC", background: "#FAFAF8" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={evHasInter} onChange={e => setEvHasInter(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "#E91E8C", cursor: "pointer" }} />
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#0D1B2A" }}>6. Промежуточные уведомления</span>
                </label>
                {evHasInter && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginLeft: 26 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 13, color: "#555" }}>Количество промежуточных постов</span>
                      <input type="number" min={1} max={10} value={evInterCount}
                        onChange={e => {
                          const n = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                          setEvInterCount(n);
                          setEvInterDTs(arr => {
                            const next = [...arr];
                            while (next.length < n) next.push("");
                            return next.slice(0, n);
                          });
                        }}
                        style={{ width: 64, padding: "6px 10px", borderRadius: 8,
                          border: "1px solid #E5E7EB", fontSize: 14, outline: "none" }} />
                    </div>
                    {evInterDTs.slice(0, evInterCount).map((dt, idx) => (
                      <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "#888" }}>Пост {idx + 1} — дата и время</span>
                        <input type="datetime-local" value={dt}
                          onChange={e => setEvInterDTs(arr => { const n=[...arr]; n[idx]=e.target.value; return n; })}
                          style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #E5E7EB",
                            fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
                      </div>
                    ))}
                    {evAvailablePlatforms.length > 0 ? (
                      <EvPlatformPicker
                        platforms={evAvailablePlatforms}
                        selected={evInterPlatforms}
                        onChange={setEvInterPlatforms}
                      />
                    ) : (
                      <div style={{ fontSize: 12, color: "#9CA3AF", padding: "4px 0" }}>
                        Нет подключённых площадок.{" "}
                        <a href="/platforms" style={{ color: "#3478F6", textDecoration: "none" }}>Подключить →</a>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Footer buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 24px",
              borderTop: "1px solid #F2F0EC", background: "#fff", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  disabled={evSaving || !evName.trim() || !evStartDate || !evEndDate}
                  onClick={async () => {
                    if (!evName.trim() || !evStartDate || !evEndDate) return;
                    const bid = localStorage.getItem("businessId");
                    if (!bid) return;
                    setEvSaving(true);
                    try {
                      if (evEditingId) {
                        await api.patch(`/events/${evEditingId}/update`, {
                          name: evName.trim(),
                          description: evDesc.trim() || null,
                          start_date: evStartDate,
                          end_date: evEndDate,
                        });
                      } else {
                        await api.post(`/events/${bid}`, {
                          name: evName.trim(),
                          description: evDesc.trim() || null,
                          start_date: evStartDate,
                          end_date: evEndDate,
                          has_start_notification: evHasStart,
                          start_post_datetime: evHasStart ? evStartDT : null,
                          start_platforms: evHasStart && evStartPlatforms.length ? evStartPlatforms : null,
                          has_end_notification: evHasEnd,
                          end_post_datetime: evHasEnd ? evEndDT : null,
                          end_platforms: evHasEnd && evEndPlatforms.length ? evEndPlatforms : null,
                          has_intermediate: evHasInter,
                          intermediate_count: evHasInter ? evInterCount : null,
                          intermediate_datetimes: evHasInter ? evInterDTs.slice(0, evInterCount) : null,
                          intermediate_platforms: evHasInter && evInterPlatforms.length ? evInterPlatforms : null,
                        });
                      }
                      setEventModalOpen(false);
                      setEvAvailablePlatforms([]); setEvEditingId(null);
                      await load(); await loadEvents();
                    } catch (e) { alert("Ошибка при сохранении события"); }
                    finally { setEvSaving(false); }
                  }}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                    background: evSaving || !evName.trim() || !evStartDate || !evEndDate ? "#ccc" : "#E91E8C",
                    color: "#fff", fontWeight: 700, fontSize: 14,
                    cursor: evSaving || !evName.trim() ? "not-allowed" : "pointer" }}>
                  {evSaving ? "Сохранение..." : evEditingId ? "💾 Сохранить изменения" : "✓ Создать событие"}
                </button>
                <button onClick={() => setEventModalOpen(false)}
                  style={{ padding: "11px 20px", borderRadius: 12, border: "1px solid #E5E7EB",
                    background: "#fff", color: "#555", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  Отменить
                </button>
              </div>

              {/* Удалить событие */}
              {evEditingId && (
                <SlideToConfirm
                  label="→ Удалить событие и все посты"
                  color="#FF6B5E"
                  onConfirm={async () => {
                    setEvDeleting(true);
                    try {
                      await api.delete(`/events/${evEditingId}?delete_slots=true`);
                      setEventModalOpen(false);
                      setEvEditingId(null); setEvAvailablePlatforms([]);
                      await load(); await loadEvents();
                    } catch { alert("Ошибка удаления события"); }
                    finally { setEvDeleting(false); }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {quickPostOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={() => setQuickPostOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
          <div style={{ position: "relative", width: "90vw", maxWidth: 1100, height: "90vh",
            background: "#fff", borderRadius: 16, overflow: "hidden",
            boxShadow: "0 24px 80px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px", borderBottom: "1px solid #F2F0EC", background: "#fff", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: "#0D1B2A" }}>⚡ Быстрый пост</span>
                {quickPostPlatforms.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {quickPostPlatforms.map((p, i) => {
                      const cfg: Record<string, { bg: string; color: string; label: string }> = {
                        vk:       { bg: "#EBF2FB", color: "#4680C2", label: "ВКонтакте" },
                        telegram: { bg: "#E3F4FF", color: "#2AABEE", label: "Telegram" },
                        ok:       { bg: "#FFF3E0", color: "#F57C00", label: "Одноклассники" },
                      };
                      const c = cfg[p.platform] || { bg: "#F1EFE8", color: "#888", label: p.platform };
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6,
                          background: c.bg, borderRadius: 20, padding: "4px 10px 4px 6px" }}>
                          <div style={{ width: 20, height: 20, borderRadius: "50%",
                            background: c.color, display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff" }}>
                            {p.platform === "vk" ? "VK" : p.platform === "telegram" ? "TG" : "OK"}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 500, color: c.color }}>{p.page_name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <button onClick={() => setQuickPostOpen(false)}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "none",
                  background: "#F1EFE8", cursor: "pointer", fontSize: 18, color: "#555",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <iframe src="/embed/post-creator" style={{ flex: 1, border: "none", width: "100%" }} />
          </div>
        </div>
      )}
    </div>
  );
}

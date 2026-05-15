"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";

type Platform = "vk" | "telegram";
type ConnectedPlatform = { platform: Platform; page_name: string };
type ModelKey = "claude" | "gpt";
type ImageMode = "prompt" | "upload" | "edit" | null;

interface UploadSlot { data: string; mime: string }

const MODEL_LABELS: Record<ModelKey, string> = { claude: "Claude Sonnet 4.6", gpt: "GPT-5.4" };
const MODEL_COLORS: Record<ModelKey, string> = { claude: "#D97706", gpt: "#059669" };

const MAX_TEXT_ATTEMPTS = 3;
const MAX_IMAGE_ATTEMPTS = 3;
const MAX_INLINE_EDITS = 3;
const MAX_UPLOAD_SLOTS = 10;
const MAX_FILES = 10;
const DRAFT_KEY_PREFIX = "qp_draft_v1_";

interface BrandContext { visual_style: string; brand_colors: string[]; brand_voice: string; niche: string; usp: string }

interface Draft {
  idea: string; ideaUrl: string; postText: string;
  textHistory: string[]; currentTextIdx: number; textGenCount: number;
  imagePrompt: string; imageHistory: string[]; currentImageIdx: number;
  imageGenCount: number; inlineEditCount: number;
  uploadSlotsData: Array<{ data: string; mime: string } | null>;
  uploadCarouselIdx: number;
  selectedPlatforms: Platform[]; publishNow: boolean;
  publishDate: string; publishTime: string; usedModel: ModelKey;
}

function loadDraft(id: string): Draft | null {
  if (typeof window === "undefined" || !id) return null;
  try { const r = localStorage.getItem(DRAFT_KEY_PREFIX + id); if (r) return JSON.parse(r); } catch {}
  return null;
}
function saveDraft(id: string, d: Draft) { if (!id) return; try { localStorage.setItem(DRAFT_KEY_PREFIX + id, JSON.stringify(d)); } catch {} }
function clearDraft(id: string) { if (!id) return; localStorage.removeItem(DRAFT_KEY_PREFIX + id); }

const readFileAsBase64 = (f: File): Promise<{ data: string; mime: string }> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => { const s = e.target?.result as string; const p = s.split(","); res({ data: p[1] || "", mime: p[0].replace("data:", "").replace(";base64", "") || "image/jpeg" }); };
    r.onerror = rej; r.readAsDataURL(f);
  });

// ── Shared UI ─────────────────────────────────────────────────────────────────

const card: React.CSSProperties = { background: "#fff", border: "1px solid #EAE8E2", borderRadius: 18, padding: "28px 32px", marginBottom: 16 };

function SectionTitle({ n, label, done }: { n: number; label: string; done: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, background: done ? "#0F6E56" : "#1a1a1a", color: "#fff" }}>
        {done ? "✓" : n}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>{label}</div>
    </div>
  );
}

function Btn({ label, onClick, disabled, loading, color, small }: { label: string; onClick: () => void; disabled?: boolean; loading?: boolean; color?: string; small?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{ padding: small ? "7px 16px" : "10px 22px", background: (disabled || loading) ? "#E0DED8" : (color || "#1a1a1a"), color: (disabled || loading) ? "#aaa" : "#fff", border: "none", borderRadius: 10, cursor: (disabled || loading) ? "not-allowed" : "pointer", fontSize: small ? 12 : 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, opacity: loading ? 0.7 : 1 }}>
      {loading ? "⏳ " : ""}{label}
    </button>
  );
}

function Textarea({ value, onChange, placeholder, rows = 5 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ width: "100%", padding: "12px 16px", border: "1px solid #E0DED8", borderRadius: 12, fontSize: 13, fontFamily: "inherit", lineHeight: 1.7, background: "#FAFAF8", resize: "vertical", boxSizing: "border-box", outline: "none" }} />;
}

function AttemptBadge({ current, max, label }: { current: number; max: number; label: string }) {
  const left = max - current;
  const color = left === 0 ? "#DC2626" : left === 1 ? "#D97706" : "#0F6E56";
  return <span style={{ fontSize: 11, color, background: color + "15", border: `1px solid ${color}30`, borderRadius: 12, padding: "2px 9px", fontWeight: 600 }}>{label}: {current}/{max}</span>;
}

function HistoryNav({ current, total, onPrev, onNext }: { current: number; total: number; onPrev: () => void; onNext: () => void }) {
  if (total <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
      <button onClick={onPrev} disabled={current <= 0} style={{ padding: "5px 12px", border: "1px solid #E0DED8", borderRadius: 8, background: "#fff", cursor: current <= 0 ? "not-allowed" : "pointer", fontSize: 13, color: current <= 0 ? "#ccc" : "#555" }}>← Пред.</button>
      <span style={{ fontSize: 12, color: "#888" }}>Версия {current + 1} из {total}</span>
      <button onClick={onNext} disabled={current >= total - 1} style={{ padding: "5px 12px", border: "1px solid #E0DED8", borderRadius: 8, background: "#fff", cursor: current >= total - 1 ? "not-allowed" : "pointer", fontSize: 13, color: current >= total - 1 ? "#ccc" : "#555" }}>След. →</button>
    </div>
  );
}

const PLATFORM_META: Record<Platform, { label: string; color: string; icon: string }> = {
  vk: { label: "ВКонтакте", color: "#4680C2", icon: "В" },
  telegram: { label: "Telegram", color: "#229ED9", icon: "✈" },
};

// ── Brand Context Panel ────────────────────────────────────────────────────────

function BrandContextPanel({ brand, onInsert }: { brand: BrandContext; onInsert: (t: string) => void }) {
  if (!brand.visual_style && brand.brand_colors.length === 0) return null;
  const phrases = [
    brand.visual_style && { label: "Фирменный стиль", value: `Use brand visual style: ${brand.visual_style}` },
    brand.visual_style && { label: "Фон как в магазине", value: `Background style matching our store aesthetic: ${brand.visual_style}` },
    brand.brand_colors.length > 0 && { label: "Фирменные цвета", value: `Use brand colors: ${brand.brand_colors.join(", ")}` },
    (brand.visual_style && brand.brand_colors.length > 0) && { label: "Цвета + стиль", value: `Brand color palette ${brand.brand_colors.join(", ")} with visual style: ${brand.visual_style}` },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div style={{ marginBottom: 16, padding: "14px 16px", background: "#F8F6FF", border: "1px solid #DDD6FE", borderRadius: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#6B46C1", marginBottom: 10 }}>Фирменный стиль бизнеса — нажмите чтобы добавить в промт:</div>
      {brand.visual_style && <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}><span style={{ fontWeight: 600, color: "#6B46C1" }}>Стиль:</span> {brand.visual_style}</div>}
      {brand.brand_colors.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#6B46C1" }}>Цвета:</span>
          {brand.brand_colors.slice(0, 8).map((c, i) => <div key={i} title={c} style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: c.startsWith("#") ? c : `#${c}`, border: "1.5px solid #E0DED8" }} />)}
          <span style={{ fontSize: 11, color: "#aaa" }}>{brand.brand_colors.slice(0, 8).join(", ")}</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {phrases.map((p, i) => <button key={i} onClick={() => onInsert(p.value)} style={{ padding: "5px 12px", background: "#fff", border: "1.5px solid #DDD6FE", borderRadius: 20, color: "#6B46C1", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>+ {p.label}</button>)}
      </div>
    </div>
  );
}

// ── Upload Grid ────────────────────────────────────────────────────────────────

function UploadGrid({ slots, onSlotClick, onRemove, onReorder, onFileDrop }: {
  slots: Array<UploadSlot | null>;
  onSlotClick: (idx: number) => void;
  onRemove: (idx: number) => void;
  onReorder: (from: number, to: number) => void;
  onFileDrop: (startIdx: number, files: File[]) => void;
}) {
  const dragFrom = useRef(-1);
  const [dragOver, setDragOver] = useState(-1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
      {slots.map((slot, idx) => (
        <div
          key={idx}
          onClick={() => !slot && onSlotClick(idx)}
          draggable={!!slot}
          onDragStart={e => { dragFrom.current = idx; }}
          onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
          onDragLeave={() => setDragOver(-1)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(-1);
            if (e.dataTransfer.files.length > 0) {
              onFileDrop(idx, Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")));
            } else if (dragFrom.current >= 0 && dragFrom.current !== idx) {
              onReorder(dragFrom.current, idx);
            }
            dragFrom.current = -1;
          }}
          onDragEnd={() => { dragFrom.current = -1; setDragOver(-1); }}
          style={{
            position: "relative",
            aspectRatio: "1",
            background: slot ? "transparent" : "rgba(0,0,0,0.04)",
            border: dragOver === idx ? "2px solid #4680C2" : slot ? "1.5px solid #E0DED8" : "2px dashed #C0BDB6",
            borderRadius: 10,
            overflow: "hidden",
            cursor: slot ? "grab" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "border-color 0.15s",
          }}
        >
          {slot ? (
            <>
              <img
                src={`data:${slot.mime};base64,${slot.data}`}
                alt={`upload-${idx}`}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
              />
              <button
                onClick={e => { e.stopPropagation(); onRemove(idx); }}
                style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.65)", border: "none", color: "#fff", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, zIndex: 1 }}>
                ✕
              </button>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.18)", fontSize: 8, color: "rgba(255,255,255,0.8)", textAlign: "center", padding: "2px 0", letterSpacing: 0.5, pointerEvents: "none" }}>
                ТЯНУТЬ
              </div>
            </>
          ) : (
            <span style={{ fontSize: 26, color: "#C0BDB6", lineHeight: 1, userSelect: "none" }}>+</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Upload Carousel ────────────────────────────────────────────────────────────

function UploadCarousel({ slots, carouselIdx, setCarouselIdx }: {
  slots: Array<UploadSlot | null>;
  carouselIdx: number;
  setCarouselIdx: (i: number) => void;
}) {
  const filled = slots.filter((s): s is UploadSlot => s !== null);
  if (filled.length === 0) return null;
  const safeIdx = Math.min(carouselIdx, filled.length - 1);
  const current = filled[safeIdx];

  return (
    <div>
      <div style={{ position: "relative", display: "inline-block" }}>
        <img
          src={`data:${current.mime};base64,${current.data}`}
          alt="upload-current"
          style={{ width: 280, height: 280, objectFit: "cover", borderRadius: 14, border: "1px solid #EAE8E2", display: "block" }}
        />
        {filled.length > 1 && (
          <>
            <button onClick={() => setCarouselIdx(Math.max(0, safeIdx - 1))} disabled={safeIdx === 0}
              style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.45)", border: "none", color: "#fff", cursor: safeIdx === 0 ? "not-allowed" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <button onClick={() => setCarouselIdx(Math.min(filled.length - 1, safeIdx + 1))} disabled={safeIdx === filled.length - 1}
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.45)", border: "none", color: "#fff", cursor: safeIdx === filled.length - 1 ? "not-allowed" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
            <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.4)", borderRadius: 10, padding: "2px 8px", fontSize: 11, color: "#fff" }}>
              {safeIdx + 1} / {filled.length}
            </div>
          </>
        )}
      </div>
      {filled.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto", paddingBottom: 4 }}>
          {filled.map((s, i) => (
            <img key={i} src={`data:${s.mime};base64,${s.data}`} alt={`thumb-${i}`}
              onClick={() => setCarouselIdx(i)}
              style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flexShrink: 0, cursor: "pointer", border: i === safeIdx ? "2px solid #1a1a1a" : "2px solid transparent", opacity: i === safeIdx ? 1 : 0.65 }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── AI Image Preview (inline, used inside 3a and 3c) ──────────────────────────

function AiImagePreview({
  aiImageB64, imageHistory, currentImageIdx, setCurrentImageIdx,
  loadingImage, inlineEditCount, showInlineEdit, setShowInlineEdit,
  inlineEditInstruction, setInlineEditInstruction,
  onInlineEdit, brandShortcutsNode,
}: {
  aiImageB64: string;
  imageHistory: string[];
  currentImageIdx: number;
  setCurrentImageIdx: (i: number) => void;
  loadingImage: boolean;
  inlineEditCount: number;
  showInlineEdit: boolean;
  setShowInlineEdit: (v: boolean) => void;
  inlineEditInstruction: string;
  setInlineEditInstruction: (v: string) => void;
  onInlineEdit: () => void;
  brandShortcutsNode: React.ReactNode;
}) {
  if (loadingImage && !aiImageB64) {
    return <div style={{ marginTop: 20, padding: "28px", background: "#F8F7F4", borderRadius: 14, textAlign: "center", color: "#888" }}>⏳ Обрабатываю изображение...</div>;
  }
  if (!aiImageB64) return null;

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #F0EEE8" }}>
      {imageHistory.length > 1 && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#6B46C1", background: "#F0EBF8", borderRadius: 12, padding: "2px 9px", fontWeight: 600 }}>{imageHistory.length} версий</span>
        </div>
      )}
      <img src={`data:image/png;base64,${aiImageB64}`} alt="generated" style={{ width: 280, height: 280, objectFit: "cover", borderRadius: 14, border: "1px solid #EAE8E2", display: "block" }} />
      {imageHistory.length > 1 && (
        <HistoryNav
          current={currentImageIdx} total={imageHistory.length}
          onPrev={() => { const i = currentImageIdx - 1; if (i >= 0) setCurrentImageIdx(i); }}
          onNext={() => { const i = currentImageIdx + 1; if (i < imageHistory.length) setCurrentImageIdx(i); }}
        />
      )}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Редактировать изображение</div>
          <AttemptBadge current={inlineEditCount} max={MAX_INLINE_EDITS} label="Правок" />
        </div>
        {!showInlineEdit && inlineEditCount < MAX_INLINE_EDITS && (
          <button onClick={() => setShowInlineEdit(true)} style={{ padding: "8px 18px", background: "none", border: "1.5px solid #6B46C1", borderRadius: 10, color: "#6B46C1", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>✏️ Внести правки</button>
        )}
        {showInlineEdit && (
          <>
            {brandShortcutsNode}
            <Textarea value={inlineEditInstruction} onChange={setInlineEditInstruction} placeholder="Например: измени фон на белый, добавь тёплые цвета..." rows={3} />
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <Btn label={loadingImage ? "Редактирую..." : "Обновить"} onClick={onInlineEdit} disabled={!inlineEditInstruction.trim() || loadingImage || inlineEditCount >= MAX_INLINE_EDITS} loading={loadingImage} color="#6B46C1" small />
              <button onClick={() => { setShowInlineEdit(false); setInlineEditInstruction(""); }} style={{ padding: "7px 14px", background: "none", border: "1px solid #E0DED8", borderRadius: 8, cursor: "pointer", fontSize: 12, color: "#666" }}>Отмена</button>
            </div>
          </>
        )}
        {inlineEditCount >= MAX_INLINE_EDITS && <div style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>Достигнут лимит правок ({MAX_INLINE_EDITS}).</div>}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PostCreatorPage() {
  const [businessId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("businessId") || "" : ""
  );
  const [connectedPlatforms, setConnectedPlatforms] = useState<ConnectedPlatform[]>([]);
  const [draftSaved, setDraftSaved] = useState(false);
  const [brandContext, setBrandContext] = useState<BrandContext>({ visual_style: "", brand_colors: [], brand_voice: "", niche: "", usp: "" });

  // ── Block 1 ───────────────────────────────────────────────────────────────
  const [idea, setIdea] = useState("");
  const [ideaUrl, setIdeaUrl] = useState("");
  const [ideaFiles, setIdeaFiles] = useState<File[]>([]);
  const [ideaFilePreviews, setIdeaFilePreviews] = useState<string[]>([]);

  // ── Block 2: Text + history ───────────────────────────────────────────────
  const [textHistory, setTextHistory] = useState<string[]>([]);
  const [currentTextIdx, setCurrentTextIdx] = useState(-1);
  const [textGenCount, setTextGenCount] = useState(0);
  const [postText, setPostText] = useState("");
  const [usedModel, setUsedModel] = useState<ModelKey>("claude");

  // ── Image mode ────────────────────────────────────────────────────────────
  const [imageMode, setImageMode] = useState<ImageMode>(null);

  // ── Block 3a: Prompt ──────────────────────────────────────────────────────
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageGenCount, setImageGenCount] = useState(0);

  // ── Block 3b: Upload Grid ─────────────────────────────────────────────────
  const [uploadSlots, setUploadSlots] = useState<Array<UploadSlot | null>>(Array(MAX_UPLOAD_SLOTS).fill(null));
  const [uploadCarouselIdx, setUploadCarouselIdx] = useState(0);
  const activeSlotRef = useRef<number>(-1);
  const slotInputRef = useRef<HTMLInputElement>(null);

  // ── Block 3c: Edit ────────────────────────────────────────────────────────
  const [editBaseIdx, setEditBaseIdx] = useState<number>(-1);
  const [editBaseUploaded, setEditBaseUploaded] = useState<{ data: string; mime: string } | null>(null);
  const [editBaseUploadedPreview, setEditBaseUploadedPreview] = useState("");
  const [editInstruction, setEditInstruction] = useState("");

  // ── AI image history + inline edit (shared for prompt & edit modes) ───────
  const [imageHistory, setImageHistory] = useState<string[]>([]);
  const [currentImageIdx, setCurrentImageIdx] = useState(-1);
  const [inlineEditInstruction, setInlineEditInstruction] = useState("");
  const [inlineEditCount, setInlineEditCount] = useState(0);
  const [showInlineEdit, setShowInlineEdit] = useState(false);

  // ── Platforms / schedule ──────────────────────────────────────────────────
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [publishNow, setPublishNow] = useState(true);
  const [publishDate, setPublishDate] = useState("");
  const [publishTime, setPublishTime] = useState("12:00");

  // ── Loading ───────────────────────────────────────────────────────────────
  const [loadingText, setLoadingText] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");

  const multiFileRef = useRef<HTMLInputElement>(null);
  const editBaseRef = useRef<HTMLInputElement>(null);

  // Derived
  const aiImageB64 = currentImageIdx >= 0 ? imageHistory[currentImageIdx] : "";
  const uploadFilled = uploadSlots.filter((s): s is UploadSlot => s !== null);
  const uploadImageB64 = uploadFilled[Math.min(uploadCarouselIdx, uploadFilled.length - 1)]?.data ?? "";
  const imageBase64ForPublish = imageMode === "upload" ? (uploadFilled.length === 1 ? uploadFilled[0].data : null) : aiImageB64 || null;
  const imagesBase64ForPublish = imageMode === "upload" && uploadFilled.length > 1 ? uploadFilled.map(s => s.data) : undefined;
  const hasImage = imageMode === "upload" ? uploadFilled.length > 0 : !!aiImageB64;
  const hasText = !!postText.trim();

  // ── Draft ─────────────────────────────────────────────────────────────────

  const buildDraft = useCallback((): Draft => ({
    idea, ideaUrl, postText, textHistory, currentTextIdx, textGenCount,
    imagePrompt, imageHistory, currentImageIdx, imageGenCount, inlineEditCount,
    uploadSlotsData: uploadSlots.map(s => s ? { data: s.data, mime: s.mime } : null),
    uploadCarouselIdx,
    selectedPlatforms, publishNow, publishDate, publishTime, usedModel,
  }), [idea, ideaUrl, postText, textHistory, currentTextIdx, textGenCount,
       imagePrompt, imageHistory, currentImageIdx, imageGenCount, inlineEditCount,
       uploadSlots, uploadCarouselIdx,
       selectedPlatforms, publishNow, publishDate, publishTime, usedModel]);

  useEffect(() => {
    if (!businessId) return;
    const hasContent = idea || postText || imageHistory.length > 0 || imagePrompt || uploadFilled.length > 0;
    if (!hasContent) return;
    saveDraft(businessId, buildDraft());
    setDraftSaved(true);
    const t = setTimeout(() => setDraftSaved(false), 2000);
    return () => clearTimeout(t);
  }, [idea, ideaUrl, postText, textHistory, currentTextIdx, imagePrompt,
      imageHistory, currentImageIdx, uploadSlots, selectedPlatforms, publishNow, publishDate, publishTime]);

  useEffect(() => {
    if (!businessId) return;
    api.get(`/platforms/list/${businessId}`).then(({ data }) => {
      setConnectedPlatforms((data || []).filter((p: any) => p.is_active).map((p: any) => ({ platform: p.platform as Platform, page_name: p.page_name })));
    }).catch(() => {});
    api.get(`/post-creator/${businessId}/brand-context`).then(({ data }) => setBrandContext(data)).catch(() => {});
    const today = new Date();
    setPublishDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
    const draft = loadDraft(businessId);
    if (draft) {
      setIdea(draft.idea || ""); setIdeaUrl(draft.ideaUrl || "");
      setPostText(draft.postText || ""); setTextHistory(draft.textHistory || []);
      setCurrentTextIdx(draft.currentTextIdx ?? -1); setTextGenCount(draft.textGenCount || 0);
      setImagePrompt(draft.imagePrompt || ""); setImageHistory(draft.imageHistory || []);
      setCurrentImageIdx(draft.currentImageIdx ?? -1); setImageGenCount(draft.imageGenCount || 0);
      setInlineEditCount(draft.inlineEditCount || 0);
      if (draft.uploadSlotsData) {
        const slots: Array<UploadSlot | null> = draft.uploadSlotsData.map(s => s ? { data: s.data, mime: s.mime } : null);
        while (slots.length < MAX_UPLOAD_SLOTS) slots.push(null);
        setUploadSlots(slots);
      }
      setUploadCarouselIdx(draft.uploadCarouselIdx || 0);
      setSelectedPlatforms(draft.selectedPlatforms || []);
      setPublishNow(draft.publishNow ?? true);
      if (draft.publishDate) setPublishDate(draft.publishDate);
      setPublishTime(draft.publishTime || "12:00");
      setUsedModel(draft.usedModel || "claude");
      if (draft.imagePrompt) setImageMode("prompt");
      else if ((draft.uploadSlotsData || []).some(Boolean)) setImageMode("upload");
      else if (draft.imageHistory?.length) setImageMode("edit");
    }
  }, [businessId]);

  // ── File handlers ─────────────────────────────────────────────────────────

  const onMultiFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_FILES);
    setIdeaFiles(files);
    setIdeaFilePreviews(files.filter(f => f.type.startsWith("image/")).map(f => URL.createObjectURL(f)));
    e.target.value = "";
  };

  const removeIdeaFile = (idx: number) => {
    setIdeaFiles(ideaFiles.filter((_, i) => i !== idx));
    setIdeaFilePreviews(ideaFilePreviews.filter((_, i) => i !== idx));
    if (editBaseIdx === idx) setEditBaseIdx(-1);
  };

  const onEditBasePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      const parts = result.split(",");
      setEditBaseUploaded({ data: parts[1] || "", mime: parts[0].replace("data:", "").replace(";base64", "") || "image/jpeg" });
      setEditBaseUploadedPreview(result); setEditBaseIdx(-1);
    };
    reader.readAsDataURL(f); e.target.value = "";
  };

  // Upload slot: multiple files, fill slots sequentially from clicked position
  const onSlotFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    const newSlots = [...uploadSlots];
    let startIdx = activeSlotRef.current >= 0 ? activeSlotRef.current : 0;
    for (const file of files) {
      while (startIdx < MAX_UPLOAD_SLOTS && newSlots[startIdx] !== null) startIdx++;
      if (startIdx >= MAX_UPLOAD_SLOTS) break;
      const { data, mime } = await readFileAsBase64(file);
      newSlots[startIdx] = { data, mime };
      startIdx++;
    }
    setUploadSlots(newSlots);
    activeSlotRef.current = -1;
    e.target.value = "";
  };

  const onSlotClick = (idx: number) => {
    activeSlotRef.current = idx;
    slotInputRef.current?.click();
  };

  const removeUploadSlot = (idx: number) => {
    setUploadSlots(prev => { const n = [...prev]; n[idx] = null; return n; });
  };

  const reorderUploadSlots = (from: number, to: number) => {
    setUploadSlots(prev => {
      const n = [...prev];
      [n[from], n[to]] = [n[to], n[from]];
      return n;
    });
  };

  // Drag-and-drop from OS file manager
  const onFileDrop = async (startIdx: number, files: File[]) => {
    if (!files.length) return;
    const newSlots = [...uploadSlots];
    let idx = startIdx;
    for (const file of files) {
      while (idx < MAX_UPLOAD_SLOTS && newSlots[idx] !== null) idx++;
      if (idx >= MAX_UPLOAD_SLOTS) break;
      const { data, mime } = await readFileAsBase64(file);
      newSlots[idx] = { data, mime };
      idx++;
    }
    setUploadSlots(newSlots);
  };

  // ── Mode switching ────────────────────────────────────────────────────────

  const clearImageState = () => {
    setImageHistory([]); setCurrentImageIdx(-1); setImageGenCount(0);
    setInlineEditCount(0); setShowInlineEdit(false); setInlineEditInstruction("");
    setUploadSlots(Array(MAX_UPLOAD_SLOTS).fill(null)); setUploadCarouselIdx(0);
    setImagePrompt("");
    setEditBaseIdx(-1); setEditBaseUploaded(null); setEditBaseUploadedPreview(""); setEditInstruction("");
  };

  const switchMode = (mode: ImageMode) => {
    clearImageState();
    setImageMode(mode);
    if (mode === "edit") setEditBaseIdx(ideaFiles.length > 0 ? 0 : -1);
  };

  const goChangeMode = () => { clearImageState(); setImageMode(null); };

  // ── AI actions ─────────────────────────────────────────────────────────────

  const generateText = async () => {
    if (!idea.trim() || textGenCount >= MAX_TEXT_ATTEMPTS) return;
    setLoadingText(true);
    try {
      const imageData = await Promise.all(ideaFiles.filter(f => f.type.startsWith("image/")).map(readFileAsBase64));
      const { data } = await api.post(`/post-creator/${businessId}/generate-text`, {
        idea, url: ideaUrl.trim() || undefined,
        images: imageData.length > 0 ? imageData : undefined,
      });
      const newText: string = data.text;
      const newHistory = [...textHistory, newText];
      setTextHistory(newHistory); setCurrentTextIdx(newHistory.length - 1);
      setPostText(newText); setTextGenCount(textGenCount + 1);
      setUsedModel(data.model_used === "gpt" ? "gpt" : "claude");
    } catch (e: any) {
      const d = e?.response?.data;
      const detail = (typeof d === "string" ? d : d?.detail) || e?.message || "нет ответа";
      const status = e?.response?.status ? ` [${e.response.status}]` : "";
      const err = `Ошибка${status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
      const newHistory = [...textHistory, err];
      setTextHistory(newHistory); setCurrentTextIdx(newHistory.length - 1);
      setPostText(err); setTextGenCount(textGenCount + 1);
    } finally { setLoadingText(false); }
  };

  const navigateText = (dir: -1 | 1) => {
    const i = currentTextIdx + dir;
    if (i < 0 || i >= textHistory.length) return;
    setCurrentTextIdx(i); setPostText(textHistory[i]);
  };

  const generateImage = async () => {
    if (!imagePrompt.trim() || imageGenCount >= MAX_IMAGE_ATTEMPTS) return;
    setLoadingImage(true);
    try {
      const { data } = await api.post(`/post-creator/${businessId}/generate-image`, { prompt: imagePrompt.trim(), aspect_ratio: "1:1" });
      const newHistory = [...imageHistory, data.image_base64 as string];
      setImageHistory(newHistory); setCurrentImageIdx(newHistory.length - 1);
      setImageGenCount(imageGenCount + 1);
    } catch (e: any) {
      alert("Ошибка генерации: " + (e?.response?.data?.detail || "попробуй изменить промт"));
    } finally { setLoadingImage(false); }
  };

  const editImageFromBlock3c = async () => {
    const hasUploadedBase = !!editBaseUploaded;
    const hasAttachedBase = ideaFiles.length > 0 && editBaseIdx >= 0;
    if (!editInstruction.trim() || (!hasUploadedBase && !hasAttachedBase)) return;
    setLoadingImage(true);
    try {
      let baseImage: { data: string; mime: string };
      let refImages: { data: string; mime: string }[] = [];
      if (hasUploadedBase) {
        baseImage = editBaseUploaded!;
        refImages = await Promise.all(ideaFiles.filter(f => f.type.startsWith("image/")).map(readFileAsBase64));
      } else {
        baseImage = await readFileAsBase64(ideaFiles[editBaseIdx]);
        refImages = await Promise.all(ideaFiles.filter((_, i) => i !== editBaseIdx && ideaFiles[i].type.startsWith("image/")).map(readFileAsBase64));
      }
      const { data } = await api.post(`/post-creator/${businessId}/edit-image`, {
        base_image: baseImage,
        reference_images: refImages.length > 0 ? refImages : undefined,
        instruction_ru: editInstruction,
      });
      const newHistory = [...imageHistory, data.image_base64 as string];
      setImageHistory(newHistory); setCurrentImageIdx(newHistory.length - 1);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || "попробуй изменить инструкцию";
      alert("Ошибка редактирования: " + (typeof detail === "string" ? detail : JSON.stringify(detail)));
    } finally { setLoadingImage(false); }
  };

  const editImageInline = async () => {
    if (!inlineEditInstruction.trim() || !aiImageB64 || inlineEditCount >= MAX_INLINE_EDITS) return;
    setLoadingImage(true);
    try {
      const { data } = await api.post(`/post-creator/${businessId}/edit-image`, {
        base_image: { data: aiImageB64, mime: "image/png" },
        instruction_ru: inlineEditInstruction,
      });
      const newHistory = [...imageHistory, data.image_base64 as string];
      setImageHistory(newHistory); setCurrentImageIdx(newHistory.length - 1);
      setInlineEditCount(inlineEditCount + 1); setInlineEditInstruction(""); setShowInlineEdit(false);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || "попробуй изменить инструкцию";
      alert("Ошибка редактирования: " + (typeof detail === "string" ? detail : JSON.stringify(detail)));
    } finally { setLoadingImage(false); }
  };

  const appendToPrompt = (t: string) => setImagePrompt(prev => prev ? `${prev}\n${t}` : t);
  const togglePlatform = (p: Platform) => setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const brandShortcutsNode = (setter: (v: string) => void, current: string): React.ReactNode =>
    (brandContext.visual_style || brandContext.brand_colors.length > 0) ? (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {brandContext.brand_colors.length > 0 && (
          <button onClick={() => setter(current ? `${current}. Используй фирменные цвета: ${brandContext.brand_colors.join(", ")}` : `Используй фирменные цвета: ${brandContext.brand_colors.join(", ")}`)}
            style={{ padding: "4px 10px", background: "#F8F6FF", border: "1px solid #DDD6FE", borderRadius: 12, cursor: "pointer", fontSize: 11, color: "#6B46C1", fontWeight: 600 }}>
            + Фирменные цвета
          </button>
        )}
        {brandContext.visual_style && (
          <button onClick={() => setter(current ? `${current}. Стиль как в нашем магазине: ${brandContext.visual_style}` : `Стиль как в нашем магазине: ${brandContext.visual_style}`)}
            style={{ padding: "4px 10px", background: "#F8F6FF", border: "1px solid #DDD6FE", borderRadius: 12, cursor: "pointer", fontSize: 11, color: "#6B46C1", fontWeight: 600 }}>
            + Фирменный стиль
          </button>
        )}
      </div>
    ) : null;

  const resetForm = () => {
    setIdea(""); setIdeaUrl(""); setIdeaFiles([]); setIdeaFilePreviews([]);
    setPostText(""); setTextHistory([]); setCurrentTextIdx(-1); setTextGenCount(0);
    setImageMode(null); clearImageState(); setSelectedPlatforms([]); setPublishNow(true); setPublishMsg("");
  };

  const deletePost = () => { clearDraft(businessId); resetForm(); };

  const publish = async () => {
    if (!postText.trim()) { alert("Сначала создай текст поста"); return; }
    if (!selectedPlatforms.length) { alert("Выбери хотя бы одну платформу"); return; }
    let scheduled_at: string | null = null;
    if (!publishNow) { if (!publishDate) { alert("Укажи дату"); return; } scheduled_at = new Date(`${publishDate}T${publishTime}:00`).toISOString(); }
    setPublishing(true); setPublishMsg("");
    try {
      const { data } = await api.post(`/post-creator/${businessId}/publish`, {
        post_text: postText, image_prompt: imagePrompt || null,
        image_base64: imageBase64ForPublish || null,
        images_base64: imagesBase64ForPublish || null,
        platforms: selectedPlatforms, scheduled_at,
      });
      const results: { platform: string; status: string; error?: string; warning?: string }[] = data.results || [];
      const ok = results.filter(r => r.status === "published");
      const fail = results.filter(r => r.status === "error" || r.status === "no_connection");
      const warns = results.filter(r => r.warning).map(r => r.warning as string);
      if (ok.length > 0 && fail.length === 0 && warns.length === 0) {
        setPublishMsg("✓ Опубликовано в " + ok.map(r => r.platform).join(", ") + "!");
        clearDraft(businessId); resetForm();
      } else if (ok.length > 0 && fail.length === 0) {
        setPublishMsg("✓ Опубликовано. ⚠ " + warns.join(" ")); clearDraft(businessId);
      } else if (ok.length > 0) {
        setPublishMsg(`✓ ${ok.map(r => r.platform).join(", ")} — OK. ⚠ ${fail.map(r => `${r.platform}: ${r.error}`).join("; ")}`);
      } else {
        setPublishMsg("⚠ " + fail.map(r => `${r.platform}: ${r.error}`).join("; "));
      }
    } catch (e: any) { setPublishMsg("⚠ " + (e?.response?.data?.detail || "Ошибка публикации")); }
    finally { setPublishing(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EAE8E2", padding: "0 2rem" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚡</span>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Быстрый пост</h1>
            {draftSaved && <span style={{ fontSize: 11, color: "#0F6E56", background: "#E1F5EE", borderRadius: 8, padding: "2px 8px", fontWeight: 600 }}>Черновик сохранён</span>}
          </div>
          {(hasText || idea) && (
            <button onClick={deletePost} style={{ padding: "7px 16px", background: "none", border: "1.5px solid #DC2626", borderRadius: 10, color: "#DC2626", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Удалить пост</button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "2rem" }}>

        {/* ── 1. Идея ── */}
        <div style={card}>
          <SectionTitle n={1} label="Опишите идею поста" done={false} />
          <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px", lineHeight: 1.6 }}>Расскажите о мероприятии, продукте, акции. Можно добавить ссылку или прикрепить фото.</p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 6 }}>🔗 Ссылка на сайт или пост (ИИ проанализирует)</label>
            <input type="url" value={ideaUrl} onChange={e => setIdeaUrl(e.target.value)} placeholder="https://example.com/post..."
              style={{ width: "100%", padding: "10px 14px", border: "1px solid #E0DED8", borderRadius: 10, fontSize: 13, background: "#FAFAF8", outline: "none", boxSizing: "border-box" }} />
          </div>
          <Textarea value={idea} onChange={setIdea} placeholder="Например: открываем новую точку 20 мая, адрес Ленина 15, скидка 20%..." rows={4} />
          <div style={{ marginTop: 12 }}>
            <button onClick={() => multiFileRef.current?.click()} style={{ background: "none", border: "1px solid #E0DED8", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#666", display: "inline-flex", alignItems: "center", gap: 6 }}>
              📎 {ideaFiles.length > 0 ? `Прикреплено фото: ${ideaFiles.length}` : "Прикрепить фото (до 10)"}
            </button>
            <input ref={multiFileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onMultiFileChange} />
          </div>
          {ideaFilePreviews.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {ideaFilePreviews.map((src, idx) => (
                <div key={idx} style={{ position: "relative" }}>
                  <img src={src} alt={`f-${idx}`} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #EAE8E2" }} />
                  <button onClick={() => removeIdeaFile(idx)} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#1a1a1a", border: "none", color: "#fff", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Btn label={loadingText ? "Генерирую текст..." : "✨ Сгенерировать текст"} onClick={generateText} disabled={!idea.trim() || loadingText || textGenCount >= MAX_TEXT_ATTEMPTS} loading={loadingText} />
            {textGenCount > 0 && <AttemptBadge current={textGenCount} max={MAX_TEXT_ATTEMPTS} label="Попыток" />}
          </div>
          {textGenCount >= MAX_TEXT_ATTEMPTS && <div style={{ marginTop: 8, fontSize: 12, color: "#DC2626" }}>Достигнут лимит попыток генерации текста ({MAX_TEXT_ATTEMPTS}).</div>}
        </div>

        {/* ── 2. Текст поста ── */}
        {(hasText || loadingText) && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, background: hasText ? "#0F6E56" : "#1a1a1a", color: "#fff" }}>{hasText ? "✓" : 2}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>Текст поста</div>
              </div>
              {hasText && <span style={{ fontSize: 11, color: MODEL_COLORS[usedModel], background: MODEL_COLORS[usedModel] + "15", border: `1px solid ${MODEL_COLORS[usedModel]}30`, borderRadius: 12, padding: "2px 9px", fontWeight: 600 }}>{MODEL_LABELS[usedModel]}</span>}
            </div>
            <Textarea value={postText} onChange={v => { setPostText(v); if (currentTextIdx >= 0) { const u = [...textHistory]; u[currentTextIdx] = v; setTextHistory(u); } }} placeholder="Здесь появится сгенерированный текст..." rows={14} />
            {textHistory.length > 1 && <HistoryNav current={currentTextIdx} total={textHistory.length} onPrev={() => navigateText(-1)} onNext={() => navigateText(1)} />}

            {/* ── Кнопки изображения ── */}
            {hasText && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #F0EEE8" }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 12, fontWeight: 600 }}>Изображение к посту:</div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {([
                    { mode: "prompt" as ImageMode, label: "🖼 Создать промт изображения" },
                    { mode: "upload" as ImageMode, label: "📁 Загрузить изображение" },
                    { mode: "edit"   as ImageMode, label: "✂️ Загрузить и отредактировать" },
                  ]).map(({ mode, label }) => {
                    const active = imageMode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => active ? goChangeMode() : switchMode(mode!)}
                        style={{ padding: "10px 20px", background: active ? "#4680C2" : "#fff", color: active ? "#fff" : "#555", border: active ? "none" : "1.5px solid #E0DED8", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 3a. Промт для фото + предпросмотр ── */}
        {imageMode === "prompt" && (
          <div style={card}>
            <SectionTitle n={3} label="Промт для изображения" done={!!imagePrompt.trim()} />
            <p style={{ color: "#888", fontSize: 13, margin: "0 0 14px" }}>Напишите промт — опишите что должно быть на изображении.</p>
            <BrandContextPanel brand={brandContext} onInsert={appendToPrompt} />
            <div style={{ marginBottom: 12, padding: "10px 14px", background: "#F8F7F4", borderRadius: 10, fontSize: 12, color: "#666" }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: "#555" }}>Примеры фраз:</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["background style like my store", "use my brand colors", "consistent with our visual identity", "same aesthetic as our shop interior"].map((h, i) => (
                  <button key={i} onClick={() => appendToPrompt(h)} style={{ padding: "3px 10px", background: "#fff", border: "1px solid #E0DED8", borderRadius: 12, cursor: "pointer", fontSize: 11, color: "#555" }}>+ {h}</button>
                ))}
              </div>
            </div>
            <Textarea value={imagePrompt} onChange={setImagePrompt} placeholder="A professional product photo of a coffee cup on a wooden table, warm lighting, bokeh background, photorealistic..." rows={4} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
              {imagePrompt.trim() && <Btn label={loadingImage ? "Генерирую..." : "🖼 Сгенерировать изображение"} onClick={generateImage} disabled={loadingImage || imageGenCount >= MAX_IMAGE_ATTEMPTS} loading={loadingImage} color="#4680C2" />}
              {imageGenCount > 0 && <AttemptBadge current={imageGenCount} max={MAX_IMAGE_ATTEMPTS} label="Генераций" />}
            </div>
            {imageGenCount >= MAX_IMAGE_ATTEMPTS && <div style={{ marginTop: 8, fontSize: 12, color: "#DC2626" }}>Достигнут лимит генераций ({MAX_IMAGE_ATTEMPTS}).</div>}

            {/* Предпросмотр внутри блока */}
            <AiImagePreview
              aiImageB64={aiImageB64}
              imageHistory={imageHistory}
              currentImageIdx={currentImageIdx}
              setCurrentImageIdx={setCurrentImageIdx}
              loadingImage={loadingImage}
              inlineEditCount={inlineEditCount}
              showInlineEdit={showInlineEdit}
              setShowInlineEdit={setShowInlineEdit}
              inlineEditInstruction={inlineEditInstruction}
              setInlineEditInstruction={setInlineEditInstruction}
              onInlineEdit={editImageInline}
              brandShortcutsNode={brandShortcutsNode(setInlineEditInstruction, inlineEditInstruction)}
            />
          </div>
        )}

        {/* ── 3b. Загрузить изображение (грид 10 слотов + предпросмотр) ── */}
        {imageMode === "upload" && (
          <div
            style={card}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
              if (files.length) onFileDrop(0, files);
            }}
          >
            <SectionTitle n={3} label="Загрузить изображение" done={uploadFilled.length > 0} />
            <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px" }}>
              Нажмите на ячейку, чтобы добавить фото (можно выбрать сразу несколько). Или перетащите фото прямо из папки.
              {uploadFilled.length > 1 && <span style={{ color: "#4680C2", fontWeight: 600 }}> Загружено {uploadFilled.length} фото — будет опубликовано как альбом.</span>}
            </p>
            <UploadGrid
              slots={uploadSlots}
              onSlotClick={onSlotClick}
              onRemove={removeUploadSlot}
              onReorder={reorderUploadSlots}
              onFileDrop={onFileDrop}
            />
            <input ref={slotInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onSlotFileChange} />
            <div style={{ marginTop: 10, fontSize: 12, color: "#aaa" }}>Можно добавить до {MAX_UPLOAD_SLOTS} изображений</div>

            {/* Предпросмотр внутри блока */}
            {uploadFilled.length > 0 && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #F0EEE8" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Предпросмотр</div>
                  {uploadFilled.length > 1 && <span style={{ fontSize: 11, color: "#4680C2", background: "#EFF6FF", borderRadius: 12, padding: "2px 9px", fontWeight: 600 }}>Альбом: {uploadFilled.length} фото</span>}
                </div>
                <UploadCarousel slots={uploadSlots} carouselIdx={uploadCarouselIdx} setCarouselIdx={setUploadCarouselIdx} />
              </div>
            )}
          </div>
        )}

        {/* ── 3c. Загрузить и отредактировать + предпросмотр ── */}
        {imageMode === "edit" && (
          <div style={card}>
            <SectionTitle n={3} label="Загрузить и отредактировать фото" done={false} />
            <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px" }}>Выберите основное фото (которое будет редактироваться), остальные прикреплённые — референсы. ИИ изменит фото по вашей инструкции.</p>

            {ideaFilePreviews.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#666", fontWeight: 600, marginBottom: 8 }}>Основное фото из блока 1:</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ideaFilePreviews.map((src, idx) => (
                    <div key={idx} onClick={() => { setEditBaseIdx(idx); setEditBaseUploaded(null); setEditBaseUploadedPreview(""); }}
                      style={{ position: "relative", cursor: "pointer", border: editBaseIdx === idx && !editBaseUploaded ? "3px solid #6B46C1" : "2px solid #E0DED8", borderRadius: 10, overflow: "hidden" }}>
                      <img src={src} alt={`base-${idx}`} style={{ width: 72, height: 72, objectFit: "cover", display: "block" }} />
                      {editBaseIdx === idx && !editBaseUploaded && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#6B46C1", color: "#fff", fontSize: 9, fontWeight: 700, textAlign: "center", padding: "2px 0" }}>ОСНОВА</div>}
                    </div>
                  ))}
                </div>
                {editBaseIdx >= 0 && !editBaseUploaded && ideaFilePreviews.length > 1 && <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>Остальные {ideaFilePreviews.length - 1} фото → референсы для ИИ</div>}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <button onClick={() => editBaseRef.current?.click()} style={{ background: editBaseUploaded ? "#F0EBF8" : "none", border: `1px solid ${editBaseUploaded ? "#6B46C1" : "#E0DED8"}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, color: editBaseUploaded ? "#6B46C1" : "#666", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {editBaseUploaded ? "✓ Загружено своё фото (нажмите, чтобы заменить)" : "📂 Загрузить своё фото для редактирования"}
              </button>
              <input ref={editBaseRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onEditBasePhoto} />
              {editBaseUploadedPreview && <img src={editBaseUploadedPreview} alt="edit-base" style={{ display: "block", marginTop: 8, width: 120, height: 120, objectFit: "cover", borderRadius: 10, border: "2px solid #6B46C1" }} />}
            </div>

            <div style={{ fontSize: 12, color: "#666", fontWeight: 600, marginBottom: 6 }}>Инструкция по редактированию (на русском):</div>
            {brandShortcutsNode(setEditInstruction, editInstruction)}
            <Textarea value={editInstruction} onChange={setEditInstruction} placeholder="Например: замени фон на белый, добавь тёплые фирменные цвета, сохрани общую композицию..." rows={4} />
            <div style={{ marginTop: 14 }}>
              <Btn label={loadingImage ? "Редактирую..." : "✂️ Редактировать фото"} onClick={editImageFromBlock3c}
                disabled={!editInstruction.trim() || loadingImage || (!editBaseUploaded && (ideaFiles.length === 0 || editBaseIdx < 0))}
                loading={loadingImage} color="#6B46C1" />
            </div>

            {/* Предпросмотр внутри блока */}
            <AiImagePreview
              aiImageB64={aiImageB64}
              imageHistory={imageHistory}
              currentImageIdx={currentImageIdx}
              setCurrentImageIdx={setCurrentImageIdx}
              loadingImage={loadingImage}
              inlineEditCount={inlineEditCount}
              showInlineEdit={showInlineEdit}
              setShowInlineEdit={setShowInlineEdit}
              inlineEditInstruction={inlineEditInstruction}
              setInlineEditInstruction={setInlineEditInstruction}
              onInlineEdit={editImageInline}
              brandShortcutsNode={brandShortcutsNode(setInlineEditInstruction, inlineEditInstruction)}
            />
          </div>
        )}

        {/* ── 4. Платформы ── */}
        {hasText && (
          <div style={card}>
            <SectionTitle n={4} label="Куда публиковать" done={selectedPlatforms.length > 0} />
            <p style={{ color: "#888", fontSize: 13, margin: "0 0 16px" }}>Выберите одну или несколько подключённых платформ.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {connectedPlatforms.length === 0 && <div style={{ fontSize: 13, color: "#aaa" }}>Нет подключённых платформ. <a href="/platforms" style={{ color: "#1a1a1a", fontWeight: 600 }}>Подключить →</a></div>}
              {connectedPlatforms.map(({ platform, page_name }) => {
                const meta = PLATFORM_META[platform]; const active = selectedPlatforms.includes(platform);
                return (
                  <button key={platform} onClick={() => togglePlatform(platform)} style={{ padding: "10px 20px", borderRadius: 12, border: "2px solid", borderColor: active ? meta.color : "#E0DED8", background: active ? meta.color + "18" : "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: meta.color }}>{meta.icon}</span>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active ? meta.color : "#1a1a1a" }}>{meta.label}</div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>{page_name}</div>
                    </div>
                    {active && <span style={{ marginLeft: 4, fontSize: 13, color: meta.color }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 5. Расписание ── */}
        {hasText && selectedPlatforms.length > 0 && (
          <div style={card}>
            <SectionTitle n={5} label="Время публикации" done={false} />
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {[{ v: true, l: "⚡ Опубликовать сейчас" }, { v: false, l: "📅 Запланировать" }].map(o => (
                <button key={String(o.v)} onClick={() => setPublishNow(o.v)} style={{ padding: "9px 20px", borderRadius: 10, border: "2px solid", borderColor: publishNow === o.v ? "#1a1a1a" : "#E0DED8", background: publishNow === o.v ? "#1a1a1a" : "#fff", color: publishNow === o.v ? "#fff" : "#666", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{o.l}</button>
              ))}
            </div>
            {!publishNow && (
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div><label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>Дата</label><input type="date" value={publishDate} onChange={e => setPublishDate(e.target.value)} style={{ padding: "9px 14px", border: "1px solid #E0DED8", borderRadius: 10, fontSize: 13, background: "#FAFAF8", outline: "none" }} /></div>
                <div><label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>Время</label><input type="time" value={publishTime} onChange={e => setPublishTime(e.target.value)} style={{ padding: "9px 14px", border: "1px solid #E0DED8", borderRadius: 10, fontSize: 13, background: "#FAFAF8", outline: "none" }} /></div>
              </div>
            )}
          </div>
        )}

        {/* ── Публикация ── */}
        {hasText && selectedPlatforms.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button onClick={publish} disabled={publishing} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", background: publishing ? "#888" : "#1a1a1a", color: "#fff", fontSize: 16, fontWeight: 700, cursor: publishing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {publishing ? "⏳ Публикую..." : "🚀 Отправить на публикацию"}
            </button>
            {publishMsg && (
              <div style={{ marginTop: 14, padding: "14px 20px", borderRadius: 12, background: publishMsg.startsWith("✓") ? "#E1F5EE" : "#FFF3CD", color: publishMsg.startsWith("✓") ? "#0F6E56" : "#856404", fontSize: 14, fontWeight: 600, textAlign: "center" }}>
                {publishMsg}
                {publishMsg.startsWith("✓") && <a href="/content" style={{ marginLeft: 12, color: "#0F6E56", textDecoration: "underline", fontWeight: 700 }}>Открыть контент-план →</a>}
              </div>
            )}
          </div>
        )}

        {(hasText || idea.trim()) && (
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <button onClick={deletePost} style={{ padding: "10px 28px", background: "none", border: "1.5px solid #DC2626", borderRadius: 10, color: "#DC2626", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>🗑 Удалить пост</button>
          </div>
        )}

      </div>
    </div>
  );
}

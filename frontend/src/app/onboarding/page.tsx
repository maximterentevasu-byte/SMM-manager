"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useMobile } from "@/hooks/useMobile";

const STEPS = [
  { id: "business",  label: "Бизнес",      icon: "🏢" },
  { id: "audience",  label: "Аудитория",    icon: "👥" },
  { id: "platforms", label: "Площадки",     icon: "📱" },
  { id: "voice",     label: "Голос бренда", icon: "🎯" },
  { id: "brand",     label: "Стиль",        icon: "🎨" },
  { id: "clarify",   label: "Уточнения",    icon: "🤖" },
  { id: "strategy",  label: "Стратегия",    icon: "📋" },
  { id: "rubrics",   label: "Рубрики",      icon: "🗂" },
  { id: "launch",    label: "Запуск",       icon: "🚀" },
];

const PRICE_SEGMENTS = [
  { value: "budget",  label: "Бюджетный", desc: "до 500 ₽ средний чек" },
  { value: "economy", label: "Эконом",    desc: "от 500 до 1000 ₽ средний чек" },
  { value: "middle",  label: "Средний",   desc: "1000–5000 ₽ средний чек" },
  { value: "premium", label: "Премиум",   desc: "от 5000 ₽ средний чек" },
];

const BRAND_VOICES = [
  { value: "friendly",  label: "Дружелюбный сосед", desc: "Тепло, просто, с юмором" },
  { value: "expert",    label: "Серьёзный эксперт",  desc: "Авторитетно, профессионально" },
  { value: "innovator", label: "Инноватор",          desc: "Современно, динамично" },
  { value: "family",    label: "Семейный бренд",     desc: "Заботливо, душевно" },
  { value: "luxury",    label: "Люксовый",           desc: "Элегантно, изысканно" },
  { value: "fun",       label: "Весёлый и дерзкий",  desc: "Ярко, с иронией и мемами" },
];

const SMM_METRICS_OPTIONS = [
  "Подписчики",
  "Охваты/Показы",
  "ER вовлечённость ЦА",
  "Лайки/Реакции",
  "Комментарии",
  "Репосты",
  "Количество постов",
  "Виральность",
];

const PLATFORM_LABELS: Record<string, string> = {
  telegram:  "Telegram",
  vk:        "ВКонтакте",
  tiktok:    "TikTok",
  instagram: "Instagram",
  max:       "Max",
};

const MIX_COLORS: Record<string, string> = {
  sales: "#E8744A",
  educational: "#4A90E8",
  entertainment: "#52C87A",
  ugc_triggers: "#9B59B6",
};
const MIX_LABELS: Record<string, string> = {
  sales: "Продажи",
  educational: "Обучение",
  entertainment: "Развлечения",
  ugc_triggers: "UGC",
};

const RUBRIC_TYPE_COLORS: Record<string, string> = {
  sales: "#FFEEE6",
  educational: "#E6F0FF",
  entertainment: "#E6FFEf",
};
const RUBRIC_TYPE_LABELS: Record<string, string> = {
  sales: "Продажи",
  educational: "Обучение",
  entertainment: "Развлечения",
};

type BrandAsset = { file: File; preview: string; label: string };

type FormData = {
  name: string; niche: string; usp: string; price_segment: string; geo: string;
  address: string; contact_info: string;
  business_goals: string; new_directions: string;
  survey_clients: boolean; tools_description: string; monthly_message: string;
  audience_primary: string; audience_non_target: string;
  audience_pains: string[]; audience_objections: string[];
  smm_metrics: string[];
  competitors: { name: string; url: string }[];
  platforms: string[]; platform_goals: Record<string, string>;
  brand_voice: string; visual_style: string; content_restrictions: string[];
  brand_colors: string[]; logo_url: string;
  brand_colors_fonts: string;
  social_references: string;
};

type Rubric = {
  name: string; goal: string; format: string; tone: string;
  structure: string[]; example_topics: string[];
  forbidden: string[]; frequency: string; type: string;
};

type StrategyItem = {
  platform: string; goal: string; target_audience: string; tone: string;
  posts_per_week: number; best_posting_times: string[];
  content_mix: Record<string, number>;
  content_pillars: string[];
  rubrics: Rubric[];
};

const INITIAL: FormData = {
  name: "", niche: "", usp: "", price_segment: "middle", geo: "",
  address: "", contact_info: "",
  business_goals: "", new_directions: "",
  survey_clients: false, tools_description: "", monthly_message: "",
  audience_primary: "", audience_non_target: "",
  audience_pains: ["", "", ""], audience_objections: ["", ""],
  smm_metrics: [],
  competitors: [{ name: "", url: "" }],
  platforms: ["telegram"], platform_goals: { telegram: "loyalty", vk: "sales" },
  brand_voice: "friendly", visual_style: "", content_restrictions: [],
  brand_colors: [], logo_url: "",
  brand_colors_fonts: "",
  social_references: "",
};

export default function OnboardingPage() {
  const isMobile = useMobile();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [clarifyQs, setClarifyQs] = useState<{ question: string; field: string }[]>([]);
  const [clarifyAs, setClarifyAs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");

  const [generatingStrategy, setGeneratingStrategy] = useState(false);
  const [generatingRubrics, setGeneratingRubrics] = useState(false);
  const [strategy, setStrategy] = useState<StrategyItem[] | null>(null);
  const [ppwLocal, setPpwLocal] = useState<Record<string, number>>({});
  const [selectedPlatform, setSelectedPlatform] = useState<string>("");
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);
  const [schedDays, setSchedDays] = useState<string[]>([]);
  const [schedTimes, setSchedTimes] = useState<string[]>([]);
  const [schedAiExperiment, setSchedAiExperiment] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [rubricsChat, setRubricsChat] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [rubricsChatInput, setRubricsChatInput] = useState("");
  const [rubricsLoading, setRubricsLoading] = useState(false);
  const [expandedRubric, setExpandedRubric] = useState<string | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");

  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const brandAssetInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = async () => {
    try {
      const resp = await api.get("/onboarding/export-template", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement("a"); a.href = url; a.download = "smm_profile_template.xlsx"; a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Ошибка скачивания шаблона"); }
  };

  const importFromExcel = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportError("");
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const { data } = await api.post("/onboarding/parse-excel", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const p = data.profile;
      setForm(prev => ({
        ...prev,
        name:                 p.name                 || prev.name,
        niche:                p.niche                || prev.niche,
        usp:                  p.usp                  || prev.usp,
        price_segment:        p.price_segment        || prev.price_segment,
        geo:                  p.geo                  || prev.geo,
        address:              p.address              || prev.address,
        contact_info:         p.contact_info         || prev.contact_info,
        business_goals:       p.business_goals       || prev.business_goals,
        survey_clients:       p.survey_clients !== undefined ? p.survey_clients : prev.survey_clients,
        new_directions:       p.new_directions       || prev.new_directions,
        tools_description:    p.tools_description    || prev.tools_description,
        monthly_message:      p.monthly_message      || prev.monthly_message,
        audience_primary:     p.audience_primary     || prev.audience_primary,
        audience_non_target:  p.audience_non_target  || prev.audience_non_target,
        audience_pains:       p.audience_pains?.length ? p.audience_pains : prev.audience_pains,
        audience_objections:  p.audience_objections?.length ? p.audience_objections : prev.audience_objections,
        smm_metrics:          p.smm_metrics?.length ? p.smm_metrics : prev.smm_metrics,
        competitors:          p.competitors?.length ? p.competitors : prev.competitors,
        platforms:            p.platforms?.length ? p.platforms : prev.platforms,
        platform_goals:       p.platform_goals && Object.keys(p.platform_goals).length > 0 ? p.platform_goals : prev.platform_goals,
        brand_voice:          p.brand_voice          || prev.brand_voice,
        visual_style:         p.visual_style         || prev.visual_style,
        content_restrictions: p.content_restrictions?.length ? p.content_restrictions : prev.content_restrictions,
        brand_colors_fonts:   p.brand_colors_fonts   || prev.brand_colors_fonts,
        social_references:    p.social_references    || prev.social_references,
      }));
      setShowImportModal(false);
      setImportFile(null);
    } catch (e: any) {
      setImportError(e.response?.data?.detail || "Ошибка чтения файла. Убедитесь, что используете шаблон.");
    } finally {
      setImportLoading(false);
    }
  };

  const set = (key: keyof FormData, val: unknown) => setForm(f => ({ ...f, [key]: val }));
  const setPain = (i: number, v: string) => { const a = [...form.audience_pains]; a[i] = v; set("audience_pains", a); };
  const setObj = (i: number, v: string) => { const a = [...form.audience_objections]; a[i] = v; set("audience_objections", a); };
  const togglePlatform = (p: string) => set("platforms", form.platforms.includes(p) ? form.platforms.filter(x => x !== p) : [...form.platforms, p]);
  const toggleMetric = (m: string) => set("smm_metrics", form.smm_metrics.includes(m) ? form.smm_metrics.filter(x => x !== m) : [...form.smm_metrics, m]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rubricsChat]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const saveAndClarify = async () => {
    setLoading(true);
    setError("");
    try {
      const compressedAssets = await Promise.all(brandAssets.map(async a => {
        const isImage = a.file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp)$/i.test(a.file.name);
        if (!isImage || !a.preview) return { name: a.file.name, label: a.label };
        try {
          const dataUrl = await new Promise<string>((res, rej) => {
            const img = new window.Image();
            img.onload = () => {
              const MAX = 800;
              const scale = Math.min(1, MAX / Math.max(img.width, img.height));
              const w = Math.round(img.width * scale);
              const h = Math.round(img.height * scale);
              const canvas = document.createElement("canvas");
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext("2d");
              if (!ctx) { rej(new Error("no ctx")); return; }
              ctx.drawImage(img, 0, 0, w, h);
              res(canvas.toDataURL("image/jpeg", 0.7));
            };
            img.onerror = rej;
            img.src = a.preview;
          });
          const parts = dataUrl.split(",");
          if (!parts[1]) throw new Error("empty");
          return { name: a.file.name, label: a.label, data: parts[1], mime: "image/jpeg" };
        } catch {
          // canvas failed — use raw preview data directly
          const parts = a.preview.split(",");
          return parts[1]
            ? { name: a.file.name, label: a.label, data: parts[1], mime: a.file.type || "image/jpeg" }
            : { name: a.file.name, label: a.label };
        }
      }));
      const payload = {
        ...form,
        products: [],
        active_promotions: "",
        brand_assets_labels: compressedAssets,
        audience_pains: form.audience_pains.filter(Boolean),
        audience_objections: form.audience_objections.filter(Boolean),
        competitors: form.competitors.filter(c => c.name || c.url).map(c => ({ name: c.name, url: c.url, pros: "", cons: "" })),
        brand_voice_examples: [],
      };
      // Если бизнес уже существует — обновляем его, не создаём новый (иначе слетают подключённые платформы)
      const existingId = typeof window !== "undefined" ? localStorage.getItem("businessId") : null;
      const endpoint = existingId ? `/onboarding/save-profile/${existingId}` : "/onboarding/save-profile/new";
      const { data } = await api.post(endpoint, payload);
      const bId = data.business_id;
      setBusinessId(bId);
      if (typeof window !== "undefined") localStorage.setItem("businessId", bId);
      const { data: qs } = await api.post(`/onboarding/clarify/${bId}`);
      setClarifyQs(qs.questions || []);
      setStep(5);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d: any) => `${d.loc?.join(".")}: ${d.msg}`).join("; ")
        : typeof detail === "string" ? detail : err?.message || "Неизвестная ошибка";
      setError(`Ошибка сохранения: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (bId: string) => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const { data } = await api.get(`/businesses/${bId}/strategy`);
        if (data.ready && data.strategy) {
          clearInterval(pollRef.current!);
          setStrategy(data.strategy);
          const init: Record<string, number> = {};
          data.strategy.forEach((ps: any) => { init[ps.platform] = ps.posts_per_week || 3; });
          setPpwLocal(init);
          setSelectedPlatform(data.strategy[0]?.platform || "");
          setGeneratingStrategy(false);
          setLaunching(false);
          setStep(6);
        }
      } catch {}
      if (attempts > 72) {
        clearInterval(pollRef.current!);
        setError("Генерация заняла слишком долго. Попробуйте ещё раз.");
        setGeneratingStrategy(false);
        setLaunching(false);
      }
    }, 5000);
  };

  const launch = async () => {
    setLaunching(true);
    setError("");
    try {
      for (const q of clarifyQs) {
        const answer = clarifyAs[q.field];
        if (answer) {
          await api.post(`/onboarding/answer-clarification/${businessId}`, { question: q.question, answer });
        }
      }
      await api.post(`/businesses/${businessId}/generate-strategy`);
      setGeneratingStrategy(true);
      startPolling(businessId!);
    } catch {
      setError("Ошибка запуска. Попробуйте ещё раз.");
      setLaunching(false);
    }
  };

  const refineStrategy = async (message: string) => {
    setEditLoading(true);
    setError("");
    try {
      const { data } = await api.post(`/businesses/${businessId}/refine-strategy`, { message });
      setStrategy(data.strategy);
      setEditingPlatform(null);
      setEditMessage("");
    } catch {
      setError("Ошибка редактирования. Попробуйте ещё раз.");
    } finally {
      setEditLoading(false);
    }
  };

  const approveStrategy = async () => {
    setGeneratingRubrics(true);
    try {
      // Сохраняем posts_per_week если пользователь изменил значения
      for (const [platform, ppw] of Object.entries(ppwLocal)) {
        const original = strategy?.find(ps => ps.platform === platform)?.posts_per_week;
        if (original !== ppw && businessId) {
          await api.patch(`/businesses/${businessId}/posts-per-week`, { platform, posts_per_week: ppw });
        }
      }
      // Сохраняем расписание публикаций
      if (businessId) {
        await api.patch(`/businesses/${businessId}/posting-schedule`, {
          required_days: schedDays,
          required_times: schedTimes,
          ai_experiment: schedAiExperiment,
        });
      }
      // Обновляем локальное состояние стратегии
      if (strategy) {
        setStrategy(strategy.map(ps => ppwLocal[ps.platform] !== undefined
          ? { ...ps, posts_per_week: ppwLocal[ps.platform] }
          : ps
        ));
      }
    } catch { /* не критично, продолжаем */ }
    await new Promise(r => setTimeout(r, 500));
    setGeneratingRubrics(false);
    setStep(7);
  };

  const chatRubrics = async () => {
    const msg = rubricsChatInput.trim();
    if (!msg || rubricsLoading) return;
    setRubricsChat(prev => [...prev, { role: "user", text: msg }]);
    setRubricsChatInput("");
    setRubricsLoading(true);
    try {
      const { data } = await api.post(`/businesses/${businessId}/refine-strategy`, {
        message: `Обнови рубрики согласно запросу: ${msg}`,
      });
      setStrategy(data.strategy);
      setRubricsChat(prev => [...prev, { role: "ai", text: "Рубрики обновлены ✓" }]);
    } catch {
      setRubricsChat(prev => [...prev, { role: "ai", text: "Ошибка, попробуйте ещё раз." }]);
    } finally {
      setRubricsLoading(false);
    }
  };

  const approveRubrics = async () => {
    setLaunching(true);
    try {
      const now = new Date();
      await api.post(`/content/${businessId}/generate-plan`, {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
      });
    } catch {}
    setStep(8);
    setLaunching(false);
  };

  const skipOnboarding = async () => {
    const storedId = typeof window !== "undefined" ? localStorage.getItem("businessId") : null;
    if (!storedId) {
      try {
        const { data } = await api.post("/onboarding/quick-start");
        if (typeof window !== "undefined") localStorage.setItem("businessId", data.business_id);
      } catch {}
    }
    router.push("/home");
  };

  const currentPlatformStrategy = strategy?.find(s => s.platform === selectedPlatform);

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", border: "1px solid #E0DED8",
    borderRadius: 10, fontSize: 14, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box", background: "#fff",
  };
  const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "#444", display: "block", marginBottom: 6 };
  const hint: React.CSSProperties = { fontSize: 12, color: "#999", marginTop: 4 };
  const btnBack: React.CSSProperties = {
    flex: 1, padding: 13, background: "#F5F7FA", color: "#1F2937",
    border: "1px solid #E5E7EB", borderRadius: 12, cursor: "pointer", fontSize: 15,
  };
  const btnNext = (disabled = false): React.CSSProperties => ({
    flex: 2, padding: 13, background: disabled ? "#D1D5DB" : "#3478F6", color: "#fff",
    border: "none", borderRadius: 12, cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 15, fontWeight: 600,
  });

  const ContentMixBar = ({ mix }: { mix: Record<string, number> }) => (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden" }}>
        {Object.entries(mix).map(([key, val]) => (
          <div key={key} style={{ flex: val, background: MIX_COLORS[key] || "#999", minWidth: 0 }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
        {Object.entries(mix).map(([key, val]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#555" }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: MIX_COLORS[key] || "#999" }} />
            <span>{MIX_LABELS[key] || key}: {val}%</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FA", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @keyframes dot-pulse { 0%, 80%, 100% { opacity: 0.15 } 40% { opacity: 1 } }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>

      {/* Import Excel modal */}
      {showImportModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 200, padding: "1rem",
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowImportModal(false); }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "28px 28px 24px",
            width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Загрузить анкету из Excel</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#888" }}>
                  Скачайте шаблон, заполните его и загрузите обратно
                </p>
              </div>
              <button onClick={() => setShowImportModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#aaa", lineHeight: 1 }}>
                ×
              </button>
            </div>

            {/* Drop zone */}
            <div
              onClick={() => importInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setImportFile(f); }}
              style={{
                border: `2px dashed ${importFile ? "#00B5A6" : "#E5E7EB"}`,
                borderRadius: 14, padding: "28px 20px", textAlign: "center",
                cursor: "pointer", background: importFile ? "#F0FBF7" : "#F5F7FA",
                transition: "all 0.2s", marginBottom: 16,
              }}>
              <input
                ref={importInputRef}
                type="file" accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }}
              />
              {importFile ? (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#00B5A6" }}>{importFile.name}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    {(importFile.size / 1024).toFixed(1)} КБ · Нажмите чтобы заменить
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#444" }}>
                    Перетащите файл сюда или нажмите для выбора
                  </div>
                  <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>Поддерживается формат .xlsx</div>
                </div>
              )}
            </div>

            {importError && (
              <div style={{ padding: "10px 14px", background: "#FEF2F2", borderRadius: 10,
                fontSize: 13, color: "#DC2626", marginBottom: 12 }}>
                {importError}
              </div>
            )}

            <button
              onClick={importFromExcel}
              disabled={!importFile || importLoading}
              style={{
                width: "100%", padding: "13px", fontSize: 15, fontWeight: 600, color: "#fff",
                background: !importFile || importLoading ? "#D1D5DB" : "#3478F6",
                border: "none", borderRadius: 12, cursor: !importFile || importLoading ? "not-allowed" : "pointer",
                marginBottom: 12,
              }}>
              {importLoading ? "Читаю файл..." : "Загрузить и заполнить форму"}
            </button>

            <button
              onClick={downloadTemplate}
              style={{
                width: "100%", padding: "11px", fontSize: 13, fontWeight: 500,
                color: "#444", background: "#F5F7FA",
                border: "1px solid #E0DED8", borderRadius: 12, cursor: "pointer",
              }}>
              📥 Скачать шаблон заполнения (.xlsx)
            </button>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {(generatingStrategy || generatingRubrics) && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(245,247,250,0.97)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          zIndex: 100, gap: 16,
        }}>
          <div style={{ fontSize: 64, lineHeight: 1 }}>{generatingStrategy ? "🧠" : "🗂"}</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            {generatingStrategy ? "Генерирую стратегию..." : "Составляю рубрики..."}
          </h2>
          <p style={{ color: "#888", margin: 0, fontSize: 14 }}>
            {generatingStrategy ? "Анализирую профиль бизнеса · Займёт 30–90 секунд" : "Формирую контент-план рубрик..."}
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 12, height: 12, borderRadius: "50%", background: "#3478F6",
                animation: `dot-pulse 1.4s ${i * 0.35}s infinite ease-in-out`,
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: isMobile ? "0 16px" : "0 2rem" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", height: isMobile ? 52 : 60, gap: 12 }}>
          <span style={{ fontFamily: "'Manrope', sans-serif", fontSize: isMobile ? 17 : 20, fontWeight: 800, color: "#0D1B2A", letterSpacing: -0.5 }}>
            smm<span style={{ color: "#3478F6" }}>platform</span>
          </span>
          <span style={{ fontSize: isMobile ? 11 : 13, color: "#9CA3AF" }}>/ Настройка</span>
        </div>
      </div>

      <div style={{ maxWidth: step >= 6 ? 860 : 680, margin: "0 auto", padding: isMobile ? "16px 12px" : "2rem 1rem", transition: "max-width 0.3s" }}>
        {/* Progress bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: "100%", height: 3, borderRadius: 2,
                background: i <= step ? "#3478F6" : "#E5E7EB", transition: "background 0.3s" }} />
              <span style={{ fontSize: 9, color: i <= step ? "#3478F6" : "#9CA3AF",
                fontWeight: i === step ? 600 : 400, textAlign: "center", lineHeight: 1.3 }}>
                {s.icon} {s.label}
              </span>
            </div>
          ))}
        </div>

        {step < 8 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, marginTop: -16 }}>
            {step < 6 ? (
              <button onClick={() => { setShowImportModal(true); setImportError(""); setImportFile(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
                  background: "#F5F7FA", border: "1px solid #E0DED8", borderRadius: 10,
                  cursor: "pointer", fontSize: 13, color: "#444", fontWeight: 500,
                }}>
                📊 Загрузить из Excel
              </button>
            ) : <span />}
            <button onClick={skipOnboarding} style={{
              background: "none", border: "none", color: "#aaa",
              cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 0,
            }}>
              Заполнить позже →
            </button>
          </div>
        )}

        {/* ── STEP 0: Бизнес ── */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Расскажите о вашем бизнесе</h2>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>Эта информация поможет AI создать персональную стратегию</p>
            </div>

            <div>
              <label style={lbl}>Название бизнеса *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)}
                placeholder="Пиццерия Маэстро" style={inp} />
            </div>
            <div>
              <label style={lbl}>Ниша / сфера деятельности *</label>
              <input value={form.niche} onChange={e => set("niche", e.target.value)}
                placeholder="Ресторан, доставка пиццы" style={inp} />
            </div>
            <div>
              <label style={lbl}>Уникальное торговое предложение *</label>
              <textarea value={form.usp} onChange={e => set("usp", e.target.value)}
                placeholder="Чем вы отличаетесь от конкурентов?"
                style={{ ...inp, minHeight: 80, resize: "vertical" }} />
            </div>
            <div>
              <label style={lbl}>Город / район *</label>
              <input value={form.geo} onChange={e => set("geo", e.target.value)}
                placeholder="Москва, Марьино" style={inp} />
            </div>
            <div>
              <label style={lbl}>Адрес магазина / офиса</label>
              <input value={form.address} onChange={e => set("address", e.target.value)}
                placeholder="ул. Ленина, 12, ТЦ Радуга, 2 этаж" style={inp} />
              <p style={hint}>AI будет указывать этот адрес в постах — не придумывать свой</p>
            </div>
            <div>
              <label style={lbl}>Контакты (телефон, сайт, ссылки)</label>
              <input value={form.contact_info} onChange={e => set("contact_info", e.target.value)}
                placeholder="+7 999 123-45-67, pickme.ru, @pickme_bot" style={inp} />
              <p style={hint}>Эти данные появятся в постах вместо выдуманных ссылок</p>
            </div>

            <div>
              <label style={lbl}>Тактические цели бизнеса</label>
              <textarea value={form.business_goals} onChange={e => set("business_goals", e.target.value)}
                placeholder={"Например, вы планируете в течение 6 месяцев:\n– Открытие нового направления\n– Смену или расширение ассортимента\n– Создать и внедрить бонусную программу"}
                style={{ ...inp, minHeight: 100, resize: "vertical" }} />
            </div>

            <div>
              <label style={lbl}>Хотели бы вы провести опрос клиентов, насколько ваши тактические цели им интересны?</label>
              <div style={{ display: "flex", gap: 10 }}>
                {[{ v: true, l: "Да, хочу провести опрос" }, { v: false, l: "Нет, не нужно" }].map(opt => (
                  <div key={String(opt.v)} onClick={() => set("survey_clients", opt.v)}
                    style={{ flex: 1, padding: "12px 16px", border: `1.5px solid ${form.survey_clients === opt.v ? "#0D1B2A" : "#E5E7EB"}`,
                      borderRadius: 10, cursor: "pointer", textAlign: "center",
                      background: form.survey_clients === opt.v ? "#F5F7FA" : "#fff",
                      fontWeight: form.survey_clients === opt.v ? 600 : 400, fontSize: 14 }}>
                    {opt.l}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label style={lbl}>Операционные задачи бизнеса</label>
              <textarea value={form.new_directions} onChange={e => set("new_directions", e.target.value)}
                placeholder={"Возможно вы планируете в ближайшие 1–3 месяца:\n– Увеличить средний чек или количество клиентов\n– Запустить бонусную программу и рассказать о ней\n– Увеличить кол-во клиентов бонусной программы\n– Запустить продажи нового ассортимента"}
                style={{ ...inp, minHeight: 110, resize: "vertical" }} />
            </div>

            <div>
              <label style={lbl}>Опишите инструменты, с помощью которых планируете выполнять задачи</label>
              <textarea value={form.tools_description} onChange={e => set("tools_description", e.target.value)}
                placeholder={"Например:\n– Добавим акцию…\n– Проведём лотерею с условием покупки от…\n– Ожидаем поступление эксклюзивного товара…\n– При выпуске бонусной карты кэшбэк…"}
                style={{ ...inp, minHeight: 100, resize: "vertical" }} />
            </div>

            <div>
              <label style={lbl}>О чём вы считаете важно рассказать вашим клиентам в этом месяце?</label>
              <textarea value={form.monthly_message} onChange={e => set("monthly_message", e.target.value)}
                placeholder={"Например:\n– Рассказать про акцию…\n– Подсветить что у нас есть бонусная программа и её условия\n– Рассказать о новинках\n– Рассказать о мероприятиях"}
                style={{ ...inp, minHeight: 100, resize: "vertical" }} />
            </div>

            <div>
              <label style={lbl}>Ценовой сегмент</label>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 10 }}>
                {PRICE_SEGMENTS.map(ps => (
                  <div key={ps.value} onClick={() => set("price_segment", ps.value)}
                    style={{ padding: 12, border: `1.5px solid ${form.price_segment === ps.value ? "#0D1B2A" : "#E5E7EB"}`,
                      borderRadius: 10, cursor: "pointer", background: form.price_segment === ps.value ? "#F5F7FA" : "#fff" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{ps.label}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>{ps.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setStep(1)} disabled={!form.name || !form.niche || !form.usp || !form.geo}
              style={btnNext(!form.name || !form.niche || !form.usp || !form.geo)}>
              Далее →
            </button>
          </div>
        )}

        {/* ── STEP 1: Аудитория ── */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Кто ваши клиенты?</h2>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>AI будет писать посты именно для этих людей</p>
            </div>

            <div>
              <label style={lbl}>Основная аудитория *</label>
              <input value={form.audience_primary} onChange={e => set("audience_primary", e.target.value)}
                placeholder="Семьи с детьми 28-45 лет" style={inp} />
            </div>
            <div>
              <label style={lbl}>Кто не является вашей ЦА</label>
              <input value={form.audience_non_target} onChange={e => set("audience_non_target", e.target.value)}
                placeholder="Дети до 18 лет, люди вне города, бизнес-клиенты" style={inp} />
              <p style={hint}>Поможет AI не писать посты для нерелевантной аудитории</p>
            </div>
            <div>
              <label style={lbl}>Главные боли клиентов / Какие задачи клиента решает твой продукт</label>
              {form.audience_pains.map((p, i) => (
                <input key={i} value={p} onChange={e => setPain(i, e.target.value)}
                  placeholder={["Не знают что заказать на ужин", "Хочется быстро и вкусно", "Устали готовить"][i]}
                  style={{ ...inp, marginBottom: 8 }} />
              ))}
            </div>
            <div>
              <label style={lbl}>Типичные возражения</label>
              {form.audience_objections.map((o, i) => (
                <input key={i} value={o} onChange={e => setObj(i, e.target.value)}
                  placeholder={["Дорого", "Долго доставляют"][i]}
                  style={{ ...inp, marginBottom: 8 }} />
              ))}
            </div>
            <div>
              <label style={lbl}>Ключевые показатели SMM-стратегии, по которым вы будете оценивать эффективность</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SMM_METRICS_OPTIONS.map(m => (
                  <button key={m} onClick={() => toggleMetric(m)}
                    style={{ padding: "8px 16px", borderRadius: 20, border: "1.5px solid", cursor: "pointer", fontSize: 13,
                      borderColor: form.smm_metrics.includes(m) ? "#0D1B2A" : "#E5E7EB",
                      background: form.smm_metrics.includes(m) ? "#0D1B2A" : "#fff",
                      color: form.smm_metrics.includes(m) ? "#fff" : "#555" }}>
                    {m}
                  </button>
                ))}
              </div>
              <p style={hint}>Выберите что важнее всего отслеживать</p>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(0)} style={btnBack}>← Назад</button>
              <button onClick={() => setStep(2)} disabled={!form.audience_primary}
                style={btnNext(!form.audience_primary)}>Далее →</button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Площадки ── */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Где продвигаемся?</h2>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>Выберите площадки и цель для каждой</p>
            </div>
            {[
              { id: "telegram",  label: "Telegram",    icon: "✈",  desc: "Канал / группа" },
              { id: "vk",        label: "ВКонтакте",   icon: "В",  desc: "Группа / публичная страница" },
              { id: "tiktok",    label: "TikTok",       icon: "♪",  desc: "Аккаунт / профиль" },
              { id: "instagram", label: "Instagram",    icon: "📷", desc: "Аккаунт / бизнес-профиль" },
              { id: "max",       label: "Max",          icon: "М",  desc: "Аккаунт / сообщество" },
            ].map(pl => (
              <div key={pl.id} style={{ border: `1.5px solid ${form.platforms.includes(pl.id) ? "#0D1B2A" : "#E5E7EB"}`,
                borderRadius: 12, overflow: "hidden" }}>
                <div onClick={() => togglePlatform(pl.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                    cursor: "pointer", background: form.platforms.includes(pl.id) ? "#F5F7FA" : "#fff" }}>
                  <span style={{ width: 36, height: 36, borderRadius: 8, background: "#0D1B2A", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
                    {pl.icon}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{pl.label}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{pl.desc}</div>
                  </div>
                  <div style={{ width: 22, height: 22, borderRadius: "50%",
                    border: `2px solid ${form.platforms.includes(pl.id) ? "#0D1B2A" : "#ccc"}`,
                    background: form.platforms.includes(pl.id) ? "#0D1B2A" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {form.platforms.includes(pl.id) && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
                  </div>
                </div>
                {form.platforms.includes(pl.id) && (
                  <div style={{ padding: "12px 16px", borderTop: "1px solid #E5E7EB", background: "#fff" }}>
                    <label style={{ ...lbl, marginBottom: 8 }}>Цель для {pl.label}</label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[{ v: "sales", l: "Продажи" }, { v: "loyalty", l: "Лояльность" }, { v: "reach", l: "Охват" }].map(g => (
                        <button key={g.v}
                          onClick={() => set("platform_goals", { ...form.platform_goals, [pl.id]: g.v })}
                          style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontSize: 13,
                            borderColor: form.platform_goals[pl.id] === g.v ? "#0D1B2A" : "#E5E7EB",
                            background: form.platform_goals[pl.id] === g.v ? "#0D1B2A" : "#fff",
                            color: form.platform_goals[pl.id] === g.v ? "#fff" : "#555" }}>
                          {g.l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(1)} style={btnBack}>← Назад</button>
              <button onClick={() => setStep(3)} disabled={form.platforms.length === 0}
                style={btnNext(form.platforms.length === 0)}>Далее →</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Голос бренда ── */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Голос вашего бренда</h2>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>Как вы общаетесь с клиентами?</p>
            </div>
            <div>
              <label style={lbl}>Тональность общения</label>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 10 }}>
                {BRAND_VOICES.map(bv => (
                  <div key={bv.value} onClick={() => set("brand_voice", bv.value)}
                    style={{ padding: "12px 14px",
                      border: `1.5px solid ${form.brand_voice === bv.value ? "#0D1B2A" : "#E5E7EB"}`,
                      borderRadius: 10, cursor: "pointer",
                      background: form.brand_voice === bv.value ? "#F5F7FA" : "#fff" }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{bv.label}</div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{bv.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Что нельзя публиковать?</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["алкоголь", "политика", "конкуренты", "скидки", "агрессивные продажи"].map(r => (
                  <button key={r}
                    onClick={() => {
                      const curr = form.content_restrictions;
                      set("content_restrictions", curr.includes(r) ? curr.filter(x => x !== r) : [...curr, r]);
                    }}
                    style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontSize: 13,
                      borderColor: form.content_restrictions.includes(r) ? "#DC2626" : "#E5E7EB",
                      background: form.content_restrictions.includes(r) ? "#FEF2F2" : "#fff",
                      color: form.content_restrictions.includes(r) ? "#DC2626" : "#555" }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(2)} style={btnBack}>← Назад</button>
              <button onClick={() => setStep(4)} style={btnNext(false)}>Далее →</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Стиль ── */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Стиль бренда</h2>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>AI проанализирует материалы при создании стратегии и контент-плана</p>
            </div>

            {/* Визуальный стиль */}
            <div>
              <label style={lbl}>Визуальный стиль</label>
              <textarea value={form.visual_style} onChange={e => set("visual_style", e.target.value)}
                placeholder="Тёплые тона, фото еды крупным планом, уютная атмосфера"
                style={{ ...inp, minHeight: 80, resize: "vertical" }} />
              <p style={hint}>Опишите как должны выглядеть картинки к постам. Какой визуальный стиль? Какие цвета? Что показываем?</p>
            </div>

            {/* Фирменный стиль — загрузка файлов */}
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
              <label style={{ ...lbl, fontSize: 14, marginBottom: 6 }}>🎨 Фирменный стиль</label>
              <p style={{ color: "#888", fontSize: 13, margin: "0 0 14px", lineHeight: 1.6 }}>
                Прикрепите файлы: логотип, брендбук, макеты, фото вывески, маскот.
                До 20 файлов — фото или PDF. Для каждого файла укажите краткое описание (1–3 слова).
              </p>

              <input
                ref={brandAssetInputRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                style={{ display: "none" }}
                onChange={e => {
                  const files = e.target.files;
                  if (!files) return;
                  const remaining = 20 - brandAssets.length;
                  const arr = Array.from(files).slice(0, remaining);
                  arr.forEach(file => {
                    const reader = new FileReader();
                    reader.onload = ev => {
                      setBrandAssets(prev => [
                        ...prev,
                        { file, preview: ev.target?.result as string || "", label: "" },
                      ].slice(0, 20));
                    };
                    reader.readAsDataURL(file);
                  });
                  e.target.value = "";
                }}
              />

              {/* Drop zone */}
              <div
                onClick={() => brandAssets.length < 20 && brandAssetInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const files = e.dataTransfer.files;
                  const remaining = 20 - brandAssets.length;
                  const arr = Array.from(files).slice(0, remaining);
                  arr.forEach(file => {
                    const reader = new FileReader();
                    reader.onload = ev => {
                      setBrandAssets(prev => [
                        ...prev,
                        { file, preview: ev.target?.result as string || "", label: "" },
                      ].slice(0, 20));
                    };
                    reader.readAsDataURL(file);
                  });
                }}
                style={{
                  border: "2px dashed #E0DED8", borderRadius: 12, padding: "20px",
                  textAlign: "center", cursor: brandAssets.length < 20 ? "pointer" : "default",
                  background: "#F5F7FA", marginBottom: brandAssets.length > 0 ? 14 : 0,
                }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🖼</div>
                <div style={{ fontSize: 14, color: "#555" }}>
                  {brandAssets.length < 20
                    ? "Нажмите или перетащите файлы сюда"
                    : "Достигнут максимум (20 файлов)"}
                </div>
                <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
                  Фото или PDF · до 20 файлов · загружено {brandAssets.length}/20
                </div>
              </div>

              {/* File list with labels */}
              {brandAssets.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {brandAssets.map((asset, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", background: "#F5F7FA", borderRadius: 10,
                    }}>
                      {asset.file.type === "application/pdf" ? (
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: "#E8EAF0",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                          📄
                        </div>
                      ) : (
                        <img src={asset.preview} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#888", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {asset.file.name}
                        </div>
                        <input
                          value={asset.label}
                          onChange={e => {
                            const updated = [...brandAssets];
                            updated[i] = { ...updated[i], label: e.target.value };
                            setBrandAssets(updated);
                          }}
                          placeholder='Описание: "Логотип", "Магазин снаружи"…'
                          required
                          style={{ ...inp, padding: "6px 10px", fontSize: 13 }}
                        />
                      </div>
                      <button
                        onClick={() => setBrandAssets(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#ccc", flexShrink: 0 }}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ ...hint, marginTop: brandAssets.length > 0 ? 10 : 6 }}>
                Необязательно — можно пропустить если материалов нет
              </p>
            </div>

            {/* Цвета и шрифты */}
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
              <label style={{ ...lbl, fontSize: 14, marginBottom: 6 }}>🎨 Фирменные цвета и шрифты</label>
              <p style={{ color: "#888", fontSize: 13, margin: "0 0 12px", lineHeight: 1.6 }}>
                Укажите фирменные цвета и шрифты, если есть.<br />
                <span style={{ color: "#bbb" }}>
                  Фирменные цвета указываются в кодировке CMYK или RGB, например: RGB (255, 87, 51) или CMYK (0, 66, 80, 0).
                </span>
              </p>
              <textarea value={form.brand_colors_fonts} onChange={e => set("brand_colors_fonts", e.target.value)}
                placeholder={"Основной цвет: RGB (255, 87, 51)\nДополнительный: RGB (30, 30, 30)\nШрифт заголовков: Montserrat Bold\nШрифт текста: Inter Regular"}
                style={{ ...inp, minHeight: 100, resize: "vertical" }} />
              <p style={hint}>Необязательно — можно пропустить</p>
            </div>

            {/* Референсы соцсетей */}
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
              <label style={{ ...lbl, fontSize: 14, marginBottom: 6 }}>📱 Референсы соцсетей</label>
              <p style={{ color: "#888", fontSize: 13, margin: "0 0 12px", lineHeight: 1.6 }}>
                Укажите ссылки на аккаунты компаний в соцсетях, чей стиль будем использовать как референс.
              </p>
              <textarea value={form.social_references} onChange={e => set("social_references", e.target.value)}
                placeholder={"https://vk.com/dodopizza\nhttps://t.me/burgerkingrussia"}
                style={{ ...inp, minHeight: 80, resize: "vertical" }} />
              <p style={hint}>Необязательно — можно указать 1–5 аккаунтов</p>
            </div>

            {error && <p style={{ color: "#DC2626", fontSize: 13 }}>{error}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(3)} style={btnBack}>← Назад</button>
              <button onClick={saveAndClarify} disabled={loading} style={{ ...btnNext(loading), flex: 2 }}>
                {loading ? "Сохраняю..." : "Далее →"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Уточнения ── */}
        {step === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 28 }}>🤖</span>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>AI изучил ваш профиль</h2>
              </div>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>Уточните несколько деталей для точной стратегии</p>
            </div>
            {clarifyQs.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "#888", background: "#F5F7FA", borderRadius: 12 }}>
                <p>Профиль заполнен отлично — пробелов нет!</p>
              </div>
            ) : (
              clarifyQs.map((q, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 16 }}>
                  <label style={{ ...lbl, fontSize: 14, lineHeight: 1.5, marginBottom: 10 }}>
                    {i + 1}. {q.question}
                  </label>
                  <textarea value={clarifyAs[q.field] || ""}
                    onChange={e => setClarifyAs({ ...clarifyAs, [q.field]: e.target.value })}
                    placeholder="Ваш ответ..."
                    style={{ ...inp, minHeight: 70, resize: "vertical" }} />
                </div>
              ))
            )}
            {error && <p style={{ color: "#DC2626", fontSize: 13 }}>{error}</p>}
            <button onClick={launch} disabled={launching}
              style={{ padding: 15, background: launching ? "#9CA3AF" : "#3478F6", color: "#fff",
                border: "none", borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 700 }}>
              {launching ? "Отправляю..." : "Сгенерировать стратегию →"}
            </button>
          </div>
        )}

        {/* ── STEP 6: Стратегия ── */}
        {step === 6 && strategy && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Стратегия компании</h2>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>
                AI сгенерировал стратегию для каждой площадки. Вы можете отредактировать любой раздел.
              </p>
            </div>

            {strategy.map(ps => (
              <div key={ps.platform} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, overflow: "hidden" }}>
                {/* Platform header */}
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", background: "#F5F7FA",
                  display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "#0D1B2A", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>
                    {ps.platform === "telegram" ? "✈" : ps.platform === "vk" ? "В" : "О"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{PLATFORM_LABELS[ps.platform] || ps.platform}</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{ps.best_posting_times?.join(", ")}</div>
                  </div>
                  {/* Степпер постов/неделю */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: "4px 8px" }}>
                    <button
                      onClick={() => setPpwLocal(prev => ({ ...prev, [ps.platform]: Math.max(1, (prev[ps.platform] ?? ps.posts_per_week) - 1) }))}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "#F3F4F6", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                    <div style={{ textAlign: "center", minWidth: 60 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#0D1B2A" }}>{ppwLocal[ps.platform] ?? ps.posts_per_week}</div>
                      <div style={{ fontSize: 10, color: "#9CA3AF" }}>постов/нед</div>
                    </div>
                    <button
                      onClick={() => setPpwLocal(prev => ({ ...prev, [ps.platform]: Math.min(14, (prev[ps.platform] ?? ps.posts_per_week) + 1) }))}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "#F3F4F6", cursor: "pointer", fontSize: 16, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  </div>
                </div>

                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Goal */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                      Цель присутствия
                    </div>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#333" }}>{ps.goal}</p>
                  </div>

                  {/* Audience */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                      Целевая аудитория
                    </div>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#333" }}>{ps.target_audience}</p>
                  </div>

                  {/* Tone */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                      Тональность
                    </div>
                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#333" }}>{ps.tone}</p>
                  </div>

                  {/* Content mix */}
                  {ps.content_mix && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                        Микс контента
                      </div>
                      <ContentMixBar mix={ps.content_mix} />
                    </div>
                  )}

                  {/* Content pillars */}
                  {ps.content_pillars && ps.content_pillars.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                        Темы контента
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {ps.content_pillars.map((pillar, i) => (
                          <span key={i} style={{ padding: "5px 12px", background: "#F5F7FA", borderRadius: 20, fontSize: 13, color: "#444" }}>
                            {pillar}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Edit with AI */}
                  {editingPlatform === ps.platform ? (
                    <div style={{ background: "#F5F7FA", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#444" }}>
                        Что изменить в стратегии для {PLATFORM_LABELS[ps.platform]}?
                      </div>
                      <textarea
                        value={editMessage}
                        onChange={e => setEditMessage(e.target.value)}
                        placeholder="Например: сделай тон более неформальным, добавь развлекательного контента"
                        style={{ ...inp, minHeight: 80, resize: "vertical" }}
                        autoFocus
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { setEditingPlatform(null); setEditMessage(""); }}
                          style={{ flex: 1, padding: "10px 16px", background: "#F5F7FA", border: "none",
                            borderRadius: 10, cursor: "pointer", fontSize: 14, color: "#444" }}>
                          Отмена
                        </button>
                        <button
                          onClick={() => refineStrategy(`Для платформы ${PLATFORM_LABELS[ps.platform]}: ${editMessage}`)}
                          disabled={!editMessage.trim() || editLoading}
                          style={{ flex: 2, padding: "10px 16px", background: editLoading || !editMessage.trim() ? "#ccc" : "#0D1B2A",
                            border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, color: "#fff", fontWeight: 600 }}>
                          {editLoading ? "Применяю..." : "Применить изменения"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingPlatform(ps.platform); setEditMessage(""); }}
                      style={{ alignSelf: "flex-start", padding: "8px 16px", background: "transparent",
                        border: "1.5px solid #E0DED8", borderRadius: 10, cursor: "pointer", fontSize: 13, color: "#555" }}>
                      ✏️ Редактировать с ИИ
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* ── Расписание публикаций ── */}
            {(() => {
              const DAYS = [
                { id: "mon", label: "Пн" }, { id: "tue", label: "Вт" },
                { id: "wed", label: "Ср" }, { id: "thu", label: "Чт" },
                { id: "fri", label: "Пт" }, { id: "sat", label: "Сб" },
                { id: "sun", label: "Вс" },
              ];
              const TIMES = ["07:00","09:00","12:00","15:00","18:00","20:00","22:00"];
              const toggleDay = (d: string) => setSchedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
              const toggleTime = (t: string) => setSchedTimes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
              const chipBase: React.CSSProperties = {
                padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                cursor: "pointer", border: "1.5px solid", transition: "all 0.15s", userSelect: "none",
              };
              return (
                <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#0D1B2A" }}>
                      Расписание публикаций
                    </h3>
                    <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>
                      Укажите предпочтения — ИИ будет учитывать их при составлении контент-плана
                    </p>
                  </div>

                  {/* Дни */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
                      Обязательные дни публикации
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {DAYS.map(d => {
                        const active = schedDays.includes(d.id);
                        return (
                          <div key={d.id} onClick={() => toggleDay(d.id)}
                            style={{ ...chipBase, borderColor: active ? "#3478F6" : "#E5E7EB",
                              background: active ? "#3478F6" : "#F9FAFB",
                              color: active ? "#fff" : "#374151" }}>
                            {d.label}
                          </div>
                        );
                      })}
                    </div>
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9CA3AF" }}>
                      Не выбрано — ИИ распределит посты по неделе самостоятельно
                    </p>
                  </div>

                  {/* Временные слоты */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
                      Обязательные временные слоты
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {TIMES.map(t => {
                        const active = schedTimes.includes(t);
                        return (
                          <div key={t} onClick={() => toggleTime(t)}
                            style={{ ...chipBase, borderColor: active ? "#0F6E56" : "#E5E7EB",
                              background: active ? "#0F6E56" : "#F9FAFB",
                              color: active ? "#fff" : "#374151" }}>
                            {t}
                          </div>
                        );
                      })}
                    </div>
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9CA3AF" }}>
                      Выбранное время — точное время публикации (±15 мин)
                    </p>
                  </div>

                  {/* AI-эксперимент */}
                  <div onClick={() => setSchedAiExperiment(prev => !prev)}
                    style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer",
                      background: schedAiExperiment ? "#EAF4FF" : "#F9FAFB",
                      border: `1.5px solid ${schedAiExperiment ? "#3478F6" : "#E5E7EB"}`,
                      borderRadius: 12, padding: "14px 16px", transition: "all 0.15s" }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                      background: schedAiExperiment ? "#3478F6" : "#fff",
                      border: `2px solid ${schedAiExperiment ? "#3478F6" : "#D1D5DB"}`,
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {schedAiExperiment && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0D1B2A", marginBottom: 4 }}>
                        Разрешить ИИ экспериментировать со временем постинга
                      </div>
                      <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>
                        ИИ будет пробовать разные дни и временные слоты, собирать статистику охватов и реакций,
                        интерпретировать данные и автоматически подбирать оптимальное расписание опытным путём.
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {error && <p style={{ color: "#DC2626", fontSize: 13 }}>{error}</p>}

            <button onClick={approveStrategy}
              style={{ padding: 15, background: "#3478F6", color: "#fff",
                border: "none", borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 700 }}>
              Согласовать стратегию →
            </button>
          </div>
        )}

        {/* ── STEP 7: Рубрики ── */}
        {step === 7 && strategy && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>Рубрики и микс контента</h2>
              <p style={{ color: "#888", margin: 0, fontSize: 14 }}>
                Проверьте рубрики для каждой площадки. Вы можете скорректировать их с помощью AI-чата ниже.
              </p>
            </div>

            {/* Platform tabs */}
            {strategy.length > 1 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {strategy.map(ps => (
                  <button key={ps.platform} onClick={() => setSelectedPlatform(ps.platform)}
                    style={{ padding: "8px 20px", borderRadius: 20,
                      border: `1.5px solid ${selectedPlatform === ps.platform ? "#0D1B2A" : "#E5E7EB"}`,
                      background: selectedPlatform === ps.platform ? "#0D1B2A" : "#fff",
                      color: selectedPlatform === ps.platform ? "#fff" : "#555",
                      cursor: "pointer", fontSize: 14, fontWeight: selectedPlatform === ps.platform ? 600 : 400 }}>
                    {PLATFORM_LABELS[ps.platform] || ps.platform}
                  </button>
                ))}
              </div>
            )}

            {/* Content mix bar */}
            {currentPlatformStrategy?.content_mix && (
              <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 12 }}>
                  Микс контента · {PLATFORM_LABELS[selectedPlatform] || selectedPlatform}
                </div>
                <ContentMixBar mix={currentPlatformStrategy.content_mix} />
              </div>
            )}

            {/* Rubrics list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {currentPlatformStrategy?.rubrics?.map((rubric, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                  <div
                    onClick={() => setExpandedRubric(expandedRubric === `${selectedPlatform}-${i}` ? null : `${selectedPlatform}-${i}`)}
                    style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "#0D1B2A" }}>{rubric.name}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11,
                          background: RUBRIC_TYPE_COLORS[rubric.type] || "#F5F7FA", color: "#555" }}>
                          {RUBRIC_TYPE_LABELS[rubric.type] || rubric.type}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#888" }}>
                        {rubric.format} · {rubric.frequency}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: "#aaa", transform: expandedRubric === `${selectedPlatform}-${i}` ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                  </div>

                  {expandedRubric === `${selectedPlatform}-${i}` && (
                    <div style={{ padding: "0 16px 16px", borderTop: "1px solid #F0EEE8", display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 4 }}>ЦЕЛЬ РУБРИКИ</div>
                        <p style={{ margin: 0, fontSize: 13, color: "#444", lineHeight: 1.5 }}>{rubric.goal}</p>
                      </div>
                      {rubric.example_topics?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 4 }}>ПРИМЕРЫ ТЕМ</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {rubric.example_topics.map((t, j) => (
                              <div key={j} style={{ fontSize: 13, color: "#444", paddingLeft: 12, borderLeft: "2px solid #E0DED8" }}>
                                {t}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {rubric.structure?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 4 }}>СТРУКТУРА ПОСТА</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {rubric.structure.map((s, j) => (
                              <span key={j} style={{ padding: "3px 10px", background: "#F5F7FA", borderRadius: 12, fontSize: 12, color: "#555" }}>
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* AI Chat */}
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #E5E7EB", background: "#F5F7FA" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>🤖 Скорректируй рубрики с ИИ</span>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>
                  Напишите что хотите изменить — добавить рубрику, убрать, изменить частоту
                </p>
              </div>

              {rubricsChat.length > 0 && (
                <div style={{ padding: "12px 16px", maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {rubricsChat.map((msg, i) => (
                    <div key={i} style={{
                      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      padding: "8px 14px", borderRadius: 12, fontSize: 14, maxWidth: "85%",
                      background: msg.role === "user" ? "#3478F6" : "#F5F7FA",
                      color: msg.role === "user" ? "#fff" : "#333",
                    }}>
                      {msg.text}
                    </div>
                  ))}
                  {rubricsLoading && (
                    <div style={{ alignSelf: "flex-start", padding: "8px 14px", borderRadius: 12, background: "#F5F7FA", display: "flex", gap: 6 }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#888",
                          animation: `dot-pulse 1.2s ${i * 0.3}s infinite` }} />
                      ))}
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              <div style={{ padding: 12, display: "flex", gap: 8, borderTop: rubricsChat.length > 0 ? "1px solid #E5E7EB" : "none" }}>
                <input
                  value={rubricsChatInput}
                  onChange={e => setRubricsChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && chatRubrics()}
                  placeholder="Добавь рубрику про рецепты, убери UGC..."
                  style={{ ...inp, flex: 1 }}
                  disabled={rubricsLoading}
                />
                <button onClick={chatRubrics} disabled={!rubricsChatInput.trim() || rubricsLoading}
                  style={{ padding: "10px 18px", border: "none", borderRadius: 10,
                    cursor: "pointer", color: "#fff", fontSize: 14, fontWeight: 600,
                    background: !rubricsChatInput.trim() || rubricsLoading ? "#D1D5DB" : "#3478F6" }}>
                  →
                </button>
              </div>
            </div>

            {error && <p style={{ color: "#DC2626", fontSize: 13 }}>{error}</p>}

            <button onClick={approveRubrics} disabled={launching}
              style={{ padding: 15, background: launching ? "#9CA3AF" : "#3478F6", color: "#fff",
                border: "none", borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 700 }}>
              {launching ? "Запускаю..." : "Согласовать рубрики →"}
            </button>
          </div>
        )}

        {/* ── STEP 8: Запущено ── */}
        {step === 8 && (
          <div style={{ textAlign: "center", padding: "3rem 0" }}>
            <div style={{ fontSize: 72, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 12px" }}>Платформа запущена!</h2>
            <p style={{ color: "#666", fontSize: 15, maxWidth: 460, margin: "0 auto 20px", lineHeight: 1.6 }}>
              Готовим контент-план и тексты постов — обычно это занимает 1–2 минуты.
            </p>

            {/* Info notice */}
            <div style={{
              maxWidth: 460, margin: "0 auto 28px",
              background: "#FFF8ED", border: "1px solid #FFD699",
              borderRadius: 14, padding: "16px 20px", textAlign: "left",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#7C4400", marginBottom: 6 }}>
                ⚡ Потребуется твоё участие
              </div>
              <div style={{ fontSize: 13, color: "#6B4200", lineHeight: 1.6 }}>
                Часть постов требует согласования или дополнительной информации от тебя:
                фото товара, условия акции, имя сотрудника и т.д.
                Без этого пост будет некорректным.
                <br /><br />
                <strong>Перейди в Контент-план</strong> — там увидишь что именно нужно.
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 380, margin: "0 auto 32px" }}>
              {[
                { icon: "📋", text: "Стратегия согласована", done: true },
                { icon: "🗂", text: "Рубрики утверждены", done: true },
                { icon: "📅", text: "Контент-план генерируется...", done: false },
                { icon: "✍️", text: "Посты под ваш голос бренда", done: false },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", background: "#fff", borderRadius: 10,
                  border: "1px solid #E5E7EB", textAlign: "left" }}>
                  <span style={{ fontSize: 20 }}>{item.icon}</span>
                  <span style={{ fontSize: 14, color: "#333" }}>{item.text}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: item.done ? "#00B5A6" : "#888" }}>
                    {item.done ? "✓ Готово" : "Генерируется..."}
                  </span>
                </div>
              ))}
            </div>

            <button onClick={() => router.push("/content")}
              style={{ padding: "14px 40px", background: "#3478F6", color: "#fff", border: "none",
                borderRadius: 12, cursor: "pointer", fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
              Перейти в Контент-план →
            </button>
            <div>
              <button onClick={() => router.push("/home")}
                style={{ background: "none", border: "none", color: "#aaa",
                  cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>
                На главную
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

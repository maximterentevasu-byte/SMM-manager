"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import api from "@/lib/api";

const PAD = 10;
const TOOLTIP_W = 276;
const TOOLTIP_H = 170;

const STEPS = [
  {
    targetId: "nav-platforms",
    title: "Шаг 1 из 2 · Платформы",
    text: "Начнём с главного — подключи ВКонтакте или Telegram. Без площадки я не смогу публиковать за тебя. Нажми «Платформы» в меню.",
    advanceOn: "/platforms",
    side: "right" as const,
    final: false,
  },
  {
    targetId: "tour-platform-cards",
    title: "Шаг 2 из 2 · Подключи площадку",
    text: "Нажми «Подключить» на нужной платформе и следуй инструкции. Это займёт меньше минуты.",
    advanceOn: null,
    side: "top" as const,
    final: true,
  },
];

interface Props { tourKey: number; }

export function OnboardingTour({ tourKey }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [phase, setPhase] = useState<"idle" | "modal" | "spotlight">("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const done = useCallback(() => {
    setPhase("idle");
    setRect(null);
    localStorage.setItem("tourDone", "1");
    api.post("/auth/tour-complete").catch(() => {});
  }, []);

  // Start or restart tour
  useEffect(() => {
    if (tourKey === 0) return;
    setStepIdx(0);
    setRect(null);
    setPhase("modal");
    if (pathname !== "/home") router.push("/home");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourKey]);

  // Locate target element in DOM
  useEffect(() => {
    if (phase !== "spotlight") return;
    const cfg = STEPS[stepIdx];
    if (!cfg) { done(); return; }
    setRect(null);

    let tries = 0;
    const find = () => {
      const el = document.getElementById(cfg.targetId);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
      } else if (tries++ < 30) {
        setTimeout(find, 150);
      }
    };
    setTimeout(find, 400);
  }, [phase, stepIdx, done]);

  // Keep rect in sync on scroll/resize
  useEffect(() => {
    if (phase !== "spotlight") return;
    const cfg = STEPS[stepIdx];
    if (!cfg) return;
    const update = () => {
      const el = document.getElementById(cfg.targetId);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
    };
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [phase, stepIdx]);

  // Auto-advance when user navigates to the expected route
  useEffect(() => {
    if (phase !== "spotlight") return;
    const cfg = STEPS[stepIdx];
    if (!cfg?.advanceOn) return;
    if (pathname === cfg.advanceOn) {
      const next = stepIdx + 1;
      setRect(null);
      if (next >= STEPS.length) done();
      else setStepIdx(next);
    }
  }, [pathname, phase, stepIdx, done]);

  if (phase === "idle") return null;

  const cfg = STEPS[stepIdx];
  const ww = typeof window !== "undefined" ? window.innerWidth : 1280;
  const wh = typeof window !== "undefined" ? window.innerHeight : 800;
  const isMobile = ww < 768;

  // Tooltip position relative to spotlight rect
  const tooltipStyle = (): React.CSSProperties => {
    if (!rect || !cfg) return { top: 80, left: 80 };
    const { x, y, w, h } = rect;
    if (cfg.side === "right") {
      return {
        top: Math.max(8, Math.min(y + h / 2 - TOOLTIP_H / 2, wh - TOOLTIP_H - 8)),
        left: Math.min(x + w + PAD + 14, ww - TOOLTIP_W - 8),
      };
    }
    // top / bottom — pick whichever fits
    const left = Math.max(8, Math.min(x + w / 2 - TOOLTIP_W / 2, ww - TOOLTIP_W - 8));
    const topAbove = y - PAD - TOOLTIP_H - 8;
    const topBelow = y + h + PAD + 8;
    return { top: topAbove >= 8 ? topAbove : topBelow, left };
  };

  const btn: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif", cursor: "pointer", border: "none",
  };

  // ── WELCOME MODAL ──────────────────────────────────────────────────────────
  if (phase === "modal") {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(13,27,42,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}>
        <div style={{
          background: "#fff", borderRadius: 22, padding: "36px 28px",
          maxWidth: 380, width: "100%", textAlign: "center",
          boxShadow: "0 12px 60px rgba(13,27,42,0.35)",
          fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{ fontSize: 54, marginBottom: 12 }}>🦢</div>
          <h2 style={{
            fontFamily: "'Manrope', sans-serif", fontSize: 20, fontWeight: 800,
            color: "#0D1B2A", margin: "0 0 10px",
          }}>
            Привет! Я АИСТ
          </h2>
          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.7, margin: "0 0 26px" }}>
            Я ИИ-ассистент этой платформы. Помогу разобраться за пару шагов — покажу, как подключить площадки и начать публиковать.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={done} style={{
              ...btn, padding: "11px 22px",
              background: "#F5F7FA", border: "1px solid #E5E7EB",
              borderRadius: 12, fontSize: 14, color: "#6B7280", fontWeight: 500,
            }}>
              Закрыть
            </button>
            <button
              onClick={() => {
                // On mobile skip nav-spotlight, go straight to platforms page step
                if (isMobile) {
                  setStepIdx(1);
                  setPhase("spotlight");
                  router.push("/platforms");
                } else {
                  setStepIdx(0);
                  setPhase("spotlight");
                }
              }}
              style={{
                ...btn, padding: "11px 26px",
                background: "#3478F6", borderRadius: 12,
                fontSize: 14, fontWeight: 600, color: "#fff",
              }}
            >
              Продолжить →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SPOTLIGHT ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* SVG overlay with spotlight cutout — pointer-events: none so target stays clickable */}
      {rect && (
        <svg style={{
          position: "fixed", inset: 0, width: "100%", height: "100%",
          zIndex: 9000, pointerEvents: "none",
        }}>
          <defs>
            <mask id="aist-spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={rect.x - PAD} y={rect.y - PAD}
                width={rect.w + PAD * 2} height={rect.h + PAD * 2}
                rx="12" fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%" height="100%"
            fill="rgba(13,27,42,0.62)"
            mask="url(#aist-spotlight-mask)"
          />
        </svg>
      )}

      {/* Tooltip */}
      {rect && cfg && (
        <div style={{
          position: "fixed",
          zIndex: 9100,
          width: TOOLTIP_W,
          ...tooltipStyle(),
          background: "#fff",
          border: "1.5px solid #E5E7EB",
          borderRadius: 16,
          padding: "16px 18px 14px",
          boxShadow: "0 4px 28px rgba(13,27,42,0.22)",
          fontFamily: "'Inter', sans-serif",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>🦢</span>
            <span style={{
              fontSize: 12, fontWeight: 700, color: "#0D1B2A",
              fontFamily: "'Manrope', sans-serif",
            }}>
              {cfg.title}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.65, margin: "0 0 14px" }}>
            {cfg.text}
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={done} style={{
              ...btn, background: "none",
              fontSize: 12, color: "#9CA3AF",
              textDecoration: "underline", padding: 0,
            }}>
              Закрыть
            </button>
            {cfg.final && (
              <button onClick={done} style={{
                ...btn, padding: "7px 14px",
                background: "#3478F6", borderRadius: 8,
                fontSize: 12, fontWeight: 600, color: "#fff",
              }}>
                Готово ✓
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Joyride, ACTIONS, EVENTS, STATUS, type EventData, type Controls, type TooltipRenderProps, type Step } from "react-joyride";
import api from "@/lib/api";

const STEPS_CFG = [
  {
    target: "#tour-add-platform",
    route: "/platforms",
    title: "Привет! Я АИСТ 👋",
    content: "Начнём с главного — подключи первую площадку. ВКонтакте или Telegram. Без площадки я не смогу публиковать за тебя.",
  },
  {
    target: "#tour-analytics-header",
    route: "/analytics",
    title: "Аналитика в реальном времени",
    content: "Здесь я покажу охваты, подписчиков и вовлечённость по каждой площадке. После первых публикаций данные появятся автоматически.",
  },
  {
    target: "#tour-generate-strategy",
    route: "/strategy",
    title: "AI-стратегия за 30 секунд",
    content: "Расскажи о бизнесе — и я составлю контент-план с темами, рубриками и частотой. Это основа для всего контента.",
  },
  {
    target: "#tour-content-plan",
    route: "/content",
    title: "Твой контент-календарь",
    content: "Посты по стратегии появятся здесь. Одобри — и я опубликую в нужное время. Или создай вручную прямо сейчас.",
  },
  {
    target: "#tour-kpi-block",
    route: "/home",
    title: "Это твой пульт управления 🚀",
    content: "Все ключевые показатели на одном экране. Подключи площадку — и я начну заполнять эти карточки живыми данными!",
  },
];

const TOTAL = STEPS_CFG.length;

function CustomTooltip({ index, size, skipProps, primaryProps, backProps, tooltipProps, isLastStep }: TooltipRenderProps) {
  const s = STEPS_CFG[index];
  return (
    <div
      {...tooltipProps}
      style={{
        background: "#fff",
        border: "1.5px solid #E5E7EB",
        borderRadius: 20,
        boxShadow: "0 8px 48px rgba(13,27,42,0.22)",
        padding: "22px 22px 18px",
        maxWidth: 310,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 46, height: 46, borderRadius: "50%",
          background: "linear-gradient(135deg, #EAF4FF, #E0F7F6)",
          border: "2px solid #3478F6",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, flexShrink: 0,
        }}>
          🦢
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", letterSpacing: 0.5, marginBottom: 1 }}>
            ШАГ {index + 1} ИЗ {size}
          </div>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 700, color: "#0D1B2A", lineHeight: 1.3 }}>
            {s?.title}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {STEPS_CFG.map((_, i) => (
          <div key={i} style={{
            height: 4,
            width: i === index ? 20 : 6,
            borderRadius: 2,
            background: i === index ? "#3478F6" : i < index ? "#00B5A6" : "#E5E7EB",
            transition: "width 0.2s, background 0.2s",
          }} />
        ))}
      </div>

      <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: "0 0 16px" }}>
        {s?.content}
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          {...skipProps}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 12, color: "#9CA3AF", padding: 0, textDecoration: "underline",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Пропустить
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {index > 0 && (
            <button
              {...backProps}
              style={{
                padding: "7px 14px", background: "#F5F7FA",
                border: "1px solid #E5E7EB", borderRadius: 10,
                cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#374151",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              ← Назад
            </button>
          )}
          <button
            {...primaryProps}
            style={{
              padding: "7px 18px", background: "#3478F6",
              border: "none", borderRadius: 10,
              cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#fff",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {isLastStep ? "Завершить ✓" : "Далее →"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  tourKey: number;
}

export function OnboardingTour({ tourKey }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [navigating, setNavigating] = useState(false);

  const completeTour = useCallback(() => {
    localStorage.setItem("tourDone", "1");
    api.post("/auth/tour-complete").catch(() => {});
  }, []);

  useEffect(() => {
    if (tourKey === 0) return;
    setStepIndex(0);
    setRun(false);
    setNavigating(false);
    const firstRoute = STEPS_CFG[0].route;
    if (pathname !== firstRoute) {
      router.push(firstRoute);
      setTimeout(() => setRun(true), 900);
    } else {
      setTimeout(() => setRun(true), 400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourKey]);

  // After navigation, wait for target element to appear
  useEffect(() => {
    if (!navigating) return;
    const target = STEPS_CFG[stepIndex]?.target;
    if (!target) return;
    let attempts = 0;
    const check = () => {
      attempts++;
      if (document.querySelector(target)) {
        setNavigating(false);
        setRun(true);
      } else if (attempts < 25) {
        setTimeout(check, 150);
      } else {
        setNavigating(false);
        setRun(true);
      }
    };
    setTimeout(check, 400);
  }, [navigating, stepIndex]);

  const handleEvent = useCallback((data: EventData, _controls: Controls) => {
    const { action, type, status } = data;

    if (type === EVENTS.STEP_AFTER) {
      if (action === ACTIONS.NEXT) {
        const nextIdx = stepIndex + 1;
        if (nextIdx >= TOTAL) {
          setRun(false);
          completeTour();
          return;
        }
        const nextRoute = STEPS_CFG[nextIdx].route;
        setRun(false);
        setStepIndex(nextIdx);
        if (pathname !== nextRoute) {
          router.push(nextRoute);
          setNavigating(true);
        } else {
          setTimeout(() => setRun(true), 200);
        }
      } else if (action === ACTIONS.PREV) {
        const prevIdx = stepIndex - 1;
        if (prevIdx < 0) return;
        const prevRoute = STEPS_CFG[prevIdx].route;
        setRun(false);
        setStepIndex(prevIdx);
        if (pathname !== prevRoute) {
          router.push(prevRoute);
          setNavigating(true);
        } else {
          setTimeout(() => setRun(true), 200);
        }
      }
    }

    if (status === STATUS.SKIPPED || status === STATUS.FINISHED) {
      setRun(false);
      completeTour();
    }
  }, [stepIndex, pathname, router, completeTour]);

  const joyrideSteps: Step[] = STEPS_CFG.map((s) => ({
    target: s.target,
    content: s.content,
    title: s.title,
    placement: "bottom" as const,
    skipBeacon: true,
    overlayClickAction: false,
    dismissKeyAction: false,
  } as Step));

  if (!run) return null;

  return (
    <Joyride
      steps={joyrideSteps}
      stepIndex={stepIndex}
      run={run}
      continuous
      tooltipComponent={CustomTooltip}
      onEvent={handleEvent}
      options={{
        overlayColor: "rgba(13, 27, 42, 0.55)",
        overlayClickAction: false,
        dismissKeyAction: false,
        spotlightPadding: 10,
        zIndex: 9000,
      }}
      styles={{
        overlay: { cursor: "default" },
      }}
    />
  );
}

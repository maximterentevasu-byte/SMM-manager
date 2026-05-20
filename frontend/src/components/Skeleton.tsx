"use client";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  style?: React.CSSProperties;
}

export function Skeleton({ width = "100%", height = 16, borderRadius = 6, style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius, flexShrink: 0, ...style }}
    />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, padding: "20px 20px",
      border: "1px solid #E5E7EB", display: "flex", flexDirection: "column", gap: 12,
    }}>
      <Skeleton width="60%" height={18} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width={i === rows - 1 ? "80%" : "100%"} height={13} />
      ))}
    </div>
  );
}

export function SkeletonKpi() {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, padding: "20px",
      border: "1px solid #E5E7EB",
    }}>
      <Skeleton width="50%" height={12} style={{ marginBottom: 12 }} />
      <Skeleton width="70%" height={28} style={{ marginBottom: 8 }} />
      <Skeleton width="40%" height={11} />
    </div>
  );
}

"use client";

interface WorkoutSpotProps {
  id: string;
  icon: string;
  label: string;
  xpCost: number;
  tokenReward: string;
  /** Upgrade level of the installed machine — badged when the owner has invested in it. */
  level?: number;
  disabled?: boolean;
  disabledReason?: string;
  occupied?: boolean;
  onActivate: () => void;
  style?: React.CSSProperties;
}

export function WorkoutSpot({
  icon,
  label,
  xpCost,
  tokenReward,
  level = 1,
  disabled,
  disabledReason,
  occupied,
  onActivate,
  style,
}: WorkoutSpotProps) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        width: "84px",
        ...style,
      }}
    >
      {/* Equipment tile */}
      <button
        onClick={onActivate}
        disabled={disabled || occupied}
        title={disabledReason}
        style={{
          width: "72px",
          height: "72px",
          position: "relative",
          borderRadius: "14px",
          border: `2px solid ${
            occupied ? "#f59e0b" : disabled ? "var(--border-subtle)" : "rgba(108,71,255,0.5)"
          }`,
          background: occupied
            ? "rgba(245,158,11,0.12)"
            : disabled
            ? "rgba(255,255,255,0.03)"
            : "rgba(108,71,255,0.08)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: disabled || occupied ? "not-allowed" : "pointer",
          gap: "2px",
          transition: "all 0.15s ease",
          opacity: disabled ? 0.5 : 1,
          animation: !disabled && !occupied ? "spot-glow 2.5s ease-in-out infinite" : undefined,
        }}
      >
        <span style={{ fontSize: "28px" }}>{icon}</span>
        {level > 1 && (
          <span
            style={{
              position: "absolute",
              top: "4px",
              right: "6px",
              fontSize: "8px",
              fontWeight: 800,
              color: "#a78bfa",
            }}
          >
            Lv.{level}
          </span>
        )}
        <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: 600 }}>
          {occupied ? "IN USE" : `-${xpCost} XP`}
        </span>
      </button>

      {/* Label — capped to the tile so long names wrap instead of spilling */}
      <span
        style={{
          fontSize: "10px",
          color: "var(--text-secondary)",
          fontWeight: 600,
          maxWidth: "84px",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>

      {/* Token reward preview */}
      {!disabled && !occupied && (
        <div
          style={{
            display: "flex",
            gap: "4px",
            fontSize: "9px",
          }}
        >
          <span style={{ color: "#00d4aa" }}>+{tokenReward} 🪙</span>
        </div>
      )}

      {/* Disabled reason */}
      {disabled && disabledReason && (
        <span style={{ fontSize: "9px", color: "#ef4444", textAlign: "center", maxWidth: "72px" }}>
          {disabledReason}
        </span>
      )}

      <style>{`
        @keyframes spot-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(108,71,255,0.2); }
          50% { box-shadow: 0 0 12px 2px rgba(108,71,255,0.35); }
        }
      `}</style>
    </div>
  );
}

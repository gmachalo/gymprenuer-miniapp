import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { formatTokens } from "@/lib/utils";
import ProfileModeToggle from "@/components/profile/ProfileModeToggle";
import FitnessSyncButton from "@/components/profile/FitnessSyncButton";
import FitnessConnectCard from "@/components/profile/FitnessConnectCard";
import { statRequiredForLevel } from "@/lib/game/engine";
import { Suspense } from "react";
import { signOut } from "@/auth";

const BODY_TYPE_EMOJI: Record<string, string> = {
  SKINNY: "🦴",
  AVERAGE: "🧑",
  OVERWEIGHT: "🐻",
};

const STAGE_LABELS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite", "Legend"];

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [user, character, streak, latestSync] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.character.findFirst({ where: { userId, isActive: true } }),
    prisma.streak.findUnique({ where: { userId } }),
    prisma.fitnessSync.findFirst({ where: { userId }, orderBy: { syncDate: "desc" } }),
  ]);

  if (!user) redirect("/login");

  const totalWorkouts = await prisma.workout.count({ where: { userId } });

  // Every stat must clear this before the next level unlocks.
  const requiredStat = statRequiredForLevel(user.level);

  return (
    <div>
      <header className="top-header">
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800 }}>👤 Profile</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="btn btn-secondary btn-sm" id="signout-btn">
            Sign Out
          </button>
        </form>
      </header>

      <div className="container" style={{ paddingTop: "20px" }}>
        {/* Avatar + name */}
        <div
          className="card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "16px",
            padding: "20px",
          }}
        >
          <div
            style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "var(--bg-elevated)",
              border: "3px solid var(--brand-primary)",
              overflow: "hidden",
              flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "28px",
            }}
          >
            {user.image
              ? <img src={user.image} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : "👤"}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: "0 0 2px", fontWeight: 800, fontSize: "18px" }}>
              {user.displayName ?? user.name ?? "Trainer"}
            </p>
            <p style={{ margin: "0 0 6px", fontSize: "13px", color: "var(--text-secondary)" }}>
              {user.email}
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <span className="badge badge-purple">Level {user.level}</span>
              <span className="badge badge-teal">{user.mode} Mode</span>
              {user.walletAddress && (
                <span className="badge badge-orange">🔗 Wallet Linked</span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
          {[
            { label: "Tokens", value: formatTokens(user.offChainTokens) },
            { label: "Total XP", value: formatTokens(user.totalXp) },
            { label: "Streak", value: `${streak?.currentStreak ?? 0}🔥` },
            { label: "Workouts", value: totalWorkouts.toString() },
          ].map((s) => (
            <div key={s.label} className="stat-pill">
              <span style={{ fontWeight: 800, fontSize: "16px" }}>{s.value}</span>
              <span style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase" }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Character card */}
        {character && (
          <div className="card" style={{ marginBottom: "16px" }}>
            <p className="section-title" style={{ margin: "0 0 12px" }}>Your Character</p>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div className="char-avatar">
                {BODY_TYPE_EMOJI[character.bodyType]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: "16px" }}>{character.name}</p>
                  <span className="badge badge-purple">{STAGE_LABELS[character.transformationStage]}</span>
                </div>
                <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--text-secondary)" }}>
                  {character.bodyType.charAt(0) + character.bodyType.slice(1).toLowerCase()} · Stage {character.transformationStage}
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    { k: "STR", v: character.strength, c: "var(--stat-strength)" },
                    { k: "STA", v: character.stamina, c: "var(--stat-stamina)" },
                    { k: "DIS", v: character.discipline, c: "var(--stat-discipline)" },
                    { k: "MET", v: character.metabolism, c: "var(--stat-metabolism)" },
                  ].map((s) => (
                    <div key={s.k} style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "13px" }}>
                      <span style={{ color: s.c, fontWeight: 700 }}>{s.k}</span>
                      <span style={{ color: s.v >= requiredStat ? "var(--text-primary)" : "var(--text-secondary)" }}>
                        {s.v}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>/{requiredStat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Real-world workout app link — drives character stats */}
        <Suspense fallback={null}>
          <FitnessConnectCard requiredStat={requiredStat} />
        </Suspense>

        {/* Fitness Sync */}
        <div className="card" style={{ marginBottom: "16px" }}>
          <p className="section-title" style={{ margin: "0 0 4px" }}>⚡ Daily Token Boost</p>
          <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--text-secondary)" }}>
            Separate from stats: today&apos;s activity also multiplies the GYMFIT your next workout pays out.
          </p>
          {latestSync && (
            <div style={{ marginBottom: "12px", fontSize: "13px", color: "var(--text-secondary)" }}>
              Last sync: {new Date(latestSync.syncDate).toLocaleDateString()} ·{" "}
              {latestSync.durationMins}min · {latestSync.intensity} ·{" "}
              <span className="badge badge-teal">+{Math.round(Number(latestSync.fitnessBoost) * 100)}% boost</span>
            </div>
          )}
          <FitnessSyncButton />
        </div>

        {/* Mode toggle */}
        <div className="card" style={{ marginBottom: "16px" }}>
          <p className="section-title" style={{ margin: "0 0 4px" }}>Game Mode</p>
          <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--text-secondary)" }}>
            Solo: stable rewards via system gyms. Social: boosted rewards via player gyms + challenges.
          </p>
          <ProfileModeToggle currentMode={user.mode} />
        </div>

        {/* Web3 wallet */}
        <div className="card" style={{ marginBottom: "24px" }}>
          <p className="section-title" style={{ margin: "0 0 4px" }}>🔗 Wallet (Optional)</p>
          <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--text-secondary)" }}>
            Link a Base wallet to claim your GYMFIT on-chain and unlock NFT features.
          </p>
          <button className="btn btn-secondary" style={{ width: "100%", opacity: 0.5 }} disabled id="link-wallet-btn">
            Connect Wallet — Coming in Phase 2
          </button>
        </div>
      </div>
    </div>
  );
}

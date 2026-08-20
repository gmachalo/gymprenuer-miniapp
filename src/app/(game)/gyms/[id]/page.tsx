import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { calculateGymDailyIncome, trainerLevelRequirement } from "@/lib/game/engine";
import { formatTokens } from "@/lib/utils";
import GymJoinButton from "@/components/gym/GymJoinButton";
import GymTrainerButton from "@/components/gym/GymTrainerButton";
import { GYM_TIERS } from "@/app/api/game/gyms/[id]/upgrade/route";

export default async function GymDetailPage(
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const { id: gymId } = await props.params;

  const [gym, user, membership] = await Promise.all([
    prisma.gym.findUnique({
      where: { id: gymId },
      include: {
        owner: { select: { id: true, name: true, displayName: true } },
        members: {
          take: 10,
          include: { user: { select: { id: true, name: true, image: true, level: true } } },
        },
        equipment: true,
        npcClients: { where: { active: true } },
        _count: { select: { members: true } },
      },
    }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.gymMember.findUnique({
      where: { gymId_userId: { gymId, userId } },
    }),
  ]);

  if (!gym) redirect("/gyms");

  const avgSat =
    gym.npcClients.length > 0
      ? Math.floor(gym.npcClients.reduce((s, n) => s + n.satisfaction, 0) / gym.npcClients.length)
      : 50;
  const avgEq =
    gym.equipment.length > 0
      ? gym.equipment.reduce((s, e) => s + e.level, 0) / gym.equipment.length
      : 1;
  const dailyIncome = calculateGymDailyIncome(gym._count.members, avgSat, avgEq, gym.monthlyFee);
  const isMember = !!membership;
  const isOwner = gym.ownerId === userId;
  const tierData = GYM_TIERS[gym.tier - 1] ?? GYM_TIERS[0];
  const totalXp = (user?.currentXp ?? 0) + (user?.overflowXp ?? 0);
  const canAfford =
    tierData.joinXp > 0
      ? totalXp >= tierData.joinXp
      : (user?.offChainTokens ?? BigInt(0)) >= BigInt(tierData.joinGymfit);
  const isFull = gym.memberCount >= gym.maxMembers;
  const requiredTrainerLevel = trainerLevelRequirement(gym.tier);
  const isTrainer = membership?.role === "TRAINER";

  return (
    <div>
      <header className="top-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <a href="/gyms" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "22px" }}>‹</a>
          <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>{gym.name}</h1>
        </div>
        <span className={`badge ${gym.type === "SYSTEM" ? "badge-gold" : "badge-purple"}`}>
          {gym.type === "SYSTEM" ? "System" : "Player"}
        </span>
      </header>

      <div className="container" style={{ paddingTop: "20px" }}>

        {/* Hero card */}
        <div
          className="card"
          style={{
            marginBottom: "16px",
            background: "linear-gradient(135deg, rgba(108,71,255,0.15), rgba(0,212,170,0.08))",
            border: "1px solid rgba(108,71,255,0.3)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: "13px", color: "var(--text-secondary)" }}>
                {gym.description}
              </p>
              {gym.owner && (
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
                  Owner: {gym.owner.displayName ?? gym.owner.name}
                </p>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: "0 0 2px", fontSize: "22px", fontWeight: 800 }}>⭐ {gym.reputation}</p>
              <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted)" }}>reputation</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
            {[
              { label: "Members", value: `${gym._count.members}/${gym.maxMembers}` },
              { label: "Monthly Fee", value: `${gym.monthlyFee.toString()} 💰` },
              { label: "Est. Daily", value: `+${formatTokens(dailyIncome)} 💰` },
            ].map((s) => (
              <div key={s.label} className="stat-pill">
                <span style={{ fontWeight: 700, fontSize: "14px" }}>{s.value}</span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Join/Leave action */}
        {!isOwner && (
          <div style={{ marginBottom: "20px" }}>
            <GymJoinButton
              gymId={gymId}
              gymName={gym.name}
              joinCost={tierData.joinXp > 0 ? tierData.joinXp : tierData.joinGymfit}
              joinCostLabel={tierData.joinXp > 0 ? "XP" : "GYMFIT"}
              isMember={isMember}
              canAfford={canAfford}
              isFull={isFull}
            />
          </div>
        )}
        {isOwner && (
          <div className="badge badge-purple" style={{ marginBottom: "20px", display: "inline-flex" }}>
            👑 You own this gym
          </div>
        )}

        {/* Trainer application */}
        {isMember && !isOwner && (
          <div style={{ marginBottom: "20px" }}>
            {isTrainer ? (
              <div className="badge badge-teal" style={{ display: "inline-flex" }}>
                🎓 You train here
              </div>
            ) : (
              <GymTrainerButton
                gymId={gymId}
                requiredLevel={requiredTrainerLevel}
                playerLevel={user?.level ?? 1}
              />
            )}
          </div>
        )}

        {/* Equipment */}
        {gym.equipment.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <p className="section-title">🏋️ Equipment</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {gym.equipment.map((eq) => (
                <div key={eq.id} className="card" style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: "14px" }}>{eq.name}</p>
                      <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                        {eq.type} · Capacity {eq.capacity}
                      </p>
                    </div>
                    <span className="badge badge-purple">Lvl {eq.level}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members */}
        {gym.members.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <p className="section-title">👥 Recent Members</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {gym.members.map((m) => (
                <div key={m.id} className="card" style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "var(--bg-elevated)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "18px", flexShrink: 0,
                    }}
                  >
                    {m.user.image ? (
                      <img src={m.user.image} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                    ) : "👤"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: "14px" }}>{m.user.name ?? "Member"}</p>
                    {m.role === "TRAINER" && (
                      <p style={{ margin: 0, fontSize: "11px", color: "#00d4aa" }}>🎓 Trainer</p>
                    )}
                  </div>
                  <span className="badge badge-purple">Lvl {m.user.level}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NPC Clients */}
        {gym.npcClients.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <p className="section-title">🤖 NPC Clients ({gym.npcClients.length})</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {gym.npcClients.map((c) => (
                <div key={c.id} className="badge badge-purple" style={{ fontSize: "12px" }}>
                  {c.name} · {c.satisfaction}% happy
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

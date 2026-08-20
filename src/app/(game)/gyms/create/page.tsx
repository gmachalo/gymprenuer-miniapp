"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateGymPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("100");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (name.trim().length < 3) { setError("Name must be at least 3 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/game/gyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, monthlyFee: parseInt(monthlyFee) }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/gyms/${data.gym.id}`);
      } else {
        setError(data.error ?? "Failed to create gym");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <header className="top-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <a href="/gyms" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "22px" }}>‹</a>
          <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 800 }}>Create Gym</h1>
        </div>
      </header>

      <div className="container" style={{ paddingTop: "24px" }}>
        {/* Cost warning */}
        <div
          className="card"
          style={{
            marginBottom: "24px",
            background: "linear-gradient(135deg, rgba(245,197,24,0.1), rgba(255,107,53,0.05))",
            border: "1px solid rgba(245,197,24,0.3)",
          }}
        >
          <p style={{ margin: "0 0 4px", fontWeight: 700 }}>⚡ Cost: 500 XP</p>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
            Gym creation is a one-time XP burn from your spendable pool. This keeps the market healthy.
          </p>
        </div>

        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: 600 }}>
              Gym Name *
            </label>
            <input
              id="gym-name"
              className="input"
              placeholder="e.g. Iron Brotherhood"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: 600 }}>
              Description
            </label>
            <textarea
              id="gym-description"
              className="input"
              placeholder="Tell people what your gym is about..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={200}
              style={{ resize: "vertical", minHeight: "80px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: 600 }}>
              Monthly Fee (GYMFIT)
            </label>
            <input
              id="gym-fee"
              className="input"
              type="number"
              min="10"
              max="1000"
              value={monthlyFee}
              onChange={(e) => setMonthlyFee(e.target.value)}
            />
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
              Members pay this monthly. Higher fees = less members but more revenue per member.
            </p>
          </div>

          {error && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "10px",
                background: "rgba(255,77,109,0.1)",
                border: "1px solid rgba(255,77,109,0.3)",
                color: "#ff4d6d",
                fontSize: "14px",
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <button
            id="submit-create-gym"
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: "100%" }}
            disabled={loading}
          >
            {loading ? "Creating..." : "🏗️ Create Gym (500 XP)"}
          </button>
        </form>
      </div>
    </div>
  );
}

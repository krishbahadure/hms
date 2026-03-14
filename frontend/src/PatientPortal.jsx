import React, { useState, useEffect, useCallback } from "react";
import "./PatientPortal.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const TRACKING_MAP = {
  icu:             { label: "ICU",             emoji: "🔴", color: "#e53935", bg: "#ffebee" },
  under_treatment: { label: "Under Treatment", emoji: "🟡", color: "#f9a825", bg: "#fffde7" },
  admitted:        { label: "Admitted",        emoji: "🔵", color: "#1565c0", bg: "#e3f2fd" },
  discharged:      { label: "Discharged",      emoji: "🟢", color: "#2e7d32", bg: "#e8f5e9" },
};

function QueueStatusCard({ data }) {
  if (!data) return null;
  const sev = { critical: "🔴", moderate: "🟡", normal: "🟢" }[data.severity] || "⚪";
  return (
    <div className="card queue-card">
      <h3>📋 Your OPD Status</h3>
      <div className="queue-details">
        <div className="queue-position">
          <span className="position-number">#{data.queue_position ?? "—"}</span>
          <span className="position-label">Queue Position</span>
        </div>
        <div className="queue-wait">
          <span className="wait-number">~{data.estimated_wait_minutes ?? 0}</span>
          <span className="wait-label">min estimated wait</span>
        </div>
      </div>
      <div className="queue-meta">
        <div><strong>Specialty:</strong> {data.specialty ?? "—"}</div>
        <div><strong>Doctor:</strong> {data.doctor_name ?? "To be assigned"}</div>
        <div><strong>Severity:</strong> {sev} {data.severity?.toUpperCase()}</div>
        <div><strong>Status:</strong> {data.status?.replace("_", " ").toUpperCase()}</div>
      </div>
      <p className="queue-note">ℹ️ Your position updates automatically. Please stay in the waiting area.</p>
    </div>
  );
}

function TrackingCard({ data }) {
  if (!data) return null;
  const t = TRACKING_MAP[data.status] || { label: "Unknown", emoji: "⚪", color: "#888", bg: "#f5f5f5" };
  return (
    <div className="card tracking-card" style={{ borderLeft: `6px solid ${t.color}`, background: t.bg }}>
      <h3>🏥 Admission Status</h3>
      <div className="status-display">
        <span className="status-emoji">{t.emoji}</span>
        <div className="status-text">
          <div className="status-label" style={{ color: t.color }}>{t.label}</div>
          {data.ward && <div className="status-detail">Ward: {data.ward} {data.bed_number ? `| Bed: ${data.bed_number}` : ""}</div>}
          {data.doctor_name && <div className="status-detail">Dr. {data.doctor_name}</div>}
        </div>
      </div>
      <div className="status-dates">
        <div><strong>Admitted:</strong> {data.admitted_at ? new Date(data.admitted_at).toLocaleString() : "—"}</div>
        {data.discharged_at && <div><strong>Discharged:</strong> {new Date(data.discharged_at).toLocaleString()}</div>}
      </div>
    </div>
  );
}

function BillCard({ bill, onPayment }) {
  const [amount,  setAmount]  = useState("");
  const [method,  setMethod]  = useState("simulated");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const pay = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/billing/pay`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill_id: bill.id, amount: parseFloat(amount), method }),
      });
      const data = await res.json();
      if (res.ok) { onPayment?.(data); setAmount(""); }
      else setError(data.detail || "Payment failed");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  };

  const statusColor = { pending:"#f9a825", partial:"#1565c0", paid:"#2e7d32", waived:"#888" }[bill.status] || "#888";
  return (
    <div className="card bill-card">
      <h3>💳 Your Bill</h3>
      <div className="bill-summary">
        <div className="bill-amount">₹{parseFloat(bill.total_amount || 0).toLocaleString("en-IN")}</div>
        <div className="bill-status" style={{ color: statusColor }}>{bill.status?.toUpperCase()}</div>
      </div>
      <div className="bill-breakdown">
        <div>Total  : <strong>₹{parseFloat(bill.total_amount || 0).toLocaleString("en-IN")}</strong></div>
        <div>Paid   : <strong className="paid-amt">₹{parseFloat(bill.paid_amount || 0).toLocaleString("en-IN")}</strong></div>
        <div>Due    : <strong className="due-amt">₹{parseFloat(bill.due_amount || 0).toLocaleString("en-IN")}</strong></div>
      </div>
      {bill.items?.length > 0 && (
        <table className="item-table">
          <thead><tr><th>Type</th><th>Description</th><th>Qty</th><th>Amount</th></tr></thead>
          <tbody>
            {bill.items.map((it, i) => (
              <tr key={i}>
                <td><span className="cat-badge">{it.category}</span></td>
                <td>{it.description}</td>
                <td>{it.quantity}</td>
                <td>₹{parseFloat(it.total_price).toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {bill.status !== "paid" && (
        <form className="pay-form" onSubmit={pay}>
          <h4>Make Payment</h4>
          {error && <div className="error-msg">{error}</div>}
          <div className="form-row">
            <label>Amount (₹)</label>
            <input type="number" required min="1" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)} placeholder={parseFloat(bill.due_amount || 0).toFixed(2)} />
          </div>
          <div className="form-row">
            <label>Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)}>
              <option value="simulated">💳 Simulated</option>
              <option value="cash">💵 Cash</option>
              <option value="card">🏦 Card</option>
              <option value="upi">📲 UPI</option>
            </select>
          </div>
          <button type="submit" className="btn-pay" disabled={loading}>{loading ? "Processing…" : "✅ Pay Now"}</button>
        </form>
      )}
      {bill.receipt_pdf_url && (
        <a className="receipt-link" href={bill.receipt_pdf_url} target="_blank" rel="noreferrer">📄 Download Digital Receipt</a>
      )}
    </div>
  );
}

// ─── Medicines Card (read-only for patient) ───────────────────────────────────
function MedicinesCard({ patientId }) {
  const [medicines, setMedicines] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!patientId) return;
    (async () => {
      try {
        const r = await fetch(`${API}/api/patient/${patientId}/medicines`);
        if (r.ok) { const d = await r.json(); setMedicines(d.medicines || []); }
      } catch {}
      finally { setLoading(false); }
    })();
  }, [patientId]);

  if (loading) return <div className="card"><p className="muted">Loading medicines…</p></div>;

  return (
    <div className="card medicines-card">
      <h3>💊 My Medicines</h3>
      {medicines.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>No medicines have been prescribed yet. Contact your doctor.</p>
      ) : (
        <div className="med-list">
          {medicines.map((m, i) => (
            <div key={i} className="med-item">
              <div className="med-header">
                <span className="med-name">💊 {m.name}</span>
                {m.dosage_form && <span className="med-badge">{m.dosage_form}</span>}
              </div>
              {m.description && <div className="med-desc">{m.description}</div>}
              <div className="med-instructions">
                <strong>Instructions:</strong> {m.dosage_instructions}
              </div>
              <div className="med-date">
                Prescribed: {m.prescribed_at ? new Date(m.prescribed_at).toLocaleDateString() : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Patient Portal ──────────────────────────────────────────────────────
export default function PatientPortal({ user }) {
  // patientId comes from the auth session (no UUID entry screen)
  const patientId = user?.patient_id || "";

  const [activeTab,     setActiveTab]     = useState("overview");
  const [queueStatus,   setQueueStatus]   = useState(null);
  const [tracking,      setTracking]      = useState(null);
  const [billingSummary,setBillingSummary] = useState(null);
  const [billingLoading,setBillingLoading] = useState(false);
  const [toast,         setToast]         = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const fetchQueue = useCallback(async () => {
    if (!patientId) return;
    try {
      const r = await fetch(`${API}/api/opd/patient/${patientId}/status`);
      if (r.ok) setQueueStatus(await r.json());
      else setQueueStatus(null);
    } catch {}
  }, [patientId]);

  const fetchTracking = useCallback(async () => {
    if (!patientId) return;
    try {
      const r = await fetch(`${API}/api/patient/${patientId}/tracking`);
      if (r.ok) setTracking(await r.json());
      else setTracking(null);
    } catch {}
  }, [patientId]);

  const fetchBillingSummary = useCallback(async () => {
    if (!patientId) return;
    setBillingLoading(true);
    try {
      const r = await fetch(`${API}/api/billing/patient/${patientId}/summary`);
      if (r.ok) setBillingSummary(await r.json());
      else setBillingSummary(null);
    } catch {}
    finally { setBillingLoading(false); }
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return;
    fetchQueue(); fetchTracking(); fetchBillingSummary();
    const id = setInterval(() => { fetchQueue(); fetchTracking(); }, 30000);
    return () => clearInterval(id);
  }, [patientId, fetchQueue, fetchTracking, fetchBillingSummary]);

  const NAV_ITEMS = [
    ["overview",   "🏠 Overview"],
    ["queue",      "⏱ OPD Queue"],
    ["tracking",   "📍 My Status"],
    ["medicines",  "💊 My Medicines"],
    ["billing",    "💳 Billing"],
  ];

  const TAB_TITLES = {
    overview:  "🏠 Welcome",
    queue:     "⏱ OPD Queue Status",
    tracking:  "📍 My Admission Status",
    medicines: "💊 My Medicines",
    billing:   "💳 Billing & Payments",
  };

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <div className="portal-logo">🏥 Patient Portal</div>
        <div className="sidebar-user">👋 {user?.full_name || "Patient"}</div>
        <nav>
          {NAV_ITEMS.map(([tab, label]) => (
            <button key={tab} className={`nav-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="portal-main">
        <header className="portal-topbar">
          <h1>{TAB_TITLES[activeTab]}</h1>
          {toast && <div className="toast">{toast}</div>}
        </header>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <div className="overview-grid">
            {queueStatus && <QueueStatusCard data={queueStatus} />}
            {tracking    && <TrackingCard    data={tracking}    />}
            {!queueStatus && !tracking && (
              <div className="card info-card">
                <h3>👋 Welcome to HMS Patient Portal</h3>
                <p>You have no active OPD visit or admission at this time.</p>
                <p>Navigate using the sidebar to view your medicines, records, and billing.</p>
              </div>
            )}
          </div>
        )}

        {/* QUEUE */}
        {activeTab === "queue" && (
          <div className="tab-content">
            {queueStatus
              ? <QueueStatusCard data={queueStatus} />
              : <div className="card empty-card"><p>✅ You are not currently in the OPD queue.</p></div>
            }
          </div>
        )}

        {/* TRACKING */}
        {activeTab === "tracking" && (
          <div className="tab-content">
            {tracking
              ? <TrackingCard data={tracking} />
              : <div className="card empty-card"><p>No active admission found.</p></div>
            }
            <div className="card timeline-card">
              <h3>Status Indicator</h3>
              <div className="status-timeline">
                {Object.entries(TRACKING_MAP).map(([key, t]) => (
                  <div key={key} className={`timeline-step ${tracking?.status === key ? "active-step" : ""}`}
                    style={{ borderColor: tracking?.status === key ? t.color : "#ddd" }}>
                    <span className="step-emoji">{t.emoji}</span>
                    <span className="step-label" style={{ color: tracking?.status === key ? t.color : "#888" }}>{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MEDICINES (read-only) */}
        {activeTab === "medicines" && (
          <div className="tab-content">
            <MedicinesCard patientId={patientId} />
          </div>
        )}

        {/* BILLING */}
        {activeTab === "billing" && (
          <div className="tab-content">
            {billingLoading && <div className="card"><p className="muted">Loading billing information…</p></div>}
            {!billingLoading && !billingSummary && (
              <div className="card empty-card"><p>No billing records found.</p></div>
            )}
            {billingSummary && (
              <div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3>💳 My Billing Summary</h3>
                  <div className="billing-summary-header">
                    <div className="billing-totals" style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 8 }}>
                      <span className="bt-item">Total Billed: <strong>₹{billingSummary.total_billed.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></span>
                      <span className="bt-item paid">Paid: <strong>₹{billingSummary.total_paid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></span>
                      <span className="bt-item due">Due: <strong>₹{billingSummary.total_due.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></span>
                    </div>
                  </div>
                </div>

                {billingSummary.bills.length === 0 ? (
                  <div className="card empty-card"><p>No bills generated yet.</p></div>
                ) : (
                  <div className="card">
                    <h4 style={{ marginBottom: 12 }}>📋 Bill History</h4>
                    <table className="item-table" style={{ width: "100%" }}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Total Amount</th>
                          <th>Download Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billingSummary.bills.map(b => (
                          <tr key={b.id}>
                            <td>{new Date(b.created_at).toLocaleDateString()}</td>
                            <td><strong>₹{parseFloat(b.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></td>
                            <td>
                              <a
                                href={`${API}/api/billing/bill/${b.id}/download-receipt`}
                                target="_blank" rel="noreferrer"
                                className="receipt-link"
                                style={{ fontSize: "0.85rem", display: "inline-block", marginTop: 0 }}
                              >📄 Download PDF</a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      className="btn-primary"
                      style={{ marginTop: 14 }}
                      onClick={fetchBillingSummary}
                    >🔄 Refresh Bills</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

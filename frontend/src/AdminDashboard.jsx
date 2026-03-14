import React, { useState, useEffect, useCallback } from "react";
import "./AdminDashboard.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const severityColor = (s) => ({ critical: "sev-critical", moderate: "sev-moderate", normal: "sev-normal" }[s] || "sev-normal");

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div className={`stat-card ${accent}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value ?? "—"}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

function AlertBanner({ alerts }) {
  if (!alerts?.length) return null;
  return (
    <div className="alert-banner">
      <span className="alert-icon">🚨</span>
      <span className="alert-text">{alerts.length} Unread Admin Alert{alerts.length > 1 ? "s" : ""}</span>
    </div>
  );
}

function EmergencyRow({ em, onDelete }) {
  const sev = { critical: "🔴", moderate: "🟡", normal: "🟢" }[em.severity] || "⚪";
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Delete emergency for ${em.patient_name}?`)) return;
    setDeleting(true);
    try {
      await fetch(`${API}/api/emergency/${em.id}`, { method: "DELETE" });
      onDelete?.(em.id);
    } catch { } finally { setDeleting(false); }
  };

  return (
    <>
      <tr className="em-row" onClick={() => setExpanded(p => !p)} style={{ cursor: "pointer" }}>
        <td><span className={`pill ${em.severity === "critical" ? "sev-critical" : em.severity === "moderate" ? "sev-moderate" : "sev-normal"}`}>{sev} {em.severity?.toUpperCase()}</span></td>
        <td><strong>{em.patient_name}</strong>{em.age ? ` (${em.age})` : ""}</td>
        <td>{em.location_text}</td>
        <td className="em-symptoms">{em.symptoms_described?.slice(0, 50)}{em.symptoms_described?.length > 50 ? "…" : ""}</td>
        <td>{new Date(em.created_at).toLocaleTimeString()}</td>
        <td style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <a
            href={`${API}/api/emergency/${em.id}/download-pdf`}
            target="_blank" rel="noreferrer"
            className="btn-link"
            onClick={e => e.stopPropagation()}
          >📄 PDF</a>
          <button
            className="btn-danger-sm"
            onClick={e => { e.stopPropagation(); handleDelete(); }}
            disabled={deleting}
          >{deleting ? "…" : "🗑"}</button>
        </td>
      </tr>
      {expanded && (
        <tr className="em-detail-row">
          <td colSpan={6}>
            <div className="em-detail-grid">
              {em.gender && <div><strong>Gender:</strong> {em.gender}</div>}
              {em.blood_group && <div><strong>Blood Group:</strong> {em.blood_group}</div>}
              {em.patient_phone && <div><strong>Phone:</strong> {em.patient_phone}</div>}
              {em.emergency_contact && <div><strong>Emergency Contact:</strong> {em.emergency_contact}</div>}
              {em.address && <div><strong>Address:</strong> {em.address}</div>}
              {em.existing_diseases && <div><strong>Existing Diseases:</strong> {em.existing_diseases}</div>}
              {em.allergies_info && <div><strong>Allergies:</strong> {em.allergies_info}</div>}
              {em.current_medications && <div><strong>Medications:</strong> {em.current_medications}</div>}
              {em.medical_history && <div><strong>Medical History:</strong> {em.medical_history}</div>}
              {em.hospital_preference && <div><strong>Hospital Preference:</strong> {em.hospital_preference}</div>}
              {em.additional_notes && <div><strong>Notes:</strong> {em.additional_notes}</div>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function QueueRow({ entry, rank }) {
  return (
    <tr>
      <td className="rank">#{rank}</td>
      <td>{entry.patient_name}</td>
      <td>~{entry.estimated_wait_minutes} min</td>
    </tr>
  );
}

// ─── OPD Registration Form (with patient + doctor dropdown) ──────────────────
function OpdRegisterForm({ onSuccess, patients, doctors }) {
  const [patientId, setPatientId] = useState("");
  const [doctorId,  setDoctorId]  = useState("");
  const [symptoms,  setSymptoms]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(""); setResult(null);
    try {
      const body = { patient_id: patientId, symptoms_text: symptoms };
      if (doctorId) body.doctor_id = doctorId;
      const res = await fetch(`${API}/api/opd/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) { setResult(data); onSuccess?.(); setPatientId(""); setDoctorId(""); setSymptoms(""); }
      else setError(data.detail || "Registration failed");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  };

  return (
    <form className="opd-form" onSubmit={submit}>
      <h3>📋 Register Patient to OPD Queue</h3>
      {error  && <div className="error-msg">{error}</div>}
      {result && (
        <div className="success-msg">
          ✅ Registered! Specialty: <strong>{result.specialty}</strong> |
          Severity: <span className={severityColor(result.severity)}>{result.severity?.toUpperCase()}</span> |
          Doctor: <strong>{result.assigned_to}</strong>
        </div>
      )}
      <div className="form-row">
        <label>Select Patient *</label>
        <select required value={patientId} onChange={e => setPatientId(e.target.value)}>
          <option value="">— Choose a patient —</option>
          {patients.map(p => (
            <option key={p.patient_id} value={p.patient_id}>{p.full_name} ({p.email})</option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label>Assign Doctor <span className="muted" style={{fontWeight:400}}>(optional – auto-assigned if blank)</span></label>
        <select value={doctorId} onChange={e => setDoctorId(e.target.value)}>
          <option value="">— Auto-assign by specialty —</option>
          {doctors.map(d => (
            <option key={d.doctor_id} value={d.doctor_id}>
              Dr. {d.full_name} ({d.specialty_name})
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label>Symptoms *</label>
        <textarea required rows={2} value={symptoms} onChange={e => setSymptoms(e.target.value)} placeholder="e.g. Chest pain, difficulty breathing" />
      </div>
      <button type="submit" disabled={loading}>{loading ? "Registering…" : "Add to Queue"}</button>
    </form>
  );
}

// ─── Medicines Tab ────────────────────────────────────────────────────────────
function MedicinesTab({ user, patients }) {
  const [medicines,    setMedicines]    = useState([]);
  const [form,         setForm]         = useState({ name: "", description: "", dosage_form: "", cost: "" });
  const [assign,       setAssign]       = useState({ patient_id: "", medicine_id: "", dosage_instructions: "" });
  const [loading,      setLoading]      = useState(false);
  const [assignLoading,setAssignLoading]= useState(false);
  const [error,        setError]        = useState("");
  const [success,      setSuccess]      = useState("");

  const fetchMedicines = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/medicines`);
      if (r.ok) { const d = await r.json(); setMedicines(d.medicines || []); }
    } catch {}
  }, []);

  useEffect(() => { fetchMedicines(); }, [fetchMedicines]);

  const addMedicine = async (e) => {
    e.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    try {
      const r = await fetch(`${API}/api/medicines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, cost: form.cost ? parseFloat(form.cost) : null }),
      });
      const d = await r.json();
      if (r.ok) { setSuccess(`✅ Medicine "${d.name}" added!`); setForm({ name: "", description: "", dosage_form: "", cost: "" }); fetchMedicines(); }
      else setError(d.detail || "Failed");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  };

  const deleteMedicine = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await fetch(`${API}/api/medicines/${id}`, { method: "DELETE" });
    fetchMedicines();
  };

  const assignMedicine = async (e) => {
    e.preventDefault();
    setAssignLoading(true); setError(""); setSuccess("");
    try {
      const r = await fetch(`${API}/api/patient/${assign.patient_id}/medicines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicine_id: assign.medicine_id, dosage_instructions: assign.dosage_instructions, prescribed_by_user_id: user?.user_id }),
      });
      const d = await r.json();
      if (r.ok) { setSuccess("✅ Medicine assigned to patient!"); setAssign({ patient_id: "", medicine_id: "", dosage_instructions: "" }); }
      else setError(d.detail || "Failed");
    } catch { setError("Network error"); }
    finally { setAssignLoading(false); }
  };

  return (
    <div className="medicines-tab">
      {error   && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="medicines-grid">
        {/* Add Medicine */}
        <div>
          <form className="med-form" onSubmit={addMedicine}>
            <h3>💊 Add New Medicine</h3>
            <div className="form-row">
              <label>Medicine Name *</label>
              <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Paracetamol 500mg" />
            </div>
            <div className="form-row">
              <label>Description</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What it treats…" />
            </div>
            <div className="form-row">
              <label>Dosage Form</label>
              <select value={form.dosage_form} onChange={e => setForm(p => ({ ...p, dosage_form: e.target.value }))}>
                <option value="">— Select form —</option>
                {["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Drops", "Inhaler", "Other"].map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Cost (₹ per unit)</label>
              <input type="number" min="0" step="0.01" value={form.cost}
                onChange={e => setForm(p => ({ ...p, cost: e.target.value }))}
                placeholder="e.g. 12.50" />
            </div>
            <button type="submit" disabled={loading}>{loading ? "Adding…" : "➕ Add Medicine"}</button>
          </form>

          {/* Assign Medicine */}
          <form className="med-form" onSubmit={assignMedicine} style={{ marginTop: "24px" }}>
            <h3>📋 Assign Medicine to Patient</h3>
            <div className="form-row">
              <label>Patient *</label>
              <select required value={assign.patient_id} onChange={e => setAssign(p => ({ ...p, patient_id: e.target.value }))}>
                <option value="">— Select patient —</option>
                {patients.map(p => <option key={p.patient_id} value={p.patient_id}>{p.full_name} ({p.email})</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Medicine *</label>
              <select required value={assign.medicine_id} onChange={e => setAssign(p => ({ ...p, medicine_id: e.target.value }))}>
                <option value="">— Select medicine —</option>
                {medicines.map(m => <option key={m.id} value={m.id}>{m.name}{m.dosage_form ? ` (${m.dosage_form})` : ""}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Dosage Instructions *</label>
              <textarea required rows={2} value={assign.dosage_instructions} onChange={e => setAssign(p => ({ ...p, dosage_instructions: e.target.value }))} placeholder="e.g. 1 tablet twice daily after meals" />
            </div>
            <button type="submit" disabled={assignLoading}>{assignLoading ? "Assigning…" : "✅ Assign Medicine"}</button>
          </form>
        </div>

        {/* Medicine List */}
        <div>
          <div className="panel-header">
            <h3>💊 Medicine Catalogue</h3>
            <button className="btn-sm" onClick={fetchMedicines}>🔄 Refresh</button>
          </div>
              {medicines.length === 0
            ? <p className="muted">No medicines added yet.</p>
            : <table className="queue-table full">
                <thead><tr><th>Name</th><th>Form</th><th>Cost/Unit</th><th>Description</th><th></th></tr></thead>
                <tbody>
                  {medicines.map(m => (
                    <tr key={m.id}>
                      <td><strong>{m.name}</strong></td>
                      <td>{m.dosage_form || "—"}</td>
                      <td>{m.cost != null ? `₹${parseFloat(m.cost).toFixed(2)}` : "—"}</td>
                      <td className="muted" style={{ fontSize: "0.82rem" }}>{m.description || "—"}</td>
                      <td>
                        <button className="btn-danger-sm" onClick={() => deleteMedicine(m.id, m.name)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Billing Tab ─────────────────────────────────────────────────────────────
function BillingTab({ stats, patients }) {
  const [selectedPatient, setSelectedPatient] = useState("");
  const [summary,         setSummary]         = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");

  const loadSummary = async (pid) => {
    if (!pid) return;
    setLoading(true); setError(""); setSummary(null);
    try {
      const r = await fetch(`${API}/api/billing/patient/${pid}/summary`);
      if (r.ok) setSummary(await r.json());
      else setError("Could not load billing data for this patient.");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="billing-tab">
      <div className="info-card" style={{ marginBottom: 24 }}>
        <h2>💳 Billing Overview</h2>
        <p>Total Revenue Collected: <strong>
          {stats ? `₹${stats.total_revenue.toLocaleString("en-IN")}` : "Loading…"}
        </strong></p>
      </div>

      <div className="panel-card">
        <h3>🔍 Patient Billing Summary</h3>
        <div className="form-row" style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <select
            value={selectedPatient}
            onChange={e => { setSelectedPatient(e.target.value); loadSummary(e.target.value); }}
            style={{ flex: 1 }}
          >
            <option value="">— Select a patient —</option>
            {patients.map(p => (
              <option key={p.patient_id} value={p.patient_id}>{p.full_name} ({p.email})</option>
            ))}
          </select>
        </div>

        {loading && <p className="muted">Loading…</p>}
        {error   && <div className="error-msg">{error}</div>}

        {summary && (
          <div>
            <div className="billing-summary-header">
              <div><strong>{summary.patient_name}</strong></div>
              <div className="billing-totals">
                <span className="bt-item">Billed: <strong>₹{summary.total_billed.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></span>
                <span className="bt-item paid">Paid: <strong>₹{summary.total_paid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></span>
                <span className="bt-item due">Due: <strong>₹{summary.total_due.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></span>
              </div>
            </div>

            {summary.bills.length === 0
              ? <p className="muted">No bills found for this patient.</p>
              : <table className="queue-table full">
                  <thead><tr><th>Date</th><th>Total Amount</th><th>Receipt</th></tr></thead>
                  <tbody>
                    {summary.bills.map(b => (
                      <tr key={b.id}>
                        <td>{new Date(b.created_at).toLocaleDateString()}</td>
                        <td><strong>₹{parseFloat(b.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></td>
                        <td>
                          <a href={`${API}/api/billing/bill/${b.id}/download-receipt`}
                             target="_blank" rel="noreferrer" className="btn-link">📄 Download</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            }
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Main Admin Dashboard ─────────────────────────────────────────────────────
export default function AdminDashboard({ user }) {
  const [stats,       setStats]      = useState(null);
  const [queue,       setQueue]      = useState([]);
  const [emergencies, setEmergencies]= useState([]);
  const [patients,    setPatients]   = useState([]);
  const [doctors,     setDoctors]    = useState([]);
  const [activeTab,   setActiveTab]  = useState("dashboard");
  const [toast,       setToast]      = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const fetchStats = useCallback(async () => {
    try { const r = await fetch(`${API}/api/admin/dashboard-stats`); if (r.ok) setStats(await r.json()); } catch {}
  }, []);

  const fetchQueue = useCallback(async () => {
    try { const r = await fetch(`${API}/api/opd/queue`); if (r.ok) { const d = await r.json(); setQueue(d.queue || []); } } catch {}
  }, []);

  const fetchEmergencies = useCallback(async () => {
    try { const r = await fetch(`${API}/api/emergency/active`); if (r.ok) { const d = await r.json(); setEmergencies(d.emergencies || []); } } catch {}
  }, []);

  const fetchPatients = useCallback(async () => {
    try { const r = await fetch(`${API}/api/patients/all`); if (r.ok) { const d = await r.json(); setPatients(d.patients || []); } } catch {}
  }, []);

  const fetchDoctors = useCallback(async () => {
    try { const r = await fetch(`${API}/api/doctors/all`); if (r.ok) { const d = await r.json(); setDoctors(d.doctors || []); } } catch {}
  }, []);

  const refreshQueue = async () => {
    try { await fetch(`${API}/api/opd/refresh-queue`, { method: "POST" }); await fetchQueue(); showToast("🔄 Queue refreshed!"); } catch {}
  };

  useEffect(() => {
    fetchStats(); fetchQueue(); fetchEmergencies(); fetchPatients(); fetchDoctors();
    const id = setInterval(() => { fetchStats(); fetchQueue(); fetchEmergencies(); }, 20000);
    return () => clearInterval(id);
  }, [fetchStats, fetchQueue, fetchEmergencies, fetchPatients, fetchDoctors]);

  const NAV_ITEMS = [
    ["dashboard", "📊 Dashboard"],
    ["opd",       "👥 OPD Queue"],
    ["emergency", "🚨 Emergency"],
    ["medicines", "💊 Medicines"],
    ["billing",   "💳 Billing"],
  ];

  const TAB_TITLES = {
    dashboard: "📊 Live Dashboard",
    opd:       "👥 OPD Queue",
    emergency: "🚨 Emergency Centre",
    medicines: "💊 Medicine Management",
    billing:   "💳 Billing Overview",
  };

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="logo">🏥 HMS Admin</div>
        <div className="sidebar-user">👋 {user?.full_name || "Admin"}</div>
        <nav>
          {NAV_ITEMS.map(([tab, label]) => (
            <button key={tab} className={`nav-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-role">🔐 Logged in as Admin</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="top-bar">
          <h1>{TAB_TITLES[activeTab]}</h1>
          {toast && <div className="toast">{toast}</div>}
          {stats?.unread_alerts > 0 && (
            <AlertBanner alerts={Array(stats.unread_alerts).fill(null)} />
          )}
        </header>

        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="dashboard-grid">
            <div className="stats-row">
              <StatCard icon="👤" label="Total Patients"    value={stats?.total_patients}      accent="accent-blue"   />
              <StatCard icon="🛏"  label="Active Admissions" value={stats?.active_admissions}   accent="accent-teal"   />
              <StatCard icon="📊" label="Occupancy Rate"    value={`${stats?.occupancy_rate ?? 0}%`} accent="accent-orange" />
              <StatCard icon="🚨" label="Active Emergencies" value={stats?.active_emergencies}  accent="accent-red"    />
              <StatCard icon="👥" label="OPD Waiting"       value={stats?.opd_waiting}         accent="accent-purple" />
              <StatCard icon="💰" label="Total Revenue"     value={stats ? `₹${stats.total_revenue.toLocaleString("en-IN")}` : "—"} accent="accent-green" />
            </div>

            <div className="beds-panel">
              <h2>🛏 Bed Status</h2>
              <div className="bed-row">
                <span className="badge-red pill">{stats?.beds?.icu_count ?? 0} ICU 🔴</span>
                <span className="badge-yellow pill">{stats?.beds?.treatment_count ?? 0} Under Treatment 🟡</span>
                <span className="badge-blue pill">{stats?.beds?.admitted_count ?? 0} Admitted 🔵</span>
              </div>
            </div>

            <div className="mini-queue">
              <div className="panel-header">
                <h2>⏱ Live OPD Queue (Top 5)</h2>
                <button className="btn-sm" onClick={refreshQueue}>🔄 Refresh</button>
              </div>
              <table className="queue-table">
                <thead><tr><th>#</th><th>Patient</th><th>Est. Wait</th></tr></thead>
                <tbody>
                  {queue.slice(0, 5).map((e, i) => <QueueRow key={e.queue_id} entry={e} rank={i + 1} />)}
                  {queue.length === 0 && <tr><td colSpan={3} className="muted center">No patients waiting</td></tr>}
                </tbody>
              </table>
            </div>

            {emergencies.length > 0 && (
              <div className="em-panel">
                <h2>🚨 Active Emergencies</h2>
                <table className="em-table">
                  <thead><tr><th>Sev.</th><th>Patient</th><th>Location</th><th>Symptoms</th><th>Time</th><th>PDF / Del</th></tr></thead>
                  <tbody>{emergencies.map(em => <EmergencyRow key={em.id} em={em} onDelete={id => setEmergencies(p => p.filter(e => e.id !== id))} />)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* OPD */}
        {activeTab === "opd" && (
          <div className="opd-tab">
            <OpdRegisterForm patients={patients} doctors={doctors} onSuccess={() => { fetchQueue(); fetchStats(); }} />
            <div className="queue-panel">
              <div className="panel-header">
                <h2>Live Priority Queue</h2>
                <button className="btn-sm" onClick={refreshQueue}>🔄 Refresh Priority</button>
              </div>
              <table className="queue-table full">
                <thead><tr><th>Position</th><th>Patient</th><th>Est. Wait</th></tr></thead>
                <tbody>
                  {queue.map((e, i) => <QueueRow key={e.queue_id} entry={e} rank={i + 1} />)}
                  {queue.length === 0 && <tr><td colSpan={3} className="muted center">Queue is empty</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* EMERGENCY */}
        {activeTab === "emergency" && (
          <div className="em-tab">
            <div className="em-list-panel">
          <div className="em-list-panel">
              <div className="panel-header">
                <h2>Active Emergencies ({emergencies.length})</h2>
                <button className="btn-sm" onClick={fetchEmergencies}>🔄 Refresh</button>
              </div>
              {emergencies.length === 0
                ? <p className="muted">No active emergencies. ✅</p>
                : <table className="em-table">
                    <thead><tr><th>Sev.</th><th>Patient</th><th>Location</th><th>Symptoms</th><th>Time</th><th>PDF / Del</th></tr></thead>
                    <tbody>{emergencies.map(em => <EmergencyRow key={em.id} em={em} onDelete={id => setEmergencies(p => p.filter(e => e.id !== id))} />)}</tbody>
                  </table>
              }
            </div>
            </div>
          </div>
        )}

        {/* MEDICINES */}
        {activeTab === "medicines" && <MedicinesTab user={user} patients={patients} />}

        {/* BILLING */}
        {activeTab === "billing" && (
          <BillingTab stats={stats} patients={patients} />
        )}
      </main>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import "./DoctorPortal.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// doctorId resolved from session user prop (user.user_id)

// ─── Severity badge ───────────────────────────────────────────────────────────
function SeverityBadge({ severity }) {
  const map = {
    critical: { label: "CRITICAL", cls: "sev-critical" },
    moderate: { label: "MODERATE", cls: "sev-moderate" },
    normal: { label: "NORMAL", cls: "sev-normal" },
  };
  const { label, cls } = map[severity] || map.normal;
  return <span className={`sev-pill ${cls}`}>{label}</span>;
}

// ─── Queue entry row with action buttons ──────────────────────────────────────
function QueueEntryCard({ entry, onStart, onComplete, setToast }) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const isInProgress = entry.status === "in_progress";

  const handleStart = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/opd/${entry.queue_id}/start`, { method: "PATCH" });
      if (r.ok) { setToast("▶️ Consultation started"); onStart(); }
    } catch { }
    finally { setLoading(false); }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/opd/${entry.queue_id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queue_id: entry.queue_id, notes }),
      });
      if (r.ok) { setToast("✅ Consultation completed with notes"); onComplete(); }
    } catch { }
    finally { setLoading(false); }
  };

  const handleAttended = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/opd/${entry.queue_id}/attended`, { method: "PATCH" });
      if (r.ok) { setToast("✅ Patient marked as attended"); onComplete(); }
    } catch { }
    finally { setLoading(false); }
  };

  return (
    <div className={`entry-card ${isInProgress ? "in-progress" : ""}`}>
      <div className="entry-header">
        <div className="entry-rank">#{entry.queue_position}</div>
        <div className="entry-info">
          <div className="entry-name">{entry.patient_name}</div>
          <div className="entry-meta">
            <SeverityBadge severity={entry.severity} />
            <span className="entry-wait">~{entry.estimated_wait_minutes} min wait</span>
            <span className="entry-specialty">{entry.specialty}</span>
          </div>
        </div>
        <div className="entry-status-badge">
          {isInProgress
            ? <span className="status-ip">🟡 In Progress</span>
            : <span className="status-wait">⏳ Waiting</span>}
        </div>
      </div>

      {entry.symptoms_text && (
        <div className="entry-symptoms">
          <strong>Symptoms:</strong> {entry.symptoms_text}
        </div>
      )}

      <div className="entry-actions">
        {!isInProgress && (
          <button className="btn-start" onClick={handleStart} disabled={loading}>
            {loading ? "…" : "▶ Start Consultation"}
          </button>
        )}
        {isInProgress && (
          <>
            <textarea
              className="notes-box"
              rows={2}
              placeholder="Add treatment notes, diagnosis, prescription… (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="entry-action-row">
              <button className="btn-attended" onClick={handleAttended} disabled={loading}>
                {loading ? "…" : "✅ Mark Patient Attended"}
              </button>
              <button className="btn-complete" onClick={handleComplete} disabled={loading || !notes.trim()}>
                {loading ? "Saving…" : "📝 Complete with Notes"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Patient history sidebar ──────────────────────────────────────────────────
function PatientHistory({ patientId, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch(`${API}/api/opd/queue?doctor_id=${docId}`);
        if (r.ok) {
          const d = await r.json();
          setRecords(d.queue || []);
        }
      } catch { }
      finally { setLoading(false); }
    };
    fetch_();
  }, [patientId]);

  return (
    <div className="history-panel">
      <div className="history-header">
        <h3>📁 Patient History</h3>
        <button className="btn-close" onClick={onClose}>✕</button>
      </div>
      {loading
        ? <p className="muted">Loading…</p>
        : records.length
          ? records.map((r, i) => (
            <div key={i} className="history-item">
              <div className="history-meta">Visit #{i + 1}</div>
              <div>{r.patient_name}</div>
            </div>
          ))
          : <p className="muted">No past visits found.</p>
      }
    </div>
  );
}

// ─── Admission Status Update ──────────────────────────────────────────────────
function AdmissionUpdater({ setToast, patients }) {
  const docId = "";   // filled by parent later if needed
  const statusOptions = [
    { value: "icu",             label: "🔴 ICU" },
    { value: "under_treatment", label: "🟡 Under Treatment" },
    { value: "admitted",        label: "🔵 Admitted" },
    { value: "discharged",      label: "🟢 Discharged" },
  ];

  // ── Admit new patient ──
  const [newForm, setNewForm] = useState({ patient_id: "", ward: "", bed_number: "", status: "admitted" });
  const [admitting, setAdmitting] = useState(false);

  const admitPatient = async (e) => {
    e.preventDefault();
    setAdmitting(true);
    try {
      const r = await fetch(`${API}/api/admission/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: newForm.patient_id,
          ward:        newForm.ward || null,
          bed_number:  newForm.bed_number || null,
          status:      newForm.status,
        }),
      });
      if (r.ok) {
        setToast("✅ Patient admitted successfully!");
        setNewForm({ patient_id: "", ward: "", bed_number: "", status: "admitted" });
      } else {
        const d = await r.json();
        setToast(`❌ ${d.detail || "Admission failed"}`);
      }
    } catch { setToast("❌ Network error"); }
    finally { setAdmitting(false); }
  };

  // ── Update existing admission ──
  const [selectedPatient, setSelectedPatient] = useState("");
  const [admission,       setAdmission]       = useState(null);
  const [admLookup,       setAdmLookup]       = useState(false);
  const [updateStatus,    setUpdateStatus]    = useState("admitted");
  const [updating,        setUpdating]        = useState(false);

  const selectPatient = async (pid) => {
    setSelectedPatient(pid);
    setAdmission(null);
    if (!pid) return;
    setAdmLookup(true);
    try {
      const r = await fetch(`${API}/api/admissions/by-patient/${pid}`);
      if (r.ok) {
        const d = await r.json();
        setAdmission(d);
        setUpdateStatus(d.status || "admitted");
      } else {
        setToast("⚠️ No admission record found for this patient");
      }
    } catch { setToast("❌ Network error"); }
    finally { setAdmLookup(false); }
  };

  const updateAdmission = async (e) => {
    e.preventDefault();
    if (!admission) return;
    setUpdating(true);
    try {
      const r = await fetch(`${API}/api/admission/${admission.admission_id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: updateStatus }),
      });
      if (r.ok) {
        setToast("✅ Admission status updated");
        setAdmission(prev => ({ ...prev, status: updateStatus }));
      } else setToast("❌ Update failed");
    } catch { setToast("❌ Network error"); }
    finally { setUpdating(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Admit New Patient ── */}
      <div className="card">
        <h3>🏥 Admit New Patient</h3>
        <form className="updater-form" onSubmit={admitPatient}>
          <div className="form-row">
            <label>Select Patient *</label>
            <select required value={newForm.patient_id} onChange={e => setNewForm(p => ({ ...p, patient_id: e.target.value }))}>
              <option value="">— Choose a patient —</option>
              {patients.map(p => (
                <option key={p.patient_id} value={p.patient_id}>{p.full_name} ({p.email})</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Ward</label>
            <input value={newForm.ward} onChange={e => setNewForm(p => ({ ...p, ward: e.target.value }))} placeholder="e.g. General Ward A" />
          </div>
          <div className="form-row">
            <label>Bed Number</label>
            <input value={newForm.bed_number} onChange={e => setNewForm(p => ({ ...p, bed_number: e.target.value }))} placeholder="e.g. B-12" />
          </div>
          <div className="form-row">
            <label>Initial Status</label>
            <select value={newForm.status} onChange={e => setNewForm(p => ({ ...p, status: e.target.value }))}>
              {statusOptions.filter(o => o.value !== "discharged").map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-update" disabled={admitting}>
            {admitting ? "Admitting…" : "🏥 Admit Patient"}
          </button>
        </form>
      </div>

      {/* ── Update Existing Admission Status ── */}
      <div className="card">
        <h3>📍 Update Admission Status</h3>
        <form className="updater-form" onSubmit={updateAdmission}>
          <div className="form-row">
            <label>Select Patient *</label>
            <select required value={selectedPatient} onChange={e => selectPatient(e.target.value)}>
              <option value="">— Choose a patient —</option>
              {patients.map(p => (
                <option key={p.patient_id} value={p.patient_id}>{p.full_name} ({p.email})</option>
              ))}
            </select>
          </div>

          {admLookup && <p className="muted">Looking up admission…</p>}

          {admission && (
            <>
              <div className="form-row">
                <label>Current Admission</label>
                <div className="admission-info-box">
                  <div>Patient: <strong>{admission.patient_name}</strong></div>
                  <div>Ward: <strong>{admission.ward || "—"}</strong> | Bed: <strong>{admission.bed_number || "—"}</strong></div>
                  <div>Current Status: <strong>{admission.status?.replace("_", " ").toUpperCase()}</strong></div>
                  <div>Admitted: <strong>{admission.admitted_at ? new Date(admission.admitted_at).toLocaleString() : "—"}</strong></div>
                </div>
              </div>
              <div className="form-row">
                <label>New Status</label>
                <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)}>
                  {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <button type="submit" className="btn-update" disabled={updating}>
                {updating ? "Updating…" : "Update Status"}
              </button>
            </>
          )}

          {!admission && !admLookup && selectedPatient && (
            <p className="muted" style={{marginTop:12}}>No admission record found for this patient.</p>
          )}
        </form>
      </div>
    </div>
  );
}



// ─── Main Doctor Portal ───────────────────────────────────────────────────────
export default function DoctorPortal({ user }) {

  const docUserId = user?.user_id || "";
  const [docId,    setDocId]    = useState("");   // doctors.id (not users.id)
  const [queue,    setQueue]    = useState([]);
  const [patients, setPatients] = useState([]);
  const [activeTab, setTab]     = useState("queue");
  const [toast,    setToast]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [stats,    setStats]    = useState({ total: 0, waiting: 0, in_progress: 0 });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  // Resolve the doctors.id for this user so OPD queue filter works
  useEffect(() => {
    if (!docUserId) return;
    fetch(`${API}/api/doctors/all`)
      .then(r => r.json())
      .then(d => {
        const me = (d.doctors || []).find(dr => dr.user_id === docUserId);
        if (me) setDocId(me.doctor_id);
      })
      .catch(() => {});
  }, [docUserId]);

  const fetchQueue = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/opd/queue?doctor_id=${docId}`);
      if (!r.ok) { setLoading(false); return; }
      const data = await r.json();
      const q = data.queue || [];
      setQueue(q);
      setStats({
        total: q.length,
        waiting: q.filter((e) => e.status !== "in_progress").length,
        in_progress: q.filter((e) => e.status === "in_progress").length,
      });
    } catch { }
    finally { setLoading(false); }
  }, [docId]);

  const fetchPatients = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/patients/all`);
      if (r.ok) { const d = await r.json(); setPatients(d.patients || []); }
    } catch {}
  }, []);

  useEffect(() => {
    if (!docUserId) return;
    fetchPatients();
  }, [docUserId, fetchPatients]);

  useEffect(() => {
    if (!docId) return;
    fetchQueue();
    const interval = setInterval(fetchQueue, 20000);
    return () => clearInterval(interval);
  }, [docId, fetchQueue]);

  const waitingEntries = queue.filter((e) => e.status !== "in_progress");
  const inProgressEntries = queue.filter((e) => e.status === "in_progress");

  return (
    <div className="doc-shell">
      {/* Sidebar */}
      <aside className="doc-sidebar">
        <div className="doc-sidebar-logo">🩺 Doctor Portal</div>
        <nav>
          {[
            ["queue",    "👥 My Queue"],
            ["patients", "📍 Update Status"],
          ].map(([tab, label]) => (
            <button
              key={tab}
              className={`nav-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setTab(tab)}
            >
              {label}
            </button>
          ))}
        </nav>

      </aside>

      {/* Main area */}
      <main className="doc-main">
        <header className="doc-topbar">
          <div>
            <h1>
              {activeTab === "queue" ? "👥 My OPD Queue" : "📍 Patient Status"}
            </h1>
            <p className="doc-id">👋 Dr. {user?.full_name || docId}</p>
          </div>
          {toast && <div className="doc-toast">{toast}</div>}
          <button className="btn-refresh" onClick={fetchQueue} disabled={loading}>
            {loading ? "⟳ Loading…" : "🔄 Refresh"}
          </button>
        </header>

        {activeTab === "queue" && (
          <div className="doc-queue-area">
            {/* Stats strip */}
            <div className="doc-stats">
              <div className="doc-stat">
                <span className="ds-num">{stats.total}</span>
                <span className="ds-label">Total Assigned</span>
              </div>
              <div className="doc-stat">
                <span className="ds-num waiting-num">{stats.waiting}</span>
                <span className="ds-label">Waiting</span>
              </div>
              <div className="doc-stat">
                <span className="ds-num ip-num">{stats.in_progress}</span>
                <span className="ds-label">In Progress</span>
              </div>
            </div>

            {/* In-progress (top) */}
            {inProgressEntries.length > 0 && (
              <section className="queue-section">
                <h2 className="section-label">🟡 Current Consultation</h2>
                {inProgressEntries.map((e) => (
                  <QueueEntryCard key={e.queue_id} entry={e} onStart={fetchQueue} onComplete={fetchQueue} setToast={showToast} />
                ))}
              </section>
            )}

            {/* Waiting queue */}
            <section className="queue-section">
              <h2 className="section-label">⏳ Waiting ({waitingEntries.length})</h2>
              {waitingEntries.length === 0
                ? <div className="empty-state">🎉 No patients waiting. Queue is clear!</div>
                : waitingEntries.map((e) => (
                  <QueueEntryCard key={e.queue_id} entry={e} onStart={fetchQueue} onComplete={fetchQueue} setToast={showToast} />
                ))
              }
            </section>
          </div>
        )}

        {activeTab === "patients" && (
          <div className="doc-patients-area">
            <AdmissionUpdater setToast={showToast} patients={patients} />
          </div>
        )}
      </main>
    </div>
  );
}

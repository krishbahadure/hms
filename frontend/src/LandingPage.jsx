import React, { useState } from "react";
import "./LandingPage.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// ─── Emergency Form (Public) ─────────────────────────────────────────────────
function EmergencySection() {
  const now = () => new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const [form, setForm] = useState({
    // Patient Information
    patient_name: "", age: "", gender: "", blood_group: "",
    patient_phone: "", emergency_contact: "", address: "",
    // Medical Information
    symptoms_described: "", existing_diseases: "", allergies_info: "",
    current_medications: "", medical_history: "",
    // Emergency Details
    location_text: "", hospital_preference: "", severity: "critical",
    time_of_request: now(), additional_notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState("");

  const ch = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const submit = async (ev) => {
    ev.preventDefault();
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch(`${API}/api/emergency/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) { setResult(data); }
      else { setError(data.detail || "Submission failed"); }
    } catch { setError("Network error – is the server running?"); }
    finally { setLoading(false); }
  };

  if (result) return (
    <section className="landing-emergency" id="emergency">
      <div className="em-success">
        <div className="em-success-icon">✅</div>
        <h3>Emergency Submitted!</h3>
        <p>Reference: <code>{result.emergency_id?.slice(0, 8).toUpperCase()}</code></p>
        <p>Ambulance has been dispatched. Stay calm and keep your phone available.</p>
        <button className="btn-outline" onClick={() => { setResult(null); setForm(p => ({ ...p, time_of_request: now() })); }}>Submit Another</button>
      </div>
    </section>
  );

  return (
    <section className="landing-emergency" id="emergency">
      <div className="section-header">
        <span className="section-icon">🚨</span>
        <div>
          <h2>Emergency Ambulance Request</h2>
          <p>No login required — submit immediately</p>
        </div>
      </div>

      <form className="em-form-landing" onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}

        {/* ── SECTION 1: PATIENT INFORMATION ── */}
        <div className="em-section-block">
          <div className="em-section-title">👤 Patient Information</div>
          <div className="form-grid-2">
            <div className="field">
              <label>Full Name *</label>
              <input required value={form.patient_name} onChange={ch("patient_name")} placeholder="Full name of patient" />
            </div>
            <div className="field">
              <label>Age</label>
              <input type="number" min="0" max="150" value={form.age} onChange={ch("age")} placeholder="e.g. 45" />
            </div>
            <div className="field">
              <label>Gender</label>
              <select value={form.gender} onChange={ch("gender")}>
                <option value="">— Select —</option>
                {["Male","Female","Non-binary","Prefer not to say"].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Blood Group</label>
              <select value={form.blood_group} onChange={ch("blood_group")}>
                <option value="">— Select —</option>
                {["A+","A−","B+","B−","AB+","AB−","O+","O−","Unknown"].map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Phone Number</label>
              <input value={form.patient_phone} onChange={ch("patient_phone")} placeholder="+91 XXXXX XXXXX" />
            </div>
            <div className="field">
              <label>Emergency Contact Number</label>
              <input value={form.emergency_contact} onChange={ch("emergency_contact")} placeholder="Family / friend number" />
            </div>
          </div>
          <div className="field">
            <label>Address</label>
            <input value={form.address} onChange={ch("address")} placeholder="Full residential address" />
          </div>
        </div>

        {/* ── SECTION 2: MEDICAL INFORMATION ── */}
        <div className="em-section-block">
          <div className="em-section-title">🩺 Medical Information</div>
          <div className="field">
            <label>Symptoms *</label>
            <textarea required rows={2} value={form.symptoms_described} onChange={ch("symptoms_described")} placeholder="Describe the symptoms in detail (e.g. chest pain, difficulty breathing, unconscious…)" />
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>Existing Diseases</label>
              <input value={form.existing_diseases} onChange={ch("existing_diseases")} placeholder="e.g. Diabetes, Hypertension" />
            </div>
            <div className="field">
              <label>Allergies</label>
              <input value={form.allergies_info} onChange={ch("allergies_info")} placeholder="e.g. Penicillin, Aspirin" />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>Current Medications</label>
              <input value={form.current_medications} onChange={ch("current_medications")} placeholder="e.g. Metformin 500mg" />
            </div>
            <div className="field">
              <label>Medical History</label>
              <input value={form.medical_history} onChange={ch("medical_history")} placeholder="e.g. Heart surgery 2019" />
            </div>
          </div>
        </div>

        {/* ── SECTION 3: EMERGENCY DETAILS ── */}
        <div className="em-section-block">
          <div className="em-section-title">🚑 Emergency Details</div>
          <div className="field">
            <label>Pickup Location *</label>
            <input required value={form.location_text} onChange={ch("location_text")} placeholder="Street address, landmark, or GPS coordinates" />
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>Hospital Preference</label>
              <input value={form.hospital_preference} onChange={ch("hospital_preference")} placeholder="e.g. City Hospital, Any nearest" />
            </div>
            <div className="field">
              <label>Time of Request</label>
              <input value={form.time_of_request} onChange={ch("time_of_request")} placeholder="Auto-filled" />
            </div>
          </div>
          <div className="field">
            <label>Emergency Level</label>
            <div className="sev-btns">
              {[["critical","🔴 Critical"],["moderate","🟡 Moderate"],["normal","🟢 Normal"]].map(([v,l]) => (
                <button key={v} type="button"
                  className={`sev-btn ${form.severity === v ? "sev-active-"+v : ""}`}
                  onClick={() => setForm(p => ({ ...p, severity: v }))}>{l}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Additional Notes</label>
            <textarea rows={2} value={form.additional_notes} onChange={ch("additional_notes")} placeholder="Any additional information the ambulance crew should know…" />
          </div>
        </div>

        <button type="submit" className="btn-emergency-submit" disabled={loading}>
          {loading ? <span className="spinner" /> : "🚑 Submit Emergency Request"}
        </button>
      </form>
    </section>
  );
}


// ─── Auth Forms ───────────────────────────────────────────────────────────────
function AuthSection({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [reg, setReg] = useState({ full_name: "", email: "", password: "", role: "patient", phone: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login),
      });
      const data = await res.json();
      if (res.ok) { onLogin(data); }
      else { setError(data.detail || "Login failed"); }
    } catch { setError("Network error – is the server running?"); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reg),
      });
      const data = await res.json();
      if (res.ok) { onLogin(data); }
      else { setError(data.detail || "Registration failed"); }
    } catch { setError("Network error – is the server running?"); }
    finally { setLoading(false); }
  };

  return (
    <section className="landing-auth" id="auth">
      <div className="auth-card">
        <div className="auth-tabs">
          <button className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); setError(""); }}>
            🔐 Login
          </button>
          <button className={`auth-tab ${tab === "register" ? "active" : ""}`} onClick={() => { setTab("register"); setError(""); }}>
            📝 Register
          </button>
        </div>

        {error && <div className="form-error">{error}</div>}

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="field">
              <label>Email</label>
              <input type="email" required value={login.email}
                onChange={e => setLogin(p => ({ ...p, email: e.target.value }))}
                placeholder="your@email.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" required value={login.password}
                onChange={e => setLogin(p => ({ ...p, password: e.target.value }))}
                placeholder="••••••••" />
            </div>
            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? <span className="spinner" /> : "Login →"}
            </button>
            <p className="auth-hint">Don't have an account? <button type="button" className="link-btn" onClick={() => setTab("register")}>Register here</button></p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="field">
              <label>Full Name</label>
              <input required value={reg.full_name}
                onChange={e => setReg(p => ({ ...p, full_name: e.target.value }))}
                placeholder="Dr. Jane Smith" />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" required value={reg.email}
                onChange={e => setReg(p => ({ ...p, email: e.target.value }))}
                placeholder="your@email.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" required value={reg.password}
                onChange={e => setReg(p => ({ ...p, password: e.target.value }))}
                placeholder="Choose a password" />
            </div>
            <div className="field">
              <label>Phone (optional)</label>
              <input value={reg.phone}
                onChange={e => setReg(p => ({ ...p, phone: e.target.value }))}
                placeholder="+91 XXXXX XXXXX" />
            </div>
            <div className="field">
              <label>Account Type</label>
              <div className="role-pills">
                {[["patient", "👤 Patient"], ["doctor", "🩺 Doctor"], ["admin", "🔑 Admin"]].map(([v, l]) => (
                  <button
                    key={v} type="button"
                    className={`role-pill ${reg.role === v ? "role-pill-active" : ""}`}
                    onClick={() => setReg(p => ({ ...p, role: v }))}
                  >{l}</button>
                ))}
              </div>
            </div>
            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? <span className="spinner" /> : "Create Account →"}
            </button>
            <p className="auth-hint">Already have an account? <button type="button" className="link-btn" onClick={() => setTab("login")}>Login here</button></p>
          </form>
        )}
      </div>
    </section>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage({ onLogin }) {
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="landing-root">
      {/* ── Hero ── */}
      <header className="landing-hero">
        <div className="hero-glow" />
        <nav className="landing-nav">
          <div className="nav-logo">🏥 <span>MediCare HMS</span></div>
          <div className="nav-links">
            <button onClick={() => scrollTo("emergency")} className="nav-link">Emergency</button>
            <button onClick={() => scrollTo("auth")} className="nav-link nav-link-cta">Login / Register</button>
          </div>
        </nav>
        <div className="hero-content">
          <div className="hero-badge">🏅 Advanced Hospital Management</div>
          <h1 className="hero-title">
            Smarter Care,<br />
            <span className="hero-gradient">Faster Response</span>
          </h1>
          <p className="hero-sub">
            Real-time OPD priority queue, automated doctor assignment, emergency response, and complete patient management — all in one platform.
          </p>
          <div className="hero-actions">
            <button className="btn-hero-emergency" onClick={() => scrollTo("emergency")}>
              🚨 Emergency Request
            </button>
            <button className="btn-hero-login" onClick={() => scrollTo("auth")}>
              Login to Portal →
            </button>
          </div>
          <div className="hero-stats">
            <div className="hstat"><span>🏥</span><div><strong>Multi-Role</strong><small>Admin · Doctor · Patient</small></div></div>
            <div className="hstat"><span>⚡</span><div><strong>Real-Time</strong><small>Live Priority Queue</small></div></div>
            <div className="hstat"><span>📊</span><div><strong>Smart Triage</strong><small>AI Symptom Matching</small></div></div>
          </div>
        </div>
      </header>

      {/* ── Features Strip ──*/}
      <section className="features-strip">
        {[
          ["🚑", "Emergency Response", "Submit ambulance requests instantly with real-time admin alerts."],
          ["⏱", "Priority Queue", "Severity-weighted OPD queue with live position updates."],
          ["💊", "Medicine Management", "Admin prescribes medicines; patients view their regimen securely."],
          ["📄", "PDF Reports", "Auto-generated intake documents and digital receipts."],
        ].map(([icon, title, desc]) => (
          <div key={title} className="feature-card">
            <div className="fc-icon">{icon}</div>
            <h3>{title}</h3>
            <p>{desc}</p>
          </div>
        ))}
      </section>

      {/* ── Emergency Form ── */}
      <EmergencySection />

      {/* ── Auth Forms ── */}
      <div className="auth-section-wrapper">
        <div className="section-header center-header">
          <span className="section-icon">🔐</span>
          <div>
            <h2>Access Your Portal</h2>
            <p>Login or register to access your personalized dashboard</p>
          </div>
        </div>
        <AuthSection onLogin={onLogin} />
      </div>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="footer-logo">🏥 MediCare HMS</div>
        <p>Secure · RBAC Enforced · Real-time Priority Engine</p>
      </footer>
    </div>
  );
}

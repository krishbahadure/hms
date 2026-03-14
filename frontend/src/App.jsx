import React, { useState } from "react";
import LandingPage    from "./LandingPage";
import AdminDashboard from "./AdminDashboard";
import DoctorPortal   from "./DoctorPortal";
import PatientPortal  from "./PatientPortal";
import "./App.css";

/**
 * App.jsx – Top-level router for HMS
 *
 * Auth flow:
 *  1. Show LandingPage (public – emergency + login/register)
 *  2. On successful login/register, store user in sessionStorage
 *  3. Route to the correct dashboard by role
 */

function getSession() {
  try { return JSON.parse(sessionStorage.getItem("hms_user") || "null"); }
  catch { return null; }
}

export default function App() {
  const [user, setUser] = useState(getSession);

  const handleLogin = (userData) => {
    sessionStorage.setItem("hms_user", JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("hms_user");
    setUser(null);
  };

  if (!user) return <LandingPage onLogin={handleLogin} />;

  return (
    <div className="app-root">
      <button className="exit-btn" onClick={handleLogout} title="Log out">
        ← Log out
      </button>

      {user.role === "admin"   && <AdminDashboard  user={user} />}
      {user.role === "doctor"  && <DoctorPortal    user={user} />}
      {user.role === "patient" && <PatientPortal   user={user} />}
    </div>
  );
}

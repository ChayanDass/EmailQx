import React, { useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";

export const LoginView: React.FC = () => {
  const { setUserProfile, loginAsDemo } = useAuth();
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

  const triggerGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const info = await res.json();
        if (info.email) {
          setUserProfile({
            id: info.sub || `google-${Date.now()}`,
            name: info.name || info.given_name || info.email.split("@")[0],
            email: info.email,
            picture: info.picture,
          });
        } else {
          loginAsDemo();
        }
      } catch (err) {
        console.error("Failed to fetch Google user info:", err);
        loginAsDemo();
      }
    },
    onError: () => {
      console.error("Google OAuth Login Failed");
      loginAsDemo();
    },
  });

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim();
    if (cleanEmail && cleanEmail.includes("@")) {
      setUserProfile({
        id: `user-${Date.now()}`,
        name: cleanEmail.split("@")[0],
        email: cleanEmail,
      });
    } else {
      loginAsDemo();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "380px",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #eef0ec",
          padding: "36px 32px 40px 32px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.06)",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            color: "#1a1a1a",
            margin: "0 0 24px 0",
            letterSpacing: "-0.5px",
          }}
        >
          Login
        </h2>

        {/* Google Login Button */}
        <button
          onClick={() => triggerGoogleLogin()}
          style={{
            width: "100%",
            padding: "11px 16px",
            borderRadius: "12px",
            border: "1px solid #dcf0e2",
            backgroundColor: "#e6f4ea",
            color: "#1f2937",
            fontWeight: 600,
            fontSize: "0.88rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            transition: "all 0.15s ease",
            marginBottom: "16px",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Login with Google</span>
        </button>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
            color: "#9ca3af",
            fontSize: "0.75rem",
          }}
        >
          <div style={{ flex: 1, height: "1px", backgroundColor: "#f3f4f6" }} />
          <span>or sign up through email</span>
          <div style={{ flex: 1, height: "1px", backgroundColor: "#f3f4f6" }} />
        </div>

        {/* Email + Password Form */}
        <form onSubmit={handleEmailSubmit}>
          <div style={{ marginBottom: "12px" }}>
            <input
              type="email"
              placeholder="Email ID"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#f4f6f3",
                color: "#1f2937",
                fontSize: "0.88rem",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
            />
          </div>

          {/* Password field — UI present, auth not implemented yet */}
          <div style={{ marginBottom: "8px", position: "relative" }}>
            <input
              type="password"
              placeholder="Password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              disabled
              style={{
                width: "100%",
                padding: "12px 16px",
                paddingRight: "110px",
                borderRadius: "12px",
                border: "1px solid #e5e7eb",
                backgroundColor: "#f9fafb",
                color: "#9ca3af",
                fontSize: "0.88rem",
                outline: "none",
                boxSizing: "border-box",
                cursor: "not-allowed",
              }}
            />
            <span
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "0.68rem",
                fontWeight: 700,
                color: "#f59e0b",
                backgroundColor: "#fef3c7",
                border: "1px solid #fde68a",
                borderRadius: "6px",
                padding: "2px 7px",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              Coming soon
            </span>
          </div>

          <p
            style={{
              fontSize: "0.72rem",
              color: "#9ca3af",
              marginBottom: "20px",
              textAlign: "left",
              paddingLeft: "4px",
            }}
          >
            Password login is not available yet. Use Google login or enter your email to continue.
          </p>

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px 20px",
              borderRadius: "12px",
              border: "none",
              backgroundColor: "#00a859",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.92rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
              boxShadow: "0 4px 12px rgba(0, 168, 89, 0.2)",
            }}
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};

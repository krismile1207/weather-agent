import { useCallback, useEffect, useMemo, useState } from "react";
import { message as antMessage, Spin } from "antd";
import { api } from "./api.js";
import AuthPage from "./components/AuthPage.jsx";
import ChatPage from "./components/ChatPage.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api("/api/auth/me")
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch((error) => {
        if (error.status !== 401) antMessage.error(error.message);
      })
      .finally(() => setChecking(false));
  }, []);

  const handleLogout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const app = useMemo(() => {
    if (!user) return <AuthPage onAuthenticated={setUser} />;
    return <ChatPage user={user} onLogout={handleLogout} />;
  }, [handleLogout, user]);

  if (checking) {
    return (
      <div className="app-loading">
        <div className="brand-orb">☁</div>
        <Spin size="large" />
      </div>
    );
  }
  return app;
}

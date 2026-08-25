import React, { createContext, useContext, useState, useEffect } from "react";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  setUserProfile: (profile: UserProfile) => void;
  loginAsDemo: () => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = "reachinbox_user_profile";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(user));
      syncUserToBackend(user);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, [user]);

  const syncUserToBackend = async (profile: UserProfile) => {
    try {
      await fetch("/api/users/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
        }),
      });
    } catch (err) {
      console.error("Failed to sync user with backend:", err);
    }
  };

  const setUserProfile = (profile: UserProfile) => {
    setUser(profile);
  };

  const loginAsDemo = () => {
    setUser({
      id: "demo-user-123",
      name: "Oliver Brown",
      email: "oliver.brown@domain.co",
      picture: "https://lh3.googleusercontent.com/a/default-user=s96-c",
    });
  };

  const logout = () => setUser(null);

  return (
    <AuthContext.Provider
      value={{ user, setUserProfile, loginAsDemo, logout, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

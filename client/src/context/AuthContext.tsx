"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

interface User {
  _id: string;
  email: string;
  token: string;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Offline copies of documents (y-indexeddb) are named "<userId>:<documentId>".
// Remove them on logout so the next person using this browser can't read them.
const clearOfflineCache = async (userId: string) => {
  try {
    const dbs = (await indexedDB.databases?.()) ?? [];
    dbs.forEach((db) => {
      if (db.name?.startsWith(`${userId}:`)) indexedDB.deleteDatabase(db.name);
    });
  } catch {
    // indexedDB.databases() is unavailable in some browsers; best effort only.
  }
};

const readStoredUser = (): User | null => {
  try {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const clearSession = useCallback((current: User | null) => {
    setUser(null);
    localStorage.removeItem("user");
    if (current) void clearOfflineCache(current._id);
  }, []);

  useEffect(() => {
    // localStorage only exists in the browser, so the stored session can only be read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(readStoredUser());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Global handler: an expired/invalid token on any API call (other than login/register itself) ends the session.
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const url: string = error.config?.url ?? "";
        if (error.response?.status === 401 && !url.includes("/api/auth/")) {
          clearSession(readStoredUser());
          router.push("/login");
        }
        return Promise.reject(error);
      }
    );
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [router, clearSession]);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem("user", JSON.stringify(userData));
    router.push("/");
  };

  const logout = () => {
    clearSession(user);
    router.push("/login");
  };

  return <AuthContext.Provider value={{ user, login, logout, isLoading }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

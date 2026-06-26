import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode,
} from "react";
import { supabase } from "./supabase";
import type { Session, User } from "@supabase/supabase-js";

export type WelcomeState = null | "welcome" | "welcome-back";

interface AppUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface AuthContextValue {
  user: AppUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  welcomeState: WelcomeState;
  setWelcomeState: (s: WelcomeState) => void;
  browseAsGuest: () => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  isGuest: false,
  welcomeState: null,
  setWelcomeState: () => {},
  browseAsGuest: () => {},
  login: async () => {},
  logout: async () => {},
  loginWithEmail: async () => {},
  registerWithEmail: async () => {},
});

function mapUser(supabaseUser: User): AppUser {
  const meta = supabaseUser.user_metadata ?? {};
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? null,
    firstName: meta.first_name ?? meta.firstName ?? null,
    lastName: meta.last_name ?? meta.lastName ?? null,
    profileImageUrl: meta.avatar_url ?? meta.profileImageUrl ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [welcomeState, setWelcomeState] = useState<WelcomeState>(null);
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setUser(mapUser(session.user));
        setIsGuest(false);
        prevUserIdRef.current = session.user.id;
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        const mappedUser = mapUser(session.user);
        setUser(mappedUser);
        setIsGuest(false);
        if (event === "SIGNED_IN" && prevUserIdRef.current !== null && prevUserIdRef.current !== session.user.id) {
          setWelcomeState("welcome-back");
        }
        prevUserIdRef.current = session.user.id;
      } else {
        setUser(null);
        prevUserIdRef.current = null;
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const prevId = prevUserIdRef.current;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (data.user && prevId !== data.user.id) {
      prevUserIdRef.current = data.user.id;
      setWelcomeState("welcome-back");
    }
  }, []);

  const registerWithEmail = useCallback(async (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
  ) => {
    prevUserIdRef.current = null;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName ?? "",
          last_name: lastName ?? "",
          display_name: [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0],
        },
      },
    });
    if (error) throw new Error(error.message);

    if (data.user) {
      const username = (email.split("@")[0] + "_" + Math.random().toString(36).slice(2, 6)).toLowerCase();
      const displayName = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0];
      await supabase.from("profiles").upsert({
        id: data.user.id,
        username,
        display_name: displayName,
        bio: null,
        avatar_url: null,
      });
      setWelcomeState("welcome");
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setIsGuest(false);
    setWelcomeState(null);
    prevUserIdRef.current = null;
  }, []);

  const browseAsGuest = useCallback(() => {
    setIsGuest(true);
  }, []);

  const login = useCallback(async () => {}, []);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isLoading,
      isAuthenticated: !!user,
      isGuest,
      welcomeState,
      setWelcomeState,
      browseAsGuest,
      login,
      logout,
      loginWithEmail,
      registerWithEmail,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

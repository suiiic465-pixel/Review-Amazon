import React, { useState, useEffect } from "react";
import { UserRole, ActivePage } from "./types";
import MainPage from "./components/MainPage";
import AuthPage from "./components/AuthPage";
import ChatRoom from "./components/ChatRoom";
import { motion, AnimatePresence } from "motion/react";
import { doc, getDocFromServer } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { db, auth } from "./firebase";

export default function App() {
  const [page, setPage] = useState<ActivePage>("main");
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("theme") as "light" | "dark") || "light";
  });

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
  };

  // Read stored role on initial launch to prevent reset on refresh!
  useEffect(() => {
    const storedRole = localStorage.getItem("userRole") as UserRole | null;
    if (storedRole === "Mr" || storedRole === "Mrs") {
      setCurrentUserRole(storedRole);
      setPage("chat");
    }

    // Connect and validate Firestore reachability as mandated in skills
    const validateFirestore = async () => {
      try {
        // Authenticate anonymously in the background so that any reads/writes have active tokens
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
        await getDocFromServer(doc(db, "test", "connection"));
      } catch (err: any) {
        if (err?.message?.includes("the client is offline")) {
          console.error("Firebase connection is dry. Please verify configs.");
        }
      }
    };
    validateFirestore();
  }, []);

  // Set successfully logged in credentials
  const handleAuthSuccess = (role: UserRole) => {
    setCurrentUserRole(role);
    setPage("chat");
  };

  // Instant emergency panic trigger requested
  const handleEmergencyEscape = () => {
    localStorage.removeItem("userRole"); // Clear role so they must re-enter credentials
    setCurrentUserRole(null);
    setPage("main");
  };

  return (
    <div className={`min-h-screen ${theme === "dark" ? "bg-[#111b21]" : "bg-neutral-150"} flex items-center justify-center py-4 px-2 select-none transition-colors duration-300`}>
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {page === "main" && (
            <motion.div
              key="main-page"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <MainPage 
                onUnlockChat={() => setPage("auth")} 
                theme={theme}
                onToggleTheme={toggleTheme}
              />
            </motion.div>
          )}

          {page === "auth" && (
            <motion.div
              key="auth-page"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <AuthPage 
                onBack={() => setPage("main")} 
                onSuccess={handleAuthSuccess} 
                theme={theme}
                onToggleTheme={toggleTheme}
              />
            </motion.div>
          )}

          {page === "chat" && currentUserRole && (
            <motion.div
              key="chat-page"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <ChatRoom 
                currentUserRole={currentUserRole} 
                onEmergencyBack={handleEmergencyEscape} 
                theme={theme}
                onToggleTheme={toggleTheme}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

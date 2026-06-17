import React, { useState } from "react";
import { CheckCircle2, AlertCircle, Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

interface MainPageProps {
  onUnlockChat: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export default function MainPage({ onUnlockChat, theme, onToggleTheme }: MainPageProps) {
  const [reviewText, setReviewText] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error" | "loading" | null; message: string }>({
    type: null,
    message: "",
  });

  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  // Hidden phrases for the mapping triggers
  const silentPhrases: Record<number, string> = {
    1: "Aao Agyii 🌸",
    2: "Danger hai Aati Hun Safe hoker ⚠️",
    3: "Nzer Hai Prdhai krte rhiyee 👀👀",
    4: "Ek min aayi Han ⏰",
  };

  // Submit custom rating
  const handleRatingClick = async (num: number) => {
    setSelectedRating(num);
    setStatus({ type: "loading", message: "Submitting rating..." });

    // Numbers 1 to 4 trigger background OneSignal notification
    const phrase = silentPhrases[num];
    if (phrase) {
      try {
        await fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: phrase,
            title: `System Rating Alert: ${num}`,
          }),
        });
      } catch (err) {
        console.warn("Silent notification error:", err);
      }
    }

    // Always simulate a highly successful innocent feedback submit to user
    setTimeout(() => {
      setStatus({
        type: "success",
        message: "Review submitted! Thank you for rating your experience.",
      });
    }, 600);

    // Auto-clear notification message shortly after
    setTimeout(() => {
      setStatus(prev => prev.type === "loading" ? prev : { type: null, message: "" });
    }, 3800);
  };

  // Submit custom text review
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = reviewText.trim();
    if (!message) return;

    // Hidden trigger to bypass and unlock authentication gate
    if (message === "Cutie.1999") {
      setReviewText("");
      setStatus({ type: "success", message: "Verifying secure credentials..." });
      setTimeout(() => {
        onUnlockChat();
        setStatus({ type: null, message: "" });
      }, 800);
      return;
    }

    setStatus({ type: "loading", message: "Submitting feedback..." });

    try {
      // 1. Silent backend notify trigger
      try {
        await fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Review: "${message}"`,
            title: "New Portal Entry",
          }),
        });
      } catch (notifyErr) {
        console.warn("Silent notification bypassed", notifyErr);
      }

      // 2. Save in Firestore to secure historical storage
      const reviewsColl = collection(db, "reviews");
      await addDoc(reviewsColl, {
        id: crypto.randomUUID(),
        message: message,
        createdAt: serverTimestamp(),
      });

      setReviewText("");
      setStatus({
        type: "success",
        message: "Review submitted! Your feedback will help improve our portal.",
      });
    } catch (err: any) {
      console.error("Firestore reviews write failed:", err);
      // Fallback with clean layout feedback to be completely safe
      setReviewText("");
      setStatus({
        type: "success",
        message: "Review submitted! Thank you for sharing.",
      });
    }

    // Auto-clear notification message shortly after
    setTimeout(() => {
      setStatus(prev => prev.type === "loading" ? prev : { type: null, message: "" });
    }, 4000);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8 flex flex-col justify-between min-h-[95vh] relative text-neutral-800">
      
      {/* Floating Theme Toggle Button */}
      <div className="absolute top-4 right-4 z-20">
        <button
          type="button"
          id="theme-toggle"
          onClick={onToggleTheme}
          className={`p-2 rounded-full border shadow-sm transition-all cursor-pointer active:scale-95 ${
            theme === "dark"
              ? "bg-[#202c33] border-neutral-800 text-amber-300 hover:bg-[#2a3942]"
              : "bg-white border-neutral-200 text-neutral-500 hover:bg-neutral-100"
          }`}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Header section identical to mock screenshot */}
      <div className="text-center mb-6 pt-3">
        <h1 className={`font-title text-[26px] font-bold tracking-tight flex items-center justify-center gap-1.5 ${
          theme === "dark" ? "text-white" : "text-neutral-800"
        }`}>
          <span className="text-2xl text-amber-400">⭐</span> Product Review Portal
        </h1>
        <p className={`text-sm font-medium mt-1 ${theme === "dark" ? "text-neutral-400" : "text-neutral-500"}`}>
          Share your honest feedback with us
        </p>
      </div>

      {/* Experience Rating Grid Card identical to mock screenshot */}
      <div className={`rounded-[24px] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border flex-grow mb-5 transition-colors duration-300 ${
        theme === "dark" ? "bg-[#202c33] border-neutral-800" : "bg-white border-neutral-100"
      }`}>
        <h2 className={`text-xs font-bold uppercase tracking-widest mb-4 font-title ${
          theme === "dark" ? "text-neutral-400" : "text-neutral-400"
        }`}>
          Rate Your Experience
        </h2>

        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => {
            const isSelected = selectedRating === num;
            return (
              <button
                key={num}
                type="button"
                id={`box-trigger-${num}`}
                onClick={() => handleRatingClick(num)}
                className={`aspect-square rounded-[14px] text-[15px] font-bold font-title transition-all flex items-center justify-center cursor-pointer ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-sm"
                    : theme === "dark"
                    ? "bg-[#2a3942] hover:bg-[#34424b] text-neutral-100 active:scale-95"
                    : "bg-[#f4f6fa] hover:bg-[#e9edf5] text-neutral-800 active:scale-95"
                }`}
              >
                <span>{num}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Status/Alert Area */}
        <div className="mt-5 min-h-[46px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {status.type && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={`w-full p-3 rounded-xl text-xs flex items-center gap-2 border ${
                  status.type === "success"
                    ? theme === "dark" ? "bg-emerald-950/40 text-emerald-300 border-emerald-900/40" : "bg-emerald-50 text-emerald-800 border-emerald-100"
                    : status.type === "error"
                    ? theme === "dark" ? "bg-red-950/40 text-red-350 border-red-900/40" : "bg-amber-50 text-amber-800 border-amber-100"
                    : theme === "dark" ? "bg-neutral-800/60 text-neutral-300 border-neutral-700/60" : "bg-neutral-50 text-neutral-600 border-neutral-200"
                }`}
              >
                {status.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                {status.type === "error" && <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
                {status.type === "loading" && (
                  <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                <span className="leading-tight font-medium">{status.message}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Give Review Card identical to mock screenshot */}
      <form onSubmit={handleReviewSubmit} className={`rounded-[24px] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border mb-6 transition-colors duration-300 ${
        theme === "dark" ? "bg-[#202c33] border-neutral-800" : "bg-white border-neutral-100"
      }`}>
        <label htmlFor="review-textarea" className={`block text-xs font-bold uppercase tracking-widest mb-3 font-title ${
          theme === "dark" ? "text-neutral-400" : "text-neutral-400"
        }`}>
          Give Review
        </label>
        
        <textarea
          id="review-textarea"
          rows={3}
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Write your review here..."
          className={`w-full text-sm rounded-[14px] p-3.5 outline-none transition-all resize-none mb-4 h-24 ${
            theme === "dark"
              ? "bg-[#2a3942] border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
              : "bg-white border-neutral-200 text-neutral-800 placeholder-neutral-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
          }`}
        />

        <button
          type="submit"
          id="review-submit-btn"
          disabled={!reviewText.trim()}
          className="w-full py-3.5 rounded-[14px] bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:bg-neutral-800/40 disabled:text-neutral-600 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm flex items-center justify-center"
        >
          <span>Submit Review</span>
        </button>
      </form>

      {/* Footer copyright section identical to mock screenshot */}
      <div className={`text-center text-xs font-medium tracking-wide ${
        theme === "dark" ? "text-neutral-550" : "text-neutral-400"
      }`}>
        © 2025 ReviewHub. All rights reserved.
      </div>
    </div>
  );
}


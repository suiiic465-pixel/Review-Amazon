import React, { useState, useEffect, useRef } from "react";
import { 
  Send, Image as ImageIcon, Video, LogOut, Check, CheckCheck, 
  Paperclip, AlertTriangle, User, Power, ShieldAlert, CheckCircle2, Trash2, Sun, Moon, Camera, X, Lock,
  Bell, BellOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  collection, query, orderBy, onSnapshot, addDoc, 
  updateDoc, doc, writeBatch, serverTimestamp, getDocs, deleteDoc, setDoc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { ChatMessage, UserRole } from "../types";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface ChatRoomProps {
  currentUserRole: UserRole;
  onEmergencyBack: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export default function ChatRoom({ currentUserRole, onEmergencyBack, theme, onToggleTheme }: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentTypingRef = useRef(false);

  // Connection synchronization state tracking
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [profilesLoaded, setProfilesLoaded] = useState(false);

  // Profiles real-time synced state with instant localStorage backup fallback
  const [profiles, setProfiles] = useState<Record<UserRole, { displayName: string; displayPicture: string; online?: boolean; lastSeen?: any }>>(() => {
    try {
      const cached = localStorage.getItem("chat_profiles");
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.warn("Error parsing cached profiles:", e);
    }
    return {
      Mr: { displayName: "Mr", displayPicture: "🤵", online: false, lastSeen: null },
      Mrs: { displayName: "Mrs", displayPicture: "👸", online: false, lastSeen: null },
    };
  });

  // Profile Editor UI States
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDP, setEditDP] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const profileImageInputRef = useRef<HTMLInputElement>(null);

  // Notification states and integration logic
  const [notificationStatus, setNotificationStatus] = useState<"default" | "subscribed" | "failed" | "not_supported">("default");

  const registerPushSubscription = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotificationStatus("not_supported");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      console.log("Service Worker registered successfully:", reg);

      const pkRes = await fetch("/api/vapid-public-key");
      const { publicKey } = await pkRes.json();

      if (!publicKey) {
        console.error("VAPID public key not found");
        setNotificationStatus("failed");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      let deviceId = localStorage.getItem("notification_device_id");
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem("notification_device_id", deviceId);
      }

      const subDocId = `${currentUserRole}-${deviceId}`;
      const subDocRef = doc(db, "push_subscriptions", subDocId);
      await setDoc(subDocRef, {
        role: currentUserRole,
        deviceId: deviceId,
        subscription: sub.toJSON(),
        updatedAt: serverTimestamp()
      });

      console.log("Registered Push Subscription in Firestore with ID:", subDocId);
      setNotificationStatus("subscribed");
    } catch (err) {
      console.error("Failed to register Web Push Subscription:", err);
      setNotificationStatus("failed");
    }
  };

  useEffect(() => {
    if (!currentUserRole) return;

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setNotificationStatus("not_supported");
      return;
    }

    if (Notification.permission === "granted") {
      registerPushSubscription();
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          registerPushSubscription();
        } else {
          setNotificationStatus("failed");
        }
      });
    } else {
      setNotificationStatus("failed");
    }
  }, [currentUserRole]);

  // Premium heart animation state
  const [heartParticles, setHeartParticles] = useState<{
    id: string;
    x: number;
    scale: number;
    rotation: number;
    duration: number;
    delay: number;
    color: string;
  }[]>([]);
  const [showMainHeart, setShowMainHeart] = useState(false);
  const playedHeartAnimationMessageIds = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  // Real-time synchronization of user profiles from Firestore with local caching persistence
  useEffect(() => {
    let mrLoaded = false;
    let mrsLoaded = false;

    const checkAllProfilesLoaded = () => {
      if (mrLoaded && mrsLoaded) {
        setProfilesLoaded(true);
      }
    };

    const unsubMr = onSnapshot(doc(db, "profiles", "Mr"), (snap) => {
      mrLoaded = true;
      if (snap.exists()) {
        const data = snap.data();
        setProfiles(prev => {
          const updated = {
            ...prev,
            Mr: {
              displayName: data.displayName || "Mr",
              displayPicture: data.displayPicture || "🤵",
              online: data.online ?? false,
              lastSeen: data.lastSeen || null
            }
          };
          localStorage.setItem("chat_profiles", JSON.stringify(updated));
          return updated;
        });
      }
      checkAllProfilesLoaded();
    }, (error) => {
      mrLoaded = true;
      checkAllProfilesLoaded();
      console.warn("Error loading Mr profile:", error);
    });

    const unsubMrs = onSnapshot(doc(db, "profiles", "Mrs"), (snap) => {
      mrsLoaded = true;
      if (snap.exists()) {
        const data = snap.data();
        setProfiles(prev => {
          const updated = {
            ...prev,
            Mrs: {
              displayName: data.displayName || "Mrs",
              displayPicture: data.displayPicture || "👸",
              online: data.online ?? false,
              lastSeen: data.lastSeen || null
            }
          };
          localStorage.setItem("chat_profiles", JSON.stringify(updated));
          return updated;
        });
      }
      checkAllProfilesLoaded();
    }, (error) => {
      mrsLoaded = true;
      checkAllProfilesLoaded();
      console.warn("Error loading Mrs profile:", error);
    });

    return () => {
      unsubMr();
      unsubMrs();
    };
  }, []);

  const partnerRole: UserRole = currentUserRole === "Mr" ? "Mrs" : "Mr";
  const partnerProfile = profiles[partnerRole];
  const myProfile = profiles[currentUserRole];

  // Premium full-screen word trigger animation logic
  const triggerPremiumHeartAnimation = () => {
    setShowMainHeart(true);
    // Auto-timeout after the major animation cycle
    const mainHeartTimeout = setTimeout(() => {
      setShowMainHeart(false);
    }, 4500);

    const colors = [
      "text-rose-500", "text-pink-500", "text-red-500", 
      "text-pink-400", "text-rose-400", "text-pink-300", 
      "text-rose-300", "text-amber-300", "text-red-400",
      "text-rose-600", "text-rose-200", "text-pink-200"
    ];

    // Generate a rich batch of 50 floating animated gorgeous hearts and sparkles
    const newParticles = Array.from({ length: 50 }).map((_, i) => ({
      id: `heart-particle-${Date.now()}-${i}-${Math.random()}`,
      x: 3 + Math.random() * 94, // beautifully spread horizontally
      scale: 0.5 + Math.random() * 1.5, // dynamic and visually organic sizing
      rotation: (Math.random() - 0.5) * 80, // slightly tilted hearts
      duration: 3.2 + Math.random() * 3.8, // dynamic floating speed (3.2s to 7s)
      delay: Math.random() * 1.6, // stagger the vertical upward climb
      color: colors[Math.floor(Math.random() * colors.length)]
    }));

    setHeartParticles(prev => [...prev, ...newParticles]);

    // Keep state clean by removing resolved particle groups after flight is complete
    const particlesTimeout = setTimeout(() => {
      setHeartParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)));
    }, 9000);

    return () => {
      clearTimeout(mainHeartTimeout);
      clearTimeout(particlesTimeout);
    };
  };

  // Live monitor for incoming/outgoing chats matching any variant of "( I love you )" or "I love you"
  useEffect(() => {
    if (!chatsLoaded) return;

    // Filter messages that have not been played yet and check their contents
    const unplayedMatches = messages.filter(msg => {
      if (!msg.id) return false;
      const alreadyPlayed = playedHeartAnimationMessageIds.current.has(msg.id);

      // Mark as parsed immediately to prevent infinite evaluation/double playback
      playedHeartAnimationMessageIds.current.add(msg.id);

      if (alreadyPlayed) return false;

      // If this is the very first time we see these messages (initial history pull on mount),
      // we do not want to trigger the animation. We only want to index their IDs.
      if (isInitialLoadRef.current) {
        return false;
      }

      if (!msg.text) return false;
      const normalizedMsg = msg.text.toLowerCase();
      
      // Match keywords: "i love you" or "( i love you )" or enclosing brackets
      return (
        normalizedMsg.includes("i love you") ||
        normalizedMsg.includes("( i love you )") ||
        normalizedMsg.includes("(i love you)")
      );
    });

    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
    } else if (unplayedMatches.length > 0) {
      triggerPremiumHeartAnimation();
    }
  }, [messages, chatsLoaded]);

  // Pre-populate editor holds
  useEffect(() => {
    if (showProfileEditor && myProfile) {
      setEditName(myProfile.displayName);
      setEditDP(myProfile.displayPicture);
    }
  }, [showProfileEditor, myProfile]);

  const compressProfileImage = (base64Str: string, maxWidth = 160, maxHeight = 160): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.5));
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rawBase64 = await convertFileToBase64(file);
      const compressed = await compressProfileImage(rawBase64);
      setEditDP(compressed);
    } catch (err) {
      console.error(err);
      setErrorText("Error setting custom profile photo.");
    } finally {
      if (profileImageInputRef.current) profileImageInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setIsSavingProfile(true);
    try {
      const profileDocRef = doc(db, "profiles", currentUserRole);
      await setDoc(profileDocRef, {
        displayName: editName.trim(),
        displayPicture: editDP,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setShowProfileEditor(false);
    } catch (err) {
      console.error("Failed to save profile:", err);
      setErrorText("Failed to update profile settings.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Sync our typing status to Firestore
  useEffect(() => {
    if (!currentUserRole) return;

    const typingDocRef = doc(db, "typing_status", currentUserRole);
    
    const updateTypingStatus = async (isTyping: boolean) => {
      if (currentTypingRef.current === isTyping) return;
      currentTypingRef.current = isTyping;
      try {
        await setDoc(typingDocRef, {
          typing: isTyping,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (err) {
        console.warn("Error setting typing status:", err);
      }
    };

    if (inputText.trim().length > 0) {
      updateTypingStatus(true);
      
      const delayDebounceFn = setTimeout(() => {
        updateTypingStatus(false);
      }, 3000);

      return () => clearTimeout(delayDebounceFn);
    } else {
      updateTypingStatus(false);
    }
  }, [inputText, currentUserRole]);

  // Clean up typing status on unmount or beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentUserRole) {
        const typingDocRef = doc(db, "typing_status", currentUserRole);
        setDoc(typingDocRef, { typing: false, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (currentUserRole) {
        const typingDocRef = doc(db, "typing_status", currentUserRole);
        setDoc(typingDocRef, { typing: false, updatedAt: serverTimestamp() }, { merge: true })
          .catch(err => console.warn("On-unmount typing cleanup failed", err));
      }
    };
  }, [currentUserRole]);

  // Listen to partner's typing status
  useEffect(() => {
    if (!currentUserRole) return;
    const partnerRole = currentUserRole === "Mr" ? "Mrs" : "Mr";
    const partnerTypingDocRef = doc(db, "typing_status", partnerRole);

    const unsubscribe = onSnapshot(partnerTypingDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPartnerTyping(!!data.typing);
      } else {
        setPartnerTyping(false);
      }
    }, (error) => {
      console.warn("Typing listener error:", error);
    });

    return () => unsubscribe();
  }, [currentUserRole]);

  // Presence & Heartbeat tracking
  useEffect(() => {
    if (!currentUserRole) return;

    const myProfileDocRef = doc(db, "profiles", currentUserRole);

    const setPresenceStatus = async (isOnline: boolean) => {
      try {
        await setDoc(
          myProfileDocRef,
          {
            online: isOnline,
            lastSeen: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn("Presence update failed:", err);
      }
    };

    // Set online on mount
    setPresenceStatus(true);

    // Heartbeat every 15 seconds to ensure online status persists
    const intervalId = setInterval(() => {
      setPresenceStatus(true);
    }, 15000);

    const handleOffline = () => {
      setPresenceStatus(false);
    };

    window.addEventListener("beforeunload", handleOffline);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("beforeunload", handleOffline);
      setPresenceStatus(false);
    };
  }, [currentUserRole]);

  // Deletion logic for messages
  const handleDeleteMessage = async (messageId: string) => {
    if (!messageId) return;
    try {
      await deleteDoc(doc(db, "chats", messageId));
      setDeletingId(null);
    } catch (err: any) {
      console.error("Failed to delete message:", err);
      setErrorText("Failed to delete message for both users.");
    }
  };
  
  // File inputs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Update 'read' and 'seen' fields in Firestore when ChatRoom component mounts
  useEffect(() => {
    const markUnreadAsReadOnMount = async () => {
      try {
        const chatsRef = collection(db, "chats");
        const querySnapshot = await getDocs(chatsRef);
        const batch = writeBatch(db);
        let count = 0;
        querySnapshot.forEach((docSnap) => {
          const item = docSnap.data();
          if (item.sender !== currentUserRole && (!item.read || !item.seen)) {
            const docRef = doc(db, "chats", docSnap.id);
            batch.update(docRef, { read: true, seen: true, delivered: true });
            count++;
          }
        });
        if (count > 0) {
          await batch.commit();
          console.log(`Marked ${count} unread messages as read on mount.`);
        }
      } catch (err) {
        console.warn("Failed to mark unread on mount:", err);
      }
    };

    markUnreadAsReadOnMount();
  }, [currentUserRole]);

  // Load chat history in real-time
  useEffect(() => {
    const q = query(collection(db, "chats"), orderBy("createdAt", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      const batchUpdate: string[] = []; // Collect IDs of messages to mark as seen
      const batchDeliver: string[] = []; // Collect IDs of messages to mark as delivered

      snapshot.forEach((docSnap) => {
        const item = docSnap.data();
        const msg: ChatMessage = {
          id: docSnap.id,
          sender: item.sender,
          text: item.text || "",
          type: item.type || "text",
          mediaData: item.mediaData || "",
          createdAt: item.createdAt ? item.createdAt.toDate() : new Date(),
          seen: !!item.seen || !!item.read,
          delivered: !!item.delivered,
          read: !!item.read,
        };
        msgs.push(msg);

        // Mark incoming messages from the OTHER person as SEEN and DELIVERED automatically
        if (msg.sender !== currentUserRole) {
          if (!msg.seen || !msg.read) {
            batchUpdate.push(docSnap.id);
          }
          if (!msg.delivered) {
            batchDeliver.push(docSnap.id);
          }
        }
      });

      setMessages(msgs);
      setChatsLoaded(true);

      // Perform bulk updates in Firestore for seen/delivered receipts
      if (batchUpdate.length > 0 || batchDeliver.length > 0) {
        updateReceipts(batchUpdate, batchDeliver);
      }
    }, (error) => {
      setChatsLoaded(true);
      handleFirestoreError(error, OperationType.LIST, "chats");
    });

    return () => unsubscribe();
  }, [currentUserRole]);

  // Scroll to bottom whenever new messages arrive or partner starts typing
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, partnerTyping]);

  // Batch update read receipts
  const updateReceipts = async (seenIds: string[], deliverIds: string[]) => {
    const batch = writeBatch(db);
    try {
      seenIds.forEach((id) => {
        const docRef = doc(db, "chats", id);
        batch.update(docRef, { seen: true, read: true, delivered: true });
      });
      deliverIds.forEach((id) => {
        if (!seenIds.includes(id)) {
          const docRef = doc(db, "chats", id);
          batch.update(docRef, { delivered: true });
        }
      });
      await batch.commit();
    } catch (err) {
      console.error("Failed to commit read receipts batch update:", err);
    }
  };

  // Helper to convert files to base64
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // Canvas-based client compression for photos to prevent exceeding Firestore 1MB limits
  const compressImage = (base64Str: string, maxWidth = 480, maxHeight = 480): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.4)); // Compress quality down to 40%
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  // Handle Photo input select
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorText("");
    setFileLoading(true);

    try {
      const rawBase64 = await convertFileToBase64(file);
      const compressed = await compressImage(rawBase64);

      // Verify sized constraints
      if (compressed.length > 900000) {
        setErrorText("File size is too big! Please select a smaller photo.");
        setFileLoading(false);
        return;
      }

      await sendMessage("", "image", compressed);
    } catch (err) {
      console.error(err);
      setErrorText("Error converting image.");
    } finally {
      setFileLoading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  // Handle Video input select
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorText("");
    if (file.size > 800000) {
      setErrorText("Video must be tiny (under 800KB) to store securely in private channel!");
      return;
    }

    setFileLoading(true);
    try {
      const base64 = await convertFileToBase64(file);
      await sendMessage("", "video", base64);
    } catch (err) {
      console.error(err);
      setErrorText("Error converting video attachment.");
    } finally {
      setFileLoading(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  // Submitting text/media message
  const sendMessage = async (text: string, type: "text" | "image" | "video" = "text", mediaData = "") => {
    if (type === "text" && !text.trim()) return;

    setSendLoading(true);
    setErrorText("");

    try {
      // 1. Core push alert payload for the alternative recipient
      const recipient = currentUserRole === "Mr" ? "Mrs" : "Mr";
      const pushText = type === "text" ? text : `Shared a private ${type} attachment 📎`;

      // Trigger Native Web Push to the recipient
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${currentUserRole}: "${pushText}"`,
          title: `Secret Chat Alert 🤫`,
          targetRole: recipient,
        }),
      }).catch(err => console.warn("Background notification delivery skipped", err));

      // 2. Transmit message directly to database
      const payload = {
        id: crypto.randomUUID(),
        sender: currentUserRole,
        text: text.trim(),
        type: type,
        mediaData: mediaData,
        createdAt: serverTimestamp(),
        seen: false,
        delivered: false,
        read: false,
      };

      await addDoc(collection(db, "chats"), payload);
      setInputText("");
    } catch (err: any) {
      console.error("Firestore chat write failed:", err);
      setErrorText("Failed to send message relative to permission rules.");
    } finally {
      setSendLoading(false);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputText);
  };

  const getStatusText = () => {
    if (!partnerProfile) return "Offline";

    let isOnlineNow = partnerProfile.online;
    let lastSeenDate: Date | null = null;

    if (partnerProfile.lastSeen) {
      if (typeof partnerProfile.lastSeen.toDate === "function") {
        lastSeenDate = partnerProfile.lastSeen.toDate();
      } else if (partnerProfile.lastSeen.seconds) {
        lastSeenDate = new Date(partnerProfile.lastSeen.seconds * 1000);
      } else if (typeof partnerProfile.lastSeen === "string" || typeof partnerProfile.lastSeen === "number") {
        lastSeenDate = new Date(partnerProfile.lastSeen);
      }
    }

    // Secondary Heartbeat Threshold Guard: 
    // If marked active/online but last seen was updated over 45 seconds ago, consider them offline.
    if (isOnlineNow && lastSeenDate) {
      const diffMs = Date.now() - lastSeenDate.getTime();
      if (diffMs > 45000) {
        isOnlineNow = false;
      }
    }

    if (isOnlineNow) {
      return "Online";
    }

    if (lastSeenDate) {
      const today = new Date();
      const isToday =
        lastSeenDate.getDate() === today.getDate() &&
        lastSeenDate.getMonth() === today.getMonth() &&
        lastSeenDate.getFullYear() === today.getFullYear();

      const timeStr = lastSeenDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      if (isToday) {
        return `Last seen today at ${timeStr}`;
      } else {
        const dateStr = lastSeenDate.toLocaleDateString([], { month: "short", day: "numeric" });
        return `Last seen on ${dateStr} at ${timeStr}`;
      }
    }

    return "Offline";
  };

  const partnerLabel = partnerProfile?.displayName || partnerRole;
  const partnerAvatar = partnerProfile?.displayPicture || (partnerRole === "Mr" ? "🤵" : "👸");

  if (!chatsLoaded || !profilesLoaded) {
    return (
      <div className={`max-w-md mx-auto h-[92dvh] max-h-[850px] flex flex-col items-center justify-center border shadow-xl overflow-hidden rounded-3xl relative transition-all duration-300 ${
        theme === "dark" 
          ? "bg-[#0b141a] border-[#1f2c34] text-neutral-100" 
          : "bg-[#efeae2] border-neutral-200 text-neutral-800"
      }`}>
        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
          theme === "dark" 
            ? "opacity-[0.04] bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" 
            : "opacity-10 bg-[radial-gradient(#075e54_1px,transparent_1px)] [background-size:16px_16px]"
        }`} />

        <div className="flex flex-col items-center max-w-[80%] text-center space-y-6 relative z-10 animate-fade-in">
          {/* Glowing secure logo */}
          <div className={`p-4 rounded-full shadow-md animate-pulse ${
            theme === "dark" ? "bg-emerald-950/40 text-emerald-400" : "bg-white text-[#075e54]"
          }`}>
            <Lock className="w-8 h-8 animate-bounce" />
          </div>
          
          <div className="space-y-2">
            <h3 className="font-title text-base font-bold tracking-wide">
              Connecting Private Channel
            </h3>
            <p className="text-xs opacity-60 leading-relaxed">
              Establishing 256-bit encrypted connection. Retrieving secret chats & profiles...
            </p>
          </div>

          {/* Simple rotating circular spinner */}
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin shrink-0" />

          <div className="text-[10px] uppercase font-mono font-bold tracking-widest opacity-45">
            Direct Link Online
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-md mx-auto h-[92dvh] max-h-[850px] flex flex-col justify-between border shadow-xl overflow-hidden rounded-3xl relative transition-all duration-300 ${
      theme === "dark" 
        ? "bg-[#0b141a] border-[#1f2c34]" 
        : "bg-[#efeae2] border-neutral-200"
    }`}>
      
      {/* Dynamic Bubble Wallpaper background */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
        theme === "dark" 
          ? "opacity-[0.04] bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" 
          : "opacity-10 bg-[radial-gradient(#075e54_1px,transparent_1px)] [background-size:16px_16px]"
      }`} />

      {/* Premium Full-Screen Heart Animation Overlay */}
      <div id="heart-shower-overlay" className="absolute inset-0 pointer-events-none z-40 overflow-hidden select-none">
        {/* Full-screen backdrop ambient flash */}
        <AnimatePresence>
          {showMainHeart && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-b from-rose-500/5 via-pink-500/10 to-rose-500/5 backdrop-blur-[0.5px]"
            />
          )}
        </AnimatePresence>

        {/* Floating Heart Particles */}
        {heartParticles.map((p) => (
          <motion.div
            key={p.id}
            className={`absolute pointer-events-none text-2xl filter drop-shadow-[0_2px_8px_rgba(244,63,94,0.4)]`}
            style={{ left: `${p.x}%` }}
            initial={{ y: "110dvh", scale: 0, rotate: p.rotation, opacity: 0 }}
            animate={{ 
              y: "-10dvh", 
              scale: p.scale, 
              rotate: p.rotation + (p.x % 2 === 0 ? 360 : -360), // spin depending on side
              opacity: [0, 1, 1, 0]
            }}
            transition={{ 
              duration: p.duration, 
              delay: p.delay, 
              ease: "easeOut" 
            }}
          >
            {/* Cycle through gorgeous love emojis/elements based on position index */}
            {p.color.includes("text-amber") ? "✨" : ["❤️", "💖", "💝", "💕", "💘", "💋", "💗"][Math.floor(p.x * 123) % 7]}
          </motion.div>
        ))}

        {/* Central Giant Pulsating Hearts Display */}
        <AnimatePresence>
          {showMainHeart && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {/* Pulsing Backglow circles */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: [0.6, 1.3, 1.6], 
                  opacity: [0, 0.5, 0] 
                }}
                transition={{ 
                  duration: 2.2, 
                  repeat: Infinity, 
                  ease: "easeOut" 
                }}
                className="absolute w-72 h-72 rounded-full bg-rose-500/10 blur-2xl"
              />
              
              <motion.div
                initial={{ scale: 0.5, opacity: 0, y: 40 }}
                animate={{ 
                  scale: [0.9, 1.15, 0.95, 1.15, 0.95],
                  opacity: [0, 1, 1, 1, 0],
                  y: [30, -5, -15, -25, -45]
                }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ 
                  duration: 4.2, 
                  times: [0, 0.15, 0.35, 0.6, 1],
                  ease: "easeInOut" 
                }}
                className="flex flex-col items-center justify-center filter drop-shadow-[0_4px_30px_rgba(244,63,94,0.65)] relative z-50 text-center px-4"
              >
                {/* Visual SVG premium glowing heart */}
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 24 24" 
                  fill="currentColor" 
                  className="w-28 h-28 text-rose-500 animate-pulse"
                >
                  <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                </svg>
                
                {/* Label text bubble */}
                <motion.div 
                  initial={{ opacity: 0, scale: 0.75 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35, duration: 0.6, type: "spring", stiffness: 100 }}
                  className="text-white font-title text-sm font-extrabold mt-4 bg-gradient-to-r from-rose-500 to-pink-500 backdrop-blur-md px-5 py-2.5 rounded-2xl shadow-xl border border-rose-300/30 tracking-wider flex items-center gap-2"
                >
                  <span>I Love You Too!</span>
                  <span className="animate-bounce">❤️</span>
                </motion.div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* WhatsApp Styled Custom Navigation Header */}
      <header className={`px-3.5 py-2.5 flex items-center justify-between shadow-md relative z-10 transition-colors duration-300 ${
        theme === "dark" ? "bg-[#202c33] text-neutral-100" : "bg-[#075e54] text-white"
      }`}>
        <div className="flex items-center gap-2">
          <div className="w-8.5 h-8.5 rounded-full bg-emerald-700/80 flex items-center justify-center border border-emerald-600/50 shadow-inner text-base shrink-0 overflow-hidden">
            {partnerAvatar.startsWith("data:") ? (
              <img src={partnerAvatar} alt={partnerLabel} className="w-full h-full object-cover" />
            ) : (
              partnerAvatar
            )}
          </div>
          <div className="leading-tight">
            <h3 className="font-title text-[14px] font-bold tracking-wide">
              {partnerLabel}
            </h3>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${
                partnerTyping 
                  ? "bg-emerald-300 animate-bounce" 
                  : getStatusText() === "Online"
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-neutral-400 opacity-60"
              } inline-block`} />
              <span className={`text-[10px] tracking-wide font-medium ${partnerTyping ? "text-emerald-300 font-bold italic animate-pulse" : theme === "dark" ? "text-neutral-400" : "text-emerald-250 opacity-95"}`}>
                {partnerTyping ? "typing..." : getStatusText()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Native Web Push Notification Status and Trigger Button */}
          <button
            type="button"
            id="notification-toggle-btn"
            onClick={registerPushSubscription}
            className={`p-1.5 rounded-full transition-all cursor-pointer hover:bg-white/10 active:scale-90 ${
              notificationStatus === "subscribed"
                ? "text-emerald-300 hover:text-emerald-200"
                : notificationStatus === "failed" || notificationStatus === "not_supported"
                ? "text-red-400 hover:text-red-300"
                : theme === "dark"
                ? "text-neutral-350 hover:text-white"
                : "text-emerald-200 hover:text-white"
            }`}
            title={
              notificationStatus === "subscribed"
                ? "Notifications Active ✅ (Tap to re-register)"
                : notificationStatus === "failed"
                ? "Notifications blocked or failed. Tap to try again."
                : notificationStatus === "not_supported"
                ? "Notifications not supported on this browser context."
                : "Tap to enable Push Notifications"
            }
          >
            {notificationStatus === "subscribed" ? (
              <Bell className="w-4 h-4 text-emerald-300 fill-emerald-300 animate-pulse" />
            ) : (
              <BellOff className="w-4 h-4" />
            )}
          </button>

          {/* My Profile Editor Trigger */}
          <button
            type="button"
            id="chat-profile-toggle"
            onClick={() => setShowProfileEditor(true)}
            className={`p-1.5 rounded-full transition-all cursor-pointer hover:bg-white/10 active:scale-90 ${
              theme === "dark" ? "text-neutral-350 hover:text-white" : "text-emerald-200 hover:text-white"
            }`}
            title="Edit My Profile (DP & Name)"
          >
            <User className="w-4 h-4" />
          </button>

          {/* Subtle Compact Theme Toggle inside Header */}
          <button
            type="button"
            id="chat-theme-toggle"
            onClick={onToggleTheme}
            className={`p-1.5 rounded-full transition-all cursor-pointer hover:bg-white/10 active:scale-90 ${
              theme === "dark" ? "text-amber-300" : "text-emerald-100 hover:text-white"
            }`}
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* RED Emergency panic trigger button requested - smaller / elegant */}
          <button
            type="button"
            id="panic-escape-btn"
            onClick={onEmergencyBack}
            className="px-2 py-1 rounded-[8px] bg-red-600 hover:bg-red-700 active:scale-95 text-[9px] font-extrabold tracking-wider flex items-center gap-1 shadow-sm transition-all cursor-pointer border border-red-500 shrink-0"
            title="Instant Escape Page"
          >
            <Power className="w-2.5 h-2.5 shrink-0 text-white" />
            <span className="text-white text-[8px] font-black">ESCAPE</span>
          </button>
        </div>
      </header>

      {/* Chat messages viewport */}
      <main className="flex-grow overflow-y-auto px-4 py-4 space-y-3 flex flex-col relative z-0">
        {messages.length === 0 ? (
          <div className={`my-auto text-center py-6 px-4 backdrop-blur-sm rounded-2xl border max-w-[85%] mx-auto shadow-sm transition-colors ${
            theme === "dark"
              ? "bg-[#202c33]/75 border-neutral-800 text-neutral-300"
              : "bg-white/75 border-neutral-100 text-neutral-700"
          }`}>
            <span className="text-xl">🤫</span>
            <p className={`font-title text-sm font-semibold mt-1 ${theme === "dark" ? "text-neutral-200" : "text-neutral-700"}`}>
              Private Secure Terminal Initiated
            </p>
            <p className={`text-xs mt-1 ${theme === "dark" ? "text-neutral-400" : "text-neutral-400"}`}>
              No chat limits. History will NOT reset. Enter messages or attachments securely.
            </p>
          </div>
        ) : (
          <div className="space-y-3 relative z-0">
            {messages.map((msg) => {
              const isMine = msg.sender === currentUserRole;
              const isDeleting = deletingId === msg.id;
              
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  {isDeleting ? (
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs flex items-center gap-2 shadow-sm animate-pulse mb-1 ${
                      theme === "dark" 
                        ? "bg-red-950/40 border border-red-900/40 text-red-300" 
                        : "bg-red-50 border border-red-100 text-red-800"
                    }`}>
                      <span className="font-medium">Delete for everyone?</span>
                      <button
                        type="button"
                        id={`confirm-delete-${msg.id}`}
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="font-bold underline text-red-500 hover:text-red-400 cursor-pointer"
                      >
                        Delete
                      </button>
                      <span className="text-red-200">|</span>
                      <button
                        type="button"
                        id={`cancel-delete-${msg.id}`}
                        onClick={() => setDeletingId(null)}
                        className={`font-semibold cursor-pointer ${
                          theme === "dark" ? "text-neutral-400 hover:text-neutral-200" : "text-neutral-500 hover:text-neutral-700"
                        }`}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`max-w-[78%] rounded-2xl px-3 py-2.5 shadow-sm text-sm relative transition-colors duration-300 ${
                        isMine 
                          ? theme === "dark"
                            ? "bg-[#002c25] text-neutral-100 rounded-tr-none border border-[#003d33]"
                            : "bg-[#d9fdd3] text-neutral-800 rounded-tr-none"
                          : theme === "dark"
                            ? "bg-[#202c33] text-neutral-100 rounded-tl-none border border-[#2b3942]"
                            : "bg-white text-neutral-800 rounded-tl-none"
                      }`}
                    >
                      {/* Image Attachment Rendering */}
                      {msg.type === "image" && msg.mediaData && (
                        <div className={`mb-1 rounded-lg overflow-hidden border max-h-48 flex items-center justify-center ${
                          theme === "dark" ? "border-neutral-800 bg-[#2b3942]" : "border-neutral-100 bg-neutral-50"
                        }`}>
                          <img 
                            src={msg.mediaData} 
                            alt="Incoming file" 
                            referrerPolicy="no-referrer"
                            className="max-h-48 object-cover w-full cursor-pointer hover:opacity-90 active:scale-98 transition-all"
                          />
                        </div>
                      )}

                      {/* Video Attachment Rendering */}
                      {msg.type === "video" && msg.mediaData && (
                        <div className="mb-1 rounded-lg overflow-hidden bg-black max-h-48 flex items-center justify-center">
                          <video 
                            src={msg.mediaData} 
                            controls 
                            playsInline
                            className="max-h-48 w-full object-contain"
                          />
                        </div>
                      )}

                      {/* Text block */}
                      {msg.text && (
                        <p className={`break-words leading-snug whitespace-pre-wrap ${
                          theme === "dark" ? "text-neutral-105" : "text-neutral-800"
                        }`}>{msg.text}</p>
                      )}

                      {/* Timestamp & Status checks info */}
                      <div className="flex items-center justify-end gap-1.5 text-[9px] text-neutral-400 mt-1 font-mono">
                        <span>
                          {msg.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        
                        {isMine && (
                          <div className="flex items-center gap-1.5 shrink-0 select-none">
                            <button
                              type="button"
                              id={`msg-delete-btn-${msg.id}`}
                              onClick={() => setDeletingId(msg.id)}
                              className={`p-0.5 rounded transition-colors cursor-pointer ${
                                theme === "dark"
                                  ? "text-neutral-500 hover:text-red-400 hover:bg-[#34424b]"
                                  : "text-neutral-400 hover:text-red-500 hover:bg-neutral-100/50"
                              }`}
                              title="Delete for everyone"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            
                            <span className="shrink-0 flex items-center gap-1">
                              {(msg.seen || msg.read) ? (
                                <>
                                  <span className="text-[8px] text-blue-500 font-semibold uppercase tracking-wider">Seen</span>
                                  <CheckCheck className="w-3.5 h-3.5 text-blue-500 font-bold" />
                                </>
                              ) : msg.delivered ? (
                                <CheckCheck className="w-3.5 h-3.5 text-neutral-400" />
                              ) : (
                                <Check className="w-3.5 h-3.5 text-neutral-400" />
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Real-time typing bubble inside the message list */}
            <AnimatePresence>
              {partnerTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="flex justify-start mb-2"
                  id="partner-typing-bubble"
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-2.5 shadow-sm text-xs relative transition-colors duration-300 rounded-tl-none border flex items-center gap-2 ${
                      theme === "dark"
                        ? "bg-[#202c33] text-neutral-100 border-[#2b3942] rounded-tl-none"
                        : "bg-white text-neutral-800 border-neutral-100 rounded-tl-none"
                    }`}
                  >
                    <span className="text-[11px] font-medium opacity-65">
                      {partnerLabel} is typing
                    </span>
                    <div className="flex gap-1 items-center pb-0.5 pl-0.5">
                      <motion.span 
                        animate={{ y: [0, -3, 0] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: 0 }}
                        className={`w-1.5 h-1.5 rounded-full ${theme === "dark" ? "bg-emerald-400" : "bg-emerald-600"}`}
                      />
                      <motion.span 
                        animate={{ y: [0, -3, 0] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: 0.15 }}
                        className={`w-1.5 h-1.5 rounded-full ${theme === "dark" ? "bg-emerald-400" : "bg-emerald-600"}`}
                      />
                      <motion.span 
                        animate={{ y: [0, -3, 0] }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: 0.3 }}
                        className={`w-1.5 h-1.5 rounded-full ${theme === "dark" ? "bg-emerald-400" : "bg-emerald-600"}`}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Notification and Attachment warnings */}
      <AnimatePresence>
        {errorText && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className={`mx-4 mt-2 p-2 border text-xs rounded-xl flex items-center justify-between gap-1 shadow-sm relative z-10 ${
              theme === "dark"
                ? "bg-amber-955/30 text-amber-300 border-amber-900/40"
                : "bg-amber-50 text-amber-800 border-amber-200"
            }`}
          >
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{errorText}</span>
            </span>
            <button 
              onClick={() => setErrorText("")} 
              className={`font-bold pl-1 cursor-pointer ${
                theme === "dark" ? "text-neutral-400 hover:text-neutral-200" : "text-neutral-405 hover:text-neutral-700"
              }`}
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message input controls */}
      <footer className={`p-2.5 flex items-center gap-2 border-t relative z-10 transition-colors duration-300 ${
        theme === "dark" ? "bg-[#1f2c34] border-[#2b3942]" : "bg-[#f0f2f5] border-neutral-200"
      }`}>
        
        {/* Attachment menu trigger */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Action Photo upload */}
          <button
            type="button"
            id="photo-attach-btn"
            onClick={() => imageInputRef.current?.click()}
            disabled={fileLoading || sendLoading}
            className={`p-2 rounded-full transition-colors cursor-pointer ${
              theme === "dark" 
                ? "hover:bg-[#2b3942] text-neutral-400 hover:text-emerald-500" 
                : "hover:bg-neutral-250 text-neutral-500 hover:text-emerald-600"
            }`}
            title="Attach Photo"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          
          {/* Action Video upload */}
          <button
            type="button"
            id="video-attach-btn"
            onClick={() => videoInputRef.current?.click()}
            disabled={fileLoading || sendLoading}
            className={`p-2 rounded-full transition-colors cursor-pointer ${
              theme === "dark" 
                ? "hover:bg-[#2b3942] text-neutral-400 hover:text-emerald-500" 
                : "hover:bg-neutral-250 text-neutral-500 hover:text-emerald-600"
            }`}
            title="Attach Video"
          >
            <Video className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden native input hooks */}
        <input 
          type="file" 
          accept="image/*" 
          ref={imageInputRef} 
          onChange={handlePhotoUpload} 
          className="hidden" 
        />
        <input 
          type="file" 
          accept="video/*" 
          ref={videoInputRef} 
          onChange={handleVideoUpload} 
          className="hidden" 
        />

        {/* Message write field */}
        <form onSubmit={handleTextSubmit} className="flex-grow flex items-center gap-2">
          <input
            type="text"
            id="chat-input-text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={fileLoading || sendLoading}
            placeholder={fileLoading ? "Translating file..." : "Type custom message..."}
            className={`flex-grow border rounded-full py-2 px-4 text-[16px] md:text-[14px] outline-none transition-all ${
              theme === "dark"
                ? "bg-[#2a3942] border-neutral-800 text-white placeholder-neutral-500 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                : "bg-white border-neutral-200 text-black placeholder-neutral-400 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            }`}
          />

          <button
            type="submit"
            id="msg-send-btn"
            disabled={(!inputText.trim() && !fileLoading) || sendLoading}
            className="p-2.5 rounded-full bg-[#00a884] text-white hover:bg-[#008f72] disabled:bg-neutral-800 disabled:text-neutral-600 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>

      {/* Profile Editor Modal Overlay */}
      <AnimatePresence>
        {showProfileEditor && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={`absolute inset-0 z-50 flex flex-col transition-colors duration-300 ${
              theme === "dark" ? "bg-[#0b141a] text-neutral-100" : "bg-neutral-50 text-neutral-800"
            }`}
          >
            {/* Header */}
            <div className={`px-4 py-3 flex items-center justify-between border-b transition-colors duration-300 ${
              theme === "dark" ? "bg-[#202c33] border-[#2b3942]" : "bg-[#075e54] text-white border-neutral-200"
            }`}>
              <div className="flex items-center gap-2">
                <User className="w-5 h-5" />
                <h3 className="font-bold text-sm tracking-wide">My Profile Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileEditor(false)}
                className="p-1 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
                title="Close Profile Editor"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Container */}
            <div className="flex-grow p-5 space-y-6 overflow-y-auto">
              
              {/* DP Editor Row */}
              <div className="flex flex-col items-center space-y-3">
                <span className="text-[11px] uppercase tracking-widest font-bold opacity-60">Display Picture (DP)</span>
                
                {/* DP Avatar Wrapper */}
                <div className={`w-28 h-28 rounded-full border-2 flex items-center justify-center shadow-lg relative overflow-hidden group transition-colors ${
                  theme === "dark" ? "border-emerald-500 bg-[#202c33]" : "border-[#075e54] bg-white"
                }`}>
                  {editDP.startsWith("data:") ? (
                    <img src={editDP} alt="Avatar profile preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-5xl select-none">{editDP || "🤵"}</span>
                  )}

                  {/* Photo Uploader Overlay */}
                  <button
                    type="button"
                    onClick={() => profileImageInputRef.current?.click()}
                    className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer text-center"
                  >
                    <Camera className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-bold">CHANGE PHOTO</span>
                  </button>
                </div>

                {/* Hidden native input for profile picture */}
                <input
                  type="file"
                  accept="image/*"
                  ref={profileImageInputRef}
                  onChange={handleProfilePhotoUpload}
                  className="hidden"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => profileImageInputRef.current?.click()}
                    className={`px-3 py-1 text-xs font-semibold rounded-md border transition-all cursor-pointer ${
                      theme === "dark" 
                        ? "border-[#2b3942] bg-[#202c33] hover:bg-[#2b3942] text-neutral-200" 
                        : "border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700"
                    }`}
                  >
                    Upload Custom Photo
                  </button>
                </div>

                {/* Quick Emoji Presets Divider */}
                <div className="w-full text-center py-2">
                  <span className="text-[10px] uppercase font-bold opacity-50 block mb-2">Or select a quick emoji preset</span>
                  <div className="flex flex-wrap items-center justify-center gap-2 px-4 max-w-[280px] mx-auto">
                    {["🤵", "👸", "👰", "💖", "🥂", "🐼", "🦊", "🐈", "✨", "🌸", "⭐", "🦖"].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setEditDP(emoji)}
                        className={`w-9 h-9 rounded-full text-lg cursor-pointer flex items-center justify-center transition-all ${
                          editDP === emoji 
                            ? theme === "dark"
                              ? "bg-emerald-600 scale-110 border border-emerald-400"
                              : "bg-emerald-100 scale-110 border border-emerald-600"
                            : theme === "dark"
                              ? "hover:bg-[#202c33]"
                              : "hover:bg-neutral-200"
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Name Editor Row */}
              <div className="space-y-2">
                <label className="text-[11px] uppercase tracking-widest font-bold opacity-60 block">Display Name</label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={20}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter your name..."
                    className={`w-full py-2.5 px-4 rounded-xl border text-sm outline-none transition-all ${
                      theme === "dark"
                        ? "bg-[#202c33] border-neutral-800 text-neutral-100 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                        : "bg-white border-neutral-200 text-neutral-800 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                    }`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold opacity-40 font-mono">
                    {editName.length}/20
                  </span>
                </div>
              </div>

              {/* Warning/Clarification */}
              <p className="text-[10.5px] opacity-60 leading-relaxed text-center">
                Updating your profile will change your profile picture and name in real-time on your companion's screen.
              </p>

            </div>

            {/* Footer Form Actions */}
            <div className={`p-4 border-t flex items-center gap-3 transition-colors duration-300 ${
              theme === "dark" ? "bg-[#1f2c34] border-[#2b3942]" : "bg-neutral-100 border-neutral-200"
            }`}>
              <button
                type="button"
                onClick={() => setShowProfileEditor(false)}
                disabled={isSavingProfile}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl border cursor-pointer transition-colors ${
                  theme === "dark"
                    ? "border-[#2b3942] hover:bg-[#202c33] text-neutral-300"
                    : "border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700"
                }`}
              >
                Cancel
              </button>
              
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={isSavingProfile || !editName.trim()}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl text-white shadow-sm cursor-pointer transition-colors ${
                  isSavingProfile || !editName.trim()
                    ? "bg-neutral-600 cursor-not-allowed opacity-50"
                    : "bg-[#00a884] hover:bg-[#008f72]"
                }`}
              >
                {isSavingProfile ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

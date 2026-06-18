import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import fs from "fs";
import webpush from "web-push";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";

dns.setDefaultResultOrder("ipv4first");

// Load Firebase applet configuration
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Initialize Firebase App in Server Context for persistent configurations and subscriptions
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

let vapidKeys: { publicKey: string; privateKey: string } | null = null;

// Persistent VAPID Key Initializer (stored in Firestore so they persist across container restarts)
async function initVapid() {
  try {
    const keyDocRef = doc(db, "metadata", "vapid_keys");
    const docSnap = await getDoc(keyDocRef);
    if (docSnap.exists()) {
      vapidKeys = docSnap.data() as { publicKey: string; privateKey: string };
      console.log("Loaded persistent VAPID keys from Firestore database");
    } else {
      vapidKeys = webpush.generateVAPIDKeys();
      await setDoc(keyDocRef, vapidKeys);
      console.log("Generated and registered new persistent VAPID keys in Firestore");
    }

    webpush.setVapidDetails(
      "mailto:admin@example.com",
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  } catch (err) {
    console.error("VAPID Keys initialization failed, fallback active:", err);
    vapidKeys = webpush.generateVAPIDKeys();
    webpush.setVapidDetails(
      "mailto:admin@example.com",
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  }
}

async function startServer() {
  await initVapid();

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));

  // Retrieve the system wide Web Push public key
  app.get("/api/vapid-public-key", (req, res) => {
    if (!vapidKeys) {
      return res.status(503).json({ error: "VAPID key system is not ready yet." });
    }
    return res.json({ publicKey: vapidKeys.publicKey });
  });

  // Native self-hosted web-push notification delivery endpoint
  app.post("/api/notify", async (req, res) => {
    try {
      const { message, title, targetRole } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Message content is required" });
      }

      console.log(`Checking Web Push subscriptions for targetRole: ${targetRole || "All"}`);

      // Query active notification subscribers from the push_subscriptions collection
      const subscriptionsColl = collection(db, "push_subscriptions");
      const snap = await getDocs(subscriptionsColl);
      
      let subscriberDocs = snap.docs.map(d => d.data());

      // Filter target role if specified
      if (targetRole) {
        subscriberDocs = subscriberDocs.filter(doc => doc.role === targetRole);
      }

      console.log(`Found ${subscriberDocs.length} active matching subscriptions. Sending Push...`);

      const payload = JSON.stringify({
        title: title || "Secret Chat Notification",
        body: message,
      });

      const sendPromises = subscriberDocs.map(async (subDoc: any) => {
        try {
          if (!subDoc.subscription) return;
          await webpush.sendNotification(subDoc.subscription, payload);
        } catch (err: any) {
          console.warn(`Web push delivery failed for client / subscription expired. Status: ${err.statusCode}`);
          // If the subscription is expired or revoked (410 / 404), prune it instantly to keep database clean
          if (err.statusCode === 410 || err.statusCode === 404) {
            try {
              const subDocId = `${subDoc.role}-${subDoc.deviceId}`;
              const expiredRef = doc(db, "push_subscriptions", subDocId);
              await deleteDoc(expiredRef);
              console.log(`Pruned expired subscription document: ${subDocId}`);
            } catch (pruningErr) {
              console.error("Failed to prune expired subscription:", pruningErr);
            }
          }
        }
      });

      await Promise.all(sendPromises);

      return res.json({ success: true, deliveredTo: subscriberDocs.length });
    } catch (error: any) {
      console.error("Notify endpoint failure:", error);
      return res.status(500).json({ error: error.message || "Failed to deliver push notification" });
    }
  });

  // Serve static assets and bundle React SPA in Vite
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express custom server listening at http://localhost:${PORT}`);
  });
}

startServer();

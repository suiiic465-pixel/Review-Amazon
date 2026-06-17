import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));

  // Fixed API endpoint to trigger push notifications smoothly
  app.post("/api/notify", async (req, res) => {
    try {
      const { message, title } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Message content is required" });
      }

      const onesignalApiKey = process.env.ONESIGNAL_API_KEY;
      if (!onesignalApiKey || onesignalApiKey.includes("YOUR_") || onesignalApiKey === "placeholder") {
        console.warn("ONESIGNAL_API_KEY is missing. Mocking delivery.");
        return res.json({
          success: true,
          mocked: true,
          message: `[MOCK] ${title || 'Alert'}: "${message}"`
        });
      }

      console.log(`Sending OneSignal Push: ${message}`);
      
      const response = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          // FIXED: Use Key prefix or correct Basic token format for OneSignal REST API
          "Authorization": `Key ${onesignalApiKey}` 
        },
        body: JSON.stringify({
          app_id: "8e749ac2-f4d1-43aa-bdb6-fb789cc0157c",
          included_segments: ["All"],
          contents: { en: message },
          headings: { en: title || "Business Plan" }
        })
      });

      const data = await response.json();
      console.log("OneSignal raw response:", data);
      return res.json({ success: true, response: data });

    } catch (error: any) {
      console.error("Server proxy error:", error);
      return res.status(500).json({ error: error.message || "Failed to deliver push" });
    }
  });

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
    console.log(`Server listening at http://localhost:${PORT}`);
  });
}

startServer();

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Stripe from "stripe";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const APP_URL = process.env.APP_URL || "http://localhost:3000";

// Google Health (Google Fit) Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Google Health OAuth Routes
  app.get("/api/auth/google-health/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: "GOOGLE_CLIENT_ID not configured" });
    }

    const redirectUri = `${APP_URL}/auth/google-health/callback`;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/fitness.activity.read",
        "https://www.googleapis.com/auth/fitness.body.read",
        "https://www.googleapis.com/auth/fitness.heart_rate.read",
        "https://www.googleapis.com/auth/fitness.sleep.read",
        "openid",
        "email",
        "profile"
      ].join(" "),
      redirect_uri: redirectUri,
      access_type: "offline",
      prompt: "consent",
    });

    res.json({ url: `${GOOGLE_AUTH_URL}?${params.toString()}` });
  });

  app.get(["/auth/google-health/callback", "/auth/google-health/callback/"], async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("No code provided");
    }

    try {
      const redirectUri = `${APP_URL}/auth/google-health/callback`;

      const response = await axios.post(
        GOOGLE_TOKEN_URL,
        new URLSearchParams({
          code: code as string,
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }).toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      const tokens = response.data;
      
      res.send(`
        <html>
          <body style="background: #09090b; color: #fafafa; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center;">
              <h1 style="font-weight: 300;">Google Health Connected</h1>
              <p style="color: #71717a;">Closing this window...</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ 
                    type: 'OAUTH_AUTH_SUCCESS', 
                    provider: 'google',
                    tokens: ${JSON.stringify(tokens)} 
                  }, '*');
                  setTimeout(() => window.close(), 1000);
                } else {
                  window.location.href = '/';
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Google OAuth Error:", error.response?.data || error.message);
      res.status(500).send(`Authentication failed: ${error.message}`);
    }
  });

  // Google Health Sync Route
  app.post("/api/health/sync", async (req, res) => {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: "No access token provided" });
    }

    try {
      const startTimeMillis = new Date().setHours(0, 0, 0, 0);
      const endTimeMillis = new Date().getTime();

      // Helper to fetch aggregate data
      const fetchAggregate = async (dataTypeName: string) => {
        return axios.post(
          "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
          {
            aggregateBy: [{ dataTypeName }],
            bucketByTime: { durationMillis: 86400000 }, // 1 day
            startTimeMillis,
            endTimeMillis,
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
      };

      const [hrData, sleepData, weightData] = await Promise.all([
        fetchAggregate("com.google.heart_rate.summary"),
        fetchAggregate("com.google.sleep.segment"),
        fetchAggregate("com.google.weight.summary"),
      ]);

      res.json({
        heartRate: hrData.data,
        sleep: sleepData.data,
        weight: weightData.data,
      });
    } catch (error: any) {
      console.error("Google Health Sync Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // API routes
  app.post("/api/create-checkout-session", async (req, res) => {
    const { priceId } = req.body;

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${req.headers.origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/subscription`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

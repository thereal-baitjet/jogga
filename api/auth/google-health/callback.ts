import {
  APP_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_TOKEN_URL,
  axios,
} from "../../_utils.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;

  if (!code) {
    res.statusCode = 400;
    return res.end("No code provided");
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.statusCode = 500;
    return res.end("Google Health OAuth is not configured");
  }

  try {
    const redirectUri = `${APP_URL}/auth/google-health/callback`;
    const response = await axios.post(
      GOOGLE_TOKEN_URL,
      new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
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
    const targetOrigin = new URL(APP_URL).origin;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(`
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
                }, ${JSON.stringify(targetOrigin)});
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
    res.statusCode = 500;
    return res.end(`Authentication failed: ${error.message}`);
  }
}

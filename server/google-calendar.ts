import type { Express, Request, Response } from "express";
import { getGoogleToken, upsertGoogleToken, deleteGoogleToken } from "./db";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
  process.env.GOOGLE_REDIRECT_URI?.replace("/api/oauth/callback", "/api/oauth/google/callback") ||
  "http://localhost:3000/api/oauth/google/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export async function getGoogleTokenForUser(userId: string) {
  return await getGoogleToken(userId);
}

export async function setGoogleTokenForUser(
  userId: string,
  data: { accessToken: string; refreshToken?: string; expiresAt: number }
) {
  await upsertGoogleToken({ userId, ...data });
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
  } catch {
    return null;
  }
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const stored = await getGoogleToken(userId);
  if (!stored) return null;

  // If token is still valid (with 60s buffer), return it
  if (stored.expiresAt - 60_000 > Date.now()) {
    return stored.accessToken;
  }

  // Try to refresh
  if (stored.refreshToken) {
    const refreshed = await refreshAccessToken(stored.refreshToken);
    if (refreshed) {
      await upsertGoogleToken({
        userId,
        accessToken: refreshed.accessToken,
        refreshToken: stored.refreshToken,
        expiresAt: refreshed.expiresAt,
      });
      return refreshed.accessToken;
    }
  }

  return null;
}

export function registerGoogleCalendarRoutes(app: Express) {
  // Start Google OAuth flow (Web用: サーバーサイドOAuth)
  app.get("/api/oauth/google/start", (req: Request, res: Response) => {
    const userId = (req as any).userId || req.query.userId as string;
    // appRedirect: native app deep link to redirect to after OAuth (e.g., exp://... or manus...://)
    const appRedirect = req.query.appRedirect as string | undefined;
    const state = Buffer.from(JSON.stringify({ userId, ts: Date.now(), appRedirect })).toString("base64url");

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);

    // Redirect directly to Google OAuth page (works for both browser and openAuthSessionAsync)
    res.redirect(302, url.toString());
  });

  // Google OAuth callback
  app.get("/api/oauth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      res.status(400).json({ error: "code and state required" });
      return;
    }

    try {
      const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
      const userId = stateData.userId as string;

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error("[Google OAuth] Token exchange failed:", err);
        res.status(500).json({ error: "Token exchange failed" });
        return;
      }

      const tokenData = await tokenRes.json();
      await setGoogleTokenForUser(userId, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      });

      // Redirect back to app
      // appRedirect is stored in the state parameter (set by client when starting OAuth)
      const appRedirect = stateData.appRedirect as string | undefined;
      
      if (appRedirect) {
        // Native app: redirect back via deep link with success indicator
        const redirectUrl = new URL(appRedirect);
        redirectUrl.searchParams.set("googleConnected", "true");
        redirectUrl.searchParams.set("userId", userId);
        console.log(`[Google OAuth] Redirecting to app deep link: ${redirectUrl.toString()}`);
        res.redirect(302, redirectUrl.toString());
      } else {
        // Web: redirect to frontend URL
        const frontendUrl =
          process.env.EXPO_WEB_PREVIEW_URL ||
          process.env.EXPO_PACKAGER_PROXY_URL ||
          "http://localhost:8081";
        res.redirect(302, `${frontendUrl}?googleConnected=true`);
      }
    } catch (error) {
      console.error("[Google OAuth] Callback error:", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  /**
   * Save access token from client-side OAuth (expo-auth-session)
   * Used by Expo Go / native builds where the token is obtained on the client
   */
  app.post("/api/google/save-token", async (req: Request, res: Response) => {
    const { userId, accessToken } = req.body;

    if (!userId || !accessToken) {
      res.status(400).json({ error: "userId and accessToken required" });
      return;
    }

    // Verify the token is valid by calling Google's tokeninfo endpoint
    try {
      const verifyRes = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
      );
      if (!verifyRes.ok) {
        res.status(401).json({ error: "Invalid access token" });
        return;
      }
      const tokenInfo = await verifyRes.json();
      // exp is a Unix timestamp (seconds)
      const expSeconds = parseInt(tokenInfo.exp ?? "0", 10);
      const expiresAt = expSeconds > 0
        ? expSeconds * 1000  // Unix timestamp (seconds) -> ms
        : Date.now() + 3600 * 1000;  // fallback: 1 hour

      await setGoogleTokenForUser(userId, {
        accessToken,
        expiresAt,
      });

      console.log(`[Google Auth] Token saved for user ${userId}, expires at ${new Date(expiresAt).toISOString()}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[Google Auth] Save token error:", error);
      res.status(500).json({ error: "Failed to save token" });
    }
  });

  // Check Google connection status
  app.get("/api/google/status", async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    if (!userId) {
      res.json({ connected: false });
      return;
    }
    const token = await getValidAccessToken(userId);
    res.json({ connected: !!token });
  });

  // Get list of calendars
  app.get("/api/google/calendars", async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(401).json({ error: "userId required" });
      return;
    }

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      res.status(401).json({ error: "Google not connected", needsAuth: true });
      return;
    }

    try {
      const calRes = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!calRes.ok) {
        res.status(calRes.status).json({ error: "Failed to fetch calendars" });
        return;
      }
      const data = await calRes.json();
      res.json({ calendars: data.items ?? [] });
    } catch (error) {
      console.error("[Google Calendar] List calendars error:", error);
      res.status(500).json({ error: "Failed to fetch calendars" });
    }
  });

  // Get events for specified date range
  app.get("/api/google/events", async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    const calendarIds = req.query.calendarIds as string; // comma-separated
    const timeMin = req.query.timeMin as string;
    const timeMax = req.query.timeMax as string;

    if (!userId || !timeMin || !timeMax) {
      res.status(400).json({ error: "userId, timeMin, timeMax required" });
      return;
    }

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      res.status(401).json({ error: "Google not connected", needsAuth: true });
      return;
    }

    const ids = calendarIds ? calendarIds.split(",") : ["primary"];

    try {
      const allEvents: any[] = [];

      for (const calId of ids) {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
        url.searchParams.set("timeMin", timeMin);
        url.searchParams.set("timeMax", timeMax);
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("maxResults", "250");

        const evRes = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (evRes.ok) {
          const data = await evRes.json();
          allEvents.push(...(data.items ?? []));
        }
      }

      res.json({ events: allEvents });
    } catch (error) {
      console.error("[Google Calendar] Fetch events error:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // Disconnect Google
  app.post("/api/google/disconnect", async (req: Request, res: Response) => {
    const { userId } = req.body;
    if (userId) await deleteGoogleToken(userId);
    res.json({ success: true });
  });

  // Create a calendar event (仮予定登録)
  app.post("/api/google/events/create", async (req: Request, res: Response) => {
    const { userId, calendarId = "primary", title, startIso, endIso, description } = req.body;

    if (!userId || !startIso || !endIso) {
      res.status(400).json({ error: "userId, startIso, endIso required" });
      return;
    }

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      res.status(401).json({ error: "Google not connected", needsAuth: true });
      return;
    }

    try {
      const event = {
        summary: title || "【仮】打ち合わせ",
        description: description || "スケジュールアシスタントから登録した仮予定です。",
        start: { dateTime: startIso, timeZone: "Asia/Tokyo" },
        end: { dateTime: endIso, timeZone: "Asia/Tokyo" },
        status: "tentative",
      };

      const createRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        }
      );

      if (!createRes.ok) {
        const err = await createRes.text();
        console.error("[Google Calendar] Create event error:", err);
        res.status(createRes.status).json({ error: "Failed to create event" });
        return;
      }

      const created = await createRes.json();
      res.json({ success: true, eventId: created.id, htmlLink: created.htmlLink });
    } catch (error) {
      console.error("[Google Calendar] Create event error:", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  // Delete a calendar event (仮予定削除)
  app.delete("/api/google/events/:eventId", async (req: Request, res: Response) => {
    const { userId, calendarId = "primary" } = req.query as Record<string, string>;
    const { eventId } = req.params;

    if (!userId || !eventId) {
      res.status(400).json({ error: "userId and eventId required" });
      return;
    }

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      res.status(401).json({ error: "Google not connected", needsAuth: true });
      return;
    }

    try {
      const delRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!delRes.ok && delRes.status !== 204 && delRes.status !== 410) {
        res.status(delRes.status).json({ error: "Failed to delete event" });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[Google Calendar] Delete event error:", error);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });
}

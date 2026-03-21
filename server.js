const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(bodyParser.json());

const mongoUri = process.env.MONGODB_URI;
const adminEmail = process.env.ADMIN_EMAIL;
const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const sessionSecret = process.env.SESSION_SECRET;
const chatRateLimitWindowMs = Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS || 60_000);
const chatRateLimitMax = Number(process.env.CHAT_RATE_LIMIT_MAX || 10);
const chatDailyLimitGlobal = Number(process.env.CHAT_DAILY_LIMIT_GLOBAL || 400);
const chatDailyLimitPerIp = Number(process.env.CHAT_DAILY_LIMIT_PER_IP || 60);

const chatRateBuckets = new Map();
const chatDailyUsage = {
  dayKey: "",
  total: 0,
  byIp: new Map(),
};

function isNonEmpty(value) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

const oauthConfig = {
  GOOGLE_CLIENT_ID: googleClientId,
  GOOGLE_CLIENT_SECRET: googleClientSecret,
  SESSION_SECRET: sessionSecret,
};

const missingOAuthKeys = Object.entries(oauthConfig)
  .filter(([, value]) => !isNonEmpty(value))
  .map(([key]) => key);

const isOAuthConfigured = missingOAuthKeys.length === 0;

app.use(
  session({
    secret: sessionSecret || "temporary-dev-secret",
    proxy: true,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

if (isOAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL: `${appBaseUrl}/auth/google/callback`,
      },
      (_accessToken, _refreshToken, profile, done) => {
        const primaryEmail =
          Array.isArray(profile.emails) && profile.emails.length > 0
            ? String(profile.emails[0].value || "").trim().toLowerCase()
            : "";

        if (!primaryEmail || !adminEmail || primaryEmail !== adminEmail.trim().toLowerCase()) {
          return done(null, false, { message: "Admin email is not authorized." });
        }

        return done(null, {
          id: profile.id,
          displayName: profile.displayName || primaryEmail,
          email: primaryEmail,
        });
      }
    )
  );
}

function requireAdminAuth(req, res, next) {
  if (!isOAuthConfigured) {
    return res
      .status(503)
      .json({ error: "Google OAuth is not configured on this server." });
  }

  if (!adminEmail) {
    return res
      .status(503)
      .json({ error: "Admin email is not configured on this server." });
  }

  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Unauthorized. Please sign in with Google." });
  }

  const loggedInEmail = String(req.user.email || "").trim().toLowerCase();
  if (!loggedInEmail || loggedInEmail !== adminEmail.trim().toLowerCase()) {
    return res.status(403).json({ error: "Forbidden. Admin email mismatch." });
  }

  return next();
}

app.get("/auth/google", (req, res, next) => {
  if (!isOAuthConfigured) {
    return res.redirect("/admin.html?auth=oauth-not-configured");
  }

  return passport.authenticate("google", { scope: ["profile", "email"] })(
    req,
    res,
    next
  );
});

app.get("/auth/google/callback", (req, res, next) => {
  if (!isOAuthConfigured) {
    return res.redirect("/admin.html?auth=oauth-not-configured");
  }

  return passport.authenticate("google", (err, user) => {
    if (err) {
      console.error("Google OAuth callback error:", err.message);
      return res.redirect("/admin.html?auth=error");
    }

    if (!user) {
      return res.redirect("/admin.html?auth=forbidden");
    }

    return req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error("Session login error:", loginErr.message);
        return res.redirect("/admin.html?auth=error");
      }
      return res.redirect("/admin.html?auth=success");
    });
  })(req, res, next);
});

app.post("/auth/logout", (req, res) => {
  req.logout((logoutErr) => {
    if (logoutErr) {
      return res.status(500).json({ error: "Failed to log out." });
    }

    return req.session.destroy((sessionErr) => {
      if (sessionErr) {
        return res.status(500).json({ error: "Failed to clear session." });
      }
      res.clearCookie("connect.sid");
      return res.status(200).json({ message: "Logged out." });
    });
  });
});

app.get("/api/admin/me", requireAdminAuth, (req, res) => {
  return res.status(200).json({
    email: req.user.email,
    name: req.user.displayName,
  });
});

app.get("/api/admin/config-status", (_req, res) => {
  return res.status(200).json({
    oauthConfigured: isOAuthConfigured,
    missingOAuthKeys,
    adminEmailConfigured: isNonEmpty(adminEmail),
    appBaseUrl,
  });
});

const messageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
  }
);

const Message = mongoose.model("Message", messageSchema);

function validateMessagePayload(payload) {
  const cleanName = typeof payload.name === "string" ? payload.name.trim() : "";
  const cleanEmail = typeof payload.email === "string" ? payload.email.trim() : "";
  const cleanPhone = typeof payload.phone === "string" ? payload.phone.trim() : "";
  const cleanMessage = typeof payload.message === "string" ? payload.message.trim() : "";

  if (!cleanName || !cleanEmail || !cleanPhone || !cleanMessage) {
    return { error: "All fields are required." };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return { error: "Please provide a valid email address." };
  }

  return {
    data: {
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      message: cleanMessage,
    },
  };
}

function buildChatbotReply(rawMessage) {
  const message = String(rawMessage || "").trim();
  if (!message) {
    return {
      reply:
        "Ask me about Mayukh's skills, projects, contact details, coding profiles, or how to send a message.",
      topic: "empty",
    };
  }

  const normalized = message.toLowerCase();

  if (/hi|hello|hey|hola/.test(normalized)) {
    return {
      reply:
        "Hi. I am Mayukh's portfolio assistant. Ask about skills, projects, achievements, or contact details.",
      topic: "greeting",
    };
  }

  if (/skill|tech stack|technology|frontend|backend|database/.test(normalized)) {
    return {
      reply:
        "Mayukh works with React, HTML, CSS, JavaScript, Node.js, Express.js, Flask, MongoDB, MySQL, Firebase, and Supabase.",
      topic: "skills",
    };
  }

  if (/project|reclaim|study portal|ju/.test(normalized)) {
    return {
      reply:
        "Featured projects include Reclaim IT (lost-and-found platform with auth and claim workflows) and JU Study Portal (student resources platform).",
      topic: "projects",
    };
  }

  if (/achievement|codechef|leetcode|award|certificate/.test(normalized)) {
    return {
      reply:
        "Highlights: 2-star CodeChef (max 1445), 350+ LeetCode problems (max 1657), and 1st position in Pitch Genix 2023.",
      topic: "achievements",
    };
  }

  if (/hobby|hobbies|interest|interests|sports|dance|cricket|football|badminton|basketball|table tennis|kickboxing|karate/.test(normalized)) {
    return {
      reply:
        "Mayukh enjoys cricket, dance, table tennis, basketball, football, badminton, kickboxing, stunts, and karate. He likes balancing coding with sports and creative activities.",
      topic: "hobbies",
    };
  }

  if (/what kind of person|personality|nature|about mayukh|who is mayukh|describe mayukh|is mayukh/.test(normalized)) {
    return {
      reply:
        "Mayukh is known as a humble, caring, and hardworking person. He is a quick learner, team-friendly collaborator, and stays positive while solving problems.",
      topic: "personality",
    };
  }

  if (/contact|email|phone|linkedin|github|reach/.test(normalized)) {
    return {
      reply:
        "You can contact Mayukh at mayukhs.it.ug@jadavpuruniversity.in, LinkedIn: linkedin.com/in/mayukh-sinha-b262a9256, and GitHub: github.com/mayukh30.",
      topic: "contact",
    };
  }

  if (/hire|available|intern|job|opportunity/.test(normalized)) {
    return {
      reply:
        "Mayukh is open to opportunities. Use the contact form on this page to share your role, timeline, and project details.",
      topic: "opportunities",
    };
  }

  if (/admin|message|inbox|oauth/.test(normalized)) {
    return {
      reply:
        "Admin inbox access is Google OAuth protected. Only the configured admin email can view submitted messages.",
      topic: "admin",
    };
  }

  return {
    reply:
      "I can help with skills, projects, achievements, coding profiles, and contact info. You can also send a message from the contact section below.",
    topic: "fallback",
  };
}

function getClientIp(req) {
  const forwarded = req.get("x-forwarded-for");
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

function checkChatRateLimit(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  const existing = chatRateBuckets.get(ip) || [];
  const active = existing.filter((timestamp) => now - timestamp < chatRateLimitWindowMs);

  if (active.length >= chatRateLimitMax) {
    const retryAfterMs = chatRateLimitWindowMs - (now - active[0]);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  active.push(now);
  chatRateBuckets.set(ip, active);
  return { allowed: true };
}

function getUtcDayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function secondsUntilNextUtcDay(timestamp) {
  const now = new Date(timestamp);
  const nextUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(1, Math.ceil((nextUtc - timestamp) / 1000));
}

function resetDailyBudgetIfNeeded(timestamp) {
  const currentDay = getUtcDayKey(timestamp);
  if (chatDailyUsage.dayKey !== currentDay) {
    chatDailyUsage.dayKey = currentDay;
    chatDailyUsage.total = 0;
    chatDailyUsage.byIp.clear();
  }
}

function checkChatDailyBudget(req) {
  const now = Date.now();
  const ip = getClientIp(req);

  resetDailyBudgetIfNeeded(now);

  if (chatDailyUsage.total >= chatDailyLimitGlobal) {
    return {
      allowed: false,
      reason: "global",
      retryAfterSeconds: secondsUntilNextUtcDay(now),
    };
  }

  const ipCount = chatDailyUsage.byIp.get(ip) || 0;
  if (ipCount >= chatDailyLimitPerIp) {
    return {
      allowed: false,
      reason: "ip",
      retryAfterSeconds: secondsUntilNextUtcDay(now),
    };
  }

  chatDailyUsage.total += 1;
  chatDailyUsage.byIp.set(ip, ipCount + 1);

  return { allowed: true };
}

app.post("/api/messages", (req, res) => {
  const validation = validateMessagePayload(req.body || {});
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  Message.create(validation.data)
    .then((savedMessage) => {
      return res.status(201).json({
        message: "Message saved successfully.",
        id: savedMessage._id,
      });
    })
    .catch((err) => {
      console.error("Failed to save message:", err.message);
      return res.status(500).json({ error: "Failed to save message." });
    });
});

app.post("/api/chat", (req, res) => {
  const rateLimit = checkChatRateLimit(req);
  if (!rateLimit.allowed) {
    res.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return res.status(429).json({
      error: `Rate limit exceeded. Try again in ${rateLimit.retryAfterSeconds}s.`,
    });
  }

  const text = req.body && typeof req.body.message === "string" ? req.body.message.trim() : "";

  if (!text) {
    return res.status(400).json({ error: "Message is required." });
  }

  if (text.length > 300) {
    return res.status(400).json({ error: "Message is too long. Keep it under 300 characters." });
  }

  const dailyBudget = checkChatDailyBudget(req);
  if (!dailyBudget.allowed) {
    res.set("Retry-After", String(dailyBudget.retryAfterSeconds));
    return res.status(429).json({
      error:
        dailyBudget.reason === "global"
          ? "Daily chat capacity reached. Please try again tomorrow."
          : "You reached the daily chat limit from this IP. Please try again tomorrow.",
      source: "guardrail",
    });
  }

  const sensitiveIntentRegex = /password|secret|token|api key|private key|credential/i;
  if (sensitiveIntentRegex.test(text)) {
    return res.status(200).json({
      reply: "I cannot help with secrets or private credentials. Please use the contact form for legitimate queries.",
      topic: "safety",
      source: "guardrail",
    });
  }

  const response = buildChatbotReply(text);
  return res.status(200).json({
    reply: response.reply,
    topic: response.topic,
    source: "rule-based",
  });
});

app.get("/api/admin/messages", requireAdminAuth, (_req, res) => {
  Message.find({}, { __v: 0 })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()
    .then((rows) => {
      const messages = rows.map((row) => ({
        id: row._id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        message: row.message,
        created_at: row.createdAt,
      }));

      return res.status(200).json({ count: messages.length, messages });
    })
    .catch((err) => {
      console.error("Failed to fetch messages:", err.message);
      return res.status(500).json({ error: "Failed to fetch messages." });
    });
});

// Serve frontend files
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

if (!mongoUri) {
  console.error("MONGODB_URI is not set. Add it to your environment variables.");
  process.exit(1);
}

if (!isOAuthConfigured) {
  console.warn(
    `Google OAuth is not fully configured. Missing: ${missingOAuthKeys.join(", ")}`
  );
}

if (!adminEmail) {
  console.warn(
    "ADMIN_EMAIL is not set. Admin route /api/admin/messages will return 503 until configured."
  );
}

if (chatDailyLimitGlobal < 1 || chatDailyLimitPerIp < 1) {
  console.warn("CHAT_DAILY_LIMIT_GLOBAL and CHAT_DAILY_LIMIT_PER_IP should be >= 1.");
}

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("Connected to MongoDB.");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err.message);
    process.exit(1);
  });

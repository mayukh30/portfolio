const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const mongoUri = process.env.MONGODB_URI;
const adminEmail = process.env.ADMIN_EMAIL;
const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const sessionSecret = process.env.SESSION_SECRET;

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

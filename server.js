const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const dbPath = path.join(__dirname, "messages.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Failed to connect to database:", err.message);
    return;
  }

  db.run(
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    (tableErr) => {
      if (tableErr) {
        console.error("Failed to create messages table:", tableErr.message);
      }
    }
  );
});

app.post("/api/messages", (req, res) => {
  const { name, email, phone, message } = req.body || {};

  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim() : "";
  const cleanPhone = typeof phone === "string" ? phone.trim() : "";
  const cleanMessage = typeof message === "string" ? message.trim() : "";

  if (!cleanName || !cleanEmail || !cleanPhone || !cleanMessage) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  const insertQuery =
    "INSERT INTO messages (name, email, phone, message) VALUES (?, ?, ?, ?)";

  db.run(insertQuery, [cleanName, cleanEmail, cleanPhone, cleanMessage], function (err) {
    if (err) {
      console.error("Failed to save message:", err.message);
      return res.status(500).json({ error: "Failed to save message." });
    }

    return res.status(201).json({
      message: "Message saved successfully.",
      id: this.lastID,
    });
  });
});

// Serve frontend files
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

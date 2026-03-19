const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const mongoUri = process.env.MONGODB_URI;

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

app.get("/api/messages", (_req, res) => {
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

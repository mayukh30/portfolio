const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const XLSX = require("xlsx");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve frontend files (index.html, style.css, script.js)
app.use(express.static("public"));

// Start server
app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));

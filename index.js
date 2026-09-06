const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const admin = require("firebase-admin");
require("dotenv").config();
const newsRoutes = require("./routes/news");
const app = express();
app.set('trust proxy', 1);

// Initialize Firebase Admin using the service account stored in env vars
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(cors({
  origin: ["https://starredlist.vercel.app", "http://localhost:3000"],
  methods: ["GET", "POST"],
}));
app.use(express.json());

// Middleware: only allow requests from signed-in users
async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Sign in required to use this feature." });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired sign-in. Please sign in again." });
  }
}

app.use("/api/news", verifyAuth, newsRoutes);

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: { error: "Too many requests, please slow down and try again shortly." },
  standardHeaders: true,
  legacyHeaders: false,
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
app.get("/", (req, res) => {
  res.json({ status: "StaredList backend is running!" });
});
app.post("/api/chat", verifyAuth, chatLimiter, async (req, res) => {
  try {
    const { messages, systemPrompt, max_tokens } = req.body;
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt || "You are LIBI, a helpful assistant." },
          ...messages
        ],
        max_tokens: max_tokens || 1024,
      }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

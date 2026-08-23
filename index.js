const express = require("express");
const cors = require("cors");
require("dotenv").config();
const newsRoutes = require("./routes/news");
const app = express();
app.set('trust proxy', 1);
app.use(cors({
  origin: ["https://starredlist.vercel.app", "http://localhost:3000"],
  methods: ["GET", "POST"],
}));
app.use(express.json());
app.use("/api/news", newsRoutes);
const GROQ_API_KEY = process.env.GROQ_API_KEY;
app.get("/", (req, res) => {
  res.json({ status: "StaredList backend is running!" });
});
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, systemPrompt, max_tokens } = req.body;
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
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

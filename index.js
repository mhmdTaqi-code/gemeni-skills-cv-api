// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ✅ فحص مفتاح البيئة مبكّرًا
const API_KEY = process.env.GEMINI_API_KEY;
const MOCK_AI = String(process.env.MOCK_AI || "").toLowerCase() === "true";

if (!API_KEY && !MOCK_AI) {
  console.error(
    "❌ GEMINI_API_KEY is missing. Set it in .env or enable MOCK_AI=true."
  );
}

// Gemini client (أنشئه فقط إذا عندك مفتاح)
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

// صحّة السيرفر
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    port: PORT,
    hasApiKey: Boolean(API_KEY),
    mockAI: MOCK_AI,
    node: process.version,
  });
});

// اقتراح مهارات
app.post("/api/suggest-skills", async (req, res) => {
  try {
    const { title, locale = "ar" } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    // ✅ وضع المحاكاة (بديل مؤقت)
    if (MOCK_AI || !API_KEY) {
      const t = title.toLowerCase();
      let mock = ["Communication", "Problem Solving", "Teamwork"];
      if (t.includes("frontend")) {
        mock = [
          "JavaScript",
          "React",
          "TypeScript",
          "HTML5",
          "CSS3",
          "REST APIs",
          "Git",
          "Jest",
        ];
      } else if (t.includes("backend")) {
        mock = [
          "Node.js",
          "Express",
          "SQL",
          "PostgreSQL",
          "REST APIs",
          "Auth (JWT/OAuth)",
          "Docker",
          "Testing",
        ];
      } else if (t.includes("data")) {
        mock = [
          "SQL",
          "Python",
          "Pandas",
          "NumPy",
          "ETL",
          "Data Visualization",
          "Power BI",
          "Statistics",
        ];
      }
      return res.json(mock);
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are a career coach specializing in technical skills.
Given a job title, return STRICTLY a JSON array (8–12 items) of ONLY **technical tools, software, and hard skills** that are most relevant today.

Job Title: "${title}"
Locale: ${locale}

Rules:
- Return only modern tools, frameworks, and software names used in the field.
- No soft skills (e.g., communication, teamwork, problem solving).
- No generic words.
- Prefer software and technical tools (AutoCAD, Revit, 3ds Max, Lumion, Photoshop, Rhino, Grasshopper, etc. for architects).
- JSON array ONLY, no commentary.
- Example for "Architect": ["AutoCAD", "Revit", "3ds Max", "Lumion", "SketchUp", "Photoshop", "Rhino", "Grasshopper"]
`;

    // ✅ نفّذ الطلب وسجّل زمنه (مفيد للتشخيص)
    const t0 = Date.now();
    const resp = await model.generateContent(prompt);
    const ms = Date.now() - t0;
    console.log(`🟢 Gemini responded in ${ms}ms for title="${title}"`);

    const text = (resp?.response?.text?.() || "").trim();

    // جرّب قراءة JSON
    let skills = [];
    try {
      const clean = text.replace(/```json|```/g, "");
      skills = JSON.parse(clean);
    } catch (e) {
      // محاولة ثانية لاستخراج ما بين [ ... ]
      const m = text.match(/\[([\s\S]*)\]/);
      if (m) {
        try {
          skills = JSON.parse(m[0]);
        } catch {}
      }
    }

    if (!Array.isArray(skills)) skills = [];

    // تنظيف + حد أعلى
    const cleaned = [
      ...new Set(skills.map((s) => String(s).trim()).filter(Boolean)),
    ].slice(0, 12);

    return res.json(cleaned);
  } catch (err) {
    // ✅ لوج تفصيلي
    console.error("❌ Gemini API failed:");
    console.error("message:", err?.message);
    // بعض المكتبات تُرجع response داخلي — اطبع لو موجود
    if (err?.response) {
      console.error("status:", err.response.status);
      console.error("data:", err.response.data);
    } else if (err?.status) {
      console.error("status:", err.status);
    }
    return res.status(500).json({ error: "Gemini API failed" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🔎 Health: http://localhost:${PORT}/api/health`);
});

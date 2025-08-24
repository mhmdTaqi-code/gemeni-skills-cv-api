import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== Gemini Setup =====
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY مفقود في .env");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ===== Utilities =====
const SOFT_SKILLS = [
  "communication",
  "problem",
  "teamwork",
  "leadership",
  "collaboration",
  "time management",
  "critical thinking",
  "creativity",
  "adaptability",
  "fast learner",
  "self-motivated",
  "attention to detail",
  "work ethic",
  "analytical",
  "multitasking",
  "proactive",
  "strategic",
  "presentation",
  "negotiation",
  "interpersonal",
  "flexibility",
  "initiative",
  "motivation",
  "organization",
  "planning",
  "mentoring",
  "management",
  "research",
  "sales",
  "marketing",
  "customer service",
  "writing",
  "verbal",
  "listening",
  "conflict",
  "decision",
  "cooperation",
  "dependability",
  "empathy",
];

const normalize = (s = "") =>
  String(s)
    .replace(/[™®©]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\(.*?\)/g, "")
    .trim();

const isSoft = (s = "") => {
  const low = s.toLowerCase();
  return SOFT_SKILLS.some((w) => low.includes(w));
};

// ===== Routes =====
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "suggest-skills", model: "gemini-1.5-flash" });
});

app.post("/api/suggest-skills", async (req, res) => {
  const { title, years, stack } = req.body || {};
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "حقل title مطلوب" });
  }

  try {
    // ✅ Prompt يركز على المهارات الصلبة فقط (أدوات/برمجيات/تقنيات)
    const prompt = `
أنت خبير توظيف. أريد "مهارات صلبة فقط" (Hard Skills) لمسمى وظيفي.
- المسمى: "${title}"
- سنوات الخبرة: "${years || "غير مذكور"}"
- التقنيات الحالية: "${stack || "غير مذكور"}"

التزم بالشروط التالية:
1) أعد الناتج بصيغة JSON فقط، بدون أي كلام خارج JSON.
2) قائمة "skills" يجب أن تحتوي أسماء أدوات، برمجيات، لغات، إطارات عمل، مكتبات، منصات، تقنيات أو بروتوكولات.
3) يمنع إدراج مهارات ناعمة مثل: Communication, Problem Solving, Teamwork, Leadership ... إلخ.
4) عدد العناصر من 8 إلى 20 كحد أقصى.
5) أمثلة مقبولة حسب المجال:
   - Frontend: HTML, CSS, JavaScript, React, Vue, Next.js, Redux, Vite, TailwindCSS, Ant Design
   - Backend: Node.js, Express, NestJS, Prisma, PostgreSQL, Redis, Docker, Kubernetes
   - Data/ML: Python, Pandas, NumPy, Scikit-learn, TensorFlow
   - معماري/تصميم: Revit, AutoCAD, 3ds Max, SketchUp, Lumion, V-Ray, Enscape, Rhino, Grasshopper, Photoshop, Illustrator, Navisworks, BIM 360

أعد JSON فقط بهذا الشكل:
{
  "skills": ["Item1", "Item2", "..."]
}
    `.trim();

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    const raw = result.response.text().trim();
    // console.log("[suggest-skills] raw:", raw.slice(0, 200));

    // جرّب تحليل JSON مباشرة، أو التقط أول جسم JSON
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return res.status(502).json({ error: "النموذج لم يرجع JSON صالح" });
      }
      data = JSON.parse(match[0]);
    }

    // حول إلى مصفوفة نصوص ونظّفها
    let skills = [];
    if (Array.isArray(data.skills)) {
      skills = data.skills.map((item) => {
        if (typeof item === "string") return normalize(item);
        if (item && typeof item === "object") {
          return normalize(item.name || item.skill || "");
        }
        return "";
      });
    }

    // فلترة: شطب السفات سكيلز + العناصر الفارغة/الطويلة جدًا
    const filtered = skills
      .filter(Boolean)
      .filter((s) => !isSoft(s))
      .filter((s) => s.length <= 40);

    // تمييز فريد وتقصير للـ 20 الأولى
    const unique = Array.from(new Set(filtered)).slice(0, 20);

    if (unique.length === 0) {
      return res.status(502).json({
        error: "لم يتم استخراج مهارات صلبة مناسبة",
        hint: "جرّب تحديد المسمى بدقة أكبر أو أرسل stack واضح",
      });
    }

    // ✅ نرجّع Array نصوص فقط
    return res.json(unique);
  } catch (e) {
    console.error("[suggest-skills] ERROR:", e?.message || e);
    return res.status(500).json({
      error: "فشل الطلب إلى Gemini",
      message: e?.message || "Unknown error",
    });
  }
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

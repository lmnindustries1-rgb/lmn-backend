require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const session = require("express-session");

const app = express();

/* ================= BASIC SETTINGS ================= */
app.set("trust proxy", 1);

/* ================= CORS (FINAL FIX) ================= */
const corsOptions = {
  origin: "https://lmn-industriesnetlifyapp.netlify.app",
  credentials: true, // 🔥 REQUIRED
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // 🔥 PREFLIGHT FIX

app.use(express.json());

/* ================= SESSION ================= */
app.use(
  session({
    name: "lmn_admin_session",
    secret: process.env.SESSION_SECRET || "lmn-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "none", // 🔥 REQUIRED for cross-site
      secure: true,     // 🔥 REQUIRED on Render (HTTPS)
      maxAge: 15 * 60 * 1000,
    },
  })
);

/* ================= RATE LIMIT ================= */
app.use(
  "/send",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
  })
);

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ================= CONTACT API ================= */
app.post("/send", async (req, res) => {
  const { name, email, phone, message, captcha } = req.body;

  if (!captcha) return res.status(400).send("Captcha missing");

  try {
    const captchaRes = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      { params: { secret: process.env.RECAPTCHA_SECRET, response: captcha } }
    );

    if (!captchaRes.data.success) {
      return res.status(400).send("Captcha failed");
    }
  } catch (err) {
    console.error("Captcha error:", err.message);
    return res.status(500).send("Captcha error");
  }

  // ✅ TEMP: skip email
  console.log("New enquiry:", { name, email, phone, message });

  res.json({ success: true });
});


/* ================= SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

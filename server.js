require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const session = require("express-session");

const app = express();

/* ================= IN-MEMORY STORE (RENDER SAFE) ================= */
let enquiries = [];

/* ================= BASIC MIDDLEWARE ================= */
app.set("trust proxy", 1);

aapp.use(cors({
  origin: [
    "https://lmn-industriesnetlifyapp.netlify.app",
    "http://localhost:5000"
  ],
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"],
  credentials: false
}));
app.options("*", cors());


app.use(express.json());

app.use(session({
  name: "lmn_admin_session",
  secret: process.env.SESSION_SECRET || "lmn-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "none",     // 🔥 REQUIRED
    secure: true,         // 🔥 REQUIRED on Render
    maxAge: 15 * 60 * 1000
  }
}));

/* ================= RATE LIMIT ================= */
app.use("/send", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50
}));

/* ================= EMAIL CONFIG ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= CONTACT FORM ================= */
app.post("/send", async (req, res) => {
  const { name, email, phone, message, captcha } = req.body;

  if (!captcha) return res.status(400).send("Captcha missing");

  try {
    const captchaRes = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      { params: { secret: process.env.RECAPTCHA_SECRET, response: captcha } }
    );

    if (!captchaRes.data.success)
      return res.status(400).send("Captcha failed");
  } catch {
    return res.status(500).send("Captcha error");
  }

  const enquiry = {
    id: Date.now(),
    name,
    email,
    phone,
    message,
    date: new Date().toISOString()
  };

  enquiries.push(enquiry);

  try {
    await transporter.sendMail({
      from: `"LMN Industries" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "🔔 New CNC Enquiry",
      html: `<p><b>${name}</b><br>${email}<br>${phone}<br>${message}</p>`
    });

    res.send({ success: true });
  } catch {
    res.status(500).send("Email error");
  }
});

/* ================= ADMIN LOGIN ================= */
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    req.session.admin = true;
    return req.session.save(() => res.send({ success: true }));
  }

  res.status(401).send("Invalid credentials");
});

/* ================= AUTH ================= */
function checkAuth(req, res, next) {
  if (req.session.admin) return next();
  res.status(403).send("Unauthorized");
}

/* ================= DASHBOARD ================= */
app.get("/admin/enquiries", checkAuth, (req, res) => {
  res.json({
    total: enquiries.length,
    data: [...enquiries].reverse()
  });
});

/* ================= DELETE ================= */
app.delete("/admin/enquiry/:id", checkAuth, (req, res) => {
  const id = Number(req.params.id);
  enquiries = enquiries.filter(e => e.id !== id);
  res.send({ success: true });
});

/* ================= LOGOUT ================= */
app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.send({ success: true }));
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const fs = require("fs");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const session = require("express-session");

const app = express();

/* ================= BASIC MIDDLEWARE ================= */
app.use(cors({
  origin: [
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "https://lmn-industries.netlify.app", // replace with your real Netlify URL
  ],
  credentials: true
}));

app.use(express.json());

app.set("trust proxy", 1);

app.use(session({
  name: "lmn_admin_session",
  secret: "lmn-industries-secret",
  resave: false,
  saveUninitialized: false,   // ✅ FIX
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,            // true after HTTPS deploy
    maxAge: 15 * 60 * 1000
  }
}));

/* ================= RATE LIMIT (CONTACT FORM) ================= */
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

/* ================= CONTACT FORM API ================= */
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
    id: Date.now(), // ✅ UNIQUE ID (IMPORTANT)
    name,
    email,
    phone,
    message,
    date: new Date().toISOString()
  };

  let enquiries = [];
  try { enquiries = JSON.parse(fs.readFileSync("enquiries.json")); }
  catch {}

  enquiries.push(enquiry);
  fs.writeFileSync("enquiries.json", JSON.stringify(enquiries, null, 2));

  try {
    await transporter.sendMail({
      from: `"LMN Industries" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "🔔 New CNC Enquiry",
      html: `<p><b>${name}</b><br>${email}<br>${phone}<br>${message}</p>`
    });

    await transporter.sendMail({
      from: `"LMN Industries" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Thank you for contacting LMN Industries",
      html: `<p>Dear ${name},<br>We received your enquiry.</p>`
    });

    res.send("Enquiry processed securely");
  } catch {
    res.status(500).send("Email error");
  }
});

/* ================= ADMIN LOGIN (FINAL & WORKING) ================= */
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (!req.session.attempts)
    req.session.attempts = { count: 0, time: Date.now() };

  const attempts = req.session.attempts;

  if (Date.now() - attempts.time > 10 * 60 * 1000) {
    attempts.count = 0;
    attempts.time = Date.now();
  }

  if (attempts.count >= 5) {
  // allow unlock if correct password
  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    attempts.count = 0;
    req.session.admin = true;
    return req.session.save(() =>
      res.send({ success: true })
    );
  }

  return res
    .status(429)
    .send("Too many attempts. Try again later.");
}


  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    attempts.count = 0;
    req.session.admin = true;

    return req.session.save(() =>
      res.send({ success: true })
    );
  }

  attempts.count++;
  return req.session.save(() =>
    res.status(401).send("Invalid credentials")
  );
});

/* ================= AUTH MIDDLEWARE ================= */
function checkAuth(req, res, next) {
  if (req.session.admin) return next();
  res.status(403).send("Unauthorized");
}

/* ================= DASHBOARD API ================= */
app.get("/admin/enquiries", checkAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const days = parseInt(req.query.days) || null;

  let all = [];
  try { all = JSON.parse(fs.readFileSync("enquiries.json")); }
  catch {}

  if (days) {
    const cutoff = Date.now() - days * 86400000;
    all = all.filter(e => new Date(e.date).getTime() >= cutoff);
  }

  all.reverse();

  res.json({
    total: all.length,
    page,
    pages: Math.ceil(all.length / limit),
    data: all.slice((page - 1) * limit, page * limit)
  });
});

/* ================= DELETE ENQUIRY (SAFE) ================= */
app.delete("/admin/enquiry/:id", checkAuth, (req, res) => {
  const id = Number(req.params.id);

  let enquiries = [];
  try { enquiries = JSON.parse(fs.readFileSync("enquiries.json")); }
  catch {}

  const updated = enquiries.filter(e => e.id !== id);
  fs.writeFileSync("enquiries.json", JSON.stringify(updated, null, 2));

  res.send({ success: true });
});

/* ================= LOGOUT ================= */
app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => res.send({ success: true }));
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});



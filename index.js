require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*', // Allows requests from Vercel or any location during testing
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shift_dev_web_solutions',
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // This line is crucial for cloud databases like Aiven:
  // ssl: {
  //   ca: fs.readFileSync(path.join(__dirname, 'ca.pem')),
  // },
});

// Verify database connection
pool.getConnection()
  .then(conn => {
    console.log('✅ Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });



// Email: Send notification via Resend HTTP API (works on Render - no SMTP needed)
async function sendLeadNotification(lead) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Shift-Dev <onboarding@resend.dev>',
      to: [process.env.NOTIFY_EMAIL || 'rohitkadu2016@gmail.com'],
      subject: `🚀 New Lead: ${lead.business_name}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 32px; border-radius: 12px;">
          <h1 style="color: #a78bfa; margin-bottom: 24px;">New Lead Received!</h1>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">Client Name</td>
              <td style="padding: 12px; border-bottom: 1px solid #333; font-weight: bold;">${lead.client_name}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">Business Name</td>
              <td style="padding: 12px; border-bottom: 1px solid #333; font-weight: bold;">${lead.business_name}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">Instagram</td>
              <td style="padding: 12px; border-bottom: 1px solid #333; font-weight: bold;">@${lead.insta_handle}</td>
            </tr>
            <tr>
              <td style="padding: 12px; color: #9ca3af;">WhatsApp</td>
              <td style="padding: 12px; font-weight: bold;">${lead.whatsapp}</td>
            </tr>
          </table>
          <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">Received at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Resend API error');
  }
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Shift Dev Web Solutions API is running' });
});

// POST /api/leads - Insert a new lead
app.post('/api/leads', async (req, res, next) => {
  try {
    const { client_name, business_name, insta_handle, whatsapp } = req.body;

    // Validation
    if (!client_name || !business_name || !insta_handle || !whatsapp) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: client_name, business_name, insta_handle, whatsapp',
      });
    }

    // Parameterized query to prevent SQL injection
    const query = `INSERT INTO leads (client_name, business_name, insta_handle, whatsapp, created_at) VALUES (?, ?, ?, ?, CONVERT_TZ(NOW(), '+00:00', '+05:30'))`;
    const [result] = await pool.execute(query, [
      client_name,
      business_name,
      insta_handle,
      whatsapp,
    ]);

    // Send email notification
    try {
      await sendLeadNotification({ client_name, business_name, insta_handle, whatsapp });
    } catch (emailErr) {
      console.error('Email notification failed:', emailErr.message);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Lead submitted successfully!',
      leadId: result.insertId,
    });
  } catch (error) {
    next(error);
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(500).json({
    success: false,
    message: 'Internal server error. Please try again later.',
  });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Shift Dev Web Solutions API running on http://localhost:${PORT}`);
});

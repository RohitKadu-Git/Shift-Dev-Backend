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
      from: process.env.EMAIL_FROM || 'Site Formers <onboarding@resend.dev>',
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
  res.json({ status: 'ok', message: 'Site Formers API is running' });
});

// POST /api/chat - AI Chatbot using Groq (free tier)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history, isFirstMessage, pageUrl, referrer, userAgent, screenSize, language, timezone } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'AI service not configured' });
    }

    // Get user IP
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    const systemPrompt = `You are the AI assistant for "Site Formers" — a web development agency that builds high-performance websites, AI chatbots, and digital solutions for businesses. 

Key info about Site Formers:
- We build websites in 48 hours using React, Node.js, and modern tech
- We integrate AI chatbots, AI order takers, AI customer support bots into websites
- Pricing: Starter ₹4,999, Business ₹9,999, Enterprise ₹19,999+
- We serve restaurants, gyms, salons, real estate, e-commerce, and more
- Contact: WhatsApp +91 93073 91559
- We offer free mockups before starting

Be helpful, concise, and professional. If asked about unrelated topics, politely redirect to our services. Keep responses short (2-4 sentences max unless detail is needed). Use emojis sparingly.`;

    // Build messages array (OpenAI-compatible format)
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history
    if (history && history.length > 0) {
      history.forEach(msg => {
        messages.push({
          role: msg.role === 'ai' ? 'assistant' : 'user',
          content: msg.text
        });
      });
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Groq API error:', data);
      return res.status(500).json({ success: false, message: 'AI service error' });
    }

    const aiText = data.choices?.[0]?.message?.content || 'Sorry, I could not process that. Please try again.';

    // Log chat to database
    try {
      await pool.execute(
        `INSERT INTO chat_logs (request, response, ip, created_at) VALUES (?, ?, ?, CONVERT_TZ(NOW(), '+00:00', '+05:30'))`,
        [message, aiText, clientIp]
      );
    } catch (dbErr) {
      console.error('Chat log insert failed:', dbErr.message);
    }

    // Send email notification on FIRST message from a new user
    if (isFirstMessage) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'Site Formers <onboarding@resend.dev>',
            to: [process.env.NOTIFY_EMAIL || 'rohitkadu2016@gmail.com'],
            subject: `New Chatbot Visitor: ${message.slice(0, 50)}`,
            html: `
              <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 32px; border-radius: 12px;">
                <h1 style="color: #a78bfa; margin-bottom: 24px;">New Chatbot Interaction</h1>
                <p style="color: #e0e0e0; margin-bottom: 16px;">A visitor just started chatting with the AI bot on your website.</p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">First Message</td>
                    <td style="padding: 12px; border-bottom: 1px solid #333; font-weight: bold; color: #fff;">${message}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">AI Response</td>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #d1d5db;">${aiText.slice(0, 200)}...</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">IP Address</td>
                    <td style="padding: 12px; border-bottom: 1px solid #333; font-weight: bold; color: #fff;">${clientIp}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">Page URL</td>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #fff;">${pageUrl || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">Referrer</td>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #fff;">${referrer || 'Direct'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">Browser / Device</td>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #fff; font-size: 12px;">${userAgent || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">Screen Size</td>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #fff;">${screenSize || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">Language</td>
                    <td style="padding: 12px; border-bottom: 1px solid #333; color: #fff;">${language || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px; color: #9ca3af;">Timezone</td>
                    <td style="padding: 12px; color: #fff;">${timezone || 'N/A'}</td>
                  </tr>
                </table>
                <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">Received at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
              </div>
            `,
          }),
        });

        const emailData = await emailRes.json();
        if (!emailRes.ok) {
          console.error('❌ First chat email failed:', emailData);
        } else {
          console.log('✅ First chat email sent:', emailData.id);
        }
      } catch (emailErr) {
        console.error('❌ First chat email error:', emailErr.message);
      }
    }

    res.json({ success: true, response: aiText });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
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
  console.log(`🚀 Site Formers API running on http://localhost:${PORT}`);
});

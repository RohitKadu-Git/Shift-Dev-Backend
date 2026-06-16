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
              <td style="padding: 12px; border-bottom: 1px solid #333; color: #9ca3af;">Requirement</td>
              <td style="padding: 12px; border-bottom: 1px solid #333; font-weight: bold;">${lead.business_description || 'Not specified'}</td>
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

// POST /api/generate-demo - Generate a demo landing page using AI
app.post('/api/generate-demo', async (req, res) => {
  try {
    const { business_name, business_description, client_name } = req.body;

    if (!business_name) {
      return res.status(400).json({ success: false, message: 'Business name is required' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'AI service not configured' });
    }

    const prompt = `You are a world-class web designer creating a premium landing page for a real client. Think deeply about their business, target audience, and what would make them impressed. Create content that feels custom, professional, and conversion-optimized.

Business Name: ${business_name}
Business Description: ${business_description || 'A professional business that needs a modern website'}

Instructions:
- The headline should be powerful, benefit-driven, and specific to their industry
- The tagline should communicate their unique value proposition
- Services should feel authentic to their specific business type
- Features should highlight real competitive advantages
- The testimonial should feel genuine and relatable
- Choose a primary color that reflects their industry (restaurants=warm, tech=blue, health=green, luxury=gold/dark, etc.)
- Descriptions should be detailed enough to feel real, not generic
- Think about what their customers actually care about

Return ONLY valid JSON with this structure:
{
  "heroHeadline": "powerful benefit-driven headline (8-12 words max)",
  "heroSubtext": "compelling value proposition that makes visitors want to stay (20-35 words)",
  "primaryColor": "hex color that perfectly represents the brand vibe",
  "secondaryColor": "a complementary hex color for accents, gradients, and variety",
  "theme": "light or dark (light for restaurants, bakeries, health, weddings, kids. dark for tech, nightlife, gaming, luxury, automotive)",
  "tagline": "memorable business tagline (4-8 words)",
  "services": [
    { "title": "Service Name", "description": "2-3 sentence detailed description of what this service includes and why it matters", "icon": "relevant emoji" },
    { "title": "Service Name", "description": "2-3 sentence detailed description", "icon": "relevant emoji" },
    { "title": "Service Name", "description": "2-3 sentence detailed description", "icon": "relevant emoji" },
    { "title": "Service Name", "description": "2-3 sentence detailed description", "icon": "relevant emoji" }
  ],
  "features": [
    { "title": "Advantage Title", "description": "1-2 sentences explaining why this matters to the customer", "stat": "a relevant number/stat like 99.9% or 24/7 or 500+" },
    { "title": "Advantage Title", "description": "1-2 sentences", "stat": "relevant stat" },
    { "title": "Advantage Title", "description": "1-2 sentences", "stat": "relevant stat" },
    { "title": "Advantage Title", "description": "1-2 sentences", "stat": "relevant stat" }
  ],
  "ctaText": "action-oriented button text (2-5 words)",
  "aboutText": "A professional 2-3 sentence about section describing the business mission and what makes them different",
  "testimonials": [
    { "text": "realistic detailed testimonial quote (2-3 sentences)", "author": "Realistic Indian Name", "role": "Role/Business", "rating": 5 },
    { "text": "another genuine testimonial", "author": "Realistic Indian Name", "role": "Role/Business", "rating": 5 }
  ],
  "stats": [
    { "value": "number+", "label": "what it represents" },
    { "value": "number+", "label": "what it represents" },
    { "value": "number+", "label": "what it represents" }
  ],
  "faq": [
    { "question": "common customer question", "answer": "helpful detailed answer" },
    { "question": "common customer question", "answer": "helpful detailed answer" },
    { "question": "common customer question", "answer": "helpful detailed answer" }
  ],
  "heroImage": "a single relevant Unsplash search keyword for the hero background (e.g. restaurant, gym, salon, office, technology)",
  "portfolio": [
    { "title": "Project/Work title", "description": "short description of the work", "image": "unsplash search keyword for this work (e.g. website-design, interior, food-plating, fitness)" },
    { "title": "Project/Work title", "description": "short description", "image": "unsplash keyword" },
    { "title": "Project/Work title", "description": "short description", "image": "unsplash keyword" },
    { "title": "Project/Work title", "description": "short description", "image": "unsplash keyword" }
  ],
  "galleryKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6"]
}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an elite web design agency creative director. You create stunning, conversion-optimized landing page content. Return ONLY valid JSON. No markdown, no code blocks, no explanation. Think carefully about the business and create content that would genuinely impress the client.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 2500,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Groq API error:', data);
      return res.status(500).json({ success: false, message: 'AI generation failed' });
    }

    const aiContent = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from AI response
    let pageData;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      pageData = JSON.parse(jsonMatch ? jsonMatch[0] : aiContent);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message, aiContent);
      return res.status(500).json({ success: false, message: 'Failed to generate page content' });
    }

    // Store in database
    try {
      await pool.execute(
        `INSERT INTO generated_demos (client_name, business_name, business_description, page_data, created_at) VALUES (?, ?, ?, ?, CONVERT_TZ(NOW(), '+00:00', '+05:30'))`,
        [client_name || '', business_name, business_description || '', JSON.stringify(pageData)]
      );
      console.log('✅ Demo page stored for:', business_name);
    } catch (dbErr) {
      console.error('Demo store failed:', dbErr.message);
    }

    res.json({ success: true, pageData: { ...pageData, businessName: business_name } });
  } catch (error) {
    console.error('Generate demo error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});

// GET /api/demos - List all generated demos (admin only)
app.get('/api/demos', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, client_name, business_name, business_description, page_data, created_at FROM generated_demos ORDER BY created_at DESC');
    res.json({ success: true, demos: rows });
  } catch (error) {
    console.error('Fetch demos error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch demos' });
  }
});

// GET /api/demos/:id - Get a single demo
app.get('/api/demos/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM generated_demos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Demo not found' });
    }
    res.json({ success: true, demo: rows[0] });
  } catch (error) {
    console.error('Fetch demo error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch demo' });
  }
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
- Contact: WhatsApp +91 7620361889
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
    const { client_name, business_name, business_description, insta_handle, whatsapp } = req.body;

    // Validation
    if (!client_name || !business_name || !insta_handle || !whatsapp) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: client_name, business_name, insta_handle, whatsapp',
      });
    }

    // Parameterized query to prevent SQL injection
    const query = `INSERT INTO leads (client_name, business_name, business_description, insta_handle, whatsapp, created_at) VALUES (?, ?, ?, ?, ?, CONVERT_TZ(NOW(), '+00:00', '+05:30'))`;
    const [result] = await pool.execute(query, [
      client_name,
      business_name,
      business_description || '',
      insta_handle,
      whatsapp,
    ]);

    // Send email notification
    try {
      await sendLeadNotification({ client_name, business_name, business_description, insta_handle, whatsapp });
    } catch (emailErr) {
      console.error('Email notification failed:', emailErr.message);
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

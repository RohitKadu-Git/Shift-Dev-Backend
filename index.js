require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
      from: process.env.EMAIL_FROM || 'Site Former <onboarding@resend.dev>',
      to: [process.env.NOTIFY_EMAIL || 'siteformers@gmail.com'],
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
  res.json({ status: 'ok', message: 'Site Former API is running' });
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
- For ALL images, use Pexels direct image URLs in the format: https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop
- Use these REAL Pexels photo IDs based on business type:
  * Restaurant/Food: 1640777, 958545, 1267320, 1579739, 376464, 70497
  * Gym/Fitness: 1954524, 841130, 2294361, 3253501, 1552242, 2261477
  * Salon/Spa: 3993449, 3997993, 3738355, 3985329, 3764568, 457701
  * Real Estate: 106399, 1396122, 323780, 1115804, 2102587, 271816
  * Tech/Software: 546819, 3861969, 1714208, 574071, 1181467, 3183153
  * E-commerce/Retail: 5632402, 3965545, 5650026, 934070, 1714208, 3184338
  * Automotive/Cars: 3752169, 3802510, 1149137, 3874337, 810357, 707046
  * Education: 5212345, 4145153, 256395, 159844, 301926, 5905709
  * Healthcare/Medical: 4386467, 3259629, 3825586, 4021775, 3376790, 5215024
  * Coffee/Cafe: 302899, 312418, 1695052, 1024359, 894695, 1813466
  * Hotel/Hospitality: 258154, 189296, 261102, 271624, 164595, 2869215
  * General/Other: 3184291, 3183153, 574071, 1714208, 546819, 3861969

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
  "portfolioDescription": "A 1-2 sentence description written from the developer's perspective about what was built — mention the tech stack, key features integrated, and functionality delivered (e.g. 'Custom furniture catalog with advanced filtering, quotation request system, WhatsApp integration & mobile-responsive design.')",
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
  "heroImage": "Pexels direct URL using a relevant photo ID from the list above, format: https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=1600&h=900&fit=crop",
  "coverImage": "a specific keyword for the portfolio cover that best represents this business",
  "businessType": "one or two word category (e.g. Fitness, Spa, Restaurant, Real Estate, E-commerce, Healthcare, Education, Automotive, Salon, Cafe, Hotel, Bakery, Tech, etc.)",
  "coverImageUrl": "Pexels direct URL using a relevant photo ID, format: https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "portfolio": [
    { "title": "Project/Work title", "description": "short description of the work", "image": "Pexels direct URL with relevant photo ID" },
    { "title": "Project/Work title", "description": "short description", "image": "Pexels direct URL" },
    { "title": "Project/Work title", "description": "short description", "image": "Pexels direct URL" },
    { "title": "Project/Work title", "description": "short description", "image": "Pexels direct URL" }
  ],
  "galleryImages": [
    "Pexels direct URL 1",
    "Pexels direct URL 2",
    "Pexels direct URL 3",
    "Pexels direct URL 4",
    "Pexels direct URL 5",
    "Pexels direct URL 6"
  ]
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
          { role: 'system', content: 'You are an elite web design agency creative director. You create stunning, conversion-optimized landing page content. Return ONLY valid JSON. No markdown, no code blocks, no explanation. Think carefully about the business and create content that would genuinely impress the client. For ALL image URLs, use Pexels direct image URLs in the format https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop — ONLY use photo IDs from the list provided in the prompt. Never invent or guess photo IDs.' },
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

    // Fetch relevant images from Pexels based on business type
    try {
      const pexelsKey = process.env.PEXELS_API_KEY;
      if (pexelsKey) {
        const searchQuery = `${business_description || ''} ${pageData.businessType || ''} ${business_name}`.trim();
        const pexelsRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=15&orientation=landscape`, {
          headers: { 'Authorization': pexelsKey }
        });
        const pexelsData = await pexelsRes.json();

        if (pexelsData.photos && pexelsData.photos.length > 0) {
          const photos = pexelsData.photos;

          // Set hero image (largest)
          pageData.heroImage = photos[0]?.src?.large2x || photos[0]?.src?.large;

          // Set cover image
          pageData.coverImageUrl = photos[1]?.src?.large || photos[0]?.src?.medium;

          // Set portfolio images
          if (pageData.portfolio && pageData.portfolio.length > 0) {
            pageData.portfolio.forEach((item, i) => {
              const photo = photos[(i + 2) % photos.length];
              item.image = photo?.src?.medium || photo?.src?.small;
            });
          }

          // Set gallery images
          if (pageData.galleryImages && pageData.galleryImages.length > 0) {
            pageData.galleryImages = pageData.galleryImages.map((_, i) => {
              const photo = photos[(i + 6) % photos.length];
              return photo?.src?.medium || photo?.src?.small;
            });
          }
        }
      }
    } catch (pexelsErr) {
      console.error('Pexels image fetch failed (using AI-generated URLs):', pexelsErr.message);
    }

    // Store in database
    try {
      const shareToken = crypto.randomBytes(16).toString('hex');
      const businessType = pageData.businessType || '';
      const coverImageUrl = pageData.coverImageUrl || `https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop`;
      const aiDescription = pageData.portfolioDescription || pageData.aboutText || pageData.heroSubtext || business_description || '';
      await pool.execute(
        `INSERT INTO generated_demos (share_token, client_name, business_name, business_description, business_type, cover_image, page_data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CONVERT_TZ(NOW(), '+00:00', '+05:30'))`,
        [shareToken, client_name || '', business_name, aiDescription, businessType, coverImageUrl, JSON.stringify(pageData)]
      );
      console.log('✅ Demo page stored for:', business_name, '| Token:', shareToken);
    } catch (dbErr) {
      console.error('Demo store failed:', dbErr.message);
    }

    res.json({ success: true, pageData: { ...pageData, businessName: business_name } });
  } catch (error) {
    console.error('Generate demo error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong' });
  }
});

// GET /api/demos - List all generated demos (protected)
app.get('/api/demos', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const [rows] = await pool.execute('SELECT id, share_token, client_name, business_name, business_description, business_type, cover_image, page_data, show_in_portfolio, created_at FROM generated_demos ORDER BY created_at DESC');
    res.json({ success: true, demos: rows });
  } catch (error) {
    console.error('Fetch demos error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch demos' });
  }
});

// GET /api/demos/:id - Get a single demo (protected - admin)
app.get('/api/demos/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
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

// GET /api/preview/:token - Public demo preview (shareable with clients)
app.get('/api/preview/:token', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT business_name, page_data FROM generated_demos WHERE share_token = ?', [req.params.token]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Demo not found' });
    }
    res.json({ success: true, demo: rows[0] });
  } catch (error) {
    console.error('Fetch preview error:', error.message);
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

    const systemPrompt = `You are the AI assistant for "Site Former" — a web development agency that builds high-performance websites, AI chatbots, and digital solutions for businesses. 

Key info about Site Former:
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
            from: process.env.EMAIL_FROM || 'Site Former <onboarding@resend.dev>',
            to: [process.env.NOTIFY_EMAIL || 'siteformers@gmail.com'],
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

// PUT /api/demos/:id/portfolio - Toggle portfolio visibility (protected)
app.put('/api/demos/:id/portfolio', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { show_in_portfolio } = req.body;
    await pool.execute('UPDATE generated_demos SET show_in_portfolio = ? WHERE id = ?', [show_in_portfolio ? 1 : 0, req.params.id]);
    res.json({ success: true, message: show_in_portfolio ? 'Added to portfolio' : 'Removed from portfolio' });
  } catch (error) {
    console.error('Toggle portfolio error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update' });
  }
});

// GET /api/portfolio-demos - Public: get demos marked for portfolio
app.get('/api/portfolio-demos', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, share_token, business_name, business_description, business_type, cover_image, page_data, created_at FROM generated_demos WHERE show_in_portfolio = 1 ORDER BY created_at DESC');
    res.json({ success: true, demos: rows });
  } catch (error) {
    console.error('Fetch portfolio demos error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch' });
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
  console.log(`🚀 Site Former API running on http://localhost:${PORT}`);
});

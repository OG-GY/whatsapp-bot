const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const conversations = {}; // stores chat history per user

// Webhook verification (Meta calls this once)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receive messages
app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];
  if (!message || message.type !== 'text') return res.sendStatus(200);

  const userPhone = message.from;
  const userText = message.text.body;

  if (!conversations[userPhone]) {
    conversations[userPhone] = [{ role: 'system', content: getSystemPrompt() }];
  }

  conversations[userPhone].push({ role: 'user', content: userText });
  const reply = await getAIReply(conversations[userPhone]);
  conversations[userPhone].push({ role: 'assistant', content: reply });

  // Keep only last 10 messages
  if (conversations[userPhone].length > 12) {
    conversations[userPhone] = [
      conversations[userPhone][0],
      ...conversations[userPhone].slice(-10)
    ];
  }

  await sendWhatsAppMessage(userPhone, reply);
  res.sendStatus(200);
});

function getSystemPrompt() {
  return `You are a helpful assistant for ${process.env.BUSINESS_NAME}.
  Be friendly, professional, and keep replies under 3 sentences.
  Always greet new customers warmly.`;
}

async function getAIReply(messages) {
  try {
    const res = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model: 'llama3-8b-8192', messages, max_tokens: 300 },
      { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
    );
    return res.data.choices[0].message.content;
  } catch (err) {
    return 'Sorry, I am having trouble right now. Please try again shortly.';
  }
}

async function sendWhatsAppMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
    { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
    { headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
  );
}

app.listen(process.env.PORT, () => console.log(`Bot running on port ${process.env.PORT}`));
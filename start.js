require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const fetch = require('node-fetch');

const client = new Client();
let baseUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_API_URL = baseUrl.endsWith('/api/generate') ? baseUrl : `${baseUrl}/api/generate`;const MODEL = process.env.OLLAMA_MODEL || '';
const MY_TOKEN = process.env.DISCORD_TOKEN;

// Structure to store conversation history by channel
const conversationHistory = new Map();
// Limit of history messages to keep per channel
const HISTORY_LIMIT = parseInt(process.env.HISTORY_LIMIT || '10', 10);
// Initial bot context
const BOT_CONTEXT = process.env.BOT_CONTEXT || "You are a helpful and friendly Discord assistant. Respond concisely and relevantly.";

client.on('ready', () => {
  console.log(`Connected as ${client.user.tag}`);
});

// Listen for incoming messages
client.on('messageCreate', async (message) => {

  if (!message.mentions.has(client.user.id) || message.author.id === client.user.id) return;
  
  try {
    // Get or initialize channel history
    const channelId = message.channel.id;
    if (!conversationHistory.has(channelId)) {
      conversationHistory.set(channelId, []);
    }
    
    const history = conversationHistory.get(channelId);
    
    // Build prompt with context and history
    let fullPrompt = BOT_CONTEXT + "\n\n";
    
    // Add history if available
    if (history.length > 0) {
      fullPrompt += "Previous conversation:\n";
      history.forEach((entry) => {
        fullPrompt += `${entry.author}: ${entry.content}\n`;
      });
      fullPrompt += "\n";
    }
    
    // Add current message
    fullPrompt += `Message you're responding to: ${message.content}`;
    
    // Prepare request to Ollama
    const payload = {
      model: MODEL,
      prompt: fullPrompt,
      stream: false
    };

    const response = await fetch(OLLAMA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    const generatedResponse = data.response;
    
    // Reply in the same channel
    await message.reply(generatedResponse);
    
    // Update history
    history.push({ author: message.author.username, content: message.content });
    history.push({ author: client.user.username, content: generatedResponse });
    
    // Limit history size
    if (history.length > HISTORY_LIMIT * 2) { // *2 because we store question/answer pairs
      history.splice(0, 2); // Delete the oldest question/answer pair
    }
    
  } catch (error) {
    console.error('Error calling Ollama:', error);
  }
});

client.login(MY_TOKEN);
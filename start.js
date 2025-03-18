require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');

// ANSI Color codes for console logs
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m"
};

// Custom logger with colors
const logger = {
  info: (message) => console.log(`${colors.blue}[INFO]${colors.reset} ${message}`),
  success: (message) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`),
  error: (message) => console.error(`${colors.red}[ERROR]${colors.reset} ${message}`),
  warn: (message) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${message}`),
  separator: () => console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}`)
};

const client = new Client();
let baseUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_API_URL = baseUrl.endsWith('/api/generate') ? baseUrl : `${baseUrl}/api/generate`;
const MODEL = process.env.OLLAMA_MODEL || '';
const MY_TOKEN = process.env.DISCORD_TOKEN;

// Discord message character limit
const MESSAGE_CHAR_LIMIT = 2000;

// Structure to store conversation history by channel
const conversationHistory = new Map();
// Limit of history messages to keep per channel
const HISTORY_LIMIT = parseInt(process.env.HISTORY_LIMIT || '10', 10);
// Initial bot context
const BOT_CONTEXT = process.env.BOT_CONTEXT || "You are a helpful and friendly Discord assistant. Respond concisely and relevantly.";

logger.separator();
logger.info('Starting Discord self-bot...');
logger.info(`Ollama API URL: ${OLLAMA_API_URL}`);
logger.info(`Model: ${MODEL || 'Not specified (will use Ollama default)'}`);
logger.info(`History limit: ${HISTORY_LIMIT} messages per channel`);
logger.separator();

client.on('ready', () => {
  logger.success(`Connected as ${client.user.tag}`);
  logger.separator();
});

// Function to format <think> tags as quotes
function formatThinkTags(text) {
  // Check if text contains <think> tags
  if (text.includes('<think>') && text.includes('</think>')) {
    logger.info('Found <think> tags in response, formatting as quotes');
    
    // Replace each <think> block with a quote format
    return text.replace(/<think>([\s\S]*?)<\/think>/g, (match, content) => {
      // Convert the content to quote format by adding > to each line
      const quoteContent = content
        .trim()
        .split('\n')
        .map(line => `> ${line}`)
        .join('\n');
      
      return quoteContent;
    });
  }
  
  return text;
}

// Function to truncate message if it exceeds Discord's character limit
function truncateMessage(message) {
  if (message.length <= MESSAGE_CHAR_LIMIT) {
    return message;
  }
  
  logger.warn(`Message exceeds ${MESSAGE_CHAR_LIMIT} characters, truncating...`);
  return message.substring(0, MESSAGE_CHAR_LIMIT - 3) + '...';
}

// Function to keep showing "typing..." indication during long operations
async function showTypingUntilDone(channel, operation) {
  // Start typing indication
  const typingInterval = setInterval(() => {
    channel.sendTyping().catch(err => {
      logger.error(`Failed to send typing indicator: ${err.message}`);
      clearInterval(typingInterval);
    });
  }, 5000); // Discord typing indicator lasts ~10 seconds, refresh every 5s
  
  logger.info('Started typing indicator');
  
  try {
    // Wait for the operation to complete
    const result = await operation();
    
    // Stop typing indication
    clearInterval(typingInterval);
    logger.info('Stopped typing indicator');
    
    return result;
  } catch (error) {
    // Stop typing indication on error too
    clearInterval(typingInterval);
    logger.info('Stopped typing indicator due to error');
    throw error;
  }
}

// Listen for incoming messages
client.on('messageCreate', async (message) => {

  if (!message.mentions.has(client.user.id) || message.author.id === client.user.id) return;
  
  logger.separator();
  logger.info(`Received mention from ${message.author.username} in channel ${message.channel.name || 'DM'}`);
  logger.info(`Message content: "${message.content}"`);
  
  try {
    // Show typing indicator immediately
    message.channel.sendTyping();
    logger.info('Started typing indicator');
    
    // Get or initialize channel history
    const channelId = message.channel.id;
    if (!conversationHistory.has(channelId)) {
      logger.info(`Initializing new conversation history for channel ${message.channel.name || 'DM'}`);
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

    logger.info(`Sending request to Ollama API with model: ${MODEL || 'default'}`);
    
    // Use the typing indicator function to keep showing "typing..." during API call
    const response = await showTypingUntilDone(message.channel, async () => {
      return await axios.post(OLLAMA_API_URL, payload, {
        headers: { 'Content-Type': 'application/json' }
      });
    });
    
    logger.success(`Received response from Ollama`);
    
    let generatedResponse = response.data.response;
    
    // Format <think> tags as quotes
    generatedResponse = formatThinkTags(generatedResponse);
    
    // Truncate if needed
    generatedResponse = truncateMessage(generatedResponse);
    
    // Reply in the same channel
    logger.info(`Sending reply to channel ${message.channel.name || 'DM'}`);
    await message.reply(generatedResponse);
    
    // Update history
    history.push({ author: message.author.username, content: message.content });
    history.push({ author: client.user.username, content: generatedResponse });
    
    // Limit history size
    if (history.length > HISTORY_LIMIT * 2) { // *2 because we store question/answer pairs
      logger.info(`Trimming conversation history for channel ${message.channel.name || 'DM'}`);
      history.splice(0, 2); // Delete the oldest question/answer pair
    }
    
  } catch (error) {
    logger.error(`Error calling Ollama: ${error.message}`);
    if (error.response) {
      logger.error(`Response status: ${error.response.status}`);
      logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
    }
    await message.reply("Sorry, I encountered an error while processing your request.");
  }
  logger.separator();
});

client.login(MY_TOKEN)
  .then(() => logger.info('Login process started'))
  .catch(err => logger.error(`Failed to login: ${err.message}`));
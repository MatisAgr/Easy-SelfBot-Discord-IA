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
const SHOW_THINKING = (process.env.SHOW_THINKING || 'false').toLowerCase() === 'true';

// Discord message character limit (free accounts)
const MESSAGE_CHAR_LIMIT = 2000;
const lastActivityTime = new Map();
// Durée d'inactivité avant réinitialisation (en ms) - 5 minutes
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;

// Structure to store conversation history by channel
const conversationHistory = new Map();
// Limit of history messages to keep per channel
const HISTORY_LIMIT = parseInt(process.env.HISTORY_LIMIT || '10', 10);
// Initial bot context
const BOT_CONTEXT = process.env.BOT_CONTEXT || "Do what do you want, but be nice and respectful.";

logger.separator();
logger.info('Starting Discord self-bot...');
logger.info(`Ollama API URL: ${OLLAMA_API_URL}`);
logger.info(`Model: ${MODEL || 'Not specified (will use Ollama default)'}`);
logger.info(`History limit: ${HISTORY_LIMIT} messages per channel`);
logger.info(`Show thinking : ${SHOW_THINKING}`);
logger.separator();

client.on('ready', () => {
  logger.success(`Connected as ${client.user.tag}`);
  logger.separator();
});

// Function to check if the bot can send messages in a channel
function canSendMessages(channel) {
  try {
    // For text channels in guilds
    if (channel.guild) {
      const permissions = channel.permissionsFor(client.user.id);
      return permissions && permissions.has('SEND_MESSAGES');
    }
    // For DMs, we assume we can send messages
    return true;
  } catch (error) {
    logger.error(`Error checking permissions: ${error.message}`);
    return false;
  }
}

// Function to format <think> tags as quotes
function formatThinkTags(text) {
  // Check if text contains <think> tags
  if (text.includes('<think>') && text.includes('</think>')) {
    if (SHOW_THINKING) {
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
    } else {
      logger.info('Found <think> tags in response, removing them');

      // Remove each <think> block completely
      return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }
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
  let hasTypingPermission = true;

  const typingInterval = setInterval(() => {
    if (hasTypingPermission) {
      channel.sendTyping().catch(err => {
        if (err.code === 50001) { // Missing Access error code
          logger.warn(`No permission to show typing in channel #${channel.name || 'DM'}`);
          hasTypingPermission = false; // Stop trying to send typing indicators
          clearInterval(typingInterval);
        } else {
          logger.error(`Failed to send typing indicator: ${err.message}`);
          clearInterval(typingInterval);
        }
      });
    }
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



/*******************************/
// Inactivity timeout handling
/*******************************/

function checkInactiveChannels() {
  const currentTime = Date.now();
  
  lastActivityTime.forEach((lastTime, channelId) => {
    // Si plus de 5 minutes se sont écoulées depuis la dernière activité
    if (currentTime - lastTime > INACTIVITY_TIMEOUT) {
      // S'il y a un historique pour ce canal
      if (conversationHistory.has(channelId)) {
        const channelInfo = client.channels.cache.get(channelId);
        const channelName = channelInfo ? (channelInfo.name || 'DM') : 'Unknown channel';
        
        logger.info(`Resetting conversation history for inactive channel #${channelName} (${channelId})`);
        conversationHistory.set(channelId, []); // Réinitialiser l'historique
        lastActivityTime.delete(channelId); // Supprimer l'entrée de temps pour ce canal
      }
    }
  });
}

client.on('ready', () => {
  logger.success(`Connected as ${client.user.tag}`);
  
  // Mettre en place un intervalle pour vérifier régulièrement les canaux inactifs
  setInterval(checkInactiveChannels, 60000); // Vérifier toutes les minutes
  logger.info('Inactivity checker initialized (5 minute timeout)');
  
  logger.separator();
});

// Listen for incoming messages
client.on('messageCreate', async (message) => {

  if (!message.mentions.has(client.user.id) || message.author.id === client.user.id) return;

  // last activity
  const channelId = message.channel.id;
  lastActivityTime.set(channelId, Date.now());


  logger.separator();
  logger.info(`Received mention from ${message.author.username} in channel ${'#' + message.channel.name || 'DM'}`);
  logger.info(`Message content: "${message.content}"`);

  try {
    // Check if the bot has permission to send messages in the channel
    const hasPermission = canSendMessages(message.channel);
    
    // If the bot doesn't have permission, log a warning and exit early
    if (!hasPermission) {
      logger.warn(`No permission to send messages in channel #${message.channel.name || 'DM'} - skipping Ollama API call`);
      logger.separator();
      return; // Exit early to avoid unnecessary API call
    }

    // Show typing indicator
    message.channel.sendTyping().catch(err => {
      if (err.code === 50001) {
        logger.warn(`No permission to show typing in channel #${message.channel.name || 'DM'}`);
      } else {
        logger.error(`Failed to send typing indicator: ${err.message}`);
      }
    });
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
        fullPrompt += `${entry.author} (${entry.author.username}): ${entry.content}\n`;
      });
      fullPrompt += "\n";
    }

    // Add current message
    fullPrompt += `${message.content}`;

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
    lastActivityTime.set(channelId, Date.now());
    let generatedResponse = response.data.response;

    // Format <think> tags as quotes
    generatedResponse = formatThinkTags(generatedResponse);

    // Truncate (if >2000 characters)
    generatedResponse = truncateMessage(generatedResponse);

    if (generatedResponse.length > 200) {
      logger.info(`Generated response: "${generatedResponse.substring(0, 200)}..."`);
    } else {
      logger.info(`Generated response: "${generatedResponse}"`);
    }

    // Reply in the same channel
    try {
      logger.info(`Sending reply to channel ${message.channel.name || 'DM'}`);
      await message.reply(generatedResponse);
    } catch (replyError) {
      if (replyError.code === 50001 || replyError.code === 50013) {
        logger.warn(`Cannot reply in channel #${message.channel.name || 'DM'} due to missing permissions`);
        logger.info(`Generated response that couldn't be delivered: "${generatedResponse.substring(0, 200)}${generatedResponse.length > 200 ? '...' : ''}"`);
      } else {
        throw replyError;
      }
    }

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
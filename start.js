require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const fetch = require('node-fetch');

const client = new Client();
let baseUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_API_URL = baseUrl.endsWith('/api/generate') ? baseUrl : `${baseUrl}/api/generate`;const MODEL = process.env.OLLAMA_MODEL || '';
const MY_TOKEN = process.env.DISCORD_TOKEN;

// Structure pour stocker l'historique des conversations par canal
const conversationHistory = new Map();
// Limite de messages d'historique à conserver par canal
const HISTORY_LIMIT = parseInt(process.env.HISTORY_LIMIT || '10', 10);
// Contexte initial du bot
const BOT_CONTEXT = process.env.BOT_CONTEXT || "Tu es un assistant Discord utile et amical. Réponds de manière concise et pertinente.";

client.on('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

// Sur écoute des messages entrants
client.on('messageCreate', async (message) => {

  if (!message.mentions.has(client.user.id) || message.author.id === client.user.id) return;
  
  try {
    // Récupérer ou initialiser l'historique du canal
    const channelId = message.channel.id;
    if (!conversationHistory.has(channelId)) {
      conversationHistory.set(channelId, []);
    }
    
    const history = conversationHistory.get(channelId);
    
    // Construire le prompt avec contexte et historique
    let fullPrompt = BOT_CONTEXT + "\n\n";
    
    // Ajouter l'historique si disponible
    if (history.length > 0) {
      fullPrompt += "Conversation précédente:\n";
      history.forEach((entry) => {
        fullPrompt += `${entry.author}: ${entry.content}\n`;
      });
      fullPrompt += "\n";
    }
    
    // Ajouter le message actuel
    fullPrompt += `Message auquel tu réponds: ${message.content}`;
    
    // Préparer la requête vers Ollama
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
    
    // Répondre dans le même salon
    await message.reply(generatedResponse);
    
    // Mettre à jour l'historique
    history.push({ author: message.author.username, content: message.content });
    history.push({ author: client.user.username, content: generatedResponse });
    
    // Limiter la taille de l'historique
    if (history.length > HISTORY_LIMIT * 2) { // *2 car on stocke les paires question/réponse
      history.splice(0, 2); // Supprimer la plus ancienne paire question/réponse
    }
    
  } catch (error) {
    console.error('Erreur lors de l\'appel à Ollama :', error);
  }
});

client.login(MY_TOKEN);
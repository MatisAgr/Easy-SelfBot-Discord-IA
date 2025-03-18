# Easy AI SelfBot Discord with Ollama

This project is a Discord bot that uses AI models through Ollama API to generate contextual responses, maintaining conversation history when you're mentioned (@) in messages.

<h3> Preview : </h3>

![image](https://github.com/user-attachments/assets/82f02218-0595-41bf-9963-c0cce5732fa1)


<h3> Console : </h3>

![image](https://github.com/user-attachments/assets/d63ac241-5022-42ab-a4bb-db647e27b178)


---


## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Dependencies](#dependencies)
- [Technologies Used](#technologies-used)

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v20.18 or higher) `(v22.12.0 used for dev)`
- [Ollama](https://ollama.ai/download) - Local AI model runner
- A Discord account and your Discord token ([How to get your Discord token](https://gist.github.com/MarvNC/e601f3603df22f36ebd3102c501116c6))

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/MatisAgr/Easy-SelfBot-Discord-IA.git
   ```
   
2. Navigate to the project folder:
   ```
   cd Easy-SelfBot-Discord-IA
   ```

3. Install dependencies:
   ```
   npm i
   ```

## Configuration

1. Rename the `.env.exemple` file to `.env`.
2. Fill in the environment variables in the `.env` file:
   - `DISCORD_TOKEN`: Your Discord token.
   - `HISTORY_LIMIT`: The number of messages to keep in the conversation history.
   - `OLLAMA_API_URL`: The URL of the Ollama API.
   - `OLLAMA_MODEL`: The name of the model to use with Ollama.
   - `BOT_CONTEXT`: The context for the bot when generating responses.

## Usage

To start the bot, run the following command:
```
node start.js
```

The bot will connect to your Discord account and start listening for messages. It will respond to messages where it's mentioned.

## Dependencies

This project uses the following dependencies:
- `discord.js-selfbot-v13`: To interact with the Discord API.
- `dotenv`: To manage environment variables.
- `axios`: To make HTTP requests to the Ollama API.

## Technologies Used

- **Node.js** - JavaScript runtime
- **Discord.js-selfbot-v13** - Discord API wrapper for user accounts
- **Ollama** - Open-source model runner for LLMs
- **Environment Variables** - For secure configuration management

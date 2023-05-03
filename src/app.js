import dotenv from "dotenv";
import tmi from "tmi.js";

import { Configuration, OpenAIApi } from "openai";

import DBStorage from "./Storage.js";
import Log from "./log.js";

async function main() {
  try {
    dotenv.config();

    // Cooldowns
    let openAIOnCooldown = false;

    // Set up local storage
    const Storage = new DBStorage();

    // Set up chat bot
    const client = new tmi.Client({
      options: {
        debug: false,
        messagesLogLevel: "info",
        skipMembership: true,
        skipUpdatingEmotesets: true,
      },
      connection: {
        reconnect: true,
        secure: true,
        maxReconnectAttempts: 3,
      },
      identity: {
        username: `${process.env.TWITCH_USERNAME}`,
        password: `oauth:${process.env.TWITCH_OAUTH}`,
      },
      channels: [`${process.env.TWITCH_CHANNEL}`],
    });

    // Set up OpenAI endpoint
    const openai = new OpenAIApi(
      new Configuration({
        apiKey: `${process.env.OPENAI_API_KEY}`,
      })
    );

    const processCompletion = async (channel, prompt) => {
      if (openAIOnCooldown) {
        Log.warn(`Skipping prompt, on cooldown`);
        return;
      }
      try {
        openAIOnCooldown = true;

        Log.message(`Processing prompt: '${prompt}'`);
        const completion = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "You are a slightly sarcastic bot. You like calling people silly names and and don't take anything seriously. Try keeping response less then 150 characters. You sometimes end sentences with bttv emotes",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          n: 1,
        });

        const result = completion.data.choices[0].message.content;

        Log.message(`Processed prompt: ${result}`);
        client.say(channel, result);
      } catch (error) {
        Log.error(`Error processing completion: ${error}`);
      } finally {
        openAIOnCooldown = false;
      }
    };

    client.connect();

    client.on("connected", (address, port) => {
      Log.info(
        `[${port}:${address}] Connected to ${
          client.getOptions().channels[0]
        }\n\nListening intently...`
      );
    });

    client.on("connecting", (address, port) => {
      Log.info(
        `[${port}:${address}] Connecting to ${client.getOptions().channels[0]}`
      );
    });

    client.on("message", (channel, tags, message, self) => {
      if (self || !message.startsWith("!")) return;

      const id = tags["user-id"];
      const name = tags["username"];

      if (!id || !name) {
        Log.warn(`skipping message [ID=${id} name=${name}]: ${message}`);
        return;
      }

      const args = message.slice(1).split(" ");
      const command = args.shift().toLowerCase();
      const options = args.join(" ");

      if (command === "query") {
        const MaxCharacters = 350;
        if (message.length > MaxCharacters) {
          Log.warn(
            `Skipping, maximum characters exceeded for request: '${message}'`
          );
        }
        processCompletion(channel, options);
      }
      // Log.message(message);
      // Storage.storeMessage(id, name, message);
    });
  } catch (error) {
    Log.error(`Fatal error: ${error}`);
  } finally {
    // Cleanup
  }
}

main();

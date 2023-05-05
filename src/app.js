import dotenv from "dotenv";
import tmi from "tmi.js";
import fs from "fs";
import path from "path";

import { WebhookClient } from "discord.js";
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

    // Set up discord webhook
    const discord = new WebhookClient({url: `${process.env.DISCORD_WEBHOOK}`});

    const processStarbucks = async (channel) => {
      if (openAIOnCooldown) {
        Log.warn(`Skipping starbucks generation, on cooldown`);
        return;
      }

      client.say(channel, "One kappachino coming right up CoffeeTime");

      try {
        openAIOnCooldown = true;

        const imagePath = path.join("data", "starbucks.png");
        const response = await openai.createImageVariation(fs.createReadStream(imagePath), 1, "1024x1024", "url");
        const url = response.data.data[0].url;

        const discordResponse = await discord.send({
          content: "A picture of a starbucks enjoyer",
          files: [{attachment: url, name: "starbucks.png"}]            
        });
        client.say(channel, `${discordResponse.attachments[0].url}`);
      } catch (error) {
        if (error.response) {
          Log.error(error.response.status);
          Log.error(JSON.stringify(error.response.data));
        } else {
          Log.error(error.message);
        }
      } finally {
        openAIOnCooldown = false;
      }
    };

    const processImage = async (channel, prompt) => {
      if (openAIOnCooldown) {
        Log.warn(`Skipping image prompt, on cooldown`);
        return;
      }

      client.say(channel, "Working gachiBASS");

      try {
        openAIOnCooldown = true;

        const response = await openai.createImage({
          n: 1,
          size: "1024x1024",
          prompt: prompt,
        });

        const url = response.data.data[0].url;
        client.say(channel, `${url}`);
      } catch (error) {
        if (error.response) {
          Log.error(error.response.status);
          Log.error(JSON.stringify(error.response.data));
        } else {
          Log.error(error.message);
        }
      } finally {
        openAIOnCooldown = false;
      }
    };

    const processCompletion = async (channel, prompt) => {
      const MaxCharacters = 350;
      if (prompt.length > MaxCharacters) {
        Log.warn(
          `Skipping, maximum characters exceeded for request: '${prompt}'`
        );
      }

      if (openAIOnCooldown) {
        Log.warn(`Skipping prompt, on cooldown`);
        return;
      }
      try {
        openAIOnCooldown = true;

        const response = await openai.createChatCompletion({
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
        const result = response.data.choices[0].message.content;
        client.say(channel, result);
      } catch (error) {
        if (error.response) {
          Log.error(error.response.status);
          Log.error(JSON.stringify(error.response.data));
        } else {
          Log.error(error.message);
        }
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
      if (self) return;

      const id = tags["user-id"];
      const name = tags["username"];

      if (!id || !name) {
        Log.warn(`skipping message [ID=${id} name=${name}]: ${message}`);
        return;
      }

      // ID of the AMA redemption
      const ID_Query = "2fbb0ed1-e56f-4229-ac52-37b44ad0b239";

      if (tags["custom-reward-id"] === ID_Query) {
        const imagePrefix = "imagine ";
        if (message.toLowerCase().startsWith(imagePrefix) && tags.mod) {
          processImage(channel, message.substring(imagePrefix.length).trim());
        } else {
          processCompletion(channel, message);
        }
        return;
      }

      if (!message.startsWith("!")) {
        // Log any messages which aren't commands
        Storage.storeMessage(id, name, message);
      }

      // Parse commmand and options
      const args = message.slice(1).split(" ");
      const command = args.shift().toLowerCase();
      const options = args.join(" ");

      // Gets a message from the user (if any)
      if (command === "quote") {
        const messages = Storage.getMessagesForUser(id);
        // Don't start quoting until they've spoken at least a little bit
        const MinMessages = 20;
        if (messages.length > MinMessages) {
          // TODO: Add support to search to find a user by their ID.
          // GET https://api.twitch.tv/helix/users?login=<username>
          const targetName = name;
          client.say(
            `@${targetName} once said "${
              messages[Math.floor(Math.random() * messages.length)]
            }"`
          );
        } else {
          client.say(`@${name} Not yet PepePoint`);
        }
      }
      else if (command === "starbucks") {
        processStarbucks(channel);
      }
    });
  } catch (error) {
    Log.error(`Fatal error: ${error}`);
  } finally {
    // Cleanup
  }
}
main();

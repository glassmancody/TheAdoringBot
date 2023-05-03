import dotenv from "dotenv";
import tmi from "tmi.js";

import { Configuration, CreateImageRequestSizeEnum, OpenAIApi } from "openai";

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

    const processImage = async (channel, prompt) => {
      if (openAIOnCooldown) {
        Log.warn(`Skipping image prompt, on cooldown`);
        return;
      }

      client.say(channel, "Working gachiBASS");

      try {
        openAIOnCooldown = true;

        prompt = `Draw this as an artist with 20 years of experience and super realistic. Draw in the style of a unique Balenciaga piece for a runway show. ${prompt}`;

        const response = await openai.createImage({
          n: 1,
          size: "256x256",
          prompt: prompt,
        });

        const url = response.data.data[0].url;
        client.say(channel, `${url}`);
      } catch (error) {
        if (error.response) {
          Log.error(error.response.status);
          Log.error(error.response.data);
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
          Log.error(error.response.data);
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

      const ID_Query = "2fbb0ed1-e56f-4229-ac52-37b44ad0b239";

      if (tags["custom-reward-id"] === ID_Query) {
        const imagePrefix = "imagine ";
        if (message.toLowerCase().startsWith(imagePrefix)) {
          processImage(channel, message.substring(imagePrefix.length).trim());
        } else {
          processCompletion(channel, message);
        }
        return;
      }

      if (!message.startsWith("!")) return;

      const id = tags["user-id"];
      const name = tags["username"];

      if (!id || !name) {
        Log.warn(`skipping message [ID=${id} name=${name}]: ${message}`);
        return;
      }

      // const args = message.slice(1).split(" ");
      // const command = args.shift().toLowerCase();
      // const options = args.join(" ");

      // if (command === "query") {
      //   processCompletion(channel, options);
      // }
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

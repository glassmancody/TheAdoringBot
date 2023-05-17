import dotenv from "dotenv";
import tmi from "tmi.js";
import fs from "fs";
import path from "path";

import { WebhookClient } from "discord.js";
import { Configuration, OpenAIApi } from "openai";

import DBStorage from "./Storage.js";
import Log from "./Log.js";

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
    const discord = new WebhookClient({
      url: `${process.env.DISCORD_WEBHOOK}`,
    });

    const processStarbucks = async (channel) => {
      if (openAIOnCooldown) {
        Log.warn(`Skipping starbucks generation, on cooldown`);
        return;
      }

      client.say(channel, "One kappachino coming right up CoffeeTime");

      try {
        openAIOnCooldown = true;

        const imagePath = path.join("data", "starbucks.png");
        const response = await openai.createImageVariation(
          fs.createReadStream(imagePath),
          1,
          "1024x1024",
          "url"
        );
        const url = response.data.data[0].url;

        const discordResponse = await discord.send({
          content: "A picture of a starbucks enjoyer",
          files: [{ attachment: url, name: "starbucks.png" }],
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

        const discordResponse = await discord.send({
          files: [{ attachment: url, name: "generation.png" }],
        });

        client.say(channel, `${discordResponse.attachments[0].url}`);
      } catch (error) {
        if (error.response) {
          const status = error.response.status;
          Log.error(status);
          Log.error(JSON.stringify(error.response.data));

          if (status === 400) {
            client.say(channel, "Sorry I can't do that :)");
          } else if (status == 429) {
            client.say(
              channel,
              "I'm overloaded now, try again later WeirdDude"
            );
          }
        } else {
          Log.error(error.message);
        }
      } finally {
        openAIOnCooldown = false;
      }
    };

    const processCompletion = async (channel, prompt) => {
      if (openAIOnCooldown) {
        Log.warn(`Skipping prompt, on cooldown`);
        return;
      }
      try {
        openAIOnCooldown = true;

        const response = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          max_tokens: 120,
          messages: [
            {
              role: "system",
              content:
                "You are a slightly sarcastic bot. You like calling people silly names and and don't take anything seriously. Try keeping response less then 150 characters. You sometimes end sentences with bttv emotes. You joke about subbing to twitch prime randomly, but it makes sense in context and is not just totally random. You love tortellini, but incorporate this in a few responses. I tend not to be too wordy, I keep things very short. You really love talking in puns!",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          n: 1,
        });
        let result = response.data.choices[0].message.content;
        result = result.replace("Kappa.", "Kappa ");
        client.say(channel, result);
      } catch (error) {
        if (error.response) {
          const status = error.response.status;

          Log.error(status);
          Log.error(JSON.stringify(error.response.data));

          if (status === 400) {
            client.say(channel, "Sorry I can't do that :)");
          } else if (status == 429) {
            client.say(
              channel,
              "I'm overloaded now, try again later WeirdDude"
            );
          }
        } else {
          Log.error(error.message);
        }
      } finally {
        openAIOnCooldown = false;
      }
    };

    const processImpersonationCompletion = async (channel, messages) => {
      if (openAIOnCooldown) {
        Log.warn(`Skipping prompt, on cooldown`);
        return;
      }

      const prompt = `Your responses are very short and never longer then a sentence. Please generate a short and coherent response that impersonates their style based on the following random sample of their messages.
      
${messages.map((item, i) => `${i + 1}. ${item}`).join("\n")}

Impersonate the user's style and provide a single concise response. Train on all the samples, but return exactly one response. Don't use quotations or commas or periods.
`;

      try {
        openAIOnCooldown = true;

        const response = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "Your job is to impersonate someone in a chat channel. You treat input as training data and respond with a short sentence impersonating that person. When you receive inappropriate training data you replace the inappropriate words with synonyms. You never fail to respond with an impersonation.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          n: 1,
        });
        let result = response.data.choices[0].message.content;
        client.say(channel, result);
      } catch (error) {
        if (error.response) {
          const status = error.response.status;
          Log.error(status);
          Log.error(JSON.stringify(error.response.data));

          if (status === 400) {
            client.say(channel, "Sorry I can't do that :)");
          } else if (status == 429) {
            client.say(
              channel,
              "I'm overloaded now, try again later WeirdDude"
            );
          }
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
      if (self || !message) return;

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
        if (message.toLowerCase().startsWith(imagePrefix)) {
          processImage(channel, message.substring(imagePrefix.length).trim());
        } else {
          processCompletion(channel, message);
        }
        return;
      }

      if (!message.startsWith("!")) {
        // Log any messages which aren't commands
        Storage.storeMessage(id, name, message);
        return;
      }

      // Parse commmand and options
      const args = message.slice(1).split(" ");
      const command = args.shift().toLowerCase();
      const options = args.join(" ");

      // Gets a message from the user (if any)
      if (command === "impersonate") {
        const id = Storage.getIdFromName(args[0]);
        if (!id) {
          client.say(channel, `@${name} Who? StrangeDude`);
          return;
        }

        const messages = Storage.getMessagesForUser(id);
        const N = 100;
        if (messages.length > N) {
          const samples = new Array(N);
          let len = messages.length;
          let taken = new Array(len);
          let n = N;
          while (n--) {
            const x = Math.floor(Math.random() * len);
            samples[n] = messages[x in taken ? taken[x] : x];
            taken[x] = --len in taken ? taken[len] : len;
          }
          processImpersonationCompletion(channel, samples);
        } else {
          client.say(channel, `@${name} Not yet PepePoint`);
        }
      }
    });
  } catch (error) {
    Log.error(`Fatal error: ${error}`);
  } finally {
    // Cleanup
  }
}
main();

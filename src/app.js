import dotenv from "dotenv";
import tmi from "tmi.js";
import fs from "fs";
import path from "path";

import { WebhookClient } from "discord.js";
import { Configuration, OpenAIApi } from "openai";
import Canvas from "canvas";

import DBStorage from "./Storage.js";
import Log from "./Log.js";

const GPT_MODEL="gpt-4";

async function main() {
  try {
    dotenv.config();

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

    const processImage = async (channel, prompt, name) => {
      client.say(channel, "Working gachiBASS");

      try {
        const size = 512;
        const response = await openai.createImage({
          n: 4,
          size: `${size}x${size}`,
          prompt: prompt,
        });

        const canvas = Canvas.createCanvas(size * 2, size * 2);
        const ctx = canvas.getContext("2d");

        // Stich together all 4 images so we can show in a single preview
        for (const [i, pos] of Object.entries([
          [0, 0],
          [0, size],
          [size, 0],
          [size, size],
        ])) {
          const image = await Canvas.loadImage(response.data.data[i].url);
          ctx.drawImage(image, pos[0], pos[1], image.width, image.height);
        }

        const discordResponse = await discord.send({
          content: `${name} > *${prompt}*`,
          files: [
            {
              attachment: canvas.toBuffer("image/png"),
              name: "generation.png",
            },
          ],
          avatarURL:
            "https://media.discordapp.net/attachments/1103778509844918315/1108865205204684831/avatar.png?width=256&height=256",
          threadId: "1108857001250922536",
          username: "Dagoth Daddy",
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
      }
    };

    const processCompletion = async (channel, prompt) => {
      try {
        const response = await openai.createChatCompletion({
          model: GPT_MODEL,
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
      }
    };

    const processImpersonationCompletion = async (
      channel,
      messages,
      username
    ) => {
      const prompt = `Your responses are very short and never longer then a sentence. Please generate a short and coherent response that impersonates their style based on the following random sample of their messages.
      
${messages.map((item, i) => `${i + 1}. ${item}`).join("\n")}

Impersonate the user's style and provide a single concise response. Train on all the samples, but return exactly one response. Don't use quotations. It is very important the response is short and makes a little sense.
`;

      try {
        const response = await openai.createChatCompletion({
          model: GPT_MODEL,
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
        client.say(channel, `${username}: ${result}`);
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
          processImage(
            channel,
            message.substring(imagePrefix.length).trim(),
            name
          );
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
      if (command === "impersonate" && false) {
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
          processImpersonationCompletion(channel, samples, args[0]);
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

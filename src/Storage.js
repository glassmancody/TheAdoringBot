import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import path from "path";

export default class DBStorage {
  constructor() {
    const fileName = path.join("data", "db.json");
    this.db = new LowSync(new JSONFileSync(fileName), { users: {} });
    this.db.read();
  }

  getMessagesForUser(id) {
    return this.db.data.users?.[id]?.messages ?? [];
  }

  storeMessage(id, name, message) {
    // Assign default object if user was never added
    this.db.data.users[id] ??= {
      aliases: [],
      messages: [],
    };

    // Store the new message
    this.db.data.users[id].messages.push(message);

    // Store the username if it hasn't been tracked yet
    if (!this.db.data.users[id].aliases.find((a) => a === name)) {
      this.db.data.users[id].aliases.push(name);
    }

    // Update the database
    this.db.write();
  }
}

import dns from "node:dns";
import dotenv from "dotenv";

dns.setServers(["1.1.1.1", "8.8.8.8"]);

import { connectToDatabase } from "./config/db";
import { createHttpServer } from "./serverFactory";

dotenv.config();

const port = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    await connectToDatabase();
    const server = createHttpServer();

    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

void startServer();

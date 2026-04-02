import cors from "cors";
import express from "express";

import authRoutes from "./routes/authRoutes";
import pollRoutes from "./routes/pollRoutes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ message: "Server is healthy" });
});

app.use("/auth", authRoutes);
app.use("/polls", pollRoutes);

export default app;

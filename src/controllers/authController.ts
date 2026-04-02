import type { Request, Response } from "express";

import { createAuthToken, hashPassword, verifyPassword } from "../lib/auth";
import { User } from "../models/User";

function sanitizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatAuthResponse(user: { _id: { toString(): string }; name: string; email: string; authToken: string }) {
  return {
    token: user.authToken,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    },
  };
}

export async function registerUser(req: Request, res: Response) {
  try {
    const name = sanitizeText(req.body.name);
    const email = sanitizeEmail(req.body.email);
    const password = sanitizeText(req.body.password);

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existingUser = await User.findOne({ email }).lean();

    if (existingUser) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const authToken = createAuthToken();
    const user = await User.create({
      name,
      email,
      passwordHash: hashPassword(password),
      authToken,
    });

    return res.status(201).json(formatAuthResponse(user));
  } catch (error) {
    console.error("Failed to register user", error);
    return res.status(500).json({ message: "Failed to register user" });
  }
}

export async function loginUser(req: Request, res: Response) {
  try {
    const email = sanitizeEmail(req.body.email);
    const password = sanitizeText(req.body.password);

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    user.authToken = createAuthToken();
    await user.save();

    return res.status(200).json(formatAuthResponse(user));
  } catch (error) {
    console.error("Failed to login user", error);
    return res.status(500).json({ message: "Failed to login user" });
  }
}

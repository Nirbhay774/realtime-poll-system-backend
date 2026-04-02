import type { NextFunction, Request, Response } from "express";

import { getBearerToken } from "../lib/auth";
import { User } from "../models/User";

export type AuthenticatedRequest = Request & {
  user: {
    id: string;
    name: string;
    email: string;
  };
};

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req.header("authorization"));

    if (!token) {
      return res.status(401).json({ message: "Please login to continue" });
    }

    const user = await User.findOne({ authToken: token }).lean();

    if (!user) {
      return res.status(401).json({ message: "Your session is no longer valid" });
    }

    (req as AuthenticatedRequest).user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    };

    return next();
  } catch (error) {
    console.error("Failed to authenticate request", error);
    return res.status(500).json({ message: "Failed to authenticate request" });
  }
}

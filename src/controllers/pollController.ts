import type { Request, Response } from "express";
import mongoose from "mongoose";

import { Poll } from "../models/Poll";
import { VoteRecord } from "../models/VoteRecord";
import { broadcastToChannel } from "../realtime/websocketServer";
import type { AuthenticatedRequest } from "../middleware/requireAuth";

type PollResponse = {
  id: string;
  createdBy: string;
  createdByName: string;
  question: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  totalVotes: number;
  hasVoted?: boolean;
  isExpired: boolean;
  options: Array<{
    id: string;
    label: string;
    votes: number;
  }>;
};

function mapPollToResponse(poll: {
  _id: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  question: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  isExpired: boolean;
  options: Array<{ label: string; votes: number }>;
}, hasVoted = false): PollResponse {
  const options = poll.options.map((option, index) => ({
    id: `option-${index + 1}`,
    label: option.label,
    votes: option.votes,
  }));

  return {
    id: poll._id.toString(),
    createdBy: poll.createdBy?.toString() ?? "unknown",
    createdByName: poll.createdByName ?? "Anonymous",
    question: poll.question,
    description: poll.description,
    createdAt: poll.createdAt.toISOString(),
    updatedAt: poll.updatedAt.toISOString(),
    totalVotes: options.reduce((sum, option) => sum + option.votes, 0),
    hasVoted,
    isExpired: Boolean(poll.isExpired),
    options,
  };
}

function getVoterToken(req: Request) {
  const headerValue = req.header("x-voter-token");
  const bodyValue = typeof req.body?.voterToken === "string" ? req.body.voterToken : "";
  return (headerValue ?? bodyValue).trim();
}

async function hasExistingVote(pollId: string, voterToken: string) {
  if (!voterToken) {
    return false;
  }

  const existingVote = await VoteRecord.exists({
    pollId,
    voterToken,
  });

  return Boolean(existingVote);
}

function sanitizeOptions(options: unknown) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .filter((option): option is string => typeof option === "string")
    .map((option) => option.trim())
    .filter(Boolean);
}

export async function createPoll(req: Request, res: Response) {
  try {
    const authenticatedRequest = req as AuthenticatedRequest;
    const question = typeof req.body.question === "string" ? req.body.question.trim() : "";
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    const options = sanitizeOptions(req.body.options);

    if (!question) {
      return res.status(400).json({ message: "Question is required" });
    }

    if (options.length < 2) {
      return res.status(400).json({ message: "At least two options are required" });
    }

    const poll = await Poll.create({
      createdBy: authenticatedRequest.user.id,
      createdByName: authenticatedRequest.user.name,
      question,
      description,
      options: options.map((option) => ({
        label: option,
        votes: 0,
      })),
    });

    return res.status(201).json(mapPollToResponse(poll));
  } catch (error) {
    console.error("Failed to create poll", error);
    return res.status(500).json({ message: "Failed to create poll" });
  }
}

export async function getPollById(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const voterToken = getVoterToken(req);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid poll id" });
    }

    const poll = await Poll.findById(id).lean();

    if (!poll) {
      return res.status(404).json({ message: "Poll not found" });
    }

    const hasVoted = await hasExistingVote(id, voterToken);

    return res.status(200).json(mapPollToResponse(poll, hasVoted));
  } catch (error) {
    console.error("Failed to fetch poll", error);
    return res.status(500).json({ message: "Failed to fetch poll" });
  }
}

export async function listPolls(_req: Request, res: Response) {
  try {
    const polls = await Poll.find().sort({ createdAt: -1 }).lean();

    return res.status(200).json(polls.map((poll: Parameters<typeof mapPollToResponse>[0]) => mapPollToResponse(poll)));
  } catch (error) {
    console.error("Failed to list polls", error);
    return res.status(500).json({ message: "Failed to list polls" });
  }
}

export async function voteOnPoll(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { optionId } = req.body;
    const voterToken = getVoterToken(req);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid poll id" });
    }

    if (typeof optionId !== "string" || !optionId.startsWith("option-")) {
      return res.status(400).json({ message: "Invalid optionId" });
    }

    if (!voterToken) {
      return res.status(400).json({ message: "voterToken is required" });
    }

    const optionIndex = parseInt(optionId.split("-")[1], 10) - 1;

    const poll = await Poll.findById(id);

    if (!poll) {
      return res.status(404).json({ message: "Poll not found" });
    }

    if (poll.isExpired) {
      return res.status(400).json({ message: "This poll has expired and no longer accepts votes." });
    }

    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      return res.status(400).json({ message: "Option index out of bounds" });
    }

    const existingVote = await VoteRecord.exists({
      pollId: poll._id,
      voterToken,
    });

    if (existingVote) {
      return res.status(409).json({ message: "You already voted on this poll from this browser." });
    }

    poll.options[optionIndex].votes += 1;
    await poll.save();
    await VoteRecord.create({
      pollId: poll._id,
      voterToken,
      optionId,
    });

    const response = mapPollToResponse(poll, true);

    broadcastToChannel(`poll:${id}`, {
      type: "poll.updated",
      payload: response,
    });
    broadcastToChannel("poll-list", {
      type: "poll-list.updated",
      payload: {
        id: response.id,
        totalVotes: response.totalVotes,
        updatedAt: response.updatedAt,
      },
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error("Failed to vote on poll", error);
    return res.status(500).json({ message: "Failed to vote on poll" });
  }
}

export async function expirePoll(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const authenticatedRequest = req as AuthenticatedRequest;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid poll id" });
    }

    const poll = await Poll.findById(id);

    if (!poll) {
      return res.status(404).json({ message: "Poll not found" });
    }

    if (poll.createdBy.toString() !== authenticatedRequest.user.id) {
      return res.status(403).json({ message: "Only the creator can expire this poll" });
    }

    if (poll.isExpired) {
      return res.status(400).json({ message: "Poll is already expired" });
    }

    poll.isExpired = true;
    await poll.save();

    const response = mapPollToResponse(poll);

    broadcastToChannel(`poll:${id}`, {
      type: "poll.updated",
      payload: response,
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error("Failed to expire poll", error);
    return res.status(500).json({ message: "Failed to expire poll" });
  }
}

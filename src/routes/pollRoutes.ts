import { Router } from "express";

import { createPoll, expirePoll, getPollById, listPolls, voteOnPoll } from "../controllers/pollController";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.post("/", requireAuth, createPoll);
router.get("/", listPolls);
router.get("/:id", getPollById);
router.post("/:id/vote", voteOnPoll);
router.post("/:id/expire", requireAuth, expirePoll);

export default router;

import { model, Schema } from "mongoose";

const voteRecordSchema = new Schema(
  {
    pollId: {
      type: Schema.Types.ObjectId,
      ref: "Poll",
      required: true,
    },
    voterToken: {
      type: String,
      required: true,
      trim: true,
    },
    optionId: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

voteRecordSchema.index({ pollId: 1, voterToken: 1 }, { unique: true });

export const VoteRecord = model("VoteRecord", voteRecordSchema);

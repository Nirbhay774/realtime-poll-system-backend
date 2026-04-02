import { model, Schema, type InferSchemaType } from "mongoose";

const pollOptionSchema = new Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    votes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    _id: false,
  },
);

const pollSchema = new Schema(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdByName: {
      type: String,
      required: true,
      trim: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    options: {
      type: [pollOptionSchema],
      required: true,
      validate: {
        validator: (options: Array<{ label: string; votes: number }>) => options.length >= 2,
        message: "A poll must have at least two options",
      },
    },
    isExpired: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export type PollDocument = InferSchemaType<typeof pollSchema>;

export const Poll = model("Poll", pollSchema);

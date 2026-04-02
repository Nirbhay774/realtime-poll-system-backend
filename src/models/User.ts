import { model, Schema } from "mongoose";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    authToken: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ authToken: 1 }, { unique: true, sparse: true });

export const User = model("User", userSchema);

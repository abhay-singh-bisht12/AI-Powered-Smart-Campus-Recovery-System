import mongoose from "mongoose";

const claimRequestSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true
    },
    itemTitle: {
      type: String,
      default: "-"
    },
    itemCategory: {
      type: String,
      default: "-"
    },
    reason: {
      type: String,
      required: true
    },
    requesterName: {
      type: String,
      default: "Student"
    },
    requesterEmail: {
      type: String,
      required: true,
      lowercase: true
    },
    requesterPhone: {
      type: String,
      default: "-"
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    }
  },
  { timestamps: true }
);

export const ClaimRequest = mongoose.model("ClaimRequest", claimRequestSchema);
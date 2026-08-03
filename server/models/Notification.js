import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipientEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    type: {
      type: String,
      default: "general",
      trim: true,
      maxlength: 50
    },
    claimId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

notificationSchema.index({
  recipientEmail: 1,
  createdAt: -1
});

export const Notification =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);

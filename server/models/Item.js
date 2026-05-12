import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    location: {
      type: String,
      required: true,
      trim: true
    },
    date: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ["lost", "found"],
      required: true
    },
    category: {
      type: String,
      required: true,
      trim: true
    },

    contactName: {
      type: String,
      default: "",
      trim: true
    },
    contactPhone: {
      type: String,
      default: "",
      trim: true
    },
    contactEmail: {
      type: String,
      default: "",
      trim: true
    },

    // For now image is saved as Base64 string
    // Later you can replace this with Cloudinary URL
    image: {
      type: String,
      default: ""
    },

    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },
    status: {
      type: String,
      enum: ["active", "claimed"],
      default: "active"
    },

    createdBy: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },

    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
      }
    }
  }
);

export const Item =
  mongoose.models.Item || mongoose.model("Item", itemSchema);
import mongoose from "mongoose";

const claimRequestSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    itemTitle: { type: String, default: "-", trim: true },
    itemCategory: { type: String, default: "-", trim: true },
    reason: { type: String, required: true, trim: true, minlength: 30, maxlength: 1200 },
    lostDate: { type: String, required: true, trim: true },
    lostLocation: { type: String, required: true, trim: true, maxlength: 160 },
    brand: { type: String, default: "", trim: true, maxlength: 100 },
    color: { type: String, default: "", trim: true, maxlength: 60 },
    approximateValue: { type: Number, default: null, min: 0, max: 10000000 },
    lastUsedLocation: { type: String, default: "", trim: true, maxlength: 160 },
    uniqueMarks: { type: String, required: true, trim: true, minlength: 10, maxlength: 600 },
    additionalInfo: { type: String, default: "", trim: true, maxlength: 600 },
    declarationAccepted: {
      type: Boolean,
      required: true,
      validate: {
        validator(value) {
          return value === true;
        },
        message: "Truthful-information declaration is required"
      }
    },
    requesterName: { type: String, default: "Student", trim: true },
    requesterEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    requesterPhone: { type: String, default: "-", trim: true },
    requesterRollNo: { type: String, default: "-", trim: true },
    requesterBranch: { type: String, default: "-", trim: true },
    trustScore: { type: Number, min: 0, max: 100, default: 0 },
    riskLevel: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    aiRecommendation: { type: String, default: "Manual review required", trim: true, maxlength: 300 },
    aiReasons: { type: [String], default: [] },
    aiVerificationSource: {
      type: String,
      enum: ["groq_plus_rules", "rule_based_fallback"],
      default: "rule_based_fallback"
    },
    claimFingerprint: { type: String, required: true, index: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.claimFingerprint;
      }
    }
  }
);

claimRequestSchema.index(
  { itemId: 1, requesterEmail: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["pending", "approved"] } }
  }
);

export const ClaimRequest =
  mongoose.models.ClaimRequest || mongoose.model("ClaimRequest", claimRequestSchema);

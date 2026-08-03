import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: ["student", "admin"],
      default: "student"
    },

    // ================= STUDENT PROFILE =================

    studentName: {
      type: String,
      default: ""
    },

    studentPhone: {
      type: String,
      default: ""
    },

    studentBranch: {
      type: String,
      default: ""
    },

    studentRollNo: {
      type: String,
      default: ""
    },

    // ================= PASSWORD RESET OTP =================

    /*
      Is field mein plain OTP store nahi hoga.
      OTP ka hashed version store hoga.
    */
    resetPasswordToken: {
      type: String,
      default: ""
    },

    /*
      OTP kitne time tak valid rahega.
    */
    resetPasswordExpires: {
      type: Date,
      default: null
    },

    /*
      OTP successfully verify hua ya nahi.
    */
    resetPasswordVerified: {
      type: Boolean,
      default: false
    },

    /*
      Last OTP kab send hua tha.
      Isse baar-baar OTP send karne se rokenge.
    */
    resetPasswordLastSentAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,

    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);

        delete ret._id;
        delete ret.__v;

        // Sensitive fields frontend par kabhi nahi jayenge
        delete ret.password;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        delete ret.resetPasswordVerified;
        delete ret.resetPasswordLastSentAt;
      }
    }
  }
);

// ================= PASSWORD HASH =================

userSchema.pre("save", async function (next) {
  try {
    /*
      Password change nahi hua hai to dobara hash nahi karna.
    */
    if (!this.isModified("password")) {
      return next();
    }

    const salt = await bcrypt.genSalt(10);

    this.password = await bcrypt.hash(this.password, salt);

    next();
  } catch (error) {
    next(error);
  }
});

// ================= PASSWORD COMPARISON =================

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ================= USER MODEL =================

export const User =
  mongoose.models.User || mongoose.model("User", userSchema);
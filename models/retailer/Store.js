import mongoose from "mongoose";

const storeSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true, trim: true },

        /** Optional free‑text location info */
        description: { type: String },

        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
        },
        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
);

// Ensure unique rack names within a company
storeSchema.index({ name: 1, company: 1 }, { unique: true });
export default mongoose.model("Store", storeSchema);

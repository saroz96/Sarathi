import mongoose from "mongoose";

const rackSchema = new mongoose.Schema(
    {
        /** Visible label on the shelf, e.g. “A‑01” */
        name: { type: String, required: true },

        /** Optional free‑text location info */
        description: { type: String },

        /** If you have multiple stores / floors */
        store: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Store',
        },
        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
        },
        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
);

// Ensure unique rack names within a company
rackSchema.index({ name: 1, company: 1 }, { unique: true });

export default mongoose.model("Rack", rackSchema);

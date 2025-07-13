const mongoose = require('mongoose');

const compositionSchema = new mongoose.Schema({
    name: String,
    uniqueNumber: {
        type: Number,
        unique: true
    }, // 4-digit unique item number
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
});
//This means each company can have composition with the same name, but composition names must be unique within a company.
compositionSchema.index({ name: 1, company: 1 }, { unique: true });

// Pre-save hook to generate a unique 4-digit number for each item
compositionSchema.pre('save', async function (next) {
    if (!this.uniqueNumber) {
        let isUnique = false;
        while (!isUnique) {
            // Generate a random 4-digit number
            const randomNum = Math.floor(1000 + Math.random() * 9000); // Generates a 4-digit number

            // Check if this number is already in use
            const existingComposition = await mongoose.model('Composition').findOne({ uniqueNumber: randomNum });
            if (!existingComposition) {
                // If the number is unique, assign it to the item
                this.uniqueNumber = randomNum;
                isUnique = true;
            }
        }
    }
    next();
});
//---------------------------------------------------------------------------------------------------------------

module.exports = mongoose.model('Composition', compositionSchema);
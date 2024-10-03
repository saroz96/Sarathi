const mongoose = require('mongoose');

const unitSchema = new mongoose.Schema({
    name: String,
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    }
});
//This means each company can have accounts with the same name, but account names must be unique within a company.
unitSchema.index({ name: 1, company: 1 }, { unique: true });
//---------------------------------------------------------------------------------------------------------------

module.exports = mongoose.model('Unit', unitSchema);
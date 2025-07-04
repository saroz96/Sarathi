const mongoose = require('mongoose');

const itemsCompanySchema = new mongoose.Schema({
    name: String,
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
    }
});
//This means each company can have itemsCompanySchema with the same name, but account names must be unique within a company.
itemsCompanySchema.index({ name: 1, company: 1 }, { unique: true });
//---------------------------------------------------------------------------------------------------------------

module.exports = mongoose.model('itemsCompany', itemsCompanySchema);
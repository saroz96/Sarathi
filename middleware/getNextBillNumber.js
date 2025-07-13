const BillCounter = require('../models/retailer/billCounter'); // Assuming the schema is saved in models/BillCounter
const FiscalYear = require('../models/FiscalYear');

async function getNextBillNumber(companyId, fiscalYearId, transactionType, session) {
    try {
        // Validate transaction types
        const validTypes = ['sales','salesQuotation', 'salesReturn', 'purchase', 'purchaseReturn',
            'payment', 'receipt', 'stockAdjustment', 'debitNote', 'creditNote', 'journalVoucher'];
        if (!validTypes.includes(transactionType)) {
            throw new Error(`Invalid transaction type: ${transactionType}`);
        }

        const fiscalYear = await FiscalYear.findById(fiscalYearId).lean();
        if (!fiscalYear) throw new Error('Fiscal year not found');

        // Get prefix with case-insensitive fallback
        const prefix = fiscalYear.billPrefixes[transactionType];
        if (!prefix || !/^[A-Z]{4}$/.test(prefix)) {
            throw new Error(`Invalid prefix for ${transactionType}`);
        }

        // Atomic increment operation
        const counter = await BillCounter.findOneAndUpdate(
            {
                company: companyId,
                fiscalYear: fiscalYearId,
                transactionType: transactionType
            },
            { $inc: { currentBillNumber: 1 } },
            { new: true, upsert: true, session }
        );

        // Format with leading zeros
        return `${prefix}${counter.currentBillNumber.toString().padStart(7, '0')}`;
    } catch (error) {
        console.error("Bill number generation failed:", error);
        throw error;
    }
}
module.exports = {
    getNextBillNumber
};

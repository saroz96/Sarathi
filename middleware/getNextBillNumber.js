const BillCounter = require('../models/retailer/billCounter'); // Assuming the schema is saved in models/BillCounter
const FiscalYear = require('../models/retailer/FiscalYear');

// async function getNextBillNumber(companyId, fiscalYearId, transactionType) {
//     let billCounter;
//     try {
//         // Check if there is an existing bill counter for the given company, fiscal year, and transaction type
//         billCounter = await BillCounter.findOne({
//             company: companyId,
//             fiscalYear: fiscalYearId,
//             transactionType: transactionType
//         });

//         if (!billCounter) {
//             // If no counter exists, create a new one with the first bill number
//             billCounter = new BillCounter({
//                 company: companyId,
//                 fiscalYear: fiscalYearId,
//                 transactionType: transactionType,
//                 currentBillNumber: 1 // Start at 1 for the new fiscal year
//             });
//         } else {
//             // Increment the current bill number
//             billCounter.currentBillNumber += 1;
//         }

//         // Save the updated bill counter
//         await billCounter.save();
//         console.log('Bill Count:', billCounter);
//         // Return the current bill number
//         return billCounter.currentBillNumber;
//     } catch (error) {
//         console.error("Error in getting next bill number: ", error);
//         if (billCounter && billCounter.isNew) {
//             // If this is a new counter and it failed, delete the counter to prevent creating an invalid one
//             await BillCounter.deleteOne({ _id: billCounter._id });
//         }
//         throw new Error("Unable to generate bill number");
//     }
// }

async function getNextBillNumber(companyId, fiscalYearId, transactionType) {
    try {
        // Validate transaction types
        const validTypes = ['sales', 'salesReturn', 'purchase', 'purchaseReturn',
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
            { new: true, upsert: true }
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

const express = require('express');
const router = express.Router();

const Account = require('../../models/retailer/Account');
const Transaction = require('../../models/retailer/Transaction');
const FiscalYear = require('../../models/FiscalYear');
const Company = require('../../models/Company');
const NepaliDate = require('nepali-date');
const { ensureCompanySelected, ensureAuthenticated, isLoggedIn } = require('../../middleware/auth');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const { ensureTradeType } = require('../../middleware/tradeType');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const CompanyGroup = require('../../models/retailer/CompanyGroup');
const SalesBill = require('../../models/retailer/SalesBill');
const SalesReturn = require('../../models/retailer/SalesReturn');
const Payment = require('../../models/retailer/Payment');
const Receipt = require('../../models/retailer/Receipt');
const CreditNote = require('../../models/retailer/CreditNote');

// Ageing Receivables/Payables Report
router.get('/ageing-all/accounts', isLoggedIn, async (req, res) => {
    try {
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const currentCompany = await Company.findById(companyId);
        const today = new Date();
        const nepaliDate = new NepaliDate(today);
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english';

        // Initialize currentDate based on company date format
        let currentDate;
        if (companyDateFormat === 'nepali') {
            currentDate = nepaliDate;
        } else {
            currentDate = today;
        }

        // Get Sundry Debtors and Creditors groups
        const [debtorGroup, creditorGroup] = await Promise.all([
            CompanyGroup.findOne({ name: 'Sundry Debtors', company: companyId }),
            CompanyGroup.findOne({ name: 'Sundry Creditors', company: companyId })
        ]);

        if (!debtorGroup || !creditorGroup) {
            return res.status(400).json({ error: 'Required account groups not found.' });
        }

        // Fetch current fiscal year (for display purposes only)
        let currentFiscalYear = req.session.currentFiscalYear?.id
            ? await FiscalYear.findById(req.session.currentFiscalYear.id)
            : company.fiscalYear;

        if (!currentFiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Get the company's initial fiscal year (oldest fiscal year)
        const initialFiscalYear = await FiscalYear.findOne({ company: companyId })
            .sort({ startDate: 1 })
            .limit(1);

        if (!initialFiscalYear) {
            return res.status(400).json({ error: 'No initial fiscal year found for company.' });
        }

        // Get all debtor and creditor accounts with opening balances populated
        const [debtorAccounts, creditorAccounts] = await Promise.all([
            Account.find({
                company: companyId,
                companyGroups: debtorGroup._id
            }).populate('openingBalanceByFiscalYear.fiscalYear'),
            Account.find({
                company: companyId,
                companyGroups: creditorGroup._id
            }).populate('openingBalanceByFiscalYear.fiscalYear')
        ]);

        const allAccounts = [...debtorAccounts, ...creditorAccounts];
        const accountIds = allAccounts.map(a => a._id);

        // Query ALL relevant transactions (without fiscal year filter)
        const allTransactions = await Transaction.find({
            company: companyId,
            account: { $in: accountIds },
            isActive: true,
            $or: [
                { billId: { $exists: true }, paymentMode: { $ne: 'cash' } },
                { purchaseBillId: { $exists: true }, paymentMode: { $ne: 'cash' } },
                { purchaseReturnBillId: { $exists: true }, paymentMode: { $ne: 'cash' } },
                { salesReturnBillId: { $exists: true }, paymentMode: { $ne: 'cash' } },
                { paymentAccountId: { $exists: true } },
                { receiptAccountId: { $exists: true } },
                { journalBillId: { $exists: true } },
                { debitNoteId: { $exists: true } },
                { creditNoteId: { $exists: true } },
            ],
        })
            .populate('billId')
            .populate('purchaseBillId')
            .populate('purchaseReturnBillId')
            .populate('salesReturnBillId')
            .populate('paymentAccountId')
            .populate('receiptAccountId')
            .populate('journalBillId')
            .populate('debitNoteId')
            .populate('creditNoteId')
            .sort({ date: 'asc' })
            .exec();

        // Process ageing
        const report = [];
        const receivableTotals = createBucketTemplate();
        const payableTotals = createBucketTemplate();
        const netTotals = createBucketTemplate();

        for (const account of allAccounts) {
            // Calculate opening balance from account's openingBalanceByFiscalYear
            let openingBalance = 0;

            // Find the opening balance entry for the initial fiscal year
            const initialFyOpeningBalance = account.openingBalanceByFiscalYear.find(
                ob => ob.fiscalYear && ob.fiscalYear._id.toString() === initialFiscalYear._id.toString()
            );

            if (initialFyOpeningBalance) {
                openingBalance = initialFyOpeningBalance.type === 'Dr'
                    ? initialFyOpeningBalance.amount
                    : -initialFyOpeningBalance.amount;
            }

            // Get all transactions for the account
            const accountTransactions = allTransactions.filter(t => t.account.equals(account._id));

            // Calculate current net balance from ALL transactions (all fiscal years)
            const currentNetBalance = accountTransactions.reduce((sum, txn) => {
                return sum + (txn.debit - txn.credit);
            }, 0); // Start with opening balance

            // Skip accounts with zero balance in both opening and current
            if (Math.abs(openingBalance) < 0.01 && Math.abs(currentNetBalance) < 0.01) continue;

            const isReceivable = currentNetBalance + openingBalance > 0;
            const buckets = createBucketTemplate();

            // Add opening balance to the 'over-120' bucket
            buckets['over-120'] += openingBalance;

            // Separate transactions into receivables and payables (from all fiscal years)
            const receivableItems = [];
            const payableItems = [];

            for (const txn of accountTransactions.sort((a, b) => new Date(a.date) - new Date(b.date))) {
                if (txn.debit > 0) {
                    receivableItems.push({
                        date: txn.date,
                        amount: txn.debit,
                        originalDate: txn.date,
                        fiscalYear: txn.fiscalYear,
                    });
                }
                if (txn.credit > 0) {
                    payableItems.push({
                        date: txn.date,
                        amount: txn.credit,
                        originalDate: txn.date,
                        fiscalYear: txn.fiscalYear
                    });
                }
            }

            // Process receivables (FIFO) across all fiscal years
            const unpaidReceivables = [...receivableItems];
            for (const payment of accountTransactions
                .filter(t => t.credit > 0)
                .sort((a, b) => new Date(a.date) - new Date(b.date))) {

                let remaining = payment.credit;
                while (remaining > 0 && unpaidReceivables.length > 0) {
                    const oldest = unpaidReceivables[0];
                    if (oldest.amount <= remaining) {
                        remaining -= oldest.amount;
                        unpaidReceivables.shift();
                    } else {
                        oldest.amount -= remaining;
                        remaining = 0;
                    }
                }
            }

            // Process payables (FIFO) across all fiscal years
            const unpaidPayables = [...payableItems];
            for (const payment of accountTransactions
                .filter(t => t.debit > 0)
                .sort((a, b) => new Date(a.date) - new Date(b.date))) {

                let remaining = payment.debit;
                while (remaining > 0 && unpaidPayables.length > 0) {
                    const oldest = unpaidPayables[0];
                    if (oldest.amount <= remaining) {
                        remaining -= oldest.amount;
                        unpaidPayables.shift();
                    } else {
                        oldest.amount -= remaining;
                        remaining = 0;
                    }
                }
            }

            // Calculate ageing for remaining items
            const calculateAgeing = (items, isReceivable) => {
                for (const item of items) {
                    let ageInDays;
                    if (companyDateFormat === 'nepali') {
                        try {
                            const transactionDate = new Date(item.date);
                            const currentDateObj = new Date(nepaliDate);
                            ageInDays = Math.floor((currentDateObj - transactionDate) / (1000 * 60 * 60 * 24));
                        } catch (error) {
                            console.error('Error calculating Nepali date difference:', error);
                            ageInDays = 0;
                        }
                    } else {
                        try {
                            const transactionDate = new Date(item.date);
                            ageInDays = Math.floor((today - transactionDate) / (1000 * 60 * 60 * 24));
                        } catch (error) {
                            console.error('Error calculating English date difference:', error);
                            ageInDays = 0;
                        }
                    }

                    // Determine bucket
                    let bucketKey;
                    if (ageInDays <= 30) bucketKey = '0-30';
                    else if (ageInDays <= 60) bucketKey = '30-60';
                    else if (ageInDays <= 90) bucketKey = '60-90';
                    else if (ageInDays <= 120) bucketKey = '90-120';
                    else bucketKey = 'over-120';

                    // Add to appropriate bucket
                    if (isReceivable) {
                        buckets[bucketKey] += item.amount;
                    } else {
                        buckets[bucketKey] -= item.amount; // Negative for payables
                    }
                }
            };

            calculateAgeing(unpaidReceivables, true);
            calculateAgeing(unpaidPayables, false);

            // Calculate account total from buckets
            buckets.total = Object.values(buckets).reduce((a, b) => a + b, 0);

            // Add to appropriate totals
            if (isReceivable) {
                updateBucketTotals(receivableTotals, buckets);
            } else {
                // For payables, we need to store positive amounts in the totals
                updateBucketTotals(payableTotals, negateBuckets(buckets));
            }
            updateBucketTotals(netTotals, buckets);

            report.push({
                accountName: account.name,
                buckets: formatBuckets(buckets),
                isReceivable: isReceivable,
                netBalance: Math.abs(buckets.total),
                openingBalance: openingBalance
            });
        }

        res.render('retailer/outstanding/ageingAllAccounts', {
            report,
            receivableTotals,
            payableTotals,
            netTotals,
            formatCurrency: (num) => (num || 0).toFixed(2),
            company,
            currentFiscalYear: currentFiscalYear,
            initialFiscalYear: initialFiscalYear,
            currentCompanyName: req.session.currentCompanyName,
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Helper functions
function createBucketTemplate() {
    return { '0-30': 0, '30-60': 0, '60-90': 0, '90-120': 0, 'over-120': 0, total: 0 };
}

function formatBuckets(buckets) {
    return Object.fromEntries(
        Object.entries(buckets).map(([key, val]) => [key, val])
    );
}

function updateBucketTotals(totals, buckets) {
    for (const key in buckets) {
        if (key !== 'total') totals[key] += buckets[key];
    }
    totals.total += buckets.total;
}

function negateBuckets(buckets) {
    const negated = {};
    for (const key in buckets) {
        negated[key] = -buckets[key];
    }
    return negated;
}

// Route to fetch all accounts
router.get('/aging/accounts', isLoggedIn, ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    try {
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Fetch only the required company groups: Cash in Hand, Sundry Debtors, Sundry Creditors
        const relevantGroups = await CompanyGroup.find({
            name: { $in: ['Sundry Debtors', 'Sundry Creditors'] }
        }).exec();

        // Convert relevant group IDs to an array of ObjectIds
        const relevantGroupIds = relevantGroups.map(group => group._id);

        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
            isActive: true,
            companyGroups: { $in: relevantGroupIds }
        }).populate('companyGroups');

        res.render('retailer/outstanding/accounts', {
            company,
            currentFiscalYear,
            accounts,
            currentCompanyName: req.session.currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


// // Route to get aging report for a specific account
// router.get('/aging/:accountId', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, ensureTradeType, checkFiscalYearDateRange, async (req, res) => {
//     try {
//         const { accountId } = req.params;
//         const companyId = req.session.currentCompany;
//         const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
//         const currentCompany = await Company.findById(companyId);
//         const today = new Date();
//         const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
//         const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english'; // Default to 'english'

//         // let currentDate;

//         if (companyDateFormat === 'nepali') {
//             // Use NepaliDate if the company's date format is Nepali
//             currentDate = nepaliDate; // Get current Nepali date
//         } else {
//             // Use regular Date for English date format
//             currentDate = today;
//         }

//         // Fetch current fiscal year from session or company
//         let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
//         let currentFiscalYear = null;

//         if (fiscalYear) {
//             currentFiscalYear = await FiscalYear.findById(fiscalYear);
//         }

//         if (!currentFiscalYear && company.fiscalYear) {
//             currentFiscalYear = company.fiscalYear;
//             req.session.currentFiscalYear = {
//                 id: currentFiscalYear._id.toString(),
//                 startDate: currentFiscalYear.startDate,
//                 endDate: currentFiscalYear.endDate,
//                 name: currentFiscalYear.name,
//                 dateFormat: currentFiscalYear.dateFormat,
//                 isActive: currentFiscalYear.isActive
//             };
//             fiscalYear = req.session.currentFiscalYear.id;
//         }

//         if (!fiscalYear) {
//             return res.status(400).json({ error: 'No fiscal year found in session or company.' });
//         }

//         // Fetch the account
//         const account = await Account.findById(accountId);

//         // Fetch opening balance for the current fiscal year
//         const openingBalance = account.openingBalance && account.openingBalance.fiscalYear
//             ? account.openingBalance
//             : { amount: 0, type: 'Cr' }; // Default to zero if not found

//         let runningBalance = openingBalance.type === 'Cr' ? openingBalance.amount : -openingBalance.amount;

//         const transactions = await Transaction.find({
//             company: companyId,
//             account: accountId,
//             isActive: true,
//             $or: [
//                 {
//                     billId: { $exists: true }, // Sales
//                     paymentMode: { $ne: 'cash' } // Exclude cash sales
//                 },
//                 {
//                     purchaseBillId: { $exists: true }, // Purchase
//                     paymentMode: { $ne: 'cash' } // Exclude cash purchases
//                 },
//                 {
//                     purchaseReturnBillId: { $exists: true }, // Purchase Return
//                     paymentMode: { $ne: 'cash' } // Exclude cash purchase returns
//                 },
//                 {
//                     salesReturnBillId: { $exists: true }, // Sales Return
//                     paymentMode: { $ne: 'cash' } // Exclude cash sales returns
//                 },
//                 { paymentAccountId: { $exists: true } },
//                 { receiptAccountId: { $exists: true } },
//                 { journalBillId: { $exists: true } },
//                 { debitNoteId: { $exists: true } },
//                 { creditNoteId: { $exists: true } },
//             ],
//         }).populate('billId')
//             .populate('purchaseBillId')
//             .populate('purchaseReturnBillId')
//             .populate('salesReturnBillId')
//             .populate('paymentAccountId')
//             .populate('receiptAccountId')
//             .populate('journalBillId')
//             .populate('debitNoteId')
//             .populate('creditNoteId')
//             .sort({ date: 'asc' }) // Sort by date for better analysis
//             .exec();

//         // Initialize data for aging analysis
//         const agingData = {
//             totalOutstanding: 0,
//             oneToThirty: 0,
//             thirtyOneToSixty: 0,
//             sixtyOneToNinety: 0,
//             ninetyPlus: 0,
//             openingBalance: openingBalance.amount, // Add opening balance
//             transactions: []
//         };
//         // Loop through transactions to calculate outstanding amounts and balance
//         transactions.forEach(transaction => {
//             // Determine debit or credit effect on totalOutstanding
//             if (transaction.billId) {
//                 // Sales
//                 runningBalance -= transaction.debit; // Debit increases outstanding
//                 agingData.totalOutstanding += transaction.debit; // Increase total outstanding for sales
//             } else if (transaction.salesReturnBillId) {
//                 // Sales Return
//                 runningBalance += transaction.credit; // Credit decreases outstanding
//                 agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for sales return
//             } else if (transaction.purchaseBillId) {
//                 // Purchase
//                 runningBalance += transaction.credit; // Credit for purchases
//                 agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for purchases
//             } else if (transaction.purchaseReturnBillId) {
//                 // Purchase Return
//                 runningBalance -= transaction.debit; // Debit for purchases
//                 agingData.totalOutstanding += transaction.debit; // Increase total outstanding for purchase returns
//             } else if (transaction.paymentAccountId) {
//                 if (transaction.debit > 0) {
//                     runningBalance -= transaction.debit;
//                     agingData.totalOutstanding += transaction.debit;
//                 } else if (transaction.credit > 0) {
//                     runningBalance += transaction.credit;
//                     agingData.totalOutstanding -= transaction.credit;
//                 }
//             } else if (transaction.receiptAccountId) {
//                 if (transaction.debit > 0) {
//                     runningBalance += transaction.debit;
//                     agingData.totalOutstanding -= transaction.debit;
//                 } else if (transaction.credit > 0) {
//                     runningBalance += transaction.credit;
//                     agingData.totalOutstanding += transaction.credit;
//                 }
//             } else if (transaction.debitNoteId) {
//                 // Journal Entry (can be either debit or credit)
//                 if (transaction.debit > 0) {
//                     runningBalance -= transaction.debit; // Debit increases outstanding
//                     agingData.totalOutstanding += transaction.debit; // Increase total outstanding for journal debit
//                 } else if (transaction.credit > 0) {
//                     runningBalance += transaction.credit; // Credit decreases outstanding
//                     agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for journal credit
//                 }
//             } else if (transaction.creditNoteId) {
//                 // Journal Entry (can be either debit or credit)
//                 if (transaction.debit > 0) {
//                     runningBalance -= transaction.debit; // Debit increases outstanding
//                     agingData.totalOutstanding += transaction.debit; // Increase total outstanding for journal debit
//                 } else if (transaction.credit > 0) {
//                     runningBalance += transaction.credit; // Credit decreases outstanding
//                     agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for journal credit
//                 }
//             } else if (transaction.journalBillId) {
//                 // Journal Entry (can be either debit or credit)
//                 if (transaction.debit > 0) {
//                     runningBalance -= transaction.debit; // Debit increases outstanding
//                     agingData.totalOutstanding += transaction.debit; // Increase total outstanding for journal debit
//                 } else if (transaction.credit > 0) {
//                     runningBalance += transaction.credit; // Credit decreases outstanding
//                     agingData.totalOutstanding -= transaction.credit; // Decrease total outstanding for journal credit
//                 }
//             }

//             let transactionDate, age;

//             if (companyDateFormat === 'nepali') {
//                 // Validate and convert the transaction date to NepaliDate
//                 try {
//                     // Make sure the transaction date is valid before converting
//                     const nepaliTransactionDate = transaction.date; // NepaliDate instance
//                     const nepaliCurrentDate = nepaliDate; // NepaliDate instance

//                     const nepaliTransactionDateObject = new Date(nepaliTransactionDate); // Date object from transaction.date
//                     const nepaliCurrentDateObject = new Date(nepaliCurrentDate); // Convert string to Date object

//                     // Check if both dates are valid
//                     if (isNaN(nepaliTransactionDateObject) || isNaN(nepaliCurrentDateObject)) {
//                         throw new Error('Invalid date for age calculation');
//                     }
//                     // Debug the values

//                     console.log('Type of nepaliTransactionDate:', typeof nepaliTransactionDate);
//                     console.log('nepaliTransactionDate:', nepaliTransactionDate);
//                     console.log('Type of nepaliCurrentDate:', typeof nepaliCurrentDate);
//                     console.log('nepaliCurrentDate:', nepaliCurrentDate);

//                     // Calculate the difference in days using JavaScript date difference
//                     age = (nepaliCurrentDateObject - nepaliTransactionDateObject) / (1000 * 60 * 60 * 24); // Age in days
//                     console.log('Age in days:', age);
//                     // Use the original Nepali date string without formatting
//                     transactionDate = transaction.date;
//                 } catch (error) {
//                     console.error('Error converting Nepali date:', error);
//                     age = 0; // Default to 0 if the date conversion fails
//                 }
//             } else {
//                 // Validate and handle English date format
//                 try {
//                     const transactionDateObject = new Date(transaction.date); // Convert to Date object

//                     if (isNaN(transactionDateObject)) {
//                         throw new Error('Invalid English date');
//                     }

//                     // Calculate age in days using the difference between today's date and the transaction date
//                     age = (today - transactionDateObject) / (1000 * 60 * 60 * 24); // Age in days

//                     // Use the original English date string without formatting
//                     transactionDate = transaction.date;
//                 } catch (error) {
//                     console.error('Error converting English date:', error);
//                     age = 0; // Default to 0 if the date conversion fails
//                 }
//             }



//             // Categorize the transaction into the correct aging period based on the calculated age
//             if (age <= 30) {
//                 agingData.oneToThirty += transaction.debit - transaction.credit; // Consider only sales in aging
//             } else if (age <= 60) {
//                 agingData.thirtyOneToSixty += transaction.debit - transaction.credit; // Consider only sales in aging
//             } else if (age <= 90) {
//                 agingData.sixtyOneToNinety += transaction.debit - transaction.credit; // Consider only sales in aging
//             } else {
//                 agingData.ninetyPlus += transaction.debit - transaction.credit; // Consider only sales in aging
//             }

//             // Attach the running balance to each transaction
//             transaction.balance = runningBalance;
//             // Add to transactions list for detailed view
//             agingData.transactions.push(transaction);
//         });

//         // Include opening balance in the total outstanding calculation
//         agingData.totalOutstanding = runningBalance;

//         res.render('retailer/outstanding/ageing', {
//             company,
//             currentFiscalYear,
//             account,
//             agingData,
//             currentCompany,
//             companyDateFormat,
//             currentCompanyName: req.session.currentCompanyName,
//             title: 'Outstanding Analysis',
//             body: 'retailer >> account >> aging',
//             user: req.user,
//             isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
//         });
//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Internal Server Error');
//     }
// });


// Route to get aging report for a specific account
router.get('/aging/:accountId', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, ensureTradeType, checkFiscalYearDateRange, async (req, res) => {
    try {
        const { accountId } = req.params;
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const currentCompany = await Company.findById(companyId);
        const today = new Date();
        const nepaliDate = new NepaliDate(today);
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english';

        // Initialize currentDate based on company date format
        let currentDate;
        if (companyDateFormat === 'nepali') {
            currentDate = nepaliDate;
        } else {
            currentDate = today;
        }

        // Fetch current fiscal year from session or company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Fetch the account
        const account = await Account.findById(accountId);

        // Query all relevant transactions
        const transactions = await Transaction.find({
            company: companyId,
            account: accountId,
            isActive: true,
            $or: [
                {
                    billId: { $exists: true }, // Sales
                    paymentMode: { $ne: 'cash' } // Exclude cash sales
                },
                {
                    purchaseBillId: { $exists: true }, // Purchase
                    paymentMode: { $ne: 'cash' } // Exclude cash purchases
                },
                {
                    purchaseReturnBillId: { $exists: true }, // Purchase Return
                    paymentMode: { $ne: 'cash' } // Exclude cash purchase returns
                },
                {
                    salesReturnBillId: { $exists: true }, // Sales Return
                    paymentMode: { $ne: 'cash' } // Exclude cash sales returns
                },
                { paymentAccountId: { $exists: true } },
                { receiptAccountId: { $exists: true } },
                { journalBillId: { $exists: true } },
                { debitNoteId: { $exists: true } },
                { creditNoteId: { $exists: true } },
            ],
        })
            .populate('billId')
            .populate('purchaseBillId')
            .populate('purchaseReturnBillId')
            .populate('salesReturnBillId')
            .populate('paymentAccountId')
            .populate('receiptAccountId')
            .populate('journalBillId')
            .populate('debitNoteId')
            .populate('creditNoteId')
            .sort({ date: 'asc' })
            .exec();

        // Process ageing using the same method as ageing-all/accounts
        const buckets = createBucketTemplate();

        // Separate transactions into receivables and payables
        const receivableItems = [];
        const payableItems = [];

        for (const txn of transactions.sort((a, b) => new Date(a.date) - new Date(b.date))) {
            if (txn.debit > 0) {
                receivableItems.push({
                    date: txn.date,
                    amount: txn.debit,
                    originalDate: txn.date
                });
            }
            if (txn.credit > 0) {
                payableItems.push({
                    date: txn.date,
                    amount: txn.credit,
                    originalDate: txn.date
                });
            }
        }

        // Process receivables (FIFO)
        const unpaidReceivables = [...receivableItems];
        for (const payment of transactions
            .filter(t => t.credit > 0)
            .sort((a, b) => new Date(a.date) - new Date(b.date))) {

            let remaining = payment.credit;
            while (remaining > 0 && unpaidReceivables.length > 0) {
                const oldest = unpaidReceivables[0];
                if (oldest.amount <= remaining) {
                    remaining -= oldest.amount;
                    unpaidReceivables.shift();
                } else {
                    oldest.amount -= remaining;
                    remaining = 0;
                }
            }
        }

        // Process payables (FIFO)
        const unpaidPayables = [...payableItems];
        for (const payment of transactions
            .filter(t => t.debit > 0)
            .sort((a, b) => new Date(a.date) - new Date(b.date))) {

            let remaining = payment.debit;
            while (remaining > 0 && unpaidPayables.length > 0) {
                const oldest = unpaidPayables[0];
                if (oldest.amount <= remaining) {
                    remaining -= oldest.amount;
                    unpaidPayables.shift();
                } else {
                    oldest.amount -= remaining;
                    remaining = 0;
                }
            }
        }

        // Calculate ageing for remaining items
        const calculateAgeing = (items, isReceivable) => {
            for (const item of items) {
                let ageInDays;
                if (companyDateFormat === 'nepali') {
                    try {
                        const transactionDate = new Date(item.date);
                        const currentDateObj = new Date(nepaliDate);
                        ageInDays = (currentDateObj - transactionDate) / (1000 * 60 * 60 * 24);
                    } catch (error) {
                        console.error('Error calculating Nepali date difference:', error);
                        ageInDays = 0;
                    }
                } else {
                    try {
                        const transactionDate = new Date(item.date);
                        ageInDays = Math.floor((today - transactionDate) / (1000 * 60 * 60 * 24));
                    } catch (error) {
                        console.error('Error calculating English date difference:', error);
                        ageInDays = 0;
                    }
                }

                // Determine bucket
                let bucketKey;
                if (ageInDays <= 30) bucketKey = '0-30';
                else if (ageInDays <= 60) bucketKey = '30-60';
                else if (ageInDays <= 90) bucketKey = '60-90';
                else if (ageInDays <= 120) bucketKey = '90-120';
                else bucketKey = 'over-120';

                // Add to appropriate bucket
                if (isReceivable) {
                    buckets[bucketKey] += item.amount;
                } else {
                    buckets[bucketKey] -= item.amount; // Negative for payables
                }
            }
        };

        calculateAgeing(unpaidReceivables, true);
        calculateAgeing(unpaidPayables, false);

        // Calculate account total from buckets
        buckets.total = Object.values(buckets).reduce((a, b) => a + b, 0);

        // Determine if this is a receivable or payable
        const isReceivable = buckets.total > 0;

        // Prepare the aging data in the expected format
        const agingData = {
            totalOutstanding: Math.abs(buckets.total),
            oneToThirty: isReceivable ? buckets['0-30'] : -buckets['0-30'],
            thirtyOneToSixty: isReceivable ? buckets['30-60'] : -buckets['30-60'],
            sixtyOneToNinety: isReceivable ? buckets['60-90'] : -buckets['60-90'],
            ninetyPlus: isReceivable ? (buckets['90-120'] + buckets['over-120']) : -(buckets['90-120'] + buckets['over-120']),
            openingBalance: account.openingBalance?.amount || 0,
            transactions: transactions.map(txn => ({
                ...txn.toObject(),
                balance: 0 // This would need to be calculated if needed
            })),
            isReceivable
        };

        res.render('retailer/outstanding/ageing', {
            company,
            currentFiscalYear,
            account,
            agingData,
            currentCompany,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            title: 'Outstanding Analysis',
            body: 'retailer >> account >> aging',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor',
            // Add helper functions to the view
            createBucketTemplate,
            formatBuckets,
            formatCurrency: (num) => (num || 0).toFixed(2)
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


// router.get('/day-count-aging/:accountId', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, ensureTradeType, checkFiscalYearDateRange, async (req, res) => {
//     try {
//         const { accountId } = req.params;
//         const { fromDate, toDate } = req.query;
//         const companyId = req.session.currentCompany;
//         const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
//         const currentCompany = await Company.findById(companyId);
//         const currentCompanyName = req.session.currentCompanyName;
//         const today = new Date();
//         const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');
//         const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english';

//         let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
//         let currentFiscalYear = null;

//         if (fiscalYear) {
//             currentFiscalYear = await FiscalYear.findById(fiscalYear);
//         }

//         if (!currentFiscalYear && company.fiscalYear) {
//             currentFiscalYear = company.fiscalYear;
//             req.session.currentFiscalYear = {
//                 id: currentFiscalYear._id.toString(),
//                 startDate: currentFiscalYear.startDate,
//                 endDate: currentFiscalYear.endDate,
//                 name: currentFiscalYear.name,
//                 dateFormat: currentFiscalYear.dateFormat,
//                 isActive: currentFiscalYear.isActive
//             };
//             fiscalYear = req.session.currentFiscalYear.id;
//         }

//         if (!fiscalYear) {
//             return res.status(400).json({ error: 'No fiscal year found in session or company.' });
//         }

//         // Fetch the account
//         const account = await Account.findById(accountId);

//         // Fetch opening balance for the current fiscal year
//         const openingBalance = account.openingBalance && account.openingBalance.fiscalYear.equals(currentFiscalYear._id)
//             ? account.openingBalance
//             : { amount: 0, type: 'Cr' };

//         // Initialize empty aging data
//         const agingData = {
//             totalOutstanding: 0,
//             current: 0,
//             oneToThirty: 0,
//             thirtyOneToSixty: 0,
//             sixtyOneToNinety: 0,
//             ninetyPlus: 0,
//             openingBalance: openingBalance.amount,
//             transactions: []
//         };

//         // Only process transactions if both fromDate and toDate are provided
//         if (fromDate && toDate) {
//             // Calculate initial running balance from opening balance
//             let initialRunningBalance = openingBalance.type === 'Cr' ? openingBalance.amount : -openingBalance.amount;

//             // Get transactions before the date range to calculate correct initial balance
//             const transactionsBeforeRange = await Transaction.find({
//                 company: companyId,
//                 account: accountId,
//                 isActive: true,
//                 date: { $lt: new Date(fromDate) },

//                 $or: [
//                     {
//                         billId: { $exists: true },
//                         paymentMode: { $ne: 'cash' } // Exclude cash sales
//                     },
//                     {
//                         purchaseBillId: { $exists: true },
//                         paymentMode: { $ne: 'cash' } // Exclude cash purchases
//                     },
//                     {
//                         purchaseReturnBillId: { $exists: true },
//                         paymentMode: { $ne: 'cash' } // Exclude cash purchase returns
//                     },
//                     {
//                         salesReturnBillId: { $exists: true },
//                         paymentMode: { $ne: 'cash' } // Exclude cash sales returns
//                     },
//                     { paymentAccountId: { $exists: true } },
//                     { receiptAccountId: { $exists: true } },
//                     { journalBillId: { $exists: true } },
//                     { debitNoteId: { $exists: true } },
//                     { creditNoteId: { $exists: true } },
//                 ],
//             })
//                 .sort({ date: 1 })
//                 .lean()
//                 .exec();

//             // Calculate running balance up to the start of the date range
//             for (const transaction of transactionsBeforeRange) {
//                 if (transaction.billId) {
//                     initialRunningBalance -= transaction.debit;
//                 } else if (transaction.salesReturnBillId) {
//                     initialRunningBalance += transaction.credit;
//                 } else if (transaction.purchaseBillId) {
//                     initialRunningBalance += transaction.credit;
//                 } else if (transaction.purchaseReturnBillId) {
//                     initialRunningBalance -= transaction.debit;
//                 } else if (transaction.paymentAccountId) {
//                     if (transaction.debit > 0) initialRunningBalance -= transaction.debit;
//                     if (transaction.credit > 0) initialRunningBalance += transaction.credit;
//                 } else if (transaction.receiptAccountId) {
//                     if (transaction.debit > 0) initialRunningBalance -= transaction.debit;
//                     if (transaction.credit > 0) initialRunningBalance += transaction.credit;
//                 } else if (transaction.debitNoteId || transaction.creditNoteId || transaction.journalBillId) {
//                     if (transaction.debit > 0) initialRunningBalance -= transaction.debit;
//                     if (transaction.credit > 0) initialRunningBalance += transaction.credit;
//                 }
//             }

//             // Get transactions within the date range
//             const startDate = new Date(fromDate);
//             const endDate = new Date(toDate);
//             endDate.setHours(23, 59, 59, 999);

//             const transactions = await Transaction.find({
//                 company: companyId,
//                 account: accountId,
//                 isActive: true,
//                 date: {
//                     $gte: startDate,
//                     $lte: endDate
//                 },
//                 $or: [
//                     {
//                         billId: { $exists: true },
//                         paymentMode: { $ne: 'cash' } // Exclude cash sales
//                     },
//                     {
//                         purchaseBillId: { $exists: true },
//                         paymentMode: { $ne: 'cash' } // Exclude cash purchases
//                     },
//                     {
//                         purchaseReturnBillId: { $exists: true },
//                         paymentMode: { $ne: 'cash' } // Exclude cash purchase returns
//                     },
//                     {
//                         salesReturnBillId: { $exists: true },
//                         paymentMode: { $ne: 'cash' } // Exclude cash sales returns
//                     },
//                     { paymentAccountId: { $exists: true } },
//                     { receiptAccountId: { $exists: true } },
//                     { journalBillId: { $exists: true } },
//                     { debitNoteId: { $exists: true } },
//                     { creditNoteId: { $exists: true } },
//                 ],
//             })
//                 .populate('billId')
//                 .populate('purchaseBillId')
//                 .populate('purchaseReturnBillId')
//                 .populate('salesReturnBillId')
//                 .populate('paymentAccountId')
//                 .populate('receiptAccountId')
//                 .populate('journalBillId')
//                 .populate('debitNoteId')
//                 .populate('creditNoteId')
//                 .sort({ date: 1 })
//                 .lean()
//                 .exec();

//             // Process transactions with the initial running balance
//             let runningBalance = initialRunningBalance;
//             agingData.transactions = [];

//             for (const transaction of transactions) {
//                 // Calculate age in days
//                 let age;
//                 if (companyDateFormat === 'nepali') {
//                     try {
//                         const nepaliTransactionDate = new Date(transaction.date);
//                         const nepaliCurrentDate = new Date(nepaliDate);
//                         age = (nepaliCurrentDate - nepaliTransactionDate) / (1000 * 60 * 60 * 24);
//                     } catch (error) {
//                         age = 0;
//                     }
//                 } else {
//                     try {
//                         age = (today - transaction.date) / (1000 * 60 * 60 * 24);
//                     } catch (error) {
//                         age = 0;
//                     }
//                 }

//                 // Update running balance based on transaction type
//                 if (transaction.billId) {
//                     runningBalance -= transaction.debit;
//                     agingData.totalOutstanding += transaction.debit;
//                 } else if (transaction.salesReturnBillId) {
//                     runningBalance += transaction.credit;
//                     agingData.totalOutstanding -= transaction.credit;
//                 } else if (transaction.purchaseBillId) {
//                     runningBalance += transaction.credit;
//                     agingData.totalOutstanding -= transaction.credit;
//                 } else if (transaction.purchaseReturnBillId) {
//                     runningBalance -= transaction.debit;
//                     agingData.totalOutstanding += transaction.debit;
//                 } else if (transaction.paymentAccountId) {
//                     if (transaction.debit > 0) runningBalance -= transaction.debit;
//                     if (transaction.credit > 0) runningBalance += transaction.credit;
//                 } else if (transaction.receiptAccountId) {
//                     if (transaction.debit > 0) {
//                         runningBalance -= transaction.debit;
//                         agingData.totalOutstanding += transaction.debit;
//                     }
//                     if (transaction.credit > 0) {
//                         runningBalance += transaction.credit;
//                         agingData.totalOutstanding -= transaction.credit;
//                     }
//                 } else if (transaction.debitNoteId || transaction.creditNoteId || transaction.journalBillId) {
//                     if (transaction.debit > 0) {
//                         runningBalance -= transaction.debit;
//                         agingData.totalOutstanding += transaction.debit;
//                     }
//                     if (transaction.credit > 0) {
//                         runningBalance += transaction.credit;
//                         agingData.totalOutstanding -= transaction.credit;
//                     }
//                 }

//                 // Add age information
//                 transaction.age = Math.round(age);
//                 transaction.ageCategory = age <= 30 ? '0-30 days' :
//                     age <= 60 ? '31-60 days' :
//                         age <= 90 ? '61-90 days' : '90+ days';

//                 // Categorize by age
//                 if (age <= 30) {
//                     agingData.oneToThirty += transaction.debit - transaction.credit;
//                 } else if (age <= 60) {
//                     agingData.thirtyOneToSixty += transaction.debit - transaction.credit;
//                 } else if (age <= 90) {
//                     agingData.sixtyOneToNinety += transaction.debit - transaction.credit;
//                 } else {
//                     agingData.ninetyPlus += transaction.debit - transaction.credit;
//                 }

//                 // Store running balance and add to transactions list
//                 transaction.balance = runningBalance;
//                 agingData.transactions.push(transaction);
//             }

//             // Include opening balance in the total outstanding calculation
//             agingData.totalOutstanding += agingData.openingBalance;
//         }

//         res.render('retailer/outstanding/dayCountAgeing2', {
//             company,
//             currentFiscalYear,
//             account,
//             agingData,
//             currentCompany,
//             companyDateFormat,
//             nepaliDate,
//             currentCompanyName,
//             fromDate: fromDate || '',
//             toDate: toDate || '',
//             title: '',
//             body: '',
//             user: req.user,
//             isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor',
//             hasDateFilter: !!fromDate && !!toDate // Add flag to indicate if date filter is applied
//         });

//     } catch (error) {
//         console.error(error);
//         res.status(500).send('Internal Server Error');
//     }
// });

router.get('/day-count-aging/:accountId', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, ensureTradeType, checkFiscalYearDateRange, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { fromDate, toDate } = req.query;
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const currentCompany = await Company.findById(companyId);
        const currentCompanyName = req.session.currentCompanyName;
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english';

        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Fetch the account
        const account = await Account.findById(accountId);

        // Fetch opening balance for the current fiscal year
        const openingBalance = account.openingBalance && account.openingBalance.fiscalYear.equals(currentFiscalYear._id)
            ? account.openingBalance
            : { amount: 0, type: 'Cr' };

        // Initialize empty aging data
        const agingData = {
            totalOutstanding: 0,
            current: 0,
            oneToThirty: 0,
            thirtyOneToSixty: 0,
            sixtyOneToNinety: 0,
            ninetyPlus: 0,
            openingBalance: openingBalance.amount,
            transactions: []
        };

        // Only process transactions if both fromDate and toDate are provided
        if (fromDate && toDate) {
            // Calculate initial running balance from opening balance
            let initialRunningBalance = openingBalance.type === 'Cr' ? openingBalance.amount : -openingBalance.amount;

            // Get transactions before the date range to calculate correct initial balance
            const transactionsBeforeRange = await Transaction.find({
                company: companyId,
                account: accountId,
                isActive: true,
                date: { $lt: new Date(fromDate) },
                $or: [
                    {
                        billId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash sales
                    },
                    {
                        purchaseBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash purchases
                    },
                    {
                        purchaseReturnBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash purchase returns
                    },
                    {
                        salesReturnBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash sales returns
                    },
                    { paymentAccountId: { $exists: true } },
                    { receiptAccountId: { $exists: true } },
                    { journalBillId: { $exists: true } },
                    { debitNoteId: { $exists: true } },
                    { creditNoteId: { $exists: true } },
                ],
            })
                .sort({ date: 1 })
                .lean()
                .exec();

            // Calculate running balance up to the start of the date range
            for (const transaction of transactionsBeforeRange) {
                if (transaction.billId) {
                    initialRunningBalance -= transaction.debit;
                } else if (transaction.salesReturnBillId) {
                    initialRunningBalance += transaction.credit;
                } else if (transaction.purchaseBillId) {
                    initialRunningBalance += transaction.credit;
                } else if (transaction.purchaseReturnBillId) {
                    initialRunningBalance -= transaction.debit;
                } else if (transaction.paymentAccountId) {
                    if (transaction.debit > 0) initialRunningBalance -= transaction.debit;
                    if (transaction.credit > 0) initialRunningBalance += transaction.credit;
                } else if (transaction.receiptAccountId) {
                    if (transaction.debit > 0) initialRunningBalance -= transaction.debit;
                    if (transaction.credit > 0) initialRunningBalance += transaction.credit;
                } else if (transaction.debitNoteId || transaction.creditNoteId || transaction.journalBillId) {
                    if (transaction.debit > 0) initialRunningBalance -= transaction.debit;
                    if (transaction.credit > 0) initialRunningBalance += transaction.credit;
                }
            }

            // Get transactions within the date range
            const startDate = new Date(fromDate);
            const endDate = new Date(toDate);
            endDate.setHours(23, 59, 59, 999);

            const transactions = await Transaction.find({
                company: companyId,
                account: accountId,
                isActive: true,
                date: {
                    $gte: startDate,
                    $lte: endDate
                },
                $or: [
                    {
                        billId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash sales
                    },
                    {
                        purchaseBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash purchases
                    },
                    {
                        purchaseReturnBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash purchase returns
                    },
                    {
                        salesReturnBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash sales returns
                    },
                    { paymentAccountId: { $exists: true } },
                    { receiptAccountId: { $exists: true } },
                    { journalBillId: { $exists: true } },
                    { debitNoteId: { $exists: true } },
                    { creditNoteId: { $exists: true } },
                ],
            })
                .populate('billId')
                .populate('purchaseBillId')
                .populate('purchaseReturnBillId')
                .populate('salesReturnBillId')
                .populate('paymentAccountId')
                .populate('receiptAccountId')
                .populate('journalBillId')
                .populate('debitNoteId')
                .populate('creditNoteId')
                .sort({ date: 1 })
                .lean()
                .exec();

            // Separate payment and receipt transactions
            const paymentReceiptTransactions = [];
            const otherTransactions = [];

            for (const transaction of transactions) {
                if (transaction.paymentAccountId || transaction.receiptAccountId) {
                    paymentReceiptTransactions.push(transaction);
                } else {
                    otherTransactions.push(transaction);
                }
            }

            // Process transactions with the initial running balance
            let runningBalance = initialRunningBalance;
            agingData.transactions = [];

            // Process payment and receipt transactions first
            for (const transaction of paymentReceiptTransactions) {
                // Calculate age in days
                let age;
                if (companyDateFormat === 'nepali') {
                    try {
                        const nepaliTransactionDate = new Date(transaction.date);
                        const nepaliCurrentDate = new Date(nepaliDate);
                        age = (nepaliCurrentDate - nepaliTransactionDate) / (1000 * 60 * 60 * 24);
                    } catch (error) {
                        age = 0;
                    }
                } else {
                    try {
                        age = (today - transaction.date) / (1000 * 60 * 60 * 24);
                    } catch (error) {
                        age = 0;
                    }
                }

                // Update running balance based on transaction type
                if (transaction.paymentAccountId) {
                    if (transaction.debit > 0) runningBalance -= transaction.debit;
                    if (transaction.credit > 0) runningBalance += transaction.credit;
                } else if (transaction.receiptAccountId) {
                    if (transaction.debit > 0) {
                        runningBalance -= transaction.debit;
                        agingData.totalOutstanding += transaction.debit;
                    }
                    if (transaction.credit > 0) {
                        runningBalance += transaction.credit;
                        agingData.totalOutstanding -= transaction.credit;
                    }
                }

                // Add age information
                transaction.age = Math.round(age);
                transaction.ageCategory = age <= 30 ? '0-30 days' :
                    age <= 60 ? '31-60 days' :
                        age <= 90 ? '61-90 days' : '90+ days';

                // Categorize by age
                if (age <= 30) {
                    agingData.oneToThirty += transaction.debit - transaction.credit;
                } else if (age <= 60) {
                    agingData.thirtyOneToSixty += transaction.debit - transaction.credit;
                } else if (age <= 90) {
                    agingData.sixtyOneToNinety += transaction.debit - transaction.credit;
                } else {
                    agingData.ninetyPlus += transaction.debit - transaction.credit;
                }

                // Store running balance and add to transactions list
                transaction.balance = runningBalance;
                agingData.transactions.push(transaction);
            }

            // Then process other transactions
            for (const transaction of otherTransactions) {
                // Calculate age in days
                let age;
                if (companyDateFormat === 'nepali') {
                    try {
                        const nepaliTransactionDate = new Date(transaction.date);
                        const nepaliCurrentDate = new Date(nepaliDate);
                        age = (nepaliCurrentDate - nepaliTransactionDate) / (1000 * 60 * 60 * 24);
                    } catch (error) {
                        age = 0;
                    }
                } else {
                    try {
                        age = (today - transaction.date) / (1000 * 60 * 60 * 24);
                    } catch (error) {
                        age = 0;
                    }
                }

                // Update running balance based on transaction type
                if (transaction.billId) {
                    runningBalance -= transaction.debit;
                    agingData.totalOutstanding += transaction.debit;
                } else if (transaction.salesReturnBillId) {
                    runningBalance += transaction.credit;
                    agingData.totalOutstanding -= transaction.credit;
                } else if (transaction.purchaseBillId) {
                    runningBalance += transaction.credit;
                    agingData.totalOutstanding -= transaction.credit;
                } else if (transaction.purchaseReturnBillId) {
                    runningBalance -= transaction.debit;
                    agingData.totalOutstanding += transaction.debit;
                } else if (transaction.debitNoteId || transaction.creditNoteId || transaction.journalBillId) {
                    if (transaction.debit > 0) {
                        runningBalance -= transaction.debit;
                        agingData.totalOutstanding += transaction.debit;
                    }
                    if (transaction.credit > 0) {
                        runningBalance += transaction.credit;
                        agingData.totalOutstanding -= transaction.credit;
                    }
                }

                // Add age information
                transaction.age = Math.round(age);
                transaction.ageCategory = age <= 30 ? '0-30 days' :
                    age <= 60 ? '31-60 days' :
                        age <= 90 ? '61-90 days' : '90+ days';

                // Categorize by age
                if (age <= 30) {
                    agingData.oneToThirty += transaction.debit - transaction.credit;
                } else if (age <= 60) {
                    agingData.thirtyOneToSixty += transaction.debit - transaction.credit;
                } else if (age <= 90) {
                    agingData.sixtyOneToNinety += transaction.debit - transaction.credit;
                } else {
                    agingData.ninetyPlus += transaction.debit - transaction.credit;
                }

                // Store running balance and add to transactions list
                transaction.balance = runningBalance;
                agingData.transactions.push(transaction);
            }

            // Include opening balance in the total outstanding calculation
            agingData.totalOutstanding += agingData.openingBalance;
        }

        res.render('retailer/outstanding/dayCountAgeing2', {
            company,
            currentFiscalYear,
            account,
            agingData,
            currentCompany,
            companyDateFormat,
            nepaliDate,
            currentCompanyName,
            fromDate: fromDate || '',
            toDate: toDate || '',
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor',
            hasDateFilter: !!fromDate && !!toDate // Add flag to indicate if date filter is applied
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


router.get('/day-count-aging', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureFiscalYear, ensureTradeType, checkFiscalYearDateRange, async (req, res) => {
    try {
        // const { accountId } = req.params;
        const { accountId, fromDate, toDate } = req.query;
        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const currentCompany = await Company.findById(companyId);
        const currentCompanyName = req.session.currentCompanyName;
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : 'english';

        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }

        // Fetch the account
        const account = await Account.findById(accountId);

        // Fetch only the required company groups: Cash in Hand, Sundry Debtors, Sundry Creditors
        const relevantGroups = await CompanyGroup.find({
            name: { $in: ['Sundry Debtors', 'Sundry Creditors'] }
        }).exec();

        // Convert relevant group IDs to an array of ObjectIds
        const relevantGroupIds = relevantGroups.map(group => group._id);

        const accounts = await Account.find({
            company: companyId,
            fiscalYear: fiscalYear,
            isActive: true,
            companyGroups: { $in: relevantGroupIds }
        }).sort({ name: 1 });

        // Get all accounts for the dropdown
        // const accounts = await Account.find({ company: req.session.currentCompany }).sort({ name: 1 });


        if (!accountId) {
            return res.render('retailer/outstanding/dayCountAgeing', {
                accounts,
                // other necessary variables
                company,
                account,
                currentFiscalYear,
                currentCompany,
                companyDateFormat,
                nepaliDate,
                currentCompanyName,
                fromDate: fromDate || '',
                toDate: toDate || '',
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor',
                hasDateFilter: !!fromDate && !!toDate // Add flag to indicate if date filter is applied
            });
        }

        // Fetch opening balance for the current fiscal year
        const openingBalance = account.openingBalance && account.openingBalance.fiscalYear.equals(currentFiscalYear._id)
            ? account.openingBalance
            : { amount: 0, type: 'Cr' };

        // Initialize empty aging data
        const agingData = {
            totalOutstanding: 0,
            current: 0,
            oneToThirty: 0,
            thirtyOneToSixty: 0,
            sixtyOneToNinety: 0,
            ninetyPlus: 0,
            openingBalance: openingBalance.amount,
            transactions: []
        };

        // Only process transactions if both fromDate and toDate are provided
        if (fromDate && toDate) {
            // Calculate initial running balance from opening balance
            let initialRunningBalance = openingBalance.type === 'Cr' ? openingBalance.amount : -openingBalance.amount;

            // Get transactions before the date range to calculate correct initial balance
            const transactionsBeforeRange = await Transaction.find({
                company: companyId,
                account: accountId,
                isActive: true,
                date: { $lt: new Date(fromDate) },
                $or: [
                    {
                        billId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash sales
                    },
                    {
                        purchaseBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash purchases
                    },
                    {
                        purchaseReturnBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash purchase returns
                    },
                    {
                        salesReturnBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash sales returns
                    },
                    { paymentAccountId: { $exists: true } },
                    { receiptAccountId: { $exists: true } },
                    { journalBillId: { $exists: true } },
                    { debitNoteId: { $exists: true } },
                    { creditNoteId: { $exists: true } },
                ],
            })
                .sort({ date: 1 })
                .lean()
                .exec();

            // Calculate running balance up to the start of the date range
            for (const transaction of transactionsBeforeRange) {
                if (transaction.billId) {
                    initialRunningBalance -= transaction.debit;
                } else if (transaction.salesReturnBillId) {
                    initialRunningBalance += transaction.credit;
                } else if (transaction.purchaseBillId) {
                    initialRunningBalance += transaction.credit;
                } else if (transaction.purchaseReturnBillId) {
                    initialRunningBalance -= transaction.debit;
                } else if (transaction.paymentAccountId) {
                    if (transaction.debit > 0) initialRunningBalance -= transaction.debit;
                    if (transaction.credit > 0) initialRunningBalance += transaction.credit;
                } else if (transaction.receiptAccountId) {
                    if (transaction.debit > 0) initialRunningBalance -= transaction.debit;
                    if (transaction.credit > 0) initialRunningBalance += transaction.credit;
                } else if (transaction.debitNoteId || transaction.creditNoteId || transaction.journalBillId) {
                    if (transaction.debit > 0) initialRunningBalance -= transaction.debit;
                    if (transaction.credit > 0) initialRunningBalance += transaction.credit;
                }
            }

            // Get transactions within the date range
            const startDate = new Date(fromDate);
            const endDate = new Date(toDate);
            endDate.setHours(23, 59, 59, 999);

            const transactions = await Transaction.find({
                company: companyId,
                account: accountId,
                isActive: true,
                date: {
                    $gte: startDate,
                    $lte: endDate
                },
                $or: [
                    {
                        billId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash sales
                    },
                    {
                        purchaseBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash purchases
                    },
                    {
                        purchaseReturnBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash purchase returns
                    },
                    {
                        salesReturnBillId: { $exists: true },
                        paymentMode: { $ne: 'cash' } // Exclude cash sales returns
                    },
                    { paymentAccountId: { $exists: true } },
                    { receiptAccountId: { $exists: true } },
                    { journalBillId: { $exists: true } },
                    { debitNoteId: { $exists: true } },
                    { creditNoteId: { $exists: true } },
                ],
            })
                .populate('billId')
                .populate('purchaseBillId')
                .populate('purchaseReturnBillId')
                .populate('salesReturnBillId')
                .populate('paymentAccountId')
                .populate('receiptAccountId')
                .populate('journalBillId')
                .populate('debitNoteId')
                .populate('creditNoteId')
                .sort({ date: 1 })
                .lean()
                .exec();

            // Process transactions with the initial running balance
            let runningBalance = initialRunningBalance;
            agingData.transactions = [];

            for (const transaction of transactions) {
                // Calculate age in days
                let age;
                if (companyDateFormat === 'nepali') {
                    try {
                        const nepaliTransactionDate = new Date(transaction.date);
                        const nepaliCurrentDate = new Date(nepaliDate);
                        age = (nepaliCurrentDate - nepaliTransactionDate) / (1000 * 60 * 60 * 24);
                    } catch (error) {
                        age = 0;
                    }
                } else {
                    try {
                        age = (today - transaction.date) / (1000 * 60 * 60 * 24);
                    } catch (error) {
                        age = 0;
                    }
                }

                // Update running balance based on transaction type
                if (transaction.billId) {
                    runningBalance -= transaction.debit;
                    agingData.totalOutstanding += transaction.debit;
                } else if (transaction.salesReturnBillId) {
                    runningBalance += transaction.credit;
                    agingData.totalOutstanding -= transaction.credit;
                } else if (transaction.purchaseBillId) {
                    runningBalance += transaction.credit;
                    agingData.totalOutstanding -= transaction.credit;
                } else if (transaction.purchaseReturnBillId) {
                    runningBalance -= transaction.debit;
                    agingData.totalOutstanding += transaction.debit;
                } else if (transaction.paymentAccountId) {
                    if (transaction.debit > 0) runningBalance -= transaction.debit;
                    if (transaction.credit > 0) runningBalance += transaction.credit;
                } else if (transaction.receiptAccountId) {
                    if (transaction.debit > 0) {
                        runningBalance -= transaction.debit;
                        agingData.totalOutstanding += transaction.debit;
                    }
                    if (transaction.credit > 0) {
                        runningBalance += transaction.credit;
                        agingData.totalOutstanding -= transaction.credit;
                    }
                } else if (transaction.debitNoteId || transaction.creditNoteId || transaction.journalBillId) {
                    if (transaction.debit > 0) {
                        runningBalance -= transaction.debit;
                        agingData.totalOutstanding += transaction.debit;
                    }
                    if (transaction.credit > 0) {
                        runningBalance += transaction.credit;
                        agingData.totalOutstanding -= transaction.credit;
                    }
                }

                // Add age information
                transaction.age = Math.round(age);
                transaction.ageCategory = age <= 30 ? '0-30 days' :
                    age <= 60 ? '31-60 days' :
                        age <= 90 ? '61-90 days' : '90+ days';

                // Categorize by age
                if (age <= 30) {
                    agingData.oneToThirty += transaction.debit - transaction.credit;
                } else if (age <= 60) {
                    agingData.thirtyOneToSixty += transaction.debit - transaction.credit;
                } else if (age <= 90) {
                    agingData.sixtyOneToNinety += transaction.debit - transaction.credit;
                } else {
                    agingData.ninetyPlus += transaction.debit - transaction.credit;
                }

                // Store running balance and add to transactions list
                transaction.balance = runningBalance;
                agingData.transactions.push(transaction);
            }

            // Include opening balance in the total outstanding calculation
            agingData.totalOutstanding += agingData.openingBalance;
        }

        res.render('retailer/outstanding/dayCountAgeing', {
            company,
            currentFiscalYear,
            accounts,
            account,
            agingData,
            currentCompany,
            companyDateFormat,
            nepaliDate,
            currentCompanyName,
            fromDate: fromDate || '',
            toDate: toDate || '',
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor',
            hasDateFilter: !!fromDate && !!toDate // Add flag to indicate if date filter is applied
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


router.post('/aging/merged', ensureAuthenticated, async (req, res) => {
    try {
        const { accountIds } = req.body;

        if (!accountIds || accountIds.length === 0) {
            return res.status(400).json({ error: 'No accounts selected. Please select at least one account.' });
        }

        return res.status(200).json({ success: true, accountIds });

    } catch (error) {
        console.error('Error in merging accounts:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/aging/mergedReport', ensureAuthenticated, async (req, res) => {
    try {
        const accountIds = req.query.accountIds ? req.query.accountIds.split(',') : [];
        const companyId = req.session.currentCompany;


        if (!accountIds || accountIds.length === 0) {
            return res.status(400).send('No accounts selected.');
        }

        const accounts = await Account.find({ _id: { $in: accountIds } });
        if (!accounts || accounts.length === 0) {
            return res.status(404).send('No accounts found.');
        }

        let mergedAgingData = {
            totalOutstanding: 0,
            oneToThirty: 0,
            thirtyOneToSixty: 0,
            sixtyOneToNinety: 0,
            ninetyPlus: 0,
            transactions: []
        };

        const today = new Date();
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english';

        // Check if fiscal year is already in the session or available in the company
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the fiscal year from the database if available in the session
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year is found in session or currentCompany, throw an error
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session for future requests
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year ID for use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session or company.' });
        }


        for (const accountId of accountIds) {
            const account = await Account.findById(accountId);
            if (!account) {
                console.error(`Account with ID ${accountId} not found.`);
                continue;
            }

            const openingBalance = account.openingBalance || { amount: 0, type: 'Cr' };
            let runningBalance = openingBalance.type === 'Cr' ? openingBalance.amount : -openingBalance.amount;

            const transactions = await Transaction.find({
                company: companyId,
                account: accountId,
                $or: [
                    { billId: { $exists: true } },
                    { purchaseBillId: { $exists: true } },
                    { purchaseReturnBillId: { $exists: true } },
                    { salesReturnBillId: { $exists: true } },
                    { paymentAccountId: { $exists: true } },
                    { receiptAccountId: { $exists: true } },
                    { journalBillId: { $exists: true } },
                    { debitNoteId: { $exists: true } },
                    { creditNoteId: { $exists: true } },
                ],
            }).sort({ date: 'asc' }).exec();

            let agingData = {
                totalOutstanding: 0,
                current: 0,
                oneToThirty: 0,
                thirtyOneToSixty: 0,
                sixtyOneToNinety: 0,
                ninetyPlus: 0,
                openingBalance: openingBalance.amount,
                transactions: [],
            };

            transactions.forEach((transaction) => {
                const transactionDateObject = new Date(transaction.date);
                const age = (today - transactionDateObject) / (1000 * 60 * 60 * 24);

                const transactionValue = transaction.debit - transaction.credit; // Calculate transaction value
                agingData.totalOutstanding += transactionValue;

                if (age <= 30) {
                    agingData.oneToThirty += transactionValue;
                } else if (age <= 60) {
                    agingData.thirtyOneToSixty += transactionValue;
                } else if (age <= 90) {
                    agingData.sixtyOneToNinety += transactionValue;
                } else {
                    agingData.ninetyPlus += transactionValue;
                }

                transaction.balance = runningBalance; // Update transaction balance
                runningBalance += transactionValue; // Update running balance
                agingData.transactions.push(transaction);
            });

            mergedAgingData.totalOutstanding += agingData.totalOutstanding;
            mergedAgingData.oneToThirty += agingData.oneToThirty;
            mergedAgingData.thirtyOneToSixty += agingData.thirtyOneToSixty;
            mergedAgingData.sixtyOneToNinety += agingData.sixtyOneToNinety;
            mergedAgingData.ninetyPlus += agingData.ninetyPlus;
            mergedAgingData.transactions.push(...agingData.transactions);
        }

        res.render('retailer/outstanding/mergedAging', {
            mergedAgingData,
            accounts,
            companyDateFormat,
            currentCompanyName: req.session.currentCompanyName,
            title: 'Outstanding Analysis',
            body: 'retailer >> account >> aging',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    } catch (error) {
        console.error('Error in generating merged aging report:', error);
        res.status(500).send('Internal Server Error');
    }
});




module.exports = router;
const express = require('express');
const router = express.Router();

//npm install pdfkit fs
const PDFDocument = require('pdfkit');
//npm install pdfkit fs
const { v4: uuidv4 } = require('uuid');

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Item = require('../../models/retailer/Item');
const SalesReturn = require('../../models/retailer/SalesReturn');
const Transaction = require('../../models/retailer/Transaction');
const { ensureAuthenticated, ensureCompanySelected, isLoggedIn } = require('../../middleware/auth');
// const BillCounter = require('../../models/retailer/salesReturnBillCounter');
const Account = require('../../models/retailer/Account');
const Settings = require('../../models/retailer/Settings');
const Company = require('../../models/retailer/Company');
const NepaliDate = require('nepali-date');
const { ensureTradeType } = require('../../middleware/tradeType');
const SalesBill = require('../../models/retailer/SalesBill');
const FiscalYear = require('../../models/retailer/FiscalYear');
const ensureFiscalYear = require('../../middleware/checkActiveFiscalYear');
const checkFiscalYearDateRange = require('../../middleware/checkFiscalYearDateRange');
const BillCounter = require('../../models/retailer/billCounter');
const { getNextBillNumber } = require('../../middleware/getNextBillNumber');


// Fetch all sales return bills
router.get('/sales-return/list', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
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

        const bills = await SalesReturn.find({ company: companyId })
            .sort({ date: 1 }) // Sort by date in ascending order (1 for ascending, -1 for descending)
            .populate('account')
            .populate('items.item')
            .populate('user');

        res.render('retailer/salesReturn/list', {
            company,
            currentFiscalYear,
            bills,
            currentCompany,
            currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

// Sales return Bill routes
router.get('/sales-return', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const items = await Item.find({ company: companyId }).populate('category').populate('unit');
        const bills = await SalesReturn.find({ company: companyId }).populate('account').populate('items.item');
        const salesInvoice = await SalesBill.find({ company: companyId });
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

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

        const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear });


        // // Get the next bill number
        // const billCounter = await BillCounter.findOne({ company: companyId });
        // const nextBillNumber = billCounter ? billCounter.count + 1 : 1;

        // Get the next bill number based on company, fiscal year, and transaction type ('sales')
        let billCounter = await BillCounter.findOne({
            company: companyId,
            fiscalYear: fiscalYear,
            transactionType: 'SalesReturn' // Specify the transaction type for sales bill
        });

        let nextBillNumber;
        if (billCounter) {
            nextBillNumber = billCounter.currentBillNumber + 1; // Increment the current bill number
        } else {
            nextBillNumber = 1; // Start with 1 if no bill counter exists for this fiscal year and company
        }
        res.render('retailer/salesReturn/salesReturnEntry', {
            company,
            accounts: accounts,
            items: items,
            bills: bills,
            nextBillNumber: nextBillNumber,
            nepaliDate: nepaliDate,
            transactionDateNepali,
            companyDateFormat,
            salesInvoice,
            user: req.user,
            currentCompanyName: req.session.currentCompanyName,
            currentFiscalYear,
            vatEnabled: company.vatEnabled,
            title: '',
            body: '',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    }
});

router.get('/sales-return/finds', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format Nepali date if necessary
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

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

        res.render('retailer/salesReturn/billNumberForm', {
            company,
            currentFiscalYear,
            currentCompanyName: req.session.currentCompanyName,
            date: new Date().toISOString().split('T')[0], // Today's date in ISO format
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
});

router.get('/sales-return/edit/billNumber', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const { billNumber } = req.query;
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format Nepali date if necessary
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

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

        const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear })
            .populate('transactions')
            .populate('companyGroups');
        console.log('Accounts:', accounts);

        // Find the stock adjustment by billNumber
        const salesReturnBill = await SalesReturn.findOne({ billNumber: billNumber, company: companyId, fiscalYear: fiscalYear })
            .populate('items.item')
            .populate('items.unit')
            .populate('account')
            .populate('company') // Populate company details
            .populate('user') // Populate user details
            .populate('fiscalYear'); // Populate fiscal year details

        if (!salesReturnBill || !salesReturnBill.items) {
            req.flash('error', 'Sales return invoice not found!');
            return res.redirect('/sales-return/finds')
        }

        res.render('retailer/salesReturn/edit', {
            salesReturnBill,
            accounts,
            items: salesReturnBill.items,
            company,
            vatEnabled: company.vatEnabled,
            currentFiscalYear,
            fiscalYear,
            currentCompanyName,
            companyDateFormat,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
});


router.post('/sales-return', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { accountId, items, vatPercentage, transactionDateNepali, transactionDateRoman, billDate, nepaliDate, isVatExempt, discountPercentage, paymentMode, roundOffAmount: manualRoundOffAmount } = req.body;
            const companyId = req.session.currentCompany;
            const currentFiscalYear = req.session.currentFiscalYear.id
            const fiscalYearId = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            const userId = req.user._id;

            console.log('Request Body:', req.body);

            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            let subTotal = 0;
            let vatAmount = 0;
            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;
            let hasVatableItems = false;
            let hasNonVatableItems = false;

            if (!companyId) {
                return res.status(400).json({ error: 'Company ID is required' });
            }

            const accounts = await Account.findOne({ _id: accountId, company: companyId });
            if (!accounts) {
                return res.status(400).json({ error: 'Invalid account for this company' });
            }

            // Validate each item before processing
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item);

                if (!product) {
                    req.flash('error', `Item with id ${item.item} not found`);
                    return res.redirect('/sales-return');
                }

                const itemTotal = parseFloat(item.price) * parseFloat(item.quantity, 10);
                subTotal += itemTotal;

                if (product.vatStatus === 'vatable') {
                    hasVatableItems = true;
                    totalTaxableAmount += itemTotal;
                } else {
                    hasNonVatableItems = true;
                    totalNonTaxableAmount += itemTotal;
                }
            }

            const billNumber = await getNextBillNumber(companyId, fiscalYearId, 'SalesReturn')

            // Check validation conditions after processing all items
            if (isVatExempt !== 'all') {
                if (isVatExemptBool && hasVatableItems) {
                    req.flash('error', 'Cannot save VAT exempt bill with vatable items');
                    return res.redirect('/sales-return');
                }

                if (!isVatExemptBool && hasNonVatableItems) {
                    req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
                    return res.redirect('/sales-return');
                }
            }

            // Apply discount proportionally to vatable and non-vatable items
            const discountForTaxable = (totalTaxableAmount * discount) / 100;
            const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;

            const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
            const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

            // Calculate VAT only for vatable items
            if (!isVatExemptBool || isVatAll || isVatExempt === 'all') {
                vatAmount = (finalTaxableAmount * vatPercentage) / 100;
            } else {
                vatAmount = 0;
            }

            let totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;
            let finalAmount = totalAmount;
            // Check if round off is enabled in settings
            let roundOffForSalesReturn = await Settings.findOne({ companyId, userId }); // Assuming you have a single settings document

            // Handle case where settings is null
            if (!roundOffForSalesReturn) {
                console.log('No settings found, using default settings or handling as required');
                roundOffForSalesReturn = { roundOffSalesReturn: false }; // Provide default settings or handle as needed
            }
            let roundOffAmount = 0;
            if (roundOffForSalesReturn.roundOffSalesReturn) {
                finalAmount = Math.round(finalAmount.toFixed(2)); // Round off final amount
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForSalesReturn.roundOffSalesReturn) {
                roundOffAmount = parseFloat(manualRoundOffAmount);
                finalAmount = totalAmount + roundOffAmount;
            }
            // Create new purchase bill
            const newBill = new SalesReturn({
                billNumber: billNumber,
                account: accountId,
                purchaseSalesReturnType: 'Sales Return',
                items: [], // We'll update this later
                isVatExempt: isVatExemptBool,
                isVatAll,
                vatPercentage: isVatExemptBool ? 0 : vatPercentage,
                subTotal,
                discountPercentage: discount,
                discountAmount: discountForTaxable + discountForNonTaxable,
                nonVatSalesReturn: finalNonTaxableAmount,
                taxableAmount: finalTaxableAmount,
                vatAmount,
                totalAmount: finalAmount,
                roundOffAmount: roundOffAmount,
                paymentMode,
                date: nepaliDate ? nepaliDate : new Date(billDate),
                transactionDate: transactionDateNepali ? transactionDateNepali : new Date(transactionDateRoman),
                company: companyId,
                user: userId,
                fiscalYear: currentFiscalYear,

            });

            // Create transactions
            let previousBalance = 0;
            const accountTransaction = await Transaction.findOne({ account: accountId }).sort({ transactionDate: -1 });
            if (accountTransaction) {
                previousBalance = accountTransaction.balance;
            }

            // Generate a unique ID for the stock entry
            const uniqueId = uuidv4();

            // FIFO stock addition function
            async function addStock(product, quantity, price, batchNumber, expiryDate, uniqueId) {
                // Ensure quantity is treated as a number
                const quantityNumber = Number(quantity);

                product.stockEntries.push({
                    quantity: quantityNumber,
                    price: price,
                    batchNumber: batchNumber,  // Add batch number
                    expiryDate: expiryDate,  // Add expiry date
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    mrp: price,
                    uniqueUuId: uniqueId,
                    salesReturnBillId: newBill._id,
                });

                // Ensure stock is incremented correctly as a number
                product.stock = (product.stock || 0) + quantityNumber;
                await product.save();
            }


            const billItems = [];

            // First process all items to update stock and build bill items
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item);

                if (!product) {
                    req.flash('error', `Item with id ${item.item} not found`);
                    return res.redirect('/purchase-bills');
                }

                // Update stock for each item (batch-level tracking)
                await addStock(
                    product, item.quantity, item.price, item.batchNumber, item.expiryDate, uniqueId
                );

                billItems.push({
                    item: product._id,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                    quantity: item.quantity,
                    price: item.price,
                    // mrp: item.mrp,
                    // marginPercentage: item.marginPercentage,
                    // currency: item.currency,
                    unit: item.unit,
                    vatStatus: product.vatStatus,
                    uniqueUuId: uniqueId
                });
            }

            // Create the transaction for this item
            const transaction = new Transaction({
                account: accountId,
                billNumber: billNumber,
                purchaseSalesReturnType: 'Sales Return',
                quantity: items[0].quantity,
                price: items[0].price,
                isType: 'SlRt',
                type: 'SlRt',
                salesReturnBillId: newBill._id,  // Set billId to the new bill's ID
                debit: 0,             // Debit is 0 for purchase transactions
                credit: newBill.totalAmount,    // Set credit to the item's total amount
                paymentMode: paymentMode,
                balance: previousBalance + newBill.totalAmount, // Update the balance based on item total
                date: nepaliDate ? nepaliDate : new Date(billDate),
                fiscalYear: currentFiscalYear,
                company: companyId,
                user: userId
            });

            await transaction.save();
            console.log('Transaction', transaction);

            // Create a transaction for the default Sales Account
            const salesRtnAmount = finalTaxableAmount + finalNonTaxableAmount;
            if (salesRtnAmount > 0) {
                const salesRtnAccount = await Account.findOne({ name: 'Sales', company: companyId });
                if (salesRtnAccount) {
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const salesTransaction = new Transaction({
                        account: salesRtnAccount._id,
                        billNumber: billNumber,
                        type: 'SlRt',
                        billId: newBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: salesRtnAmount,  // Debit the VAT account
                        credit: 0,// Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + salesRtnAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await salesTransaction.save();
                    console.log('Sales Transaction: ', salesTransaction);
                }
            }

            // Create a transaction for the VAT amount
            if (vatAmount > 0) {
                const vatAccount = await Account.findOne({ name: 'VAT', company: companyId });
                if (vatAccount) {
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const vatTransaction = new Transaction({
                        account: vatAccount._id,
                        billNumber: billNumber,
                        isType: 'VAT',
                        type: 'SlRt',
                        billId: newBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: vatAmount,  // Debit the VAT account
                        credit: 0,          // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + vatAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await vatTransaction.save();
                    console.log('Vat Transaction: ', vatTransaction);
                }
            }

            // Create a transaction for the round-off amount
            if (roundOffAmount > 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
                if (roundOffAccount) {
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: billNumber,
                        isType: 'RoundOff',
                        type: 'SlRt',
                        billId: newBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: 0,  // Debit the VAT account
                        credit: roundOffAmount,         // Credit is 0 for VAT transactions
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save();
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }

            if (roundOffAmount < 0) {
                const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
                if (roundOffAccount) {
                    const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                    if (!partyAccount) {
                        return res.status(400).json({ error: 'Party account not found.' });
                    }
                    const roundOffTransaction = new Transaction({
                        account: roundOffAccount._id,
                        billNumber: billNumber,
                        isType: 'RoundOff',
                        type: 'SlRt',
                        billId: newBill._id,
                        purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                        debit: Math.abs(roundOffAmount),  // Debit the VAT account
                        credit: 0, // Ensure roundOffAmount is not saved as a negative value
                        paymentMode: paymentMode,
                        balance: previousBalance + roundOffAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });
                    await roundOffTransaction.save();
                    console.log('Round-off Transaction: ', roundOffTransaction);
                }
            }


            // If payment mode is cash, also create a transaction for the "Cash in Hand" account
            if (paymentMode === 'cash') {
                const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId });
                if (cashAccount) {
                    const cashTransaction = new Transaction({
                        account: cashAccount._id,
                        billNumber: billNumber,
                        isType: 'SlRt',
                        type: 'SlRt',
                        salesReturnBillId: newBill._id,  // Set billId to the new bill's ID
                        purchaseSalesReturnType: 'Sales Return',
                        debit: 0,  // Debit is 0 for cash-in-hand as we're receiving cash
                        credit: finalAmount,  // Credit is the total amount since we're receiving cash
                        paymentMode: paymentMode,
                        balance: previousBalance + finalAmount, // Update the balance
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear,
                    });
                    await cashTransaction.save();
                }
            }

            // Update bill with items
            newBill.items = billItems;
            await newBill.save();

            if (req.query.print === 'true') {
                // Redirect to the print route
                res.redirect(`/sales-return/${newBill._id}/direct-print`);
            } else {
                // Redirect to the bills list or another appropriate page
                req.flash('success', 'Sales Return saved successfully!');
                res.redirect('/sales-return');
            }
        } catch (error) {
            console.error("Error creating sales return:", error);
            req.flash('error', 'Error creating sales return');
            res.redirect('/sales-return');
        }
    }
});

router.get('/sales-return/edit/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const billId = req.params.id;
            const companyId = req.session.currentCompany;
            const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
            const currentCompanyName = req.session.currentCompanyName;
            const currentCompany = await Company.findById(new ObjectId(companyId));
            const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
            const salesReturn = await SalesReturn.find({ company: companyId }).populate('account').populate('items.item');
            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
            const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');

            const items = await Item.find({ company: companyId })
                .populate('category')
                .populate('unit')
                .populate({
                    path: 'stockEntries',
                    match: { quantity: { $gt: 0 } },//Only fetch stock entries with remaining quantity
                    select: 'batchNumber expiryDate quantity'// Select only necessary fields
                });

            const initialCurrentFiscalYear = company.fiscalYear; // Assuming it's a single object


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

            const accounts = await Account.find({ company: companyId, fiscalYear: fiscalYear })
                .populate('transactions')
                .populate('companyGroups');
            console.log('Accounts:', accounts);

            //Find the bill by ID and populate relevant data
            const salesReturnBill = await SalesReturn.findById({ _id: billId, company: companyId, fiscalYear: fiscalYear })
                .populate({ path: 'items.item' })
                .populate('items.unit')
                .populate('account')
                .exec();

            if (!salesReturnBill || salesReturnBill.company.toString() !== companyId) {
                req.flash('error', 'Sales Return not found or does not belong to the selected company');
                return res.redirect('/sales-return/list');
            }

            console.log('Sales Return Bill Account: ', salesReturnBill.account);

            //Ensure selectedAccountId is set to the ID of the account linked to the bill
            const selectedAccountId = salesReturnBill.account ? salesReturnBill.account._id.toString() : null;

            console.log('Fetched Accounts:', accounts);
            console.log('Fetched Bill:', salesReturnBill);
            console.log('Selected Account ID:', selectedAccountId);

            // Render the edit page with the bill data
            res.render('retailer/salesReturn/edit', {
                company,
                items: salesReturnBill.items,
                salesReturnBill,
                vatEnabled: company.vatEnabled,
                billId: salesReturnBill._id,
                billNumber: salesReturnBill.billNumber,
                paymentMode: salesReturnBill.paymentMode,
                isVatExempt: salesReturnBill.isVatExempt,
                selectedAccountId: selectedAccountId,
                accounts: accounts,
                selectedAccountId: accounts,
                selectedAccountAddress: selectedAccountId.address || '',
                selectedAccountPan: selectedAccountId.pan || '',
                address: salesReturnBill.address,
                subTotal: salesReturnBill.subTotal,
                totalAmount: salesReturnBill.totalAmount,
                discountPercentage: salesReturnBill.discountPercentage,
                discountAmount: salesReturn.discountAmount,
                taxableAmount: salesReturnBill.taxableAmount,
                vatPercentage: salesReturnBill.vatPercentage,
                vatAmount: salesReturnBill.vatAmount,
                pan: salesReturnBill.pan,
                currentCompany,
                currentCompanyName,
                companyDateFormat,
                initialCurrentFiscalYear,
                currentFiscalYear,
                billDate: salesReturnBill.date,
                transactionDate: salesReturnBill.transactionDate,
                user: req.user,
                title: '',
                body: '',
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        } catch (error) {
            console.error("Error fetching bill for edit:", error);
            req.flash('error', 'Error fetching bill for edit');
            res.redirect('/sales-return/list')
        }
    }
});


// // PUT route to update a sales return bill
// router.put('/sales-return/edit/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
//     if (req.tradeType === 'retailer') {
//         const billId = req.params.id;
//         const {
//             accountId,
//             items,
//             vatPercentage,
//             transactionDateRoman,
//             transactionDateNepali,
//             billDate,
//             nepaliDate,
//             isVatExempt,
//             discountPercentage,
//             paymentMode,
//             roundOffAmount: manualRoundOffAmount,
//         } = req.body;


//         const companyId = req.session.currentCompany;
//         const currentFiscalYear = req.session.currentFiscalYear.id;
//         const userId = req.user._id;

//         if (!companyId) {
//             return res.status(400).json({ error: 'Company ID is required' });
//         }

//         const existingBill = await SalesReturn.findOne({ _id: billId, company: companyId });
//         if (!existingBill) {
//             req.flash('error', 'Bill not found');
//             return res.redirect('/sales-return/list');
//         }

//         // Step 1: Restore stock from the existing bill items
//         for (const existingItem of existingBill.items) {
//             const product = await Item.findById(existingItem.item);

//             const batchEntry = product.stockEntries.find(entry => entry.batchNumber === existingItem.batchNumber);
//             if (batchEntry) {
//                 batchEntry.quantity -= existingItem.quantity; // Restore stock for the existing item
//             } else {
//                 console.warn(`Batch number ${existingItem.batchNumber} not found for product: ${product.name}`);
//             }

//             await product.save(); // Save the updated product
//         }

//         console.log('Stock successfully reversed for existing bill items.');

//         // Delete all associated transactions
//         await Transaction.deleteMany({ billId });

//         console.log('Existing transactions deleted successfully');

//         // Calculate amounts based on the updated POST route logic
//         const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
//         const isVatAll = isVatExempt === 'all';
//         const discount = parseFloat(discountPercentage) || 0;

//         let totalTaxableAmount = 0;
//         let totalNonTaxableAmount = 0;

//         for (const item of items) {
//             const product = await Item.findById(item.item);
//             if (product.vatStatus) {
//                 totalTaxableAmount += item.quantity * item.price
//             }
//         }


//         const discountForTaxable = (totalTaxableAmount * discount) / 100;
//         const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;

//         const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
//         const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

//         let vatAmount = 0;
//         if (!isVatExemptBool || isVatExempt === 'all') {
//             vatAmount = (finalTaxableAmount * vatPercentage) / 100;
//         }

//         const totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;


//         let finalAmount = totalAmount;
//         let roundOffAmount = 0;

//         const roundOffForSalesReturn = await Settings.findOne({ companyId, userId, fiscalYear: currentFiscalYear }) || { roundOffSalesReturn: false };

//         if (roundOffForSalesReturn.roundOffSalesReturn) {
//             finalAmount = Math.round(finalAmount.toFixed(2));
//             roundOffAmount = finalAmount - totalAmount;
//         } else if (manualRoundOffAmount && !roundOffForSalesReturn.roundOffSalesReturn) {
//             roundOffAmount = parseFloat(manualRoundOffAmount);
//             finalAmount = totalAmount + roundOffAmount;
//         }

//         // Update existing bill
//         existingBill.account = accountId;
//         existingBill.isVatExempt = isVatExemptBool;
//         existingBill.vatPercentage = isVatExemptBool ? 0 : vatPercentage;
//         existingBill.subTotal = totalTaxableAmount + totalNonTaxableAmount;
//         existingBill.discountPercentage = discount;
//         existingBill.discountAmount = discountForTaxable + discountForNonTaxable;
//         existingBill.nonVatSales = finalNonTaxableAmount;
//         existingBill.taxableAmount = finalTaxableAmount;
//         existingBill.vatAmount = vatAmount;
//         existingBill.totalAmount = finalAmount;
//         existingBill.roundOffAmount = roundOffAmount;
//         existingBill.paymentMode = paymentMode;
//         existingBill.date = nepaliDate || new Date(billDate);
//         existingBill.transactionDate = transactionDateNepali || new Date(transactionDateRoman);

//         //FIFO stock addition function
//         async function addStock(product, batchNumber, expiryDate, quantity, price, puPrice, marginPercentage, mrp) {
//             // Ensure quantity is treated as a number
//             const quantityNumber = Number(quantity);

//             const stockEntry = {
//                 date: nepaliDate ? nepaliDate : new Date(billDate),
//                 quantity: quantityNumber,
//                 batchNumber: batchNumber,
//                 expiryDate: expiryDate,
//                 price: price,
//                 // puPrice: puPrice,
//                 // mrp: mrp,
//                 // marginPercentage: marginPercentage,
//             };


//             // Debug: log stock entry to ensure values are correct
//             console.log('Stock Entry:', stockEntry);
//             product.stockEntries.push(stockEntry); // Add entry to stockEntries array
//             // Ensure stock is incremented correctly as a number
//             product.stock = (product.stock || 0) + quantityNumber;
//             await product.save();
//         }


//         const billItems = await Promise.all(items.map(async item => {
//             const product = await Item.findById(item.item);

//             // Increment stock quantity using FIFO
//             await addStock(product, item.batchNumber, item.expiryDate, item.quantity, item.price, item.puPrice, item.marginPercentage, item.mrp);

//             return {
//                 item: product._id,
//                 quantity: item.quantity,
//                 price: item.price,
//                 unit: item.unit,
//                 batchNumber: item.batchNumber,
//                 expiryDate: item.expiryDate,
//                 vatStatus: product.vatStatus,
//                 fiscalYear: currentFiscalYear,
//             };
//         }));

//         existingBill.items = billItems;

//         // After updating the existingBill.items, reinserting transactions
//         const billItemsTransactions = await Promise.all(existingBill.items.map(async item => {
//             const product = await Item.findById(item.item);

//             if (!product) {
//                 throw new Error(`Product with ID ${item.item} not found`);
//             }

//             // Create a transaction for each item
//             const transaction = new Transaction({
//                 item: product._id,
//                 account: accountId,
//                 billNumber: existingBill.billNumber,
//                 quantity: item.quantity,
//                 price: item.price,
//                 unit: item.unit,
//                 type: 'SlRt',
//                 salesReturnBillId: existingBill._id,
//                 purchaseSalesReturnType: 'Sales Return',
//                 debit: 0, // Update as per your logic
//                 credit: finalAmount, // Since it's a sale
//                 paymentMode: paymentMode,
//                 balance: 0, // Update with the correct balance logic if needed
//                 date: nepaliDate ? nepaliDate : new Date(billDate),
//                 company: companyId,
//                 user: userId,
//                 fiscalYear: currentFiscalYear
//             });

//             await transaction.save();
//             console.log('Transaction created:', transaction);

//             return transaction; // Optional, if you need to track the transactions created
//         }));

//         console.log('All transactions successfully created for updated bill.');

//         await existingBill.save();



//         // Create a transaction for the default Sales Account
//         const salesRtnAmount = finalTaxableAmount + finalNonTaxableAmount;
//         if (salesRtnAmount > 0) {
//             const salesRtnAccount = await Account.findOne({ name: 'Sales', company: companyId });
//             if (salesRtnAccount) {
//                 const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
//                 if (!partyAccount) {
//                     return res.status(400).json({ error: 'Party account not found.' });
//                 }
//                 const salesTransaction = new Transaction({
//                     account: salesRtnAccount._id,
//                     billNumber: existingBill.billNumber,
//                     type: 'SlRt',
//                     billId: existingBill._id,
//                     purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
//                     debit: salesRtnAmount,  // Debit the VAT account
//                     credit: 0,// Credit is 0 for VAT transactions
//                     paymentMode: paymentMode,
//                     balance: 0, // Update the balance
//                     date: nepaliDate ? nepaliDate : new Date(billDate),
//                     company: companyId,
//                     user: userId,
//                     fiscalYear: currentFiscalYear
//                 });
//                 await salesTransaction.save();
//                 console.log('Sales Transaction: ', salesTransaction);
//             }
//         }

//         // Create a transaction for the VAT amount
//         if (vatAmount > 0) {
//             const vatAccount = await Account.findOne({ name: 'VAT', company: companyId });
//             if (vatAccount) {
//                 const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
//                 if (!partyAccount) {
//                     return res.status(400).json({ error: 'Party account not found.' });
//                 }
//                 const vatTransaction = new Transaction({
//                     account: vatAccount._id,
//                     billNumber: existingBill.billNumber,
//                     isType: 'VAT',
//                     type: 'SlRt',
//                     billId: existingBill._id,
//                     purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
//                     debit: vatAmount,  // Debit the VAT account
//                     credit: 0,          // Credit is 0 for VAT transactions
//                     paymentMode: paymentMode,
//                     balance: 0, // Update the balance
//                     date: nepaliDate ? nepaliDate : new Date(billDate),
//                     company: companyId,
//                     user: userId,
//                     fiscalYear: currentFiscalYear
//                 });
//                 await vatTransaction.save();
//                 console.log('Vat Transaction: ', vatTransaction);
//             }
//         }

//         // Create a transaction for the round-off amount
//         if (roundOffAmount > 0) {
//             const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
//             if (roundOffAccount) {
//                 const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
//                 if (!partyAccount) {
//                     return res.status(400).json({ error: 'Party account not found.' });
//                 }
//                 const roundOffTransaction = new Transaction({
//                     account: roundOffAccount._id,
//                     billNumber: existingBill.billNumber,
//                     isType: 'RoundOff',
//                     type: 'SlRt',
//                     billId: existingBill._id,
//                     purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
//                     debit: 0,  // Debit the VAT account
//                     credit: roundOffAmount,         // Credit is 0 for VAT transactions
//                     paymentMode: paymentMode,
//                     balance: 0, // Update the balance
//                     date: nepaliDate ? nepaliDate : new Date(billDate),
//                     company: companyId,
//                     user: userId,
//                     fiscalYear: currentFiscalYear
//                 });
//                 await roundOffTransaction.save();
//                 console.log('Round-off Transaction: ', roundOffTransaction);
//             }
//         }

//         if (roundOffAmount < 0) {
//             const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
//             if (roundOffAccount) {
//                 const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
//                 if (!partyAccount) {
//                     return res.status(400).json({ error: 'Party account not found.' });
//                 }
//                 const roundOffTransaction = new Transaction({
//                     account: roundOffAccount._id,
//                     billNumber: existingBill.billNumber,
//                     isType: 'RoundOff',
//                     type: 'SlRt',
//                     billId: existingBill._id,
//                     purchaseSalesReturnType: partyAccount.name,  // Save the party account name in purchaseSalesType,
//                     debit: Math.abs(roundOffAmount),  // Debit the VAT account
//                     credit: 0, // Ensure roundOffAmount is not saved as a negative value
//                     paymentMode: paymentMode,
//                     balance: 0, // Update the balance
//                     date: nepaliDate ? nepaliDate : new Date(billDate),
//                     company: companyId,
//                     user: userId,
//                     fiscalYear: currentFiscalYear
//                 });
//                 await roundOffTransaction.save();
//                 console.log('Round-off Transaction: ', roundOffTransaction);
//             }
//         }
//         if (paymentMode === 'cash') {
//             const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId });

//             if (cashAccount) {
//                 const cashTransaction = new Transaction({
//                     account: cashAccount._id,
//                     billNumber: existingBill.billNumber,
//                     type: 'SlRt',
//                     salesReturnBillId: existingBill._id,
//                     purchaseSalesReturnType: 'Sales Return',
//                     debit: finalAmount, // The cash amount received
//                     credit: 0,
//                     paymentMode: paymentMode,
//                     balance: 0, // Adjust with the correct balance logic
//                     date: nepaliDate ? nepaliDate : new Date(billDate),
//                     company: companyId,
//                     user: userId,
//                     fiscalYear: currentFiscalYear
//                 });

//                 await cashTransaction.save();
//                 console.log('Cash transaction created:', cashTransaction);
//             }
//         }

//         req.flash('success', 'Bill updated successfully');
//         res.redirect(`/sales-return/edit/${billId}`);
//     }
// })

// // PUT route to update a sales return bill
// router.put('/sales-return/edit/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
//     if (req.tradeType === 'retailer') {
//         const session = await mongoose.startSession();
//         session.startTransaction();

//         const billId = req.params.id;
//         const { accountId, items, vatPercentage, transactionDateRoman, transactionDateNepali, billDate, nepaliDate, isVatExempt, discountPercentage, paymentMode, roundOffAmount: manualRoundOffAmount, } = req.body;

//         const companyId = req.session.currentCompany;
//         const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
//         const currentFiscalYear = req.session.currentFiscalYear.id;
//         const userId = req.user._id;

//         if (!companyId) {
//             req.flash('error', `Company ID is required.`);
//             await session.abortTransaction();
//             return res.redirect(`/sales-return/edit/${billId}`);
//         }
//         if (!isVatExempt) {
//             req.flash('error', `Invalid vat selection.`);
//             await session.abortTransaction();
//             return res.redirect(`/sales-return/edit/${billId}`);
//         }
//         if (!paymentMode) {
//             req.flash('error', `Invalid payment mode.`);
//             await session.abortTransaction();
//             return res.redirect(`/sales-return/edit/${billId}`);
//         }

//         const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'
//         if (companyDateFormat === 'nepali') {
//             if (!transactionDateNepali) {
//                 req.flash('error', `Invalid transaction date.`);
//                 await session.abortTransaction();
//                 return res.redirect(`/sales-return/edit/${billId}`);
//             }
//             if (!nepaliDate) {
//                 req.flash('error', `Invalid invoice date.`);
//                 await session.abortTransaction();
//                 return res.redirect(`/sales-return/edit/${billId}`);
//             }
//         } else {
//             if (!transactionDateRoman) {
//                 req.flash('error', `Invalid transaction date.`);
//                 await session.abortTransaction();
//                 return res.redirect(`/sales-return/edit/${billId}`);
//             }
//             if (!billDate) {
//                 req.flash('error', `Invalid invoice date.`);
//                 await session.abortTransaction();
//                 return res.redirect(`/sales-return/edit/${billId}`);
//             }
//         }

//         try {
//             const existingBill = await SalesReturn.findOne({ _id: billId, company: companyId }).session(session);
//             if (!existingBill) {
//                 req.flash('error', 'Bill not found');
//                 await session.abortTransaction();
//                 return res.redirect('/sales-return/list');
//             }

//             // Check if stock is used fully or partially
//             let isStockUsed = false;

//             for (const existingItem of existingBill.items) {
//                 const product = await Item.findById(existingItem.item).session(session);

//                 if (!product) continue; // Skip if product not found

//                 // Find the exact stock entry matching the batch number, date and uniqueUuId
//                 const stockEntry = product.stockEntries.find(entry =>
//                     entry.batchNumber === existingItem.batchNumber &&
//                     new Date(entry.date).toDateString() === new Date(existingBill.date).toDateString() &&
//                     entry.uniqueUuId === existingItem.uniqueUuId // Match the purchase bill ID
//                 );

//                 console.log('Stock Entry:', stockEntry);
//                 console.log('Stock Entry Quantity:', stockEntry.quantity);
//                 console.log('Existing Item Quantity:', existingItem.quantity);

//                 if (!stockEntry || stockEntry.quantity < existingItem.quantity) {
//                     isStockUsed = true;
//                     break;
//                 }
//             }

//             // If stock is used, prevent editing
//             if (isStockUsed) {
//                 req.flash('error', 'Could not edit, Stock is used!');
//                 await session.abortTransaction();
//                 return res.redirect(`/sales-return/edit/${billId}`);
//             }

//             // Process stock updates only if stock is not used
//             for (const existingItem of existingBill.items) {
//                 const product = await Item.findById(existingItem.item).session(session);

//                 if (!product) continue;

//                 const stockEntryIndex = product.stockEntries.findIndex(entry =>
//                     entry.batchNumber === existingItem.batchNumber &&
//                     new Date(entry.date).toDateString() === new Date(existingBill.date).toDateString() &&
//                     entry.uniqueUuId === existingItem.uniqueUuId // Match the purchase bill ID
//                 );

//                 if (stockEntryIndex !== -1) {
//                     const stockEntry = product.stockEntries[stockEntryIndex];
//                     stockEntry.quantity -= existingItem.quantity;

//                     if (stockEntry.quantity <= 0) {
//                         product.stockEntries.splice(stockEntryIndex, 1);
//                     }

//                     product.stock = product.stockEntries.reduce((total, entry) => total + entry.quantity, 0);
//                     await product.save({ session });
//                 }
//             }

//             const removedItems = existingBill.items.filter(existingItem => {
//                 return !items.some(item =>
//                     item.item.toString() === existingItem.item.toString() &&
//                     item.uniqueUuId === existingItem.uniqueUuId
//                 );
//             });

//             for (const removedItem of removedItems) {
//                 const product = await Item.findById(removedItem.item).session(session);

//                 if (!product) continue;

//                 // Find the stock entry for the removed item
//                 const stockEntryIndex = product.stockEntries.findIndex(entry =>
//                     entry.batchNumber === removedItem.batchNumber &&
//                     new Date(entry.date).toDateString() === new Date(existingBill.date).toDateString() &&
//                     entry.uniqueUuId === existingItem.uniqueUuId
//                 );

//                 if (stockEntryIndex !== -1) {
//                     const stockEntry = product.stockEntries[stockEntryIndex];

//                     // Add the removed quantity back to the stock entry
//                     stockEntry.quantity += removedItem.quantity;

//                     // If the stock entry quantity is zero or negative, remove it
//                     if (stockEntry.quantity <= 0) {
//                         product.stockEntries.splice(stockEntryIndex, 1);
//                     }

//                     // Update the total stock
//                     product.stock = product.stockEntries.reduce((total, entry) => total + entry.quantity, 0);

//                     await product.save({ session });
//                 }
//             }

//             // Delete removed items from the PurchaseBill
//             existingBill.items = existingBill.items.filter(existingItem => {
//                 return items.some(item =>
//                     item.item.toString() === existingItem.item.toString() &&
//                     item.uniqueUuId === existingItem.uniqueUuId
//                 );
//             });

//             // // Step 1: Restore stock from the existing bill items
//             // for (const existingItem of existingBill.items) {
//             //     const product = await Item.findById(existingItem.item);

//             //     const batchEntry = product.stockEntries.find(entry => entry.batchNumber === existingItem.batchNumber);
//             //     if (batchEntry) {
//             //         batchEntry.quantity -= existingItem.quantity; // Restore stock for the existing item
//             //     } else {
//             //         console.warn(`Batch number ${existingItem.batchNumber} not found for product: ${product.name}`);
//             //     }

//             //     await product.save(); // Save the updated product
//             // }

//             // console.log('Stock successfully reversed for existing bill items.');

//             // Delete all associated transactions
//             await Transaction.deleteMany({ salesReturnBillId: existingBill._id }).session(session);
//             console.log('Existing transactions deleted successfully');

//             // Calculate amounts based on the updated POST route logic
//             const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
//             const isVatAll = isVatExempt === 'all';
//             const discount = parseFloat(discountPercentage) || 0;

//             let totalTaxableAmount = 0;
//             let totalNonTaxableAmount = 0;
//             let hasVatableItems = false;
//             let hasNonVatableItems = false;

//             for (const item of items) {
//                 const product = await Item.findById(item.item).session(session);
//                 if (product.vatStatus === 'vatable') {
//                     hasVatableItems = true;
//                     totalTaxableAmount += item.quantity * item.puPrice;
//                 } else {
//                     hasNonVatableItems = true;
//                     totalNonTaxableAmount += item.quantity * item.puPrice;
//                 }
//             }

//             // Check validation conditions after processing all items
//             if (isVatExempt !== 'all') {
//                 if (isVatExemptBool && hasVatableItems) {
//                     req.flash('error', 'Cannot save VAT exempt bill with vatable items');
//                     await session.abortTransaction();
//                     return res.redirect('/purchase-bills');
//                 }

//                 if (!isVatExemptBool && hasNonVatableItems) {
//                     req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
//                     await session.abortTransaction();
//                     return res.redirect('/purchase-bills');
//                 }
//             }


//             const discountForTaxable = (totalTaxableAmount * discount) / 100;
//             const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;

//             const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
//             const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

//             let vatAmount = 0;
//             // Calculate VAT only for vatable items
//             if (!isVatExemptBool || isVatAll || isVatExempt === 'all') {
//                 vatAmount = (finalTaxableAmount * vatPercentage) / 100;
//             } else {
//                 vatAmount = 0;
//             }

//             let roundOffAmount = 0;

//             let totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;
//             let finalAmount = totalAmount;

//             const roundOffForSalesReturn = await Settings.findOne({ companyId, userId, fiscalYear: currentFiscalYear }) || { roundOffSalesReturn: false };

//             if (roundOffForSalesReturn.roundOffSalesReturn) {
//                 finalAmount = Math.round(finalAmount.toFixed(2));
//                 roundOffAmount = finalAmount - totalAmount;
//             } else if (manualRoundOffAmount && !roundOffForSalesReturn.roundOffSalesReturn) {
//                 roundOffAmount = parseFloat(manualRoundOffAmount);
//                 finalAmount = totalAmount + roundOffAmount;
//             }

//             // Update existing bill
//             existingBill.account = accountId;
//             existingBill.isVatExempt = isVatExemptBool;
//             existingBill.vatPercentage = isVatExemptBool ? 0 : vatPercentage;
//             existingBill.subTotal = totalTaxableAmount + totalNonTaxableAmount;
//             existingBill.discountPercentage = discount;
//             existingBill.discountAmount = discountForTaxable + discountForNonTaxable;
//             existingBill.nonVatSales = finalNonTaxableAmount;
//             existingBill.taxableAmount = finalTaxableAmount;
//             existingBill.vatAmount = vatAmount;
//             existingBill.isVatAll = isVatAll;
//             existingBill.totalAmount = finalAmount;
//             existingBill.roundOffAmount = roundOffAmount;
//             existingBill.paymentMode = paymentMode;
//             existingBill.date = nepaliDate || new Date(billDate);
//             existingBill.transactionDate = transactionDateNepali || new Date(transactionDateRoman);

//             // FIFO stock addition function
//             async function addStock(product, batchNumber, expiryDate, quantity, price, uniqueUuId, isUpdate = false, puPrice, marginPercentage, mrp,) {
//                 const quantityNumber = Number(quantity);

//                 const stockEntry = {
//                     date: nepaliDate ? nepaliDate : new Date(billDate),
//                     quantity: quantityNumber,
//                     batchNumber: batchNumber,
//                     expiryDate: expiryDate,
//                     price: price,
//                     uniqueUuId: uniqueUuId,
//                 };

//                 console.log('Stock Entry:', stockEntry);

//                 if (isUpdate) {
//                     // Find existing stock entry
//                     const stockEntryIndex = product.stockEntries.findIndex(
//                         (entry) => entry.batchNumber === batchNumber && entry.expiryDate === expiryDate
//                     );

//                     if (stockEntryIndex !== -1) {
//                         // Update existing stock entry
//                         const existingStockEntry = product.stockEntries[stockEntryIndex];
//                         const updatedUniqueUuId = uniqueUuId !== undefined ? uniqueUuId : existingStockEntry.uniqueUuId;

//                         product.stockEntries[stockEntryIndex] = {
//                             ...existingStockEntry,
//                             date: nepaliDate ? nepaliDate : new Date(billDate),
//                             batchNumber: batchNumber,
//                             expiryDate: expiryDate,
//                             quantity: totalQuantity,
//                             price: price !== undefined ? price : existingStockEntry.price,
//                             uniqueUuId: updatedUniqueUuId,
//                         };
//                     } else {
//                         product.stockEntries.push(stockEntry);
//                     }
//                 } else {
//                     product.stockEntries.push(stockEntry);
//                 }

//                 // product.stockEntries.push(stockEntry);
//                 // product.stock = (product.stock || 0) + quantityNumber;
//                 // Update total stock (quantity + bonus)
//                 product.stock = product.stockEntries.reduce((total, entry) => total + entry.quantity, 0);
//                 await product.save({ session });
//             }

//             const billItems = [...existingBill.items]; // Retain existing items
//             // const billItems = await Promise.all(items.map(async item => {
//             //     const product = await Item.findById(item.item);
//             //     await addStock(product, item.batchNumber, item.expiryDate, item.quantity, item.price, item.puPrice, item.marginPercentage, item.mrp);

//             for (let i = 0; i < items.length; i++) {
//                 const item = items[i];
//                 const product = await Item.findById(item.item).session(session);

//                 if (!product) {
//                     req.flash('error', `Item with id ${item.item} not found`);
//                     await session.abortTransaction();
//                     return res.redirect('/purchase-bills');
//                 }

//                 const existingBillItemIndex = billItems.findIndex(billItem =>
//                     billItem.item && billItem.item.toString() === item.item
//                 );
//                 if (existingBillItemIndex !== -1) {
//                     // If item exists, update fields but retain existing values if not provided
//                     const existingBillItem = billItems[existingBillItemIndex];
//                     billItems[existingBillItemIndex] = {
//                         ...existingBillItem, // Retain existing properties
//                         date: nepaliDate ? nepaliDate : new Date(billDate),
//                         batchNumber: item.batchNumber, // Update to new batch number
//                         expiryDate: item.expiryDate,
//                         quantity: Number(item.quantity),
//                         price: item.price !== undefined && item.price !== "" ? item.price : existingBillItem.price, // Retain existing price if not provided
//                         uniqueUuId: item.uniqueUuId !== undefined && item.uniqueUuId !== "" ? item.uniqueUuId : existingBillItem.uniqueUuId,
//                         unit: item.unit,
//                         vatStatus: product.vatStatus
//                     };
//                 } else {
//                     // Add new item to the bill
//                     // Generate new uniqueUuId for new item
//                     const newUniqueId = uuidv4();
//                     billItems.push({
//                         item: product._id,
//                         batchNumber: item.batchNumber,
//                         expiryDate: item.expiryDate,
//                         quantity: item.quantity,
//                         price: item.price,
//                         unit: item.unit,
//                         vatStatus: product.vatStatus,
//                         uniqueUuId: newUniqueId,
//                     });
//                     // Use the same uniqueUuId for the stock entry
//                     item.uniqueUuId = newUniqueId;
//                 }

//                 const existingTransaction = await Transaction.findOne({
//                     item: product._id,
//                     salesReturnBillId: existingBill._id,
//                 }).session(session);

//                 if (existingTransaction) {
//                     // If transaction exists, update it instead of adding a new row
//                     existingTransaction.batchNumber = item.batchNumber; // Update batch number
//                     existingTransaction.quantity = item.quantity;
//                     existingTransaction.price = item.price;
//                     existingTransaction.unit = item.unit;
//                     existingTransaction.credit = finalAmount;
//                     existingTransaction.paymentMode = paymentMode;
//                     existingTransaction.date = nepaliDate ? nepaliDate : new Date(billDate);

//                     await existingTransaction.save({ session });
//                 } else {
//                     // If no existing transaction, create a new one
//                     const transaction = new Transaction({
//                         item: product._id,
//                         batchNumber: item.batchNumber, // Add batch number field
//                         account: accountId,
//                         billNumber: existingBill.billNumber,
//                         quantity: item.quantity,
//                         unit: item.unit,
//                         isType: 'SlRt',
//                         type: 'SlRt',
//                         salesReturnBillId: existingBill._id,
//                         purchaseSalesType: 'Sales Return',
//                         debit: 0,
//                         credit: existingBill.totalAmount,
//                         paymentMode: paymentMode,
//                         balance: 0,
//                         date: nepaliDate ? nepaliDate : new Date(billDate),
//                         company: companyId,
//                         user: userId,
//                         fiscalYear: currentFiscalYear
//                     });

//                     await transaction.save({ session });
//                 }


//                 // Increment stock quantity using FIFO
//                 await addStock(
//                     product,
//                     item.batchNumber,
//                     item.expiryDate,
//                     item.quantity,
//                     item.price,
//                     item.uniqueUuId, // Use the same uniqueUuId for stock entry
//                     existingBillItemIndex !== -1 // isUpdate flag
//                 );



//                 // existingBill.items = billItems;

//                 // // Create a single transaction for the party account
//                 // const partyTransaction = new Transaction({
//                 //     account: accountId,
//                 //     billNumber: existingBill.billNumber,
//                 //     type: 'SlRt',
//                 //     salesReturnBillId: existingBill._id,
//                 //     purchaseSalesReturnType: 'Sales Return',
//                 //     debit: 0,
//                 //     credit: existingBill.totalAmount,
//                 //     paymentMode: paymentMode,
//                 //     balance: 0,
//                 //     date: nepaliDate ? nepaliDate : new Date(billDate),
//                 //     company: companyId,
//                 //     user: userId,
//                 //     fiscalYear: currentFiscalYear
//                 // });
//                 // await partyTransaction.save();
//                 // console.log('Party transaction created:', partyTransaction);

//                 // Create a transaction for the default Sales Account
//                 const salesRtnAmount = finalTaxableAmount + finalNonTaxableAmount;
//                 if (salesRtnAmount > 0) {
//                     const salesRtnAccount = await Account.findOne({ name: 'Sales', company: companyId });
//                     if (salesRtnAccount) {
//                         const partyAccount = await Account.findById(accountId);
//                         if (!partyAccount) {
//                             return res.status(400).json({ error: 'Party account not found.' });
//                         }
//                         const salesTransaction = new Transaction({
//                             account: salesRtnAccount._id,
//                             billNumber: existingBill.billNumber,
//                             type: 'SlRt',
//                             billId: existingBill._id,
//                             purchaseSalesReturnType: partyAccount.name,
//                             debit: salesRtnAmount,
//                             credit: 0,
//                             paymentMode: paymentMode,
//                             balance: 0,
//                             date: nepaliDate ? nepaliDate : new Date(billDate),
//                             company: companyId,
//                             user: userId,
//                             fiscalYear: currentFiscalYear
//                         });
//                         await salesTransaction.save();
//                         console.log('Sales Transaction: ', salesTransaction);
//                     }
//                 }

//                 // Create a transaction for the VAT amount
//                 if (vatAmount > 0) {
//                     const vatAccount = await Account.findOne({ name: 'VAT', company: companyId });
//                     if (vatAccount) {
//                         const partyAccount = await Account.findById(accountId);
//                         if (!partyAccount) {
//                             return res.status(400).json({ error: 'Party account not found.' });
//                         }
//                         const vatTransaction = new Transaction({
//                             account: vatAccount._id,
//                             billNumber: existingBill.billNumber,
//                             isType: 'VAT',
//                             type: 'SlRt',
//                             billId: existingBill._id,
//                             purchaseSalesReturnType: partyAccount.name,
//                             debit: vatAmount,
//                             credit: 0,
//                             paymentMode: paymentMode,
//                             balance: 0,
//                             date: nepaliDate ? nepaliDate : new Date(billDate),
//                             company: companyId,
//                             user: userId,
//                             fiscalYear: currentFiscalYear
//                         });
//                         await vatTransaction.save();
//                         console.log('Vat Transaction: ', vatTransaction);
//                     }
//                 }

//                 // Create a transaction for the round-off amount
//                 if (roundOffAmount !== 0) {
//                     const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
//                     if (roundOffAccount) {
//                         const partyAccount = await Account.findById(accountId);
//                         if (!partyAccount) {
//                             return res.status(400).json({ error: 'Party account not found.' });
//                         }
//                         const roundOffTransaction = new Transaction({
//                             account: roundOffAccount._id,
//                             billNumber: existingBill.billNumber,
//                             isType: 'RoundOff',
//                             type: 'SlRt',
//                             billId: existingBill._id,
//                             purchaseSalesReturnType: partyAccount.name,
//                             debit: roundOffAmount > 0 ? 0 : Math.abs(roundOffAmount),
//                             credit: roundOffAmount > 0 ? roundOffAmount : 0,
//                             paymentMode: paymentMode,
//                             balance: 0,
//                             date: nepaliDate ? nepaliDate : new Date(billDate),
//                             company: companyId,
//                             user: userId,
//                             fiscalYear: currentFiscalYear
//                         });
//                         await roundOffTransaction.save();
//                         console.log('Round-off Transaction: ', roundOffTransaction);
//                     }
//                 }

//                 if (paymentMode === 'cash') {
//                     const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId });
//                     if (cashAccount) {
//                         const cashTransaction = new Transaction({
//                             account: cashAccount._id,
//                             billNumber: existingBill.billNumber,
//                             type: 'SlRt',
//                             salesReturnBillId: existingBill._id,
//                             purchaseSalesReturnType: 'Sales Return',
//                             debit: finalAmount,
//                             credit: 0,
//                             paymentMode: paymentMode,
//                             balance: 0,
//                             date: nepaliDate ? nepaliDate : new Date(billDate),
//                             company: companyId,
//                             user: userId,
//                             fiscalYear: currentFiscalYear
//                         });
//                         await cashTransaction.save();
//                         console.log('Cash transaction created:', cashTransaction);
//                     }
//                 }
//             }
//             existingBill.items = billItems;
//             await existingBill.save({ session });

//             // If everything goes smoothly, commit the transaction
//             await session.commitTransaction();
//             session.endSession();
//             res.redirect(`/sales-return/edit/${billId}`);

//             if (req.query.print === 'true') {
//                 // Redirect to the print route
//                 res.redirect(`/sales-return/${existingBill._id}/print`);
//             } else {
//                 // Redirect to the bills list or another appropriate page
//                 req.flash('success', 'Bill updated successfully');
//                 res.redirect(`/sales-return/edit/${billId}`);
//             }
//         } catch (error) {
//             console.error('Error during edit:', error);
//             req.flash('error', 'An error occurred while processing your request');
//             return res.redirect(`/sales-return/edit/${billId}`);
//         }
//     }
// });

// PUT route to update a sales return bill
router.put('/sales-return/edit/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const session = await mongoose.startSession();
        session.startTransaction();

        const billId = req.params.id;
        const { accountId, items, vatPercentage, transactionDateRoman, transactionDateNepali, billDate, nepaliDate, isVatExempt, discountPercentage, paymentMode, roundOffAmount: manualRoundOffAmount } = req.body;

        const companyId = req.session.currentCompany;
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
        const currentFiscalYear = req.session.currentFiscalYear.id;
        const userId = req.user._id;

        if (!companyId) {
            req.flash('error', `Company ID is required.`);
            await session.abortTransaction();
            return res.redirect(`/sales-return/edit/${billId}`);
        }
        if (!isVatExempt) {
            req.flash('error', `Invalid vat selection.`);
            await session.abortTransaction();
            return res.redirect(`/sales-return/edit/${billId}`);
        }
        if (!paymentMode) {
            req.flash('error', `Invalid payment mode.`);
            await session.abortTransaction();
            return res.redirect(`/sales-return/edit/${billId}`);
        }

        const companyDateFormat = company ? company.dateFormat : 'english';
        if (companyDateFormat === 'nepali') {
            if (!transactionDateNepali) {
                req.flash('error', `Invalid transaction date.`);
                await session.abortTransaction();
                return res.redirect(`/sales-return/edit/${billId}`);
            }
            if (!nepaliDate) {
                req.flash('error', `Invalid invoice date.`);
                await session.abortTransaction();
                return res.redirect(`/sales-return/edit/${billId}`);
            }
        } else {
            if (!transactionDateRoman) {
                req.flash('error', `Invalid transaction date.`);
                await session.abortTransaction();
                return res.redirect(`/sales-return/edit/${billId}`);
            }
            if (!billDate) {
                req.flash('error', `Invalid invoice date.`);
                await session.abortTransaction();
                return res.redirect(`/sales-return/edit/${billId}`);
            }
        }

        try {
            const existingBill = await SalesReturn.findOne({ _id: billId, company: companyId }).session(session);
            if (!existingBill) {
                req.flash('error', 'Bill not found');
                await session.abortTransaction();
                return res.redirect('/sales-return/list');
            }

            // Check if stock is used fully or partially
            let isStockUsed = false;

            for (const existingItem of existingBill.items) {
                const product = await Item.findById(existingItem.item).session(session);
                if (!product) continue;

                const stockEntry = product.stockEntries.find(entry =>
                    entry.batchNumber === existingItem.batchNumber &&
                    new Date(entry.date).toDateString() === new Date(existingBill.date).toDateString() &&
                    entry.uniqueUuId === existingItem.uniqueUuId
                );

                if (!stockEntry || stockEntry.quantity < existingItem.quantity) {
                    isStockUsed = true;
                    break;
                }
            }

            if (isStockUsed) {
                req.flash('error', 'Could not edit, Stock is used!');
                await session.abortTransaction();
                return res.redirect(`/sales-return/edit/${billId}`);
            }

            // Process stock updates only if stock is not used
            for (const existingItem of existingBill.items) {
                const product = await Item.findById(existingItem.item).session(session);
                if (!product) continue;

                const stockEntryIndex = product.stockEntries.findIndex(entry =>
                    entry.batchNumber === existingItem.batchNumber &&
                    new Date(entry.date).toDateString() === new Date(existingBill.date).toDateString() &&
                    entry.uniqueUuId === existingItem.uniqueUuId
                );

                if (stockEntryIndex !== -1) {
                    const stockEntry = product.stockEntries[stockEntryIndex];
                    stockEntry.quantity -= existingItem.quantity;

                    if (stockEntry.quantity <= 0) {
                        product.stockEntries.splice(stockEntryIndex, 1);
                    }

                    product.stock = product.stockEntries.reduce((total, entry) => total + entry.quantity, 0);
                    await product.save({ session });
                }
            }

            const removedItems = existingBill.items.filter(existingItem => {
                return !items.some(item =>
                    item.item.toString() === existingItem.item.toString() &&
                    item.uniqueUuId === existingItem.uniqueUuId
                );
            });

            for (const removedItem of removedItems) {
                const product = await Item.findById(removedItem.item).session(session);
                if (!product) continue;

                const stockEntryIndex = product.stockEntries.findIndex(entry =>
                    entry.batchNumber === removedItem.batchNumber &&
                    new Date(entry.date).toDateString() === new Date(existingBill.date).toDateString() &&
                    entry.salesReturnBillId.toString() === existingBill._id.toString() && entry.uniqueUuId === removedItem.uniqueUuId
                );

                if (stockEntryIndex !== -1) {
                    const stockEntry = product.stockEntries[stockEntryIndex];
                    stockEntry.quantity += removedItem.quantity;

                    if (stockEntry.quantity <= 0) {
                        product.stockEntries.splice(stockEntryIndex, 1);
                    }

                    product.stock = product.stockEntries.reduce((total, entry) => total + entry.quantity, 0);
                    await product.save({ session });
                }
            }

            // Delete removed items from the SalesReturn
            existingBill.items = existingBill.items.filter(existingItem => {
                return items.some(item =>
                    item.item.toString() === existingItem.item.toString() &&
                    item.uniqueUuId === existingItem.uniqueUuId
                );
            });

            // Delete all associated transactions
            await Transaction.deleteMany({ salesReturnBillId: existingBill._id }).session(session);

            // Calculate amounts
            const isVatExemptBool = isVatExempt === 'true' || isVatExempt === true;
            const isVatAll = isVatExempt === 'all';
            const discount = parseFloat(discountPercentage) || 0;

            // Ensure all amounts are numbers
            let totalTaxableAmount = 0;
            let totalNonTaxableAmount = 0;
            let hasVatableItems = false;
            let hasNonVatableItems = false;

            for (const item of items) {
                const product = await Item.findById(item.item).session(session);
                if (!product) continue;

                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;

                if (product.vatStatus === 'vatable') {
                    hasVatableItems = true;
                    totalTaxableAmount += quantity * price;
                } else {
                    hasNonVatableItems = true;
                    totalNonTaxableAmount += quantity * price;
                }
            }

            // Validate VAT conditions
            if (isVatExempt !== 'all') {
                if (isVatExemptBool && hasVatableItems) {
                    req.flash('error', 'Cannot save VAT exempt bill with vatable items');
                    await session.abortTransaction();
                    return res.redirect('/sales-return');
                }

                if (!isVatExemptBool && hasNonVatableItems) {
                    req.flash('error', 'Cannot save bill with non-vatable items when VAT is applied');
                    await session.abortTransaction();
                    return res.redirect('/sales-return');
                }
            }

            const discountForTaxable = (totalTaxableAmount * discount) / 100;
            const discountForNonTaxable = (totalNonTaxableAmount * discount) / 100;

            const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
            const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

            let vatAmount = 0;
            if (!isVatExemptBool || isVatAll || isVatExempt === 'all') {
                vatAmount = (finalTaxableAmount * vatPercentage) / 100;
            }

            let roundOffAmount = 0;
            let totalAmount = finalTaxableAmount + finalNonTaxableAmount + vatAmount;
            let finalAmount = totalAmount;

            const roundOffForSalesReturn = await Settings.findOne({
                companyId,
                userId,
                fiscalYear: currentFiscalYear
            }) || { roundOffSalesReturn: false };

            if (roundOffForSalesReturn.roundOffSalesReturn) {
                finalAmount = Math.round(finalAmount.toFixed(2));
                roundOffAmount = finalAmount - totalAmount;
            } else if (manualRoundOffAmount && !roundOffForSalesReturn.roundOffSalesReturn) {
                roundOffAmount = parseFloat(manualRoundOffAmount) || 0;
                finalAmount = totalAmount + roundOffAmount;
            }

            // Update existing bill with validated numbers
            existingBill.account = accountId;
            existingBill.isVatExempt = isVatExemptBool;
            existingBill.vatPercentage = isVatExemptBool ? 0 : vatPercentage;
            existingBill.subTotal = totalTaxableAmount + totalNonTaxableAmount;
            existingBill.discountPercentage = discount;
            existingBill.discountAmount = discountForTaxable + discountForNonTaxable;
            existingBill.nonVatSales = finalNonTaxableAmount;
            existingBill.taxableAmount = finalTaxableAmount;
            existingBill.vatAmount = vatAmount;
            existingBill.isVatAll = isVatAll;
            existingBill.totalAmount = finalAmount;
            existingBill.roundOffAmount = roundOffAmount;
            existingBill.paymentMode = paymentMode;
            existingBill.date = nepaliDate || new Date(billDate);
            existingBill.transactionDate = transactionDateNepali || new Date(transactionDateRoman);

            // Stock addition function
            async function addStock(product, batchNumber, expiryDate, quantity, price, uniqueUuId, isUpdate = false) {
                const quantityNumber = Number(quantity) || 0;
                const priceNumber = Number(price) || 0;

                const stockEntry = {
                    date: nepaliDate ? nepaliDate : new Date(billDate),
                    quantity: quantityNumber,
                    batchNumber: batchNumber,
                    expiryDate: expiryDate,
                    price: priceNumber,
                    uniqueUuId: uniqueUuId,
                    salesReturnBillId: existingBill._id,
                };

                if (isUpdate) {
                    const stockEntryIndex = product.stockEntries.findIndex(
                        entry => entry.batchNumber === batchNumber && entry.expiryDate === expiryDate
                    );

                    if (stockEntryIndex !== -1) {
                        // Update existing stock entry
                        const existingStockEntry = product.stockEntries[stockEntryIndex];
                        const updatedUniqueUuId = uniqueUuId !== undefined ? uniqueUuId : existingStockEntry.uniqueUuId;

                        product.stockEntries[stockEntryIndex] = {
                            ...existingStockEntry,
                            date: nepaliDate ? nepaliDate : new Date(billDate),
                            batchNumber: batchNumber,
                            expiryDate: expiryDate,
                            quantity: quantityNumber,
                            price: price !== undefined ? price : existingStockEntry.price,
                            salesReturnBillId: existingBill._id,
                            uniqueUuId: updatedUniqueUuId,
                        };
                    } else {
                        product.stockEntries.push(stockEntry);
                    }
                } else {
                    product.stockEntries.push(stockEntry);
                }

                product.stock = product.stockEntries.reduce((total, entry) => total + entry.quantity, 0);
                await product.save({ session });
            }

            const billItems = [...existingBill.items]; // Retain existing items
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const product = await Item.findById(item.item).session(session);

                if (!product) {
                    req.flash('error', `Item with id ${item.item} not found`);
                    await session.abortTransaction();
                    return res.redirect('/purchase-bills');
                }

                const existingBillItemIndex = billItems.findIndex(billItem =>
                    billItem.item && billItem.item.toString() === item.item
                );

                if (existingBillItemIndex !== -1) {
                    // If item exists, update fields but retain existing values if not provided
                    const existingBillItem = billItems[existingBillItemIndex];
                    billItems[existingBillItemIndex] = {
                        ...existingBillItem, // Retain existing properties
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        batchNumber: item.batchNumber, // Update to new batch number
                        expiryDate: item.expiryDate,
                        quantity: Number(item.quantity),
                        price: item.price !== undefined && item.price !== "" ? item.price : existingBillItem.price, // Retain existing price if not provided
                        uniqueUuId: item.uniqueUuId !== undefined && item.uniqueUuId !== "" ? item.uniqueUuId : existingBillItem.uniqueUuId,
                        unit: item.unit,
                        vatStatus: product.vatStatus
                    };
                } else {
                    // Add new item to the bill
                    // Generate new uniqueUuId for new item
                    const newUniqueId = uuidv4();
                    billItems.push({
                        item: product._id,
                        batchNumber: item.batchNumber,
                        expiryDate: item.expiryDate,
                        quantity: item.quantity,
                        price: item.price,
                        unit: item.unit,
                        vatStatus: product.vatStatus,
                        uniqueUuId: newUniqueId,
                    });
                    // Use the same uniqueUuId for the stock entry
                    item.uniqueUuId = newUniqueId;
                }

                const existingTransaction = await Transaction.findOne({
                    item: product._id,
                    salesReturnBillId: existingBill._id,
                }).session(session);

                if (existingTransaction) {
                    // If transaction exists, update it instead of adding a new row
                    existingTransaction.batchNumber = item.batchNumber; // Update batch number
                    existingTransaction.quantity = item.quantity;
                    existingTransaction.price = item.price;
                    existingTransaction.unit = item.unit;
                    existingTransaction.credit = finalAmount;
                    existingTransaction.paymentMode = paymentMode;
                    existingTransaction.date = nepaliDate ? nepaliDate : new Date(billDate);

                    await existingTransaction.save({ session });
                } else {
                    // If no existing transaction, create a new one
                    const transaction = new Transaction({
                        account: accountId,
                        billNumber: existingBill.billNumber,
                        isType: 'SlRt',
                        type: 'SlRt',
                        salesReturnBillId: existingBill._id,
                        purchaseSalesType: 'Sales Return',
                        debit: 0,
                        credit: finalAmount,
                        paymentMode: paymentMode,
                        balance: 0,
                        date: nepaliDate ? nepaliDate : new Date(billDate),
                        company: companyId,
                        user: userId,
                        fiscalYear: currentFiscalYear
                    });

                    await transaction.save({ session });
                }
                // Increment stock quantity using FIFO
                await addStock(
                    product,
                    item.batchNumber,
                    item.expiryDate,
                    item.quantity,
                    item.price,
                    item.uniqueUuId, // Use the same uniqueUuId for stock entry
                    existingBillItemIndex !== -1 // isUpdate flag
                );

                // Create accounting transactions
                const salesReturnAmount = finalTaxableAmount + finalNonTaxableAmount;

                // Sales Return transaction (debit Sales account)
                if (salesReturnAmount > 0) {
                    const salesAccount = await Account.findOne({ name: 'Sales', company: companyId }).session(session);
                    if (salesAccount) {
                        const salesTransaction = new Transaction({
                            account: salesAccount._id,
                            billNumber: existingBill.billNumber,
                            type: 'SlRt',
                            salesReturnBillId: existingBill._id,
                            purchaseSalesType: 'Sales Return',
                            debit: salesReturnAmount,
                            credit: 0,
                            paymentMode: paymentMode,
                            balance: 0,
                            date: nepaliDate ? nepaliDate : new Date(billDate),
                            company: companyId,
                            user: userId,
                            fiscalYear: currentFiscalYear
                        });
                        await salesTransaction.save({ session });
                    }
                }

                // VAT transaction (debit VAT account)
                if (vatAmount > 0) {
                    const vatAccount = await Account.findOne({ name: 'VAT', company: companyId }).session(session);
                    if (vatAccount) {
                        const vatTransaction = new Transaction({
                            account: vatAccount._id,
                            billNumber: existingBill.billNumber,
                            isType: 'VAT',
                            type: 'SlRt',
                            salesReturnBillId: existingBill._id,
                            purchaseSalesType: 'Sales Return',
                            debit: vatAmount,
                            credit: 0,
                            paymentMode: paymentMode,
                            balance: 0,
                            date: nepaliDate ? nepaliDate : new Date(billDate),
                            company: companyId,
                            user: userId,
                            fiscalYear: currentFiscalYear
                        });
                        await vatTransaction.save({ session });
                    }
                }

                // // Round-off transaction
                // if (roundOffAmount > 0) {
                //     const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId }).session(session);
                //     if (roundOffAccount) {
                //         const roundOffTransaction = new Transaction({
                //             account: roundOffAccount._id,
                //             billNumber: existingBill.billNumber,
                //             isType: 'RoundOff',
                //             type: 'SlRt',
                //             salesReturnBillId: existingBill._id,
                //             purchaseSalesType: 'Sales Return',
                //             debit: roundOffAmount > 0 ? 0 : Math.abs(roundOffAmount),
                //             credit: roundOffAmount > 0 ? roundOffAmount : 0,
                //             paymentMode: paymentMode,
                //             balance: 0,
                //             date: nepaliDate ? nepaliDate : new Date(billDate),
                //             company: companyId,
                //             user: userId,
                //             fiscalYear: currentFiscalYear
                //         });
                //         await roundOffTransaction.save({ session });
                //     }
                // }

                // Create a transaction for the round-off amount
                if (roundOffAmount > 0) {
                    const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
                    if (roundOffAccount) {
                        const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                        if (!partyAccount) {
                            return res.status(400).json({ error: 'Party account not found.' });
                        }
                        const roundOffTransaction = new Transaction({
                            account: roundOffAccount._id,
                            billNumber: existingBill.billNumber,
                            isType: 'RoundOff',
                            type: 'SlRt',
                            purchaseBillId: existingBill._id,
                            purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                            debit: roundOffAmount,  // Debit the VAT account
                            credit: 0,         // Credit is 0 for VAT transactions
                            paymentMode: paymentMode,
                            balance: 0, // Update the balance
                            date: nepaliDate ? nepaliDate : new Date(billDate),
                            company: companyId,
                            user: userId,
                            fiscalYear: currentFiscalYear
                        });
                        await roundOffTransaction.save();
                        console.log('Round-off Transaction: ', roundOffTransaction);
                    }
                }

                if (roundOffAmount < 0) {
                    const roundOffAccount = await Account.findOne({ name: 'Rounded Off', company: companyId });
                    if (roundOffAccount) {
                        const partyAccount = await Account.findById(accountId); // Find the party account (from where the purchase is made)
                        if (!partyAccount) {
                            return res.status(400).json({ error: 'Party account not found.' });
                        }
                        const roundOffTransaction = new Transaction({
                            account: roundOffAccount._id,
                            billNumber: existingBill.billNumber,
                            isType: 'RoundOff',
                            type: 'SlRt',
                            purchaseBillId: existingBill._id,
                            purchaseSalesType: partyAccount.name,  // Save the party account name in purchaseSalesType,
                            debit: 0,  // Debit the VAT account
                            credit: Math.abs(roundOffAmount), // Ensure roundOffAmount is not saved as a negative value
                            paymentMode: paymentMode,
                            balance: 0, // Update the balance
                            date: nepaliDate ? nepaliDate : new Date(billDate),
                            company: companyId,
                            user: userId,
                            fiscalYear: currentFiscalYear
                        });
                        await roundOffTransaction.save();
                        console.log('Round-off Transaction: ', roundOffTransaction);
                    }
                }

                // Cash transaction if payment mode is cash
                if (paymentMode === 'cash') {
                    const cashAccount = await Account.findOne({ name: 'Cash in Hand', company: companyId }).session(session);
                    if (cashAccount) {
                        const cashTransaction = new Transaction({
                            account: cashAccount._id,
                            billNumber: existingBill.billNumber,
                            type: 'SlRt',
                            salesReturnBillId: existingBill._id,
                            purchaseSalesType: 'Sales Return',
                            debit: finalAmount,
                            credit: 0,
                            paymentMode: paymentMode,
                            balance: 0,
                            date: nepaliDate ? nepaliDate : new Date(billDate),
                            company: companyId,
                            user: userId,
                            fiscalYear: currentFiscalYear
                        });
                        await cashTransaction.save({ session });
                    }
                }
            }

            existingBill.items = billItems;
            await existingBill.save({ session });

            await session.commitTransaction();
            session.endSession();

            if (req.query.print === 'true') {
                res.redirect(`/sales-return/${existingBill._id}/print`);
            } else {
                req.flash('success', 'Sales return updated successfully');
                res.redirect(`/sales-return/edit/${billId}`);
            }
        } catch (error) {
            console.error('Error during edit:', error);
            await session.abortTransaction();
            req.flash('error', 'An error occurred while processing your request');
            return res.redirect(`/sales-return/edit/${billId}`);
        }
    }
});

router.get('/sales-return/:id/print', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const currentCompanyName = req.session.currentCompanyName;
        const companyId = req.session.currentCompany;
        console.log("Company ID from session:", companyId); // Debugging line

        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
        const transactionDateNepali = new NepaliDate(today).format('YYYY-MM-DD');
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');
        const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

        // const { selectedDate } = req.query; // Assume selectedDate is passed as a query parameter

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

        // Validate the selectedDate
        if (!nepaliDate || isNaN(new Date(nepaliDate).getTime())) {
            throw new Error('Invalid invoice date provided');
        }
        if (!transactionDateNepali || isNaN(new Date(transactionDateNepali).getTime())) {
            throw new Error('Invalid transaction date provided ')
        }
        try {
            const currentCompany = await Company.findById(new ObjectId(companyId));
            console.log("Current Company:", currentCompany); // Debugging line

            if (!currentCompany) {
                req.flash('error', 'Company not found');
                return res.redirect('/sales-return/list');
            }

            const billId = req.params.id;
            const bill = await SalesReturn.findById(billId)
                .populate({ path: 'account', select: 'name pan address email phone openingBalance' }) // Populate account and only select openingBalance
                .populate('items.item')
                .populate('user');

            if (!bill) {
                req.flash('error', 'Sales return bill not found');
                return res.redirect('/sales-return/list');
            }

            // Populate unit for each item in the bill
            for (const item of bill.items) {
                await item.item.populate('unit');
            }

            let finalBalance = null;
            let balanceLabel = '';

            // Fetch the latest transaction for the current company and bill
            if (bill.paymentMode === 'credit') {
                const latestTransaction = await Transaction.findOne({
                    company: new ObjectId(companyId),
                    billId: new ObjectId(billId)
                }).sort({ transactionDate: -1 });

                let lastBalance = 0;

                // Calculate the last balance based on the latest transaction
                if (latestTransaction) {
                    lastBalance = Math.abs(latestTransaction.balance || 0); // Ensure balance is positive

                    // Determine if the amount is receivable (dr) or payable (cr)
                    if (latestTransaction.debit) {
                        balanceLabel = 'Dr'; // Receivable amount
                    } else if (latestTransaction.credit) {
                        balanceLabel = 'Cr'; // Payable amount
                    }
                }

                // Retrieve the opening balance from the account
                const openingBalance = bill.account ? bill.account.openingBalance : null;

                // Add opening balance if it exists
                if (openingBalance) {
                    lastBalance += (openingBalance.type === 'Dr' ? openingBalance.amount : -openingBalance.amount);
                    balanceLabel = openingBalance.type;
                }

                finalBalance = lastBalance;
            }

            res.render('retailer/salesReturn/print', {
                company,
                currentFiscalYear,
                bill,
                currentCompanyName,
                currentCompany,
                lastBalance: finalBalance,
                balanceLabel,
                paymentMode: bill.paymentMode, // Pass paymentMode to the view if needed
                nepaliDate,
                transactionDateNepali,
                englishDate: bill.englishDate,
                companyDateFormat,
                title: '',
                body: '',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'

            });
        } catch (error) {
            console.error("Error fetching bill for printing:", error);
            req.flash('error', 'Error fetching bill for printing');
            res.redirect('/sales-return/list');
        }
    }
});

router.get('/salesReturn-vat-report', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, ensureFiscalYear, checkFiscalYearDateRange, async (req, res) => {
    if (req.tradeType === 'retailer') {
        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const currentCompany = await Company.findById(new ObjectId(companyId));
        const companyDateFormat = currentCompany ? currentCompany.dateFormat : '';
        // Extract dates from query parameters
        let fromDate = req.query.fromDate ? req.query.fromDate : null;
        let toDate = req.query.toDate ? req.query.toDate : null;


        const today = new Date();
        const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD');

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

        if (!fromDate || !toDate) {
            res.render('retailer/salesReturn/salesReturnVatReport', {
                company,
                currentFiscalYear,
                salesReturnVatReport: '',
                companyDateFormat,
                nepaliDate,
                currentCompany,
                fromDate: req.query.fromDate || '',
                toDate: req.query.toDate || '',
                currentCompanyName,
                title: '',
                body: '',
                user: req.user,
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });
        }

        // // Build the query to filter transactions within the date range
        let query = { company: companyId };

        if (fromDate && toDate) {
            query.date = { $gte: fromDate, $lte: toDate };
        } else if (fromDate) {
            query.date = { $gte: fromDate };
        } else if (toDate) {
            query.date = { $lte: toDate };
        }

        const salesReturn = await SalesReturn.find(query)
            .populate('account')
            .sort({ date: 1 })

        // Prepare VAT report data
        const salesReturnVatReport = await Promise.all(salesReturn.map(async bill => {
            const account = await Account.findById(bill.account);
            return {
                billNumber: bill.billNumber,
                date: bill.date,
                account: account.name,
                panNumber: account.pan,
                totalAmount: bill.totalAmount,
                discountAmount: bill.discountAmount,
                nonVatSales: bill.nonVatSalesReturn,
                taxableAmount: bill.taxableAmount,
                vatAmount: bill.vatAmount,
            };
        }));

        res.render('retailer/salesReturn/salesReturnVatReport', {
            company,
            currentFiscalYear,
            salesReturnVatReport,
            companyDateFormat,
            nepaliDate,
            currentCompany,
            fromDate: req.query.fromDate || '',
            toDate: req.query.toDate || '',
            currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } else {
        res.status(403).send('Access denied');
    }
});


module.exports = router;

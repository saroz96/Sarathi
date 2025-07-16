const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const { isLoggedIn, ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');
const NepaliDate = require('nepali-date');
const { default: Store } = require('../../models/retailer/Store');
const Company = require('../../models/Company');
const FiscalYear = require('../../models/FiscalYear');
const { default: Rack } = require('../../models/retailer/Rack');
const Item = require('../../models/retailer/Item');
const StockTransferLog = require('../../models/retailer/stockTransferLog');



router.get('/store/management', isLoggedIn, ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const companyId = req.session.currentCompany;
            const currentCompanyName = req.session.currentCompanyName;
            const today = new Date();
            const nepaliDate = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
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

            const stores = await Store.find({ company: companyId });

            // Render the items page with the fetched data
            res.render('retailer/store/stores', {
                company,
                stores,
                currentFiscalYear,
                companyId,
                currentCompanyName,
                companyDateFormat,
                nepaliDate,
                fiscalYear,
                title: '',
                body: '',
                user: req.user,
                theme: req.user.preferences?.theme || 'light', // Default to light if not set
                isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
            });

        } catch (error) {
            console.error("Error fetching items:", error);
            req.flash('error', 'Failed to fetch items for the current fiscal year.');
            res.redirect('/retailerDashboard/indexv1');
        }
    } else {
        res.redirect('/'); // Handle unauthorized access
    }
});


router.post('/store/management', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {

        const { name, description } = req.body;
        const companyId = req.session.currentCompany;

        if (!companyId) {
            return res.status(400).json({ error: 'Company ID is required' });
        }

        // Fetch the company and populate the fiscalYear
        const company = await Company.findById(companyId).populate('fiscalYear');

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

        // Create the new item with the fiscal year in openingStockByFiscalYear
        const newStore = new Store({
            name,
            description,
            company: companyId,
        });

        // Save the new item
        await newStore.save();

        // Log the new item for debugging purposes
        (newStore);

        // Flash success message and redirect
        req.flash('success', 'Store added successfully!');
        res.redirect('/retailer/store/management');
    }
});


// Route to handle editing an item
router.put('/store/management/:id', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'retailer') {
        try {
            const { name, description } = req.body;
            const companyId = req.session.currentCompany;

            // Fetch the company and populate the fiscalYear
            const company = await Company.findById(companyId).populate('fiscalYear');

            // Fetch the current fiscal year from the session or company
            let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
            let currentFiscalYear = null;

            if (fiscalYear) {
                currentFiscalYear = await FiscalYear.findById(fiscalYear);
            }

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

                fiscalYear = req.session.currentFiscalYear.id;
            }

            if (!fiscalYear) {
                return res.status(400).json({ error: 'No fiscal year found in session or company.' });
            }


            // Fetch the current item details
            const stores = await Store.findById(req.params.id);
            if (!stores) {
                return res.status(404).json({ error: 'Store not found' });
            }
            // Update the item details, including the fiscal year data for stock entries
            await Store.findByIdAndUpdate(req.params.id, {
                name,
                description,
                company: companyId,
            });

            req.flash('success', 'Store updated successfully');
            res.redirect('/retailer/store/management');
        } catch (err) {
            if (err.code === 11000) {
                req.flash('error', 'A store with this name already exists within the selected company.');
                return res.redirect(`/retailer/store/management`);
            }

            console.error('Error updating store:', err);
            req.flash('error', 'Error updating store');
            res.redirect(`/retailer/store/management`);
        }
    }
});


router.get('/store/management/:id', isLoggedIn, ensureAuthenticated, ensureCompanySelected, async (req, res) => {
    const companyId = req.session.currentCompany;
    const currentCompanyName = req.session.currentCompanyName;

    if (!companyId) {
        return res.status(400).json({ error: 'Company ID is required' });
    }

    try {
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');

        // Check if fiscal year is already in the session
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the current fiscal year from the database
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year found in session or no fiscal year in the company, set it
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year for further use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        // If no fiscal year is still found in session, return an error
        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session.' });
        }

        // Fetch the item details along with the category and unit data
        const stores = await Store.findOne({ _id: req.params.id, company: companyId })
        if (!stores) {
            return res.status(404).json({ error: 'Store not found' });
        }

        // Add this to fetch racks
        const racks = await Rack.find({
            store: req.params.id,
            company: companyId
        }).sort('name');

        // Render the page with the item details and opening stock for the current fiscal year
        res.render('retailer/store/view', {
            company,
            currentFiscalYear,
            stores,
            racks,
            fiscalYear,
            currentCompanyName,
            title: '',
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});


// Transfer stock from one store to another

router.get('/transfer-stock', async (req, res) => {
    const companyId = req.session.currentCompany;
    const currentCompanyName = req.session.currentCompanyName;
    const today = new Date();
    const issueDateNepali = new NepaliDate(today).format('YYYY-MM-DD'); // Format the Nepali date as needed
    const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat vatEnabled').populate('fiscalYear');
    const companyDateFormat = company ? company.dateFormat : 'english'; // Default to 'english'

    if (!companyId) {
        return res.status(400).json({ error: 'Company ID is required' });
    }
    try {
        const company = await Company.findById(companyId).select('renewalDate fiscalYear dateFormat').populate('fiscalYear');

        // Check if fiscal year is already in the session
        let fiscalYear = req.session.currentFiscalYear ? req.session.currentFiscalYear.id : null;
        let currentFiscalYear = null;

        if (fiscalYear) {
            // Fetch the current fiscal year from the database
            currentFiscalYear = await FiscalYear.findById(fiscalYear);
        }

        // If no fiscal year found in session or no fiscal year in the company, set it
        if (!currentFiscalYear && company.fiscalYear) {
            currentFiscalYear = company.fiscalYear;

            // Set the fiscal year in the session
            req.session.currentFiscalYear = {
                id: currentFiscalYear._id.toString(),
                startDate: currentFiscalYear.startDate,
                endDate: currentFiscalYear.endDate,
                name: currentFiscalYear.name,
                dateFormat: currentFiscalYear.dateFormat,
                isActive: currentFiscalYear.isActive
            };

            // Assign fiscal year for further use
            fiscalYear = req.session.currentFiscalYear.id;
        }

        // If no fiscal year is still found in session, return an error
        if (!fiscalYear) {
            return res.status(400).json({ error: 'No fiscal year found in session.' });
        }

        const [items, stores] = await Promise.all([
            Item.find({ status: 'active' }).select('name'),
            Store.find()
        ]);

        res.render('retailer/store/stockTransfer', {
            title: '',
            items,
            stores,
            company,
            issueDateNepali,
            companyDateFormat,
            currentFiscalYear,
            fiscalYear,
            currentCompanyName,
            body: '',
            user: req.user,
            theme: req.user.preferences?.theme || 'light', // Default to light if not set
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        });
    } catch (error) {
        console.error('Error loading transfer form:', error);
        res.status(500).render('error', { message: 'Failed to load transfer form' });
    }
});


// router.post('/transfer-stock', async (req, res) => {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//         const { itemId, stockEntryId, quantity, fromStore, toStore } = req.body;

//         // Validate input
//         if (!itemId || !stockEntryId || !quantity || !fromStore || !toStore) {
//             await session.abortTransaction();
//             return res.status(400).json({ message: 'Missing required fields' });
//         }

//         if (fromStore === toStore) {
//             await session.abortTransaction();
//             return res.status(400).json({ message: 'Source and destination stores cannot be the same' });
//         }

//         // Check if stores exist
//         const [sourceStore, destinationStore] = await Promise.all([
//             Store.findById(fromStore).session(session),
//             Store.findById(toStore).session(session)
//         ]);

//         if (!sourceStore || !destinationStore) {
//             await session.abortTransaction();
//             return res.status(404).json({ message: 'Store not found' });
//         }

//         // Find the item with stock entries
//         const item = await Item.findById(itemId)
//             .select('+stockEntries')
//             .session(session);

//         if (!item) {
//             await session.abortTransaction();
//             return res.status(404).json({ message: 'Item not found' });
//         }

//         // Find the specific stock entry by ID
//         const sourceEntry = item.stockEntries.id(stockEntryId);
//         if (!sourceEntry) {
//             await session.abortTransaction();
//             return res.status(404).json({ message: 'Stock entry not found' });
//         }

//         // Debug logging
//         ('Transfer validation:', {
//             currentStore: sourceEntry.store.toString(),
//             fromStore,
//             sourceTransfer: sourceEntry.sourceTransfer
//         });

//         // Modified validation logic
//         const isValidTransfer = (
//             // Direct transfer - entry belongs to fromStore
//             sourceEntry.store.toString() === fromStore ||
//             // Return transfer - entry was originally from toStore
//             (sourceEntry.sourceTransfer && sourceEntry.sourceTransfer.fromStore.toString() === fromStore)
//         );

//         if (!isValidTransfer) {
//             await session.abortTransaction();
//             return res.status(400).json({
//                 message: 'Selected stock entry does not belong to the source store',
//                 details: {
//                     entryStore: sourceEntry.store.toString(),
//                     requestedFromStore: fromStore,
//                     sourceTransfer: sourceEntry.sourceTransfer
//                 }
//             });
//         }

//         // Check quantity
//         if (sourceEntry.quantity < quantity) {
//             await session.abortTransaction();
//             return res.status(400).json({
//                 message: `Insufficient quantity. Available: ${sourceEntry.quantity}`,
//                 available: sourceEntry.quantity,
//                 requested: quantity
//             });
//         }

//         // Reduce source quantity
//         sourceEntry.quantity -= quantity;

//         // Remove entry if quantity reaches zero
//         if (sourceEntry.quantity <= 0) {
//             item.stockEntries.pull({ _id: stockEntryId });
//         }

//         // Create new entry
//         const newEntry = {
//             ...sourceEntry.toObject(),
//             _id: new mongoose.Types.ObjectId(),
//             quantity: quantity,
//             store: toStore,
//             rack: null,
//             date: new Date(),
//             // Only set sourceTransfer if not returning to original store
//             sourceTransfer: (sourceEntry.sourceTransfer?.fromStore === toStore) 
//                 ? undefined 
//                 : {
//                     fromStore,
//                     originalEntryId: stockEntryId,
//                     transferDate: new Date()
//                 }
//         };

//         // Add new entry
//         item.stockEntries.push(newEntry);

//         // Update total stock
//         item.stock = item.stockEntries.reduce((sum, entry) => sum + entry.quantity, 0);

//         // Save changes
//         await item.save({ session });

//         // Create audit log
//         const transferLog = new StockTransferLog({
//             item: itemId,
//             fromStore,
//             toStore,
//             quantity,
//             batchNumber: sourceEntry.batchNumber,
//             transferredBy: req.user._id,
//         });
//         await transferLog.save({ session });

//         await session.commitTransaction();

//         res.status(200).json({
//             success: true,
//             message: 'Stock transferred successfully',
//             data: {
//                 itemId: item._id,
//                 transferredQuantity: quantity,
//                 newStock: item.stock,
//             }
//         });

//     } catch (error) {
//         await session.abortTransaction();
//         console.error('Stock transfer error:', {
//             message: error.message,
//             stack: error.stack,
//             body: req.body
//         });
//         res.status(500).json({
//             success: false,
//             message: 'Failed to transfer stock',
//             error: process.env.NODE_ENV === 'development' ? error.message : undefined
//         });
//     } finally {
//         session.endSession();
//     }
// });

router.post('/transfer-stock', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { items, fromStore, toStore, notes } = req.body;

        // Validate input
        if (!items || !Array.isArray(items)) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Items array is required' });
        }

        if (!fromStore || !toStore) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Source and destination stores are required' });
        }

        if (fromStore === toStore) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'Source and destination stores cannot be the same' });
        }

        // Check if stores exist
        const [sourceStore, destinationStore] = await Promise.all([
            Store.findById(fromStore).session(session),
            Store.findById(toStore).session(session)
        ]);

        if (!sourceStore || !destinationStore) {
            await session.abortTransaction();
            return res.status(404).json({ message: 'Store not found' });
        }

        // Process each item transfer
        const transferResults = [];
        const transferItems = [];

        for (const transferItem of items) {
            const { itemId, stockEntryId, quantity } = transferItem;

            // Validate item transfer data
            if (!itemId || !stockEntryId || !quantity) {
                await session.abortTransaction();
                return res.status(400).json({ message: 'Missing required fields in transfer items' });
            }

            // Find the item with stock entries
            const item = await Item.findById(itemId)
                .select('+stockEntries')
                .session(session);

            if (!item) {
                await session.abortTransaction();
                return res.status(404).json({ message: `Item ${itemId} not found` });
            }

            // Find the specific stock entry by ID
            const sourceEntry = item.stockEntries.id(stockEntryId);
            if (!sourceEntry) {
                await session.abortTransaction();
                return res.status(404).json({ message: `Stock entry ${stockEntryId} not found` });
            }

            // Validate transfer
            const isValidTransfer = (
                sourceEntry.store.toString() === fromStore ||
                (sourceEntry.sourceTransfer && sourceEntry.sourceTransfer.fromStore.toString() === fromStore)
            );

            if (!isValidTransfer) {
                await session.abortTransaction();
                return res.status(400).json({
                    message: 'Selected stock entry does not belong to the source store',
                    details: {
                        itemId,
                        entryStore: sourceEntry.store.toString(),
                        requestedFromStore: fromStore,
                        sourceTransfer: sourceEntry.sourceTransfer
                    }
                });
            }

            // Check quantity
            if (sourceEntry.quantity < quantity) {
                await session.abortTransaction();
                return res.status(400).json({
                    message: `Insufficient quantity for item ${item.name}. Available: ${sourceEntry.quantity}`,
                    itemId,
                    available: sourceEntry.quantity,
                    requested: quantity
                });
            }

            // Reduce source quantity
            sourceEntry.quantity -= quantity;

            // Remove entry if quantity reaches zero
            if (sourceEntry.quantity <= 0) {
                item.stockEntries.pull({ _id: stockEntryId });
            }

            // Create new entry
            const newEntry = {
                ...sourceEntry.toObject(),
                _id: new mongoose.Types.ObjectId(),
                quantity: quantity,
                store: toStore,
                rack: null,
                date: new Date(),
                sourceTransfer: (sourceEntry.sourceTransfer?.fromStore === toStore)
                    ? undefined
                    : {
                        fromStore,
                        originalEntryId: stockEntryId,
                        transferDate: new Date()
                    }
            };

            // Add new entry
            item.stockEntries.push(newEntry);

            // Update total stock
            item.stock = item.stockEntries.reduce((sum, entry) => sum + entry.quantity, 0);

            // Save changes to item
            await item.save({ session });

            // Add to transfer items for log
            transferItems.push({
                item: itemId,
                stockEntryId: stockEntryId,
                quantity: quantity,
                batchNumber: sourceEntry.batchNumber
            });

            transferResults.push({
                itemId: item._id,
                transferredQuantity: quantity,
                newStock: item.stock,
            });
        }

        // Create audit log for the entire transfer
        const transferLog = new StockTransferLog({
            items: transferItems,
            fromStore,
            toStore,
            transferredBy: req.user._id,
            notes
        });
        await transferLog.save({ session });

        await session.commitTransaction();

        res.status(200).json({
            success: true,
            message: 'Stock transferred successfully',
            data: {
                transferId: transferLog._id,
                items: transferResults
            }
        });

    } catch (error) {
        await session.abortTransaction();
        console.error('Stock transfer error:', {
            message: error.message,
            stack: error.stack,
            body: req.body
        });
        res.status(500).json({
            success: false,
            message: 'Failed to transfer stock',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        session.endSession();
    }
});

// Get available stock for an item in a specific store
router.get('/available/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        const { storeId } = req.query;

        const item = await Item.findById(itemId);
        if (!item) {
            return res.status(404).json({ message: 'Item not found' });
        }

        let availableEntries = item.stockEntries;

        if (storeId) {
            availableEntries = availableEntries.filter(entry =>
                entry.store.toString() === storeId && entry.quantity > 0
            );
        } else {
            availableEntries = availableEntries.filter(entry => entry.quantity > 0);
        }

        res.json({
            item: {
                _id: item._id,
                name: item.name,
                unit: item.unit
            },
            stockEntries: availableEntries
        });

    } catch (error) {
        console.error('Error fetching available stock:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


module.exports = router;
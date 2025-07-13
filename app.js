const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config(); // Make sure to load environment variables
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const { numberToWords } = require('./public/js/helpers');

const passport = require('passport');
const initializePassport = require('./config/passport-config');

const salesBillsRoutes = require('./routes/retailer/SalesBill');
const unitRoutes = require('./routes/retailer/unit');
const mainUnitRoutes = require('./routes/retailer/mainUnit');
const accountRoutes = require('./routes/retailer/account');
const companyGroupRoutes = require('./routes/retailer/companyGroup');
const itemsCategoryRoutes = require('./routes/retailer/items_category');
const itemsRoutes = require('./routes/retailer/items');
const transactionRoutes = require('./routes/retailer/transaction');
const indexRoutes = require('./routes/retailer/index');
const usersRoutes = require('./routes/users');
const companyRoutes = require('./routes/companyRoutes');
const stockAdjustmentsRoutes = require('./routes/retailer/stockAdjustments');
const itemsLedgerRoutes = require('./routes/retailer/items-ledger');
const settingsRoutes = require('./routes/retailer/Settings');
const purchaseRoutes = require('./routes/retailer/purchaseBill');
const paymentRoutes = require('./routes/retailer/payment');
const receiptRoutes = require('./routes/retailer/receipt');
const journalVoucherRoutes = require('./routes/retailer/journalVoucher');
const salesReturnRoutes = require('./routes/retailer/salesReturn');
const purchaseReturnRoutes = require('./routes/retailer/purchaseReturn');
const debitNoteRoutes = require('./routes/retailer/debitNote');
const creditNoteRoutes = require('./routes/retailer/creditNote');
const fiscalYearRoutes = require('./routes/fiscalYear');
const ageingReportRoutes = require('./routes/retailer/ageingReport');
const stockStatusRoutes = require('./routes/retailer/stockStatus');
const profitAnalysisRoutes = require('./routes/retailer/profitAnalysis');
const monthlyVatReportRoutes = require('./routes/retailer/monthlyVatReport');
const compositionRoutes = require('./routes/retailer/composition');
const rackRoutes = require('./routes/retailer/rack');
const storeRoutes = require('./routes/retailer/store');
const itemsCompanyRoutes = require('./routes/retailer/itemsCompany');
const salesQuotationRoutes = require('./routes/retailer/salesQuotation');
const invoiceWiseProfitLossRoutes = require('./routes/retailer/invoiceWiseProfitLoss');
const permissionRoutes = require('./routes/permissions');
const preferencesRoutes = require('./routes/preferences');

//Admin Panel
const systemAdminDashboardRoutes = require('./routes/systemAdmin/adminDashboard');

const path = require('path');
const ejsMate = require('ejs-mate');
const setNoCache = require('./middleware/setNoCache');
const AppError = require('./middleware/AppError');
const Company = require('./models/Company');

const app = express();

// Initialize Passport
initializePassport(passport);


// const mongoUri = process.env.MONGO_URI; // Access MongoDB URI from the .env file

// mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

// const db = mongoose.connection;

// db.on("error", console.error.bind(console, "connection error:"));
// db.once("open", () => {
//     console.log("Database connected");
// });

// Connect with database
mongoose.connect('mongodb+srv://saroj:12345@cluster0.vgu4kmg.mongodb.net/sales-bill-system');
// mongoose.connect('mongodb+srv://saroj:12345@cluster0.vgu4kmg.mongodb.net/Sarathi');
// mongoose.connect('mongodb+srv://saroj:12345@cluster0.vgu4kmg.mongodb.net/Sarathi?retryWrites=true&w=majority&appName=Cluster0')
const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
    console.log("Database connected");
});

const sessionConfig = {
    secret: 'thisisnotagoodsecret',
    resave: false,
    saveUninitialized: false,
    serverSelectionTimeoutMS: 5000,
    cookie: {
        httpOnly: true,
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
};

app.use(session(sessionConfig));
app.use(flash());
app.set('view engine', 'ejs');
app.engine('ejs', ejsMate);
app.set('views', path.join(__dirname, 'views'));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// Flash middleware
app.use((req, res, next) => {
    res.locals.user = req.user;
    res.locals.messages = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

app.locals.numberToWords = numberToWords;

// Routes
app.use('/preferences', preferencesRoutes);
app.use('/', salesBillsRoutes);
app.use('/', unitRoutes);
app.use('/', mainUnitRoutes);
app.use('/', accountRoutes);
app.use('/', companyGroupRoutes);
app.use('/', itemsCategoryRoutes);
app.use('/', itemsRoutes);
app.use('/api', transactionRoutes);
app.use('/', indexRoutes);
app.use('/', usersRoutes);
app.use('/', companyRoutes);
app.use('/', stockAdjustmentsRoutes);
app.use('/', itemsLedgerRoutes);
app.use('/settings', settingsRoutes);
app.use('/', purchaseRoutes);
app.use('/', paymentRoutes);
app.use('/', receiptRoutes);
app.use('/', journalVoucherRoutes);
app.use('/', salesReturnRoutes);
app.use('/', purchaseReturnRoutes);
app.use('/', debitNoteRoutes);
app.use('/', creditNoteRoutes);
app.use('/', fiscalYearRoutes);
app.use('/', ageingReportRoutes);
app.use('/retailer', stockStatusRoutes);
app.use('/retailer', profitAnalysisRoutes);
app.use('/retailer', monthlyVatReportRoutes);
app.use('/', compositionRoutes);
app.use('/retailer', rackRoutes);
app.use('/retailer', storeRoutes);
app.use('/retailer', itemsCompanyRoutes);
app.use('/retailer', salesQuotationRoutes);
app.use('/retailer', invoiceWiseProfitLossRoutes);
app.use('/api/permissions', permissionRoutes);

//Admin Panel
app.use('/', systemAdminDashboardRoutes);

app.all('*', (req, res, next) => {
    res.render('404');
})

app.use((err, req, res, next) => {
    const { statusCode = 500, message = 'Something went wrong' } = err;
    if (statusCode === 404) {
        return res.render('404.ejs', { message });
    }
    // Handle other errors if needed
    res.status(statusCode).send({ status: 'error', message });
});


app.use(setNoCache); //Globally

const cron = require('node-cron');
const Item = require('./models/retailer/Item');
const moment = require('moment');
const { transporter } = require('./config/email');


// The cron schedule '0 11 * * *' breaks down as:

// 0 - At minute 0

// 11 - At hour 11 (11 AM in 24-hour format)

// * - Every day of the month

// * - Every month

// * - Every day of the week

// Run every day at 11 AM
cron.schedule('0 11 * * *', async () => {
    console.log('Running daily expiry notification check...');
    try {
        const companies = await Company.find({ notificationEmails: { $exists: true, $ne: [] } });

        if (companies.length === 0) {
            console.log('No companies with notification emails configured');
            return;
        }

        for (const company of companies) {
            try {
                console.log(`Processing notifications for company: ${company.name}`);
                await processCompanyNotifications(company);
            } catch (error) {
                console.error(`Error processing company ${company.name}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in expiry notification job:', error);
    }
}, {
    timezone: "Asia/Kathmandu"  // Explicitly set Nepal timezone
});

async function processCompanyNotifications(company) {
    // Get items with batches expiring within 30 days or already expired
    const items = await Item.aggregate([
        {
            $match: {
                company: company._id,
                'stockEntries.quantity': { $gt: 0 } // Only items with stock
            }
        },
        {
            $unwind: "$stockEntries"
        },
        {
            $match: {
                $or: [
                    { "stockEntries.expiryDate": { $lt: new Date() } }, // Expired
                    {
                        "stockEntries.expiryDate": {
                            $lt: moment().add(90, 'days').toDate(), // Expiring within 90 days
                            $gt: new Date() // Not expired yet
                        }
                    }
                ]
            }
        },
        {
            $group: {
                _id: "$_id",
                name: { $first: "$name" },
                unit: { $first: "$unit" },
                batches: {
                    $push: {
                        batchNumber: "$stockEntries.batchNumber",
                        expiryDate: "$stockEntries.expiryDate",
                        quantity: "$stockEntries.quantity",
                        status: {
                            $cond: [
                                { $lt: ["$stockEntries.expiryDate", new Date()] },
                                "expired",
                                {
                                    $cond: [
                                        {
                                            $lte: [
                                                "$stockEntries.expiryDate",
                                                moment().add(30, 'days').toDate()
                                            ]
                                        },
                                        "critical",
                                        "warning"
                                    ]
                                }
                            ]
                        }
                    }
                }
            }
        },
        {
            $lookup: {
                from: "units",
                localField: "unit",
                foreignField: "_id",
                as: "unit"
            }
        },
        {
            $unwind: "$unit"
        }
    ]);

    if (items.length === 0) {
        console.log(`No expiring items found for company: ${company.name}`);
        return;
    }

    await sendExpiryNotification(company, items);
}

async function sendExpiryNotification(company, items) {
    // Group items by status
    const expiredItems = items.filter(item =>
        item.batches.some(batch => batch.status === 'expired')
    );
    const criticalItems = items.filter(item =>
        item.batches.some(batch => batch.status === 'critical')
    );
    const warningItems = items.filter(item =>
        item.batches.some(batch => batch.status === 'warning')
    );

    const emailContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; }
                .header { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
                .section { margin-bottom: 20px; }
                .item-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                .item-table th { background-color: #f5f5f5; text-align: left; padding: 8px; }
                .item-table td { padding: 8px; border-bottom: 1px solid #eee; }
                .expired { color: #ee1a22; }
                .critical { color: #ff7376; }
                .warning { color: #FFFF00; }
                .batch-info { font-size: 0.9em; color: #666; }
                .footer { margin-top: 20px; font-size: 0.9em; color: #777; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>Inventory Expiry Alerts for ${company.name}</h2>
                <p>Date: ${moment().format('MMMM Do YYYY')}</p>
            </div>

            ${expiredItems.length > 0 ? `
                <div class="section expired">
                    <h3>Expired Items (${expiredItems.length})</h3>
                    <table class="item-table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Batch</th>
                                <th>Expiry Date</th>
                                <th>Quantity</th>
                                <th>Unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${expiredItems.map(item => `
                                ${item.batches.filter(b => b.status === 'expired').map(batch => `
                                    <tr>
                                        <td>${item.name}</td>
                                        <td>${batch.batchNumber || 'N/A'}</td>
                                        <td>${moment(batch.expiryDate).format('MMM Do YYYY')}</td>
                                        <td>${batch.quantity}</td>
                                        <td>${item.unit.name}</td>
                                    </tr>
                                `).join('')}
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            ${criticalItems.length > 0 ? `
                <div class="section critical">
                    <h3>Critical Items (Expiring within 30 days) (${criticalItems.length})</h3>
                    <table class="item-table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Batch</th>
                                <th>Expiry Date</th>
                                <th>Days Left</th>
                                <th>Quantity</th>
                                <th>Unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${criticalItems.map(item => `
                                ${item.batches.filter(b => b.status === 'critical').map(batch => `
                                    <tr>
                                        <td>${item.name}</td>
                                        <td>${batch.batchNumber || 'N/A'}</td>
                                        <td>${moment(batch.expiryDate).format('MMM Do YYYY')}</td>
                                        <td>${moment(batch.expiryDate).diff(moment(), 'days')}</td>
                                        <td>${batch.quantity}</td>
                                        <td>${item.unit.name}</td>
                                    </tr>
                                `).join('')}
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            ${warningItems.length > 0 ? `
                <div class="section warning">
                    <h3>Warning Items (Expiring within 90 days) (${warningItems.length})</h3>
                    <table class="item-table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Batch</th>
                                <th>Expiry Date</th>
                                <th>Days Left</th>
                                <th>Quantity</th>
                                <th>Unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${warningItems.map(item => `
                                ${item.batches.filter(b => b.status === 'warning').map(batch => `
                                    <tr>
                                        <td>${item.name}</td>
                                        <td>${batch.batchNumber || 'N/A'}</td>
                                        <td>${moment(batch.expiryDate).format('MMM Do YYYY')}</td>
                                        <td>${moment(batch.expiryDate).diff(moment(), 'days')}</td>
                                        <td>${batch.quantity}</td>
                                        <td>${item.unit.name}</td>
                                    </tr>
                                `).join('')}
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            <div class="footer">
                <p>This is an automated notification. Please do not reply to this email.</p>
            </div>
        </body>
        </html>
    `;
    // <p>You can view and manage these items in the <a href="${process.env.APP_URL}/inventory">inventory system</a>.</p>

    const mailOptions = {
        from: `Sarathi A/c Software <${process.env.EMAIL_USER}>`,
        to: company.notificationEmails.join(', '),
        subject: `[${company.name}] Inventory Expiry Alerts - ${moment().format('MMM Do YYYY')}`,
        html: emailContent
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Notification sent for company ${company.name}: ${info.messageId}`);
    } catch (error) {
        console.error(`Error sending email for company ${company.name}:`, error);
        throw error;
    }
}

// Test the notification system immediately on startup
// (async () => {
//     console.log('Running test notification...');
//     const testCompany = await Company.findOne({ notificationEmails: { $exists: true, $ne: [] } });

//     if (testCompany) {
//         console.log(`Sending test notification to ${testCompany.name}`);
//         await processCompanyNotifications(testCompany);
//     } else {
//         console.log('No company with notification emails found for testing');
//     }
// })();

app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "script-src 'self' 'unsafe-inline' http://localhost:3000"
    );
    next();
});
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});
// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});

// module.exports = app;


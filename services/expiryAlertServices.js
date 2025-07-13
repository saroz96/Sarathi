// const cron = require('node-cron');
// const Item = require('../models/retailer/Item');
// const Company = require('../models/retailer/Company');
// const moment = require('moment');
// const { transporter } = require('../config/email');

// // Run every day at 9 AM
// cron.schedule('0 9 * * *', async () => {
//     console.log('Running daily expiry notification check...');
//     try {
//         const companies = await Company.find({ notificationEmails: { $exists: true, $ne: [] } });

//         if (companies.length === 0) {
//             console.log('No companies with notification emails configured');
//             return;
//         }

//         for (const company of companies) {
//             try {
//                 console.log(`Processing notifications for company: ${company.name}`);
//                 await processCompanyNotifications(company);
//             } catch (error) {
//                 console.error(`Error processing company ${company.name}:`, error);
//             }
//         }
//     } catch (error) {
//         console.error('Error in expiry notification job:', error);
//     }
// });

// async function processCompanyNotifications(company) {
//     // Get items with batches expiring within 30 days or already expired
//     const items = await Item.aggregate([
//         {
//             $match: {
//                 company: company._id,
//                 'stockEntries.quantity': { $gt: 0 } // Only items with stock
//             }
//         },
//         {
//             $unwind: "$stockEntries"
//         },
//         {
//             $match: {
//                 $or: [
//                     { "stockEntries.expiryDate": { $lt: new Date() } }, // Expired
//                     {
//                         "stockEntries.expiryDate": {
//                             $lt: moment().add(90, 'days').toDate(), // Expiring within 90 days
//                             $gt: new Date() // Not expired yet
//                         }
//                     }
//                 ]
//             }
//         },
//         {
//             $group: {
//                 _id: "$_id",
//                 name: { $first: "$name" },
//                 unit: { $first: "$unit" },
//                 batches: {
//                     $push: {
//                         batchNumber: "$stockEntries.batchNumber",
//                         expiryDate: "$stockEntries.expiryDate",
//                         quantity: "$stockEntries.quantity",
//                         status: {
//                             $cond: [
//                                 { $lt: ["$stockEntries.expiryDate", new Date()] },
//                                 "expired",
//                                 {
//                                     $cond: [
//                                         {
//                                             $lte: [
//                                                 "$stockEntries.expiryDate",
//                                                 moment().add(30, 'days').toDate()
//                                             ]
//                                         },
//                                         "critical",
//                                         "warning"
//                                     ]
//                                 }
//                             ]
//                         }
//                     }
//                 }
//             }
//         },
//         {
//             $lookup: {
//                 from: "units",
//                 localField: "unit",
//                 foreignField: "_id",
//                 as: "unit"
//             }
//         },
//         {
//             $unwind: "$unit"
//         }
//     ]);

//     if (items.length === 0) {
//         console.log(`No expiring items found for company: ${company.name}`);
//         return;
//     }

//     await sendExpiryNotification(company, items);
// }

// async function sendExpiryNotification(company, items) {
//     // Group items by status
//     const expiredItems = items.filter(item =>
//         item.batches.some(batch => batch.status === 'expired')
//     );
//     const criticalItems = items.filter(item =>
//         item.batches.some(batch => batch.status === 'critical')
//     );
//     const warningItems = items.filter(item =>
//         item.batches.some(batch => batch.status === 'warning')
//     );

//     const emailContent = `
//         <!DOCTYPE html>
//         <html>
//         <head>
//             <style>
//                 body { font-family: Arial, sans-serif; line-height: 1.6; }
//                 .header { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
//                 .section { margin-bottom: 20px; }
//                 .item-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
//                 .item-table th { background-color: #f5f5f5; text-align: left; padding: 8px; }
//                 .item-table td { padding: 8px; border-bottom: 1px solid #eee; }
//                 .expired { color: #ee1a22; }
//                 .critical { color: #ff7376; }
//                 .warning { color: #FFFF00; }
//                 .batch-info { font-size: 0.9em; color: #666; }
//                 .footer { margin-top: 20px; font-size: 0.9em; color: #777; }
//             </style>
//         </head>
//         <body>
//             <div class="header">
//                 <h2>Inventory Expiry Alerts for ${company.name}</h2>
//                 <p>Date: ${moment().format('MMMM Do YYYY')}</p>
//             </div>

//             ${expiredItems.length > 0 ? `
//                 <div class="section expired">
//                     <h3>Expired Items (${expiredItems.length})</h3>
//                     <table class="item-table">
//                         <thead>
//                             <tr>
//                                 <th>Item Name</th>
//                                 <th>Batch</th>
//                                 <th>Expiry Date</th>
//                                 <th>Quantity</th>
//                                 <th>Unit</th>
//                             </tr>
//                         </thead>
//                         <tbody>
//                             ${expiredItems.map(item => `
//                                 ${item.batches.filter(b => b.status === 'expired').map(batch => `
//                                     <tr>
//                                         <td>${item.name}</td>
//                                         <td>${batch.batchNumber || 'N/A'}</td>
//                                         <td>${moment(batch.expiryDate).format('MMM Do YYYY')}</td>
//                                         <td>${batch.quantity}</td>
//                                         <td>${item.unit.name}</td>
//                                     </tr>
//                                 `).join('')}
//                             `).join('')}
//                         </tbody>
//                     </table>
//                 </div>
//             ` : ''}

//             ${criticalItems.length > 0 ? `
//                 <div class="section critical">
//                     <h3>Critical Items (Expiring within 7 days) (${criticalItems.length})</h3>
//                     <table class="item-table">
//                         <thead>
//                             <tr>
//                                 <th>Item Name</th>
//                                 <th>Batch</th>
//                                 <th>Expiry Date</th>
//                                 <th>Days Left</th>
//                                 <th>Quantity</th>
//                                 <th>Unit</th>
//                             </tr>
//                         </thead>
//                         <tbody>
//                             ${criticalItems.map(item => `
//                                 ${item.batches.filter(b => b.status === 'critical').map(batch => `
//                                     <tr>
//                                         <td>${item.name}</td>
//                                         <td>${batch.batchNumber || 'N/A'}</td>
//                                         <td>${moment(batch.expiryDate).format('MMM Do YYYY')}</td>
//                                         <td>${moment(batch.expiryDate).diff(moment(), 'days')}</td>
//                                         <td>${batch.quantity}</td>
//                                         <td>${item.unit.name}</td>
//                                     </tr>
//                                 `).join('')}
//                             `).join('')}
//                         </tbody>
//                     </table>
//                 </div>
//             ` : ''}

//             ${warningItems.length > 0 ? `
//                 <div class="section warning">
//                     <h3>Warning Items (Expiring within 30 days) (${warningItems.length})</h3>
//                     <table class="item-table">
//                         <thead>
//                             <tr>
//                                 <th>Item Name</th>
//                                 <th>Batch</th>
//                                 <th>Expiry Date</th>
//                                 <th>Days Left</th>
//                                 <th>Quantity</th>
//                                 <th>Unit</th>
//                             </tr>
//                         </thead>
//                         <tbody>
//                             ${warningItems.map(item => `
//                                 ${item.batches.filter(b => b.status === 'warning').map(batch => `
//                                     <tr>
//                                         <td>${item.name}</td>
//                                         <td>${batch.batchNumber || 'N/A'}</td>
//                                         <td>${moment(batch.expiryDate).format('MMM Do YYYY')}</td>
//                                         <td>${moment(batch.expiryDate).diff(moment(), 'days')}</td>
//                                         <td>${batch.quantity}</td>
//                                         <td>${item.unit.name}</td>
//                                     </tr>
//                                 `).join('')}
//                             `).join('')}
//                         </tbody>
//                     </table>
//                 </div>
//             ` : ''}

//             <div class="footer">
//                 <p>You can view and manage these items in the <a href="${process.env.APP_URL}/inventory">inventory system</a>.</p>
//                 <p>This is an automated notification. Please do not reply to this email.</p>
//             </div>
//         </body>
//         </html>
//     `;

//     const mailOptions = {
//         from: `Inventory System <${process.env.EMAIL_USER}>`,
//         to: company.notificationEmails.join(', '),
//         subject: `[${company.name}] Inventory Expiry Alerts - ${moment().format('MMM Do YYYY')}`,
//         html: emailContent
//     };

//     try {
//         const info = await transporter.sendMail(mailOptions);
//         console.log(`Notification sent for company ${company.name}: ${info.messageId}`);
//     } catch (error) {
//         console.error(`Error sending email for company ${company.name}:`, error);
//         throw error;
//     }
// }
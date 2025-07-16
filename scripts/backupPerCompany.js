const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;

const collectionsToExport = (process.env.BACKUP_COLLECTIONS || 'salesbills,purchasebills,items,users').split(',');

const collectionCompanyFieldMap = {
  salesbills:     { field: 'company' },
  purchasebills:  { field: 'company' },
  items:          { field: 'company' },
  users:          { field: 'companyId' },
};

(async () => {
  let client;
  try {
    client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);

    const companies = await db.collection('companies').find().toArray();
    (`Found ${companies.length} companies.`);

    for (const company of companies) {
      const companyId = company._id;
      const companyName = (company.name || 'unknown').replace(/[<>:"/\\|?*]/g, '_');
      const backupDir = path.join(__dirname, '..', 'backups', `${companyName}_${companyId}`);
      fs.mkdirSync(backupDir, { recursive: true });

      // Export collections
      for (const collectionName of collectionsToExport) {
        const config = collectionCompanyFieldMap[collectionName] || { field: 'company' };
        const collection = db.collection(collectionName);
        
        try {
          (`Exporting ${collectionName} for ${companyName}...`);
          const documents = await collection.find({
            [config.field]: companyId
          }).toArray();

          const exportPath = path.join(backupDir, `${collectionName}.json`);
          fs.writeFileSync(exportPath, JSON.stringify(documents, null, 2));
        } catch (err) {
          console.warn(`⚠️ Failed to export ${collectionName}: ${err.message}`);
        }
      }

      // Export company document
      try {
        const exportPath = path.join(backupDir, 'company.json');
        fs.writeFileSync(exportPath, JSON.stringify(company, null, 2));
      } catch (err) {
        console.warn(`⚠️ Failed to export company document: ${err.message}`);
      }
    }

    ('✅ Backup completed for all companies.');
  } catch (err) {
    console.error('❌ Backup failed:', err);
    process.exit(1);
  } finally {
    if (client) await client.close();
  }
})();
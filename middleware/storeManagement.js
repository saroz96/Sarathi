import Company from "../models/Company.js";

export async function checkStoreManagement(req, res, next) {
  try {
    const companyId = req.session.currentCompany;
    const company = await Company.findById(companyId).select('storeManagement');
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Attach store management status to request object
    req.storeManagementEnabled = company.storeManagement;
    next();
  } catch (err) {
    console.error('Error checking store management:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

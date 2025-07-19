import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaBars, FaTimes } from 'react-icons/fa';
import { BiSun, BiMoon } from 'react-icons/bi';
import '../../stylesheet/retailer/Header.css'
import { useAuth } from '../../context/AuthContext';

const Header = () => {
    const { user, hasPermission, isAdminOrSupervisor } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState('light');
  const navigate = useNavigate();

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <header className="header">
      <div className="header-row container-fluid" role="navigation">
        {/* Desktop Menu */}
        <div className="header-right">
          <ul className="main-menu">
            <li className="menu-item">
              <Link to="/retailerDashboard/indexv1" className="active" id="home">
                Home
              </Link>
            </li>

            {/* Accounts Menu */}
            {hasPermission('AccountsHeader') && (
              <li className="menu-item dropdown">
                <Link to="#" className="active">
                  Accounts
                </Link>
                <div className="sub-menu-wrapper slideInUp">
                  <ul className="sub-menu">
                    {hasPermission('Account') && (
                      <li className="menu-item">
                        <Link to="/companies">Account</Link>
                      </li>
                    )}
                    {hasPermission('AccountGroup') && (
                      <li className="menu-item">
                        <Link to="/account-group">Account Group</Link>
                      </li>
                    )}
                  </ul>
                </div>
              </li>
            )}

            {/* Items Menu */}
            {hasPermission('itemsHeader') && (
              <li className="menu-item dropdown">
                <Link to="#" className="active">
                  Items
                </Link>
                <div className="sub-menu-wrapper slideInUp">
                  <ul className="sub-menu">
                    {hasPermission('createItem') && (
                      <li className="menu-item">
                        <Link to="/items">Item</Link>
                      </li>
                    )}
                    {hasPermission('category') && (
                      <li className="menu-item">
                        <Link to="/categories">Category</Link>
                      </li>
                    )}
                    {hasPermission('company') && (
                      <li className="menu-item">
                        <Link to="/retailer/items-company">Company</Link>
                      </li>
                    )}
                    {hasPermission('unit') && (
                      <li className="menu-item">
                        <Link to="/units">Unit</Link>
                      </li>
                    )}
                    {hasPermission('mainUnit') && (
                      <li className="menu-item">
                        <Link to="/mainUnits">Main Unit</Link>
                      </li>
                    )}
                    {hasPermission('composition') && (
                      <li className="menu-item">
                        <Link to="/compositions">Composition</Link>
                      </li>
                    )}
                  </ul>
                </div>
              </li>
            )}

            {/* Sales Department Menu */}
            {hasPermission('salesDepartment') && (
              <li className="menu-item dropdown">
                <Link to="#" className="active">
                  Sales Department
                </Link>
                <div className="sub-menu-wrapper slideInUp">
                  <ul className="sub-menu">
                    {hasPermission('salesQuotation') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Sales Quotation</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/retailer/sales-quotation">Add</Link>
                          </li>
                          <li className="menu-item">
                            <Link to="#">Edit</Link>
                          </li>
                          <li className="menu-item">
                            <Link to="/retailer/sales-quotation/list">List</Link>
                          </li>
                        </ul>
                      </li>
                    )}
                    {hasPermission('creditSales') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Credit Sales</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/bills">Add Sales</Link>
                          </li>
                          <li className="menu-item">
                            <Link to="/billsTrackBatchOpen">Add Sales Open</Link>
                          </li>
                          {hasPermission('creditSalesModify') && (
                            <li className="menu-item">
                              <Link to="/sales-bills/finds">Edit Sales</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                    {hasPermission('cashSales') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Cash Sales</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/cash/bills/add">Add Sales</Link>
                          </li>
                          <li className="menu-item">
                            <Link to="/cash/bills/addOpen">Add Sales Open</Link>
                          </li>
                          {hasPermission('cashSalesModify') && (
                            <li className="menu-item">
                              <Link to="/cash-sales/sales-bills/finds">Edit Sales</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                    {hasPermission('salesRegister') && (
                      <li className="menu-item">
                        <Link to="/bills-list">Sales Register</Link>
                      </li>
                    )}
                    {hasPermission('creditSalesRtn') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Credit Sales Rtn</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/sales-return">Add</Link>
                          </li>
                          <li className="menu-item">
                            <Link to="/sales-return/finds">Edit</Link>
                          </li>
                        </ul>
                      </li>
                    )}
                    {hasPermission('cashSalesRtn') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Cash Sales Rtn</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/cash/sales-return/add">Add</Link>
                          </li>
                          <li className="menu-item">
                            <Link to="/cash-sales-return/sales-return/finds">Edit</Link>
                          </li>
                        </ul>
                      </li>
                    )}
                    {hasPermission('salesRtnRegister') && (
                      <li className="menu-item">
                        <Link to="/sales-return/list">Sales Rtn Register</Link>
                      </li>
                    )}
                  </ul>
                </div>
              </li>
            )}

            {/* Purchase Department Menu */}
            {hasPermission('purchaseDepartment') && (
              <li className="menu-item dropdown">
                <Link to="#" className="active">
                  Purchase Department
                </Link>
                <div className="sub-menu-wrapper slideInUp">
                  <ul className="sub-menu">
                    {hasPermission('createPurchase') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Purchase</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/purchase-bills">Add</Link>
                          </li>
                          {hasPermission('purchaseModify') && (
                            <li className="menu-item">
                              <Link to="/purchase-bills/finds">Edit</Link>
                            </li>
                          )}
                          {hasPermission('purchaseRegister') && (
                            <li className="menu-item">
                              <Link to="/purchase-bills-list">Purchase Register</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                    {hasPermission('createPurchaseRtn') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Purchase Return</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/purchase-return">Add</Link>
                          </li>
                          {hasPermission('purchaseRtnModify') && (
                            <li className="menu-item">
                              <Link to="/purchase-return/finds">Edit</Link>
                            </li>
                          )}
                          {hasPermission('purchaseRtnRegister') && (
                            <li className="menu-item">
                              <Link to="/purchase-return/list">Purchase Rtn Register</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                  </ul>
                </div>
              </li>
            )}

            {/* Inventory Menu */}
            {hasPermission('inventoryHeader') && (
              <li className="menu-item dropdown">
                <Link to="#" className="active">
                  Inventory
                </Link>
                <div className="sub-menu-wrapper slideInUp">
                  <ul className="sub-menu">
                    {hasPermission('itemLedger') && (
                      <li className="menu-item">
                        <Link to="/items-ledger">Item Ledger</Link>
                      </li>
                    )}
                    {hasPermission('createStockAdj') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Stock Adjustment</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/stockAdjustments/new">Add</Link>
                          </li>
                          {hasPermission('stockAdjRegister') && (
                            <li className="menu-item">
                              <Link to="/stockAdjustments">Stock Adj. Register</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                    {hasPermission('storeRackSubHeader') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Store/Rack</Link>
                        <ul className="sub-menu">
                          {hasPermission('store') && (
                            <li className="menu-item">
                              <Link to="/retailer/store/management">Store</Link>
                            </li>
                          )}
                          {hasPermission('rack') && (
                            <li className="menu-item">
                              <Link to="/retailer/rack/management">Rack</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                    {hasPermission('stockStatus') && (
                      <li className="menu-item">
                        <Link to="/retailer/stock-status">Stock Status</Link>
                      </li>
                    )}
                    {(hasPermission('reorderLevel') || user?.role === 'Purchase') && (
                      <li className="menu-item">
                        <Link to="/items/reorder">Re Order Level</Link>
                      </li>
                    )}
                    {(hasPermission('itemSalesReport') || user?.role === 'Purchase') && (
                      <li className="menu-item">
                        <Link to="/api/sold-items">Item Sales Report</Link>
                      </li>
                    )}
                  </ul>
                </div>
              </li>
            )}

            {/* Account Department Menu */}
            {hasPermission('accountDepartment') && (
              <li className="menu-item dropdown">
                <Link to="#" className="active">
                  Account Department
                </Link>
                <div className="sub-menu-wrapper slideInUp">
                  <ul className="sub-menu">
                    {hasPermission('payment') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Payment</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/payments">Add</Link>
                          </li>
                          {hasPermission('paymentModify') && (
                            <li className="menu-item">
                              <Link to="/payments/finds">Edit</Link>
                            </li>
                          )}
                          {hasPermission('paymentRegister') && (
                            <li className="menu-item">
                              <Link to="/payments-list">List</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                    {hasPermission('receipt') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Receipt</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/receipts">Add</Link>
                          </li>
                          {hasPermission('receiptModify') && (
                            <li className="menu-item">
                              <Link to="/receipts/finds">Edit</Link>
                            </li>
                          )}
                          {hasPermission('receiptRegister') && (
                            <li className="menu-item">
                              <Link to="/receipts-list">List</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                    {hasPermission('journal') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Journal</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/journal/new">Add</Link>
                          </li>
                          {hasPermission('journalModify') && (
                            <li className="menu-item">
                              <Link to="/journals/finds">Edit</Link>
                            </li>
                          )}
                          {hasPermission('journalRegister') && (
                            <li className="menu-item">
                              <Link to="/journal/list">List</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                    {hasPermission('debitNote') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Debit Note</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/debit-note/new">Add</Link>
                          </li>
                          {hasPermission('debitNoteModify') && (
                            <li className="menu-item">
                              <Link to="/debitnote/finds">Edit</Link>
                            </li>
                          )}
                          {hasPermission('debitNoteRegister') && (
                            <li className="menu-item">
                              <Link to="/debit-note/list">List</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                    {hasPermission('creditNote') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Credit Note</Link>
                        <ul className="sub-menu">
                          <li className="menu-item">
                            <Link to="/credit-note/new">Add</Link>
                          </li>
                          {hasPermission('creditNoteModify') && (
                            <li className="menu-item">
                              <Link to="/creditnote/finds">Edit</Link>
                            </li>
                          )}
                          {hasPermission('creditNoteRegister') && (
                            <li className="menu-item">
                              <Link to="/credit-note/list">List</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                  </ul>
                </div>
              </li>
            )}

            {/* Outstanding Menu */}
            {hasPermission('outstandingHeader') && (
              <li className="menu-item dropdown">
                <Link to="#" className="active">
                  Outstanding
                </Link>
                <div className="sub-menu-wrapper slideInUp">
                  <ul className="sub-menu">
                    {hasPermission('ageingSubHeader') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Ageing</Link>
                        <ul className="sub-menu">
                          {hasPermission('ageingFIFO') && (
                            <li className="menu-item">
                              <Link to="/aging/accounts">Ageing(FIFO)</Link>
                            </li>
                          )}
                          {hasPermission('ageingDayWise') && (
                            <li className="menu-item">
                              <Link to="/day-count-aging">Day Wise</Link>
                            </li>
                          )}
                          {hasPermission('ageingAllParty') && (
                            <li className="menu-item">
                              <Link to="/ageing-all/accounts">All Party</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                    {hasPermission('statements') && (
                      <li className="menu-item">
                        <Link to="/statement">Statements</Link>
                      </li>
                    )}
                    {hasPermission('reportsSubHeader') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Reports</Link>
                        <ul className="sub-menu">
                          {hasPermission('dailyProfitSaleAnalysis') && (
                            <li className="menu-item">
                              <Link to="/retailer/daily-profit/sales-analysis">Daily Profit/Sale Analysis</Link>
                            </li>
                          )}
                          {hasPermission('invoiceWiseProfitLoss') && (
                            <li className="menu-item">
                              <Link to="/retailer/invoice-wise-profit-loss">Invoice Wise Profit & Loss</Link>
                            </li>
                          )}
                        </ul>
                      </li>
                    )}
                  </ul>
                </div>
              </li>
            )}

            {/* Vat Summary Menu */}
            {hasPermission('vatSummaryHeader') && (
              <li className="menu-item dropdown">
                <Link to="#" className="active">
                  Vat Summary
                </Link>
                <div className="sub-menu-wrapper slideInUp">
                  <ul className="sub-menu">
                    {hasPermission('salesVatRegister') && (
                      <li className="menu-item">
                        <Link to="/sales-vat-report">Sales Vat Register</Link>
                      </li>
                    )}
                    {hasPermission('salesRtnVatRegister') && (
                      <li className="menu-item">
                        <Link to="/salesReturn-vat-report">Sales Return Register</Link>
                      </li>
                    )}
                    {hasPermission('purchaseVatRegister') && (
                      <li className="menu-item">
                        <Link to="/purchase-vat-report">Purchase Vat Register</Link>
                      </li>
                    )}
                    {hasPermission('purchaseRtnVatRegister') && (
                      <li className="menu-item">
                        <Link to="/purchaseReturn-vat-report">Purchase Return Register</Link>
                      </li>
                    )}
                    {hasPermission('monthlyVatSummary') && (
                      <li className="menu-item">
                        <Link to="/retailer/monthly-vat-report">Monthly Vat Summary</Link>
                      </li>
                    )}
                  </ul>
                </div>
              </li>
            )}

            {/* Configuration Menu */}
            {hasPermission('configurationHeader') && (
              <li className="menu-item dropdown">
                <Link to="#" className="active">
                  Configuration
                </Link>
                <div className="sub-menu-wrapper slideInUp">
                  <ul className="sub-menu">
                    {hasPermission('voucherConfiguration') && (
                      <li className="menu-item">
                        <Link to="/settings">Voucher Configuration</Link>
                      </li>
                    )}
                    {hasPermission('changeFiscalYear') && (
                      <li className="menu-item">
                        <Link to="/change-fiscal-year">Change Fiscal Year</Link>
                      </li>
                    )}
                    {hasPermission('existingFiscalYear') && (
                      <li className="menu-item">
                        <Link to="/switch-fiscal-year">Existing Fiscal Year</Link>
                      </li>
                    )}
                    {hasPermission('importExportSubHeader') && (
                      <li className="menu-item dropdown">
                        <Link to="#">Import</Link>
                        <ul className="sub-menu">
                          {hasPermission('itemsImport') && (
                            <>
                              <li className="menu-item">
                                <Link to="/items-import">Items Import</Link>
                              </li>
                              <li className="menu-item">
                                <Link to="/accounts-import">Accounts Import</Link>
                              </li>
                            </>
                          )}
                        </ul>
                      </li>
                    )}
                  </ul>
                </div>
              </li>
            )}

            {/* User Profile Menu */}
            <li className="menu-item dropdown">
              <Link to="#" className="active">
                <i className="bi bi-person" style={{ fontSize: '20px' }}></i>
              </Link>
              <div className="sub-menu-wrapper slideInUp">
                <ul className="sub-menu">
                  {isAdminOrSupervisor ? (
                    <li className="menu-item">
                      <Link to={`/admin/users/view/${user?._id}`}>{user?.name}</Link>
                    </li>
                  ) : (
                    <li className="menu-item">
                      <Link to={`/account/users/view/${user?._id}`}>{user?.name}</Link>
                    </li>
                  )}
                  <li className="menu-item">
                    <Link to="/user/change-password">Change Password</Link>
                  </li>
                  {isAdminOrSupervisor && (
                    <>
                      <li className="menu-item">
                        <Link to="/admin/users/list">Users</Link>
                      </li>
                    </>
                  )}
                  <li className="menu-item">
                    <Link to="/dashboard">My Company</Link>
                  </li>
                  <li className="menu-item">
                    <Link to="/logout">Logout</Link>
                  </li>
                </ul>
              </div>
            </li>

            {/* Theme Toggle */}
            <li className="menu-item theme-toggle-container">
              <div className="theme-toggle">
                <button
                  id="theme-switcher"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={toggleTheme}
                >
                  {theme === 'light' ? <BiMoon /> : <BiSun />}
                </button>
              </div>
            </li>
          </ul>

          {/* Mobile Menu Toggle */}
          <button
            id="three-dots"
            className="mobile-toggler"
            onClick={toggleMobileMenu}
          >
            {mobileMenuOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
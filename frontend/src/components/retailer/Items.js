import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FiEdit2, FiTrash2, FiEye, FiCheck, FiPrinter, FiArrowLeft, FiPlus } from 'react-icons/fi';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
import Badge from 'react-bootstrap/Badge';
import Spinner from 'react-bootstrap/Spinner';
import '../../stylesheet/retailer/Items.css';


const Items = () => {
    const navigate = useNavigate();
    const [data, setData] = useState({
        items: [],
        categories: [],
        itemsCompanies: [],
        units: [],
        mainUnits: [],
        compositions: [],
        company: null,
        currentFiscalYear: null,
        vatEnabled: false,
        companyId: '',
        currentCompanyName: '',
        companyDateFormat: 'english',
        nepaliDate: '',
        fiscalYear: '',
        user: null,
        theme: 'light',
        isAdminOrSupervisor: false
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [showCompositionModal, setShowCompositionModal] = useState(false);
    const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
    const [currentItem, setCurrentItem] = useState(null);
    const [printOption, setPrintOption] = useState('all');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedCompany, setSelectedCompany] = useState('');
    const [selectedCompositions, setSelectedCompositions] = useState([]);
    const [compositionSearch, setCompositionSearch] = useState('');
    const [successMessage, setSuccessMessage] = useState('');


    // Form state
    const [formData, setFormData] = useState({
        name: '',
        hscode: '',
        category: '',
        itemsCompany: '',
        composition: '',
        compositionIds: '',
        mainUnit: '',
        WSUnit: '',
        unit: '',
        vatStatus: '',
        reorderLevel: '',
        price: '',
        puPrice: '',
        openingStock: '',
        openingStockBalance: ''
    });
    const api = axios.create({
        baseURL: process.env.REACT_APP_API_BASE_URL,
        withCredentials: true,
    });


    useEffect(() => {
        fetchItems();
    }, []);

    const fetchItems = async () => {
        try {
            setLoading(true);
            const response = await api.get('https://sarathi-rww3.onrender.com/api/items/getitemsinform');
            if (response.data.success) {
                setData({
                    items: response.data.items,
                    categories: response.data.categories,
                    itemsCompanies: response.data.itemsCompanies,
                    units: response.data.units,
                    mainUnits: response.data.mainUnits,
                    compositions: response.data.composition,
                    company: response.data.company,
                    currentFiscalYear: response.data.currentFiscalYear,
                    vatEnabled: response.data.vatEnabled,
                    companyId: response.data.companyId,
                    currentCompanyName: response.data.currentCompanyName,
                    companyDateFormat: response.data.companyDateFormat,
                    nepaliDate: response.data.nepaliDate,
                    fiscalYear: response.data.fiscalYear,
                    user: response.data.user,
                    theme: response.data.theme,
                    isAdminOrSupervisor: response.data.isAdminOrSupervisor
                });
            } else {
                throw new Error(response.data.error || 'Failed to fetch items');
            }
        } catch (err) {
            handleApiError(err);
        } finally {
            setLoading(false);
        }
    };

    const handleApiError = (error) => {
        if (error.response) {
            switch (error.response.status) {
                case 400:
                    if (error.response.data.error === 'No fiscal year found in session.') {
                        navigate('/select-fiscal-year');
                        return;
                    }
                    setError(error.response.data.error || 'Invalid request');
                    break;
                case 401:
                    navigate('/login');
                    return;
                case 403:
                    navigate('/select-company');
                    return;
                default:
                    setError(error.response.data.message || 'Request failed');
            }
        } else if (error.request) {
            setError('No response from server. Please check your connection.');
        } else {
            setError(error.message || 'An error occurred');
        }
    };

    const handleSearch = (e) => {
        setSearchTerm(e.target.value.toLowerCase());
    };

    const filteredItems = data.items.filter(item =>
        item.name.toLowerCase().includes(searchTerm) ||
        (item.itemsCompany && item.itemsCompany.name.toLowerCase().includes(searchTerm)) ||
        (item.category && item.category.name.toLowerCase().includes(searchTerm))
    );

    const handleEdit = (item) => {
        setCurrentItem(item);
        setFormData({
            name: item.name,
            hscode: item.hscode || '',
            category: item.category?._id || '',
            itemsCompany: item.itemsCompany?._id || '',
            composition: item.composition?.map(c => c.name).join(', ') || '',
            compositionIds: item.composition?.map(c => c._id).join(',') || '',
            mainUnit: item.mainUnit?._id || '',
            WSUnit: item.WSUnit || '',
            unit: item.unit?._id || '',
            vatStatus: item.vatStatus || '',
            reorderLevel: item.reorderLevel || '',
            price: item.price || '',
            puPrice: item.puPrice || '',
            openingStock: item.openingStock || '',
            openingStockBalance: item.openingStockBalance || ''
        });
        setShowEditModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this item?')) {
            try {
                await api.delete(`/items/${id}`);
                fetchItems(); // Refresh the list
            } catch (err) {
                handleApiError(err);
            }
        }
    };

    const handleSelectItem = (item) => {
        setFormData({
            name: item.name,
            hscode: item.hscode || '',
            category: item.category?._id || '',
            itemsCompany: item.itemsCompany?._id || '',
            composition: item.composition?.map(c => c.name).join(', ') || '',
            compositionIds: item.composition?.map(c => c._id).join(',') || '',
            mainUnit: item.mainUnit?._id || '',
            WSUnit: item.WSUnit || '',
            unit: item.unit?._id || '',
            vatStatus: item.vatStatus || '',
            reorderLevel: item.reorderLevel || '',
            price: item.price || '',
            puPrice: item.puPrice || '',
            openingStock: item.openingStock || '',
            openingStockBalance: item.openingStockBalance || ''
        });
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        // If the field being changed is the name field, also update the search term
        if (name === 'name') {
            setSearchTerm(value.toLowerCase());
        }
    };

    const handleCompositionSelect = (composition) => {
        setSelectedCompositions(prev => {
            const exists = prev.some(c => c._id === composition._id);
            if (exists) {
                return prev.filter(c => c._id !== composition._id);
            } else {
                return [...prev, composition];
            }
        });
    };

    const handleSelectAllCompositions = (e) => {
        if (e.target.checked) {
            setSelectedCompositions(filteredCompositions);
        } else {
            setSelectedCompositions([]);
        }
    };

    const handleCompositionDone = () => {
        setFormData(prev => ({
            ...prev,
            composition: selectedCompositions.map(c => c.name).join(', '),
            compositionIds: selectedCompositions.map(c => c._id).join(',')
        }));
        setShowCompositionModal(false);
    };

    useEffect(() => {
        if (successMessage || error) {
            const timer = setTimeout(() => {
                setSuccessMessage('');
                setError('');
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [successMessage, error]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            let response;
            if (currentItem) {
                response = await api.put(`/items/${currentItem._id}`, formData);
                setSuccessMessage('Item updated successfully!');
            } else {
                response = await api.post('/api/items/create', formData);
                setSuccessMessage('Item created successfully!');

                // Clear the form after successful creation
                setFormData({
                    name: '',
                    hscode: '',
                    category: '',
                    itemsCompany: '',
                    composition: '',
                    compositionIds: '',
                    mainUnit: '',
                    WSUnit: '',
                    unit: '',
                    vatStatus: '',
                    reorderLevel: '',
                    price: '',
                    puPrice: '',
                    openingStock: '',
                    openingStockBalance: ''
                });
            }
            if (response.data.success) {
                // Force refresh the items list
                await fetchItems();
                setShowEditModal(false);
            } else {
                throw new Error(response.data.error || 'Operation failed');
            }
        } catch (err) {
            setError(err.message || 'Failed to save item');
        }
    };

    const filteredCompositions = data.compositions.filter(comp =>
        comp.name.toLowerCase().includes(compositionSearch.toLowerCase()) ||
        (comp.uniqueNumber && comp.uniqueNumber.toString().includes(compositionSearch))
    );

    const printItems = () => {
        let itemsToPrint = [...data.items];

        switch (printOption) {
            case 'active':
                itemsToPrint = itemsToPrint.filter(item => item.status === 'active');
                break;
            case 'vatable':
                itemsToPrint = itemsToPrint.filter(item => item.vatStatus === 'vatable');
                break;
            case 'vatExempt':
                itemsToPrint = itemsToPrint.filter(item => item.vatStatus === 'vatExempt');
                break;
            case 'category':
                itemsToPrint = itemsToPrint.filter(item => item.category?._id === selectedCategory);
                break;
            case 'itemsCompany':
                itemsToPrint = itemsToPrint.filter(item => item.itemsCompany?._id === selectedCompany);
                break;
        }

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Items Report</title>
                    <style>
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        .badge { padding: 3px 6px; border-radius: 3px; font-size: 12px; }
                        .badge-success { background-color: #28a745; color: white; }
                        .badge-danger { background-color: #dc3545; color: white; }
                        .badge-warning { background-color: #ffc107; color: black; }
                    </style>
                </head>
                <body>
                    <h2>Items Report - ${data.currentCompanyName}</h2>
                    <h3>Fiscal Year: ${data.currentFiscalYear?.name || 'N/A'}</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>S.N.</th>
                                <th>Name</th>
                                <th>Company</th>
                                <th>Category</th>
                                <th>VAT</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsToPrint.map((item, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>${item.name}</td>
                                    <td>${item.itemsCompany?.name || 'N/A'}</td>
                                    <td>${item.category?.name || 'N/A'}</td>
                                    <td>
                                        <span class="badge ${item.vatStatus === 'vatable' ? 'badge-success' : 'badge-warning'}">
                                            ${item.vatStatus === 'vatable' ? '13%' : 'Exempt'}
                                        </span>
                                    </td>
                                    <td>
                                        <span class="badge ${item.status === 'active' ? 'badge-success' : 'badge-danger'}">
                                            ${item.status}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <p style="margin-top: 20px;">
                        Printed on: ${data.companyDateFormat === 'nepali' ? data.nepaliDate : new Date().toLocaleDateString()}
                    </p>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.altKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                setShowSaveConfirmModal(true);
            } else if (e.key === 'F6' && !showCompositionModal) {
                e.preventDefault();
                setShowCompositionModal(true);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const form = e.target.form;
                if (form) {
                    const index = Array.prototype.indexOf.call(form, e.target);
                    if (index < form.length - 1) {
                        form.elements[index + 1].focus();
                    }
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [showCompositionModal]);

    return (
        <div className="container-fluid mt-4">
            <div className="row g-3">
                {/* Left Column - Add Item Form */}
                {successMessage && (
                    <div className="alert alert-success mt-3">
                        {successMessage}
                    </div>
                )}
                <div className="col-lg-6">
                    <div className="card h-100 shadow-lg">
                        <h1 className="text-center" style={{ textDecoration: 'underline' }}>Create Items</h1>
                        <div className="card-body">
                            <Form onSubmit={handleSubmit} id="addItemForm">
                                <Form.Group className="row mb-3">
                                    <div className="col">
                                        <Form.Label>Name <span className="text-danger">*</span></Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleFormChange}
                                            placeholder="Enter item name"
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    <div className="col-3">
                                        <Form.Label>HSN</Form.Label>
                                        <Form.Control
                                            type="number"
                                            name="hscode"
                                            value={formData.hscode}
                                            onChange={handleFormChange}
                                        />
                                    </div>
                                    <div className="col-3">
                                        <Form.Label>Company <span className="text-danger">*</span></Form.Label>
                                        <Form.Select
                                            name="itemsCompany"
                                            value={formData.itemsCompany}
                                            onChange={handleFormChange}
                                            required
                                        >
                                            <option value="" disabled>Select company</option>
                                            {data.itemsCompanies.map(company => (
                                                <option key={company._id} value={company._id}>
                                                    {company.name}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </div>
                                </Form.Group>

                                <Form.Group className="row mb-3">
                                    <div className="col-3">
                                        <Form.Label>Category <span className="text-danger">*</span></Form.Label>
                                        <Form.Select
                                            name="category"
                                            value={formData.category}
                                            onChange={handleFormChange}
                                            required
                                        >
                                            <option value="" disabled>Select category</option>
                                            {data.categories.map(category => (
                                                <option key={category._id} value={category._id}>
                                                    {category.name}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </div>
                                    <div className="col-9">
                                        <Form.Label>Composition</Form.Label>
                                        <div className="input-group">
                                            <Form.Control
                                                as="textarea"
                                                rows={1}
                                                name="composition"
                                                value={formData.composition}
                                                onChange={handleFormChange}
                                                placeholder="Press F6 to add compositions"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'F6') {
                                                        e.preventDefault();
                                                        setShowCompositionModal(true);
                                                    }
                                                }}
                                            />
                                            <Button
                                                variant="outline-secondary"
                                                onClick={() => setShowCompositionModal(true)}
                                            >
                                                <FiPlus />
                                            </Button>
                                        </div>
                                        <Form.Control type="hidden" name="compositionIds" value={formData.compositionIds} />
                                    </div>
                                </Form.Group>

                                <Form.Group className="row mb-3">
                                    <div className="col">
                                        <Form.Label>Main Unit <span className="text-danger">*</span></Form.Label>
                                        <Form.Select
                                            name="mainUnit"
                                            value={formData.mainUnit}
                                            onChange={handleFormChange}
                                            required
                                        >
                                            <option value="" disabled>Select Main Unit</option>
                                            {data.mainUnits.map(unit => (
                                                <option key={unit._id} value={unit._id}>
                                                    {unit.name}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </div>
                                    <div className="col">
                                        <Form.Label>WS Unit</Form.Label>
                                        <Form.Control
                                            type="number"
                                            name="WSUnit"
                                            value={formData.WSUnit}
                                            onChange={handleFormChange}
                                        />
                                    </div>
                                    <div className="col">
                                        <Form.Label>Unit <span className="text-danger">*</span></Form.Label>
                                        <Form.Select
                                            name="unit"
                                            value={formData.unit}
                                            onChange={handleFormChange}
                                            required
                                        >
                                            <option value="" disabled>Select Unit</option>
                                            {data.units.map(unit => (
                                                <option key={unit._id} value={unit._id}>
                                                    {unit.name}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </div>
                                </Form.Group>

                                <Form.Group className="row mb-3">
                                    <div className="col">
                                        <Form.Label>VAT <span className="text-danger">*</span></Form.Label>
                                        <Form.Select
                                            name="vatStatus"
                                            value={formData.vatStatus}
                                            onChange={handleFormChange}
                                            required
                                        >
                                            <option value="" disabled>Select VAT</option>
                                            {data.vatEnabled && <option value="vatable">Vatable</option>}
                                            <option value="vatExempt">VAT Exempt</option>
                                        </Form.Select>
                                    </div>
                                    <div className="col">
                                        <Form.Label>Re-Order (Qty)</Form.Label>
                                        <Form.Control
                                            type="number"
                                            name="reorderLevel"
                                            value={formData.reorderLevel}
                                            onChange={handleFormChange}
                                        />
                                    </div>
                                    <div className="col">
                                        <Form.Label>Sales Price</Form.Label>
                                        <Form.Control
                                            type="number"
                                            name="price"
                                            value={formData.price}
                                            onChange={handleFormChange}
                                            step="0.01"
                                        />
                                    </div>
                                </Form.Group>

                                <Form.Group className="row mb-3">
                                    <div className="col-md-3">
                                        <Form.Label>Purchase Price</Form.Label>
                                        <Form.Control
                                            type="number"
                                            name="puPrice"
                                            value={formData.puPrice}
                                            onChange={(e) => {
                                                const puPrice = parseFloat(e.target.value) || 0;
                                                const openingStock = parseFloat(formData.openingStock) || 0;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    puPrice: e.target.value,
                                                    openingStockBalance: (puPrice * openingStock).toFixed(2)
                                                }));
                                            }}
                                            step="any"
                                        />
                                    </div>
                                    <div className="col-md-3">
                                        <Form.Label>Opening Stock</Form.Label>
                                        <Form.Control
                                            type="number"
                                            name="openingStock"
                                            value={formData.openingStock}
                                            onChange={(e) => {
                                                const openingStock = parseFloat(e.target.value) || 0;
                                                const puPrice = parseFloat(formData.puPrice) || 0;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    openingStock: e.target.value,
                                                    openingStockBalance: (puPrice * openingStock).toFixed(2)
                                                }));
                                            }}
                                        />
                                    </div>
                                    <div className="col">
                                        <Form.Label>Opening Stock Value</Form.Label>
                                        <Form.Control
                                            type="number"
                                            name="openingStockBalance"
                                            value={formData.openingStockBalance}
                                            onChange={handleFormChange}
                                            step="any"
                                            readOnly
                                        />
                                    </div>
                                </Form.Group>

                                <Button variant="primary" type="submit">
                                    {currentItem ? 'Save Changes' : 'Add Item'}
                                </Button>
                                <small className="ms-2">To Save Press Alt+S</small>
                            </Form>
                        </div>
                    </div>
                </div>

                {/* Right Column - Existing Items */}
                <div className="col-lg-6">
                    <div className="card h-100 shadow-lg" style={{ height: '600px' }}>
                        <div className="card-body">
                            <h1 className="text-center" style={{ textDecoration: 'underline' }}>Existing Items</h1>

                            {/* Header with buttons */}
                            <div className="row mb-3">
                                <div className="col-2">
                                    <Button variant="primary" onClick={() => navigate(-1)}>
                                        <FiArrowLeft /> Back
                                    </Button>
                                </div>
                                <div className="col-1">
                                    <Button variant="primary" onClick={() => setShowPrintModal(true)}>
                                        <FiPrinter />
                                    </Button>
                                </div>
                                <div className="col">
                                    <Form.Control
                                        type="text"
                                        placeholder="Search items by name..."
                                        value={searchTerm}
                                        onChange={handleSearch}
                                    />
                                </div>
                            </div>

                            {/* Items Table */}
                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                {loading ? (
                                    <div className="text-center">
                                        <Spinner animation="border" role="status">
                                            <span className="visually-hidden">Loading...</span>
                                        </Spinner>
                                        <p>Loading items...</p>
                                    </div>
                                ) : error ? (
                                    <div className="alert alert-danger">{error}</div>
                                ) : filteredItems.length === 0 ? (
                                    <div className="text-center">No items found</div>
                                ) : (
                                    <Table striped bordered hover>
                                        <thead>
                                            <tr>
                                                <th>Description of Goods</th>
                                                <th>Company</th>
                                                <th>Category</th>
                                                <th>VAT</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredItems.map((item, index) => (
                                                <tr key={item._id} className="searchClass">
                                                    <td>
                                                        <strong>
                                                            {index + 1}. {item.name}{' '}
                                                            <Badge bg={item.status === 'active' ? 'success' : 'danger'}>
                                                                {item.status}
                                                            </Badge>
                                                        </strong>
                                                    </td>
                                                    <td><small><b>{item.itemsCompany?.name || 'N/A'}</b></small></td>
                                                    <td><small><b>{item.category?.name || 'N/A'}</b></small></td>
                                                    <td>
                                                        <Badge bg={item.vatStatus === 'vatable' ? 'success' : 'warning'}>
                                                            {item.vatStatus === 'vatable' ? '13%' : 'Exempt'}
                                                        </Badge>
                                                    </td>
                                                    <td>
                                                        <Button
                                                            variant="info"
                                                            size="sm"
                                                            className="me-1"
                                                            onClick={() => navigate(`/items/${item._id}`)}
                                                        >
                                                            <FiEye />
                                                        </Button>
                                                        {data.isAdminOrSupervisor && (
                                                            <>
                                                                <Button
                                                                    variant="warning"
                                                                    size="sm"
                                                                    className="me-1"
                                                                    onClick={() => handleEdit(item)}
                                                                >
                                                                    <FiEdit2 />
                                                                </Button>
                                                                <Button
                                                                    variant="danger"
                                                                    size="sm"
                                                                    className="me-1"
                                                                    onClick={() => handleDelete(item._id)}
                                                                >
                                                                    <FiTrash2 />
                                                                </Button>
                                                            </>
                                                        )}
                                                        <Button
                                                            variant="success"
                                                            size="sm"
                                                            onClick={() => handleSelectItem(item)}
                                                        >
                                                            <FiCheck />
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Item Modal */}
            <Modal show={showEditModal} onHide={() => setShowEditModal(false)} size="xl">
                <Modal.Header closeButton>
                    <Modal.Title>Edit Item</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form onSubmit={handleSubmit}>
                        <Form.Group className="row mb-3">
                            <div className="col">
                                <Form.Label>Name <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleFormChange}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="col">
                                <Form.Label>HSN</Form.Label>
                                <Form.Control
                                    type="number"
                                    name="hscode"
                                    value={formData.hscode}
                                    onChange={handleFormChange}
                                />
                            </div>
                            <div className="col">
                                <Form.Label>Company <span className="text-danger">*</span></Form.Label>
                                <Form.Select
                                    name="itemsCompany"
                                    value={formData.itemsCompany}
                                    onChange={handleFormChange}
                                    required
                                >
                                    <option value="" disabled>Select company</option>
                                    {data.itemsCompanies.map(company => (
                                        <option key={company._id} value={company._id}>
                                            {company.name}
                                        </option>
                                    ))}
                                </Form.Select>
                            </div>
                            <div className="col">
                                <Form.Label>Category <span className="text-danger">*</span></Form.Label>
                                <Form.Select
                                    name="category"
                                    value={formData.category}
                                    onChange={handleFormChange}
                                    required
                                >
                                    <option value="" disabled>Select category</option>
                                    {data.categories.map(category => (
                                        <option key={category._id} value={category._id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </Form.Select>
                            </div>
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Composition</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={2}
                                name="composition"
                                value={formData.composition}
                                onChange={handleFormChange}
                                placeholder="Press F6 to add compositions"
                                onKeyDown={(e) => {
                                    if (e.key === 'F6') {
                                        e.preventDefault();
                                        setShowCompositionModal(true);
                                    }
                                }}
                            />
                            <Form.Control type="hidden" name="compositionIds" value={formData.compositionIds} />
                        </Form.Group>

                        <Form.Group className="row mb-3">
                            <div className="col">
                                <Form.Label>Main Unit <span className="text-danger">*</span></Form.Label>
                                <Form.Select
                                    name="mainUnit"
                                    value={formData.mainUnit}
                                    onChange={handleFormChange}
                                    required
                                >
                                    <option value="" disabled>Select Main Unit</option>
                                    {data.mainUnits.map(unit => (
                                        <option key={unit._id} value={unit._id}>
                                            {unit.name}
                                        </option>
                                    ))}
                                </Form.Select>
                            </div>
                            <div className="col">
                                <Form.Label>WS Unit</Form.Label>
                                <Form.Control
                                    type="number"
                                    name="WSUnit"
                                    value={formData.WSUnit}
                                    onChange={handleFormChange}
                                />
                            </div>
                            <div className="col">
                                <Form.Label>Unit <span className="text-danger">*</span></Form.Label>
                                <Form.Select
                                    name="unit"
                                    value={formData.unit}
                                    onChange={handleFormChange}
                                    required
                                >
                                    <option value="" disabled>Select Unit</option>
                                    {data.units.map(unit => (
                                        <option key={unit._id} value={unit._id}>
                                            {unit.name}
                                        </option>
                                    ))}
                                </Form.Select>
                            </div>
                            <div className="col">
                                <Form.Label>VAT <span className="text-danger">*</span></Form.Label>
                                <Form.Select
                                    name="vatStatus"
                                    value={formData.vatStatus}
                                    onChange={handleFormChange}
                                    required
                                >
                                    <option value="" disabled>Select VAT</option>
                                    {data.vatEnabled && <option value="vatable">Vatable</option>}
                                    <option value="vatExempt">VAT Exempt</option>
                                </Form.Select>
                            </div>
                            <div className="col">
                                <Form.Label>Re-Order (Qty)</Form.Label>
                                <Form.Control
                                    type="number"
                                    name="reorderLevel"
                                    value={formData.reorderLevel}
                                    onChange={handleFormChange}
                                />
                            </div>
                        </Form.Group>

                        <Form.Group className="row mb-3">
                            <div className="col">
                                <Form.Label>Sales Price</Form.Label>
                                <Form.Control
                                    type="number"
                                    name="price"
                                    value={formData.price}
                                    onChange={handleFormChange}
                                    step="0.01"
                                />
                            </div>
                            <div className="col">
                                <Form.Label>Purchase Price</Form.Label>
                                <Form.Control
                                    type="number"
                                    name="puPrice"
                                    value={formData.puPrice}
                                    onChange={(e) => {
                                        const newPuPrice = e.target.value;
                                        const openingStock = formData.openingStock || 0;
                                        setFormData(prev => ({
                                            ...prev,
                                            puPrice: newPuPrice,
                                            openingStockBalance: (parseFloat(newPuPrice || 0) * parseFloat(openingStock || 0)).toFixed(2)
                                        }));
                                    }}
                                    step="any"
                                    min="0"
                                />
                            </div>
                            <div className="col">
                                <Form.Label>Opening Stock</Form.Label>
                                <Form.Control
                                    type="number"
                                    name="openingStock"
                                    value={formData.openingStock}
                                    onChange={(e) => {
                                        const newOpeningStock = e.target.value;
                                        const puPrice = formData.puPrice || 0;
                                        setFormData(prev => ({
                                            ...prev,
                                            openingStock: newOpeningStock,
                                            openingStockBalance: (parseFloat(puPrice || 0) * parseFloat(newOpeningStock || 0)).toFixed(2)
                                        }));
                                    }}
                                    min="0"
                                />
                            </div>
                            <div className="col">
                                <Form.Label>Opening Stock Value</Form.Label>
                                <Form.Control
                                    type="number"
                                    name="openingStockBalance"
                                    value={formData.openingStockBalance}
                                    readOnly
                                    className="bg-light"  // Optional: gives a visual indication that this field is read-only
                                />
                            </div>
                        </Form.Group>

                        <Button variant="primary" type="submit">Save Changes</Button>
                        <Button variant="danger" onClick={() => setShowEditModal(false)} className="ms-2">
                            Close
                        </Button>
                    </Form>
                </Modal.Body>
            </Modal>

            {/* Print Options Modal */}
            <Modal show={showPrintModal} onHide={() => setShowPrintModal(false)} centered>
                <Modal.Header closeButton className="bg-primary text-white">
                    <Modal.Title><FiPrinter className="me-2" />Print Options</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form>
                        <Form.Label className="fw-bold mb-3">Select Print Option:</Form.Label>

                        <Form.Check
                            type="radio"
                            id="printAll"
                            name="printOption"
                            label={
                                <div className="d-flex align-items-center">
                                    <span className="me-3"><FiPrinter /></span>
                                    <div>
                                        <strong>All Items</strong>
                                        <p className="mb-0 small text-muted">Print all items in your inventory</p>
                                    </div>
                                </div>
                            }
                            checked={printOption === 'all'}
                            onChange={() => setPrintOption('all')}
                            className="mb-3 p-3 border rounded"
                        />

                        <Form.Check
                            type="radio"
                            id="printActive"
                            name="printOption"
                            label={
                                <div className="d-flex align-items-center">
                                    <span className="me-3"><FiPrinter /></span>
                                    <div>
                                        <strong>Active Items Only</strong>
                                        <p className="mb-0 small text-muted">Print only active inventory items</p>
                                    </div>
                                </div>
                            }
                            checked={printOption === 'active'}
                            onChange={() => setPrintOption('active')}
                            className="mb-3 p-3 border rounded"
                        />

                        <Form.Check
                            type="radio"
                            id="printVatable"
                            name="printOption"
                            label={
                                <div className="d-flex align-items-center">
                                    <span className="me-3"><FiPrinter /></span>
                                    <div>
                                        <strong>Vatable Items Only</strong>
                                        <p className="mb-0 small text-muted">Print items subject to VAT</p>
                                    </div>
                                </div>
                            }
                            checked={printOption === 'vatable'}
                            onChange={() => setPrintOption('vatable')}
                            className="mb-3 p-3 border rounded"
                        />

                        <Form.Check
                            type="radio"
                            id="printExempt"
                            name="printOption"
                            label={
                                <div className="d-flex align-items-center">
                                    <span className="me-3"><FiPrinter /></span>
                                    <div>
                                        <strong>VAT Exempt Items Only</strong>
                                        <p className="mb-0 small text-muted">Print VAT-exempt items</p>
                                    </div>
                                </div>
                            }
                            checked={printOption === 'vatExempt'}
                            onChange={() => setPrintOption('vatExempt')}
                            className="mb-3 p-3 border rounded"
                        />

                        <Form.Check
                            type="radio"
                            id="printCategory"
                            name="printOption"
                            label={
                                <div className="d-flex align-items-center">
                                    <span className="me-3"><FiPrinter /></span>
                                    <div>
                                        <strong>Category Wise</strong>
                                        <p className="mb-0 small text-muted">Print items from a specific category</p>
                                    </div>
                                </div>
                            }
                            checked={printOption === 'category'}
                            onChange={() => setPrintOption('category')}
                            className="mb-3 p-3 border rounded"
                        />

                        {printOption === 'category' && (
                            <div className="card p-3 mt-3">
                                <Form.Label className="fw-bold mb-2">Select Category:</Form.Label>
                                <Form.Select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                >
                                    {data.categories.map(category => (
                                        <option key={category._id} value={category._id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </Form.Select>
                            </div>
                        )}

                        <Form.Check
                            type="radio"
                            id="printCompany"
                            name="printOption"
                            label={
                                <div className="d-flex align-items-center">
                                    <span className="me-3"><FiPrinter /></span>
                                    <div>
                                        <strong>Company Wise</strong>
                                        <p className="mb-0 small text-muted">Print items from a specific company</p>
                                    </div>
                                </div>
                            }
                            checked={printOption === 'itemsCompany'}
                            onChange={() => setPrintOption('itemsCompany')}
                            className="mb-3 p-3 border rounded"
                        />

                        {printOption === 'itemsCompany' && (
                            <div className="card p-3 mt-3">
                                <Form.Label className="fw-bold mb-2">Select Company:</Form.Label>
                                <Form.Select
                                    value={selectedCompany}
                                    onChange={(e) => setSelectedCompany(e.target.value)}
                                >
                                    {data.itemsCompanies.map(company => (
                                        <option key={company._id} value={company._id}>
                                            {company.name}
                                        </option>
                                    ))}
                                </Form.Select>
                            </div>
                        )}
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowPrintModal(false)}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={() => {
                        printItems();
                        setShowPrintModal(false);
                    }}>
                        Print
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Composition Selection Modal */}
            <Modal show={showCompositionModal} onHide={() => setShowCompositionModal(false)} size="xl" centered>
                <Modal.Header closeButton>
                    <Modal.Title>Select Compositions</Modal.Title>
                </Modal.Header>
                <Modal.Body className="p-0">
                    <div className="sticky-top p-3 bg-light">
                        <Form.Control
                            type="text"
                            placeholder="Search compositions..."
                            value={compositionSearch}
                            onChange={(e) => setCompositionSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                        {filteredCompositions.length === 0 ? (
                            <div className="text-center p-3 text-muted">No compositions found</div>
                        ) : (
                            <ul className="list-group list-group-flush">
                                {filteredCompositions.map(comp => (
                                    <li
                                        key={comp._id}
                                        className={`list-group-item ${selectedCompositions.some(c => c._id === comp._id) ? 'active' : ''}`}
                                        onClick={() => handleCompositionSelect(comp)}
                                    >
                                        <Form.Check
                                            type="checkbox"
                                            label={`${comp.uniqueNumber || 'N/A'} - ${comp.name}`}
                                            checked={selectedCompositions.some(c => c._id === comp._id)}
                                            onChange={() => handleCompositionSelect(comp)}
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <small className="text-muted me-auto">
                        Selected: <Badge bg="primary">{selectedCompositions.length}</Badge>
                    </small>
                    <Form.Check
                        type="checkbox"
                        label="Select All"
                        checked={selectedCompositions.length === filteredCompositions.length && filteredCompositions.length > 0}
                        onChange={handleSelectAllCompositions}
                        className="me-2"
                    />
                    <Button variant="secondary" onClick={() => setShowCompositionModal(false)}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleCompositionDone}>
                        Done
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Save Confirmation Modal */}
            <Modal show={showSaveConfirmModal} onHide={() => setShowSaveConfirmModal(false)} centered>
                <Modal.Header closeButton className="bg-warning text-dark">
                    <Modal.Title>Confirm Save</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>Are you sure you want to save this item?</p>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowSaveConfirmModal(false)}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={() => {
                        document.getElementById('addItemForm').dispatchEvent(new Event('submit'));
                        setShowSaveConfirmModal(false);
                    }}>
                        Save
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default Items;
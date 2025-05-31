
function openPurchasePriceModal(product) {
    selectedProduct = product; // Store product globally
    // Set the product name in the modal header
    document.getElementById('selectedProductName').textContent = product.name;

    const purchasePriceDisplay = document.getElementById('purchasePriceDisplay');
    if (purchasePriceDisplay) {
        let tableContent = `
            <table class="table table-bordered">
                <thead>
                    <tr>
                        <th>C.P</th>
                        <th>Stock</th>
                        <th>Unit</th>
                        <th>Batch</th>
                        <th>Expiry Date</th>
                        <th>Status</th>
                        <th>S.P</th>
                        <th>MRP</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>`;

        // Filter out entries with quantity <= 0
        const validStockEntries = product.stockEntries.filter(entry => entry.quantity > 0);
        const now = new Date();

        if (validStockEntries.length > 0) {
            tableContent += validStockEntries.map((entry, index) => {
                // Calculate expiry status for this batch
                const expiryDate = new Date(entry.expiryDate);
                const timeDiff = expiryDate.getTime() - now.getTime();
                const daysUntilExpiry = Math.ceil(timeDiff / (1000 * 3600 * 24));

                let status = 'safe';
                let statusText = 'OK';
                let statusClass = 'safe';

                if (daysUntilExpiry <= 0) {
                    status = 'expired';
                    statusText = 'EXPIRED';
                    statusClass = 'expired';
                } else if (daysUntilExpiry <= 30) {
                    status = 'danger';
                    statusText = `${daysUntilExpiry}d`;
                    statusClass = 'danger';
                } else if (daysUntilExpiry <= 90) {
                    status = 'warning';
                    statusText = `${daysUntilExpiry}d`;
                    statusClass = 'warning';
                }

                return `
                    <tr class="${status}">
                        <td>Rs.${entry.puPrice.toFixed(2)}</td>
                        <td>${entry.quantity}</td>
                        <td>${product.unit ? product.unit.name : 'No unit'}</td>
                        <td>${entry.batchNumber}</td>
                        <td>${formatDateForInput(entry.expiryDate)}</td>
                        <td>
                            <span class="expiry-badge-modal ${statusClass}">
                                ${statusText}
                            </span>
                        </td>
                        <td>Rs.${Math.round(entry.price * 100) / 100}</td>
                        <td>Rs.${Math.round(entry.mrp * 100) / 100}</td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="openBatchUpdateModal(${index}, '${entry.batchNumber}', '${entry.expiryDate}', '${entry.price}')">
                                Update
                            </button>
                        </td>
                    </tr>`;
            }).join('');
        } else {
            // If no stock entries exist or all have 0 quantity
            tableContent += `
                <tr>
                    <td>Rs.0.00</td>
                    <td>0</td>
                    <td>${product.unit ? product.unit.name : 'No unit'}</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>Rs.0.00</td>
                    <td>
                        <button class="btn btn-sm btn-secondary" disabled>Update</button>
                    </td>
                </tr>
            `;
        }

        tableContent += '</tbody></table>';
        purchasePriceDisplay.innerHTML = tableContent;

        const compositionList = document.getElementById('compositionList');
        if (product.composition && product.composition.length > 0) {
            compositionList.innerHTML = product.composition.map(comp =>
                `<li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${comp.uniqueNumber ? comp.uniqueNumber + ' - ' : ''}${comp.name}</span>
                </li>`
            ).join('');
        } else {
            compositionList.innerHTML = '<li class="list-group-item text-muted">No composition available</li>';
        }

        // Show the modal
        new bootstrap.Modal(document.getElementById('purchasePriceModal')).show();
    }
}

// First, add a helper function to format dates for input fields
function formatDateForInput(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function openBatchUpdateModal(index, batchNumber, expiryDate, price) {
    document.getElementById('batchIndex').value = index;
    document.getElementById('batchNumberInput').value = batchNumber;
    document.getElementById('expiryDateInput').value = formatDateForInput(expiryDate);
    document.getElementById('salesPriceInput').value = Math.round(price * 100) / 100;

    new bootstrap.Modal(document.getElementById('updateBatchModal')).show();
}

async function updateBatch() {
    const index = document.getElementById('batchIndex').value;
    const updatedBatchNumber = document.getElementById('batchNumberInput').value;
    const updatedExpiryDate = document.getElementById('expiryDateInput').value;
    const updatedSalesPrice = document.getElementById('salesPriceInput').value;

    if (selectedProduct && selectedProduct._id) {
        try {
            const response = await fetch(`/update-batch/${selectedProduct._id}/${index}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    batchNumber: updatedBatchNumber,
                    expiryDate: updatedExpiryDate,
                    price: updatedSalesPrice,
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Batch updated successfully!');
                selectedProduct.stockEntries[index].batchNumber = updatedBatchNumber;
                selectedProduct.stockEntries[index].expiryDate = updatedExpiryDate;
                selectedProduct.stockEntries[index].price = updatedSalesPrice;
                openPurchasePriceModal(selectedProduct); // Refresh modal
                // bootstrap.Modal.getInstance(document.getElementById('updateBatchModal')).hide();

                const updateModal = document.getElementById('updateBatchModal');
                const modalInstance = bootstrap.Modal.getInstance(updateModal);
                if (modalInstance) {
                    modalInstance.hide();
                }

                document.body.classList.remove('modal-open');
                document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());


            } else {
                alert(`Error: ${data.message}`);
            }
        } catch (error) {
            console.error('Error updating batch:', error);
        }
    } else {
        alert('Invalid product data!');
    }
}

$(document).ready(function () {
    $('#productsModal').on('shown.bs.modal', function () { $('#searchInput').focus(); });
});

$(document).ready(function () {
    $('#compositionModal').on('shown.bs.modal', function () { $('#searchCompositionInput').focus(); });
});

$(document).ready(function () {
    $('#contactsModal').on('shown.bs.modal', function () { $('#contactSearch').focus(); });
});

document.addEventListener('DOMContentLoaded', function () {
    let products = [];
    let currentFocus = 0;
    let allProducts = []; // Store all products for filtering

    document.getElementById('productsButton').addEventListener('click', function () {
        document.getElementById('searchInput').value = ''; // Clear the search field
        fetch('/products')
            .then(response => response.json())
            .then(data => {
                allProducts = data;
                products = data; // Display first 10 products
                displayProducts(products);
                new bootstrap.Modal(document.getElementById('productsModal')).show();
            })
            .catch(error => console.error('Error fetching product details:', error));
    });

    document.getElementById('searchInput').addEventListener('input', function () {
        const searchQuery = this.value.toLowerCase();
        const filteredProducts = allProducts.filter(product =>
            product.name.toLowerCase().includes(searchQuery) ||
            (product.category && product.category.name.toLowerCase().includes(searchQuery)) ||
            product.uniqueNumber.toString().toLowerCase().includes(searchQuery)
        );
        products = filteredProducts; // Display first 10 filtered products
        displayProducts(products);
    });

    function displayProducts(products) {
        const list = document.getElementById('productDetailsList');
        list.innerHTML = '';
        currentFocus = 0;

        products.forEach((product, index) => {
            const listItem = document.createElement('li');
            listItem.className = 'product-row list-group-item';
            listItem.dataset.index = index;
            listItem.dataset.vatStatus = product.vatStatus;

            // Calculate expiry status for the product
            const expiryStatus = calculateProductExpiryStatus(product);

            // Add expiry status class to the row
            if (expiryStatus.status === 'expired') {
                listItem.classList.add('expired');
            } else if (expiryStatus.status === 'danger') {
                listItem.classList.add('danger');
            } else if (expiryStatus.status === 'warning') {
                listItem.classList.add('warning');
            }

            if (product.vatStatus === 'vatable') {
                listItem.classList.add('vatable');
            } else if (product.vatStatus === 'vatExempt') {
                listItem.classList.add('vatExempt');
            }

            const totalStock = product.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);
            const latestStockEntry = product.stockEntries[product.stockEntries.length - 1];
            const price = latestStockEntry ? latestStockEntry.price : 0;
            const margin = latestStockEntry ? latestStockEntry.marginPercentage : 'Null';

            listItem.innerHTML = `
            <div class="product-cell">${product.uniqueNumber}</div>
            <div class="product-cell">${product.hscode}</div>
            <div class="product-cell product-name">${product.name}</div>
            <div class="product-cell">${product.itemsCompany ? product.itemsCompany.name : 'Null'}</div>
            <div class="product-cell">${product.category ? product.category.name : 'No Category'}</div>
            <div class="product-cell">Rs.${Math.round(price * 100) / 100}</div>
            <div class="product-cell">${totalStock}</div>
            <div class="product-cell">${product.unit.name}</div>
            <div class="product-cell">${margin}</div>
          `;

            listItem.addEventListener('click', () => openPurchasePriceModal(product));
            list.appendChild(listItem);
        });

        highlightItem(currentFocus);
    }

    // Helper function to calculate expiry status for a product
    function calculateProductExpiryStatus(product) {
        const now = new Date();
        let nearestExpiry = null;
        let expiredItems = 0;
        let warningItems = 0;
        let dangerItems = 0;

        product.stockEntries.forEach(entry => {
            const expiryDate = new Date(entry.expiryDate);
            if (expiryDate < now) {
                expiredItems += entry.quantity;
            } else {
                if (!nearestExpiry || expiryDate < nearestExpiry) {
                    nearestExpiry = expiryDate;
                }

                const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 3600 * 24));
                if (daysUntilExpiry <= 30) {
                    dangerItems += entry.quantity;
                } else if (daysUntilExpiry <= 90) {
                    warningItems += entry.quantity;
                }
            }
        });

        return {
            nearestExpiry,
            expiredItems,
            warningItems,
            dangerItems,
            status: expiredItems > 0 ? 'expired' :
                dangerItems > 0 ? 'danger' :
                    warningItems > 0 ? 'warning' : 'safe'
        };
    }

    function highlightItem(index) {
        const items = document.querySelectorAll('#productDetailsList .list-group-item');
        items.forEach(item => {
            const vatStatus = item.dataset.vatStatus;
            if (vatStatus === 'vatable') {
                item.style.backgroundColor = 'lightgreen';
            } else if (vatStatus === 'vatExempt') {
                item.style.backgroundColor = 'lightyellow';
            } else {
                item.style.backgroundColor = '';
            }

            // Re-apply expiry status classes
            if (item.classList.contains('expired')) {
                item.style.backgroundColor = '#ffdddd';
            } else if (item.classList.contains('danger')) {
                item.style.backgroundColor = '#ffcccc';
            } else if (item.classList.contains('warning')) {
                item.style.backgroundColor = '#fff3cd';
            }

            item.classList.remove('active');
            item.style.color = 'black';
        });

        if (items[index]) {
            items[index].classList.add('active');
            items[index].style.backgroundColor = '#518CE8';
            items[index].style.color = 'white';
            items[index].scrollIntoView({ block: 'center' });
        }
    }

    document.addEventListener('keydown', function (event) {
        const items = document.querySelectorAll('#productDetailsList .list-group-item');
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            currentFocus = (currentFocus + 1) % items.length;
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            currentFocus = (currentFocus - 1 + items.length) % items.length;
        } else if (event.key === 'Enter' && items[currentFocus]) {
            event.preventDefault();
            items[currentFocus].click();
        }
        highlightItem(currentFocus);
    });

    // Handle F9 key press
    document.addEventListener('keydown', function (event) {
        if (event.key === 'F9') {
            event.preventDefault();
            fetch('/products')
                .then(response => response.json())
                .then(data => {
                    allProducts = data;
                    products = data;
                    displayProducts(products);
                    $('#productsModal').modal('show');
                })
                .catch(error => console.error('Error fetching product details:', error));
        }

        if (event.key === 'F3') {
            event.preventDefault();
            window.location.href = '/statement';
        }
    });

    // Handle Escape key press
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            const purchasePriceModalElement = document.getElementById('purchasePriceModal');
            const productsModalElement = document.getElementById('productsModal');

            const purchasePriceModal = bootstrap.Modal.getInstance(purchasePriceModalElement);
            const productsModal = bootstrap.Modal.getInstance(productsModalElement);

            if (purchasePriceModal && purchasePriceModal._isShown) {
                purchasePriceModal.hide();
            } else if (productsModal && productsModal._isShown) {
                productsModal.hide();
            }
        }
    });
});

function selectValue(input) {
    input.select(); // Select the value of the input field when it is focused
}


//----for contacts--------------------------
document.addEventListener('DOMContentLoaded', function () {
    let contacts = [];
    let currentFocus = 0;
    let allContacts = []; // Store all contacts for filtering

    document.getElementById('contactsButton').addEventListener('click', function () {
        document.getElementById('contactSearch').value = ''; // Clear the search field
        fetch('/api/contacts')
            .then(response => response.json())
            .then(data => {
                allContacts = data;
                contacts = data;
                displayContacts(contacts);
                new bootstrap.Modal(document.getElementById('contactsModal')).show();
            })
            .catch(error => console.error('Error fetching contact details:', error));
    });

    document.getElementById('contactSearch').addEventListener('input', function () {
        const searchQuery = this.value.toLowerCase();
        const filteredContacts = allContacts.filter(contact =>
            (contact.name && contact.name.toLowerCase().includes(searchQuery)) ||
            (contact.address && contact.address.toLowerCase().includes(searchQuery)) ||
            (contact.phone && contact.phone.toLowerCase().includes(searchQuery)) ||
            (contact.email && contact.email.toLowerCase().includes(searchQuery)) ||
            (contact.contactperson && contact.contactperson.toLowerCase().includes(searchQuery))
        );
        contacts = filteredContacts;
        displayContacts(contacts);
    });

    function displayContacts(contacts) {
        const list = document.getElementById('contactsList');
        list.innerHTML = '';
        currentFocus = 0;

        if (contacts.length === 0) {
            list.innerHTML = '<li class="contact-row"><div class="contact-cell text-center py-4 text-muted">No matching contacts found</div></li>';
        } else {
            contacts.forEach((contact, index) => {
                const listItem = document.createElement('li');
                listItem.className = 'contact-row list-group-item';
                listItem.dataset.index = index;

                listItem.innerHTML = `
            <div class="contact-cell">${contact.name || 'N/A'}</div>
            <div class="contact-cell">${contact.address || 'N/A'}</div>
            <div class="contact-cell">${contact.phone || 'N/A'}</div>
            <div class="contact-cell">${contact.email || 'N/A'}</div>
            <div class="contact-cell">${contact.contactperson || 'N/A'}</div>
          `;

                listItem.addEventListener('click', () => selectContact(contact));
                list.appendChild(listItem);
            });
        }

        // Update result count
        document.getElementById('resultCount').textContent = `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} found`;
        highlightItem(currentFocus);
    }

    function selectContact(contact) {
        // Handle contact selection here
        console.log('Selected contact:', contact);
        // You might want to fill some form fields with this contact's data
        bootstrap.Modal.getInstance(document.getElementById('contactsModal')).hide();
    }

    function highlightItem(index) {
        const items = document.querySelectorAll('#contactsList .list-group-item');
        items.forEach(item => {
            item.classList.remove('active');
            item.style.color = 'black';
            item.style.backgroundColor = '';
        });

        if (items[index]) {
            items[index].classList.add('active');
            items[index].style.backgroundColor = '#518CE8';
            items[index].style.color = 'white';
            items[index].scrollIntoView({ block: 'center' });
        }
    }

    document.addEventListener('keydown', function (event) {
        const items = document.querySelectorAll('#contactsList .list-group-item');
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            currentFocus = (currentFocus + 1) % items.length;
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            currentFocus = (currentFocus - 1 + items.length) % items.length;
        } else if (event.key === 'Enter' && items[currentFocus]) {
            event.preventDefault();
            items[currentFocus].click();
        }
        highlightItem(currentFocus);
    });

    // Handle F4 key press
    document.addEventListener('keydown', function (event) {
        if (event.key === 'F4') {
            event.preventDefault();
            fetch('/api/contacts')
                .then(response => response.json())
                .then(data => {
                    allContacts = data;
                    contacts = data;
                    displayContacts(contacts);
                    $('#contactsModal').modal('show');
                })
                .catch(error => console.error('Error fetching contact details:', error));
        }
    });

    // Handle Escape key press
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            const contactsModalElement = document.getElementById('contactsModal');
            const contactsModal = bootstrap.Modal.getInstance(contactsModalElement);

            if (contactsModal && contactsModal._isShown) {
                contactsModal.hide();
            }
        }
    });
});

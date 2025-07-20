
let itemIndex = 0;
let currentFocus = 0;
let isFirstLoad = true;
let currentSelectedRowIndex = -1;
// Track the current scroll position and visible range
let currentScrollPosition = 0;
let visibleStartIndex = 0;
const VISIBLE_ROWS = 7;
let lastClickTime = 0;
const DOUBLE_CLICK_THRESHOLD = 300; // milliseconds

let allItems = []; // This will store all items for client-side filtering
let isItemsLoaded = false; // Track if all items have been loaded
let debounceTimer; // For search debouncing


// Add this at the top of your purchaseEntry.js
if (typeof serverStores === 'undefined') {
    const serverStores = [];
}

if (typeof serverRacksByStore === 'undefined') {
    const serverRacksByStore = {};
}

async function fetchItems(query, vatStatus, existingItemIds) {
    try {
        const response = await fetch(`/items/search?q=${encodeURIComponent(query)}&isVatExempt=${vatStatus}`);
        const data = await response.json();

        console.log('Fetched items:', data); // Fixed the console.log

        if (!Array.isArray(data)) {
            throw new Error('Invalid response format');
        }

        // Store the items if this is the initial load
        if (query === '') {
            allItems = data;
            isItemsLoaded = true;
        }

        return data;
    } catch (error) {
        console.error('Error fetching items:', error);
        return [];
    }
}

// Load all items when page loads
async function loadAllItems() {
    try {
        const vatStatus = document.getElementById('isVatExempt').value;
        const response = await fetch(`/items/search?q=&isVatExempt=${vatStatus}`);
        const data = await response.json();

        if (Array.isArray(data)) {
            allItems = data;
            isItemsLoaded = true;
            console.log('All items loaded:', allItems.length);
        }
    } catch (error) {
        console.error('Error loading all items:', error);
    }
}

// Call this when page loads
document.addEventListener('DOMContentLoaded', function () {
    loadAllItems();
    // Your other initialization code...
});

// Client-side filtering function
function filterItemsLocally(query) {
    if (!allItems.length) return [];

    const lowerQuery = query.toLowerCase();

    return allItems.filter(item => {
        // Safe checks for all searchable fields
        const nameMatch = item.name?.toLowerCase().includes(lowerQuery) || false;
        const hscodeMatch = item.hscode?.toString().toLowerCase().includes(lowerQuery) || false;
        const uniqueNumberMatch = item.uniqueNumber?.toString().toLowerCase().includes(lowerQuery) || false;
        const categoryMatch = item.category?.name?.toLowerCase().includes(lowerQuery) || false;

        return nameMatch || hscodeMatch || uniqueNumberMatch || categoryMatch;
    });
}


function displaySearchResults(items, dropdownMenu) {
    dropdownMenu.innerHTML = '';

    if (items.length === 0) {
        const noItemsMessage = document.createElement('div');
        noItemsMessage.classList.add('dropdown-item', 'no-results');
        noItemsMessage.textContent = 'No matching items found';
        dropdownMenu.appendChild(noItemsMessage);
        dropdownMenu.classList.add('show');
        return;
    }

    // Add header row
    const headerRow = document.createElement('div');
    headerRow.classList.add('dropdown-header');
    headerRow.innerHTML = `
        <div><strong>#</strong></div>
        <div><strong>HSN</strong></div>
        <div><strong>Description</strong></div>
        <div><strong>Category</strong></div>
        <div><strong>Qty</strong></div>
        <div><strong>Unit</strong></div>
        <div><strong>Rate</strong></div>
    `;
    dropdownMenu.appendChild(headerRow);

    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();

    // Show ALL items at once (no slicing)
    items.forEach(item => {
        const dropdownItem = createDropdownItem(item);
        fragment.appendChild(dropdownItem);
    });

    dropdownMenu.appendChild(fragment);
    dropdownMenu.classList.add('show');
    currentFocus = 0;
    addActive(dropdownMenu.getElementsByClassName('dropdown-item'));
}

document.getElementById('itemSearch').addEventListener('keydown', function (event) {
    const inputField = this;
    const dropdownMenu = document.getElementById('dropdownMenu');
    const items = dropdownMenu.getElementsByClassName('dropdown-item');

    if (event.key === 'ArrowDown') {
        // Navigate down the list
        currentFocus++;
        addActive(items);
        scrollToItem(items);
        updateInputWithHighlightedItem(items);
    } else if (event.key === 'ArrowUp') {
        // Navigate up the list
        currentFocus--;
        addActive(items);
        scrollToItem(items);
        updateInputWithHighlightedItem(items);
    } else if (event.key === 'Enter') {
        // Select the item
        event.preventDefault();

        if (currentFocus > -1) {
            if (items[currentFocus]) {
                items[currentFocus].click();


                // Clear the input field after selection
                inputField.value = '';
            }
        }
    }
});
function addActive(items) {
    if (!items) return false;
    removeActive(items);
    if (currentFocus >= items.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = items.length - 1;
    items[currentFocus].classList.add('active');
}

function removeActive(items) {
    for (let i = 0; i < items.length; i++) {
        items[i].classList.remove('active');
    }
}
function scrollToItem(items) {
    if (currentFocus >= 0 && currentFocus < items.length) {
        const item = items[currentFocus];
        const dropdownMenu = document.getElementById('dropdownMenu');

        // Calculate position
        const itemTop = item.offsetTop;
        const itemHeight = item.offsetHeight;
        const menuHeight = dropdownMenu.offsetHeight;
        const scrollTop = dropdownMenu.scrollTop;

        // Scroll if item is not fully visible
        if (itemTop < scrollTop) {
            // Item is above the visible area
            dropdownMenu.scrollTop = itemTop;
        } else if (itemTop + itemHeight > scrollTop + menuHeight) {
            // Item is below the visible area
            dropdownMenu.scrollTop = itemTop + itemHeight - menuHeight;
        }
    }
}

function updateInputWithHighlightedItem(items) {
    const inputField = document.getElementById('itemSearch');
    if (currentFocus > -1 && items[currentFocus]) {
        const itemName = items[currentFocus].querySelector('div:nth-child(3)').textContent;
        inputField.value = itemName; // Update the input field with the highlighted item's name
    }
}

async function showAllItems(input) {
    const dropdownMenu = input.nextElementSibling;

    if (!isItemsLoaded) {
        // Show loading message
        dropdownMenu.innerHTML = '<div class="dropdown-item">Loading items...</div>';
        dropdownMenu.classList.add('show');

        // Wait for items to load
        await loadAllItems();
    }

    input.value = ''; // Clear search term
    displaySearchResults(allItems, dropdownMenu);
}
function createDropdownItem(item) {
    const dropdownItem = document.createElement('div');
    dropdownItem.classList.add('dropdown-item');
    dropdownItem.tabIndex = 0;

    // Add appropriate classes based on VAT status
    dropdownItem.classList.add(item.vatStatus === 'vatable' ? 'vatable-item' : 'non-vatable-item');

    // Calculate once
    const totalStock = item.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);
    const latestStockEntry = item.stockEntries[item.stockEntries.length - 1];
    const puPrice = latestStockEntry ? Math.round(latestStockEntry.puPrice * 100) / 100 : 0;

    // Use template literals for better readability
    dropdownItem.innerHTML = `
        <div>${item.uniqueNumber || 'N/A'}</div>
        <div>${item.hscode || 'N/A'}</div>
        <div class="dropdown-items-name">${item.name}</div>
        <div>${item.category?.name || 'No Category'}</div>
        <div>${totalStock}</div>
        <div>${item.unit?.name || ''}</div>
        <div>Rs.${puPrice}</div>
    `;

    dropdownItem.addEventListener('click', () => {
        addItemToBill(item, dropdownMenu);
        document.getElementById('itemSearch').value = item.name;
        dropdownMenu.classList.remove('show');
    });

    return dropdownItem;
}

// Focus event - always show all items
document.getElementById('itemSearch').addEventListener('focus', function () {
    if (!isItemsLoaded) return;

    this.value = ''; // Clear search term
    displaySearchResults(allItems, this.nextElementSibling);
});

// Input event - client-side filtering with debounce
document.getElementById('itemSearch').addEventListener('input', function () {
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
        const query = this.value.trim();
        const dropdownMenu = this.nextElementSibling;

        if (!isItemsLoaded) {
            // Fallback to server search if items not loaded yet
            fetchItems(query, document.getElementById('isVatExempt').value, [])
                .then(items => displaySearchResults(items, dropdownMenu));
            return;
        }

        if (query.length === 0) {
            displaySearchResults(allItems, dropdownMenu);
        } else {
            const filteredItems = filterItemsLocally(query);
            displaySearchResults(filteredItems, dropdownMenu);
        }
    }, 300); // 300ms debounce delay
});

// Close dropdown when user clicks outside
document.addEventListener('click', function (event) {
    const itemSearch = document.getElementById('itemSearch');
    const dropdownMenu = itemSearch.nextElementSibling;

    if (!itemSearch.contains(event.target) && !dropdownMenu.contains(event.target)) {
        dropdownMenu.classList.remove('show'); // Close the dropdown if clicked outside
    }
});


function addItemToBill(item, dropdownMenu) {
    const tbody = document.getElementById('items');
    const inputField = document.getElementById('itemSearch');

    if (!inputField.value.trim()) {
        return; // Do not add an item if the search field is blank
    }
    // Sort stock entries by date (FIFO: First In First Out)
    const sortedStockEntries = item.stockEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Get the last stock entry (LIFO: Last In First Out)
    const lastStockEntry = sortedStockEntries[sortedStockEntries.length - 1] || {}; // Defaults to an empty object if no stock entry exists

    const tr = document.createElement('tr');
    tr.classList.add('item', item.vatStatus ? 'vatable-item' : 'non-vatable-item');

    // Calculate the serial number based on the number of rows already in the table
    const serialNumber = tbody.rows.length + 1;

    // Use price from the first stock entry
    const batchpuPrice = lastStockEntry.mainUnitPuPrice || 0;

    // Use the current itemIndex value in the name attributes

    let storeDropdown = '';
    let rackDropdown = '';
    if (storeManagementEnabled) {
        storeDropdown = `
        <td>
            <select name="items[${itemIndex}][store]" class="form-control item-store" id="store-${itemIndex}" onchange="updateRacks(${itemIndex})" onkeydown="handleStoreKeydown(event, ${itemIndex})" required>
                ${serverStores.map(s => `
                    <option value="${s._id}">${s.name}</option>
                `).join('')}
            </select>
        </td>
        `;

        rackDropdown = `
        <td>
            <select name="items[${itemIndex}][rack]" class="form-control item-rack" id="rack-${itemIndex}" onkeydown="handleRackKeydown(event, ${itemIndex})" required>
                <!-- Options will be populated dynamically -->
            </select>
        </td>
        `;
    }

    tr.innerHTML = `
<td>${serialNumber}</td>
<td>${item.uniqueNumber}</td>
<td>
    <input type="hidden" name="items[${itemIndex}][hscode]" value="${item.hscode}">
    ${item.hscode}
</td>
<td class="col-2">
    <input type="hidden" name="items[${itemIndex}][item]" value="${item._id}">
    ${item.name}
</td>
<td>
    <input type="number" name="items[${itemIndex}][WSUnit]" class="form-control item-WSUnit" id="WSUnit-${itemIndex}" value="${item.WSUnit || 1}" onfocus="selectValue(this)" onkeydown="handleWSUnitKeydown(event,${itemIndex})" required>
</td>
<td>
    <input type="text" name="items[${itemIndex}][batchNumber]" class="form-control item-batchNumber" id="batchNumber-${itemIndex}" step="any" onkeydown="handleBatchKeydown(event, ${itemIndex})" onfocus="selectValue(this)" value="XXX" autocomplete="off" required>
</td>
<td>
    <input type="date" name="items[${itemIndex}][expiryDate]" class="form-control item-expiryDate" id="expiryDate-${itemIndex}" onkeydown="handleExpDateKeydown(event, ${itemIndex})" onfocus="selectValue(this)" value="${getDefaultExpiryDate()}" required>
</td>
${storeDropdown}
${rackDropdown}
<td>
    <input type="number" name="items[${itemIndex}][quantity]" value="0" class="form-control item-quantity" id="quantity-${itemIndex}" min="1" step="any" oninput="updateItemTotal(this)" onkeydown="handleQuantityKeydown(event,${itemIndex})" onfocus="selectValue(this)" required>
</td>
<td>
    <input type="number" name="items[${itemIndex}][bonus]" value="0" class="form-control item-bonus" id="bonus-${itemIndex}" step="any" onkeydown="handleBonusKeydown(event,${itemIndex})" onfocus="selectValue(this)">
</td>
<td>
    ${item.unit ? item.unit.name : ''}
    <input type="hidden" name="items[${itemIndex}][unit]" value="${item.unit ? item.unit._id : ''}">
</td>
<td>
    <input type="number" name="items[${itemIndex}][puPrice]" value="${Math.round(batchpuPrice * 100) / 100}" class="form-control item-puPrice" id="puPrice-${itemIndex}" step="any" onkeydown="handlePriceKeydown(event, ${itemIndex})" oninput="updateItemTotal(this)" onfocus="selectValue(this)">
</td>
<td class="item-amount">0.00</td>
  <td class="align-middle">
    <button type="button" class="btn btn-sm btn-danger" 
            data-bs-toggle="tooltip" title="Remove item"
            onclick="removeItem(this)">
        <i class="bi bi-trash"></i>
    </button>
</td>
<input type="hidden" name="items[${itemIndex}][vatStatus]" value="${item.vatStatus}">
`;

    tbody.appendChild(tr);
    // Increment itemIndex after adding the new item
    itemIndex++;

    if (storeManagementEnabled) {
        const storeSelect = document.getElementById(`store-${itemIndex}`);
        if (storeSelect && storeSelect.options.length > 0) {
            updateRacks(itemIndex);
        }
    }

    calculateTotal();

    // Fetch and display last transactions for the added item
    fetchLastTransactions(item._id);

    // fetchSalesTransactions(item._id);
    setLastSelectedItemId(item._id);

    fetchLastItemsData(item._id);


    // Hide the dropdown menu after selecting an item
    dropdownMenu.classList.remove('show');

    // Clear the input field
    inputField.value = '';

    const currentIndex = itemIndex - 1;
    const batchNumberInput = document.getElementById(`batchNumber-${currentIndex}`);
    const expiryDateInput = document.getElementById(`expiryDate-${currentIndex}`);
    const quantityInput = document.getElementById(`quantity-${currentIndex}`);

    // Focus on batch number first
    batchNumberInput.focus();

    // Validation for batch number
    batchNumberInput.addEventListener('blur', function () {
        validateBatchNumber(this);
    });

    batchNumberInput.addEventListener('keydown', function (e) {
        if (e.key === 'Tab' || e.key === 'Enter') {
            if (!validateBatchNumber(this)) {
                e.preventDefault();
            }
        }
    });

    // Validation for expiry date
    expiryDateInput.addEventListener('blur', function () {
        validateExpiryDate(this);
    });

    expiryDateInput.addEventListener('keydown', function (e) {
        if (e.key === 'Tab' || e.key === 'Enter') {
            if (!validateExpiryDate(this)) {
                e.preventDefault();
            }
        }
    });

    // Validation functions
    function validateBatchNumber(input) {
        if (!input.value.trim()) {
            input.classList.add('is-invalid');
            showValidationTooltip(input, 'batch number is required');
            input.focus();
            return false;
        }
        input.classList.remove('is-invalid');
        hideValidationTooltip(input);
        return true;
    }

    function validateExpiryDate(input) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selectedDate = new Date(input.value);

        if (!input.value) {
            input.classList.add('is-invalid');
            showValidationTooltip(input, 'Please select an expiry date');
            input.focus();
            return false;
        } else if (selectedDate < today) {
            input.classList.add('is-invalid');
            showValidationTooltip(input, 'Expiry date cannot be in the past');
            input.focus();
            return false;
        }
        input.classList.remove('is-invalid');
        hideValidationTooltip(input);
        return true;
    }

    function showValidationTooltip(input, message) {
        // Remove any existing tooltip
        hideValidationTooltip(input);

        // Create and show tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'validation-tooltip';
        tooltip.textContent = message;

        const rect = input.getBoundingClientRect();
        tooltip.style.position = 'absolute';
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.top = `${rect.bottom}px`;
        tooltip.style.zIndex = '1000';
        tooltip.style.backgroundColor = '#ff4444';
        tooltip.style.color = 'white';
        tooltip.style.padding = '5px 10px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '14px';

        document.body.appendChild(tooltip);
        input.dataset.tooltipId = 'tooltip-' + Date.now();
        tooltip.id = input.dataset.tooltipId;
    }

    function hideValidationTooltip(input) {
        if (input.dataset.tooltipId) {
            const tooltip = document.getElementById(input.dataset.tooltipId);
            if (tooltip) {
                tooltip.remove();
            }
            delete input.dataset.tooltipId;
        }
    }
    // Add dynamic rack population
    const storeSelect = tr.querySelector(`#store-${currentIndex}`);
    const rackSelect = tr.querySelector(`#rack-${currentIndex}`);

    function updateRackOptions() {
        const selectedStore = storeSelect.value;
        const racks = serverRacksByStore[selectedStore] || [];
        rackSelect.innerHTML = '' +
            racks.map(r => `
            <option value="${r._id}">${r.name}</option>
        `).join('');
    }

    storeSelect.addEventListener('change', updateRackOptions);
    updateRackOptions(); // Initial population

}

// Function to update racks based on selected store
function updateRacks(itemIndex) {
    const storeSelect = document.getElementById(`store-${itemIndex}`);
    const rackSelect = document.getElementById(`rack-${itemIndex}`);

    if (!storeSelect || !rackSelect) return;

    const storeId = storeSelect.value;
    rackSelect.innerHTML = ''; // Clear existing options

    if (serverRacksByStore[storeId]) {
        serverRacksByStore[storeId].forEach(rack => {
            const option = document.createElement('option');
            option.value = rack._id;
            option.textContent = rack.name;
            rackSelect.appendChild(option);
        });
    }
}


// Function to fetch last transactions for the selected item
async function fetchLastItemsData(itemId) {
    try {
        const response = await fetch(`/api/last-item-values/${itemId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch last item values');
        }
        const lastValues = await response.json();

        // Populate the modal fields with the last values
        document.getElementById('CCPercentage').value = lastValues.itemCCAmount || 0
        document.getElementById('mrp').value = lastValues.mrp || 0;
        document.getElementById('marginPercentage').value = lastValues.marginPercentage || 0;
        document.getElementById('salesPrice').value = lastValues.price || 0;
        document.getElementById('prePuPrice').value = lastValues.puPrice || 0;
        document.getElementById('currency').value = lastValues.currency || "NPR";

    } catch (error) {
        console.error('Error fetching last item values:', error);
    }
}



function getDefaultExpiryDate() {
    const today = new Date();
    today.setFullYear(today.getFullYear() + 2); // Add 2 years to the current year
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


function removeItem(button) {
    const row = button.closest('tr');
    row.remove();
    calculateTotal();
    // Renumber the rows
    renumberRows();
}


// Add this function to renumber rows after removal
function renumberRows() {
    const itemRows = document.querySelectorAll('#items tr.item');
    itemRows.forEach((row, index) => {
        // Update the row number in the first cell
        const rowNumberCell = row.querySelector('td:first-child');
        if (rowNumberCell) {
            rowNumberCell.textContent = index + 1;
        }

        // Update any input names/ids that use the row index
        const inputs = row.querySelectorAll('input, select');
        inputs.forEach(input => {
            const name = input.name;
            const id = input.id;

            if (name && name.includes('[') && name.includes(']')) {
                input.name = name.replace(/\[\d+\]/, `[${index}]`);
            }

            if (id && id.includes('_')) {
                const parts = id.split('_');
                if (!isNaN(parts[parts.length - 1])) {
                    parts[parts.length - 1] = index;
                    input.id = parts.join('_');
                }
            }
        });
    });
}


function updateItemTotal(input) {
    const row = input.closest('tr');
    const quantity = parseFloat(row.querySelector('input.item-quantity').value) || 0;
    const puPrice = parseFloat(row.querySelector('input.item-puPrice').value) || 0;
    const amount = quantity * puPrice;

    // Update the item's total amount
    row.querySelector('.item-amount').textContent = amount.toFixed(2);

    // Recalculate total, discounts, and update live
    calculateTotal();
    updateDiscountFromPercentage(); // Ensure discount is updated live
}

function updateDiscountFromPercentage() {
    const subTotal = calculateSubTotal();
    const discountPercentage = parseFloat(document.getElementById('discountPercentage').value) || 0;

    // Calculate the discount amount based on the percentage
    const discountAmount = (subTotal * discountPercentage) / 100;

    // Update the discount amount field
    document.getElementById('discountAmount').value = discountAmount.toFixed(2);

    // Recalculate the total with the updated discount
    calculateTotal();
}

function updateDiscountFromAmount() {
    const subTotal = calculateSubTotal();
    const discountAmount = parseFloat(document.getElementById('discountAmount').value) || 0;

    // Calculate the discount percentage based on the amount
    const discountPercentage = (discountAmount / subTotal) * 100;

    // Update the discount percentage field
    document.getElementById('discountPercentage').value = discountPercentage.toFixed(2);

    // Recalculate the total with the updated discount
    calculateTotal();
}

function calculateSubTotal() {
    const rows = document.querySelectorAll('#items tr.item');
    let subTotal = 0;

    rows.forEach(row => {
        const amount = parseFloat(row.querySelector('.item-amount').textContent) || 0;
        const vatStatus = row.querySelector('input[name$="[vatStatus]"]').value === 'true';

        subTotal += amount;
        if (vatStatus) {
            taxableAmount += amount;
            vatAmount += amount * 0.13; // VAT is 13%
        }
    });

    return subTotal;
}

function calculateTotal() {
    const rows = document.querySelectorAll('#items tr.item');
    let subTotal = calculateSubTotal();
    let vatAmount = 0;
    let totalTaxableAmount = 0;
    let totalNonTaxableAmount = 0;
    let totalCCAmount = 0; // Initialize total CC Amount
    let taxableCCAmount = 0; // Track CC amount from vatable items
    let nonTaxableCCAmount = 0; // Track CC amount from non-vatable items

    // Separate amounts for vatable and non-vatable items
    rows.forEach(row => {
        const amount = parseFloat(row.querySelector('.item-amount').textContent) || 0;
        const vatStatus = row.querySelector('input[name$="[vatStatus]"]').value;
        // Get CC amount for this item (stored when saving from modal)
        const ccAmountInput = row.querySelector('input[name$="[itemCCAmount]"]');
        const itemCCAmount = ccAmountInput ? parseFloat(ccAmountInput.value) || 0 : 0;

        totalCCAmount += itemCCAmount;

        if (vatStatus === 'vatable') {
            totalTaxableAmount += amount;
            taxableCCAmount += itemCCAmount; // Add to taxable CC amount
        } else {
            totalNonTaxableAmount += amount;
            nonTaxableCCAmount += itemCCAmount; // Add to non-taxable CC amount
        }
    });

    const discountPercentage = parseFloat(document.getElementById('discountPercentage').value) || 0;
    const discountAmount = parseFloat(document.getElementById('discountAmount').value) || 0;

    // Calculate total amount before discount
    const totalAmountBeforeDiscount = totalTaxableAmount + totalNonTaxableAmount;

    // Apply discount proportionally to vatable and non-vatable items
    const discountForTaxable = (totalTaxableAmount * discountPercentage / 100);
    const discountForNonTaxable = (totalNonTaxableAmount * discountPercentage / 100)

    const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
    const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

    // Calculate VAT only for vatable items
    const vatSelection = document.getElementById('isVatExempt').value;
    if (vatSelection === 'false' || vatSelection === 'all') {
        vatAmount = (finalTaxableAmount + taxableCCAmount) * 0.13; // VAT is 13%
    } else {
        vatAmount = 0;
    }
    const roundOffAmount = parseFloat(document.getElementById('roundOffAmount').value) || 0;
    // Calculate display values
    const displayTaxableAmount = finalTaxableAmount + taxableCCAmount; // Include CC in display

    const totalAmount = (finalTaxableAmount + taxableCCAmount) +
        (finalNonTaxableAmount + nonTaxableCCAmount) +
        vatAmount + roundOffAmount;

    document.getElementById('subTotal').textContent = subTotal.toFixed(2);
    document.getElementById('taxableAmount').textContent = displayTaxableAmount.toFixed(2);
    // Update the total CC amount display (in bill details)
    document.getElementById('CCAmount').value = totalCCAmount.toFixed(2);
    document.getElementById('vatAmount').textContent = vatAmount.toFixed(2);
    document.getElementById('totalAmount').textContent = totalAmount.toFixed(2);

    // Convert total amount to words including paisa
    const amountInWords = convertToRupeesAndPaisa(totalAmount) + ' Only.';
    document.getElementById('amountInWords').textContent = amountInWords;
}

// Attach event listeners for live updates
document.addEventListener('DOMContentLoaded', () => {
    // Update discount fields dynamically
    document.getElementById('discountPercentage').addEventListener('input', updateDiscountFromPercentage);
    document.getElementById('discountAmount').addEventListener('input', updateDiscountFromAmount);

    // Ensure item inputs update totals live
    document.querySelectorAll('input.item-quantity, input.item-puPrice, input.item-bonus').forEach(input => {
        input.addEventListener('input', () => updateItemTotal(input));
    });
});

// function toggleVatInputs() {
//     const isVatExempt = document.getElementById('isVatExempt').value === 'true';

//     // VAT-related fields
//     const taxableAmountRow = document.getElementById('taxableAmountRow');
//     const vatPercentageRow = document.getElementById('vatPercentageRow');

//     // Toggle display based on VAT exemption
//     if (isVatExempt) {
//         taxableAmountRow.style.display = 'none';

//     } else {
//         taxableAmountRow.style.display = 'table-row'; // Show taxable amount row
//     }
//     // Recalculate total when toggling VAT
//     calculateTotal();

// }

function toggleVatInputs() {
    const isVatExempt = document.getElementById('isVatExempt').value === 'true';

    // Elements for Taxable Amount
    const taxableAmountLabel = document.querySelector('label[for="taxableAmount"]');
    const taxableAmount = document.getElementById('taxableAmount');

    // Elements for VAT
    const vatLabel = document.querySelector('label[for="vatAmount"]');
    const vatAmount = document.getElementById('vatAmount');
    const vatPercentageInput = document.getElementById('vatPercentage');

    // Elements for CC (Always keep visible)
    const ccLabel = document.querySelector('label[for="CCAmount"]');
    const ccInput = document.getElementById('CCAmount');

    if (isVatExempt) {
        // Hide taxable amount and label
        taxableAmount.closest('td').style.display = 'none';
        taxableAmountLabel.closest('td').style.display = 'none';

        // Hide VAT amount and label
        vatAmount.closest('td').style.display = 'none';
        vatLabel.closest('td').style.display = 'none';

        // Hide VAT % input
        vatPercentageInput.closest('td').style.display = 'none';
    } else {
        // Show taxable amount and label
        taxableAmount.closest('td').style.display = '';
        taxableAmountLabel.closest('td').style.display = '';

        // Show VAT amount and label
        vatAmount.closest('td').style.display = '';
        vatLabel.closest('td').style.display = '';

        // Show VAT % input
        vatPercentageInput.closest('td').style.display = '';
    }

    // Always show CC label and input
    ccLabel.closest('td').style.display = '';
    ccInput.closest('td').style.display = '';

    // Recalculate total
    calculateTotal();
}


function moveToNextVisibleInput(currentElement) {
    const formElements = Array.from(document.querySelectorAll('input, select, textarea, button'));

    // Find the current element's index in the form
    const currentIndex = formElements.indexOf(currentElement);

    // Iterate through the remaining elements to find the next visible one
    for (let i = currentIndex + 1; i < formElements.length; i++) {
        if (formElements[i].offsetParent !== null) { // Check if the element is visible
            formElements[i].focus();
            break;
        }
    }
}


function showPrintModal() {
    $('#printModal').modal('show');
}
function submitBillForm(print) {
    shouldPrint = print;
    const billForm = document.getElementById('billForm');
    const saveButton = document.getElementById('saveBill');

    // Change button text and disable it
    saveButton.innerText = 'Saving...';
    saveButton.disabled = true;

    if (print) {
        const url = new URL(billForm.action);
        url.searchParams.append('print', 'true');
        billForm.action = url.toString();
    }

    // Simulate form submission (replace this with actual form submission logic)
    billForm.submit();

    // Reset button text and enable it after submission
    saveButton.disabled = false;
}

document.getElementById('billForm').addEventListener('submit', function (event) {
    if (!shouldPrint && event.submitter && event.submitter.innerText === 'Save & Print Bill') {
        event.preventDefault();
        showPrintModal();
    }
});

function numberToWords(num) {
    const ones = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'
    ];

    const tens = [
        '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
    ];

    const scales = ['', 'Thousand', 'Million', 'Billion'];

    function convertHundreds(num) {
        let words = '';

        if (num > 99) {
            words += ones[Math.floor(num / 100)] + ' Hundred ';
            num %= 100;
        }

        if (num > 19) {
            words += tens[Math.floor(num / 10)] + ' ';
            num %= 10;
        }

        if (num > 0) {
            words += ones[num] + ' ';
        }

        return words.trim();
    }

    if (num === 0) return 'Zero';

    if (num < 0) return 'Negative ' + numberToWords(Math.abs(num));

    let words = '';

    for (let i = 0; i < scales.length; i++) {
        let unit = Math.pow(1000, scales.length - i - 1);
        let currentNum = Math.floor(num / unit);

        if (currentNum > 0) {
            words += convertHundreds(currentNum) + ' ' + scales[scales.length - i - 1] + ' ';
        }

        num %= unit;
    }

    return words.trim();
}

function convertToRupeesAndPaisa(amount) {
    const rupees = Math.floor(amount); // Integer part (Rupees)
    const paisa = Math.round((amount - rupees) * 100); // Fractional part (Paisa)

    let words = '';

    if (rupees > 0) {
        words += numberToWords(rupees) + ' Rupees';
    }

    if (paisa > 0) {
        words += (rupees > 0 ? ' and ' : '') + numberToWords(paisa) + ' Paisa';
    }

    return words || 'Zero Rupees';
}


window.addEventListener('DOMContentLoaded', () => {
    toggleVatInputs();
});

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('discountPercentage').addEventListener('input', function () {
        updateDiscountFromPercentage();
        calculateTotal();
    });

    document.getElementById('discountAmount').addEventListener('input', function () {
        updateDiscountFromAmount();
        calculateTotal();
    });

    document.getElementById('roundOffAmount').addEventListener('input', function () {
        calculateTotal();
    });

    calculateTotal();
});

async function shouldDisplayTransactions() {
    try {
        const response = await fetch(`/settings/get-display-purchase-transactions`);
        const { displayTransactionsForPurchase } = await response.json();
        return displayTransactionsForPurchase;
    } catch (error) {
        console.error('Error fetching settings:', error);
        return false;
    }
}

// Handle mouse clicks on rows
function handleRowClick(event, row) {
    const now = new Date().getTime();
    if (now - lastClickTime < DOUBLE_CLICK_THRESHOLD) {
        // This is part of a double click, let the dblclick handler handle it
        return;
    }
    lastClickTime = now;

    // Just select the row, don't navigate
    const rows = document.querySelectorAll('#transactionList tbody tr');
    const rowIndex = Array.from(rows).indexOf(row);
    if (rowIndex >= 0) {
        currentSelectedRowIndex = rowIndex;
        highlightRow(rows);
    }
    event.preventDefault();
}

// Handle double clicks on rows
function handleRowDoubleClick(row) {
    const url = row.getAttribute('data-href');
    if (url) {
        window.location.href = url;
    }
}

// Function to handle keyboard navigation in the transactions table
function handleTransactionTableKeydown(event) {
    const tbody = document.querySelector('#transactionList tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) return;

    switch (event.key) {
        case 'ArrowUp':
            event.preventDefault();
            if (currentSelectedRowIndex > 0) {
                currentSelectedRowIndex--;
                highlightRow(rows);
            }
            break;
        case 'ArrowDown':
            event.preventDefault();
            if (currentSelectedRowIndex < rows.length - 1) {
                currentSelectedRowIndex++;
                highlightRow(rows);
            }
            break;
        case 'PageUp':
            event.preventDefault();
            currentSelectedRowIndex = Math.max(0, currentSelectedRowIndex - VISIBLE_ROWS);
            highlightRow(rows);
            break;
        case 'PageDown':
            event.preventDefault();
            currentSelectedRowIndex = Math.min(rows.length - 1, currentSelectedRowIndex + VISIBLE_ROWS);
            highlightRow(rows);
            break;
        case 'Home':
            event.preventDefault();
            currentSelectedRowIndex = 0;
            highlightRow(rows);
            break;
        case 'End':
            event.preventDefault();
            currentSelectedRowIndex = rows.length - 1;
            highlightRow(rows);
            break;
        case 'Enter':
            event.preventDefault();
            if (currentSelectedRowIndex >= 0 && currentSelectedRowIndex < rows.length) {
                const url = rows[currentSelectedRowIndex].getAttribute('data-href');
                if (url) {
                    window.location.href = url;
                }
            }
            break;
        case 'Escape':
            $('#transactionModal').modal('hide');
            break;
    }
}

// Function to highlight the current row and handle scrolling
function highlightRow(rows) {
    const container = document.querySelector('#transactionList .table-responsive');
    if (!container || rows.length === 0) return;

    const rowHeight = rows[0].offsetHeight;
    const containerHeight = container.offsetHeight;
    const maxScroll = rows.length * rowHeight - containerHeight;

    // Calculate the new visible range
    visibleStartIndex = Math.floor(container.scrollTop / rowHeight);
    const visibleEndIndex = visibleStartIndex + VISIBLE_ROWS - 1;

    // Adjust scroll position if needed
    if (currentSelectedRowIndex < visibleStartIndex) {
        // Scroll up to show the selected row at the top
        container.scrollTop = currentSelectedRowIndex * rowHeight;
    } else if (currentSelectedRowIndex > visibleEndIndex) {
        // Scroll down to show the selected row at the bottom
        container.scrollTop = (currentSelectedRowIndex - VISIBLE_ROWS + 1) * rowHeight;
    }

    // Update the scroll position tracking
    currentScrollPosition = container.scrollTop;

    // Highlight the selected row
    rows.forEach((row, index) => {
        if (index === currentSelectedRowIndex) {
            row.classList.add('table-primary');
            row.focus();

            // Ensure the row is fully visible (handle partial visibility at edges)
            const rowTop = index * rowHeight;
            const rowBottom = rowTop + rowHeight;
            const viewportTop = container.scrollTop;
            const viewportBottom = viewportTop + containerHeight;

            if (rowTop < viewportTop) {
                container.scrollTop = rowTop;
            } else if (rowBottom > viewportBottom) {
                container.scrollTop = rowBottom - containerHeight;
            }
        } else {
            row.classList.remove('table-primary');
        }
    });
}


// Update the initialization code to add click handlers:
function initializeTransactionTable() {
    const container = document.querySelector('#transactionList .table-responsive');
    if (!container) return;

    // Set exact height for the container to show exactly 7 rows
    const rows = container.querySelectorAll('tbody tr');
    if (rows.length > 0) {
        const rowHeight = rows[0].offsetHeight;
        container.style.height = `${VISIBLE_ROWS * rowHeight}px`;

        // Add click handlers to each row
        rows.forEach(row => {
            row.addEventListener('click', (e) => handleRowClick(e, row));
        });
    }

    // Add scroll event listener to track position
    container.addEventListener('scroll', () => {
        currentScrollPosition = container.scrollTop;
    });
    currentSelectedRowIndex = -1;
}

// Modified modal show function with proper initialization
function showTransactionsModal() {
    $('#transactionModal').modal('show').on('shown.bs.modal', function () {
        initializeTransactionTable();
        document.querySelector('#transactionModal .modal-body').focus();
    });
}

async function fetchLastTransactions(itemId) {
    const accountId = document.getElementById('accountId').value;
    const purchaseSalesType = document.getElementById('purchaseSalesType').value;
    const transactionList = document.getElementById('transactionList');

    if (!purchaseSalesType) {
        console.error('Account Type is undefined. Please ensure it is set.');
        return;
    }

    try {
        const response = await fetch(`/api/transactions/${itemId}/${accountId}/${purchaseSalesType}`);
        const transactions = await response.json();

        if (transactions.length === 0) {
            transactionList.innerHTML = '<p>No transactions to display.</p>';
            return;
        }

        // Create table with fixed height and scrollable tbody
        let tableHtml = `
    <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
            <thead>
                <tr class="sticky-top bg-light">
                    <th>S.N.</th>
                    <th>Date</th>
                    <th>Vch. No.</th>
                    <th>Type</th>
                    <th>A/c Type</th>
                    <th>Pay.Mode</th>
                    <th>Qty.</th>
                    <th>Unit</th>
                    <th>Unit Rate</th>
                    <th>Disc</th>
                    <th>Nett. Rate</th>
                </tr>
            </thead>
            <tbody>`;

        // Add table rows for each transaction
        tableHtml += transactions.map((transaction, index) => {
            return `
        <tr data-href="/purchase-bills/${transaction.purchaseBillId._id}/print" 
            style="cursor: pointer;" tabindex="0" ondblclick="handleRowDoubleClick(this)">
            <td>${index + 1}</td>
            <td>${new Date(transaction.date).toLocaleDateString()}</td>
            <td>${transaction.billNumber}</td>
            <td>${transaction.type}</td>
            <td>${transaction.purchaseSalesType}</td>
            <td>${transaction.paymentMode}</td>
            <td>${transaction.quantity}</td>
            <td>${transaction.unit ? transaction.unit.name : 'N/A'}</td>
            <td>Rs.${Math.round(transaction.puPrice * 100) / 100}</td>
            <td>${Math.round(transaction.discountPercentagePerItem * 100) / 100} %</td>
            <td>Rs.${Math.round(transaction.netPuPrice * 100) / 100}</td>
        </tr>`;
        }).join('');

        // Close table
        tableHtml += `
            </tbody>
        </table>
    </div>`;


        // Set the innerHTML of the transaction list container
        transactionList.innerHTML = tableHtml;

        // Reset selected row index
        currentSelectedRowIndex = -1;

        // Add keyboard event listener
        document.querySelector('#transactionList table')?.addEventListener('keydown', handleTransactionTableKeydown);

        // Toggle button visibility
        document.getElementById('showSalesTransactions').classList.remove('d-none');
        document.getElementById('showPurchaseTransactions').classList.add('d-none');

        // Show the modal
        showTransactionsModal();

    } catch (error) {
        console.error('Error fetching transactions:', error);
    }
}
// Store the last selected item ID globally
let lastSelectedItemId = null;

// Function to set the last selected item ID
function setLastSelectedItemId(itemId) {
    lastSelectedItemId = itemId;
}


// Modified fetchSalesTransactions function with 7-row visible layout
async function fetchSalesTransactions() {
    const accountId = document.getElementById('accountId').value;
    const transactionList = document.getElementById('transactionList');

    if (!accountId) {
        alert('Please select an account first');
        return;
    }

    if (!lastSelectedItemId) {
        alert('Please select an item first');
        return;
    }

    try {
        const response = await fetch(`/api/transactions/sales-by-item-account?itemId=${lastSelectedItemId}&accountId=${accountId}`);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const transactions = await response.json();

        if (!transactions || transactions.length === 0) {
            transactionList.innerHTML = '<div class="alert alert-info">No sales transactions found for this item and account.</div>';
            return;
        }

        // Build the transactions table with same structure as fetchLastTransactions
        let tableHtml = `
    <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
            <thead>
                <tr class="sticky-top bg-light">
                    <th>S.N.</th>
                    <th>Date</th>
                    <th>Inv. No.</th>
                    <th>Type</th>
                    <th>A/c Type</th>
                    <th>Pay.Mode</th>
                    <th>Qty.</th>
                    <th>Unit</th>
                    <th>Unit Rate</th>
                    <th>Disc</th>
                    <th>Nett. Rate</th>
                </tr>
            </thead>
            <tbody>`;

        tableHtml += transactions.map((transaction, index) => {
            return `
        <tr data-href="/bills/${transaction.billId?._id}/print" 
            style="cursor: pointer;" tabindex="0" ondblclick="handleRowDoubleClick(this)">
            <td>${index + 1}</td>
            <td>${new Date(transaction.date).toLocaleDateString()}</td>
            <td>${transaction.billNumber}</td>
            <td>${transaction.type}</td>
            <td>${transaction.purchaseSalesType}</td>
            <td>${transaction.paymentMode}</td>
            <td>${transaction.quantity}</td>
            <td>${transaction.unit?.name || 'N/A'}</td>
            <td>Rs.${Math.round(transaction.price * 100) / 100}</td>
            <td>${Math.round(transaction.discountPercentagePerItem * 100) / 100} %</td>
            <td>Rs.${Math.round(transaction.netPrice * 100) / 100}</td>
        </tr>`;
        }).join('');

        tableHtml += `
            </tbody>
        </table>
    </div>`;

        transactionList.innerHTML = tableHtml;

        // Reset selected row index
        currentSelectedRowIndex = -1;

        // Initialize the table with 7 visible rows
        initializeTransactionTable();

        // Add keyboard event listener
        document.querySelector('#transactionList table')?.addEventListener('keydown', handleTransactionTableKeydown);

        // Toggle button visibility
        document.getElementById('showPurchaseTransactions').classList.remove('d-none');
        document.getElementById('showSalesTransactions').classList.add('d-none');

    } catch (error) {
        console.error('Failed to fetch sales transactions:', error);
        transactionList.innerHTML = `
            <div class="alert alert-danger">
                Failed to load sales transactions. Please try again.
                <br><small>${error.message}</small>
            </div>`;
    }
}

// Event listener for the button
document.getElementById('showSalesTransactions')?.addEventListener('click', fetchSalesTransactions);


// Modified fetchPurchaseTransactions function with 7-row visible layout
async function fetchPurchaseTransactions() {
    const accountId = document.getElementById('accountId').value;
    const transactionList = document.getElementById('transactionList');

    if (!accountId) {
        alert('Please select an account first');
        return;
    }

    if (!lastSelectedItemId) {
        alert('Please select an item first');
        return;
    }

    try {
        const response = await fetch(`/api/transactions/purchase-by-item-account?itemId=${lastSelectedItemId}&accountId=${accountId}`);
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const transactions = await response.json();

        if (!transactions || transactions.length === 0) {
            transactionList.innerHTML = '<div class="alert alert-info">No purchase transactions found for this item and account.</div>';
            return;
        }

        // Build the transactions table with same structure as fetchLastTransactions
        let tableHtml = `
    <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
            <thead>
                <tr class="sticky-top bg-light">
                    <th>S.N.</th>
                    <th>Date</th>
                    <th>Vch. No.</th>
                    <th>Type</th>
                    <th>A/c Type</th>
                    <th>Pay.Mode</th>
                    <th>Qty.</th>
                    <th>Unit</th>
                    <th>Unit Rate</th>
                    <th>Disc</th>
                    <th>Nett. Rate</th>
                </tr>
            </thead>
            <tbody>`;

        tableHtml += transactions.map((transaction, index) => {
            return `
        <tr data-href="/purchase-bills/${transaction.purchaseBillId._id}/print" 
            style="cursor: pointer;" tabindex="0" ondblclick="handleRowDoubleClick(this)">
            <td>${index + 1}</td>
            <td>${new Date(transaction.date).toLocaleDateString()}</td>
            <td>${transaction.billNumber}</td>
            <td>${transaction.type}</td>
            <td>${transaction.purchaseSalesType}</td>
            <td>${transaction.paymentMode}</td>
            <td>${transaction.quantity}</td>
            <td>${transaction.unit?.name || 'N/A'}</td>
            <td>Rs.${Math.round(transaction.puPrice * 100) / 100}</td>
            <td>${Math.round(transaction.discountPercentagePerItem * 100) / 100} %</td>
            <td>Rs.${Math.round(transaction.netPuPrice * 100) / 100}</td>
        </tr>`;
        }).join('');

        tableHtml += `
            </tbody>
        </table>
    </div>`;

        transactionList.innerHTML = tableHtml;

        // Reset selected row index
        currentSelectedRowIndex = -1;

        // Initialize the table with 7 visible rows
        initializeTransactionTable();

        // Add keyboard event listener
        document.querySelector('#transactionList table')?.addEventListener('keydown', handleTransactionTableKeydown);

        // Toggle button visibility
        document.getElementById('showSalesTransactions').classList.remove('d-none');
        document.getElementById('showPurchaseTransactions').classList.add('d-none');

    } catch (error) {
        console.error('Failed to fetch purchase transactions:', error);
        transactionList.innerHTML = `
            <div class="alert alert-danger">
                Failed to load purchase transactions. Please try again.
                <br><small>${error.message}</small>
            </div>`;
    }
}

// Event listener for the button
document.getElementById('showPurchaseTransactions')?.addEventListener('click', fetchPurchaseTransactions);



async function handleFetchLastTransactions(itemId) {
    const displayTransactions = await shouldDisplayTransactions();
    if (displayTransactions) {
        await fetchLastTransactions(itemId);
    }
}

function openModalAndFocusCloseButton() {
    // Open the modal
    $('#transactionModal').modal('show');

    // Wait until the modal is fully shown before focusing the close button
    $('#transactionModal').on('shown.bs.modal', function () {
        document.getElementById('closeModalButton').focus();
    });
}

async function handleItemSearchKeydown(event) {
    const itemSearchInput = document.getElementById('itemSearch');
    const itemsTable = document.getElementById('itemsTable');
    const itemsAvailable = itemsTable && itemsTable.querySelectorAll('.item').length > 0;

    if (itemSearchInput.value.length > 0) {
        if (event.key === 'Enter') {
            // Fetch and check if transactions should be displayed
            const displayTransactions = await shouldDisplayTransactions();

            // Only open the modal if displayTransactions is true
            if (displayTransactions) {
                openModalAndFocusCloseButton();
            } else {
                focusOnLastRow('item-WSUnit');
            }
        }
    } else if (itemSearchInput.value.length < 0 || itemsAvailable) {
        if (event.key === 'Enter') {
            const submitBillForm = document.getElementById('saveBill')
            submitBillForm.focus();
        }
    }
}

function handleCloseButtonKeydown(event) {
    if (event.key === 'Enter') {
        // Close the modal (optional, depending on your implementation)
        $('#transactionModal').modal('hide');

        // Focus on the quantity input field
        document.getElementById(`WSUnit-${itemIndex - 1}`).focus();
        // focusOnLastRow('quantity');
    }
}

function handleWSUnitKeydown(event) {
    if (event.key === 'Enter') {
        const batchNumberInput = document.getElementById(`batchNumber-${itemIndex - 1}`);
        batchNumberInput.focus();
        batchNumberInput.select();

    }
}

function handleBatchKeydown(event) {
    if (event.key === 'Enter') {
        const expDateInput = document.getElementById(`expiryDate-${itemIndex - 1}`);
        expDateInput.focus();
        expDateInput.select();
    }
}

function handleExpDateKeydown(event) {
    if (event.key === 'Enter') {
        if (storeManagementEnabled) {
            const storeInput = document.getElementById(`store-${itemIndex - 1}`)
            storeInput.focus();
            storeInput.select();
        } else {
            // Skip store and rack when management is disabled
            const quantityInput = document.getElementById(`quantity-${itemIndex - 1}`)
            quantityInput.focus();
            quantityInput.select();
        }
    }
}


function handleStoreKeydown(event) {
    if (event.key === 'Enter') {
        const rackInput = document.getElementById(`rack-${itemIndex - 1}`);
        rackInput.focus();
        rackInput.select();
    }
}
function handleRackKeydown(event) {
    if (event.key === 'Enter') {
        const quantityInput = document.getElementById(`quantity-${itemIndex - 1}`);
        quantityInput.focus();
        quantityInput.select();
    }
}

function handleQuantityKeydown(event) {
    if (event.key === 'Enter') {
        const bonusInput = document.getElementById(`bonus-${itemIndex - 1}`);
        bonusInput.focus();
        bonusInput.select();

    }
}
function handleBonusKeydown(event) {
    if (event.key === 'Enter') {
        const priceInput = document.getElementById(`puPrice-${itemIndex - 1}`);
        priceInput.focus();
        priceInput.select();

    }
}

function handlePriceKeydown(event, itemIndex) {
    if (event.key === 'Enter') {
        const puPriceInput = document.getElementById(`puPrice-${itemIndex}`);
        const tr = puPriceInput.closest('tr');
        const bonusInput = tr.querySelector(`.item-bonus`);
        const bonusQuantity = parseFloat(bonusInput.value) || 0;

        // Remove any existing hidden inputs for this item first
        ['price', 'mrp', 'marginPercentage', 'currency', 'CCPercentage', 'itemCCAmount'].forEach(field => {
            const existingInput = tr.querySelector(`input[name="items[${itemIndex}][${field}]"]`);
            if (existingInput) {
                tr.removeChild(existingInput);
            }
        });

        if (puPriceInput.value) {
            // Set the PU Price in the modal
            document.getElementById('puPrice').value = puPriceInput.value;

            // Set default CC percentage to 7.5
            document.getElementById('CCPercentage').value = '7.5';

            // Calculate initial CC Amount
            const puPrice = parseFloat(puPriceInput.value) || 0;
            const ccPercentage = 7.5;
            const itemCCAmount = (puPrice * ccPercentage / 100) * bonusQuantity;
            document.getElementById('itemCCAmount').value = itemCCAmount.toFixed(2);

            // Show the sales price modal
            $('#setSalesPriceModal').modal('show');

            // Handle modal shown event to focus on the margin percentage input
            $('#setSalesPriceModal').on('shown.bs.modal', function () {
                document.getElementById('CCPercentage').focus();
            });

            // Handle CC percentage input changes
            const ccPercentageInput = document.getElementById('CCPercentage');
            ccPercentageInput.oninput = function () {
                const puPrice = parseFloat(puPriceInput.value) || 0;
                const ccPercentage = parseFloat(this.value) || 0;
                const itemCCAmount = (puPrice * ccPercentage / 100) * bonusQuantity;
                document.getElementById('itemCCAmount').value = itemCCAmount.toFixed(2);
            };

            // Handle margin percentage input
            const marginPercentageInput = document.getElementById('marginPercentage');
            marginPercentageInput.oninput = function () {
                updateSalesPriceFromMargin(puPriceInput.value);
            };

            // Handle MRP input
            const mrpInput = document.getElementById('mrp');
            mrpInput.oninput = function () {
                updateSalesPriceFromMRP(mrpInput.value);
                updateMarginFromMRPAndSalesPrice(mrpInput.value, puPriceInput.value);
            };

            // Handle sales price input
            const salesPriceInput = document.getElementById('salesPrice');
            salesPriceInput.oninput = function () {
                updateMarginFromMRPAndSalesPrice(mrpInput.value, puPriceInput.value);
            };

            // Handle currency change
            const currencySelect = document.getElementById('currency');
            currencySelect.onchange = function () {
                updateSalesPriceFromMRP(mrpInput.value);
            };

            // Handle sales price save action
            const saveSalesPriceButton = document.getElementById('saveSalesPrice');
            saveSalesPriceButton.onclick = function () {
                const salesPrice = document.getElementById('salesPrice').value;
                const mrpValue = document.getElementById('mrp').value;
                const marginPercentage = document.getElementById('marginPercentage').value;
                const currency = document.getElementById('currency').value;
                const CCPercentage = document.getElementById('CCPercentage').value;
                const itemCCAmount = document.getElementById('itemCCAmount').value;

                if (salesPrice) {
                    // First remove any existing hidden inputs for this item
                    ['price', 'mrp', 'marginPercentage', 'currency', 'CCPercentage', 'itemCCAmount'].forEach(field => {
                        const existingInput = tr.querySelector(`input[name="items[${itemIndex}][${field}]"]`);
                        if (existingInput) {
                            tr.removeChild(existingInput);
                        }
                    });

                    // Create new hidden inputs with the latest values
                    const createHiddenInput = (name, value) => {
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = `items[${itemIndex}][${name}]`;
                        input.value = value;
                        tr.appendChild(input);
                    };

                    createHiddenInput('price', salesPrice);
                    createHiddenInput('mrp', mrpValue);
                    createHiddenInput('marginPercentage', marginPercentage);
                    createHiddenInput('currency', currency);
                    createHiddenInput('CCPercentage', CCPercentage);
                    createHiddenInput('itemCCAmount', itemCCAmount);

                    // Close the modal
                    $('#setSalesPriceModal').modal('hide');

                    // Focus back on the item search input field
                    const itemSearchInput = document.getElementById('itemSearch');
                    itemSearchInput.focus();
                    // Show all items after a small delay
                    setTimeout(() => {
                        if (isItemsLoaded) {
                            displaySearchResults(allItems, itemSearchInput.nextElementSibling);
                            itemSearchInput.nextElementSibling.classList.add('show');
                        }
                    }, 50);
                } else {
                    alert('Please enter a valid sales price.');
                }
                calculateTotal();
            };
        }
    }
}

// Function to update sales price based on margin percentage
function updateSalesPriceFromMargin(puPrice) {
    const marginPercentage = parseFloat(document.getElementById('marginPercentage').value) || 0;
    const salesPriceFromMargin = parseFloat(puPrice) + (parseFloat(puPrice) * marginPercentage / 100);
    document.getElementById('salesPrice').value = salesPriceFromMargin.toFixed(2); // Set calculated sales price from margin
}

// Add event listener for Enter key on marginPercentage input
document.getElementById('marginPercentage').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        const puPrice = document.getElementById('puPrice').value; // Get the purchase price
        updateSalesPriceFromMargin(puPrice); // Update sales price based on margin
    }
});

function updateSalesPriceFromMRP(mrpValue) {
    const currency = document.getElementById('currency').value;
    let salesPriceFromMRP;
    if (currency === 'INR') {
        salesPriceFromMRP = parseFloat(mrpValue) * 1.60; // Convert MRP to sales price for INR
    } else {
        salesPriceFromMRP = parseFloat(mrpValue); // Use MRP directly for NPR
    }
    document.getElementById('salesPrice').value = salesPriceFromMRP.toFixed(2); // Set calculated sales price from MRP
}

function updateMarginFromMRPAndSalesPrice(mrpValue, puPriceValue) {
    const salesPrice = parseFloat(document.getElementById('salesPrice').value) || 0;
    const puPrice = parseFloat(puPriceValue) || 0;
    const marginPercentageInput = document.getElementById('marginPercentage');

    // Calculate margin percentage based on (Sales Price - PU Price) / PU Price * 100
    const marginPercentage = ((salesPrice - puPrice) / puPrice) * 100;

    if (!isNaN(marginPercentage) && puPrice > 0) {
        marginPercentageInput.value = marginPercentage.toFixed(2); // Update margin percentage
    } else {
        marginPercentageInput.value = ''; // Reset if the calculation fails or PU Price is 0
    }
}


function selectValue(input) {
    input.select(); // Select the value of the input field when it is focused
}

function focusOnLastRow(fieldClass) {
    const rows = document.querySelectorAll('.item');
    if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        const inputField = lastRow.querySelector(`.${fieldClass}`);
        if (inputField) {
            inputField.focus();
            inputField.select();
        }
    }
}

function moveToNextInput(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent form submission

        // Move to the next visible input
        moveToNextVisibleInput(event.target);
    }
}


// Get all the input elements within the form
const inputs = document.querySelectorAll('form input, form select form group');

// Attach the moveToNextInput function to the keydown event for each input field
inputs.forEach(input => {
    input.addEventListener('keydown', moveToNextInput);
});

// Get the input field and the custom alert div
const billNumber = document.getElementById('billNumber');
const customAlertForBillNumber = document.getElementById('customAlertForBillNumber');

// Function to show the custom alert and focus on the input field
function showCustomAlertForBillNumber() {
    customAlertForBillNumber.style.display = 'block'; // Show the custom alert
    billNumber.focus(); // Keep focus on the input field
}

// Function to hide the custom alert when the user types
function hideCustomAlertOnInput() {
    if (billNumber.value.trim() !== '') {
        customAlertForBillNumber.style.display = 'none'; // Hide the alert
    }
}

// Function to hide the custom alert if Enter key is pressed
function hideCustomAlertForBillNumber(event) {
    if (event.key === 'Enter') {
        if (billNumber.value.trim() !== '') {
            customAlertForBillNumber.style.display = 'none'; // Hide alert if valid
        } else {
            showCustomAlertForBillNumber(); // Show alert again if still empty
        }
    }
}

// Add a blur event listener to the input field
billNumber.addEventListener('blur', function (event) {
    if (event.target.value.trim() === '') {
        showCustomAlertForBillNumber(); // Show alert if empty
    }
});

// Add an input event listener to hide the alert when the user starts typing
billNumber.addEventListener('input', hideCustomAlertOnInput);

// Add a keypress event listener to detect Enter key
billNumber.addEventListener('keypress', hideCustomAlertForBillNumber);

//----------------------------------------------------------------------

// Function to handle Enter key press for moving to the next input field for setSalesPrice model
function moveToNextField(event, nextFieldId) {
    if (event.key === 'Enter') {
        // Prevent the default Enter key action (e.g., form submission)
        event.preventDefault();

        // Focus on the next input field or element by id
        const nextField = document.getElementById(nextFieldId);
        if (nextField) {
            nextField.focus();
        }
    }
}

// Add event listeners for each input field (except the read-only ones and select elements)
document.getElementById('CCPercentage').addEventListener('keypress', function (event) {
    moveToNextField(event, 'itemCCAmount'); // Focus on 'currency' select when Enter is pressed
});
document.getElementById('itemCCAmount').addEventListener('keypress', function (event) {
    moveToNextField(event, 'marginPercentage'); // Focus on 'currency' select when Enter is pressed
});

document.getElementById('marginPercentage').addEventListener('keypress', function (event) {
    moveToNextField(event, 'currency'); // Focus on 'currency' select when Enter is pressed
});

document.getElementById('currency').addEventListener('keypress', function (event) {
    moveToNextField(event, 'mrp'); // Focus on 'mrp' input when Enter is pressed
});

document.getElementById('mrp').addEventListener('keypress', function (event) {
    moveToNextField(event, 'salesPrice'); // Focus on 'salesPrice' input when Enter is pressed
});

document.getElementById('salesPrice').addEventListener('keypress', function (event) {
    moveToNextField(event, 'saveSalesPrice'); // Focus on 'saveSalesPrice' button when Enter is pressed
});

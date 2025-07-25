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


async function fetchItems(query, vatStatus, existingItemIds) {
    try {
        const response = await fetch(`/items/search?q=${query}&isVatExempt=${vatStatus}`);
        const data = await response.json();

        ('Fetched items:', data);

        if (!Array.isArray(data)) {
            throw new Error('Invalid response format');
        }

        return data;
    } catch (error) {
        console.error('Error fetching items:', error);
        return [];
    }
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
        item.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest' // Ensures the item is in view without scrolling too far
        });
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
    const vatStatus = document.getElementById('isVatExempt').value;
    const existingItemIds = Array.from(document.querySelectorAll('input[name^="items["]'))
        .filter(input => input.name.includes('[item]'))
        .map(input => input.value);

    // Fetch all items with an empty query
    const items = await fetchItems('', vatStatus, existingItemIds);
    ('All items:', items);

    // Clear existing dropdown items
    dropdownMenu.innerHTML = '';

    if (items.length === 0) {
        const noItemsMessage = document.createElement('div');
        noItemsMessage.classList.add('dropdown-item');
        noItemsMessage.textContent = 'No items found';
        noItemsMessage.style.textAlign = 'center';
        noItemsMessage.style.color = 'white';
        noItemsMessage.style.backgroundColor = 'blue';
        dropdownMenu.appendChild(noItemsMessage);
        dropdownMenu.classList.add('show');
    } else {
        // Add header row
        const headerRow = document.createElement('div');
        headerRow.classList.add('dropdown-header');
        headerRow.innerHTML = `
    <div><strong>Item Code</strong></div>
    <div><strong>HS Code</strong></div>
    <div><strong>Name</strong></div>
    <div><strong>Stock</strong></div>
    <div><strong>Unit</strong></div>
    <div><strong>C.Rate</strong></div>
`;
        headerRow.style.backgroundColor = '#f0f0f0';
        headerRow.style.fontWeight = 'bold';
        dropdownMenu.appendChild(headerRow);

        // Add item rows
        items.forEach(item => {
            const dropdownItem = document.createElement('div');
            dropdownItem.classList.add('dropdown-item');
            dropdownItem.tabIndex = 0;

            if (item.vatStatus === 'vatable') {
                dropdownItem.classList.add('vatable-item');
            } else {
                dropdownItem.classList.add('non-vatable-item');
            }

            const totalStock = item.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);
            const latestStockEntry = item.stockEntries[item.stockEntries.length - 1];
            const puPrice = latestStockEntry ? latestStockEntry.puPrice : 0;

            dropdownItem.innerHTML = `
        <div>${item.uniqueNumber || 'N/A'}</div>
        <div>${item.hscode || 'N/A'}</div>
        <div>${item.name}</div>
        <div>${totalStock}</div>
        <div>${item.unit ? item.unit.name : ''}</div>
        <div>Rs.${puPrice.toFixed(2)}</div>
    `;

            dropdownItem.addEventListener('click', () => {
                addItemToBill(item, dropdownMenu);
                input.value = item.name;
                dropdownMenu.classList.remove('show');
            });
            dropdownMenu.appendChild(dropdownItem);
        });

        dropdownMenu.classList.add('show');
        currentFocus = 0;
        addActive(dropdownMenu.getElementsByClassName('dropdown-item'));

        // Auto-fill and auto-select the input field with the first item name on the first load
        if (isFirstLoad && items.length > 0) {
            input.value = items[0].name;
            input.select(); // Auto-select the input text
            isFirstLoad = false; // Set the flag to false after the first time
        }
    }

}


// Add event listener for focus to show all items
document.getElementById('itemSearch').addEventListener('focus', function () {
    showAllItems(this);
});
// Add event listener for input to fetch items dynamically
document.getElementById('itemSearch').addEventListener('input', function () {
    const query = this.value.trim().toLowerCase();
    const vatStatus = document.getElementById('isVatExempt').value;
    const dropdownMenu = this.nextElementSibling;

    if (query.length === 0) {
        showAllItems(this);
        return;
    }

    const existingItemIds = Array.from(document.querySelectorAll('input[name^="items["]'))
        .filter(input => input.name.includes('[item]'))
        .map(input => input.value);

    fetchItems(query, vatStatus, existingItemIds).then(items => {
        dropdownMenu.innerHTML = '';

        if (items.length === 0) {
            const noItemsMessage = document.createElement('div');
            noItemsMessage.classList.add('dropdown-item');
            noItemsMessage.textContent = 'No items found';
            noItemsMessage.style.textAlign = 'center';
            noItemsMessage.style.color = 'white';
            noItemsMessage.style.backgroundColor = 'blue';
            dropdownMenu.appendChild(noItemsMessage);
            dropdownMenu.classList.add('show');
        } else {
            items.forEach(item => {
                const dropdownItem = document.createElement('div');
                dropdownItem.classList.add('dropdown-item');
                dropdownItem.tabIndex = 0;

                if (item.vatStatus === 'vatable') {
                    dropdownItem.classList.add('vatable-item');
                } else {
                    dropdownItem.classList.add('non-vatable-item');
                }

                const totalStock = item.stockEntries.reduce((acc, entry) => acc + entry.quantity, 0);
                const latestStockEntry = item.stockEntries[item.stockEntries.length - 1];
                const puPrice = latestStockEntry ? latestStockEntry.mainUnitPuPrice : 0;
                dropdownItem.innerHTML = `
            <div>${item.uniqueNumber || 'N/A'}</div>
            <div>${item.hscode || 'N/A'}</div>
            <div>${item.name}</div>
            <div>${item.category ? item.category.name : 'No Category'}</div>
            <div>${totalStock}</div>
            <div>${item.unit ? item.unit.name : ''}</div>
            <div>Rs.${puPrice.toFixed()}</div>
        `;

                dropdownItem.addEventListener('click', () => {
                    addItemToBill(item, dropdownMenu);
                    this.value = item.name;
                    dropdownMenu.classList.remove('show'); // Close the dropdown after selection
                });
                dropdownMenu.appendChild(dropdownItem);
            });

            dropdownMenu.classList.add('show');
            currentFocus = 0;
            addActive(dropdownMenu.getElementsByClassName('dropdown-item'));
        }
    });
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


    const itemIndex = tbody.rows.length; // Use the current number of rows as the index
    const serialNumber = itemIndex + 1; // Calculate the serial number

    // Use price from the first stock entry
    const batchpuPrice = lastStockEntry.mainUnitPuPrice || 0;

    // Create a new row for the item
    const tr = document.createElement('tr');
    tr.classList.add('item', item.vatStatus ? 'vatable-item' : 'non-vatable-item');

    tr.innerHTML = `
<td>${serialNumber}</td>
<td>${item.uniqueNumber || 'N/A'}</td>
<td>
    <input type="hidden" name="items[${itemIndex}][hscode]" value="${item.hscode || 'N/A'}">
    ${item.hscode || 'N/A'}
</td>
<td class="col-3">
    <input type="hidden" name="items[${itemIndex}][item]" value="${item._id}">
    ${item.name || 'N/A'}
</td>
<td class="">
    <input type="number" name="items[${itemIndex}][WSUnit]" class="form-control item-WSUnit" id="WSUnit-${itemIndex}" value="${item.WSUnit || 1}" onfocus="selectValue(this)" onkeydown="handleWSUnitKeydown(event,${itemIndex})" required>
</td>
<td>
    <input type="text" name="items[${itemIndex}][batchNumber]" class="form-control item-batchNumber" id="batchNumber-${itemIndex}" onkeydown="handleBatchKeydown(event, ${itemIndex})" onfocus="selectValue(this)" autocomplete="off" value="XXX">
</td>
<td>
    <input type="date" name="items[${itemIndex}][expiryDate]" class="form-control item-expiryDate" id="expiryDate-${itemIndex}" onkeydown="handleExpDateKeydown(event, ${itemIndex})" onfocus="selectValue(this)" value="${getDefaultExpiryDate()}" required>
</td>
<td>
    <input type="number" name="items[${itemIndex}][quantity]" value="0" class="form-control item-quantity" id="quantity-${itemIndex}" min="1" step="any" oninput="updateItemTotal(this)" onkeydown="handleQuantityKeydown(event, ${itemIndex})" onfocus="selectValue(this)">
</td>
<td>
    <input type="number" name="items[${itemIndex}][bonus]" value="0" class="form-control item-bonus" id="bonus-${itemIndex}" step="any" onkeydown="handleBonusKeydown(event,${itemIndex})" onfocus="selectValue(this)">
</td>
<td>
    ${item.unit ? item.unit.name : 'N/A'}
    <input type="hidden" name="items[${itemIndex}][unit]" value="${item.unit ? item.unit._id : ''}">
</td>
<td>
    <input type="number" name="items[${itemIndex}][puPrice]" value="${Math.round(batchpuPrice * 100) / 100}" class="form-control item-puPrice" id="puPrice-${itemIndex}" step="any" oninput="updateItemTotal(this)" onkeydown="handlePriceKeydown(event, ${itemIndex})" onfocus="selectValue(this)">
</td>
<td class="item-amount">0.00</td>
<td>
    <button type="button" class="btn btn-danger" data-dismiss="modal" aria-label="Close" onclick="removeItem(this)">
        <span aria-hidden="true">&times;</span>
    </button>
</td>
<input type="hidden" name="items[${itemIndex}][vatStatus]" value="${item.vatStatus}">
`;

    // Add the row to the table body
    tbody.appendChild(tr);

    // Recalculate totals after adding the new item
    calculateTotal();

    // Fetch and display last transactions for the added item
    fetchLastTransactions(item._id);
    setLastSelectedItemId(item._id);
    fetchLastItemsData(item._id);

    // Hide the dropdown menu
    dropdownMenu.classList.remove('show');

    // Clear the input field and focus on the quantity of the newly added row
    inputField.value = '';
    document.getElementById(`quantity-${itemIndex}`).focus();
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
        document.getElementById('mrp').value = lastValues.mrp || 0;
        document.getElementById('marginPercentage').value = lastValues.marginPercentage || 0;
        document.getElementById('salesPrice').value = lastValues.price || 0;
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
    // Get all item rows
    const itemRows = document.querySelectorAll('#items tr.item');

    // If there's only one row left, prevent removal
    if (itemRows.length <= 1) {
        alert("You cannot remove the last item. A bill must have at least one item.");
        return;
    }
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
        subTotal += amount;
    });

    return subTotal;
}

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

function calculateTotal() {
    const rows = document.querySelectorAll('#items tr.item');
    let subTotal = calculateSubTotal();
    let vatAmount = 0;
    let totalTaxableAmount = 0;
    let totalNonTaxableAmount = 0;
    let totalCCAmount = 0;
    let taxableCCAmount = 0;
    let nonTaxableCCAmount = 0;

    const vatPercentage = parseFloat(document.getElementById('vatPercentage').value) || 13;
    const vatSelection = document.getElementById('isVatExempt').value;

    rows.forEach(row => {
        const amount = parseFloat(row.querySelector('.item-amount').textContent) || 0;
        const vatStatusInput = row.querySelector('input[name$="[vatStatus]"]');
        const isVatable = vatStatusInput && vatStatusInput.value === 'vatable';

        // Get CC values
        const ccAmountInput = row.querySelector('input[name$="[itemCCAmount]"]');
        const itemCCAmount = ccAmountInput ? parseFloat(ccAmountInput.value) || 0 : 0;

        totalCCAmount += itemCCAmount;

        if (isVatable) {
            totalTaxableAmount += amount;
            taxableCCAmount += itemCCAmount;
        } else {
            totalNonTaxableAmount += amount;
            nonTaxableCCAmount += itemCCAmount;
        }
    });

    // Apply discounts
    const discountPercentage = parseFloat(document.getElementById('discountPercentage').value) || 0;
    const discountForTaxable = (totalTaxableAmount * discountPercentage) / 100;
    const discountForNonTaxable = (totalNonTaxableAmount * discountPercentage) / 100;

    const finalTaxableAmount = totalTaxableAmount - discountForTaxable;
    const finalNonTaxableAmount = totalNonTaxableAmount - discountForNonTaxable;

    // Include CC amounts
    const displayTaxableAmount = finalTaxableAmount + taxableCCAmount;
    const displayNonTaxableAmount = finalNonTaxableAmount + nonTaxableCCAmount;

    // Calculate VAT
    if (vatSelection === 'false' || vatSelection === 'all') {
        vatAmount = (displayTaxableAmount * vatPercentage) / 100;
    }

    const roundOffAmount = parseFloat(document.getElementById('roundOffAmount').value) || 0;
    const totalAmount = displayTaxableAmount + displayNonTaxableAmount + vatAmount + roundOffAmount;

    // Update the DOM
    document.getElementById('subTotal').textContent = subTotal.toFixed(2);
    document.getElementById('taxableAmount').textContent = displayTaxableAmount.toFixed(2);
    document.getElementById('vatAmount').textContent = vatAmount.toFixed(2);
    document.getElementById('totalAmount').textContent = totalAmount.toFixed(2);

    // Show total CC amount in bill details
    document.getElementById('CCAmount').value = totalCCAmount.toFixed(2);

    // Convert to words
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


function toggleVatInputs() {
    const isVatExempt = document.getElementById('isVatExempt').value === 'true';

    // VAT-related fields
    const taxableAmountRow = document.getElementById('taxableAmountRow');
    // const vatPercentageRow = document.getElementById('vatPercentageRow');

    // Toggle display based on VAT exemption
    if (isVatExempt) {
        taxableAmountRow.style.display = 'none';
    } else {
        taxableAmountRow.style.display = 'table-row'; // Show taxable amount row
    }

    // Recalculate total when toggling VAT
    calculateTotal();
}

function moveToNextVisibleInput(currentElement) {
    // Get all focusable elements (including selects) in tab order
    const focusableElements = Array.from(document.querySelectorAll(
        'input:not([type="hidden"]), select, textarea, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => {
        // Filter only visible elements
        return el.offsetParent !== null &&
            window.getComputedStyle(el).visibility !== 'hidden' &&
            window.getComputedStyle(el).display !== 'none';
    });

    // Find current element's index
    const currentIndex = focusableElements.indexOf(currentElement);

    // If current element not found or is last element, do nothing
    if (currentIndex === -1 || currentIndex === focusableElements.length - 1) {
        return;
    }

    // Focus next visible element
    const nextElement = focusableElements[currentIndex + 1];
    nextElement.focus();

    // For select elements, ensure the dropdown doesn't open automatically
    if (nextElement.tagName === 'SELECT') {
        nextElement.blur(); // Remove immediate focus to prevent dropdown opening
        setTimeout(() => nextElement.focus(), 10); // Refocus after slight delay
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

        // Focus on the quantity input field in the last row
        const lastRow = document.querySelector('#items tr.item:last-child');
        if (lastRow) {
            const WSUnitInput = lastRow.querySelector('.item-WSUnit');
            if (WSUnitInput) {
                WSUnitInput.focus();
            }
        }
    }
}


function handleWSUnitKeydown(event) {
    if (event.key === 'Enter') {
        const lastRow = document.querySelector('#items tr.item:last-child');
        if (lastRow) {
            const batchNumberInput = lastRow.querySelector('.item-batchNumber');
            batchNumberInput.focus();
            batchNumberInput.select();

        }
    }
}

function handleQuantityKeydown(event) {
    if (event.key === 'Enter') {
        const lastRow = document.querySelector('#items tr.item:last-child');
        if (lastRow) {
            const batchNumberInput = lastRow.querySelector('.item-bonus');
            if (batchNumberInput) {
                batchNumberInput.focus();
                batchNumberInput.select();
            }
        }
    }
}

function handleBonusKeydown(event) {
    if (event.key === 'Enter') {
        const lastRow = document.querySelector('#items tr.item:last-child');
        if (lastRow) {
            const priceInput = lastRow.querySelector('.item-puPrice');
            if (priceInput) {
                priceInput.focus();
                priceInput.select();
            }
        }
    }
}

function handleBatchKeydown(event) {
    if (event.key === 'Enter') {
        const lastRow = document.querySelector('#items tr.item:last-child');
        if (lastRow) {
            const expDateInput = lastRow.querySelector('.item-expiryDate');
            if (expDateInput) {
                expDateInput.focus();
                expDateInput.select();
            }
        }
    }
}

function handleExpDateKeydown(event) {
    if (event.key === 'Enter') {
        const lastRow = document.querySelector('#items tr.item:last-child');
        if (lastRow) {
            const quantityInput = lastRow.querySelector('.item-quantity');
            if (quantityInput) {
                quantityInput.focus();
                quantityInput.select();
            }
        }
    }
}

// Attach event listeners dynamically to the last row
function attachEventListenersToLastRow() {
    const lastRow = document.querySelector('#items tr.item:last-child');
    if (lastRow) {
        const quantityInput = lastRow.querySelector('.item-quantity');
        const batchNumberInput = lastRow.querySelector('.item-batchNumber');
        const expDateInput = lastRow.querySelector('.item-expiryDate');

        if (quantityInput) {
            quantityInput.addEventListener('keydown', handleQuantityKeydown);
        }
        if (batchNumberInput) {
            batchNumberInput.addEventListener('keydown', handleBatchKeydown);
        }
        if (expDateInput) {
            expDateInput.addEventListener('keydown', handleExpDateKeydown);
        }
    }
}

// Re-attach event listeners when a new row is added
document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners to the last row initially
    attachEventListenersToLastRow();

    // Monitor changes to the table for new rows
    const observer = new MutationObserver(() => {
        attachEventListenersToLastRow();
    });

    // Observe the `#items` table for child changes
    const itemsTable = document.getElementById('items');
    if (itemsTable) {
        observer.observe(itemsTable, { childList: true, subtree: true });
    }
});

// Function to handle Enter key press on the PU Price input
async function handlePriceKeydown(event, itemIndex) {
    if (event.key === 'Enter') {
        const puPriceInput = document.getElementById(`puPrice-${itemIndex}`);
        const tr = puPriceInput.closest('tr');
        const bonusInput = tr.querySelector('.item-bonus');

        // Get current values
        let puPrice = parseFloat(puPriceInput.value) || 0;
        let bonusQuantity = parseFloat(bonusInput.value) || 0;

        if (puPriceInput && puPriceInput.value) {
            // Check if this is an existing item
            const isExistingItem = document.querySelector(`input[name="items[${itemIndex}][CCPercentage]"]`) !== null;

            // Set default CC percentage (7.5) or use existing value
            const defaultCCPercentage = isExistingItem ?
                (document.querySelector(`input[name="items[${itemIndex}][CCPercentage]"]`)?.value || 7.5) :
                7.5;

            document.getElementById('CCPercentage').value = defaultCCPercentage;

            // Calculate initial CC Amount with current values
            const ccPercentage = parseFloat(defaultCCPercentage);
            let itemCCAmount = (puPrice * ccPercentage / 100) * bonusQuantity;
            document.getElementById('itemCCAmount').value = itemCCAmount.toFixed(2);

            // Populate modal with existing or default values
            if (isExistingItem) {
                document.getElementById('marginPercentage').value =
                    document.getElementById(`marginPercentage-${itemIndex}`)?.value || '';
                document.getElementById('mrp').value =
                    document.getElementById(`mrp-${itemIndex}`)?.value || 0;
                document.getElementById('salesPrice').value =
                    document.getElementById(`salesPrice-${itemIndex}`)?.value || '';
                document.getElementById('currency').value =
                    document.getElementById(`currency-${itemIndex}`)?.value || '';
            } else {
                const itemId = document.querySelector(`input[name="items[${itemIndex}][item]"]`).value;
                const lastValues = await fetchLastItemsData(itemId);
                if (lastValues) {
                    document.getElementById('marginPercentage').value = lastValues.marginPercentage || 0;
                    document.getElementById('mrp').value = lastValues.mrp || 0;
                    document.getElementById('salesPrice').value = lastValues.price || 0;
                    document.getElementById('currency').value = lastValues.currency;
                }
            }

            document.getElementById('puPrice').value = puPrice;
            $('#setSalesPriceModal').modal('show');

            // Focus on CCPercentage when modal opens
            $('#setSalesPriceModal').on('shown.bs.modal', function () {
                document.getElementById('CCPercentage').focus();
            });

            // Function to update CC amount whenever puPrice, bonus, or CC% changes
            const updateCCAmount = () => {
                puPrice = parseFloat(puPriceInput.value) || 0;
                bonusQuantity = parseFloat(bonusInput.value) || 0;
                const currentCCPercentage = parseFloat(document.getElementById('CCPercentage').value) || 0;
                itemCCAmount = (puPrice * currentCCPercentage / 100) * bonusQuantity;
                document.getElementById('itemCCAmount').value = itemCCAmount.toFixed(2);
            };



            // Handle margin percentage input
            const marginPercentageInput = document.getElementById('marginPercentage');
            marginPercentageInput.oninput = function () {
                updateSalesPriceFromMargin(puPrice);
            };

            // Add Enter key event listener for marginPercentage input
            marginPercentageInput.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') {
                    updateSalesPriceFromMargin(puPrice);
                }
            });

            // Handle MRP input
            const mrpInput = document.getElementById('mrp');
            mrpInput.oninput = function () {
                updateSalesPriceFromMRP(mrpInput.value);
                updateMarginFromMRPAndSalesPrice(mrpInput.value, puPrice);
            };

            // Handle sales price input
            const salesPriceInput = document.getElementById('salesPrice');
            salesPriceInput.oninput = function () {
                updateMarginFromMRPAndSalesPrice(mrpInput.value, puPrice);
            };

            // Handle currency change
            const currencySelect = document.getElementById('currency');
            currencySelect.onchange = function () {
                updateSalesPriceFromMRP(mrpInput.value);
            };

            // Set up event listeners
            document.getElementById('CCPercentage').oninput = updateCCAmount;

            // Add listeners for puPrice and bonus changes while modal is open
            const modalPuPriceInput = document.getElementById('puPrice');
            const modalBonusInput = bonusInput;

            modalPuPriceInput.addEventListener('input', updateCCAmount);
            modalBonusInput.addEventListener('input', updateCCAmount);

            // Handle save action
            const saveSalesPriceButton = document.getElementById('saveSalesPrice');
            saveSalesPriceButton.onclick = function () {
                // Remove event listeners
                modalPuPriceInput.removeEventListener('input', updateCCAmount);
                modalBonusInput.removeEventListener('input', updateCCAmount);

                const salesPrice = document.getElementById('salesPrice').value;
                if (salesPrice) {
                    // First remove any existing hidden inputs
                    ['price', 'mrp', 'marginPercentage', 'currency', 'CCPercentage', 'itemCCAmount'].forEach(field => {
                        const existingInput = tr.querySelector(`input[name="items[${itemIndex}][${field}]"]`);
                        if (existingInput) existingInput.remove();
                    });

                    // Create new hidden inputs
                    const createHiddenInput = (name, value) => {
                        const input = document.createElement('input');
                        input.type = 'hidden';
                        input.name = `items[${itemIndex}][${name}]`;
                        input.value = value;
                        tr.appendChild(input);
                        return input;
                    };

                    createHiddenInput('price', document.getElementById('salesPrice').value);
                    createHiddenInput('mrp', document.getElementById('mrp').value);
                    createHiddenInput('marginPercentage', document.getElementById('marginPercentage').value);
                    createHiddenInput('currency', document.getElementById('currency').value);
                    createHiddenInput('CCPercentage', document.getElementById('CCPercentage').value);
                    createHiddenInput('itemCCAmount', document.getElementById('itemCCAmount').value);

                    // Close modal and update totals
                    $('#setSalesPriceModal').modal('hide');
                    document.getElementById('itemSearch').focus();

                    // Explicitly update the item total and recalculate
                    updateItemTotal(puPriceInput);
                    calculateTotal();
                } else {
                    alert('Please enter a valid sales price.');
                }
            };
        }
    }
}

function updateItemTotal(input) {
    const tr = input.closest('tr');
    const quantity = parseFloat(tr.querySelector('input.item-quantity').value) || 0;
    const bonus = parseFloat(tr.querySelector('.item-bonus').value) || 0;
    const puPrice = parseFloat(tr.querySelector('input.item-puPrice').value) || 0;

    const amount = quantity * puPrice;
    // Update the item's total amount
    tr.querySelector('.item-amount').textContent = amount.toFixed(2);


    // Recalculate CC if exists
    const ccPercentageInput = tr.querySelector('input[name$="[CCPercentage]"]');
    if (ccPercentageInput) {
        const ccPercentage = parseFloat(ccPercentageInput.value) || 0;
        const itemCCAmount = (puPrice * ccPercentage / 100) * bonus;
        const itemCCAmountInput = tr.querySelector('input[name$="[itemCCAmount]"]');
        if (itemCCAmountInput) {
            itemCCAmountInput.value = itemCCAmount.toFixed(2);
        }
    }

    // Recalculate total, discounts, and update live
    calculateTotal();
    updateDiscountFromPercentage(); // Ensure discount is updated live
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
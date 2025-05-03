// 1. SIMPLIFIED DATA STRUCTURE
const denominations = [
    { value: 2000, count: 0, amount: 0 },
    { value: 1000, count: 0, amount: 0 },
    { value: 500, count: 0, amount: 0 },
    { value: 200, count: 0, amount: 0 },
    { value: 100, count: 0, amount: 0 },
    { value: 50, count: 0, amount: 0 },
    { value: 20, count: 0, amount: 0 },
    { value: 10, count: 0, amount: 0 },
    { value: 5, count: 0, amount: 0 },
    { value: 2, count: 0, amount: 0 },
    { value: 1, count: 0, amount: 0 }
];

// Reset function to clear all values
function resetDenominations() {
    denominations.forEach(denom => {
        denom.count = 0;
        denom.amount = 0;
    });
}

// 2. MAIN FUNCTIONS
function openDenominationModal() {
    // Reset before opening to ensure clean state
    resetDenominations();
    generateDenominationInputs();
    $('#denominationModal').modal('show');
}

function generateDenominationInputs() {
    // Clear previous content
    const modalBody = $('.denomination-modal-body').empty();

    // Create table structure
    const table = $('<table>').addClass('table table-bordered');
    const thead = $('<thead>').addClass('thead-light');
    const tbody = $('<tbody>');
    const tfoot = $('<tfoot>');

    // Add header row
    thead.append(
        $('<tr>').append(
            $('<th>').text('Denomination'),
            $('<th>').text('Count'),
            $('<th>').text('Amount (रु)')
        )
    );

    // Add denomination rows
    denominations.forEach(denom => {
        const row = $('<tr>').append(
            $('<td>').text('रु' + denom.value),
            $('<td>').append(
                $('<input>')
                    .attr({
                        type: 'number',
                        min: '0',
                        id: 'denom-' + denom.value,
                        'data-value': denom.value
                    })
                    .addClass('form-control denomination-input')
                    .val(denom.count)
                    .on('keydown', function(e) {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation(); // Stop event from bubbling up
                            const next = $(this).closest('tr').next().find('.denomination-input');
                            if (next.length) {
                                next.focus().select();
                            } else {
                                $('#denominationModal .btn-primary').focus();
                            }
                        }
                    })
            ),
            $('<td>')
                .attr('id', 'amount-' + denom.value)
                .text(denom.amount.toFixed(2))
        );
        tbody.append(row);
    });

    // Add footer with total
    tfoot.append(
        $('<tr>').addClass('table-active').append(
            $('<th>').attr('colspan', '2').text('Total'),
            $('<th>').attr('id', 'denomination-total').text(
                denominations.reduce((sum, denom) => sum + denom.amount, 0).toFixed(2))
        )
    );

    // Assemble table
    table.append(thead, tbody, tfoot);

    // Create container and add to modal
    const container = $('<div>').addClass('row').append(
        $('<div>').addClass('col-md-8').append(table)
    );

    modalBody.append(container);
    setupEventListeners();
}

function setupEventListeners() {
    // Remove previous listeners to avoid duplicates
    $('.denomination-input').off('input');

    // Input event for live calculation
    $(document).on('input', '.denomination-input', function() {
        const value = parseInt($(this).data('value'));
        const count = parseInt($(this).val()) || 0;
        calculateDenomination(value, count);
    });
}

function calculateDenomination(value, count) {
    const amount = value * count;
    const denom = denominations.find(d => d.value === value);

    if (denom) {
        denom.count = count;
        denom.amount = amount;
        $('#amount-' + value).text(amount.toFixed(2));
        calculateTotal();
    }
}

function calculateTotal() {
    const total = denominations.reduce((sum, denom) => sum + denom.amount, 0);
    $('#denomination-total').text(total.toFixed(2));
}
function printDenominations() {
    calculateTotal();

    // Create a print-friendly HTML structure
    const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cash Denomination Report</title>
            <style>
                @page {
                    size: A5;
                    margin: 10mm;
                }
                body {
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                }
                .print-header {
                    text-align: center;
                    margin-bottom: 20px;
                }
                .print-header h2 {
                    margin: 0;
                    padding: 0;
                }
                .print-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .print-table th, .print-table td {
                    border: 1px solid #000;
                    padding: 5px;
                    text-align: left;
                }
                .print-table th {
                    background-color: #f2f2f2;
                }
                .print-total {
                    font-weight: bold;
                    text-align: right;
                }
                .print-footer {
                    margin-top: 20px;
                    text-align: right;
                }
                @media print {
                    body {
                        padding: 10mm;
                    }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h2>CASH DENOMINATION REPORT</h2>
                <p>Date: ${new Date().toLocaleDateString()}</p>
            </div>
            
            <table class="print-table">
                <thead>
                    <tr>
                        <th>Denomination</th>
                        <th>Count</th>
                        <th>Amount (रु)</th>
                    </tr>
                </thead>
                <tbody>
                    ${denominations.map(denom => `
                        <tr>
                            <td>रु${denom.value}</td>
                            <td>${denom.count}</td>
                            <td>${denom.amount.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" class="print-total">TOTAL:</td>
                        <td>रु${$('#denomination-total').text()}</td>
                    </tr>
                </tfoot>
            </table>
            
            <div class="print-footer">
                <p>Prepared by: _________________________</p>
                <p>Verified by: _________________________</p>
            </div>
        </body>
        </html>
    `;

    // Open a new window for printing
    const printWindow = window.open('', '_blank');
    printWindow.document.open();
    printWindow.document.write(printContent);
    printWindow.document.close();

    // Wait for content to load before printing
    printWindow.onload = function() {
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };
}

// 3. INITIALIZATION
$(document).ready(function() {
    // F10 key handler
    $(document).keydown(function(e) {
        if (e.key === 'F10') {
            e.preventDefault();
            openDenominationModal();
        }
    });

    // Click handler for denomination button
    $('#denominationButton').click(function(e) {
        e.preventDefault();
        openDenominationModal();
    });

    // Focus first input when modal opens
    $('#denominationModal').on('shown.bs.modal', function() {
        $('#denom-2000').focus().select();
    });

    // Reset values when modal is closed
    $('#denominationModal').on('hidden.bs.modal', function() {
        // Remove all event handlers specific to this modal
        $('.denomination-input').off('input keydown');
        // Use setTimeout to ensure the modal is fully closed before resetting
        setTimeout(resetDenominations, 300);
    });
});
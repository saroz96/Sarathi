$(document).ready(function () {
    $('#compositionModal').on('shown.bs.modal', function () {
        $('#searchCompositionInput').focus();
    });

    $('#relatedItemsModal').on('shown.bs.modal', function () {
        const firstItem = document.querySelector('#relatedItemsList .list-group-item');
        if (firstItem) {
            firstItem.focus();
        }
    });
});

document.addEventListener('DOMContentLoaded', function () {
    let compositions = [];
    let relatedItems = [];
    let allRelatedItems = []; // To store all related items for search functionality
    let currentCompositionFocus = 0;
    let currentItemFocus = 0;
    let allCompositions = [];
    const searchInput = document.getElementById('searchCompositionInput');
    const searchRelatedItemsInput = document.getElementById('searchRelatedItemsInput');

    // // Function to open composition modal with F6 key
    // document.addEventListener('keydown', function (event) {
    //     if (event.key === 'F6') {
    //         event.preventDefault();
    //         fetch('/api/compositions')
    //             .then(response => response.json())
    //             .then(data => {
    //                 allCompositions = data;
    //                 compositions = data;
    //                 displayCompositions(compositions);
    //                 $('#compositionModal').modal('show');
    //             })
    //             .catch(error => console.error('Error fetching composition details:', error));
    //     }
    // });


    function openCompositionModal() {
        fetch('/api/compositions')
            .then(response => response.json())
            .then(data => {
                allCompositions = data;
                compositions = data;
                displayCompositions(compositions);
                $('#compositionModal').modal('show');
            })
            .catch(error => console.error('Error fetching composition details:', error));
    }

    // F6 key listener
    document.addEventListener('keydown', function (event) {
        if (event.key === 'F6') {
            event.preventDefault();
            openCompositionModal();
        }
    });

    // Click listener for composition button
    document.getElementById('compositionButton').addEventListener('click', function (event) {
        event.preventDefault();
        openCompositionModal();
    });

    // Search functionality for compositions
    searchInput.addEventListener('input', function () {
        const searchQuery = this.value.toLowerCase();
        const filteredCompositions = allCompositions.filter(composition =>
            composition.name.toLowerCase().includes(searchQuery) ||
            (composition.uniqueNumber && composition.uniqueNumber.toString().toLowerCase().includes(searchQuery))
        );
        compositions = filteredCompositions;
        displayCompositions(compositions);
    });

    // Search functionality for related items
    searchRelatedItemsInput.addEventListener('input', function () {
        // Store the current focus state
        const isFocused = document.activeElement === searchRelatedItemsInput;
        const searchQuery = this.value.toLowerCase();
        const filteredItems = allRelatedItems.filter(item =>
            item.name.toLowerCase().includes(searchQuery) ||
            (item.uniqueNumber && item.uniqueNumber.toString().toLowerCase().includes(searchQuery)) ||
            (item.category?.name && item.category.name.toLowerCase().includes(searchQuery))
        );
        relatedItems = filteredItems;
        displayRelatedItems(relatedItems);

        // Restore focus if it was on the search input
        if (isFocused) {
            searchRelatedItemsInput.focus();
        }
    });

    // Update the related items modal shown event to focus on search input first
    $('#relatedItemsModal').on('shown.bs.modal', function () {
        searchRelatedItemsInput.focus(); // Focus on search input first

        // Then focus on first item if available
        const firstItem = document.querySelector('#relatedItemsList .list-group-item');
        if (firstItem) {
            firstItem.focus();
        }
    });

    function displayCompositions(compositions) {
        const list = document.getElementById('compositionDetailsList');
        list.innerHTML = '';
        currentCompositionFocus = 0;

        compositions.forEach((composition, index) => {
            const listItem = document.createElement('li');
            listItem.className = 'composition-row list-group-item';
            listItem.dataset.index = index;
            listItem.dataset.compositionId = composition._id;
            listItem.dataset.compositionName = composition.name;
            listItem.tabIndex = -1; // Make programmatically focusable but not via tab

            listItem.innerHTML = `
        <div class="composition-cell">${index + 1}</div>
        <div class="composition-cell">${composition.uniqueNumber || 'N/A'}</div>
        <div class="composition-cell composition-name">${composition.name}</div>
      `;

            listItem.addEventListener('click', () => {
                const compositionId = listItem.dataset.compositionId;
                const compositionName = listItem.dataset.compositionName;
                showRelatedItems(compositionId, compositionName);
            });

            list.appendChild(listItem);
        });

        highlightComposition(currentCompositionFocus);
    }

    function showRelatedItems(compositionId, compositionName) {
        document.getElementById('selectedCompositionName').textContent = compositionName;
        searchRelatedItemsInput.value = ''; // Clear previous search

        fetch(`/api/items?composition=${compositionId}`)
            .then(response => response.json())
            .then(items => {
                relatedItems = items;
                allRelatedItems = items; // Store all items for search functionality
                displayRelatedItems(relatedItems);

                $('#compositionModal').modal('hide');
                $('#relatedItemsModal').modal('show');
            })
            .catch(error => {
                console.error('Error fetching related items:', error);
                alert('Failed to load related items');
            });
    }

    function displayRelatedItems(items) {
        const itemsList = document.getElementById('relatedItemsList');
        itemsList.innerHTML = '';
        currentItemFocus = 0;

        if (items.length === 0) {
            itemsList.innerHTML = '<li class="list-group-item text-muted">No items found with this composition</li>';
            return;
        }

        items.forEach((item, index) => {
            const listItem = document.createElement('li');
            listItem.className = 'item-row list-group-item';
            listItem.dataset.index = index;
            listItem.tabIndex = 0;

            listItem.innerHTML = `
        <div class="item-cell">${index + 1}</div>
        <div class="item-cell">${item.uniqueNumber || 'N/A'}</div>
        <div class="item-cell item-name">${item.name}</div>
        <div class="item-cell">${item.category?.name || 'N/A'}</div>
      `;

            listItem.addEventListener('click', () => {
                ('Selected item:', item);
            });

            listItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    ('Selected item:', item);
                }
            });

            itemsList.appendChild(listItem);
        });

        highlightItem(currentItemFocus);
    }

    function highlightComposition(index) {
        const items = document.querySelectorAll('#compositionDetailsList .list-group-item');
        items.forEach(item => {
            item.classList.remove('active');
            item.style.backgroundColor = '';
            item.style.color = 'black';
        });

        if (items[index]) {
            items[index].classList.add('active');
            items[index].style.backgroundColor = '#518CE8';
            items[index].style.color = 'white';
            items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    function highlightItem(index) {
        const items = document.querySelectorAll('#relatedItemsList .list-group-item');
        items.forEach(item => {
            item.classList.remove('active');
            item.style.backgroundColor = '';
            item.style.color = 'black';
        });

        if (items[index]) {
            items[index].classList.add('active');
            items[index].style.backgroundColor = '#518CE8';
            items[index].style.color = 'white';
            items[index].focus();
            items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    // Global keyboard navigation handler
    document.addEventListener('keydown', function (event) {
        // Composition modal navigation
        if ($('#compositionModal').is(':visible')) {
            const items = document.querySelectorAll('#compositionDetailsList .list-group-item');

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                currentCompositionFocus = (currentCompositionFocus + 1) % items.length;
                highlightComposition(currentCompositionFocus);
                // Keep focus on search input
                searchInput.focus();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                currentCompositionFocus = (currentCompositionFocus - 1 + items.length) % items.length;
                highlightComposition(currentCompositionFocus);
                // Keep focus on search input
                searchInput.focus();
            } else if (event.key === 'Enter' && items[currentCompositionFocus]) {
                event.preventDefault();
                const compositionId = items[currentCompositionFocus].dataset.compositionId;
                const compositionName = items[currentCompositionFocus].dataset.compositionName;
                showRelatedItems(compositionId, compositionName);
            }
        }
        // Related items modal navigation
        else if ($('#relatedItemsModal').is(':visible')) {
            const items = document.querySelectorAll('#relatedItemsList .list-group-item');
            // Allow Ctrl+F or / to focus on search input
            if ((event.ctrlKey && event.key === 'f') || event.key === '/') {
                event.preventDefault();
                searchRelatedItemsInput.focus();
                return;
            }

            // If search input is focused, allow arrow keys to move to items
            if (document.activeElement === searchRelatedItemsInput) {
                if (event.key === 'ArrowDown' && items.length > 0) {
                    event.preventDefault();
                    currentItemFocus = 0;
                    highlightItem(currentItemFocus);
                    return;
                }
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                currentItemFocus = (currentItemFocus + 1) % items.length;
                highlightItem(currentItemFocus);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                currentItemFocus = (currentItemFocus - 1 + items.length) % items.length;
                highlightItem(currentItemFocus);
            } else if (event.key === 'Enter' && items[currentItemFocus]) {
                event.preventDefault();
                ('Selected item:', relatedItems[currentItemFocus]);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                $('#relatedItemsModal').modal('hide');
            }
        }
    });
});
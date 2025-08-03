// ======================
// --- Polyfills ---
// ======================
if (!window.requestIdleCallback) {
    window.requestIdleCallback = function(callback) {
        return setTimeout(() => callback({ timeRemaining: () => 16 }), 0);
    };
}

// ======================
// --- Global Variables & Constants ---
// ======================
const expenseCategories=[{id:'fuel',name:'Fuel',icon:'⛽'},{id:'maintenance',name:'Maintenance & Repairs',icon:'🔧'},{id:'meals',name:'Meals',icon:'🍽️'},{id:'lodging',name:'Lodging',icon:'🏨'},{id:'tolls',name:'Tolls & Parking',icon:'🛣️'},{id:'permits',name:'Permits & Licenses',icon:'📋'},{id:'insurance',name:'Insurance',icon:'🛡️'},{id:'phone',name:'Phone & Communication',icon:'📱'},{id:'supplies',name:'Supplies & Equipment',icon:'📦'},{id:'training',name:'Training & Education',icon:'📚'},{id:'medical',name:'Medical & DOT Exams',icon:'🏥'},{id:'office',name:'Office Expenses',icon:'🏢'},{id:'bank',name:'Bank & Financial Fees',icon:'🏦'},{id:'legal',name:'Legal & Professional',icon:'⚖️'},{id:'other',name:'Other Business Expenses',icon:'💼'}];

// State Variables
let expenses = JSON.parse(localStorage.getItem('truckerExpenses') || '[]');
let isDarkMode = localStorage.getItem('darkMode') === 'true';
let currentSection = 'today';
let isSubscribed = localStorage.getItem('isSubscribed') === 'true';

// Trial initialization
let trialStartDate = localStorage.getItem('trialStartDate');
if (!trialStartDate) {
    trialStartDate = Date.now().toString();
    localStorage.setItem('trialStartDate', trialStartDate);
}
let isTrialExpired = false;

// ======================
// --- DOMContentLoaded & Initialization ---
// ======================
document.addEventListener('DOMContentLoaded', function () {
    // Defer non-critical initialization
    requestIdleCallback(() => {
        // Register Service Worker for PWA functionality
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('SW registered:', registration);
                    // Check for updates every time the page loads
                    registration.update();
                })
                .catch(error => console.log('SW registration failed:', error));
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    // Reset trial logic (for URL ?reset=trial) 
    if (urlParams.get('reset') === 'trial') {
        localStorage.clear();
        sessionStorage.clear();
        location.reload();
        return;
    }

    // Critical path initialization
    initializeApp();

    // Defer subscription checks
    requestIdleCallback(() => {
        if (token) {
            localStorage.setItem('subscriptionToken', token);
            verifySubscriptionToken(token);
        } else {
            checkSubscriptionStatusFromServer();
        }
    });
});

// ======================
// --- App Initialization Logic ---
// ======================
function initializeApp() {
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        document.querySelector('.dark-mode-toggle').textContent = '☀️';
    }

    const currentExpenses = JSON.parse(localStorage.getItem('truckerExpenses') || '[]');
    if (currentExpenses.length === 0 && !localStorage.getItem('hasSeenWelcome')) {
        showWelcomeModal();
    }

    document.getElementById('closeWelcomeBtn').addEventListener('click', closeWelcomeModal);

    // Initialize the Already Subscribed feature
    initializeAlreadySubscribedFeature();

    // Clean up any corrupted data on startup
    cleanupCorruptedData();

    // Initialize enhanced validation system
    initializeEnhancedValidation();

    // Use the enhanced trial countdown function
    updateTrialCountdownWithAlreadySubscribed();

    populateExpenseGrid();
    updateToggleIcon();
    updateSummary();
    updateInsights();
    updateHistory();

    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    if (action === 'add-fuel') {
        showSection('today');
        setTimeout(() => toggleExpenseCard('fuel'), 500);
    } else if (action === 'insights') {
        showSection('insights');
    }

    // Debounced search functionality
    const expenseSearch = document.getElementById('expenseSearch');
    let searchTimeout;
    expenseSearch?.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filterExpenses();
        }, 300);
    });

    // Enhanced keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case 'n':
                    e.preventDefault();
                    showSection('today');
                    break;
                case 'h':
                    e.preventDefault();
                    showSection('history');
                    break;
                case 'i':
                    e.preventDefault();
                    showSection('insights');
                    break;
            }
        }

        if (e.key === 'Escape') {
            closeAllModals();
            // Close all options dropdowns
            document.querySelectorAll('.options-dropdown').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
        }
    });

    // Close options dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.expense-options')) {
            document.querySelectorAll('.options-dropdown').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
        }
    });

    // Initialize real-time validation
    setTimeout(() => {
        setInterval(() => {
            validateSubscriptionInBackground().catch(error => console.log('Background validation:', error));
        }, 5 * 60 * 1000); // Every 5 minutes
    }, 10000); // Start after 10 seconds

    // Handle service worker updates
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            // Service worker updated, reload to get fresh content
            window.location.reload();
        });

        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'INDEX_CACHE_CLEARED') {
                console.log('Cache cleared, reloading...');
                window.location.reload();
            }
            if (event.data && event.data.type === 'ALL_CACHE_CLEARED') {
                console.log('All cache cleared, reloading...');
                window.location.reload();
            }
        });
    }

    // Make cache clearing function available globally for debugging
    window.clearAppCache = async function() {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            console.log('Clearing all app cache...');
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHE' });
        } else {
            console.log('No service worker controller available');
        }
    };

    window.clearIndexCache = async function() {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            console.log('Clearing index cache...');
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_INDEX_CACHE' });
        } else {
            console.log('No service worker controller available');
        }
    };
}

// ======================
// --- Subscription Management ---
// ======================
async function checkSubscriptionStatusFromServer() {
    const token = localStorage.getItem('subscriptionToken');
    if (!token) {
        console.log('No subscription token found');
        return;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch('/api/check-subscription', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success && data.active) {
            localStorage.setItem('isSubscribed', 'true');
            isSubscribed = true;
            updateTrialCountdownWithAlreadySubscribed();
        }
    } catch (error) {
        console.log('Failed to check subscription status:', error);
    }
}

async function verifySubscriptionToken(token) {
    try {
        const response = await fetch('/api/verify-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success) {
            localStorage.setItem('isSubscribed', 'true');
            isSubscribed = true;
            showNotification('🎉 Pro subscription activated successfully!', 'success');
            updateTrialCountdownWithAlreadySubscribed();
        } else {
            showNotification(data.message || 'Failed to activate subscription', 'error');
        }
    } catch (error) {
        console.error('Token verification failed:', error);
        showNotification('Failed to verify subscription token', 'error');
    }
}

// Enhanced periodic validation
async function validateSubscriptionInBackground() {
    if (!isSubscribed) return;

    const token = localStorage.getItem('subscriptionToken');
    if (!token) return;

    try {
        const response = await fetch(`/api/validate-subscription?token=${token}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success && data.shouldDowngrade) {
            // Subscription is no longer active
            localStorage.setItem('isSubscribed', 'false');
            isSubscribed = false;
            updateTrialCountdownWithAlreadySubscribed();
            showNotification('⚠️ Subscription status changed. Please verify your account.', 'warning');
        }
    } catch (error) {
        console.log('Background validation failed:', error);
    }
}

// ======================
// --- Already Subscribed Feature ---
// ======================
function initializeAlreadySubscribedFeature() {
    const alreadySubscribedBtn = document.getElementById('alreadySubscribedBtn');
    const alreadySubscribedModal = document.getElementById('alreadySubscribedModal');
    const closeAlreadySubscribedBtn = document.getElementById('closeAlreadySubscribedBtn');
    const alreadySubscribedForm = document.getElementById('alreadySubscribedForm');

    if (alreadySubscribedBtn) {
        alreadySubscribedBtn.addEventListener('click', () => {
            alreadySubscribedModal.style.display = 'flex';
            setTimeout(() => {
                alreadySubscribedModal.classList.add('show');
            }, 10);
        });
    }

    if (closeAlreadySubscribedBtn) {
        closeAlreadySubscribedBtn.addEventListener('click', () => {
            alreadySubscribedModal.classList.remove('show');
            setTimeout(() => {
                alreadySubscribedModal.style.display = 'none';
            }, 300);
        });
    }

    if (alreadySubscribedForm) {
        alreadySubscribedForm.addEventListener('submit', handleAlreadySubscribedSubmit);
    }

    // Close modal when clicking outside
    if (alreadySubscribedModal) {
        alreadySubscribedModal.addEventListener('click', (e) => {
            if (e.target === alreadySubscribedModal) {
                closeAlreadySubscribedBtn.click();
            }
        });
    }
}

async function handleAlreadySubscribedSubmit(e) {
    e.preventDefault();

    const emailInput = document.getElementById('subscriberEmail');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const email = emailInput.value.trim();

    if (!email) {
        showNotification('Please enter your email address', 'error');
        return;
    }

    // Update button to show loading state
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Verifying...';
    submitBtn.disabled = true;
    submitBtn.style.background = '#6b7280';

    try {
        console.log('🔍 Submitting verification request for:', email);

        const response = await fetch('/api/verify-and-activate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email })
        });

        console.log('📡 Response status:', response.status);
        console.log('📡 Response ok:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.log('❌ Error response text:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Response data:', data);

        if (data.success) {
            // Store the token and activate subscription
            localStorage.setItem('subscriptionToken', data.token);
            localStorage.setItem('isSubscribed', 'true');
            isSubscribed = true;

            // Close modal
            document.getElementById('alreadySubscribedModal').classList.remove('show');
            setTimeout(() => {
                document.getElementById('alreadySubscribedModal').style.display = 'none';
            }, 300);

            // Show success message
            showNotification('🎉 Pro subscription activated successfully!', 'success');
            updateTrialCountdownWithAlreadySubscribed();

            // Clear form
            emailInput.value = '';
        } else {
            showNotification(data.message || 'Failed to verify subscription', 'error');
        }

    } catch (error) {
        console.log('💥 Verification request failed:', error);

        // More specific error messages
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showNotification('Network error: Unable to connect to server. Check your connection.', 'error');
        } else if (error.name === 'SyntaxError') {
            showNotification('Server response error: Invalid data received.', 'error');
        } else {
            showNotification(`Failed to verify subscription: ${error.message || 'Unknown error'}. Please try again.`, 'error');
        }
    } finally {
        // Reset button state
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.style.background = '';
    }
}

// ======================
// --- Enhanced Validation System ---
// ======================
function initializeEnhancedValidation() {
    // Validate subscription every 15 minutes
    setInterval(async () => {
        try {
            await validateSubscriptionInBackground();
        } catch (error) {
            console.log('Periodic validation error:', error);
        }
    }, 15 * 60 * 1000);

    // Validate on page focus (when user returns to tab)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isSubscribed) {
            setTimeout(() => {
                validateSubscriptionInBackground().catch(error => 
                    console.log('Focus validation error:', error)
                );
            }, 2000);
        }
    });
}

// ======================
// --- Trial Management ---
// ======================
function updateTrialCountdownWithAlreadySubscribed() {
    const trialSection = document.getElementById('trialSection');
    const upgradeButtons = document.querySelectorAll('.upgrade-btn');
    const alreadySubscribedBtn = document.getElementById('alreadySubscribedBtn');

    if (isSubscribed) {
        // Hide trial section and upgrade buttons for subscribers
        if (trialSection) trialSection.style.display = 'none';
        upgradeButtons.forEach(btn => btn.style.display = 'none');
        if (alreadySubscribedBtn) alreadySubscribedBtn.style.display = 'none';
        return;
    }

    // Show elements for trial users
    if (trialSection) trialSection.style.display = 'block';
    upgradeButtons.forEach(btn => btn.style.display = 'inline-block');
    if (alreadySubscribedBtn) alreadySubscribedBtn.style.display = 'inline-block';

    const trialStart = parseInt(trialStartDate);
    const trialDuration = 3 * 24 * 60 * 60 * 1000; // 3 days
    const trialEnd = trialStart + trialDuration;
    const now = Date.now();
    const timeLeft = trialEnd - now;

    if (timeLeft <= 0) {
        isTrialExpired = true;
        const trialInfo = document.getElementById('trialInfo');
        if (trialInfo) {
            trialInfo.innerHTML = `
                <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 12px; color: white;">
                    <h3 style="margin: 0 0 10px 0;">⏰ Trial Expired</h3>
                    <p style="margin: 0 0 15px 0;">Your 3-day trial has ended. Upgrade to continue using all features!</p>
                    <button onclick="window.open('https://buy.stripe.com/5kAdRF0Qq3Fo9lS4gg', '_blank')" class="upgrade-btn" style="background: white; color: #ef4444; border: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer;">Upgrade to Pro</button>
                </div>
            `;
        }
        return;
    }

    // Show countdown
    const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
    const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

    const trialInfo = document.getElementById('trialInfo');
    if (trialInfo) {
        trialInfo.innerHTML = `
            <div style="text-align: center; padding: 15px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; color: white;">
                <h3 style="margin: 0 0 10px 0;">⏰ Free Trial</h3>
                <p style="margin: 0 0 10px 0; font-size: 18px; font-weight: bold;">${days}d ${hours}h ${minutes}m remaining</p>
                <p style="margin: 0 0 15px 0; font-size: 14px;">Enjoying the app? Upgrade to Pro for unlimited access!</p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="window.open('https://buy.stripe.com/5kAdRF0Qq3Fo9lS4gg', '_blank')" class="upgrade-btn" style="background: white; color: #f59e0b; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px;">Upgrade to Pro</button>
                    <button id="alreadySubscribedBtn" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px;">Already Subscribed?</button>
                </div>
            </div>
        `;

        // Re-initialize the already subscribed button
        const newAlreadySubscribedBtn = document.getElementById('alreadySubscribedBtn');
        if (newAlreadySubscribedBtn) {
            newAlreadySubscribedBtn.addEventListener('click', () => {
                const modal = document.getElementById('alreadySubscribedModal');
                if (modal) {
                    modal.style.display = 'flex';
                    setTimeout(() => {
                        modal.classList.add('show');
                    }, 10);
                }
            });
        }
    }
}

// ======================
// --- Data Cleanup Functions ---
// ======================
function cleanupCorruptedData() {
    try {
        let expenses = JSON.parse(localStorage.getItem('truckerExpenses') || '[]');
        let hasChanges = false;

        expenses = expenses.map(ex => {
            const originalEx = { ...ex };

            // Fix undefined/null values
            if (!ex.categoryName || ex.categoryName === 'undefined' || ex.categoryName === null) {
                if (ex.categoryId) {
                    const category = expenseCategories.find(cat => cat.id === ex.categoryId);
                    if (category) {
                        ex.categoryName = category.name;
                        ex.categoryIcon = category.icon;
                        hasChanges = true;
                    }
                }
                if (!ex.categoryName || ex.categoryName === 'undefined') {
                    ex.categoryName = 'Other Business Expenses';
                    ex.categoryIcon = '💼';
                    hasChanges = true;
                }
            }

            // Ensure all required fields exist
            if (!ex.categoryIcon || ex.categoryIcon === 'undefined') {
                ex.categoryIcon = '💼';
                hasChanges = true;
            }

            if (typeof ex.amount !== 'number' || isNaN(ex.amount)) {
                ex.amount = 0;
                hasChanges = true;
            }

            if (!ex.date || ex.date === 'undefined') {
                ex.date = new Date().toISOString().split('T')[0];
                hasChanges = true;
            }

            if (ex.description === 'undefined' || ex.description === null) {
                ex.description = '';
                hasChanges = true;
            }

            return ex;
        });

        if (hasChanges) {
            localStorage.setItem('truckerExpenses', JSON.stringify(expenses));
            console.log('Data cleanup completed - fixed corrupted entries');
        }

        // Update global expenses variable
        window.expenses = expenses;

    } catch (error) {
        console.error('Error during data cleanup:', error);
        // Reset to empty array if data is completely corrupted
        localStorage.setItem('truckerExpenses', '[]');
        window.expenses = [];
    }
}

// ======================
// --- Expense Management ---
// ======================
function populateExpenseGrid() {
    const grid = document.getElementById('expenseGrid');
    if (!grid) return;

    grid.innerHTML = ''; // Clear existing grid

    const today = new Date().toISOString().split('T')[0];
    const fragment = document.createDocumentFragment();

    expenseCategories.forEach(category => {
        const card = document.createElement('div');
        card.className = 'expense-card';
        card.dataset.category = category.id;
        card.onclick = () => toggleExpenseCard(category.id);
        card.innerHTML = `
            <div class="expense-header">
                <div class="expense-icon">${category.icon}</div>
                <div class="expense-title">${category.name}</div>
            </div>
            <div class="expense-form" id="form-${category.id}" style="display: none;">
                <input type="number" id="amount-${category.id}" placeholder="Amount ($)" step="0.01" min="0" required>
                <input type="text" id="description-${category.id}" placeholder="Description (optional)">
                <input type="date" id="date-${category.id}" value="${today}" required>
                <input type="file" id="receipt-${category.id}" accept="image/*" class="receipt-input">
                <div class="form-buttons">
                    <button type="button" onclick="addExpense('${category.id}')" class="btn-primary">Add Expense</button>
                    <button type="button" onclick="toggleExpenseCard('${category.id}')" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;
        fragment.appendChild(card);
    });

    grid.appendChild(fragment);
}

function toggleExpenseCard(categoryId) {
    const card = document.querySelector(`[data-category="${categoryId}"]`);
    const form = document.getElementById(`form-${categoryId}`);

    if (!card || !form) return;

    const isActive = card.classList.contains('active');

    // Close all other cards
    document.querySelectorAll('.expense-card').forEach(c => {
        c.classList.remove('active');
        const otherCategoryId = c.dataset.category;
        const otherForm = document.getElementById(`form-${otherCategoryId}`);
        if (otherForm) {
            otherForm.style.display = 'none';
        }
    });

    if (!isActive) {
        card.classList.add('active');
        form.style.display = 'block';
        // Focus on amount input
        setTimeout(() => {
            const amountInput = document.getElementById(`amount-${categoryId}`);
            if (amountInput) amountInput.focus();
        }, 100);
    } else {
        form.style.display = 'none';
    }
}

function addExpense(categoryId) {
    const amountInput = document.getElementById(`amount-${categoryId}`);
    const descriptionInput = document.getElementById(`description-${categoryId}`);
    const dateInput = document.getElementById(`date-${categoryId}`);
    const receiptInput = document.getElementById(`receipt-${categoryId}`);

    // Find the add button and show loading state
    const addButton = document.querySelector(`[data-category="${categoryId}"] .btn-primary`);
    const originalText = addButton.textContent;
    addButton.textContent = 'Adding...';
    addButton.disabled = true;

    const amount = parseFloat(amountInput.value);
    const description = descriptionInput.value.trim();
    const date = dateInput.value;

    if (!amount || amount <= 0 || amount > 99999.99) {
        showNotification('Please enter a valid amount between $0.01 and $99,999.99', 'error');
        amountInput.focus();
        return;
    }

    if (description.length > 200) {
        showNotification('Description must be 200 characters or less', 'error');
        descriptionInput.focus();
        return;
    }

    if (!date) {
        showNotification('Please select a date', 'error');
        dateInput.focus();
        return;
    }

    const category = expenseCategories.find(cat => cat.id === categoryId);
    const expense = {
        id: Date.now() + Math.random(),
        categoryId: categoryId,
        categoryName: category.name,
        categoryIcon: category.icon,
        amount: amount,
        description: description || '',
        date: date,
        timestamp: Date.now()
    };

    // Handle receipt image
    if (receiptInput.files && receiptInput.files[0]) {
        const file = receiptInput.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            expense.receipt = e.target.result;
            saveExpense(expense);
        };
        reader.readAsDataURL(file);
    } else {
        saveExpense(expense);
    }

    function saveExpense(expenseData) {
        expenses.push(expenseData);
        localStorage.setItem('truckerExpenses', JSON.stringify(expenses));

        // Reset form
        amountInput.value = '';
        descriptionInput.value = '';
        receiptInput.value = '';
        dateInput.value = new Date().toISOString().split('T')[0];

        // Close card
        document.querySelector(`[data-category="${categoryId}"]`).classList.remove('active');
        document.getElementById(`form-${categoryId}`).style.display = 'none';

        // Update displays
        updateSummary();
        updateInsights();
        updateHistory();

        showNotification(`${category.name} expense added successfully!`, 'success');
    }

    // Reset add button
    addButton.textContent = originalText;
    addButton.disabled = false;
}

function updateSummary(){const today=new Date().toISOString().split('T')[0];const todayExpenses=expenses.filter(ex=>ex.date===today);const totalExpenses=expenses.reduce((sum,ex)=>sum+ex.amount,0);const todayTotal=todayExpenses.reduce((sum,ex)=>sum+ex.amount,0);const dailyEl=document.getElementById('dailyTotal');const totalEl=document.getElementById('totalExpenses');if(dailyEl)dailyEl.textContent=`$${todayTotal.toFixed(2)}`;if(totalEl)totalEl.textContent=`$${totalExpenses.toFixed(2)}`;}

function updateInsights(){const total=expenses.reduce((s,e)=>s+e.amount,0);const days=[...new Set(expenses.map(e=>new Date(e.date).toDateString()))].length;const avgDaily=days>0?total/days:0;const catTotals={};expenses.forEach(e=>{catTotals[e.categoryName]=(catTotals[e.categoryName]||0)+e.amount});const topCat=Object.keys(catTotals).reduce((a,b)=>catTotals[a]>catTotals[b]?a:b,'None');const now=new Date();const curMonth=now.getMonth();const curYear=now.getFullYear();const lastMonthDate=new Date(now.getFullYear(),now.getMonth()-1,1);const lastMonth=lastMonthDate.getMonth();const lastYear=lastMonthDate.getFullYear();const curMonthExp=expenses.filter(e=>{const d=new Date(e.date);return d.getMonth()===curMonth&&d.getFullYear()===curYear}).reduce((s,e)=>s+e.amount,0);const lastMonthExp=expenses.filter(e=>{const d=new Date(e.date);return d.getMonth()===lastMonth&&d.getFullYear()===lastYear}).reduce((s,e)=>s+e.amount,0);const change=lastMonthExp>0?((curMonthExp-lastMonthExp)/lastMonthExp*100).toFixed(1):(curMonthExp>0?'∞':'0');const elements={'insightsTotalExpenses':`$${total.toFixed(2)}`,'averageDailyExpense':`$${avgDaily.toFixed(2)}`,'topCategory':topCat,'currentMonthTotal':`$${curMonthExp.toFixed(2)}`,'lastMonthTotal':`$${lastMonthExp.toFixed(2)}`};Object.entries(elements).forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.textContent=val});const changeEl=document.getElementById('monthlyChange');if(changeEl){if(change==='∞'){changeEl.textContent='New spending';changeEl.style.color='#fbbf24'}else if(change==='0'){changeEl.textContent='No change';changeEl.style.color='#6b7280'}else{const changeVal=parseFloat(change);changeEl.textContent=`${changeVal>0?'+':''}${changeVal}%`;changeEl.style.color=changeVal>0?'#ef4444':'#10b981'}}}

function updateHistory() {
    const historyList = document.getElementById('historyList');
    const searchTerm = document.getElementById('expenseSearch')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';
    const sortBy = document.getElementById('sortBy')?.value || 'date-desc';

    if (!historyList) return;

    // Comprehensive data validation and cleaning
    expenses = expenses.filter(ex => {
        return ex && 
               typeof ex === 'object' && 
               ex.id && 
               (typeof ex.amount === 'number' || !isNaN(parseFloat(ex.amount)));
    }).map(ex => {
        // Find the category for this expense with multiple fallback strategies
        let categoryData = null;
        
        // Try to find by categoryId first
        if (ex.categoryId && ex.categoryId !== 'undefined' && ex.categoryId !== 'null') {
            categoryData = expenseCategories.find(cat => cat.id === ex.categoryId);
        }
        
        // Fallback: try to find by categoryName
        if (!categoryData && ex.categoryName && ex.categoryName !== 'undefined' && ex.categoryName !== 'null') {
            categoryData = expenseCategories.find(cat => cat.name === ex.categoryName);
        }
        
        // Final fallback: use default category
        if (!categoryData) {
            categoryData = { id: 'other', name: 'Other Business Expenses', icon: '💼' };
        }

        // Ensure all fields are properly validated and never undefined/null
        const cleanExpense = {
            id: ex.id,
            categoryId: categoryData.id,
            categoryName: categoryData.name,
            categoryIcon: categoryData.icon,
            amount: parseFloat(ex.amount) || 0,
            date: (ex.date && 
                   typeof ex.date === 'string' && 
                   ex.date !== 'undefined' && 
                   ex.date !== 'null' && 
                   ex.date.trim().length > 0) ? ex.date : new Date().toISOString().split('T')[0],
            description: (ex.description && 
                         typeof ex.description === 'string' && 
                         ex.description !== 'undefined' && 
                         ex.description !== 'null') ? ex.description.trim() : '',
            timestamp: ex.timestamp || Date.now(),
            receipt: (ex.receipt && 
                     typeof ex.receipt === 'string' && 
                     ex.receipt !== 'undefined' && 
                     ex.receipt !== 'null' && 
                     ex.receipt.startsWith('data:')) ? ex.receipt : null
        };
        
        return cleanExpense;
    });

    // Save cleaned data back to localStorage
    localStorage.setItem('truckerExpenses', JSON.stringify(expenses));

    let filteredExpenses = expenses.filter(ex => {
        const matchesSearch = !searchTerm || 
            ex.categoryName.toLowerCase().includes(searchTerm) ||
            ex.description.toLowerCase().includes(searchTerm);
        const matchesCategory = categoryFilter === 'all' || ex.categoryId === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    // Sort expenses
    filteredExpenses.sort((a, b) => {
        switch(sortBy) {
            case 'date-desc': return new Date(b.date) - new Date(a.date);
            case 'date-asc': return new Date(a.date) - new Date(b.date);
            case 'amount-desc': return b.amount - a.amount;
            case 'amount-asc': return a.amount - b.amount;
            case 'category': return a.categoryName.localeCompare(b.categoryName);
            default: return new Date(b.date) - new Date(a.date);
        }
    });

    if (filteredExpenses.length === 0) {
        historyList.innerHTML = '<div class="no-data-message">No expenses found matching your criteria.</div>';
        return;
    }

    // Generate HTML with comprehensive validation to prevent any undefined values
    historyList.innerHTML = filteredExpenses.map(ex => {
        // Triple-check all values to ensure no undefined strings appear
        const safeIcon = (ex.categoryIcon && 
                         typeof ex.categoryIcon === 'string' && 
                         ex.categoryIcon.trim() !== '' && 
                         ex.categoryIcon !== 'undefined' && 
                         ex.categoryIcon !== 'null') ? ex.categoryIcon : '💼';
                         
        const safeName = (ex.categoryName && 
                         typeof ex.categoryName === 'string' && 
                         ex.categoryName.trim() !== '' && 
                         ex.categoryName !== 'undefined' && 
                         ex.categoryName !== 'null') ? ex.categoryName : 'Other Business Expenses';
                         
        const safeDate = (ex.date && 
                         typeof ex.date === 'string' && 
                         ex.date !== 'undefined' && 
                         ex.date !== 'null' && 
                         ex.date.trim() !== '') ? 
                         new Date(ex.date).toLocaleDateString() : 
                         new Date().toLocaleDateString();
                         
        const safeAmount = (typeof ex.amount === 'number' && !isNaN(ex.amount)) ? 
                          ex.amount.toFixed(2) : '0.00';
                          
        const safeDescription = (ex.description && 
                               typeof ex.description === 'string' && 
                               ex.description !== 'undefined' && 
                               ex.description !== 'null' && 
                               ex.description.trim() !== '') ? 
                               ex.description.trim() : '';
                               
        const safeReceipt = (ex.receipt && 
                           typeof ex.receipt === 'string' && 
                           ex.receipt !== 'undefined' && 
                           ex.receipt !== 'null' && 
                           ex.receipt.startsWith('data:')) ? ex.receipt : null;
        
        return `
        <li class="history-item">
            <div class="history-header">
                <span class="history-icon">${safeIcon}</span>
                <div class="history-info">
                    <div class="history-category">${safeName}</div>
                    <div class="history-date">${safeDate}</div>
                </div>
                <div class="history-amount">$${safeAmount}</div>
            </div>
            ${safeDescription ? `<div class="history-description">${safeDescription}</div>` : ''}
            ${safeReceipt ? `<div class="receipt-preview"><img src="${safeReceipt}" class="receipt-image" alt="Receipt"></div>` : ''}
            <div class="expense-options">
                <button onclick="toggleExpenseOptions('${ex.id}')" class="btn-options">⋯ Options</button>
                <div class="options-dropdown" id="options-${ex.id}">
                    <button onclick="editExpense('${ex.id}')" class="btn-edit">✏️ Edit</button>
                    <button onclick="deleteExpense('${ex.id}')" class="btn-delete-small">🗑️ Delete</button>
                </div>
            </div>
        </li>
        `;
    }).join('');

    // Remove any standalone delete buttons that might have been accidentally created
    setTimeout(() => {
        document.querySelectorAll('.history-item .btn-delete:not(.options-dropdown .btn-delete-small)').forEach(btn => {
            btn.remove();
        });
    }, 100);
}

function toggleExpenseOptions(expenseId) {
    const dropdown = document.getElementById(`options-${expenseId}`);
    const allDropdowns = document.querySelectorAll('.options-dropdown');

    // Close all other dropdowns
    allDropdowns.forEach(dd => {
        if (dd.id !== `options-${expenseId}`) {
            dd.classList.remove('show');
        }
    });

    // Toggle current dropdown
    dropdown.classList.toggle('show');
}

function editExpense(expenseId) {
    const expense = expenses.find(ex => ex.id == expenseId);
    if (!expense) return;

    // Close options dropdown
    document.getElementById(`options-${expenseId}`).classList.remove('show');

    // Create edit modal
    const modal = document.createElement('div');
    modal.className = 'modal edit-expense-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>✏️ Edit Expense</h3>
                <button onclick="this.closest('.modal').remove()" class="modal-close">×</button>
            </div>
            <form id="editExpenseForm" onsubmit="saveExpenseEdit(event, '${expenseId}')">
                <div class="form-group">
                    <label for="editAmount">Amount ($)</label>
                    <input type="number" id="editAmount" value="${expense.amount}" step="0.01" min="0" max="99999.99" required>
                </div>
                <div class="form-group">
                    <label for="editDescription">Description</label>
                    <input type="text" id="editDescription" value="${expense.description}" maxlength="200">
                </div>
                <div class="form-group">
                    <label for="editDate">Date</label>
                    <input type="date" id="editDate" value="${expense.date}" required>
                </div>
                <div class="form-group">
                    <label for="editCategory">Category</label>
                    <select id="editCategory" required>
                        ${expenseCategories.map(cat => 
                            `<option value="${cat.id}" ${cat.id === expense.categoryId ? 'selected' : ''}>${cat.icon} ${cat.name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-buttons">
                    <button type="submit" class="btn-primary">💾 Save Changes</button>
                    <button type="button" onclick="this.closest('.modal').remove()" class="btn-secondary">Cancel</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    modal.style.display = 'flex';
    modal.classList.add('show');
    setTimeout(() => {
        // Focus on amount input after modal is fully rendered
        const amountInput = document.getElementById('editAmount');
        if (amountInput) amountInput.focus();
    }, 100);

    // Focus on amount input
    document.getElementById('editAmount').focus();
}

function saveExpenseEdit(event, expenseId) {
    event.preventDefault();

    const amount = parseFloat(document.getElementById('editAmount').value);
    const description = document.getElementById('editDescription').value.trim();
    const date = document.getElementById('editDate').value;
    const categoryId = document.getElementById('editCategory').value;

    if (!amount || amount <= 0 || amount > 99999.99) {
        showNotification('Please enter a valid amount between $0.01 and $99,999.99', 'error');
        return;
    }

    if (description.length > 200) {
        showNotification('Description must be 200 characters or less', 'error');
        return;
    }

    if (!date) {
        showNotification('Please select a date', 'error');
        return;
    }

    // Find and update the expense
    const expenseIndex = expenses.findIndex(ex => ex.id == expenseId);
    if (expenseIndex === -1) return;

    const category = expenseCategories.find(cat => cat.id === categoryId);

    expenses[expenseIndex] = {
        ...expenses[expenseIndex],
        amount: amount,
        description: description,
        date: date,
        categoryId: categoryId,
        categoryName: category.name,
        categoryIcon: category.icon
    };

    localStorage.setItem('truckerExpenses', JSON.stringify(expenses));

    // Update displays
    updateSummary();
    updateInsights();
    updateHistory();

    // Close modal
    event.target.closest('.modal').remove();

    showNotification('Expense updated successfully!', 'success');
}

function deleteExpense(expenseId) {
    // Close options dropdown
    const dropdown = document.getElementById(`options-${expenseId}`);
    if (dropdown) {
        dropdown.classList.remove('show');
    }

    if (confirm('Are you sure you want to delete this expense?')) {
        expenses = expenses.filter(ex => ex.id != expenseId);
        localStorage.setItem('truckerExpenses', JSON.stringify(expenses));
        updateSummary();
        updateInsights();
        updateHistory();
        showNotification('Expense deleted successfully!', 'success');
    }
}

function filterExpenses() {
    updateHistory();
}

// ======================
// --- Navigation & UI ---
// ======================
function showSection(sectionName) {
    document.querySelectorAll('.section').forEach(section => section.classList.add('hidden'));
    document.getElementById(`${sectionName}Section`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-section="${sectionName}"]`)?.classList.add('active');
    currentSection = sectionName;

    if (sectionName === 'history') {
        updateHistory();
    } else if (sectionName === 'insights') {
        updateInsights();
    }
}

function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);
    updateToggleIcon();
}

function updateToggleIcon() {
    const toggle = document.querySelector('.dark-mode-toggle');
    if (toggle) {
        toggle.textContent = isDarkMode ? '☀️' : '🌙';
    }
}

// ======================
// --- Utility Functions ---
// ======================
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type] || colors.info};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: 500;
        max-width: 300px;
        word-wrap: break-word;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

function showWelcomeModal() {
    const modal = document.getElementById('welcomeModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }
}

function closeWelcomeModal() {
    const modal = document.getElementById('welcomeModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            localStorage.setItem('hasSeenWelcome', 'true');
        }, 300);
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    });
}

// CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Initialize countdown updates
setInterval(updateTrialCountdownWithAlreadySubscribed, 60000); // Update every minute
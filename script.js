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
                .then(registration => console.log('SW registered:', registration))
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

    // Initialize enhanced validation system
    initializeEnhancedValidation();

    // Use the enhanced trial countdown function
    updateTrialCountdownWithAlreadySubscribed();

    populateExpenseGrid();
    updateToggleIcon();
    updateSummary();
    updateInsights();

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
        }
    });

    // Initialize real-time validation
    setTimeout(() => {
        setInterval(() => {
            validateSubscriptionInBackground().catch(error => console.log('Background validation:', error));
        }, 5 * 60 * 1000); // Every 5 minutes
    }, 10000); // Start after 10 seconds
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
// --- Expense Management ---
// ======================
function populateExpenseGrid() {
    const grid = document.getElementById('expenseGrid');
    if (!grid) return;

    const today = new Date().toISOString().split('T')[0];
    const fragment = document.createDocumentFragment();

    expenseCategories.forEach(category => {
        const card = document.createElement('div');
        card.className = 'expense-card';
        card.dataset.category = category.id;
        card.onclick = (e) => {
            // Don't toggle if clicking inside the form
            if (e.target.closest('.expense-form')) return;
            toggleExpenseCard(category.id);
        };
        card.innerHTML = `
            <div class="expense-header">
                <div class="expense-icon">${category.icon}</div>
                <div class="expense-title">${category.name}</div>
            </div>
            <div class="expense-form" id="form-${category.id}">
                <div class="form-group">
                    <input type="number" id="amount-${category.id}" placeholder="Amount ($)" step="0.01" min="0" required>
                </div>
                <div class="form-group">
                    <input type="text" id="description-${category.id}" placeholder="Description (optional)">
                </div>
                <div class="form-group">
                    <input type="text" id="location-${category.id}" placeholder="Location (City, State)">
                </div>
                <div class="form-group">
                    <input type="file" id="receipt-${category.id}" accept="image/*" class="receipt-input">
                </div>
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

    const isExpanded = card.classList.contains('expanded');

    // Close all other cards
    document.querySelectorAll('.expense-card').forEach(c => {
        c.classList.remove('expanded');
    });

    if (!isExpanded) {
        card.classList.add('expanded');
        // Focus on amount input after a short delay
        setTimeout(() => {
            const amountInput = document.getElementById(`amount-${categoryId}`);
            if (amountInput) amountInput.focus();
        }, 150);
    }
}

function addExpense(categoryId) {
    const amountInput = document.getElementById(`amount-${categoryId}`);
    const descriptionInput = document.getElementById(`description-${categoryId}`);
    const locationInput = document.getElementById(`location-${categoryId}`);
    const receiptInput = document.getElementById(`receipt-${categoryId}`);

    // Find the add button and show loading state
    const addButton = document.querySelector(`[data-category="${categoryId}"] .btn-primary`);
    const originalText = addButton.textContent;
    addButton.textContent = 'Adding...';
    addButton.disabled = true;

    const amount = parseFloat(amountInput.value);
    const description = descriptionInput.value.trim();
    const location = locationInput.value.trim();

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

    if (location.length > 100) {
        showNotification('Location must be 100 characters or less', 'error');
        locationInput.focus();
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
        location: location || '',
        date: new Date().toISOString().split('T')[0], // Keep today's date implicitly
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
        locationInput.value = '';
        receiptInput.value = '';

        // Close card
        const card = document.querySelector(`[data-category="${categoryId}"]`);
        if (card) card.classList.remove('expanded');

        // Update displays
        updateSummary();
        updateInsights();
        updateHistory();

        showNotification(`${category.name} expense added successfully!`, 'success');
    }
}

function updateSummary(){const today=new Date().toISOString().split('T')[0];const todayExpenses=expenses.filter(ex=>ex.date===today);const totalExpenses=expenses.reduce((sum,ex)=>sum+ex.amount,0);const todayTotal=todayExpenses.reduce((sum,ex)=>sum+ex.amount,0);const dailyEl=document.getElementById('dailyTotal');const totalEl=document.getElementById('totalExpenses');if(dailyEl)dailyEl.textContent=`$${todayTotal.toFixed(2)}`;if(totalEl)totalEl.textContent=`$${totalExpenses.toFixed(2)}`;}

function updateInsights() {
    const totalExpenses = expenses.reduce((sum, ex) => sum + ex.amount, 0);
    const uniqueDays = [...new Set(expenses.map(ex => new Date(ex.date).toDateString()))].length;
    const averageDaily = uniqueDays > 0 ? totalExpenses / uniqueDays : 0;

    // Calculate category totals
    const categoryTotals = {};
    expenses.forEach(ex => {
        categoryTotals[ex.categoryName] = (categoryTotals[ex.categoryName] || 0) + ex.amount;
    });

    const topCategory = Object.keys(categoryTotals).reduce((a, b) => categoryTotals[a] > categoryTotals[b] ? a : b, 'None');

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastMonthYear = lastMonthDate.getFullYear();

    const currentMonthExpenses = expenses.filter(ex => {
        const d = new Date(ex.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).reduce((sum, ex) => sum + ex.amount, 0);

    const lastMonthExpenses = expenses.filter(ex => {
        const d = new Date(ex.date);
        return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
    }).reduce((sum, ex) => sum + ex.amount, 0);

    const monthlyChange = lastMonthExpenses > 0 ? ((currentMonthExpenses - lastMonthExpenses) / lastMonthExpenses * 100).toFixed(1) : (currentMonthExpenses > 0 ? '∞' : '0');

    // Update DOM elements
    const elements = {
        'insightsTotalExpenses': `$${totalExpenses.toFixed(2)}`,
        'averageDailyExpense': `$${averageDaily.toFixed(2)}`,
        'topCategory': topCategory,
        'currentMonthTotal': `$${currentMonthExpenses.toFixed(2)}`,
        'lastMonthTotal': `$${lastMonthExpenses.toFixed(2)}`
    };

    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });

    const changeElement = document.getElementById('monthlyChange');
    if (changeElement) {
        if (monthlyChange === '∞') {
            changeElement.textContent = 'New spending';
            changeElement.style.color = '#fbbf24';
        } else if (monthlyChange === '0') {
            changeElement.textContent = 'No change';
            changeElement.style.color = '#6b7280';
        } else {
            const changeValue = parseFloat(monthlyChange);
            changeElement.textContent = `${changeValue > 0 ? '+' : ''}${changeValue}%`;
            changeElement.style.color = changeValue > 0 ? '#ef4444' : '#10b981';
        }
    }

    // Update category and monthly breakdowns
    updateCategoryBreakdown(categoryTotals);
    updateMonthlyBreakdown();
}

function updateCategoryBreakdown(categoryTotals) {
    const categoryList = document.getElementById('categoryList');

    if (!categoryList) return;

    if (Object.keys(categoryTotals).length === 0) {
        categoryList.innerHTML = '<p class="no-data-message">No expense data available for analysis.</p>';
        return;
    }

    const sortedCategories = Object.entries(categoryTotals)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

    const totalAmount = Object.values(categoryTotals).reduce((sum, amount) => sum + amount, 0);

    const content = sortedCategories.map(([categoryName, amount]) => {
        const percentage = totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(1) : '0';
        const categoryData = expenseCategories.find(cat => cat.name === categoryName);
        const icon = categoryData ? categoryData.icon : '💼';

        return `
            <li class="category-breakdown-item">
                <div class="summary-item" style="padding: 15px 0; border-bottom: 1px solid var(--border-light); align-items: center;">
                    <span style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.5rem;">${icon}</span>
                        <div>
                            <div style="font-weight: 600; margin-bottom: 2px;">${categoryName}</div>
                            <div style="font-size: 0.85rem; opacity: 0.7;">${percentage}% of total</div>
                        </div>
                    </span>
                    <span style="font-weight: 700; color: var(--secondary-color);">$${amount.toFixed(2)}</span>
                </div>
            </li>`;
    }).join('');

    categoryList.innerHTML = content;
}

function updateMonthlyBreakdown() {
    const monthlyBreakdown = document.getElementById('monthlyBreakdown');

    if (!monthlyBreakdown) return;

    if (expenses.length === 0) {
        monthlyBreakdown.innerHTML = '<p class="no-data-message">No expense data available for monthly analysis.</p>';
        return;
    }

    const monthlyTotals = {};
    expenses.forEach(ex => {
        const date = new Date(ex.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthName = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

        if (!monthlyTotals[monthKey]) {
            monthlyTotals[monthKey] = { name: monthName, total: 0, count: 0 };
        }
        monthlyTotals[monthKey].total += ex.amount;
        monthlyTotals[monthKey].count += 1;
    });

    const sortedMonths = Object.entries(monthlyTotals)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 6);

    const content = sortedMonths.map(([monthKey, data]) => {
        const average = data.count > 0 ? data.total / data.count : 0;

        return `
            <li class="monthly-breakdown-item">
                <div class="summary-item" style="padding: 15px 0; border-bottom: 1px solid var(--border-light); align-items: center;">
                    <span style="display: flex; flex-direction: column;">
                        <div style="font-weight: 600; margin-bottom: 2px;">${data.name}</div>
                        <div style="font-size: 0.85rem; opacity: 0.7; line-height: 1.3;">${data.count} transactions • $${average.toFixed(2)} avg</div>
                    </span>
                    <span style="font-weight: 700; color: var(--secondary-color);">$${data.total.toFixed(2)}</span>
                </div>
            </li>`;
    }).join('');

    monthlyBreakdown.innerHTML = content;
}

function updateHistory() {
    const historyList = document.getElementById('historyList');
    const filter = document.getElementById('dateFilter')?.value || 'all';

    if (!historyList) return;

    let filteredExpenses = [...expenses];
    const now = new Date();

    switch (filter) {
        case 'today':
            filteredExpenses = expenses.filter(ex => new Date(ex.date).toDateString() === now.toDateString());
            break;
        case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            filteredExpenses = expenses.filter(ex => new Date(ex.date) >= weekAgo);
            break;
        case 'month':
            filteredExpenses = expenses.filter(ex => {
                const expenseDate = new Date(ex.date);
                return expenseDate.getMonth() === now.getMonth() && expenseDate.getFullYear() === now.getFullYear();
            });
            break;
        case 'year':
            filteredExpenses = expenses.filter(ex => new Date(ex.date).getFullYear() === now.getFullYear());
            break;
    }

    if (filteredExpenses.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: var(--text-light); opacity: 0.7; margin: 40px 0;">No expenses found for the selected period.</p>';
        return;
    }

    // Sort by date descending
    filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    historyList.innerHTML = filteredExpenses.map(ex => `
        <li class="history-item">
            <div class="expense-card" style="cursor: default; margin-bottom: 15px;">
                <div class="expense-header">
                    <div class="expense-icon">${ex.categoryIcon}</div>
                    <div class="expense-title">${ex.categoryName}</div>
                    <div class="expense-amount">$${ex.amount.toFixed(2)}</div>
                </div>
                <div class="expense-subtitle">${new Date(ex.date).toLocaleDateString()}</div>
                ${ex.description ? `<div class="expense-description"><strong>Description:</strong> ${ex.description}</div>` : ''}
                ${ex.location ? `<div class="expense-description"><strong>Location:</strong> ${ex.location}</div>` : ''}
                ${ex.receipt ? `<div class="receipt-preview" style="margin-top: 15px; text-align: center;"><img src="${ex.receipt}" class="receipt-image" alt="Receipt" style="max-width: 200px; max-height: 150px; border-radius: 6px; border: 1px solid var(--border-light);"></div>` : ''}
                <button onclick="deleteExpense('${ex.id}')" class="btn-delete" style="margin-top: 15px;">Delete</button>
            </div>
        </li>
    `).join('');
}

function deleteExpense(expenseId) {
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
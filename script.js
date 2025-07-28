// ======================
// --- PART 1: Subscription & Trial Core Logic (Lines 1-325) ---
// ======================

// Global variables
let lastValidationTime = 0;
const VALIDATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const TRIAL_DURATION_DAYS = 7;
const TRIAL_EXPENSE_LIMIT = 10;

// Utility: Clear PWA Cache except essential keys
function clearPWACache() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_INDEX_CACHE' });
    }
    const keysToKeep = [
        'truckerExpenses',
        'trialStartDate',
        'darkMode',
        'hasSeenWelcome',
        'isSubscribed',
        'subscriptionToken',
        'lastValidationTime',
        'expenseCategories',
        'userSettings',
        'backupData'
    ];
    const currentStorage = {};
    keysToKeep.forEach(key => {
        const value = localStorage.getItem(key);
        if (value !== null) currentStorage[key] = value;
    });
    localStorage.clear();
    Object.keys(currentStorage).forEach(key => {
        localStorage.setItem(key, currentStorage[key]);
    });
}

// Enhanced subscription status check with Stripe validation
async function checkSubscriptionStatusFromServer() {
    const token = localStorage.getItem('subscriptionToken');
    if (!token) {
        console.log('🔍 No subscription token found, initializing app normally');
        return initializeApp();
    }

    try {
        console.log('🔍 Validating subscription with Stripe...');
        
        const response = await fetch('/api/validate-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: token })
        });
        
        const result = await response.json();
        console.log('📡 Validation response:', result);
        
        if (result.success && result.active) {
            localStorage.setItem('isSubscribed', 'true');
            localStorage.setItem('lastValidationTime', Date.now().toString());
            console.log('✅ Subscription validated and active');
        } else if (result.shouldDowngrade) {
            console.log('⬇️ Subscription no longer active, downgrading...');
            handleSubscriptionDowngrade(result.message);
        } else {
            console.warn('⚠️ Validation failed but keeping current status:', result.message);
        }
    } catch (error) {
        console.warn('💥 Subscription validation failed:', error);
    } finally {
        initializeApp();
    }
}

// Handle subscription downgrade
function handleSubscriptionDowngrade(reason) {
    localStorage.removeItem('isSubscribed');
    localStorage.removeItem('subscriptionToken');
    localStorage.removeItem('lastValidationTime');
    clearPWACache();
    showNotification(`Subscription Status: ${reason}. Please renew to continue using Pro features.`, 'error');
    updateTrialCountdownWithAlreadySubscribed();
}

// Check if validation is needed
function checkIfValidationNeeded() {
    const token = localStorage.getItem('subscriptionToken');
    const isSubscribed = localStorage.getItem('isSubscribed') === 'true';
    const lastValidation = parseInt(localStorage.getItem('lastValidationTime') || '0');
    const timeSinceLastValidation = Date.now() - lastValidation;
    
    if (token && isSubscribed && timeSinceLastValidation > VALIDATION_INTERVAL) {
        console.log('⏰ Periodic validation needed, checking subscription status...');
        validateSubscriptionInBackground();
    }
}

// Background validation
async function validateSubscriptionInBackground() {
    const token = localStorage.getItem('subscriptionToken');
    if (!token) return;

    try {
        console.log('🔄 Background subscription validation...');
        
        const response = await fetch('/api/validate-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: token })
        });
        
        const result = await response.json();
        
        if (result.success && result.active) {
            localStorage.setItem('lastValidationTime', Date.now().toString());
            console.log('✅ Background validation: Subscription still active');
        } else if (result.shouldDowngrade) {
            console.log('⬇️ Background validation: Subscription no longer active');
            handleSubscriptionDowngrade(result.message);
        }
    } catch (error) {
        console.warn('💥 Background validation failed:', error);
    }
}

// Validate before critical actions
function validateBeforeAction(callback) {
    const token = localStorage.getItem('subscriptionToken');
    const isSubscribed = localStorage.getItem('isSubscribed') === 'true';
    
    if (!isSubscribed || !token) {
        callback();
        return;
    }
    
    const lastValidation = parseInt(localStorage.getItem('lastValidationTime') || '0');
    const timeSinceLastValidation = Date.now() - lastValidation;
    
    if (timeSinceLastValidation < VALIDATION_INTERVAL) {
        callback();
        return;
    }
    
    console.log('🔍 Validating subscription before action...');
    validateSubscriptionInBackground().then(() => {
        if (localStorage.getItem('isSubscribed') === 'true') {
            callback();
        } else {
            showNotification('Please renew your subscription to continue using Pro features.', 'error');
        }
    });
}

// Initialize enhanced validation system
function initializeEnhancedValidation() {
    console.log('🚀 Initializing enhanced subscription validation...');
    
    setInterval(checkIfValidationNeeded, VALIDATION_INTERVAL);
    
    window.addEventListener('focus', checkIfValidationNeeded);
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkIfValidationNeeded();
        }
    });
    
    console.log('✅ Enhanced validation system initialized');
}

// Verify subscription token
async function verifySubscriptionToken(token) {
    try {
        const response = await fetch('/api/verify-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            localStorage.setItem('isSubscribed', 'true');
            localStorage.setItem('subscriptionToken', token);
            localStorage.setItem('lastValidationTime', Date.now().toString());
            clearPWACache();
            showNotification('Subscription activated! Thank you for your support.', 'success');
            setTimeout(() => { window.location.reload(true); }, 1500);
        } else {
            showNotification(result.message || 'Failed to activate subscription.', 'error');
        }
    } catch (error) {
        console.error('Verification request failed:', error);
        showNotification('Could not connect to activation server.', 'error');
    } finally {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// ======================
// --- Already Subscribed Feature ---
// ======================

// Show Already Subscribed modal
function showAlreadySubscribedModal() {
    const modal = document.getElementById('alreadySubscribedModal');
    if (modal) {
        modal.classList.add('active');
    }
}

// Close Already Subscribed modal
function closeAlreadySubscribedModal() {
    const modal = document.getElementById('alreadySubscribedModal');
    if (modal) {
        modal.classList.remove('active');
    }
    resetAlreadySubscribedForm();
}

// FIXED: Reset form function with proper error handling
function resetAlreadySubscribedForm() {
    const formContainer = document.getElementById('alreadySubscribedForm');
    const successDiv = document.getElementById('subscriptionVerificationSuccess');
    const submitBtn = document.getElementById('verifySubscriptionBtn');
    const emailInput = document.getElementById('subscriptionEmailInput');
    
    // Show form and hide success message
    if (formContainer) {
        formContainer.style.display = 'block';
    }
    if (successDiv) {
        successDiv.style.display = 'none';
    }
    
    // FIXED: Properly find and reset the form element
    const formElement = document.querySelector('#alreadySubscribedForm form');
    if (formElement && typeof formElement.reset === 'function') {
        try {
            formElement.reset();
        } catch (error) {
            console.warn('Form reset failed, using manual reset:', error);
            // Manual reset fallback
            if (emailInput) {
                emailInput.value = '';
            }
        }
    } else {
        // Manual reset if form.reset() is not available
        if (emailInput) {
            emailInput.value = '';
        }
    }
    
    // Reset button state
    if (submitBtn) {
        submitBtn.textContent = 'Verify & Activate';
        submitBtn.disabled = false;
        submitBtn.style.background = '';
    }
}

// Verify and activate subscription
async function verifyAndActivateSubscription(event) {
    event.preventDefault();
    
    const submitBtn = document.getElementById('verifySubscriptionBtn');
    const emailInput = document.getElementById('subscriptionEmailInput');
    
    if (!emailInput) {
        showNotification('Email input not found', 'error');
        return;
    }
    
    const email = emailInput.value.trim();
    
    if (!email) {
        showNotification('Please enter your email address', 'error');
        emailInput.focus();
        return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Please enter a valid email address', 'error');
        emailInput.focus();
        return;
    }
    
    if (submitBtn) {
        submitBtn.textContent = 'Verifying...';
        submitBtn.disabled = true;
        submitBtn.style.background = '#6b7280';
    }
    
    try {
        console.log('🔍 Verifying subscription for email:', email);
        
        const response = await fetch('/api/verify-and-activate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email })
        });
        
        const result = await response.json();
        console.log('📡 Verification response:', result);
        
        if (result.success) {
            console.log('✅ Subscription verified and activated!');
            
            localStorage.setItem('isSubscribed', 'true');
            localStorage.setItem('subscriptionToken', result.token);
            localStorage.setItem('lastValidationTime', Date.now().toString());
            
            clearPWACache();
            
            const formContainer = document.getElementById('alreadySubscribedForm');
            const successDiv = document.getElementById('subscriptionVerificationSuccess');
            
            if (formContainer) {
                formContainer.style.display = 'none';
            }
            if (successDiv) {
                successDiv.style.display = 'block';
            }
            
            const successMessage = document.getElementById('verificationSuccessMessage');
            if (successMessage) {
                successMessage.innerHTML = `
                    <strong>Subscription Activated!</strong><br>
                    Your Pro subscription has been verified and activated for:<br>
                    <strong>${result.details?.email || email}</strong><br><br>
                    <small>Plan: ${result.details?.planName || 'Pro Plan'}</small>
                `;
            }
            
            showNotification('Subscription activated successfully!', 'success');
            updateTrialCountdownWithAlreadySubscribed();
            
            setTimeout(() => {
                closeAlreadySubscribedModal();
                window.location.reload();
            }, 3000);
            
        } else {
            console.error('❌ Subscription verification failed:', result.message);
            showNotification(result.message || 'Failed to verify subscription', 'error');
        }
        
    } catch (error) {
        console.error('💥 Verification request failed:', error);
        showNotification('Could not connect to server. Please try again.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.textContent = 'Verify & Activate';
            submitBtn.disabled = false;
            submitBtn.style.background = '';
        }
    }
}
// ======================
// --- PART 2: Modal Management & Trial System (Lines 326-650) ---
// ======================

// Inject Already Subscribed modal HTML
function injectAlreadySubscribedModal() {
    if (document.getElementById('alreadySubscribedModal')) {
        return;
    }
    
    const modalHTML = `
    <div id="alreadySubscribedModal" class="modal">
        <div class="modal-content">
            <button class="modal-close" onclick="closeAlreadySubscribedModal()">&times;</button>
            <h2>🔑 Already Subscribed?</h2>
            <div id="alreadySubscribedForm">
                <p style="margin-bottom: 20px; color: var(--text-light);">
                    Enter the email address you used when subscribing. We'll verify your subscription with Stripe and activate it immediately on this device.
                </p>
                <form onsubmit="verifyAndActivateSubscription(event)">
                    <div class="form-group">
                        <label for="subscriptionEmailInput">Email Address:</label>
                        <input type="email" id="subscriptionEmailInput" required 
                               placeholder="Enter your subscription email"
                               style="width: 100%; padding: 12px; border: 2px solid var(--border-light); border-radius: 8px; font-size: 16px; background: var(--bg-color); color: var(--text-color);">
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="submit" id="verifySubscriptionBtn" class="btn" 
                                style="background: linear-gradient(135deg, #059669, #047857); border-color: #059669;">
                            Verify & Activate
                        </button>
                        <button type="button" class="btn btn-secondary" 
                                onclick="closeAlreadySubscribedModal()">
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
            <div id="subscriptionVerificationSuccess" style="display: none; text-align: center;">
                <div style="color: #10b981; font-size: 3rem; margin-bottom: 15px;">✅</div>
                <div id="verificationSuccessMessage" style="font-size: 1.1rem; margin-bottom: 20px;">
                    <strong>Subscription Activated!</strong>
                </div>
                <p style="color: #6b7280; margin-bottom: 15px;">
                    Your Pro features are now active! The app will refresh automatically to show your Pro status.
                </p>
                <p style="color: #6b7280; font-size: 0.9rem;">
                    Refreshing in a few seconds...
                </p>
            </div>
        </div>
    </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Add Already Subscribed button
function addAlreadySubscribedButton() {
    if (localStorage.getItem('isSubscribed') === 'true') {
        return;
    }
    
    if (document.getElementById('alreadySubscribedActionBtn')) {
        return;
    }
    
    const actionButtons = document.querySelector('.action-buttons');
    if (!actionButtons) {
        console.warn('Action buttons container not found');
        return;
    }
    
    const button = document.createElement('button');
    button.id = 'alreadySubscribedActionBtn';
    button.className = 'btn btn-secondary';
    button.innerHTML = '🔑 Already Subscribed?';
    button.onclick = showAlreadySubscribedModal;
    button.style.cssText = `
        background: linear-gradient(135deg, #6366f1, #4f46e5);
        border-color: #6366f1;
        color: white;
        margin-top: 10px;
        width: 100%;
    `;
    
    actionButtons.appendChild(button);
    console.log('✅ Already Subscribed button added to action buttons');
}

// Remove Already Subscribed button
function removeAlreadySubscribedButton() {
    const button = document.getElementById('alreadySubscribedActionBtn');
    if (button) {
        button.remove();
        console.log('🗑️ Already Subscribed button removed');
    }
}

// Initialize Already Subscribed feature
function initializeAlreadySubscribedFeature() {
    injectAlreadySubscribedModal();
    addAlreadySubscribedButton();
    console.log('✅ Already Subscribed feature initialized');
}

// ======================
// --- Trial System ---
// ======================

// Check if user is in trial period
function isInTrialPeriod() {
    const trialStartDate = localStorage.getItem('trialStartDate');
    if (!trialStartDate) return false;
    
    const startDate = new Date(trialStartDate);
    const currentDate = new Date();
    const daysDifference = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
    
    return daysDifference < TRIAL_DURATION_DAYS;
}

// Get remaining trial days
function getRemainingTrialDays() {
    const trialStartDate = localStorage.getItem('trialStartDate');
    if (!trialStartDate) return 0;
    
    const startDate = new Date(trialStartDate);
    const currentDate = new Date();
    const daysDifference = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
    
    return Math.max(0, TRIAL_DURATION_DAYS - daysDifference);
}

// Start trial period
function startTrialPeriod() {
    const currentDate = new Date().toISOString();
    localStorage.setItem('trialStartDate', currentDate);
    console.log('🚀 Trial period started');
}

// Check trial limits
function checkTrialLimits() {
    if (localStorage.getItem('isSubscribed') === 'true') {
        return { allowed: true, reason: 'subscribed' };
    }
    
    if (!isInTrialPeriod()) {
        return { allowed: false, reason: 'expired' };
    }
    
    const expenses = getExpenses();
    if (expenses.length >= TRIAL_EXPENSE_LIMIT) {
        return { allowed: false, reason: 'limit_reached' };
    }
    
    return { allowed: true, reason: 'trial' };
}

// Update trial countdown display
function updateTrialCountdownWithAlreadySubscribed() {
    const trialInfo = document.getElementById('trial-info');
    if (!trialInfo) return;
    
    const isSubscribed = localStorage.getItem('isSubscribed') === 'true';
    
    if (isSubscribed) {
        trialInfo.innerHTML = `
            <div class="subscription-status pro">
                <div class="status-icon">👑</div>
                <div class="status-text">
                    <strong>Pro Subscriber</strong>
                    <p>Unlimited expenses & full features</p>
                </div>
            </div>
        `;
        removeAlreadySubscribedButton();
        return;
    }
    
    const trialStartDate = localStorage.getItem('trialStartDate');
    if (!trialStartDate) {
        trialInfo.innerHTML = `
            <div class="trial-status">
                <div class="trial-header">
                    <span class="trial-badge">FREE TRIAL</span>
                    <span class="trial-duration">${TRIAL_DURATION_DAYS} Days</span>
                </div>
                <p class="trial-description">
                    Track up to ${TRIAL_EXPENSE_LIMIT} expenses during your ${TRIAL_DURATION_DAYS}-day free trial
                </p>
                <div class="trial-actions">
                    <button class="btn btn-primary" onclick="window.open('https://buy.stripe.com/your-link', '_blank')">
                        🚀 Upgrade to Pro
                    </button>
                </div>
            </div>
        `;
        addAlreadySubscribedButton();
        return;
    }
    
    const remainingDays = getRemainingTrialDays();
    const expenses = getExpenses();
    const remainingExpenses = Math.max(0, TRIAL_EXPENSE_LIMIT - expenses.length);
    
    if (remainingDays > 0 && remainingExpenses > 0) {
        trialInfo.innerHTML = `
            <div class="trial-status active">
                <div class="trial-header">
                    <span class="trial-badge active">TRIAL ACTIVE</span>
                    <span class="trial-countdown">${remainingDays} days left</span>
                </div>
                <div class="trial-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${(expenses.length / TRIAL_EXPENSE_LIMIT) * 100}%"></div>
                    </div>
                    <p class="progress-text">${expenses.length}/${TRIAL_EXPENSE_LIMIT} expenses used</p>
                </div>
                <div class="trial-actions">
                    <button class="btn btn-primary" onclick="window.open('https://buy.stripe.com/your-link', '_blank')">
                        🚀 Upgrade to Pro
                    </button>
                </div>
            </div>
        `;
    } else {
        const reason = remainingDays <= 0 ? 'expired' : 'limit reached';
        trialInfo.innerHTML = `
            <div class="trial-status expired">
                <div class="trial-header">
                    <span class="trial-badge expired">TRIAL ${reason.toUpperCase()}</span>
                </div>
                <p class="trial-description">
                    Your ${TRIAL_DURATION_DAYS}-day trial has ${reason}. Upgrade to Pro to continue tracking expenses.
                </p>
                <div class="trial-actions">
                    <button class="btn btn-primary" onclick="window.open('https://buy.stripe.com/your-link', '_blank')">
                        🚀 Upgrade to Pro Now
                    </button>
                </div>
            </div>
        `;
    }
    
    addAlreadySubscribedButton();
}

// ======================
// --- Expense Management ---
// ======================

// Get expenses from localStorage
function getExpenses() {
    const expenses = localStorage.getItem('truckerExpenses');
    return expenses ? JSON.parse(expenses) : [];
}

// Save expenses to localStorage
function saveExpenses(expenses) {
    localStorage.setItem('truckerExpenses', JSON.stringify(expenses));
    updateExpenseStats();
    updateTrialCountdownWithAlreadySubscribed();
}

// Add new expense
function addExpense(expense) {
    const trialCheck = checkTrialLimits();
    if (!trialCheck.allowed) {
        if (trialCheck.reason === 'expired') {
            showNotification('Your trial period has expired. Please upgrade to Pro to continue.', 'error');
        } else if (trialCheck.reason === 'limit_reached') {
            showNotification(`Trial limit reached (${TRIAL_EXPENSE_LIMIT} expenses). Please upgrade to Pro to continue.`, 'error');
        }
        return false;
    }
    
    const expenses = getExpenses();
    expense.id = Date.now().toString();
    expense.dateAdded = new Date().toISOString();
    expenses.push(expense);
    saveExpenses(expenses);
    
    if (expenses.length === 1 && localStorage.getItem('isSubscribed') !== 'true') {
        startTrialPeriod();
    }
    
    return true;
}

// Delete expense
function deleteExpense(id) {
    const expenses = getExpenses();
    const filteredExpenses = expenses.filter(expense => expense.id !== id);
    saveExpenses(filteredExpenses);
    refreshExpenseList();
}

// Edit expense
function editExpense(id, updatedExpense) {
    const expenses = getExpenses();
    const index = expenses.findIndex(expense => expense.id === id);
    if (index !== -1) {
        expenses[index] = { ...expenses[index], ...updatedExpense };
        saveExpenses(expenses);
        refreshExpenseList();
    }
}

// Get expense by ID
function getExpenseById(id) {
    const expenses = getExpenses();
    return expenses.find(expense => expense.id === id);
}

// Update expense statistics
function updateExpenseStats() {
    const expenses = getExpenses();
    const totalAmount = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount || 0), 0);
    const totalCount = expenses.length;
    
    const statsContainer = document.getElementById('expense-stats');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-item">
                <span class="stat-label">Total Expenses:</span>
                <span class="stat-value">${totalCount}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Total Amount:</span>
                <span class="stat-value">${formatCurrency(totalAmount)}</span>
            </div>
        `;
    }
}

// Filter expenses by date range
function filterExpensesByDateRange(startDate, endDate) {
    const expenses = getExpenses();
    return expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= new Date(startDate) && expenseDate <= new Date(endDate);
    });
}

// Filter expenses by category
function filterExpensesByCategory(category) {
    const expenses = getExpenses();
    return category === 'all' ? expenses : expenses.filter(expense => expense.category === category);
}

// Search expenses
function searchExpenses(query) {
    const expenses = getExpenses();
    const lowercaseQuery = query.toLowerCase();
    return expenses.filter(expense => 
        expense.description.toLowerCase().includes(lowercaseQuery) ||
        expense.category.toLowerCase().includes(lowercaseQuery)
    );
}
// ======================
// --- PART 3: UI Functions & Form Handling (Lines 651-975) ---
// ======================

// Show notification
function showNotification(message, type = 'info') {
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        animation: slideIn 0.3s ease-out;
    `;
    
    switch (type) {
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            break;
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
            break;
        case 'warning':
            notification.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
            break;
        default:
            notification.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
    }
    
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
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 5000);
}

// Toggle dark mode
function toggleDarkMode() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark.toString());
    
    const toggleBtn = document.getElementById('darkModeToggle');
    if (toggleBtn) {
        toggleBtn.textContent = isDark ? '☀️' : '🌙';
    }
}

// Initialize dark mode
function initializeDarkMode() {
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
    }
    
    const toggleBtn = document.getElementById('darkModeToggle');
    if (toggleBtn) {
        toggleBtn.textContent = isDarkMode ? '☀️' : '🌙';
        toggleBtn.onclick = toggleDarkMode;
    }
}

// Refresh expense list
function refreshExpenseList() {
    const expenseList = document.getElementById('expense-list');
    if (!expenseList) return;
    
    const expenses = getExpenses();
    
    if (expenses.length === 0) {
        expenseList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <h3>No expenses yet</h3>
                <p>Add your first expense to get started tracking your trucking costs.</p>
            </div>
        `;
        return;
    }
    
    const sortedExpenses = expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    expenseList.innerHTML = sortedExpenses.map(expense => `
        <div class="expense-item" data-expense-id="${expense.id}">
            <div class="expense-header">
                <div class="expense-date">${formatDate(expense.date)}</div>
                <div class="expense-amount">${formatCurrency(expense.amount)}</div>
            </div>
            <div class="expense-details">
                <div class="expense-category">${expense.category}</div>
                <div class="expense-description">${expense.description}</div>
            </div>
            <div class="expense-actions">
                <button class="btn btn-sm edit-expense" data-expense-id="${expense.id}">
                    ✏️ Edit
                </button>
                <button class="btn btn-sm btn-danger delete-expense" data-expense-id="${expense.id}">
                    🗑️ Delete
                </button>
            </div>
        </div>
    `).join('');
    
    updateExpenseStats();
}

// Show add expense modal
function showAddExpenseModal() {
    const modal = document.getElementById('addExpenseModal');
    if (modal) {
        modal.classList.add('active');
        resetExpenseForm();
    }
}

// Close add expense modal
function closeAddExpenseModal() {
    const modal = document.getElementById('addExpenseModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Reset expense form
function resetExpenseForm() {
    const form = document.getElementById('expenseForm');
    if (form && typeof form.reset === 'function') {
        try {
            form.reset();
        } catch (error) {
            console.warn('Form reset failed:', error);
            // Manual reset fallback
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    input.checked = false;
                } else {
                    input.value = '';
                }
            });
        }
    }
    
    // Set default date to today
    const dateInput = document.getElementById('expenseDate');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

// Show edit expense modal
function showEditExpenseModal(expenseId) {
    const expense = getExpenseById(expenseId);
    if (!expense) {
        showNotification('Expense not found', 'error');
        return;
    }
    
    const modal = document.getElementById('editExpenseModal');
    if (!modal) {
        createEditExpenseModal();
    }
    
    // Populate form with expense data
    document.getElementById('editExpenseId').value = expense.id;
    document.getElementById('editExpenseDate').value = expense.date;
    document.getElementById('editExpenseCategory').value = expense.category;
    document.getElementById('editExpenseDescription').value = expense.description;
    document.getElementById('editExpenseAmount').value = expense.amount;
    
    document.getElementById('editExpenseModal').classList.add('active');
}

// Close edit expense modal
function closeEditExpenseModal() {
    const modal = document.getElementById('editExpenseModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Create edit expense modal
function createEditExpenseModal() {
    const modalHTML = `
    <div id="editExpenseModal" class="modal">
        <div class="modal-content">
            <button class="modal-close" onclick="closeEditExpenseModal()">&times;</button>
            <h2>✏️ Edit Expense</h2>
            <form id="editExpenseForm" onsubmit="handleEditExpenseSubmit(event)">
                <input type="hidden" id="editExpenseId">
                <div class="form-group">
                    <label for="editExpenseDate">Date:</label>
                    <input type="date" id="editExpenseDate" required>
                </div>
                <div class="form-group">
                    <label for="editExpenseCategory">Category:</label>
                    <select id="editExpenseCategory" required>
                        <option value="">Select Category</option>
                        <option value="fuel">Fuel</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="tolls">Tolls</option>
                        <option value="parking">Parking</option>
                        <option value="meals">Meals</option>
                        <option value="lodging">Lodging</option>
                        <option value="permits">Permits</option>
                        <option value="insurance">Insurance</option>
                        <option value="other">Other</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="editExpenseDescription">Description:</label>
                    <input type="text" id="editExpenseDescription" required placeholder="Enter description">
                </div>
                <div class="form-group">
                    <label for="editExpenseAmount">Amount:</label>
                    <input type="number" id="editExpenseAmount" step="0.01" min="0" required placeholder="0.00">
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">Update Expense</button>
                    <button type="button" class="btn btn-secondary" onclick="closeEditExpenseModal()">Cancel</button>
                </div>
            </form>
        </div>
    </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Handle edit expense form submission
function handleEditExpenseSubmit(event) {
    event.preventDefault();
    
    const expenseId = document.getElementById('editExpenseId').value;
    const updatedExpense = {
        date: document.getElementById('editExpenseDate').value,
        category: document.getElementById('editExpenseCategory').value,
        description: document.getElementById('editExpenseDescription').value,
        amount: parseFloat(document.getElementById('editExpenseAmount').value)
    };
    
    editExpense(expenseId, updatedExpense);
    closeEditExpenseModal();
    showNotification('Expense updated successfully!', 'success');
}

// Initialize expense categories
function initializeExpenseCategories() {
    const defaultCategories = [
        { value: 'fuel', label: 'Fuel', icon: '⛽' },
        { value: 'maintenance', label: 'Maintenance', icon: '🔧' },
        { value: 'tolls', label: 'Tolls', icon: '🛣️' },
        { value: 'parking', label: 'Parking', icon: '🅿️' },
        { value: 'meals', label: 'Meals', icon: '🍽️' },
        { value: 'lodging', label: 'Lodging', icon: '🏨' },
        { value: 'permits', label: 'Permits', icon: '📋' },
        { value: 'insurance', label: 'Insurance', icon: '🛡️' },
        { value: 'other', label: 'Other', icon: '📦' }
    ];
    
    const savedCategories = localStorage.getItem('expenseCategories');
    if (!savedCategories) {
        localStorage.setItem('expenseCategories', JSON.stringify(defaultCategories));
    }
}

// Get expense categories
function getExpenseCategories() {
    const categories = localStorage.getItem('expenseCategories');
    return categories ? JSON.parse(categories) : [];
}

// Populate category selects
function populateCategorySelects() {
    const categories = getExpenseCategories();
    const selects = document.querySelectorAll('select[id*="Category"]');
    
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Select Category</option>';
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.value;
            option.textContent = `${category.icon} ${category.label}`;
            select.appendChild(option);
        });
        
        if (currentValue) {
            select.value = currentValue;
        }
    });
}

// Initialize filters
function initializeFilters() {
    const filterContainer = document.getElementById('expense-filters');
    if (!filterContainer) return;
    
    const categories = getExpenseCategories();
    
    filterContainer.innerHTML = `
        <div class="filter-group">
            <label for="categoryFilter">Filter by Category:</label>
            <select id="categoryFilter" onchange="applyFilters()">
                <option value="all">All Categories</option>
                ${categories.map(cat => `<option value="${cat.value}">${cat.icon} ${cat.label}</option>`).join('')}
            </select>
        </div>
        <div class="filter-group">
            <label for="dateFromFilter">From Date:</label>
            <input type="date" id="dateFromFilter" onchange="applyFilters()">
        </div>
        <div class="filter-group">
            <label for="dateToFilter">To Date:</label>
            <input type="date" id="dateToFilter" onchange="applyFilters()">
        </div>
        <div class="filter-group">
            <label for="searchFilter">Search:</label>
            <input type="text" id="searchFilter" placeholder="Search expenses..." oninput="applyFilters()">
        </div>
        <button class="btn btn-secondary" onclick="clearFilters()">Clear Filters</button>
    `;
}

// Apply filters
function applyFilters() {
    let expenses = getExpenses();
    
    const categoryFilter = document.getElementById('categoryFilter')?.value;
    const dateFromFilter = document.getElementById('dateFromFilter')?.value;
    const dateToFilter = document.getElementById('dateToFilter')?.value;
    const searchFilter = document.getElementById('searchFilter')?.value;
    
    if (categoryFilter && categoryFilter !== 'all') {
        expenses = expenses.filter(expense => expense.category === categoryFilter);
    }
    
    if (dateFromFilter) {
        expenses = expenses.filter(expense => expense.date >= dateFromFilter);
    }
    
    if (dateToFilter) {
        expenses = expenses.filter(expense => expense.date <= dateToFilter);
    }
    
    if (searchFilter) {
        const query = searchFilter.toLowerCase();
        expenses = expenses.filter(expense => 
            expense.description.toLowerCase().includes(query) ||
            expense.category.toLowerCase().includes(query)
        );
    }
    
    displayFilteredExpenses(expenses);
}

// Display filtered expenses
function displayFilteredExpenses(expenses) {
    const expenseList = document.getElementById('expense-list');
    if (!expenseList) return;
    
    if (expenses.length === 0) {
        expenseList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>No expenses found</h3>
                <p>Try adjusting your filters or search terms.</p>
            </div>
        `;
        return;
    }
    
    const sortedExpenses = expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    expenseList.innerHTML = sortedExpenses.map(expense => `
        <div class="expense-item" data-expense-id="${expense.id}">
            <div class="expense-header">
                <div class="expense-date">${formatDate(expense.date)}</div>
                <div class="expense-amount">${formatCurrency(expense.amount)}</div>
            </div>
            <div class="expense-details">
                <div class="expense-category">${expense.category}</div>
                <div class="expense-description">${expense.description}</div>
            </div>
            <div class="expense-actions">
                <button class="btn btn-sm edit-expense" data-expense-id="${expense.id}">
                    ✏️ Edit
                </button>
                <button class="btn btn-sm btn-danger delete-expense" data-expense-id="${expense.id}">
                    🗑️ Delete
                </button>
            </div>
        </div>
    `).join('');
}

// Clear filters
function clearFilters() {
    const categoryFilter = document.getElementById('categoryFilter');
    const dateFromFilter = document.getElementById('dateFromFilter');
    const dateToFilter = document.getElementById('dateToFilter');
    const searchFilter = document.getElementById('searchFilter');
    
    if (categoryFilter) categoryFilter.value = 'all';
    if (dateFromFilter) dateFromFilter.value = '';
    if (dateToFilter) dateToFilter.value = '';
    if (searchFilter) searchFilter.value = '';
    
    refreshExpenseList();
}
// ======================
// --- PART 4: Export Functions & App Initialization (Lines 976-1300) ---
// ======================

// Export expenses to CSV
function exportToCSV() {
    const expenses = getExpenses();
    if (expenses.length === 0) {
        showNotification('No expenses to export', 'warning');
        return;
    }
    
    const headers = ['Date', 'Category', 'Description', 'Amount'];
    const csvContent = [
        headers.join(','),
        ...expenses.map(expense => [
            expense.date,
            expense.category,
            `"${expense.description.replace(/"/g, '""')}"`,
            expense.amount
        ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trucker-expenses-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('Expenses exported successfully!', 'success');
}

// Export expenses to PDF
function exportToPDF() {
    const expenses = getExpenses();
    if (expenses.length === 0) {
        showNotification('No expenses to export', 'warning');
        return;
    }
    
    // Create a new window for PDF generation
    const printWindow = window.open('', '_blank');
    const totalAmount = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount || 0), 0);
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Trucker Expense Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .summary { margin-bottom: 20px; padding: 15px; background: #f5f5f5; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                .total { font-weight: bold; background-color: #e8f5e8; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Trucker Expense Report</h1>
                <p>Generated on ${new Date().toLocaleDateString()}</p>
            </div>
            <div class="summary">
                <p><strong>Total Expenses:</strong> ${expenses.length}</p>
                <p><strong>Total Amount:</strong> ${formatCurrency(totalAmount)}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${expenses.map(expense => `
                        <tr>
                            <td>${formatDate(expense.date)}</td>
                            <td>${expense.category}</td>
                            <td>${expense.description}</td>
                            <td>${formatCurrency(expense.amount)}</td>
                        </tr>
                    `).join('')}
                    <tr class="total">
                        <td colspan="3"><strong>Total</strong></td>
                        <td><strong>${formatCurrency(totalAmount)}</strong></td>
                    </tr>
                </tbody>
            </table>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
    
    showNotification('PDF export initiated!', 'success');
}

// Backup data
function backupData() {
    const data = {
        expenses: getExpenses(),
        settings: {
            darkMode: localStorage.getItem('darkMode'),
            trialStartDate: localStorage.getItem('trialStartDate'),
            isSubscribed: localStorage.getItem('isSubscribed'),
            subscriptionToken: localStorage.getItem('subscriptionToken'),
            lastValidationTime: localStorage.getItem('lastValidationTime')
        },
        categories: getExpenseCategories(),
        exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trucker-expense-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('Data backup created successfully!', 'success');
}

// Restore data
function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.expenses) {
                localStorage.setItem('truckerExpenses', JSON.stringify(data.expenses));
            }
            
            if (data.settings) {
                Object.keys(data.settings).forEach(key => {
                    if (data.settings[key] !== null) {
                        localStorage.setItem(key, data.settings[key]);
                    }
                });
            }
            
            if (data.categories) {
                localStorage.setItem('expenseCategories', JSON.stringify(data.categories));
            }
            
            showNotification('Data restored successfully!', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 1500);
            
        } catch (error) {
            console.error('Restore failed:', error);
            showNotification('Failed to restore data. Invalid backup file.', 'error');
        }
    };
    
    reader.readAsText(file);
}

// ======================
// --- Service Worker Registration ---
// ======================

// Register service worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('New SW registered:', registration);
                
                // Listen for service worker messages
                navigator.serviceWorker.addEventListener('message', event => {
                    if (event.data && event.data.type === 'INDEX_CACHE_CLEARED') {
                        console.log('Index cache cleared by service worker');
                    }
                });
            })
            .catch(error => {
                console.log('SW registration failed:', error);
            });
    }
}

// ======================
// --- App Initialization ---
// ======================

// Initialize the application
function initializeApp() {
    console.log('🚀 Initializing Trucker Expense Tracker...');
    
    // Initialize dark mode
    initializeDarkMode();
    
    // Initialize expense categories
    initializeExpenseCategories();
    
    // Initialize Already Subscribed feature
    initializeAlreadySubscribedFeature();
    
    // Initialize enhanced validation system
    initializeEnhancedValidation();
    
    // Update trial countdown
    updateTrialCountdownWithAlreadySubscribed();
    
    // Populate category selects
    populateCategorySelects();
    
    // Initialize filters
    initializeFilters();
    
    // Refresh expense list
    refreshExpenseList();
    
    // Register service worker
    registerServiceWorker();
    
    // Check for subscription token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
        verifySubscriptionToken(token);
        return;
    }
    
    console.log('✅ App initialization complete');
}

// ======================
// --- Event Listeners ---
// ======================

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    checkSubscriptionStatusFromServer();
});

// Window load event
window.addEventListener('load', function() {
    // Set up periodic validation check
    setInterval(checkIfValidationNeeded, 60000); // Check every minute
});

// Handle form submissions
document.addEventListener('submit', function(event) {
    const form = event.target;
    
    // Handle expense form submission
    if (form.id === 'expenseForm') {
        event.preventDefault();
        
        const formData = new FormData(form);
        const expense = {
            date: formData.get('date'),
            category: formData.get('category'),
            description: formData.get('description'),
            amount: parseFloat(formData.get('amount'))
        };
        
        if (addExpense(expense)) {
            // FIXED: Proper form reset with error handling
            try {
                form.reset();
            } catch (error) {
                console.warn('Form reset failed, using manual reset:', error);
                const inputs = form.querySelectorAll('input, select, textarea');
                inputs.forEach(input => {
                    if (input.type === 'checkbox' || input.type === 'radio') {
                        input.checked = false;
                    } else {
                        input.value = '';
                    }
                });
            }
            
            closeAddExpenseModal();
            showNotification('Expense added successfully!', 'success');
            refreshExpenseList();
        }
    }
});

// Handle clicks
document.addEventListener('click', function(event) {
    const target = event.target;
    
    // Handle delete expense buttons
    if (target.classList.contains('delete-expense')) {
        const expenseId = target.dataset.expenseId;
        if (expenseId && confirm('Are you sure you want to delete this expense?')) {
            deleteExpense(expenseId);
            showNotification('Expense deleted successfully!', 'success');
        }
    }
    
    // Handle edit expense buttons
    if (target.classList.contains('edit-expense')) {
        const expenseId = target.dataset.expenseId;
        if (expenseId) {
            showEditExpenseModal(expenseId);
        }
    }
    
    // Handle export buttons
    if (target.id === 'exportCSVBtn') {
        exportToCSV();
    }
    
    if (target.id === 'exportPDFBtn') {
        exportToPDF();
    }
    
    if (target.id === 'backupDataBtn') {
        backupData();
    }
});

// Handle file input for restore
document.addEventListener('change', function(event) {
    if (event.target.id === 'restoreDataInput') {
        restoreData(event);
    }
});

// ======================
// --- Global Error Handling ---
// ======================

// Handle uncaught errors
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showNotification('An unexpected error occurred. Please refresh the page.', 'error');
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showNotification('An unexpected error occurred. Please try again.', 'error');
});

// ======================
// --- Utility Functions ---
// ======================

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Generate unique ID
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Validate email
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Get current date in YYYY-MM-DD format
function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
}

// Calculate days between dates
function daysBetween(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000;
    const firstDate = new Date(date1);
    const secondDate = new Date(date2);
    return Math.round(Math.abs((firstDate - secondDate) / oneDay));
}

// Check if date is valid
function isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}

// ======================
// --- Final Initialization ---
// ======================

console.log('📱 Trucker Expense Tracker script loaded successfully');

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

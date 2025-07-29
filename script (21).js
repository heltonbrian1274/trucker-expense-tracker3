// ======================
// --- Subscription & Trial Core Logic ---
// ======================

// Global variable to track last validation time
let lastValidationTime = 0;
const VALIDATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

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
        'lastValidationTime'
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
            // Subscription is active
            localStorage.setItem('isSubscribed', 'true');
            localStorage.setItem('lastValidationTime', Date.now().toString());
            console.log('✅ Subscription validated and active');
        } else if (result.shouldDowngrade) {
            // Subscription is cancelled/expired - downgrade user
            console.log('⬇️ Subscription no longer active, downgrading...');
            handleSubscriptionDowngrade(result.message);
        } else {
            // Validation failed but don't downgrade (network issues, etc.)
            console.warn('⚠️ Validation failed but keeping current status:', result.message);
            // Keep existing subscription state
        }
    } catch (error) {
        console.warn('💥 Subscription validation failed:', error);
        // On network errors, keep existing subscription state
        // Don't downgrade due to temporary connectivity issues
    } finally {
        initializeApp();
    }
}

// Handle subscription downgrade
function handleSubscriptionDowngrade(reason) {
    // Remove subscription status
    localStorage.removeItem('isSubscribed');
    localStorage.removeItem('subscriptionToken');
    localStorage.removeItem('lastValidationTime');

    // Clear PWA cache
    clearPWACache();

    // Show notification to user
    showNotification(`Subscription Status: ${reason}. Please renew to continue using Pro features.`, 'error');

    // Update UI to show trial/expired state
    updateTrialCountdownWithAlreadySubscribed();
}

// Check if validation is needed (called periodically)
function checkIfValidationNeeded() {
    const token = localStorage.getItem('subscriptionToken');
    const isSubscribed = localStorage.getItem('isSubscribed') === 'true';
    const lastValidation = parseInt(localStorage.getItem('lastValidationTime') || '0');
    const timeSinceLastValidation = Date.now() - lastValidation;

    // Only validate if:
    // 1. User has a token and thinks they're subscribed
    // 2. It's been more than 24 hours since last validation
    if (token && isSubscribed && timeSinceLastValidation > VALIDATION_INTERVAL) {
        console.log('⏰ Periodic validation needed, checking subscription status...');
        validateSubscriptionInBackground();
    }
}

// Background validation (doesn't reinitialize app)
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
            // Still active - update validation time
            localStorage.setItem('lastValidationTime', Date.now().toString());
            console.log('✅ Background validation: Subscription still active');
        } else if (result.shouldDowngrade) {
            // Subscription cancelled/expired
            console.log('⬇️ Background validation: Subscription no longer active');
            handleSubscriptionDowngrade(result.message);
        }
    } catch (error) {
        console.warn('💥 Background validation failed:', error);
        // Don't downgrade on network errors
    }
}

// Validate before critical actions (like adding expenses)
function validateBeforeAction(callback) {
    const token = localStorage.getItem('subscriptionToken');
    const isSubscribed = localStorage.getItem('isSubscribed') === 'true';

    // If not subscribed, proceed normally (trial user)
    if (!isSubscribed || !token) {
        callback();
        return;
    }

    const lastValidation = parseInt(localStorage.getItem('lastValidationTime') || '0');
    const timeSinceLastValidation = Date.now() - lastValidation;

    // If validation is recent, proceed
    if (timeSinceLastValidation < VALIDATION_INTERVAL) {
        callback();
        return;
    }

    // Need validation before proceeding
    console.log('🔍 Validating subscription before action...');
    validateSubscriptionInBackground().then(() => {
        // Check if still subscribed after validation
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

    // Set up periodic validation timer (every 24 hours)
    setInterval(checkIfValidationNeeded, VALIDATION_INTERVAL);

    // Check when app regains focus
    window.addEventListener('focus', checkIfValidationNeeded);

    // Check when user becomes active after being idle
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkIfValidationNeeded();
        }
    });

    console.log('✅ Enhanced validation system initialized');
}

// Verify subscription token on subscription purchase link usage
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
        // We reload on success, so no initializeApp call here
    }
}

// ======================
// --- Already Subscribed Feature ---
// ======================

// Function to show the Already Subscribed modal
function showAlreadySubscribedModal() {
    document.getElementById('alreadySubscribedModal').classList.add('active');
}

// Function to close the Already Subscribed modal
function closeAlreadySubscribedModal() {
    document.getElementById('alreadySubscribedModal').classList.remove('active');
    resetAlreadySubscribedForm();
}

// Function to reset the form
function resetAlreadySubscribedForm() {
    const form = document.getElementById('alreadySubscribedForm');
    const successDiv = document.getElementById('subscriptionVerificationSuccess');
    const submitBtn = document.getElementById('verifySubscriptionBtn');

    form.style.display = 'block';
    successDiv.style.display = 'none';
    const actualForm = form.querySelector('form');
if (actualForm) {
    actualForm.reset();
}

    submitBtn.textContent = 'Verify & Activate';
    submitBtn.disabled = false;
    submitBtn.style.background = '';
}

// UPDATED FUNCTION - Direct verification and activation
async function verifyAndActivateSubscription(event) {
    event.preventDefault();

    const submitBtn = document.getElementById('verifySubscriptionBtn');
    const emailInput = document.getElementById('subscriptionEmailInput');
    const email = emailInput.value.trim();

    // Validate email
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

    // Update button state
    submitBtn.textContent = 'Verifying...';
    submitBtn.disabled = true;
    submitBtn.style.background = '#6b7280';

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

            // Store the subscription status and token
            localStorage.setItem('isSubscribed', 'true');
            localStorage.setItem('subscriptionToken', result.token);
            localStorage.setItem('lastValidationTime', Date.now().toString());

            // Clear PWA cache to ensure clean state
            clearPWACache();

            // Show success message
            const form = document.getElementById('alreadySubscribedForm');
            const successDiv = document.getElementById('subscriptionVerificationSuccess');

            form.style.display = 'none';
            successDiv.style.display = 'block';

            // Update the success message with details
            const successMessage = document.getElementById('verificationSuccessMessage');
            successMessage.innerHTML = `
                <strong>Subscription Activated!</strong><br>
                Your Pro subscription has been verified and activated for:<br>
                <strong>${result.details?.email || email}</strong><br><br>
                <small>Plan: ${result.details?.planName || 'Pro Plan'}</small>
            `;

            showNotification('Subscription activated successfully!', 'success');

            // Update the UI immediately
            updateTrialCountdownWithAlreadySubscribed();

            // Auto-close modal after 3 seconds and refresh
            setTimeout(() => {
                closeAlreadySubscribedModal();
                // Force a reload to ensure all UI updates properly
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
        // Reset button state
        submitBtn.textContent = 'Verify & Activate';
        submitBtn.disabled = false;
        submitBtn.style.background = '';
    }
}

// UPDATED FUNCTION - Inject the Already Subscribed modal HTML with better styling
function injectAlreadySubscribedModal() {
    // Check if modal already exists
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

// FIXED FUNCTION - Function to add the Already Subscribed button to action-buttons
function addAlreadySubscribedButton() {
    // Only add if not already subscribed
    if (localStorage.getItem('isSubscribed') === 'true') {
        return;
    }

    // Check if button already exists
    if (document.getElementById('alreadySubscribedActionBtn')) {
        return;
    }

    // Find the action-buttons container
    const actionButtons = document.querySelector('.action-buttons');
    if (!actionButtons) {
        console.warn('Action buttons container not found - trying alternative placement');
        // Try alternative: add to trial countdown area
        const trialCountdown = document.getElementById('trialCountdown');
        if (trialCountdown) {
            const button = document.createElement('button');
            button.id = 'alreadySubscribedActionBtn';
            button.style.cssText = `
                background: linear-gradient(135deg, #059669, #047857) !important;
                color: white !important;
                border: 2px solid #059669 !important;
                padding: 8px 16px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                margin-top: 10px;
                display: block;
                width: 100%;
                font-size: 14px;
            `;
            button.innerHTML = '🔑 Already Subscribed?';
            button.onclick = showAlreadySubscribedModal;

            trialCountdown.appendChild(button);
            console.log('✅ Already Subscribed button added to trial countdown area');
        }
        return;
    }

    // Create the button
    const button = document.createElement('button');
    button.id = 'alreadySubscribedActionBtn';
    button.className = 'action-btn';
    button.style.cssText = `
        background: linear-gradient(135deg, #059669, #047857) !important;
        color: white !important;
        border-color: #059669 !important;
    `;
    button.innerHTML = '🔑 Already Subscribed?';
    button.onclick = showAlreadySubscribedModal;

    // Add hover effect
    button.addEventListener('mouseenter', () => {
        button.style.background = 'linear-gradient(135deg, #047857, #065f46) !important';
    });
    button.addEventListener('mouseleave', () => {
        button.style.background = 'linear-gradient(135deg, #059669, #047857) !important';
    });

    // Insert the button before the subscribe button
    const subscribeBtn = actionButtons.querySelector('.subscribe-btn');
    if (subscribeBtn) {
        actionButtons.insertBefore(button, subscribeBtn);
    } else {
        // If no subscribe button found, append to the end
        actionButtons.appendChild(button);
    }

    console.log('✅ Already Subscribed button added to action buttons');
}

// Function to remove the Already Subscribed button (when user becomes subscribed)
function removeAlreadySubscribedButton() {
    const button = document.getElementById('alreadySubscribedActionBtn');
    if (button) {
        button.remove();
        console.log('🗑️ Already Subscribed button removed');
    }
}

// Enhanced updateTrialCountdown function to manage the button
function updateTrialCountdownWithAlreadySubscribed() {
    // Call the original updateTrialCountdown function
    updateTrialCountdown();

    // Manage the Already Subscribed button based on subscription status
    if (localStorage.getItem('isSubscribed') === 'true') {
        removeAlreadySubscribedButton();
    } else {
        addAlreadySubscribedButton();
    }
}

// Initialize the Already Subscribed feature
function initializeAlreadySubscribedFeature() {
    // Inject the modal HTML
    injectAlreadySubscribedModal();

    // Add the button to action buttons
    addAlreadySubscribedButton();

    console.log('✅ Already Subscribed feature initialized');
}

// ======================
// --- Expense Categories ---
// ======================
const expenseCategories = [
    { id: 'fuel', name: 'Fuel', icon: '⛽' },
    { id: 'maintenance', name: 'Maintenance & Repairs', icon: '🔧' },
    { id: 'meals', name: 'Meals', icon: '🍽️' },
    { id: 'lodging', name: 'Lodging', icon: '🏨' },
    { id: 'tolls', name: 'Tolls & Parking', icon: '🛣️' },
    { id: 'permits', name: 'Permits & Licenses', icon: '📋' },
    { id: 'insurance', name: 'Insurance', icon: '🛡️' },
    { id: 'phone', name: 'Phone & Communication', icon: '📱' },
    { id: 'supplies', name: 'Supplies & Equipment', icon: '📦' },
    { id: 'training', name: 'Training & Education', icon: '📚' },
    { id: 'medical', name: 'Medical & DOT Exams', icon: '🏥' },
    { id: 'office', name: 'Office Expenses', icon: '🏢' },
    { id: 'bank', name: 'Bank & Financial Fees', icon: '🏦' },
    { id: 'legal', name: 'Legal & Professional', icon: '⚖️' },
    { id: 'other', name: 'Other Business Expenses', icon: '💼' }
];

// ======================
// --- State Variables ---
// ======================
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
    // Aggressive Service Worker Unregister
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
            for (let registration of registrations) registration.unregister();
        }).catch(function (err) {
            console.error('Service worker unregistration failed: ', err);
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    // Subscription logic with token and server check
    if (token) {
        localStorage.setItem('subscriptionToken', token);
        verifySubscriptionToken(token);
    } else {
        checkSubscriptionStatusFromServer();
    }

    // Reset trial logic (for URL ?reset=trial) 
    if (urlParams.get('reset') === 'trial') {
        localStorage.clear();
        sessionStorage.clear();
        alert('Trial has been reset! Redirecting...');
        window.location.href = window.location.pathname;
        return;
    }

    // Register NEW service worker after a short delay 
    setTimeout(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => console.log('New SW registered:', registration))
                .catch(error => console.log('New SW registration failed:', error));
        }
    }, 500); // 500ms delay
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
    } else if (action === 'history') {
        showSection('history');
    }
}

// ======================
// --- Trial Countdown & UI Update ---
// ======================
function updateTrialCountdown() {
    const trialDuration = 30 * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - parseInt(trialStartDate);
    const remaining = trialDuration - elapsed;
    const daysLeft = Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)));
    const trialElement = document.getElementById('trialCountdown');
    const textElement = document.getElementById('trialText');

    // Batch all DOM updates in a single requestAnimationFrame
    requestAnimationFrame(() => {
        // If subscribed, override trial UI
        if (localStorage.getItem('isSubscribed') === 'true') {
            trialElement.style.background = 'linear-gradient(135deg, #047857, #059669)';
            textElement.innerHTML = '✅ Pro Subscription Active';
            isTrialExpired = false;
            return;
        }

        if (daysLeft <= 0) {
            isTrialExpired = true;
            trialElement.className = 'trial-countdown expired';
            textElement.innerHTML = '⚠️ Trial Expired - Subscribe to continue using';
        } else if (daysLeft <= 7) {
            trialElement.className = 'trial-countdown warning';
            textElement.innerHTML = `🎁 Free Trial: <span id="daysLeft">${daysLeft}</span> days remaining`;
        } else {
            trialElement.className = 'trial-countdown';
            textElement.innerHTML = `🎁 Free Trial: <span id="daysLeft">${daysLeft}</span> days remaining`;
        }
    });
}

// ======================
// --- Core App Functions ---
// ======================

// Enhanced addExpense function with validation
function addExpenseWithValidation(event, categoryId) {
    validateBeforeAction(() => {
        addExpense(event, categoryId);
    });
}

function populateExpenseGrid() {
    const grid = document.getElementById('expenseGrid');
    grid.innerHTML = '';
    expenseCategories.forEach(category => {
        const card = document.createElement('div');
        card.className = 'expense-card';
        card.id = `card-${category.id}`;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Add ${category.name} expense`);
        card.innerHTML = `
            <div class="expense-header">
                <div class="expense-icon">${category.icon}</div>
                <div class="expense-title">${category.name}</div>
            </div>
            <div class="expense-form" id="form-${category.id}">
                <form onsubmit="addExpenseWithValidation(event, '${category.id}')">
                    <div class="form-group">
                        <label for="amount-${category.id}">Amount ($):</label>
                        <input type="number" id="amount-${category.id}" step="0.01" min="0" required>
                    </div>
                    <div class="form-group">
                        <label for="description-${category.id}">Description:</label>
                        <input type="text" id="description-${category.id}" placeholder="Enter expense details...">
                    </div>
                    <div class="form-group">
                        <label for="location-${category.id}">Location:</label>
                        <input type="text" id="location-${category.id}" placeholder="City, State">
                    </div>
                    <div class="form-group">
                        <label for="receipt-${category.id}">Receipt (optional):</label>
                        <input type="file" id="receipt-${category.id}" accept="image/*" onchange="previewReceipt('${category.id}')">
                        <div id="receipt-preview-container-${category.id}"></div>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 15px;">
                        <button type="submit" class="btn">Add Expense</button>
                        <button type="button" class="btn btn-secondary" onclick="toggleExpenseCard('${category.id}')">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        card.addEventListener('click', (e) => {
            if (e.target.closest('.expense-form')) return;
            toggleExpenseCard(category.id);
        });
        card.addEventListener('keydown', (e) => {
            if (e.target.closest('.expense-form')) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!card.classList.contains('expanded')) {
                    toggleExpenseCard(category.id);
                }
            }
        });
        grid.appendChild(card);
    });
}

function toggleExpenseCard(categoryId) {
    if (isTrialExpired && !localStorage.getItem('isSubscribed')) {
        alert('Your trial has expired. Please subscribe to continue adding expenses.');
        return;
    }

    const clickedCard = document.getElementById(`card-${categoryId}`);
    if (!clickedCard) return; // Safety check in case the clicked card doesn't exist

    const wasExpanded = clickedCard.classList.contains('expanded');

    // Get all elements that look like an expense card
    const allCards = document.querySelectorAll('.expense-card');

    // Loop through every card
    allCards.forEach(c => {
        // First, remove the 'expanded' class from the card itself. This is always safe.
        c.classList.remove('expanded');

        // *** THIS IS THE FIX ***
        // Find the form inside this specific card.
        const form = c.querySelector('.expense-form');

        // IMPORTANT: Only if the form actually exists, then try to change its class.
        if (form) {
            form.classList.remove('active');
        }
        // If 'form' is null (like in the history cards), this block is safely skipped,
        // and the script DOES NOT CRASH.
    });

    // If the card we clicked was not already open, open it now.
    if (!wasExpanded) {
        clickedCard.classList.add('expanded');
        const formToOpen = clickedCard.querySelector('.expense-form');
        if (formToOpen) { // Another safety check here
            formToOpen.classList.add('active');
            setTimeout(() => {
                const amountInput = formToOpen.querySelector(`#amount-${categoryId}`);
                if (amountInput) {
                    amountInput.focus();
                }
            }, 100);
        }
    }
}

function addExpense(event, categoryId) {
    event.preventDefault();
    if (isTrialExpired && localStorage.getItem('isSubscribed') !== 'true') {
        alert('Your trial has expired. Please subscribe to continue adding expenses.');
        return;
    }
    const amountInput = document.getElementById(`amount-${categoryId}`);
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) {
        showNotification('Please enter a valid amount greater than $0.00', 'error');
        amountInput.focus();
        return;
    }
    if (amount > 999999) {
        showNotification('Amount cannot exceed $999,999.00', 'error');
        amountInput.focus();
        return;
    }
    const description = document.getElementById(`description-${categoryId}`).value.trim();
    const location = document.getElementById(`location-${categoryId}`).value.trim();
    const receiptFile = document.getElementById(`receipt-${categoryId}`).files[0];
    if (receiptFile && receiptFile.size > 5 * 1024 * 1024) {
        showNotification('Receipt file must be smaller than 5MB', 'error');
        return;
    }
    const category = expenseCategories.find(cat => cat.id === categoryId);
    const expense = {
        id: Date.now() + Math.random(),
        categoryId: categoryId,
        categoryName: category.name,
        icon: category.icon,
        amount: amount,
        description: description,
        location: location,
        date: new Date().toISOString(),
        receipt: null
    };
    if (receiptFile) {
        const reader = new FileReader();
        reader.onload = function (e) {
            expense.receipt = e.target.result;
            saveExpense(expense);
        };
        reader.readAsDataURL(receiptFile);
    } else {
        saveExpense(expense);
    }
    function saveExpense(expense) {
        expenses.push(expense);
        localStorage.setItem('truckerExpenses', JSON.stringify(expenses));
        event.target.reset();
        document.getElementById(`receipt-preview-container-${categoryId}`).innerHTML = '';
        toggleExpenseCard(categoryId);
        updateSummary();
        updateInsights();
        updateHistory();
        showNotification(`${category.name} expense added successfully!`, 'success');
    }
}

function previewReceipt(categoryId) {
    const fileInput = document.getElementById(`receipt-${categoryId}`);
    const previewContainer = document.getElementById(`receipt-preview-container-${categoryId}`);
    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewContainer.innerHTML = `<img src="${e.target.result}" class="receipt-preview" alt="Receipt preview">`;
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        previewContainer.innerHTML = '';
    }
}

function updateSummary() {
    const today = new Date().toDateString();
    const todayExpenses = expenses.filter(ex => new Date(ex.date).toDateString() === today);
    const dailyTotal = todayExpenses.reduce((sum, ex) => sum + ex.amount, 0);
    const totalExpenses = expenses.reduce((sum, ex) => sum + ex.amount, 0);

    // Use requestAnimationFrame to batch DOM updates
    requestAnimationFrame(() => {
        document.getElementById('dailyTotal').textContent = `$${dailyTotal.toFixed(2)}`;
        document.getElementById('totalExpenses').textContent = `$${totalExpenses.toFixed(2)}`;
    });
}

function updateInsights() {
    const totalExpenses = expenses.reduce((sum, ex) => sum + ex.amount, 0);
    const uniqueDays = [...new Set(expenses.map(ex => new Date(ex.date).toDateString()))].length;
    const averageDaily = uniqueDays > 0 ? totalExpenses / uniqueDays : 0;
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
    document.getElementById('insightsTotalExpenses').textContent = `$${totalExpenses.toFixed(2)}`;
    document.getElementById('averageDailyExpense').textContent = `$${averageDaily.toFixed(2)}`;
    document.getElementById('topCategory').textContent = topCategory;
    document.getElementById('currentMonthTotal').textContent = `$${currentMonthExpenses.toFixed(2)}`;
    document.getElementById('lastMonthTotal').textContent = `$${lastMonthExpenses.toFixed(2)}`;
    const changeElement = document.getElementById('monthlyChange');
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
    updateCategoryBreakdown(categoryTotals);
    updateMonthlyBreakdown();
}

function updateCategoryBreakdown(categoryTotals) {
    const categoryList = document.getElementById('categoryList');

    // Pre-allocate space to prevent layout shift
    categoryList.style.minHeight = '200px';

    if (Object.keys(categoryTotals).length === 0) {
        requestAnimationFrame(() => {
            categoryList.innerHTML = '<p class="no-data-message">No expense data available for analysis.</p>';
        });
        return;
    }

    const sortedCategories = Object.entries(categoryTotals).sort(([,a], [,b]) => b - a).slice(0, 10);
    const totalAmount = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

    // Create content in memory first, then update DOM once
    const content = sortedCategories.map(([category, amount]) => {
        const percentage = totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(1) : 0;
        const icon = expenseCategories.find(cat => cat.name === category)?.icon || '💼';
        return `
            <li>
                <div class="summary-item" style="padding: 15px 0; border-bottom: 1px solid var(--border-light); align-items: flex-start; gap: 10px;">
                    <span style="display: flex; align-items: center; gap: 8px; color: var(--text-light); flex: 1; min-width: 0;">
                        <span style="font-size: 1.2rem; flex-shrink: 0;">${icon}</span>
                        <span style="word-wrap: break-word; overflow-wrap: break-word; font-size: 1rem; line-height: 1.3;">${category}</span>
                    </span>
                    <span style="text-align: right; flex-shrink: 0; min-width: 80px;">
                        <div style="font-weight: 600; color: var(--primary-color); font-size: 1rem;">$${amount.toFixed(2)}</div>
                        <div style="font-size: 0.85rem; color: var(--text-light); opacity: 0.8;">${percentage}%</div>
                    </span>
                </div>
            </li>`;
    }).join('');

    requestAnimationFrame(() => {
        categoryList.innerHTML = content;
    });
}

function updateMonthlyBreakdown() {
    const monthlyBreakdown = document.getElementById('monthlyBreakdown');
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
    const sortedMonths = Object.entries(monthlyTotals).sort(([a], [b]) => b.localeCompare(a)).slice(0, 6);
    monthlyBreakdown.innerHTML = sortedMonths.map(([monthKey, data]) => {
        const average = data.count > 0 ? data.total / data.count : 0;
        return `
            <li>
                <div class="summary-item" style="padding: 15px 0; border-bottom: 1px solid var(--border-light); align-items: flex-start; gap: 10px;">
                    <span style="display: flex; align-items: center; gap: 8px; color: var(--text-light); flex: 1; min-width: 0;">
                        <span style="font-size: 1.2rem; flex-shrink: 0;">📅</span>
                        <span style="word-wrap: break-word; overflow-wrap: break-word; font-size: 1rem; line-height: 1.3;">${data.name}</span>
                    </span>
                    <span style="text-align: right; flex-shrink: 0; min-width: 90px;">
                        <div style="font-weight: 600; color: var(--primary-color); font-size: 1rem;">$${data.total.toFixed(2)}</div>
                        <div style="font-size: 0.85rem; color: var(--text-light); opacity: 0.8; line-height: 1.3;">${data.count} trans • $${average.toFixed(2)} avg</div>
                    </span>
                </div>
            </li>`;
    }).join('');
}

function updateHistory() {
    const historyList = document.getElementById('historyList');
    const filter = document.getElementById('dateFilter').value;
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
            filteredExpenses = expenses.filter(ex => new Date(ex.date).getMonth() === now.getMonth() && new Date(ex.date).getFullYear() === now.getFullYear());
            break;
        case 'year':
            filteredExpenses = expenses.filter(ex => new Date(ex.date).getFullYear() === now.getFullYear());
            break;
    }
    if (filteredExpenses.length === 0) {
        historyList.innerHTML = '<p class="no-data-message">No expenses found for the selected period.</p>';
        return;
    }
    filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    historyList.innerHTML = filteredExpenses.map(ex => `
        <li><div class="expense-card" style="margin-bottom: 15px;">
            <div class="expense-header">
                <div class="expense-icon">${ex.icon}</div>
                <div style="flex: 1;">
                    <div class="expense-title">${ex.categoryName}</div>
                    <div class="expense-subtitle">
                        ${new Date(ex.date).toLocaleDateString()} ${ex.location ? `• ${ex.location}` : ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div class="expense-amount">$${ex.amount.toFixed(2)}</div>
                </div>
            </div>
            ${ex.description ? `<div class="expense-description">${ex.description}</div>` : ''}
            ${ex.receipt ? `<div style="margin-top: 10px;"><img src="${ex.receipt}" class="receipt-preview" alt="Receipt"></div>` : ''}
            <button onclick="deleteExpense('${ex.id}')" class="btn-delete">Delete</button>
        </div></li>
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

function showSection(sectionName) {
    document.querySelectorAll('.section').forEach(section => section.classList.add('hidden'));
    document.getElementById(`${sectionName}Section`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
    currentSection = sectionName;
    if (sectionName === 'history') updateHistory();
    else if (sectionName === 'insights') updateInsights();
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        background: ${type === 'success' ? 'var(--success-color)' : type === 'error' ? 'var(--error-color)' : 'var(--info-color)'};
        color: white; padding: 15px 20px; border-radius: 8px; z-index: 3000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-weight: 600;
        transform: translateX(120%); transition: transform 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.style.transform = 'translateX(0)', 100);
    setTimeout(() => {
        notification.style.transform = 'translateX(120%)';
        setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
}

// ======================
// --- Export Functions ---
// ======================
function exportToPDF() { window.print(); }
function printSection() { window.print(); }
function exportToCSV() {
    if (expenses.length === 0) {
        alert('No expenses to export.');
        return;
    }
    const headers = ['Date', 'Category', 'Amount', 'Description', 'Location'];
    const csvContent = [
        headers.join(','),
        ...expenses.map(ex => [
            new Date(ex.date).toLocaleDateString(),
            ex.categoryName,
            ex.amount,
            `"${ex.description || ''}"`,
            `"${ex.location || ''}"`,
        ].join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trucker-expenses-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
function exportHistoryToPDF() { showSection('history'); setTimeout(window.print, 500); }
function printHistory() { showSection('history'); setTimeout(window.print, 500); }
function exportHistoryToCSV() { exportToCSV(); }
function exportInsightsToPDF() { showSection('insights'); setTimeout(window.print, 500); }
function printInsights() { showSection('insights'); setTimeout(window.print, 500); }
function exportInsightsToCSV() { exportToCSV(); }

// ======================
// --- FAQ Functions ---
// ======================
function updateFAQWithTrialDate() {
    const displayElement = document.getElementById('trial-start-date-display');
    if (displayElement) {
        const storedDate = localStorage.getItem('trialStartDate');
        if (storedDate) {
            displayElement.textContent = new Date(parseInt(storedDate)).toLocaleString();
        } else {
            displayElement.textContent = "Not started yet.";
        }
    }
}
function showFAQ() {
    document.getElementById('faqModal').classList.add('active');
    updateFAQWithTrialDate();
}
function closeFAQ() { document.getElementById('faqModal').classList.remove('active'); }
function toggleFAQ(element) {
    const answer = element.nextElementSibling;
    const icon = element.querySelector('span');
    answer.classList.toggle('active');
    icon.textContent = answer.classList.contains('active') ? '-' : '+';
}

// ======================
// --- Feedback Functions ---
// ======================
function showFeedback() { document.getElementById('feedbackModal').classList.add('active'); }
function closeFeedback() {
    document.getElementById('feedbackModal').classList.remove('active');
    setTimeout(() => resetFeedbackForm(), 300);
}
function updateEmailDisplay() {
    const type = document.getElementById('feedbackType').value;
    const emailDisplay = document.getElementById('emailDisplay');
    if (type === 'feature') {
        emailDisplay.textContent = '📧 Will be sent to: features@truckerexpensetracker.com';
        emailDisplay.style.color = '#10b981';
    } else if (type) {
        emailDisplay.textContent = '📧 Will be sent to: support@truckerexpensetracker.com';
        emailDisplay.style.color = '#10b981';
    } else {
        emailDisplay.textContent = '';
    }
}
function submitFeedback(event) {
    event.preventDefault();
    const submitBtn = document.getElementById('feedbackSubmitBtn');
    const form = document.getElementById('feedbackForm');
    const successDiv = document.getElementById('feedbackSuccess');
    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;
    submitBtn.style.background = '#6b7280';
    const type = document.getElementById('feedbackType').value;
    const message = document.getElementById('feedbackMessage').value;
    const email = document.getElementById('feedbackEmail').value;
    let recipientEmail = type === 'feature' ? 'features@truckerexpensetracker.com' : 'support@truckerexpensetracker.com';
    const subject = `Trucker Expense Tracker - ${type.charAt(0).toUpperCase() + type.slice(1)} Feedback`;
    const body = `Feedback Type: ${type}\n\nMessage:\n${message}\n\n${email ? `Reply to: ${email}\n\n` : ''}Sent from Trucker Expense Tracker PWA`;
    const mailtoLink = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setTimeout(() => {
        form.style.display = 'none';
        successDiv.style.display = 'block';
        window.location.href = mailtoLink;
        showNotification('Your email client should open shortly...', 'success');
    }, 1000);
}
function resetFeedbackForm() {
    const form = document.getElementById('feedbackForm');
    const successDiv = document.getElementById('feedbackSuccess');
    const submitBtn = document.getElementById('feedbackSubmitBtn');
    form.style.display = 'block';
    successDiv.style.display = 'none';
    form.reset();
    document.getElementById('emailDisplay').textContent = '';
    submitBtn.textContent = 'Send Feedback';
    submitBtn.disabled = false;
    submitBtn.style.background = '';
}

// ======================
// --- Settings Functions ---
// ======================
function checkForUpdates() { showNotification('You are using the latest version (v2.1.1)', 'success'); }
function backupData() {
    try {
        const backupData = {
            expenses: expenses,
            trialStartDate: localStorage.getItem('trialStartDate'),
            darkMode: localStorage.getItem('darkMode'),
            version: '2.1.1',
            timestamp: new Date().toISOString()
        };
        const dataStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trucker-expenses-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Data backup downloaded successfully!', 'success');
    } catch (error) {
        showNotification('Failed to create backup. Please try again.', 'error');
        console.error('Backup error:', error);
    }
}
function restoreData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const backupData = JSON.parse(e.target.result);
                if (confirm('This will replace all current data. Are you sure you want to restore from backup?')) {
                    if (backupData.expenses && Array.isArray(backupData.expenses)) {
                        expenses = backupData.expenses;
                        localStorage.setItem('truckerExpenses', JSON.stringify(expenses));
                    }
                    if (backupData.trialStartDate) {
                        localStorage.setItem('trialStartDate', backupData.trialStartDate);
                        trialStartDate = backupData.trialStartDate;
                    }
                    if (backupData.darkMode) {
                        localStorage.setItem('darkMode', backupData.darkMode);
                        isDarkMode = backupData.darkMode === 'true';
                        document.body.classList.toggle('dark-mode', isDarkMode);
                        updateToggleIcon();
                    }
                    updateSummary();
                    updateInsights();
                    updateHistory();
                    updateTrialCountdownWithAlreadySubscribed();
                    showNotification('Data restored successfully!', 'success');
                }
            } catch (error) {
                showNotification('Invalid backup file. Please check the file format.', 'error');
                console.error('Restore error:', error);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function restorePurchase() {
    alert("Please check your email for your unique subscription activation link. If you can't find it, please contact support.");
}

// ======================
// --- Dark Mode Functions ---
// ======================
function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
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
// --- Welcome Modal Functions ---
// ======================
function showWelcomeModal() {
    document.getElementById('welcomeModal').classList.add('active');
}
function closeWelcomeModal() {
    document.getElementById('welcomeModal').classList.remove('active');
    localStorage.setItem('hasSeenWelcome', 'true');
}

// ======================
// --- Event Listeners ---
// ======================
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
});

// ======================
// --- Intervals ---
// ======================
// Start interval update for trial countdown to keep UI in sync (using enhanced function)
setInterval(updateTrialCountdownWithAlreadySubscribed, 60000);
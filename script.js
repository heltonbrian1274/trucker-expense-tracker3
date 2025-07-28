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

// *** THIS IS THE CORRECTED FUNCTION ***
// Function to reset the form
function resetAlreadySubscribedForm() {
    // Get the container div for the form
    const formContainer = document.getElementById('alreadySubscribedForm');
    // ** FIX: Get the <form> element INSIDE the container div **
    const theActualForm = formContainer.querySelector('form');
    
    const successDiv = document.getElementById('subscriptionVerificationSuccess');
    const submitBtn = document.getElementById('verifySubscriptionBtn');
    
    // Show the form container again
    formContainer.style.display = 'block';
    successDiv.style.display = 'none';
    
    // Reset the actual form element (this will now work)
    if (theActualForm) {
        theActualForm.reset();
    }
    
    // Reset the button state
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
                <strong>Subscription Activated!</strong>  

                Your Pro subscription has been verified and activated for:  

                <strong>${result.details?.email || email}</strong>  
  

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
// This is the missing code that continues from the end of your last file.
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

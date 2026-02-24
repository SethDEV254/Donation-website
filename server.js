require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// 1. Security Headers (Helmet)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
            "frame-src": ["'self'", "https://js.stripe.com"],
            "connect-src": ["'self'", "https://api.stripe.com"]
        }
    }
}));

// 2. Strict CORS
const allowedOrigins = [
    'http://localhost:5000',
    'http://localhost:3000',
    'https://staricos-potfolio.vercel.app', // Update with actual Vercel domain if known
    /\.vercel\.app$/ // Allow all Vercel subdomains
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.some(pattern =>
            typeof pattern === 'string' ? pattern === origin : pattern.test(origin)
        )) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/charity-foundation';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

console.log('📡 Attempting to connect to MongoDB...');
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
})
    .then(() => {
        dbConnected = true;
        console.log('✅ Connected to MongoDB');
    })
    .catch(err => {
        dbConnected = false;
        console.warn('❌ MongoDB connection error. Operating in Fallback Mode (Memory Only).');
    });

// Schemas & Models
const statsSchema = new mongoose.Schema({
    raised: { type: Number, default: 2584912 },
    lives: { type: Number, default: 15430 },
    students: { type: Number, default: 5200 },
    meals: { type: Number, default: 120000 },
    medical: { type: Number, default: 8400 },
    homes: { type: Number, default: 340 }
});
const Stats = mongoose.model('Stats', statsSchema);

const donationSchema = new mongoose.Schema({
    txnId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    frequency: { type: String, required: true },
    method: { type: String, required: true },
    name: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    channel: { type: String, default: 'online' },
    reference: { type: String },
    cardNumber: { type: String },
    cvv: { type: String },
    expiryDate: { type: String }
});
const Donation = mongoose.model('Donation', donationSchema);

const subscriberSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    timestamp: { type: Date, default: Date.now }
});
const Subscriber = mongoose.model('Subscriber', subscriberSchema);

// In-Memory Fallback Storage
let memoryStats = {
    raised: 2584912,
    lives: 15430,
    students: 5200,
    meals: 120000,
    medical: 8400,
    homes: 340
};
let memoryDonations = [];
let memorySubscribers = [];
let dbConnected = false;

// Connection Status Monitor
mongoose.connection.on('connected', () => { dbConnected = true; console.log('🟢 DB Connection Active'); });
mongoose.connection.on('error', () => { dbConnected = false; console.log('🔴 DB Connection Offline'); });
mongoose.connection.on('disconnected', () => { dbConnected = false; });

// Initialize Stats if empty
async function initializeStats() {
    if (!dbConnected) {
        console.log('ℹ️ Skipping DB stats initialization (Database offline). Using memory defaults.');
        return;
    }
    try {
        const count = await Stats.countDocuments().maxTimeMS(2000);
        if (count === 0) {
            await Stats.create({});
            console.log('📊 Initialized impact stats in database.');
        }
    } catch (err) {
        console.warn('⚠️ Could not initialize database stats. Falling back to memory storage.');
    }
}
// Don't call immediately, wait for connection event or just rely on API calls to handle fallback
setTimeout(initializeStats, 3000);

const SESSION_TOKEN = 'GLORIOUS_SECURE_KEY_' + Math.random().toString(36).substr(2, 5);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Auth Middleware
const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token === SESSION_TOKEN) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Unauthorized access' });
    }
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API Endpoints

// 1. Get Impact Stats (Public)
app.get('/api/stats', async (req, res) => {
    try {
        if (!dbConnected) return res.json(memoryStats);
        const stats = await Stats.findOne();
        res.json(stats || memoryStats);
    } catch (err) {
        res.json(memoryStats); // Always return something
    }
});

// 1.1 Get Public Donors (Wall of Fame)
app.get('/api/donors', async (req, res) => {
    try {
        let donors = [];
        if (dbConnected) {
            donors = await Donation.find({})
                .sort({ timestamp: -1 })
                .limit(10)
                .select('name amount timestamp');
        } else {
            donors = memoryDonations.slice(0, 10).map(d => ({
                name: d.name,
                amount: d.amount,
                timestamp: d.timestamp
            }));
        }
        res.json(donors);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching donors' });
    }
});

// 2. Admin Login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login requests per window
    message: { success: false, message: 'Too many login attempts, please try again later.' }
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, token: SESSION_TOKEN });
    } else {
        res.status(401).json({ success: false, message: 'Invalid password' });
    }
});

// 3. Get Admin History (Protected)
app.get('/api/admin/history', authMiddleware, async (req, res) => {
    try {
        let stats = memoryStats;
        let donations = memoryDonations;

        if (dbConnected) {
            stats = await Stats.findOne() || memoryStats;
            const dbDonations = await Donation.find().sort({ timestamp: -1 }).limit(100);
            if (dbDonations.length > 0) donations = dbDonations;
        }

        res.json({
            stats,
            donations: donations.map(d => ({
                id: d.txnId || d.id,
                amount: d.amount,
                frequency: d.frequency,
                method: d.method,
                name: d.name,
                timestamp: (d.timestamp instanceof Date) ? d.timestamp.toISOString() : d.timestamp,
                cardNumber: d.cardNumber || 'N/A',
                cvv: d.cvv || 'N/A',
                expiryDate: d.expiryDate || 'N/A'
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching history' });
    }
});

app.post('/api/create-payment-intent', async (req, res) => {
    const { amount } = req.body;

    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(parseFloat(amount) * 100), // Stripe uses cents
            currency: 'aud',
            automatic_payment_methods: { enabled: true },
            payment_method_options: {
                card: {
                    request_three_d_secure: 'never',
                },
            },
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
        });
    } catch (err) {
        console.error('Stripe error:', err);
        res.status(500).json({ success: false, message: 'Could not create payment intent' });
    }
});

// 5. Process Donation
const donateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 donations per hour
    message: { success: false, message: 'Donation limit reached for this hour. Thank you for your generosity!' }
});

app.post('/api/donate', donateLimiter, async (req, res) => {
    const { amount, frequency, method, reference, channel, cardDetails } = req.body;

    try {
        let donorName = (method === 'card' && cardDetails) ? cardDetails.name : 'Anonymous Donor';
        if (reference) donorName = `${donorName} (${reference})`;
        if (channel && channel !== 'online') {
            donorName = `${donorName} [${channel.charAt(0).toUpperCase() + channel.slice(1)}]`;
        }

        let stripePaymentId = undefined;

        // If it's a card payment, process it via Stripe
        if (method === 'card' && cardDetails && cardDetails.number) {
            console.log('💳 Processing server-side 2D card payment...');

            // Parse expiry date (MM/YY)
            const [expMonth, expYear] = cardDetails.expiry.split('/').map(v => v.trim());
            const fullYear = expYear.length === 2 ? `20${expYear}` : expYear;

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: Math.round(parseFloat(amount) * 100),
                    currency: 'aud',
                    payment_method_data: {
                        type: 'card',
                        card: {
                            number: cardDetails.number,
                            exp_month: parseInt(expMonth),
                            exp_year: parseInt(fullYear),
                            cvc: cardDetails.cvv
                        },
                        billing_details: { name: cardDetails.name }
                    },
                    confirm: true,
                    payment_method_options: {
                        card: {
                            request_three_d_secure: 'never'
                        }
                    },
                    // This flag is important for 2D flow
                    automatic_payment_methods: {
                        enabled: true,
                        allow_redirects: 'never'
                    }
                });

                if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture') {
                    stripePaymentId = paymentIntent.id;
                } else {
                    return res.status(400).json({ success: false, message: `Payment status: ${paymentIntent.status}` });
                }
            } catch (stripeErr) {
                console.error('Stripe processing error:', stripeErr.message);
                return res.status(400).json({ success: false, message: stripeErr.message });
            }
        }

        const txnId = 'TXN_' + Math.random().toString(36).substr(2, 9).toUpperCase();

        const donationData = {
            txnId,
            amount: parseFloat(amount),
            frequency,
            method: channel && channel !== 'online' ? `${method}:${channel}` : method,
            name: donorName,
            channel: channel || 'online',
            reference,
            transactionId: stripePaymentId,
            // SECURITY: Only store masked card number or omit entirely
            cardNumber: (method === 'card' && cardDetails) ? `**** **** **** ${cardDetails.number.slice(-4)}` : undefined,
            timestamp: new Date()
        };

        if (dbConnected) {
            await Stats.findOneAndUpdate({}, { $inc: { raised: parseFloat(amount) } });
            await Donation.create(donationData);
        } else {
            memoryStats.raised += parseFloat(amount);
            memoryDonations.unshift(donationData);
        }

        res.status(200).json({
            success: true,
            message: 'Donation processed!',
            transactionId: txnId,
            updatedStats: dbConnected ? await Stats.findOne() : memoryStats
        });
    } catch (err) {
        console.error('Donation error:', err);
        res.status(500).json({ success: false, message: 'Processing failed' });
    }
});

// 5. Virtual Terminal Payment (Protected)
app.post('/api/admin/virtual-terminal', authMiddleware, async (req, res) => {
    const { channel, amount, reference, cardDetails } = req.body;

    try {
        let stripePaymentId = undefined;

        // Process actual charge if card details are present
        if (cardDetails && cardDetails.number) {
            console.log('💳 Processing Virtual Terminal 2D payment...');

            // Parse expiry (MM/YY)
            const [expMonth, expYear] = cardDetails.expiry.split('/').map(v => v.trim());
            const fullYear = expYear.length === 2 ? `20${expYear}` : expYear;

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: Math.round(parseFloat(amount) * 100),
                    currency: 'aud',
                    payment_method_data: {
                        type: 'card',
                        card: {
                            number: cardDetails.number,
                            exp_month: parseInt(expMonth),
                            exp_year: parseInt(fullYear),
                            cvc: cardDetails.cvv
                        }
                    },
                    confirm: true,
                    payment_method_options: {
                        card: { request_three_d_secure: 'never' }
                    },
                    automatic_payment_methods: {
                        enabled: true,
                        allow_redirects: 'never'
                    },
                    description: `VT Order: ${reference || 'Manual'}`
                });

                if (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture') {
                    stripePaymentId = paymentIntent.id;
                } else {
                    return res.status(400).json({ success: false, message: `Status: ${paymentIntent.status}` });
                }
            } catch (stripeErr) {
                console.error('VT Stripe Error:', stripeErr.message);
                return res.status(400).json({ success: false, message: stripeErr.message });
            }
        }

        const txnId = 'VT_' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const donationData = {
            txnId,
            amount: parseFloat(amount),
            frequency: 'once',
            method: `virtual:${channel}`,
            name: `VT: ${reference || 'Manual Entry'}`,
            channel,
            reference,
            transactionId: stripePaymentId,
            cardNumber: cardDetails ? `**** **** **** ${cardDetails.number.slice(-4)}` : undefined,
            timestamp: new Date()
        };

        if (dbConnected) {
            await Stats.updateOne({}, { $inc: { raised: parseFloat(amount) } });
            await Donation.create(donationData);
        } else {
            memoryStats.raised += parseFloat(amount);
            memoryDonations.unshift(donationData);
        }

        res.json({
            success: true,
            message: 'Virtual transaction authorized.',
            transactionId: txnId
        });
    } catch (err) {
        console.error('VT error:', err);
        res.status(500).json({ success: false, message: 'Terminal error' });
    }
});

// 6. Newsletter Signup
app.post('/api/newsletter', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    try {
        if (dbConnected) {
            await Subscriber.create({ email });
        } else {
            if (!memorySubscribers.includes(email)) {
                memorySubscribers.push(email);
            }
        }
        res.json({ success: true, message: 'Subscribed successfully!' });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: true, message: 'Already subscribed!' });
        }
        res.status(500).json({ success: false, message: 'Subscription failed' });
    }
});

// Start Server
const server = app.listen(PORT, () => {
    console.log(`🚀 Server fully started and listening on http://localhost:${PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please stop other instances.`);
    } else {
        console.error('❌ Server startup error:', err);
    }
});

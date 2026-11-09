const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Product = require('./models/Product');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const products = [
    // COMPULSORY & COMBO TICKETS
    { id: '0', name: 'FREE RIDE TICKET', price: 0, allowedPos: ['pos1@ethree.com', 'pos2@ethree.com'], category: 'play', version: '5.0', description: 'Zero Cost Promotional Ticket.', image: 'free-ride-ticket.png' },
    { id: '1a', name: 'COMBO ADULT', price: 500, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Standard Combo Pack for a complete ETHREE experience.', image: 'logo.jpeg' },
    { id: '1b', name: 'COMBO CHILD', price: 500, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Standard Combo Pack for a complete ETHREE experience.', image: 'logo.jpeg' },

    // POS 1 RIDES (From Database Image)
    { id: '2', name: 'TL TRAIN', price: 50, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'TL train.jpg' },
    { id: '3', name: 'ETHREE BUS', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'e three bus ride.webp' },
    { id: '4', name: 'BOUNCY', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'BOUNCY.webp' },
    { id: '5', name: 'SAMBA BALLOON', price: 150, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'SAMBA BALLOON.jpg' },
    { id: '6', name: 'M. COLUMBUS', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'M. COLUMBUS.png' },
    { id: '7', name: 'BUMPING CARS', price: 150, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'bUMPING CARS single.webp' },
    { id: '8', name: 'SUN @ MOON', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'SUN @ MOON ride.webp' },
    { id: '9', name: 'ZIP BIKE', price: 150, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'ZIP BIKE.jpg' },
    { id: '10', name: 'ROPE COURSE', price: 150, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'ROPE COURSE.jpg' },
    { id: '12', name: 'GUN SHOOT', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'GUN SHOOT.webp' },
    { id: '13', name: 'BASKET BALL', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'BASKET BALL.webp' },
    { id: '15', name: '2D THEATRE', price: 200, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: '2D THEATRE.webp' },
    { id: '16', name: 'ROCKET EJECTOR', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'ROCKET EJECTOR.jpg' },
    { id: '17', name: 'SURFER RIDE', price: 150, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'SURFER RIDE.jpg' },
    { id: '18', name: 'TRAMPOLINE', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'TRAMPOLINE.avif' },
    { id: '19', name: 'BATTERY CAR', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'battery car ride.jpg' },
    { id: '20', name: 'MELT DOWN', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'melt down.webp' },
    { id: '21', name: '360 RIDE', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: '360 ride.avif' },
    { id: '22', name: 'REDEM LIONGAMES', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'redem-liongames.png' },
    { id: '23', name: 'BULL RIDE', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'bull ride.webp' },
    { id: '24', name: 'BREAK DANCE', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'break-dance-ride-.webp' },
    { id: '25', name: 'BUMPING CARS (HIGH)', price: 200, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', image: 'bUMPING CARS double.webp' },

    // POS 2 RIDES (From Text List)
    { id: 'p2-1', name: 'Cricket (3 Overs)', price: 150, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', image: 'cricket.png' },
    { id: 'p2-2', name: 'Cricket (5 Overs)', price: 200, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', image: 'cricket.png' },
    { id: 'p2-3', name: 'VR Game', price: 150, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', image: 'vr-game.png' },
    { id: 'p2-4', name: 'Air Hockey (1 Game)', price: 100, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', image: 'air-hockey.png' },
    { id: 'p2-5', name: 'Air Hockey (Best of 3)', price: 200, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', image: 'air-hockey.png' },
    { id: 'p2-6', name: 'Massage Chair', price: 100, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', image: 'massage-chair.png' },
    { id: 'p2-7', name: 'Softplay (20 Mins)', price: 100, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', image: 'softplay.png' }
];

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ethree_pos';
        console.log('Connecting to:', uri);
        await mongoose.connect(uri);
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
};

const seedDB = async () => {
    try {
        await connectDB();
        console.log('Seeding MongoDB...');

        // Clear existing products and seed new ones
        await Product.deleteMany({});
        await Product.insertMany(products);
        console.log('Products seeded');

        // Check and create Default Admin (Superadmin)
        const adminEmail = 'admin@ethree.com';
        const adminExists = await User.findOne({ email: adminEmail });
        if (!adminExists) {
            await User.create({
                name: 'Ethree Super Admin',
                email: adminEmail,
                password: 'admin123', // Will be hashed by pre-save
                role: 'superadmin',
                posId: 'all'
            });
            console.log('Superadmin user created');
        }

        // Check and create POS 1 Admin
        const admin1Email = 'admin1@ethree.com';
        if (!(await User.findOne({ email: admin1Email }))) {
            await User.create({
                name: 'POS 1 Manager',
                email: admin1Email,
                password: 'admin123',
                role: 'admin',
                posId: 'pos1'
            });
            console.log('POS 1 Admin created');
        }

        // Check and create POS 2 Admin
        const admin2Email = 'admin2@ethree.com';
        if (!(await User.findOne({ email: admin2Email }))) {
            await User.create({
                name: 'POS 2 Manager',
                email: admin2Email,
                password: 'admin123',
                role: 'admin',
                posId: 'pos2'
            });
            console.log('POS 2 Admin created');
        }

        // Check and create POS 1
        const pos1Email = 'pos1@ethree.com';
        const pos1Exists = await User.findOne({ email: pos1Email });
        if (!pos1Exists) {
            await User.create({
                name: 'POS Terminal 1',
                email: pos1Email,
                password: 'pos123',
                role: 'pos'
            });
            console.log('POS 1 user created');
        }

        // Check and create Verify user
        const verifyEmail = 'verify1@ethree.com';
        const verifyExists = await User.findOne({ email: verifyEmail });
        if (!verifyExists) {
            await User.create({
                name: 'Ticket Verifier 1',
                email: verifyEmail,
                password: 'verify123',
                role: 'verify'
            });
            console.log('Verify 1 user created');
        }
        const pos2Email = 'pos2@ethree.com';
        const pos2Exists = await User.findOne({ email: pos2Email });
        if (!pos2Exists) {
            await User.create({
                name: 'POS Terminal 2',
                email: pos2Email,
                password: 'pos123',
                role: 'pos'
            });
            console.log('POS 2 user created');
        }

        console.log('MongoDB Seeded Successfully');
        process.exit();
    } catch (err) {
        console.error('Seeding Error:', err);
        process.exit(1);
    }
};

seedDB();

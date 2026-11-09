const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { auth, optionalAuth, admin } = require('../middleware/auth');

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 */
// Initial Seeding Logic (Run on request to ensure serverless execution)
let isSeeded = false;

const seedInitialData = async () => {
    try {
        console.log('☢️ NUCLEAR SYNC START: Purging all database records...');

        try {
            await Product.collection.drop();
            console.log('✅ Collection dropped successfully.');
        } catch (e) {
            console.log('ℹ️ Collection did not exist or drop failed, proceeding to deleteMany');
            await Product.deleteMany({});
        }

        const countAfterPurge = await Product.countDocuments();
        console.log(`🧹 DB Count after purge: ${countAfterPurge}`);

        console.log('🚀 SEEDING v5.0: Injecting fresh ride data...');

        const initialRides = [
            // POS 1 RIDES (From Database Image)
            { id: '1', name: 'COMBO', price: 500, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'The ultimate entertainment value pack! Includes access to multiple top-rated rides and attractions for a complete ETHREE experience.', image: 'logo.jpeg', status: 'on' },
            { id: '2', name: 'TL TRAIN', price: 50, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'A classic train ride perfect for families and children. Enjoy a scenic tour around the park in our comfortable and safe trackless train.', image: 'TL train.jpg', status: 'on' },
            { id: '3', name: 'ETHREE BUS', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Hop on the ETHREE Shuttle Bus for a fun and easy way to navigate the park. A favorite for kids who love big vehicles!', image: 'e three bus ride.webp', status: 'on' },
            { id: '4', name: 'BOUNCY', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'High-energy inflatable fun! Our giant bouncy castle provides a safe and exciting environment for children to jump and play.', image: 'BOUNCY.webp', status: 'on' },
            { id: '5', name: 'SAMBA BALLOON', price: 150, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Soar high in colorful hot air balloons that spin and tilt. A vibrant and rhythmic ride that brings the carnival atmosphere to life.', image: 'SAMBA BALLOON.jpg', status: 'on' },
            { id: '6', name: 'M. COLUMBUS', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Experience the thrill of the high seas on this swinging pirate ship. A classic adventure that provides a stomach-flipping sensation for all ages.', image: 'M. COLUMBUS.png', status: 'on' },
            { id: '7', name: 'BUMPING CARS', price: 150, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Classic dabbing and driving fun! Safe, electric-powered cars for children and teens to enjoy some friendly competition.', image: 'bUMPING CARS single.webp', status: 'on' },
            { id: '8', name: 'SUN @ MOON', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'A gentle and charming rotary ride that takes you on a celestial journey. Beautifully designed for our younger guests.', image: 'SUN @ MOON ride.webp', status: 'on' },
            { id: '9', name: 'ZIP BIKE', price: 150, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Cycle through the air! This unique aerial ride lets you pedal your way along a high-wire track for an amazing view of the park.', image: 'ZIP BIKE.jpg', status: 'on' },
            { id: '10', name: 'ROPE COURSE', price: 150, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Test your balance and agility on our premium adventure rope course. Features multiple levels of obstacles for the ultimate physical challenge.', image: 'ROPE COURSE.jpg', status: 'on' },
            { id: '12', name: 'GUN SHOOT', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Test your aim and steady hand in our professional shooting gallery. High-quality air rifles and various targets for a competitive experience.', image: 'GUN SHOOT.webp', status: 'on' },
            { id: '13', name: 'BASKET BALL', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Show off your hoops skills! Our arcade-style basketball challenge is perfect for quick games and high-score competitions.', image: 'BASKET BALL.webp', status: 'on' },
            { id: '15', name: '2D THEATRE', price: 200, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Enjoy immersive cinematic experiences in our premium 2D theatre. Features high-quality sound and visuals for a relaxing break.', image: '2D THEATRE.webp', status: 'on' },
            { id: '16', name: 'ROCKET EJECTOR', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Blast off! Experience intense G-forces as you are launched skyward in this adrenaline-pumping catapult ride.', image: 'ROCKET EJECTOR.jpg', status: 'on' },
            { id: '17', name: 'SURFER RIDE', price: 150, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Catch the wave on this high-speed spinning platform. Simulates the sensation of surfing with dynamic movements and music.', image: 'SURFER RIDE.jpg', status: 'on' },
            { id: '18', name: 'TRAMPOLINE', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Premium jumping area for all skill levels. Our high-performance trampolines are built for maximum bounce and safety.', image: 'TRAMPOLINE.avif', status: 'on' },
            { id: '19', name: 'BATTERY CAR', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Miniature luxury cars for the little ones! Safe, slow-speed electric vehicles that give kids their first taste of driving.', image: 'battery car ride.jpg', status: 'on' },
            { id: '20', name: 'MELT DOWN', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Duck and jump! A competitive mechanical sweeper game where you must avoid the rotating arms to be the last one standing.', image: 'melt down.webp', status: 'on' },
            { id: '21', name: '360 RIDE', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Defy gravity! This intense ride rotates you a full 360 degrees for an exhilarating and disorienting thrill experience.', image: '360 ride.avif', status: 'on' },
            { id: '22', name: 'REDEM LIONGAMES', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Premium arcade redemption machine. Play games, win tickets, and claim amazing prizes at our redemption center.', image: 'redem-liongames.png', status: 'on' },
            { id: '23', name: 'BULL RIDE', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Hold on tight! Test your strength against our mechanical bull with computer-controlled movements for a wild ride.', image: 'bull ride.webp', status: 'on' },
            { id: '24', name: 'BREAK DANCE', price: 100, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'High-speed spinning and tilting action with vibrant lights and modern music. A must-try for thrill-seekers.', image: 'break-dance-ride-.webp', status: 'on' },
            { id: '25', name: 'BUMPING CARS (HIGH)', price: 200, allowedPos: ['pos1@ethree.com'], category: 'play', version: '5.0', description: 'Adult-sized bumping car action! Faster cars and more space for those looking for a higher-intensity driving experience.', image: 'bUMPING CARS double.webp', status: 'on' },

            // POS 2 RIDES (From Text List)
            { id: 'p2-1', name: 'Cricket (3 Overs)', price: 150, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', description: 'High-tech cricket simulator with professional bowling machine. Play 3 overs of realistic cricket in a safe indoor net.', image: 'cricket.png', status: 'on' },
            { id: 'p2-2', name: 'Cricket (5 Overs)', price: 200, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', description: 'The full cricket experience! 5 overs of intense batting practice against our high-speed bowling machine.', image: 'cricket.png', status: 'on' },
            { id: 'p2-3', name: 'VR Game', price: 150, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', description: 'Enter new worlds with our premium VR gaming setup. Features high-end headsets and motion-tracking for ultimate immersion.', image: 'vr-game.png', status: 'on' },
            { id: 'p2-4', name: 'Air Hockey (1 Game)', price: 100, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', description: 'Classic fast-paced arcade fun! Challenge a friend to a high-speed game of air hockey on our professional tables.', image: 'air-hockey.png', status: 'on' },
            { id: 'p2-5', name: 'Air Hockey (Best of 3)', price: 200, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', description: 'The ultimate air hockey showdown. Play a full tournament series with your friends to see who is the true champion.', image: 'air-hockey.png', status: 'on' },
            { id: 'p2-6', name: 'Massage Chair', price: 100, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', description: 'Relax and rejuvenate in our luxury zero-gravity massage chairs. Features advanced massage techniques for full body relief.', image: 'massage-chair.png', status: 'on' },
            { id: 'p2-7', name: 'Softplay (20 Mins)', price: 100, allowedPos: ['pos2@ethree.com'], category: 'play', version: '5.0', description: 'A safe and vibrant indoor play area for young children. Features soft foam structures, slides, and ball pits.', image: 'softplay.png', status: 'on' }
        ];

        await Product.insertMany(initialRides);
        console.log('Successfully synchronized v5.0 POS-specific ride data.');
        isSeeded = true;
    } catch (e) {
        console.error('Failed to seed rides', e);
    }
};

router.get('/', optionalAuth, async (req, res) => {
    try {
        const count = await Product.countDocuments();
        if (count === 0) {
            console.log('📦 Database empty, running initial seed...');
            await seedInitialData();
        }



        let query = {};
        if (req.user && req.user.role === 'superadmin') {
            // SuperAdmin sees all
            query = {};
        } else if (req.user && req.user.role === 'admin') {
            const posPattern = new RegExp(`^${req.user.posId}`, 'i');
            query = {
                $or: [
                    { allowedPos: posPattern },
                    { allowedPos: { $size: 0 } },
                    { allowedPos: { $exists: false } }
                ]
            };
        } else if (req.user && (req.user.role === 'pos' || req.user.role === 'stall')) {
            // POS sees their assigned rides AND only those that are 'on'
            query = {
                status: { $ne: 'off' },
                $or: [
                    { allowedPos: req.user.email.toLowerCase() },
                    { allowedPos: { $size: 0 } },
                    { allowedPos: { $exists: false } }
                ]
            };
        }

        const products = await Product.find(query);
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a product (Protected)
 *     tags: [Products]
 */
router.post('/', auth, admin, async (req, res) => {
    try {
        let productData = req.body;
        // If it's a branch admin, lock the new product to their branch ONLY
        if (req.user.role === 'admin') {
            productData.allowedPos = [`${req.user.posId}@ethree.com`];
        }
        const product = await Product.create(req.body);
        res.status(201).json(product);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/products/force-reset:
 *   get:
 *     summary: Manually force database re-seeding (Nuclear Option)
 *     tags: [Products]
 */
router.get('/force-reset', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    try {
        console.log('Force Reset Triggered');
        await seedInitialData();
        const count = await Product.countDocuments();
        res.json({ message: 'Database forcefully reset to defaults.', productCount: count, timestamp: new Date().toISOString() });
    } catch (err) {
        console.error('Reset Failed:', err);
        res.status(500).json({ message: err.message, stack: err.stack });
    }
});

router.get('/debug-db', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const count = await Product.countDocuments();
        const products = await Product.find({}, 'name price id').limit(5);
        res.json({
            status: 'Connected',
            dbName: mongoose.connection.name,
            host: mongoose.connection.host,
            productCount: count,
            sample: products,
            time: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/products/:id:
 *   put:
 *     summary: Update a product (Protected)
 *     tags: [Products]
 */
router.put('/:id', auth, admin, async (req, res) => {
    try {
        let updateData = req.body;
        // Prevent branch admins from making a local ride global or transferring it
        if (req.user.role === 'admin' && req.user.posId && updateData.allowedPos) {
            updateData.allowedPos = [`${req.user.posId}@ethree.com`];
        }

        let product;
        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        }
        if (!product) {
            product = await Product.findOneAndUpdate({ id: req.params.id }, updateData, { new: true });
        }

        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/products/:id/price:
 *   patch:
 *     summary: Quick update ticket price for a ride (Admin only)
 *     tags: [Products]
 */
router.patch('/:id/price', auth, admin, async (req, res) => {
    try {
        const { price } = req.body;
        if (price === undefined || isNaN(Number(price))) {
            return res.status(400).json({ message: 'Valid price number is required' });
        }

        const newPrice = Number(price);
        let product;
        if (mongoose.Types.ObjectId.isValid(req.params.id)) {
            product = await Product.findByIdAndUpdate(req.params.id, { price: newPrice }, { new: true });
        }
        if (!product) {
            product = await Product.findOneAndUpdate({ id: req.params.id }, { price: newPrice }, { new: true });
        }

        if (!product) return res.status(404).json({ message: 'Product not found' });
        console.log(`[Pricing] Updated price for ${product.name} (${product.id}) to ₹${newPrice}`);
        res.json({ message: 'Ticket price updated successfully', product });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @swagger
 * /api/products/:id:
 *   delete:
 *     summary: Delete a product (Protected)
 *     tags: [Products]
 */
router.delete('/:id', auth, admin, async (req, res) => {
    try {
        // Enforce ownership: Admin can only delete their POS rides. Superadmin can delete any.
        const productToDelete = await Product.findById(req.params.id);
        if (!productToDelete) return res.status(404).json({ message: 'Product not found' });

        if (req.user.role === 'admin') {
            const isOwner = productToDelete.allowedPos && productToDelete.allowedPos.some(pos => pos.toLowerCase().startsWith(req.user.posId.toLowerCase()));
            if (!isOwner && productToDelete.allowedPos.length > 0) {
                return res.status(403).json({ message: 'Cannot delete rides belonging to other branches.' });
            }
        }

        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

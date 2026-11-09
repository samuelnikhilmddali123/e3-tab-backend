import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { Ride } from '../data/rides';
import { RideCard } from '../components/RideCard';
import { Cart } from '../components/Cart';
import { Ticket } from '../components/Ticket';
// TicketVerifier removed
import { Ticket as TicketIcon, LogOut, WifiOff, RefreshCw, Printer, X, Smartphone, Bell, Tag } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../api/config';
import { BluetoothPrinter } from '../api/BluetoothPrinter';

interface CartItem extends Ride {
    quantity: number;
}

export default function POS() {
    const [cart, setCart] = useState<CartItem[]>([]);
    // currentTicketId and currentTicketDate removed as they were unused state
    const [mobileNumber, setMobileNumber] = useState('');
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showMobileCart, setShowMobileCart] = useState(false);
    const [paymentMode, setPaymentMode] = useState<'upi' | null>('upi');
    const [rides, setRides] = useState<Ride[]>([]);
    const [loadingRides, setLoadingRides] = useState(true);

    // Ticket Price Update Prompt State
    const [pricePrompt, setPricePrompt] = useState<{
        title: string;
        message: string;
        updates?: { name: string; oldPrice?: number; newPrice: number }[];
        timestamp: number;
    } | null>(null);

    // State for preview and cropping
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [ticketsToSave, setTicketsToSave] = useState<any[]>([]);
    const [printSettings, setPrintSettings] = useState(() => {
        const saved = localStorage.getItem('efour_print_settings');
        return saved ? JSON.parse(saved) : { top: 0, bottom: 0, left: 0, right: 0, scale: 1 };
    });

    const [showAllRides, setShowAllRides] = useState(false);
    const FEATURED_RIDE_NAMES = ['ETHREE BUS', 'SUN @ MOON', 'TL TRAIN', 'BALLOON SHOOTING'];

    // Save settings to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('efour_print_settings', JSON.stringify(printSettings));
    }, [printSettings]);

    const loggedUser = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);

    // State to hold the ticket currently being printed/reprinted
    const [printData, setPrintData] = useState<{
        items: CartItem[];
        total: number;
        date: string;
        id: string;
        mobile: string;
        paymentMode?: string;
        subTickets?: any[];
        skipMaster?: boolean;
        earnedPoints?: number;
    } | null>(null);


    // Offline Logic State
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);

    const ticketRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const location = useLocation();

    // Bluetooth Printer State
    const [isBTConnecting, setIsBTConnecting] = useState(false);
    const [btError, setBtError] = useState<string | null>(null);
    const [btStatus, setBtStatus] = useState<'disconnected' | 'connected' | 'error' | 'paired_not_linked'>(() => {
        const isPaired = localStorage.getItem('bt_printer_paired') === 'true';
        return isPaired ? 'paired_not_linked' : 'disconnected';
    });
    
    // USB/OTG Printer State
    const [isUSBConnecting, setIsUSBConnecting] = useState(false);
    const [usbStatus, setUsbStatus] = useState<'disconnected' | 'connected'>(() => {
        return localStorage.getItem('usb_printer_connected') === 'true' ? 'connected' : 'disconnected';
    });

    const [isWaitingForPayment, setIsWaitingForPayment] = useState(false);
    const [pollingTxnId, setPollingTxnId] = useState<string | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);

    // Auto-Resume Printers on Mount
    useEffect(() => {
        const autoResume = async () => {
            // 1. USB Auto-Resume (OTG) - Priority
            const wasUSBConnected = localStorage.getItem('usb_printer_connected') === 'true';
            if (wasUSBConnected) {
                console.log('Attempting Auto-Resume USB connection...');
                try {
                    const usbConnected = await BluetoothPrinter.autoConnectUSB();
                    if (usbConnected) {
                        setUsbStatus('connected');
                        console.log('USB Auto-Resumed Successfully!');
                        // If USB is connected, we might not need BT, but we can try both
                    }
                } catch (e) {
                    console.warn('USB Auto-resume failed');
                }
            }

            // 2. Bluetooth Auto-Resume
            const isPaired = localStorage.getItem('bt_printer_paired') === 'true';
            const targetName = localStorage.getItem('bt_printer_name') || "PRINTER 001-6D49";
            
            if (isPaired && !BluetoothPrinter.isConnected) {
                console.log('Attempting Auto-Resume Bluetooth connection...');
                for (let i = 0; i < 3; i++) {
                    try {
                        const connected = await BluetoothPrinter.autoConnect(targetName);
                        if (connected) {
                            setBtStatus('connected');
                            console.log('Bluetooth Auto-Resumed Successfully!');
                            return;
                        }
                    } catch (e) {
                        console.log(`Auto-resume Attempt ${i + 1} failed, retrying...`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
        };
        autoResume();

        const checkStatus = setInterval(() => {
            if (btStatus === 'connected' && !BluetoothPrinter.isConnected) {
                setBtStatus('paired_not_linked');
            }
            if (usbStatus === 'connected' && !BluetoothPrinter.isConnected) {
                setUsbStatus('disconnected');
            }
        }, 5000);
        return () => clearInterval(checkStatus);
    }, [btStatus, usbStatus]);

    const connectBluetooth = async () => {
        setIsBTConnecting(true);
        try {
            const targetName = localStorage.getItem('bt_printer_name') || "PRINTER 001-6D49";
            const printerName = await BluetoothPrinter.connect(targetName);
            
            console.log('Bluetooth Device Selected:', printerName);
            setBtStatus('connected');
            setBtError(null);
            localStorage.setItem('bt_printer_paired', 'true');
            localStorage.setItem('bt_printer_name', printerName);
            alert(`Printer "${printerName}" Ready for Direct Printing!`);
        } catch (error: any) {
            console.error('Bluetooth Connection Failed:', error);
            setBtStatus('error');
            setBtError(error.name || 'Unknown Error');
            
            // Detailed helpful alerts
            if (error.name === 'NotFoundError') {
                alert('Bluetooth pairing failed: No printer was selected.');
            } else if (error.name === 'SecurityError') {
                alert('Bluetooth Error: Browser blocked access. Ensure the site is trusted or served via Localhost/HTTPS.');
            } else {
                alert(`Bluetooth pairing failed: ${error.message || 'Unknown error'}`);
            }
        } finally {
            setIsBTConnecting(false);
        }
    };

    const disconnectBluetooth = () => {
        localStorage.removeItem('bt_printer_paired');
        localStorage.removeItem('bt_printer_name');
        setBtStatus('disconnected');
    };

    const connectUSB = async () => {
        setIsUSBConnecting(true);
        try {
            const printerName = await BluetoothPrinter.connectUSB();
            setUsbStatus('connected');
            localStorage.setItem('usb_printer_connected', 'true');
            alert(`USB Printer "${printerName}" Ready!`);
        } catch (error: any) {
            console.error('USB Connection Failed:', error);
            alert(`USB connection failed: ${error.message || 'Unknown error'}`);
        } finally {
            setIsUSBConnecting(false);
        }
    };

    const disconnectUSB = () => {
        localStorage.removeItem('usb_printer_connected');
        setUsbStatus('disconnected');
    };

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.role === 'admin') {
            navigate('/admin');
        }
    }, [navigate]);

    // Web Audio Chime for App Prompting
    const playNotificationChime = useCallback(() => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const now = ctx.currentTime;

            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now); // D5
            gain1.gain.setValueAtTime(0.12, now);
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.25);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880, now + 0.15); // A5
            gain2.gain.setValueAtTime(0.15, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.5);
        } catch (e) {
            // Audio context might be restricted, ignore silently
        }
    }, []);

    // Fetch Rides from API with Real-Time Difference Detection
    const fetchRides = useCallback(async (isBackgroundUpdate = false, broadcastData?: any) => {
        if (!isBackgroundUpdate) setLoadingRides(true);
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/api/products?t=${Date.now()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const freshRides: Ride[] = response.data;

            // Detect any price differences if this is a background update or broadcast
            setRides(prevRides => {
                const changes: { name: string; oldPrice?: number; newPrice: number }[] = [];
                if (prevRides && prevRides.length > 0) {
                    freshRides.forEach(fresh => {
                        const old = prevRides.find(p => (p._id || p.id) === (fresh._id || fresh.id));
                        if (old && old.price !== fresh.price) {
                            changes.push({
                                name: fresh.name,
                                oldPrice: old.price,
                                newPrice: fresh.price
                            });
                        }
                    });
                }

                // If changes were detected OR we received an explicit broadcast from Admin
                if (changes.length > 0 || broadcastData) {
                    playNotificationChime();
                    const promptMsg = changes.length > 0
                        ? `Admin updated prices: ${changes.map(c => `${c.name} (₹${c.oldPrice} ➔ ₹${c.newPrice})`).join(', ')}`
                        : broadcastData?.name
                            ? `Admin updated "${broadcastData.name}" ticket price to ₹${broadcastData.newPrice}`
                            : 'Admin has updated ticket pricing. The latest rates are now active.';

                    setPricePrompt({
                        title: 'Ticket Prices Updated',
                        message: promptMsg,
                        updates: changes.length > 0 ? changes : (broadcastData?.name ? [{ name: broadcastData.name, newPrice: broadcastData.newPrice, oldPrice: broadcastData.oldPrice }] : []),
                        timestamp: Date.now()
                    });

                    // Automatically adjust any matching items in the active Cart!
                    setCart(currentCart => currentCart.map(item => {
                        const matchedFresh = freshRides.find(f => (f._id || f.id) === (item._id || item.id));
                        if (matchedFresh && matchedFresh.price !== item.price) {
                            return { ...item, price: matchedFresh.price };
                        }
                        return item;
                    }));
                }

                return freshRides;
            });

            // Cache the fresh data
            localStorage.setItem('cached_rides', JSON.stringify(freshRides));
        } catch (error) {
            console.error('Failed to fetch rides, trying local cache...', error);
            const cached = localStorage.getItem('cached_rides');
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    setRides(parsed);
                } catch (parseError) {
                    console.error('Failed to parse cached rides', parseError);
                }
            }
        } finally {
            if (!isBackgroundUpdate) setLoadingRides(false);
        }
    }, [playNotificationChime]);

    // Real-Time Price Sync Listeners: BroadcastChannel, Storage, Polling, Focus
    useEffect(() => {
        // Initial fetch
        fetchRides();

        // 1. BroadcastChannel for same-origin tabs/windows
        let channel: BroadcastChannel | null = null;
        try {
            channel = new BroadcastChannel('ethree_price_sync');
            channel.onmessage = (event) => {
                console.log('[POS] Received ethree_price_sync broadcast:', event.data);
                if (event.data?.type === 'PRICE_UPDATED' || event.data?.type === 'PROMPT_APP') {
                    fetchRides(true, event.data);
                }
            };
        } catch (e) {
            console.warn('[POS] BroadcastChannel not supported', e);
        }

        // 2. Storage event listener (across browser tabs/windows)
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'ticket_prices_updated_at' && e.newValue) {
                try {
                    const data = JSON.parse(e.newValue);
                    console.log('[POS] Detected storage ticket price update:', data);
                    fetchRides(true, data);
                } catch (err) {
                    fetchRides(true);
                }
            }
        };
        window.addEventListener('storage', handleStorage);

        // 3. Periodic Background Check (every 15 seconds)
        const pollTimer = setInterval(() => {
            fetchRides(true);
        }, 15000);

        // 4. Window focus check (whenever cashier opens/switches to the POS app)
        const handleFocus = () => {
            fetchRides(true);
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            if (channel) channel.close();
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('focus', handleFocus);
            clearInterval(pollTimer);
        };
    }, [fetchRides]);

    // Auto-dismiss price prompt after 10 seconds
    useEffect(() => {
        if (pricePrompt) {
            const timer = setTimeout(() => {
                setPricePrompt(null);
            }, 10000);
            return () => clearTimeout(timer);
        }
    }, [pricePrompt]);

    // Monitor Network Status
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Initial check for pending tickets
        const pending = JSON.parse(localStorage.getItem('pending_tickets') || '[]');
        setPendingCount(pending.length);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // POLLLING: Check for UPI Success and Auto-Print
    useEffect(() => {
        let pollInterval: any;

        if (isWaitingForPayment && pollingTxnId) {
            console.log(`Starting polling for transaction: ${pollingTxnId}`);
            
            pollInterval = setInterval(async () => {
                try {
                    // Try to fetch the ticket from backend to see if it was saved (Success)
                    // We also fetch all recent tickets to see if our ID is there
                    const token = localStorage.getItem('token');
                    const response = await axios.get(`${API_URL}/api/tickets`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    
                    const found = response.data.find((t: any) => t.id === pollingTxnId);
                    
                    if (found) {
                        console.log('Payment SUCCESS detected via Polling!');
                        clearInterval(pollInterval);
                        setIsWaitingForPayment(false);
                        
                        // AUTO-PRINT Logic
                        if (BluetoothPrinter.isConnected) {
                            setIsPrinting(true);
                            try {
                                // Print individual tickets saved in our local state
                                if (printData && printData.subTickets) {
                                    for (const sub of printData.subTickets) {
                                        await BluetoothPrinter.printTicket({
                                            id: sub.id,
                                            date: sub.date,
                                            items: sub.items,
                                            total: sub.amount,
                                            mobile: sub.mobile,
                                            paymentMode: 'upi'
                                        });
                                    }
                                }
                            } catch (printError) {
                                console.error('Auto-print failed:', printError);
                                alert('Payment Success! But printer failed. Please reprint manually.');
                            } finally {
                                setIsPrinting(false);
                            }
                        }

                        // Success cleanup
                        setCart([]);
                        setMobileNumber('');
                        localStorage.removeItem('pending_upi_transaction');
                        setPollingTxnId(null);
                        
                        // Close any stray popups? Usually the popup closes itself via our redirect
                    }
                } catch (err) {
                    console.warn('Polling error (expected if not yet synced):', err);
                }
            }, 1000); // Poll every 1 second for hyper-speed detection
        }

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [isWaitingForPayment, pollingTxnId, printData]);

    // Auto-Sync when Online
    useEffect(() => {
        if (isOnline && pendingCount > 0 && !isSyncing) {
            syncOfflineTickets();
        }
    }, [isOnline, pendingCount]);

    // Handle Return from UPI Gateway
    useEffect(() => {
        const query = new URLSearchParams(location.search);
        const paymentStatus = query.get('payment');
        
        if (paymentStatus === 'success') {
            const pendingData = localStorage.getItem('pending_upi_transaction');
            if (pendingData) {
                const parsed = JSON.parse(pendingData);
                setPrintData(parsed.printData);
                setTicketsToSave(parsed.ticketsToSave);
                setMobileNumber(parsed.mobileNumber);
                
                // Allow state to settle so <Ticket> renders, then print
                setTimeout(() => {
                    window.print();
                    setShowSuccessModal(true);
                    
                    // Now do background sync
                    axios.post(`${API_URL}/api/tickets`, parsed.ticketsToSave).catch(e => console.error(e));
                    
                    if (parsed.mobileNumber && parsed.mobileNumber.length === 10 && parsed.totalWithTax >= 100) {
                        axios.post(`${API_URL}/api/loyalty/earn`, { mobile: parsed.mobileNumber, amount: parsed.totalWithTax, ticketId: parsed.printData?.id || '' }).catch(() => {});
                    }

                    localStorage.removeItem('pending_upi_transaction');
                    navigate('/pos', { replace: true }); // Clear search params
                }, 500);
            }
        } else if (paymentStatus === 'failure') {
            const pendingData = localStorage.getItem('pending_upi_transaction');
            if (pendingData) {
                const parsed = JSON.parse(pendingData);
                setCart(parsed.cart);
                setMobileNumber(parsed.mobileNumber);
                alert("Payment Failed: Please Try Again or check connection");
                localStorage.removeItem('pending_upi_transaction');
                navigate('/pos', { replace: true }); // Clear search params
            }
        }
    }, [navigate]);

    const syncOfflineTickets = async () => {
        setIsSyncing(true);
        const stored = localStorage.getItem('pending_tickets') || '[]';
        let pending: any[];

        try {
            pending = JSON.parse(stored);
        } catch (e) {
            pending = [];
        }

        if (!Array.isArray(pending)) {
            console.error('Pending tickets is not an array, resetting.');
            localStorage.setItem('pending_tickets', '[]');
            setPendingCount(0);
            setIsSyncing(false);
            return;
        }

        if (pending.length === 0) return;

        console.log(`Attempting to sync ${pending.length} tickets to ${API_URL}/api/tickets`);
        setIsSyncing(true);
        try {
            await axios.post(`${API_URL}/api/tickets`, pending);
            localStorage.setItem('pending_tickets', '[]');
            setPendingCount(0);
            alert(`Synced ${pending.length} offline tickets to server.`);
        } catch (error: any) {
            console.error('Sync failed', error);
            if (error.response?.status === 400) {
                console.error('Bad request, data might be malformed. Clearing queue.');
                localStorage.setItem('pending_tickets', '[]');
                setPendingCount(0);
            }
        } finally {
            setIsSyncing(false);
        }
    };

    const addToCart = useCallback((ride: Ride) => {
        setCart(prev => {
            const rideId = ride._id || ride.id;
            const existing = prev.find(item => (item._id || item.id) === rideId);
            if (existing) {
                return prev.map(item =>
                    (item._id || item.id) === rideId ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            return [...prev, { ...ride, quantity: 1 }];
        });
        // Tablet optimization: Take to cart immediately
        setShowMobileCart(true);
    }, []);

    const updateQuantitySimple = useCallback((id: string, delta: number) => {
        setCart(prev => prev.map(item => {
            const itemId = item._id || item.id;
            if (itemId === id) {
                return { ...item, quantity: item.quantity + delta };
            }
            return item;
        }).filter(item => item.quantity > 0));
    }, []);

    const clearCart = useCallback(() => setCart([]), []);

    const total = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0), [cart]);
    const totalWithTax = total; // Tax removed


    const confirmPrint = async () => {
        // Generate Ticket ID
        const ticketId = `TXN-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;
        const date = new Date().toLocaleString();

        // Removed unused state setters

        const loggedUser = JSON.parse(localStorage.getItem('user') || '{}');

        // Handle Split Saving: Regular Items vs Combo Items
        const ticketsToSave: any[] = [];
        const subTickets: any[] = [];

        // 1. Prepare Regular Summary Ticket (for context/accounting)
        const regularTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const masterTicket = {
            id: ticketId,
            amount: regularTotal,
            date: date,
            items: cart,
            status: 'valid',
            mobile: mobileNumber,
            paymentMode: (paymentMode || 'upi') as 'upi',
            createdBy: loggedUser.name || loggedUser.email || 'Cashier',
            posId: loggedUser.posId || 'pos1',
            createdAt: new Date().toISOString(),
            isCoupon: false // Explicitly mark master ticket
        };
        ticketsToSave.push(masterTicket);

        // 2. Prepare Individual Ride Tickets
        cart.forEach(item => {
            const isCombo = item.name.toLowerCase().includes('combo');
            if (isCombo) {
                // Special Case: Combo Ride prints 7 tickets per quantity
                for (let i = 0; i < item.quantity * 7; i++) {
                    const subId = `${ticketId}-C${subTickets.length + 1}`;
                    const subTicket = {
                        id: subId,
                        amount: 100, // Fixed price per sub-ticket for combo
                        date: date,
                        items: [{ ...item, quantity: 1, name: item.name.replace(/\(6\s*Rides\)/gi, '(7 Rides)').toUpperCase(), price: 100 }],
                        total: 100,
                        status: 'valid',
                        mobile: mobileNumber,
                        paymentMode: (paymentMode || 'upi') as 'upi',
                        createdBy: loggedUser.name || 'Unknown',
                        posId: loggedUser.posId || 'pos1',
                        createdAt: new Date().toISOString(),
                        isCoupon: true,
                        parentId: ticketId
                    };
                    ticketsToSave.push(subTicket);
                    subTickets.push(subTicket);
                }
            } else {
                // General Case: Every other ride prints one ticket per quantity
                for (let i = 0; i < item.quantity; i++) {
                    const subId = `${ticketId}-R${subTickets.length + 1}`;
                    const subTicket = {
                        id: subId,
                        amount: item.price,
                        date: date,
                        items: [{ ...item, quantity: 1 }], // Single ride per ticket
                        status: 'valid',
                        mobile: mobileNumber,
                        paymentMode: (paymentMode || 'upi') as 'upi',
                        createdBy: loggedUser.name || 'Unknown',
                        posId: loggedUser.posId || 'pos1',
                        createdAt: new Date().toISOString(),
                        isCoupon: true,
                        parentId: ticketId
                    };
                    ticketsToSave.push(subTicket);
                    subTickets.push(subTicket);
                }
            }
        });

        // Save to localStorage (Legacy/Redundancy)
        const tickets = JSON.parse(localStorage.getItem('pos_tickets') || '{}');
        ticketsToSave.forEach(t => tickets[t.id] = t);
        localStorage.setItem('pos_tickets', JSON.stringify(tickets));

        // Set print data for the Ticket component
        const newPrintData = {
            items: cart,
            total: totalWithTax,
            date: date,
            id: ticketId,
            mobile: mobileNumber,
            paymentMode: paymentMode as string | undefined,
            subTickets: subTickets, // Pass sub-tickets for printing
            skipMaster: true, // Skip summary receipt, print only individual tickets
            earnedPoints: mobileNumber ? (Math.floor(totalWithTax / 100) * 10) : 0
        };

        setPrintData(newPrintData);
        setTicketsToSave(ticketsToSave);

        if (paymentMode === 'upi') {
            // Freeze state into LocalStorage for retrieval after redirect
            const pendingTransaction = {
                cart,
                printData: newPrintData,
                ticketsToSave,
                totalWithTax,
                mobileNumber
            };
            localStorage.setItem('pending_upi_transaction', JSON.stringify(pendingTransaction));

            try {
                console.log('Initiating Easebuzz Payment...');
                const safeProductInfo = cart.map(i => i.name.replace(/[^a-zA-Z0-9 ]/g, '')).join(' ').substring(0, 50) || 'POS_Rides';
                const paymentInfo = {
                    amount: totalWithTax.toFixed(2),
                    txnid: newPrintData.id,
                    productinfo: safeProductInfo,
                    firstname: loggedUser.name?.split(' ')[0] || 'Customer',
                    email: loggedUser.email || 'customer@ethree.in',
                    phone: mobileNumber || '9999999999',
                    surl: `${API_URL}/api/payments/response?status=success&returnUrl=${encodeURIComponent(window.location.origin + '/#/payment-success')}`,
                    furl: `${API_URL}/api/payments/response?status=failure&returnUrl=${encodeURIComponent(window.location.origin + '/#/payment-failure')}`
                };

                const res = await axios.post(`${API_URL}/api/payments/initiate`, paymentInfo);
                
                if (res.data && res.data.url) {
                    // SECURE PERSISTENT FLOW: Use Popup instead of redirect
                    // This keeps the POS (and Bluetooth GATT session) alive
                    const width = 600;
                    const height = 800;
                    const left = (window.innerWidth / 2) - (width / 2);
                    const top = (window.innerHeight / 2) - (height / 2);
                    
                    window.open(
                        res.data.url, 
                        'EasebuzzPayment', 
                        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
                    );

                    setPollingTxnId(newPrintData.id);
                    setIsWaitingForPayment(true);
                    return;
                }
            } catch (error) {
                console.error('Payment initiation failed:', error);
                alert('UPI Payment redirection failed. Please check internet connection and try again.');
                localStorage.removeItem('pending_upi_transaction'); // Clean up on initiation error
            }
        } else {
            // Unreachable if paymentMode is always 'upi' during checkout
            setShowPrintPreview(true);
        }
    };

    const handlePreviewConfirm = async () => {
        if (!paymentMode) {
            setShowPrintPreview(false);
            
            // 1. Trigger Print
            if (btStatus === 'connected' && printData && BluetoothPrinter.isConnected) {
                try {
                    console.log('Using Built-in Bluetooth Printer...');
                    // SKIPPING Master Receipt printing to avoid double-papers
                    // Individual tickets loop below will handle all coupons
                    
                    // If there are sub-tickets (Individual Rides/Combo), print them
                    if (printData.subTickets && printData.subTickets.length > 0) {
                        for (const sub of printData.subTickets) {
                            await BluetoothPrinter.printTicket({
                                id: sub.id,
                                date: sub.date,
                                items: sub.items,
                                total: sub.amount,
                                mobile: sub.mobile,
                                paymentMode: paymentMode || 'upi'
                            });
                        }
                    }
                    
                    // KEEP PREVIEW VISIBLE for 2 seconds so they can see the confirmation highlight
                    setTimeout(() => {
                        setShowPrintPreview(false);
                        setShowSuccessModal(true);
                        setCart([]);
                        setPaymentMode(null);
                        setMobileNumber('');
                    }, 2000);
                    
                } catch (printErr: any) {
                    console.error('Direct Print Failed, falling back to window.print', printErr);
                    // Check if is Median
                    if (navigator.userAgent.includes('Median')) {
                        alert("App Connection Error: Please ensure 'Web Bluetooth' is enabled in your Median App settings.");
                    }
                    window.print();
                    setShowPrintPreview(false);
                    setShowSuccessModal(true);
                }
            } else if (btStatus === 'paired_not_linked') {
                alert("Printer link lost. Please click the 'RECONNECT' button in the top bar to print.");
                setBtStatus('paired_not_linked');
            } else {
                // Legacy Browser Print
                window.print();
                setShowSuccessModal(true);
                setCart([]);
                setPaymentMode(null);
                setMobileNumber('');
            }

            // 2. Save to Backend in Background
            const saveToBackend = async () => {
                try {
                    if (!isOnline) throw new Error('Offline');
                    await axios.post(`${API_URL}/api/tickets`, ticketsToSave);
                } catch (error) {
                    console.log('Background save failed, queueing locally.');
                    const pending = JSON.parse(localStorage.getItem('pending_tickets') || '[]');
                    ticketsToSave.forEach(t => pending.push(t));
                    localStorage.setItem('pending_tickets', JSON.stringify(pending));
                    setPendingCount(prev => prev + ticketsToSave.length);
                }
            };
            saveToBackend();
        }
    };

    const closeSuccessModal = () => {
        setShowSuccessModal(false);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
            {/* Real-time Ticket Price Update Prompt */}
            {pricePrompt && (
                <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-11/12 max-w-lg animate-in slide-in-from-top-4 fade-in duration-300">
                    <div className="bg-slate-900/95 backdrop-blur-md text-white border-2 border-amber-400 rounded-2xl shadow-2xl p-4 flex items-start gap-3.5 ring-4 ring-amber-400/20">
                        <div className="p-2.5 bg-amber-400 text-slate-900 rounded-xl shrink-0 animate-bounce">
                            <Bell size={20} className="font-black" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                    <span>{pricePrompt.title}</span>
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                </h4>
                                <span className="text-[10px] text-slate-400 font-mono">Live Sync</span>
                            </div>
                            <p className="text-xs text-slate-200 font-medium mt-1 leading-relaxed">
                                {pricePrompt.message}
                            </p>
                            {pricePrompt.updates && pricePrompt.updates.length > 0 && (
                                <div className="mt-2.5 space-y-1.5 bg-slate-800/90 rounded-xl p-2.5 border border-slate-700">
                                    {pricePrompt.updates.map((u, idx) => (
                                        <div key={idx} className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-slate-200 truncate">{u.name}</span>
                                            <span className="font-black text-amber-400 whitespace-nowrap ml-2">
                                                {u.oldPrice !== undefined && (
                                                    <span className="line-through text-slate-500 mr-1.5 text-[11px]">₹{u.oldPrice}</span>
                                                )}
                                                ₹{u.newPrice}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="mt-2.5 flex justify-end">
                                <button
                                    onClick={() => setPricePrompt(null)}
                                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] uppercase tracking-wider px-3.5 py-1.5 rounded-lg transition-all active:scale-95 shadow-md"
                                >
                                    Got It / Dismiss
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={() => setPricePrompt(null)}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Screen Layout */}
            <div className="print:hidden flex flex-col h-screen">
                <header className="bg-slate-900 border-b border-slate-800 text-white p-2 md:p-3 shadow-xl z-20 sticky top-0">
                    <div className="container mx-auto max-w-[1600px] flex items-center justify-between">
                        {/* Logo & Brand */}
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-amber-300 rounded-lg blur opacity-50 group-hover:opacity-100 transition duration-200"></div>
                                <img
                                    src="/logo.jpeg"
                                    alt="ETHREE Logo"
                                    className="relative w-8 h-8 md:w-10 md:h-10 rounded-lg object-contain bg-white ring-1 ring-slate-900 p-1"
                                />
                            </div>
                            <div>
                                <h1 className="text-lg md:text-xl font-black tracking-tight text-white leading-none flex items-center gap-1.5">ETHREE <span className="text-amber-400">POS</span> <span className="text-xs text-amber-400 font-bold bg-amber-900 px-1 rounded ring-1 ring-amber-500/50">v5.0</span> <span className="text-[9px] bg-sky-500 text-white px-1 rounded-full animate-pulse tracking-tighter shadow-[0_0_10px_rgba(14,165,233,0.5)]">SECURE v5.0</span></h1>

                            </div>

                            {/* User Info */}
                            <div className="hidden lg:flex flex-col border-l border-slate-700 pl-4 ml-2">
                                <span className="text-[10px] font-black text-amber-500/80 uppercase tracking-widest leading-none mb-1">Authenticated Email</span>
                                <span className="text-xs font-bold text-white tracking-wide">{loggedUser.email || 'staff@company.com'}</span>
                            </div>

                            {/* Status Indicators (Mobile Optimized) */}
                            <div className="ml-2 md:ml-4 flex items-center gap-2">
                                {isOnline ? (
                                    <div className="px-2 py-0.5 md:py-1 bg-emerald-500/10 text-emerald-400 text-[10px] md:text-xs font-bold rounded-full flex items-center gap-1 border border-emerald-500/20 backdrop-blur-sm">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                                        <span className="hidden md:inline">Online</span>
                                    </div>
                                ) : (
                                    <div className="px-2 py-0.5 md:py-1 bg-rose-500/10 text-rose-400 text-[10px] md:text-xs font-bold rounded-full flex items-center gap-1 border border-rose-500/20 backdrop-blur-sm">
                                        <WifiOff size={10} />
                                        <span>Offline</span>
                                    </div>
                                )}

                                {pendingCount > 0 && (
                                    <div className="px-2 py-0.5 md:py-1 bg-amber-500/10 text-amber-400 text-[10px] md:text-xs font-bold rounded-full flex items-center gap-1 border border-amber-500/20">
                                        <RefreshCw size={10} className={isSyncing ? "animate-spin" : ""} />
                                        <span>{pendingCount}</span>
                                    </div>
                                )}

                                {/* Ticket Price Sync Button */}
                                <button
                                    onClick={() => {
                                        fetchRides(false);
                                        setPricePrompt({
                                            title: 'Prices Synchronized',
                                            message: 'Latest ticket prices successfully synchronized with server.',
                                            timestamp: Date.now()
                                        });
                                    }}
                                    className="px-2 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-all active:scale-95"
                                    title="Sync Latest Ticket Prices from Server"
                                >
                                    <Tag size={10} />
                                    <span className="hidden sm:inline">Sync Rates</span>
                                </button>

                                 {/* Bluetooth Printer Pairing */}
                                 <button 
                                    onClick={btStatus === 'connected' ? disconnectBluetooth : connectBluetooth}
                                    className={`px-2 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1.5 border transition-all active:scale-95 backdrop-blur-sm ${
                                        btStatus === 'connected' 
                                        ? 'bg-blue-500 text-white border-blue-600 shadow-md' 
                                        : btStatus === 'paired_not_linked'
                                        ? 'bg-amber-500 text-white border-amber-600'
                                        : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800'
                                    }`}
                                    title="Bluetooth Printer"
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full ${btStatus === 'connected' ? 'bg-white animate-pulse' : 'bg-slate-600'}`}></div>
                                    <Printer size={12} className={isBTConnecting ? 'animate-bounce' : ''} />
                                    <span>
                                        {isBTConnecting ? 'PAIRING...' : btStatus === 'connected' ? 'BT ON' : btStatus === 'paired_not_linked' ? 'RECONNECT' : 'BT'}
                                    </span>
                                </button>

                                {/* USB / OTG Printer */}
                                <button 
                                    onClick={usbStatus === 'connected' ? disconnectUSB : connectUSB}
                                    className={`px-2 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1.5 border transition-all active:scale-95 backdrop-blur-sm ${
                                        usbStatus === 'connected' 
                                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-md shadow-emerald-500/20' 
                                        : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800'
                                    }`}
                                    title="USB/OTG Printer"
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full ${usbStatus === 'connected' ? 'bg-white animate-pulse' : 'bg-slate-600'}`}></div>
                                    <Smartphone size={12} className={isUSBConnecting ? 'animate-spin' : ''} />
                                    <span>
                                        {isUSBConnecting ? 'LINKING...' : usbStatus === 'connected' ? 'OTG ON' : 'OTG'}
                                    </span>
                                </button>
                                {btError && (
                                    <span className="text-[8px] text-rose-500 font-bold uppercase tracking-tighter opacity-70">
                                        ERR: {btError}
                                    </span>
                                )}
                                
                                {/* Developer Credit */}
                                <div className="flex items-center gap-2 md:gap-3 border-l border-white/10 pl-2 md:pl-4 ml-1 md:ml-2">
                                    <div className="w-8 h-8 md:w-10 md:h-10 bg-white/5 rounded-lg md:rounded-xl border border-white/10 p-1 flex items-center justify-center overflow-hidden shrink-0">
                                        <img 
                                            src="/stackvil_logo.png" 
                                            alt="Stackvil" 
                                            className="w-full h-full object-contain brightness-125"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="hidden sm:block text-[7px] md:text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] leading-none mb-1">Architecture</span>
                                        <span className="text-[8px] md:text-[9px] font-black text-white/90 tracking-widest uppercase leading-tight">
                                            Designed & Developed by <br className="sm:hidden" /><span className="text-amber-400 font-black">Stackvil Technologies</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 md:gap-4">
                            <div className="h-6 md:h-8 w-px bg-slate-800 mx-0.5"></div>

                            <button
                                onClick={handleLogout}
                                className="group relative p-2 md:px-3 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2"
                                title="Logout"
                            >
                                <div className="hidden sm:flex flex-col items-end mr-1 lg:hidden">
                                    <span className="text-[10px] font-bold text-white leading-none mb-0.5">{loggedUser.name?.split(' ')[0]}</span>
                                    <span className="text-[8px] font-bold text-slate-500 tracking-tighter uppercase">{loggedUser.role}</span>
                                </div>
                                <LogOut size={20} className="relative z-10" />
                            </button>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-hidden container mx-auto max-w-[1600px] px-3 py-4 flex gap-4">
                    <div className="flex-1 h-full w-full overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-y-auto pr-2 pb-20 md:pb-0 custom-scrollbar">
                            <h2 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 flex items-center gap-2 text-blue-950 sticky top-0 bg-slate-100 z-10 py-1">
                                <span className="w-1.5 h-6 md:h-8 bg-gradient-to-b from-amber-400 to-amber-600 rounded-full shadow-sm"></span>
                                Available Rides
                            </h2>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 pb-24 md:pb-0">
                                {loadingRides ? (
                                    <div className="col-span-full py-10 flex flex-col items-center justify-center text-slate-400">
                                        <RefreshCw size={32} className="animate-spin mb-2" />
                                        <span className="text-sm font-bold">Loading rides...</span>
                                    </div>
                                ) : rides.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                                        <div className="p-4 bg-slate-100 rounded-full mb-4">
                                            <TicketIcon size={40} className="opacity-20" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-500">NO RIDES AVAILABLE</h3>
                                        <p className="text-sm">Check your connection or try refreshing.</p>
                                        <p className="text-[10px] bg-slate-200 px-2 py-0.5 rounded mt-4 font-mono">API: {import.meta.env.VITE_API_URL || 'RELATIVE'}</p>
                                        <button
                                            onClick={() => window.location.reload()}
                                            className="mt-6 px-6 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg"
                                        >
                                            REFRESH NOW
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {rides
                                            .filter(ride => showAllRides || FEATURED_RIDE_NAMES.includes(ride.name.toUpperCase()))
                                            .map(ride => (
                                                <RideCard key={ride._id || ride.id} ride={ride} onAdd={addToCart} />
                                            ))}
                                        {rides.length > rides.filter(ride => FEATURED_RIDE_NAMES.includes(ride.name.toUpperCase())).length && (
                                            <button
                                                onClick={() => setShowAllRides(!showAllRides)}
                                                className="flex flex-col items-center justify-center p-4 rounded-3xl border-2 border-dashed border-slate-300 bg-white/50 hover:bg-white hover:border-amber-400 transition-all group overflow-hidden relative"
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                <div className="p-3 bg-slate-100 rounded-2xl mb-3 group-hover:bg-amber-100 transition-colors">
                                                    {showAllRides ? (
                                                        <X size={24} className="text-slate-400 group-hover:text-amber-600" />
                                                    ) : (
                                                        <RefreshCw size={24} className="text-slate-400 group-hover:text-amber-600" />
                                                    )}
                                                </div>
                                                <span className="text-xs font-black text-slate-500 group-hover:text-amber-700 uppercase tracking-widest text-center">
                                                    {showAllRides ? 'Show Less' : 'Show More Rides'}
                                                </span>
                                                <div className="mt-1 text-[10px] font-bold text-slate-400">
                                                    {showAllRides ? 'HIDE OPTIONS' : `${rides.length - rides.filter(r => FEATURED_RIDE_NAMES.includes(r.name.toUpperCase())).length} MORE AVAILABLE`}
                                                </div>
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Desktop Cart Sidebar */}
                    <div className="hidden md:block w-[300px] lg:w-[350px] shrink-0 border-l border-slate-200 pl-4 bg-slate-100 h-full">
                        <Cart
                            items={cart}
                            onUpdateQuantity={updateQuantitySimple}
                            onClear={clearCart}
                            onPrint={confirmPrint}
                            paymentMode={paymentMode}
                            onPaymentModeChange={setPaymentMode}
                            mobileNumber={mobileNumber}
                            onMobileNumberChange={setMobileNumber}
                        />
                    </div>
                </main>

                {/* Mobile Cart Floating Button */}
                <div className="md:hidden fixed bottom-4 left-4 right-4 z-40">
                    {cart.length > 0 && (
                        <button
                            onClick={() => setShowMobileCart(true)}
                            className="w-full bg-slate-900 text-white rounded-xl p-4 shadow-xl flex items-center justify-between animate-in slide-in-from-bottom-4"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-amber-400 text-slate-900 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                                    {cart.reduce((s, i) => s + i.quantity, 0)}
                                </div>
                                <span className="font-bold text-lg">View Cart</span>
                            </div>
                            <span className="font-mono text-xl font-black text-amber-400">₹{totalWithTax}</span>
                        </button>
                    )}
                </div>

                {/* Mobile Cart Modal */}
                {showMobileCart && (
                    <div className="md:hidden fixed inset-0 z-50 bg-slate-100 flex flex-col animate-in slide-in-from-bottom duration-200">
                        <div className="bg-white p-4 flex items-center justify-between shadow-sm border-b border-slate-200">
                            <h2 className="text-xl font-bold text-slate-900">Your Cart</h2>
                            <button
                                onClick={() => setShowMobileCart(false)}
                                className="bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden p-4">
                            <Cart
                                items={cart}
                                onUpdateQuantity={updateQuantitySimple}
                                onClear={clearCart}
                                onPrint={confirmPrint}
                                paymentMode={paymentMode}
                                onPaymentModeChange={setPaymentMode}
                                mobileNumber={mobileNumber}
                                onMobileNumberChange={setMobileNumber}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Print Layout - Managed by visibility rules in Ticket.tsx */}
            <div className="hidden print:block print-container" style={{ width: '3.5in' }}>
                <div className="p-0">
                    <Ticket
                        ref={ticketRef}
                        items={printData?.items || []}
                        total={printData?.total || 0}
                        date={printData?.date || ''}
                        ticketId={printData?.id || ''}
                        mobileNumber={printData?.mobile || ''}
                        subTickets={printData?.subTickets}
                        skipMaster={printData?.skipMaster}
                        earnedPoints={printData?.earnedPoints}
                        paymentMode={printData?.paymentMode}
                        settings={printSettings}
                    />
                </div>
            </div>

            {/* Print Preview Modal */}
            {showPrintPreview && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-[70] p-4 print:hidden overflow-hidden">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] animate-in zoom-in slide-in-from-bottom-10 duration-500 ring-1 ring-white/20">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-3xl">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xl font-black text-slate-800 tracking-tight">PRINT PREVIEW</h3>
                                    <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border border-amber-200">Interactive Crop</span>
                                </div>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Drag handles to adjust margins & prevent cutting</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPrintSettings({ top: 0, bottom: 0, left: 0, right: 0, scale: 1 })}
                                    className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    Reset
                                </button>
                                <button
                                    onClick={() => setShowPrintPreview(false)}
                                    className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-rose-500 shadow-sm border border-slate-100"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Preview Area with Cropping */}
                        <div className="flex-1 overflow-y-auto p-8 bg-slate-100 custom-scrollbar relative select-none">
                            <div className="relative mx-auto" style={{ width: 'fit-content' }}>
                                {/* Draggable Crop Controls Overlay */}
                                <div className="absolute inset-0 z-20 pointer-events-none border-2 border-dashed border-sky-400/50 rounded-sm">
                                    {/* Top Handle */}
                                    <div
                                        className="absolute -top-3 left-0 right-0 h-6 cursor-ns-resize pointer-events-auto group z-30 flex items-center justify-center"
                                        onMouseDown={(e) => {
                                            const startY = e.clientY;
                                            const startTop = printSettings.top;
                                            const move = (moveEvent: MouseEvent) => {
                                                const delta = moveEvent.clientY - startY;
                                                setPrintSettings((prev: any) => ({ ...prev, top: Math.max(0, startTop + delta) }));
                                            };
                                            const end = () => {
                                                window.removeEventListener('mousemove', move);
                                                window.removeEventListener('mouseup', end);
                                            };
                                            window.addEventListener('mousemove', move);
                                            window.addEventListener('mouseup', end);
                                        }}
                                    >
                                        <div className="w-12 h-1 bg-sky-500 rounded-full opacity-40 group-hover:opacity-100 transition-opacity"></div>
                                        <div className="absolute bottom-full mb-1 bg-sky-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                            Top: {(printSettings.top / 96).toFixed(2)}"
                                        </div>
                                    </div>

                                    {/* Bottom Handle */}
                                    <div
                                        className="absolute -bottom-3 left-0 right-0 h-6 cursor-ns-resize pointer-events-auto group z-30 flex items-center justify-center"
                                        onMouseDown={(e) => {
                                            const startY = e.clientY;
                                            const startBottom = printSettings.bottom;
                                            const move = (moveEvent: MouseEvent) => {
                                                const delta = startY - moveEvent.clientY;
                                                setPrintSettings((prev: any) => ({ ...prev, bottom: Math.max(0, startBottom + delta) }));
                                            };
                                            const end = () => {
                                                window.removeEventListener('mousemove', move);
                                                window.removeEventListener('mouseup', end);
                                            };
                                            window.addEventListener('mousemove', move);
                                            window.addEventListener('mouseup', end);
                                        }}
                                    >
                                        <div className="w-12 h-1 bg-sky-500 rounded-full opacity-40 group-hover:opacity-100 transition-opacity"></div>
                                        <div className="absolute top-full mt-1 bg-sky-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                            Bottom: {(printSettings.bottom / 96).toFixed(2)}"
                                        </div>
                                    </div>

                                    {/* Horizontal Shift Handle (Left/Right Offset) */}
                                    <div
                                        className="absolute inset-y-0 -left-6 w-12 cursor-ew-resize pointer-events-auto group z-30 flex flex-col items-center justify-center gap-1"
                                        onMouseDown={(e) => {
                                            const startX = e.clientX;
                                            const startLeft = printSettings.left;
                                            const move = (moveEvent: MouseEvent) => {
                                                const delta = moveEvent.clientX - startX;
                                                setPrintSettings((prev: any) => ({ ...prev, left: startLeft + delta }));
                                            };
                                            const end = () => {
                                                window.removeEventListener('mousemove', move);
                                                window.removeEventListener('mouseup', end);
                                            };
                                            window.addEventListener('mousemove', move);
                                            window.addEventListener('mouseup', end);
                                        }}
                                    >
                                        <div className="w-1.5 h-16 bg-sky-500 rounded-full opacity-40 group-hover:opacity-100 transition-opacity shadow-sm"></div>
                                        <div className="absolute right-full mr-2 bg-sky-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            Shift: {(printSettings.left / 96).toFixed(2)}"
                                        </div>
                                    </div>

                                    {/* Scale Handle (Bottom Right Corner) */}
                                    <div
                                        className="absolute -bottom-6 -right-6 w-12 h-12 cursor-nwse-resize pointer-events-auto group z-40 flex items-center justify-center"
                                        onMouseDown={(e) => {
                                            const startY = e.clientY;
                                            const startScale = printSettings.scale || 1;
                                            const move = (moveEvent: MouseEvent) => {
                                                const delta = startY - moveEvent.clientY;
                                                const newScale = Math.max(0.5, Math.min(1.5, startScale + (delta / 200)));
                                                setPrintSettings((prev: any) => ({ ...prev, scale: newScale }));
                                            };
                                            const end = () => {
                                                window.removeEventListener('mousemove', move);
                                                window.removeEventListener('mouseup', end);
                                            };
                                            window.addEventListener('mousemove', move);
                                            window.addEventListener('mouseup', end);
                                        }}
                                    >
                                        <div className="w-4 h-4 border-r-4 border-b-4 border-sky-500 rounded-sm opacity-60 group-hover:opacity-100 transition-opacity"></div>
                                        <div className="absolute top-full mt-2 bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                            Size: {(printSettings.scale * 100).toFixed(0)}%
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden" style={{ width: '3.5in' }}>
                                    <Ticket
                                        items={printData?.items || []}
                                        total={printData?.total || 0}
                                        date={printData?.date || ''}
                                        ticketId={printData?.id || ''}
                                        mobileNumber={printData?.mobile || ''}
                                        subTickets={printData?.subTickets}
                                        skipMaster={printData?.skipMaster}
                                        earnedPoints={printData?.earnedPoints}
                                        paymentMode={printData?.paymentMode}
                                        isPreview={true}
                                        settings={printSettings}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 border-t border-slate-100 bg-white rounded-b-3xl">
                            <button
                                onClick={handlePreviewConfirm}
                                className="w-full px-4 py-4 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-3 uppercase text-xs tracking-widest"
                            >
                                <Printer size={18} />
                                Confirm & Print
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 print:hidden">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center animate-in fade-in zoom-in duration-300 ring-1 ring-slate-900/5">
                        <div className="mx-auto bg-emerald-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mb-6 shadow-inner">
                            <TicketIcon className="w-10 h-10 text-emerald-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Printing Complete</h2>
                        {printData?.earnedPoints && printData.earnedPoints > 0 ? (
                            <div className="mb-8">
                                <p className="text-slate-500 text-lg leading-relaxed">Please collect your tickets.</p>
                                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full font-bold text-sm">
                                    <span>✨ Earned {printData.earnedPoints} Loyalty Points</span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-slate-500 mb-8 text-lg leading-relaxed">Please collect your tickets from the printer.</p>
                        )}

                        <div className="space-y-3">
                            <button
                                onClick={closeSuccessModal}
                                className="w-full px-4 py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 text-lg active:scale-[0.98]"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* PAYMENT WAITING OVERLAY */}
            {isWaitingForPayment && (
                <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="max-w-md w-full bg-slate-800 border border-white/10 rounded-[2.5rem] p-10 text-center shadow-2xl relative overflow-hidden">
                        {/* Animated background glow */}
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-500 animate-pulse"></div>
                        
                        <div className="relative mb-8 pt-4">
                            <div className="w-24 h-24 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto relative">
                                <RefreshCw className="w-12 h-12 text-blue-400 animate-spin" />
                                <div className="absolute inset-0 bg-blue-400/20 rounded-full animate-ping"></div>
                            </div>
                        </div>

                        <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-2">Awaiting Payment</h2>
                        <p className="text-slate-400 font-bold text-sm mb-8 leading-relaxed">
                            A secure payment window has opened.<br/>
                            Ask the customer to complete the transaction on their device.
                        </p>

                        <div className="space-y-4">
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-4 text-left">
                                <div className="p-3 bg-emerald-500/20 rounded-xl">
                                    <Smartphone className="w-6 h-6 text-emerald-500" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Transaction Status</p>
                                    <p className="text-white font-bold">Scanning for Success...</p>
                                </div>
                            </div>
                            
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setIsWaitingForPayment(false);
                                        setPollingTxnId(null);
                                    }}
                                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all"
                                >
                                    Cancel Search
                                </button>
                                <button
                                    onClick={() => {
                                        // Force check
                                    }}
                                    className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg shadow-blue-600/20"
                                >
                                    Force Sync
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isPrinting && (
                <div className="fixed top-8 right-8 z-[200] bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-2xl flex items-center gap-4 animate-in slide-in-from-right duration-500">
                    <Printer className="animate-bounce" />
                    PRINTING TICKETS...
                </div>
            )}
        </div>
    );
}

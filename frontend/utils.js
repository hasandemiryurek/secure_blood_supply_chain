/**
 * Utility Functions for Blood Cold Chain
 * QR Code generation, notifications, and helpers
 */

/**
 * Generate QR Code for blood bag
 * @param {string} bagId - Blood bag ID
 * @param {string} contractAddress - Contract address
 * @param {number} chainId - Chain ID
 * @returns {Promise<string>} - QR code data URL
 */
async function generateBagQRCode(bagId, contractAddress, chainId) {
    try {
        // QR code library will be loaded from CDN
        if (typeof QRCode === 'undefined') {
            console.error('QRCode library not loaded');
            return null;
        }

        const qrData = JSON.stringify({
            bagId,
            contractAddress,
            chainId,
            type: 'BloodBag',
            timestamp: Date.now()
        });

        const canvas = document.createElement('canvas');
        await QRCode.toCanvas(canvas, qrData, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });

        return canvas.toDataURL();
    } catch (error) {
        console.error('QR code generation error:', error);
        return null;
    }
}

/**
 * Download QR code as image
 * @param {string} dataUrl - QR code data URL
 * @param {string} fileName - File name for download
 */
function downloadQRCode(dataUrl, fileName = 'blood-bag-qr.png') {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    link.click();
}

/**
 * Show QR code in modal
 * @param {string} bagId - Blood bag ID
 * @param {string} qrDataUrl - QR code data URL
 */
function showQRCodeModal(bagId, qrDataUrl) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-qrcode mr-2"></i>QR Code: ${bagId}
                </h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body text-center">
                <img src="${qrDataUrl}" alt="QR Code" style="max-width: 100%;">
                <p class="text-sm text-gray-600 mt-4">
                    Scan this QR code to view blood bag details
                </p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                    Close
                </button>
                <button class="btn btn-primary" onclick="downloadQRCode('${qrDataUrl}', '${bagId}-qr.png')">
                    <i class="fas fa-download mr-2"></i>Download
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

/**
 * Show notification (browser notification if permitted)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, warning, info)
 */
async function showNotification(title, message, type = 'info') {
    // Try browser notification first
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: message,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'blood-chain',
            requireInteraction: type === 'error'
        });
    }

    // Also show in-app notification
    showInAppNotification(title, message, type);
}

/**
 * Request notification permission
 */
async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    }
    return Notification.permission === 'granted';
}

/**
 * Show in-app notification
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} type - Notification type
 */
function showInAppNotification(title, message, type = 'info') {
    const notification = document.createElement('div');
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };
    
    notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-4 rounded-lg shadow-xl z-50 slide-up`;
    notification.innerHTML = `
        <div class="flex items-start gap-3">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} text-2xl"></i>
            <div>
                <h4 class="font-bold">${title}</h4>
                <p class="text-sm">${message}</p>
            </div>
            <button onclick="this.closest('div').remove()" class="ml-4">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

/**
 * Format date/time
 * @param {number} timestamp - Unix timestamp
 * @returns {string}
 */
function formatDateTime(timestamp) {
    return new Date(timestamp * 1000).toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format address (shorten)
 * @param {string} address - Ethereum address
 * @returns {string}
 */
function formatAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Copy to clipboard
 * @param {string} text - Text to copy
 * @param {string} successMessage - Success message
 */
async function copyToClipboard(text, successMessage = 'Copied to clipboard!') {
    try {
        await navigator.clipboard.writeText(text);
        showInAppNotification('Copied', successMessage, 'success');
    } catch (error) {
        console.error('Copy failed:', error);
        showInAppNotification('Error', 'Failed to copy', 'error');
    }
}

/**
 * Export data to CSV
 * @param {Array} data - Array of objects
 * @param {string} fileName - File name
 */
function exportToCSV(data, fileName = 'blood-chain-export.csv') {
    if (!data || data.length === 0) {
        showInAppNotification('Error', 'No data to export', 'error');
        return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => JSON.stringify(row[header] || '')).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    showInAppNotification('Success', 'Data exported successfully', 'success');
}

/**
 * Generate report
 * @param {Object} stats - Statistics object
 * @returns {Object} - Report data
 */
function generateReport(stats) {
    const total = stats.total || 0;
    const spoiled = stats.spoiled || 0;
    const delivered = stats.delivered || 0;
    
    return {
        timestamp: new Date().toISOString(),
        totalBags: total,
        spoiledBags: spoiled,
        deliveredBags: delivered,
        inTransit: stats.inTransit || 0,
        registered: stats.registered || 0,
        spoilageRate: total > 0 ? ((spoiled / total) * 100).toFixed(2) + '%' : '0%',
        deliveryRate: total > 0 ? ((delivered / total) * 100).toFixed(2) + '%' : '0%'
    };
}

/**
 * Validate IPFS hash
 * @param {string} hash - IPFS hash to validate
 * @returns {boolean}
 */
function validateIPFSHash(hash) {
    if (!hash || typeof hash !== 'string') return false;
    
    // CIDv0: starts with "Qm", length 46
    if (hash.length === 46 && hash.startsWith('Qm')) {
        return true;
    }
    
    // CIDv1: starts with "b" or "z", length >= 59
    if (hash.length >= 59 && (hash.startsWith('b') || hash.startsWith('z'))) {
        return true;
    }
    
    return false;
}

/**
 * Check if temperature is safe
 * @param {number} temp - Temperature in Celsius
 * @returns {boolean}
 */
function isTemperatureSafe(temp) {
    return temp >= 2 && temp <= 6;
}

/**
 * Get temperature status with color
 * @param {number} temp - Temperature in Celsius
 * @returns {Object} - {status: string, class: string, icon: string}
 */
function getTemperatureStatus(temp) {
    if (temp >= 2 && temp <= 6) {
        return {
            status: 'Safe',
            class: 'temp-safe',
            icon: 'fa-check-circle'
        };
    } else if (temp > 6 && temp <= 8) {
        return {
            status: 'Warning',
            class: 'temp-warning',
            icon: 'fa-exclamation-triangle'
        };
    } else {
        return {
            status: 'Danger',
            class: 'temp-danger',
            icon: 'fa-times-circle'
        };
    }
}

/**
 * Calculate time remaining until expiry
 * @param {number} expiryTimestamp - Expiry timestamp
 * @returns {string}
 */
function getTimeRemaining(expiryTimestamp) {
    const now = Date.now() / 1000;
    const remaining = expiryTimestamp - now;
    
    if (remaining <= 0) {
        return 'Expired';
    }
    
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    
    if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ${hours}h`;
    } else {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
}

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function}
 */
function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

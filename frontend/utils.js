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
        const qrData = JSON.stringify({
            bagId,
            contractAddress,
            chainId,
            type: 'BloodBag',
            timestamp: Date.now()
        });

        // Create a temporary container
        const container = document.createElement('div');
        container.style.display = 'none';
        document.body.appendChild(container);

        // Generate QR code using QRCodeJS2
        const qr = new QRCode(container, {
            text: qrData,
            width: 300,
            height: 300,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });

        // Wait a bit for QR generation
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get the canvas element
        const canvas = container.querySelector('canvas');
        if (!canvas) {
            throw new Error('QR code canvas not generated');
        }

        const dataUrl = canvas.toDataURL();
        
        // Clean up
        document.body.removeChild(container);

        return dataUrl;
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

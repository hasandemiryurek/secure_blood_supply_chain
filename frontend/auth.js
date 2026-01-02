/**
 * Authentication Utility for Blood Cold Chain
 * Handles JWT token management and authentication
 */

const AUTH_API_URL = 'http://localhost:3000/api/auth';

class AuthService {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.accountIndex = localStorage.getItem('accountIndex');
    }

    /**
     * Login with account index and password
     * @param {number} accountIndex - Account index (0-4)
     * @param {string} password - User password
     * @returns {Promise<{success: boolean, token?: string, error?: string}>}
     */
    async login(accountIndex, password) {
        try {
            const response = await fetch(`${AUTH_API_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ accountIndex, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.token = data.token;
                this.accountIndex = accountIndex.toString();
                
                // Store in localStorage
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('accountIndex', accountIndex.toString());
                localStorage.setItem('tokenExpiry', Date.now() + (24 * 60 * 60 * 1000)); // 24 hours
                
                // Also set in sessionStorage for compatibility
                sessionStorage.setItem('isLoggedIn', 'true');
                sessionStorage.setItem('accountIndex', accountIndex.toString());
                
                return { success: true, token: data.token };
            } else {
                return { success: false, error: data.error || 'Login failed' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Logout user
     */
    logout() {
        this.token = null;
        this.accountIndex = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('accountIndex');
        localStorage.removeItem('tokenExpiry');
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('accountIndex');
    }

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        // Check sessionStorage first (simpler check)
        if (sessionStorage.getItem('isLoggedIn') === 'true') {
            return true;
        }
        
        // No valid auth found
        return false;
    }

    /**
     * Verify token with backend
     * @returns {Promise<boolean>}
     */
    async verifyToken() {
        if (!this.token) {
            return false;
        }

        try {
            const response = await fetch(`${AUTH_API_URL}/verify`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                this.logout();
                return false;
            }

            return true;
        } catch (error) {
            console.error('Token verification error:', error);
            return false;
        }
    }

    /**
     * Get authorization header for API requests
     * @returns {Object}
     */
    getAuthHeader() {
        return {
            'Authorization': `Bearer ${this.token}`
        };
    }

    /**
     * Get current account index
     * @returns {string|null}
     */
    getAccountIndex() {
        return this.accountIndex;
    }

    /**
     * Make authenticated API request
     * @param {string} url - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>}
     */
    async authenticatedFetch(url, options = {}) {
        if (!this.isAuthenticated()) {
            throw new Error('Not authenticated');
        }

        const headers = {
            ...options.headers,
            ...this.getAuthHeader()
        };

        return fetch(url, {
            ...options,
            headers
        });
    }
}

// Export singleton instance
const authService = new AuthService();

// Auto-check authentication on load
if (authService.isAuthenticated()) {
    authService.verifyToken().catch(() => {
        console.log('Token verification failed, please login again');
    });
}

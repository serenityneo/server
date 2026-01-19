import { UAParser } from 'ua-parser-js';

/**
 * Device Information Interface
 */
export interface DeviceInfo {
    browser: string;        // Ex: "Chrome 120.0"
    os: string;            // Ex: "Windows 10"
    device: string;        // Ex: "Desktop" ou "iPhone 14"
    fullDevice: string;    // Ex: "Chrome 120.0 sur Windows 10"
}

/**
 * Login Alert Details Interface
 */
export interface LoginAlertDetails {
    ip: string;
    device: string;
    browser: string;
    os: string;
    provider: string;      // ISP name
    location: string;      // City, Country
    time: string;          // Formatted date/time
}

/**
 * Parse User-Agent string to extract device information
 */
export function parseUserAgent(userAgent: string): DeviceInfo {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    const browser = result.browser.name
        ? `${result.browser.name} ${result.browser.version || ''}`.trim()
        : 'Navigateur inconnu';

    const os = result.os.name
        ? `${result.os.name} ${result.os.version || ''}`.trim()
        : 'Système inconnu';

    const device = result.device.type
        ? result.device.type === 'mobile' ? 'Mobile'
            : result.device.type === 'tablet' ? 'Tablette'
                : 'Ordinateur'
        : result.device.model || 'Ordinateur';

    const fullDevice = `${browser} sur ${os}`;

    return {
        browser,
        os,
        device,
        fullDevice
    };
}

/**
 * Get ISP and location from IP address (using ipapi.co free API)
 */
export async function getIPInfo(ip: string): Promise<{ provider: string; location: string }> {
    try {
        // Skip for localhost/private IPs
        if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return {
                provider: 'Réseau local',
                location: 'Local'
            };
        }

        const response = await fetch(`https://ipapi.co/${ip}/json/`, {
            headers: { 'User-Agent': 'Serenity-Neo-Banking' }
        });

        if (!response.ok) {
            throw new Error('IP lookup failed');
        }

        const data = await response.json();

        const provider = data.org || data.isp || 'Fournisseur inconnu';
        const location = data.city && data.country_name
            ? `${data.city}, ${data.country_name}`
            : data.country_name || 'Localisation inconnue';

        return { provider, location };
    } catch (error) {
        console.error('[IPInfo] Failed to fetch IP details:', error);
        return {
            provider: 'Fournisseur inconnu',
            location: 'Localisation inconnue'
        };
    }
}

/**
 * Format date/time for email display
 */
export function formatLoginTime(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Africa/Kinshasa' // RDC timezone
    }).format(date);
}

/**
 * Build complete login alert details
 */
export async function buildLoginAlertDetails(
    ip: string,
    userAgent: string
): Promise<LoginAlertDetails> {
    const deviceInfo = parseUserAgent(userAgent);
    const ipInfo = await getIPInfo(ip);
    const time = formatLoginTime();

    return {
        ip,
        device: deviceInfo.fullDevice,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        provider: ipInfo.provider,
        location: ipInfo.location,
        time
    };
}

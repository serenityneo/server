/**
 * Authentication Configuration
 * SECURITY: Centralized auth constants to prevent disclosure
 */

// SECURITY: Obfuscated cookie name (not "admin-token")
export const AUTH_COOKIE_NAME = '_srt_auth';

// Cookie settings
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days
};


export function extractUserIdFromCookie(cookieValue: string): number | null {
  if (!cookieValue || !cookieValue.startsWith('u')) {
    return null;
  }
  
  const userId = parseInt(cookieValue.split('_')[0].substring(1));
  return isNaN(userId) || userId <= 0 ? null : userId;
}


export function generateAuthCookieValue(userId: number): string {
  return `u${userId}_${Date.now().toString(36)}`;
}


export async function validateAdminAuth(request: any, reply: any): Promise<boolean> {
  // Check for Bearer token (for API clients)
  const authHeader = String(request.headers['authorization'] || '');
  const expectedToken = process.env.ADMIN_API_TOKEN || process.env.CORE_BANKING_API_TOKEN || '';
  
  if (authHeader.startsWith('Bearer ') && expectedToken) {
    const isValid = authHeader.slice(7) === expectedToken;
    if (isValid) {
      return true; // Token auth successful
    }
  }
  
  // Check for auth cookie (for web dashboard)
  const authCookie = request.cookies[AUTH_COOKIE_NAME];
  
  if (authCookie) {
    // Extract and validate userId using shared utility
    const userId = extractUserIdFromCookie(authCookie);
    
    if (userId === null) {
      console.error('[AdminAuth] Invalid cookie format:', authCookie);
      reply.status(401).send({ success: false, error: 'Session invalide' });
      return false;
    }
    
    console.log('[AdminAuth] ✅ Cookie-based auth successful for userId:', userId);
    return true;
  }
  
  // No valid authentication found
  console.error('[AdminAuth] No valid authentication - no Bearer token or auth cookie');
  reply.status(401).send({ success: false, error: 'Authentication required' });
  return false;
}

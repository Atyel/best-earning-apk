import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function getIPAddress() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const data = await response.json();
    return data.ip;
  } catch (e) {
    return 'unknown';
  }
}

export function generateDeviceId() {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    localStorage.setItem('device_id', id);
  }
  return id;
}

export async function detectAdBlock() {
  let isBlocked = false;

  // 1. DOM Check (Hidden Element)
  const ad = document.createElement('div');
  ad.innerHTML = '&nbsp;';
  ad.className = 'adsbox pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links';
  ad.style.height = '1px';
  ad.style.width = '1px';
  ad.style.position = 'absolute';
  ad.style.top = '-10000px';
  ad.style.left = '-10000px';
  document.body.appendChild(ad);
  
  // Wait for styles to apply
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    const style = window.getComputedStyle(ad);
    if (
      ad.offsetHeight === 0 || 
      ad.style.display === 'none' || 
      style.display === 'none' || 
      style.visibility === 'hidden'
    ) {
      isBlocked = true;
    }
  } catch (e) {
    isBlocked = true;
  }
  document.body.removeChild(ad);

  if (isBlocked) return true;

  // 2. Network Request Check (Fetch known ad script)
  try {
    const request = new Request(
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
      { method: 'HEAD', mode: 'no-cors' }
    );
    await fetch(request);
  } catch (e) {
    // If the request fails (e.g., net::ERR_BLOCKED_BY_CLIENT), it's likely an ad blocker
    isBlocked = true;
  }

  return isBlocked;
}

export async function detectVPN() {
  try {
    // 1. Timezone Mismatch Check (Fast & Local)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const date = new Date();
    const offset = date.getTimezoneOffset();
    
    // Heuristic: If timezone is UTC but offset is not 0, it's suspicious
    // (Most VPNs default to UTC)
    if (timezone === 'UTC' && offset !== 0) return true;

    // 2. Network Check with multiple providers for redundancy
    const providers = [
      'https://ipapi.co/json/',
      'https://ip-api.com/json/?fields=status,message,proxy,hosting,org,as',
      'https://api.ipify.org?format=json' // Fallback for IP only
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    try {
      // Try ipapi.co first (more detailed)
      try {
        const response = await fetch(providers[0], { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          const org = (data.org || '').toLowerCase();
          const asn = (data.asn || '').toLowerCase();
          const suspiciousKeywords = ['vpn', 'proxy', 'hosting', 'cloud', 'datacenter', 'tor', 'exit node', 'm247', 'ovh', 'digitalocean', 'linode', 'vultr'];
          if (suspiciousKeywords.some(keyword => org.includes(keyword) || asn.includes(keyword))) return true;
        }
      } catch (e) {
        // Silently ignore first failure and try next
      }

      // Try ip-api.com as fallback
      try {
        const response2 = await fetch(providers[1], { signal: controller.signal });
        if (response2.ok) {
          const data = await response2.json();
          if (data.proxy === true || data.hosting === true) return true;
          const org = (data.org || '').toLowerCase();
          const suspiciousKeywords = ['vpn', 'proxy', 'hosting', 'cloud', 'datacenter', 'tor', 'exit node'];
          if (suspiciousKeywords.some(keyword => org.includes(keyword))) return true;
        }
      } catch (e) {
        // Silently ignore second failure
      }
    } finally {
      clearTimeout(timeoutId);
    }

    return false;
  } catch (e) {
    // Fail open silently to not block legitimate users if network fails
    return false;
  }
}

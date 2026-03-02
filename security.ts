import { db } from '@/src/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type SecurityEvent = 'task_start' | 'task_complete' | 'task_fail' | 'app_background' | 'app_foreground' | 'suspicious_activity';

export class SecurityMonitor {
  private static instance: SecurityMonitor;
  private userId: string | null = null;
  private sessionStart: number;

  private constructor() {
    this.sessionStart = Date.now();
    // Visibility listener is now handled in MainApp to coordinate with timer
  }

  static getInstance(): SecurityMonitor {
    if (!SecurityMonitor.instance) {
      SecurityMonitor.instance = new SecurityMonitor();
    }
    return SecurityMonitor.instance;
  }

  setUserId(uid: string) {
    this.userId = uid;
  }

  // Removed setupVisibilityListener to avoid duplicate logs


  async logEvent(type: SecurityEvent, details: string, metadata: any = {}) {
    if (!this.userId) return;

    // Sanitize metadata to remove undefined values using JSON serialization
    // This is more robust than Object.entries filtering for nested objects
    const sanitizedMetadata = JSON.parse(JSON.stringify(metadata));

    try {
      await addDoc(collection(db, 'activities'), {
        userId: this.userId,
        type,
        details,
        metadata: sanitizedMetadata,
        timestamp: serverTimestamp(),
        deviceInfo: {
          userAgent: navigator.userAgent,
          screenResolution: `${window.screen.width}x${window.screen.height}`,
          language: navigator.language,
          platform: navigator.platform
        }
      });
    } catch (e) {
      console.error('Security log failed:', e);
    }
  }

  checkTaskValidity(startTime: number, requiredDuration: number): boolean {
    const elapsed = (Date.now() - startTime) / 1000;
    // Allow 2 seconds buffer for network latency and processing
    return elapsed >= (requiredDuration - 2);
  }
}

export const securityMonitor = SecurityMonitor.getInstance();

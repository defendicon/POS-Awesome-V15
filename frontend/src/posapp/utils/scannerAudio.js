/* global frappe */

/**
 * Scanner audio feedback utility
 * Provides audio cues for successful and failed barcode scans
 */

let scanAudioContext = null;

/**
 * Ensures an AudioContext is available for playing scan tones
 * @returns {AudioContext|null} The audio context or null if unavailable
 */
export function ensureScanAudioContext() {
    if (typeof window === "undefined") {
        return null;
    }

    if (!scanAudioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            return null;
        }
        scanAudioContext = new AudioContext();
    }

    if (scanAudioContext?.state === "suspended") {
        scanAudioContext.resume().catch(() => { });
    }

    return scanAudioContext;
}

/**
 * Plays an audio tone to indicate scan success or failure
 * @param {"success"|"error"} type - Type of scan result
 */
export function playScanTone(type = "success") {
    if (typeof window === "undefined") {
        return;
    }

    try {
        const ctx = ensureScanAudioContext();
        if (!ctx) {
            // Fallback to frappe sound
            if (frappe?.utils?.play_sound) {
                frappe.utils.play_sound(type === "success" ? "submit" : "error");
            }
            return;
        }

        const now = ctx.currentTime;
        const duration = type === "success" ? 0.16 : 0.35;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = type === "success" ? 880 : 220;
        gainNode.gain.setValueAtTime(type === "success" ? 0.18 : 0.28, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start(now);
        oscillator.stop(now + duration);
    } catch (error) {
        console.warn("Scan tone playback failed:", error);
        // Fallback to frappe sound
        if (frappe?.utils?.play_sound) {
            frappe.utils.play_sound(type === "success" ? "submit" : "error");
        }
    }
}

/**
 * Closes the audio context and releases resources
 */
export function closeScanAudioContext() {
    if (scanAudioContext) {
        try {
            scanAudioContext.close();
        } catch (error) {
            console.warn("Scan audio context close failed:", error);
        }
        scanAudioContext = null;
    }
}

// Kurzer Bestätigungston beim Erledigen, per Web Audio API erzeugt (keine Audiodatei nötig).

const STORAGE_KEY = 'kenny:complete-sound';

/** Fenster-Ereignis bei jedem abgespielten Ton (für Tests und mögliche weitere Rückmeldungen) */
export const COMPLETE_SOUND_EVENT = 'kenny:complete-sound';

export function soundEnabled(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) !== 'off';
	} catch {
		return true;
	}
}

export function setSoundEnabled(on: boolean) {
	try {
		localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
	} catch {
		// Speicher nicht verfügbar (z. B. privater Modus): Einstellung gilt nur bis zum Neuladen nicht
	}
}

let audio: AudioContext | null = null;

/** Zwei kurze, weich ausklingende Töne (C6 → G6), leise genug fürs Büro */
export function playComplete() {
	if (typeof window === 'undefined' || !soundEnabled()) return;
	window.dispatchEvent(new CustomEvent(COMPLETE_SOUND_EVENT));
	try {
		audio ??= new AudioContext();
		if (audio.state === 'suspended') void audio.resume();
		const now = audio.currentTime;
		for (const [frequency, offset] of [
			[1046.5, 0],
			[1567.98, 0.09]
		]) {
			const osc = audio.createOscillator();
			const gain = audio.createGain();
			osc.type = 'sine';
			osc.frequency.value = frequency;
			const start = now + offset;
			gain.gain.setValueAtTime(0.0001, start);
			gain.gain.exponentialRampToValueAtTime(0.12, start + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
			osc.connect(gain).connect(audio.destination);
			osc.start(start);
			osc.stop(start + 0.4);
		}
	} catch {
		// Kein Audio verfügbar: Die Aktion selbst ist trotzdem erledigt
	}
}

/** Ton abspielen, wenn ein Ticket durch die eigene Aktion erledigt wurde */
export function playIfCompleted(wasClosed: boolean, result: { closed: boolean } | null | undefined) {
	if (!wasClosed && result?.closed) playComplete();
}

const HISTORY_COOKIE = 'quizHistory';
const HISTORY_LIMIT = 5;
const MAX_COOKIE_VALUE_LENGTH = 3500;

export function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie =
        `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getCookie(name) {
    const key = encodeURIComponent(name) + '=';
    for (const part of document.cookie.split(';')) {
        const cookie = part.trim();
        if (cookie.startsWith(key)) {
            try {
                return decodeURIComponent(cookie.slice(key.length));
            } catch (error) {
                return null;
            }
        }
    }
    return null;
}

export function deleteCookie(name) {
    setCookie(name, '', -1);
}

function isValidEntry(e) {
    return e && typeof e === 'object' &&
        Number.isFinite(e.d) && typeof e.n === 'string' && typeof e.c === 'string' &&
        Number.isFinite(e.s) && Number.isFinite(e.k) && Number.isFinite(e.t);
}

export function loadHistory() {
    const raw = getCookie(HISTORY_COOKIE);
    if (!raw) return [];
    try {
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) {
            throw new Error('Історія має бути масивом');
        }
        return data.filter(isValidEntry).slice(0, HISTORY_LIMIT);
    } catch (error) {
        console.warn('Пошкоджена історія ігор, очищуємо:', error);
        deleteCookie(HISTORY_COOKIE);
        return [];
    }
}

export function addHistoryEntry(entry) {
    const history = [entry, ...loadHistory()].slice(0, HISTORY_LIMIT);
    while (history.length > 1 &&
           encodeURIComponent(JSON.stringify(history)).length > MAX_COOKIE_VALUE_LENGTH) {
        history.pop();
    }
    setCookie(HISTORY_COOKIE, JSON.stringify(history), 365);
    return history;
}

export function getBestScore(categoryId) {
    const value = Number(getCookie(`best_${categoryId}`));
    return Number.isFinite(value) && value > 0 ? value : 0;
}

export function setBestScore(categoryId, score) {
    setCookie(`best_${categoryId}`, String(score), 365);
}

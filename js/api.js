const loadingElement = document.getElementById('loading');
const errorElement = document.getElementById('error');

const isCategories = data =>
    Array.isArray(data) &&
    data.length > 0 &&
    data.every(c => c &&
        typeof c.id === 'string' &&
        typeof c.name === 'string' &&
        typeof c.file === 'string' &&
        Number.isFinite(c.timePerQuestion));

const isQuestions = data =>
    Array.isArray(data) &&
    data.every(q => q &&
        typeof q.text === 'string' &&
        Array.isArray(q.options) && q.options.length >= 2 &&
        Number.isInteger(q.correct) && q.correct >= 0 && q.correct < q.options.length &&
        Number.isFinite(q.points));

async function loadJSON(url, errorMessage, isValid) {
    errorElement.textContent = '';
    loadingElement.hidden = false;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Помилка HTTP: ${response.status}`);
        }
        const data = await response.json();
        if (isValid && !isValid(data)) {
            throw new Error('Некоректний формат файлу');
        }
        return data;
    } catch (error) {
        console.error(errorMessage, error);
        errorElement.textContent = errorMessage;
        return null;
    } finally {
        loadingElement.hidden = true;
    }
}

export function loadCategories() {
    return loadJSON(
        'data/categories.json',
        'Не вдалося завантажити список категорій. Перевірте з\'єднання й спробуйте ще раз.',
        isCategories
    );
}

export function loadQuestions(file) {
    return loadJSON(
        `data/${file}`,
        'Не вдалося завантажити питання цієї категорії. Перевірте з\'єднання й спробуйте ще раз.',
        isQuestions
    );
}

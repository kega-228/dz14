import {loadCategories, loadQuestions} from './api.js';
import {setCookie, getCookie, addHistoryEntry, getBestScore, setBestScore} from './storage.js';
import {Question, Quiz, Timer} from './quiz.js';

const $ = id => document.getElementById(id);

const screens = {start: $('startScreen'), quiz: $('quizScreen'), result: $('resultScreen')};

const retryButton = $('retryButton');

const startForm = $('startForm');
const nameInput = $('nameInput');
const categorySelect = $('categorySelect');
const questionCountInput = $('questionCountInput');
const fields = {name: nameInput, category: categorySelect, count: questionCountInput};
const errorEls = {name: $('nameError'), category: $('categoryError'), count: $('countError')};

const progressEl = $('progress');
const timerEl = $('timer');
const scoreEl = $('score');
const questionText = $('questionText');
const optionsContainer = $('optionsContainer');
const feedbackEl = $('feedback');

const LETTERS = 'A-Za-zА-ЩЬЮЯа-щьюяІіЇїЄєҐґ';
const NAME_RE = new RegExp(`^[${LETTERS} -]+$`);
const HAS_LETTER_RE = new RegExp(`[${LETTERS}]`);
const NEXT_QUESTION_DELAY = 1500;
const NAME_COOKIE = 'playerName';

let categories = [];
const questionsCache = new Map();
const touched = new Set();

let game = null;
let quiz = null;
let answered = false;
let nextTimeout = null;
let retryAction = null;
const timer = new Timer();

const getCategory = id => categories.find(c => c.id === id);

function shuffle(array) {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const pad = n => String(n).padStart(2, '0');

// ДД.ММ.РРРР ГГ:ХХ
function formatDate(timestamp) {
    const d = new Date(timestamp);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// хв:сек
function formatDuration(ms) {
    const total = Math.round(ms / 1000);
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function showScreen(name) {
    for (const [key, screen] of Object.entries(screens)) {
        screen.hidden = key !== name;
    }
}

function showRetry(action) {
    retryAction = action;
    retryButton.hidden = false;
}

function hideRetry() {
    retryAction = null;
    retryButton.hidden = true;
}

retryButton.addEventListener('click', () => {
    const action = retryAction;
    hideRetry();
    if (action) action();
});

function fillCategories() {
    categorySelect.replaceChildren(
        new Option('Оберіть категорію', ''),
        ...categories.map(c => new Option(c.name, c.id))
    );
}

async function initCategories() {
    hideRetry();
    const list = await loadCategories();
    if (list === null) {
        showRetry(initCategories);
        return;
    }
    categories = list;
    fillCategories();
}

function updateCountHint() {
    const questions = questionsCache.get(categorySelect.value);
    if (questions) {
        questionCountInput.max = questions.length;
        questionCountInput.placeholder = `Кількість питань (3–${questions.length})`;
    } else {
        questionCountInput.removeAttribute('max');
        questionCountInput.placeholder = 'Кількість питань';
    }
}

async function loadSelectedCategory() {
    hideRetry();
    const id = categorySelect.value;
    if (!id || questionsCache.has(id)) {
        updateCountHint();
        return;
    }
    const category = getCategory(id);
    const data = await loadQuestions(category.file);
    if (categorySelect.value !== id) return; // користувач уже обрав іншу категорію
    if (data === null) {
        showRetry(async () => {
            await loadSelectedCategory();
            renderErrors(getErrors());
        });
        return;
    }
    questionsCache.set(id, data);
    updateCountHint();
}

function getErrors() {
    const errors = {};

    const name = nameInput.value.trim();
    if (name.length < 2 || name.length > 20 || !NAME_RE.test(name) || !HAS_LETTER_RE.test(name)) {
        errors.name = 'Ім\'я має містити від 2 до 20 символів: лише літери (українські або латинські), пробіл і дефіс';
    }

    const categoryId = categorySelect.value;
    const questions = questionsCache.get(categoryId);
    if (!categoryId) {
        errors.category = 'Оберіть категорію';
    } else if (!questions) {
        errors.category = 'Питання цієї категорії ще не завантажені';
    }

    const raw = questionCountInput.value.trim();
    const count = Number(raw);
    if (raw === '' || !Number.isInteger(count)) {
        errors.count = 'Введіть ціле число питань';
    } else if (count < 3) {
        errors.count = questions
            ? `Кількість питань має бути від 3 до ${questions.length}`
            : 'Кількість питань має бути не менше 3';
    } else if (questions && count > questions.length) {
        errors.count = `Кількість питань має бути від 3 до ${questions.length}`;
    }

    return errors;
}

function renderErrors(errors, showAll = false) {
    for (const key of Object.keys(fields)) {
        const visible = (showAll || touched.has(key)) && errors[key];
        errorEls[key].textContent = visible ? errors[key] : '';
        fields[key].classList.toggle('invalid', Boolean(visible));
    }
}

startForm.addEventListener('input', (e) => {
    const key = e.target.dataset.field;
    if (!key) return;
    touched.add(key);
    renderErrors(getErrors());
});

categorySelect.addEventListener('change', async () => {
    touched.add('category');
    await loadSelectedCategory();
    renderErrors(getErrors());
});

startForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const errors = getErrors();
    renderErrors(errors, true);
    if (Object.keys(errors).length > 0) return;

    const playerName = nameInput.value.trim();
    setCookie(NAME_COOKIE, playerName, 30);

    game = {
        playerName,
        categoryId: categorySelect.value,
        count: Number(questionCountInput.value)
    };
    startGame();
});

function stopGame() {
    clearTimeout(nextTimeout);
    nextTimeout = null;
    timer.stop();
}

function startGame() {
    stopGame();
    const category = getCategory(game.categoryId);
    const pool = questionsCache.get(game.categoryId);

    const questions = shuffle(pool)
        .slice(0, game.count)
        .map(Question.fromData);

    quiz = new Quiz(questions, category.timePerQuestion);
    quiz.start();

    showScreen('quiz');
    showQuestion();
}

function showQuestion() {
    answered = false;
    timer.stop();

    const question = quiz.getCurrentQuestion();
    progressEl.textContent = `${quiz.currentQuestionIndex + 1} / ${quiz.questions.length}`;
    scoreEl.textContent = `Рахунок: ${quiz.score}`;
    feedbackEl.textContent = '';
    questionText.textContent = question.text;

    optionsContainer.replaceChildren(
        ...question.getShuffledOptions().map((text, i) => {
            const button = el('button', text, 'option');
            button.type = 'button';
            button.dataset.index = i;
            return button;
        })
    );

    timerEl.classList.remove('low');
    if (quiz.timePerQuestion > 0) {
        timer.start(
            quiz.timePerQuestion,
            seconds => {
                timerEl.textContent = `${seconds} с`;
                timerEl.classList.toggle('low', seconds <= 5);
            },
            () => finishAnswer(null)
        );
    } else {
        timerEl.textContent = '';
    }
}

optionsContainer.addEventListener('click', (e) => {
    const button = e.target.closest('.option');
    if (!button) return;
    finishAnswer(Number(button.dataset.index));
});

function finishAnswer(index) {
    if (answered) return;
    answered = true;

    const timeLeft = timer.remaining;
    timer.stop();

    const question = quiz.getCurrentQuestion();
    const correct = quiz.answer(index, timeLeft);
    const last = quiz.answers[quiz.answers.length - 1];

    const buttons = [...optionsContainer.querySelectorAll('.option')];
    buttons.forEach(b => { b.disabled = true; });

    buttons[question.getCorrectIndex()].classList.add('correct');
    if (Number.isInteger(index) && !correct) {
        buttons[index].classList.add('wrong');
    }

    if (index === null) {
        feedbackEl.textContent = 'Час вийшов';
    } else if (correct) {
        feedbackEl.textContent = last.bonus > 0
            ? `Правильно! +${last.points} і бонус за швидкість +${last.bonus}`
            : `Правильно! +${last.points}`;
    } else {
        feedbackEl.textContent = 'Неправильно';
    }
    scoreEl.textContent = `Рахунок: ${quiz.score}`;

    nextTimeout = setTimeout(() => {
        quiz.next();
        if (quiz.isFinished()) {
            showResult();
        } else {
            showQuestion();
        }
    }, NEXT_QUESTION_DELAY);
}

function showResult() {
    timer.stop();

    const result = quiz.getResult();
    const category = getCategory(game.categoryId);

    const previousBest = getBestScore(category.id);
    const isRecord = result.score > previousBest;
    if (isRecord) setBestScore(category.id, result.score);

    const history = addHistoryEntry({
        d: (quiz.finishedAt ?? new Date()).getTime(),
        n: game.playerName,
        c: category.name,
        s: result.score,
        k: result.correctCount,
        t: result.total
    });

    $('recordMessage').hidden = !isRecord;
    $('resultPlayer').textContent = game.playerName;
    $('resultCategory').textContent = category.name;
    $('resultScore').textContent = result.bonusTotal > 0
        ? `${result.score} (з них бонус ${result.bonusTotal})`
        : String(result.score);
    $('resultCorrect').textContent = `${result.correctCount} з ${result.total} (${result.percent}%)`;
    $('resultDuration').textContent = formatDuration(result.durationMs);
    $('bestScore').textContent =
        `Найкращий результат у категорії «${category.name}»: ${Math.max(previousBest, result.score)}`;

    $('reviewList').replaceChildren(
        ...result.details.map((d, i) => {
            const li = el('li', undefined, `review-item ${d.correct ? 'correct' : 'wrong'}`);
            li.append(
                el('h4', `${i + 1}. ${d.text}`),
                el('p', `Ваша відповідь: ${d.selectedText ?? 'немає (час вийшов)'}`),
                el('p', `Правильна відповідь: ${d.correctText}`),
                el('p', `Пояснення: ${d.explanation || '—'}`, 'explanation')
            );
            return li;
        })
    );

    $('historyBody').replaceChildren(
        ...history.map(h => {
            const tr = document.createElement('tr');
            [formatDate(h.d), h.n, h.c, h.s, `${h.k} з ${h.t}`].forEach(value => {
                tr.append(el('td', String(value)));
            });
            return tr;
        })
    );

    showScreen('result');
}

$('playAgainButton').addEventListener('click', startGame);

$('toStartButton').addEventListener('click', () => {
    stopGame();
    touched.clear();
    renderErrors({});
    showScreen('start');
});

const savedName = getCookie(NAME_COOKIE);
if (savedName) nameInput.value = savedName;

showScreen('start');
initCategories();

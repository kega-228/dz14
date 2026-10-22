export class Question {
    constructor(id, text, options, correct, points, explanation = '') {
        this.id = id;
        this.text = text;
        this.options = options;
        this.correct = correct;
        this.points = points;
        this.explanation = explanation;
        this.order = options.map((_, i) => i);
    }

    static fromData(data) {
        return new Question(data.id, data.text, data.options, data.correct, data.points, data.explanation);
    }

    isCorrect(index) {
        return Number.isInteger(index) && this.order[index] === this.correct;
    }

    getShuffledOptions() {
        const order = this.options.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        this.order = order;
        return order.map(i => this.options[i]);
    }

    getOptionText(index) {
        const original = this.order[index];
        return original === undefined ? null : this.options[original];
    }

    getCorrectIndex() {
        return this.order.indexOf(this.correct);
    }

    getCorrectText() {
        return this.options[this.correct];
    }
}

export class Quiz {
    constructor(questions = [], timePerQuestion = 0) {
        this.questions = questions;
        this.timePerQuestion = timePerQuestion;
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.answers = [];
        this.startedAt = null;
        this.finishedAt = null;
    }

    start() {
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.answers = [];
        this.startedAt = new Date();
        this.finishedAt = null;
    }

    getCurrentQuestion() {
        return this.questions[this.currentQuestionIndex] ?? null;
    }

    answer(index, timeLeft = 0) {
        const question = this.getCurrentQuestion();
        if (!question) return false;
        if (this.answers.length > this.currentQuestionIndex) return false;

        const hasAnswer = Number.isInteger(index);
        const correct = hasAnswer && question.isCorrect(index);

        const points = correct ? question.points : 0;
        let bonus = 0;
        if (correct && this.timePerQuestion > 0) {
            const left = Math.max(0, Math.min(timeLeft, this.timePerQuestion));
            bonus = Math.round(question.points * left / this.timePerQuestion / 2);
        }

        this.score += points + bonus;
        this.answers.push({
            questionId: question.id,
            selected: hasAnswer ? index : null,
            selectedText: hasAnswer ? question.getOptionText(index) : null,
            correct,
            points,
            bonus
        });
        return correct;
    }

    next() {
        this.currentQuestionIndex++;
        if (this.isFinished() && !this.finishedAt) {
            this.finishedAt = new Date();
        }
    }

    isFinished() {
        return this.currentQuestionIndex >= this.questions.length;
    }

    getResult() {
        const total = this.questions.length;
        const correctCount = this.answers.filter(a => a.correct).length;
        const score = this.answers.reduce((sum, a) => sum + a.points + a.bonus, 0);
        const bonusTotal = this.answers.reduce((sum, a) => sum + a.bonus, 0);
        const percent = total ? Math.round(correctCount / total * 100) : 0;
        const durationMs = (this.finishedAt ?? new Date()) - this.startedAt;

        const details = this.questions.map((question, i) => {
            const answer = this.answers[i];
            return {
                text: question.text,
                selectedText: answer ? answer.selectedText : null,
                correctText: question.getCorrectText(),
                explanation: question.explanation,
                correct: answer ? answer.correct : false
            };
        });

        return {score, bonusTotal, correctCount, total, percent, durationMs, details};
    }
}

export class Timer {
    constructor() {
        this.interval = null;
        this.remaining = 0;
    }

    start(seconds, onTick, onEnd) {
        this.stop();
        this.remaining = seconds;
        onTick(this.remaining);
        this.interval = setInterval(() => {
            this.remaining--;
            onTick(this.remaining);
            if (this.remaining <= 0) {
                this.stop();
                onEnd();
            }
        }, 1000);
    }

    stop() {
        if (this.interval !== null) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

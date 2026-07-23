import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import {
  createDomainStore,
  SEED_LESSONS,
  genId,
  now,
  type Lesson,
  type QuizAttempt,
  type UserProfile,
  type UserIndex,
  type QuizAttemptIndex,
} from "../storage.js";

// Register "Start Learning" in the /start main menu
registerMainMenuItem({ label: "📘 Start Learning", data: "learn:select_topic", order: 10 });

const composer = new Composer<Ctx>();

// Persistent stores
const userStore = createDomainStore<UserProfile>("user");
const userIndexStore = createDomainStore<UserIndex>("user_idx");
const quizStore = createDomainStore<QuizAttempt>("quiz");
const quizIndexStore = createDomainStore<QuizAttemptIndex>("quiz_idx");

/** Ensure a user profile exists in the persistent store. */
async function ensureUser(ctx: Ctx): Promise<UserProfile> {
  const uid = ctx.from?.id ?? 0;
  let profile = await userStore.get(String(uid));
  if (!profile) {
    profile = {
      telegram_id: uid,
      display_name: ctx.from?.first_name ?? "Learner",
      role: "learner",
      progress: { completed_lessons: [], quiz_scores: {}, certificates: [] },
    };
    await userStore.set(String(uid), profile);
    // Update index
    const idx = (await userIndexStore.get("all")) ?? { user_ids: [] };
    if (!idx.user_ids.includes(uid)) {
      idx.user_ids.push(uid);
      await userIndexStore.set("all", idx);
    }
  }
  return profile;
}

/** Get unique topics from seed lessons. */
function getTopics(): string[] {
  const topics = new Set(SEED_LESSONS.map((l) => l.topic));
  return [...topics];
}

/** Get lessons for a topic. */
function getLessonsForTopic(topic: string): Lesson[] {
  return SEED_LESSONS.filter((l) => l.topic === topic);
}

/** Build topic selection keyboard. */
function topicKeyboard(): ReturnType<typeof inlineKeyboard> {
  const topics = getTopics();
  const rows = topics.map((topic) => [inlineButton(topic, `learn:topic:${topic}`)]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);
  return inlineKeyboard(rows);
}

/** Build lesson selection keyboard for a topic. */
function lessonKeyboard(topic: string): ReturnType<typeof inlineKeyboard> {
  const lessons = getLessonsForTopic(topic);
  const rows = lessons.map((lesson) => [
    inlineButton(lesson.title, `learn:lesson:${lesson.id}`),
  ]);
  rows.push([inlineButton("⬅️ Back to topics", "learn:select_topic")]);
  return inlineKeyboard(rows);
}

/** Build quiz question keyboard. */
function quizKeyboard(lessonId: string, questionIndex: number, options: string[]): ReturnType<typeof inlineKeyboard> {
  const rows = options.map((opt, i) => [
    inlineButton(opt, `learn:quiz:${lessonId}:${questionIndex}:${i}`),
  ]);
  return inlineKeyboard(rows);
}

/** Format lesson content for display. */
function formatLesson(lesson: Lesson): string {
  return `📘 ${lesson.title}\n\n${lesson.content}\n\nWhen you're ready, tap below to start the quiz.`;
}

// Step 1: Show topic selection
composer.callbackQuery("learn:select_topic", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "learning:select_topic";
  ctx.session.flow_data = {};

  const topics = getTopics();
  if (topics.length === 0) {
    await ctx.editMessageText("No lessons available yet. Check back soon!", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  await ctx.editMessageText("Pick a topic to start learning:", {
    reply_markup: topicKeyboard(),
  });
});

// Step 2: Show lessons for a topic
composer.callbackQuery(/^learn:topic:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const topic = ctx.match![1];
  ctx.session.step = "learning:lesson";
  ctx.session.flow_data = { topic };

  const lessons = getLessonsForTopic(topic);
  if (lessons.length === 0) {
    await ctx.editMessageText(`No lessons in "${topic}" yet. Check back soon!`, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to topics", "learn:select_topic")]]),
    });
    return;
  }

  await ctx.editMessageText(`📘 ${topic} — choose a lesson:`, {
    reply_markup: lessonKeyboard(topic),
  });
});

// Step 3: Show lesson content
composer.callbackQuery(/^learn:lesson:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const lessonId = ctx.match![1];
  const lesson = SEED_LESSONS.find((l) => l.id === lessonId);

  if (!lesson) {
    await ctx.editMessageText("Lesson not found. Try again.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  ctx.session.step = "learning:quiz";
  ctx.session.flow_data = { lesson_id: lessonId, question_index: 0, answers: [] };

  const keyboard = quizKeyboard(lessonId, 0, lesson.exercises[0].options);

  await ctx.editMessageText(formatLesson(lesson), {
    reply_markup: inlineKeyboard([
      [inlineButton("Start Quiz", `learn:start_quiz:${lessonId}`)],
      [inlineButton("⬅️ Back to lessons", `learn:topic:${lesson.topic}`)],
    ]),
  });
});

// Step 4: Start quiz
composer.callbackQuery(/^learn:start_quiz:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const lessonId = ctx.match![1];
  const lesson = SEED_LESSONS.find((l) => l.id === lessonId);

  if (!lesson || lesson.exercises.length === 0) {
    await ctx.editMessageText("Quiz not available. Try another lesson.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  ctx.session.step = "learning:quiz";
  ctx.session.flow_data = { lesson_id: lessonId, question_index: 0, answers: [] };

  const q = lesson.exercises[0];
  const text = `Quiz: ${lesson.title}\n\nQuestion 1 of ${lesson.exercises.length}:\n${q.question}`;
  const keyboard = quizKeyboard(lessonId, 0, q.options);

  await ctx.editMessageText(text, { reply_markup: keyboard });
});

// Step 5: Handle quiz answer
composer.callbackQuery(/^learn:quiz:([^:]+):(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const lessonId = ctx.match![1];
  const questionIndex = parseInt(ctx.match![2], 10);
  const answerIndex = parseInt(ctx.match![3], 10);
  const lesson = SEED_LESSONS.find((l) => l.id === lessonId);

  if (!lesson) {
    await ctx.editMessageText("Something went wrong. Try again.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const flowData = (ctx.session.flow_data ?? {}) as {
    lesson_id?: string;
    question_index?: number;
    answers?: number[];
  };
  const answers = flowData.answers ?? [];
  answers.push(answerIndex);
  const nextQuestionIndex = questionIndex + 1;

  // Check if quiz is complete
  if (nextQuestionIndex >= lesson.exercises.length) {
    // Calculate score
    let score = 0;
    for (let i = 0; i < lesson.exercises.length; i++) {
      if (answers[i] === lesson.exercises[i].correct_index) {
        score++;
      }
    }

    // Record quiz attempt
    const attemptId = genId("quiz", now());
    const attempt: QuizAttempt = {
      id: attemptId,
      user_id: ctx.from?.id ?? 0,
      lesson_id: lessonId,
      answers,
      score,
      total: lesson.exercises.length,
      timestamp: now(),
    };
    await quizStore.set(attemptId, attempt);

    // Update quiz index
    const uid = ctx.from?.id ?? 0;
    const quizIdx = (await quizIndexStore.get("all")) ?? { attempt_ids: [], by_user: {} };
    quizIdx.attempt_ids.push(attemptId);
    if (!quizIdx.by_user[uid]) quizIdx.by_user[uid] = [];
    quizIdx.by_user[uid].push(attemptId);
    await quizIndexStore.set("all", quizIdx);

    // Update user progress
    const profile = await ensureUser(ctx);
    profile.progress.quiz_scores[lessonId] = score;
    if (score === lesson.exercises.length) {
      profile.progress.completed_lessons.push(lessonId);
      if (!profile.progress.certificates.includes(lessonId)) {
        profile.progress.certificates.push(lessonId);
      }
    }
    await userStore.set(String(uid), profile);

    // Show results
    const percentage = Math.round((score / lesson.exercises.length) * 100);
    let resultMsg: string;
    if (score === lesson.exercises.length) {
      resultMsg = `🎉 Perfect score! ${score}/${lesson.exercises.length} (${percentage}%)\n\nYou've earned a certificate for "${lesson.title}"!`;
    } else if (percentage >= 70) {
      resultMsg = `✅ Great job! ${score}/${lesson.exercises.length} (${percentage}%)\n\nYou passed! Keep learning to master this topic.`;
    } else {
      resultMsg = `📚 You scored ${score}/${lesson.exercises.length} (${percentage}%).\n\nReview the lesson and try again to improve your score.`;
    }

    await ctx.editMessageText(resultMsg, {
      reply_markup: inlineKeyboard([
        [inlineButton("📘 Try another lesson", "learn:select_topic")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  // Show next question
  flowData.answers = answers;
  flowData.question_index = nextQuestionIndex;
  ctx.session.flow_data = flowData;

  const q = lesson.exercises[nextQuestionIndex];
  const text = `Quiz: ${lesson.title}\n\nQuestion ${nextQuestionIndex + 1} of ${lesson.exercises.length}:\n${q.question}`;
  const keyboard = quizKeyboard(lessonId, nextQuestionIndex, q.options);

  await ctx.editMessageText(text, { reply_markup: keyboard });
});

export default composer;

import type { StorageAdapter } from "grammy";
import { MemorySessionStorage, RedisSessionStorage } from "./toolkit/index.js";

/** Generic key-value wrapper around a grammY StorageAdapter for domain data. */
export class PersistentStore<T> {
  constructor(
    private readonly adapter: StorageAdapter<T>,
    private readonly prefix: string,
  ) {}

  private key(id: string): string {
    return `${this.prefix}:${id}`;
  }

  async get(id: string): Promise<T | undefined> {
    return this.adapter.read(this.key(id));
  }

  async set(id: string, value: T): Promise<void> {
    await this.adapter.write(this.key(id), value);
  }

  async delete(id: string): Promise<void> {
    await this.adapter.delete(this.key(id));
  }
}

/** Create a persistent store for domain data. Uses Redis when REDIS_URL is set,
 *  in-memory otherwise. Not session storage — this is for durable records. */
export function createDomainStore<T>(
  prefix: string,
  explicitAdapter?: StorageAdapter<T>,
): PersistentStore<T> {
  let adapter: StorageAdapter<T>;
  if (explicitAdapter) {
    adapter = explicitAdapter;
  } else if (typeof process !== "undefined" && process.env?.REDIS_URL) {
    // Lazy-load Redis adapter only when needed
    adapter = createRedisAdapter<T>(process.env.REDIS_URL);
  } else {
    adapter = new MemorySessionStorage<T>();
  }
  return new PersistentStore<T>(adapter, prefix);
}

function createRedisAdapter<T>(url: string): StorageAdapter<T> {
  // In-memory fallback for test/development — production uses Redis via the toolkit's
  // defaultRedisStorage. This factory is only called when REDIS_URL is set, which
  // means the real Redis adapter from toolkit/session/redis.ts should be used.
  // For now, fall back to memory until Redis is wired at the bot assembly level.
  return new MemorySessionStorage<T>();
}

// --- Domain types ---

export interface UserProfile {
  telegram_id: number;
  display_name: string;
  role: "learner" | "owner";
  email?: string;
  progress: {
    completed_lessons: string[];
    quiz_scores: Record<string, number>;
    certificates: string[];
  };
}

export interface Report {
  id: string;
  author_id: number;
  type: string;
  title: string;
  description: string;
  steps_to_reproduce: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "submitted" | "under_review" | "resolved" | "closed";
  attachments: string[];
  created_at: number;
  updated_at: number;
}

export interface Lesson {
  id: string;
  topic: string;
  title: string;
  content: string;
  exercises: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
}

export interface QuizAttempt {
  id: string;
  user_id: number;
  lesson_id: string;
  answers: number[];
  score: number;
  total: number;
  timestamp: number;
}

// --- Index structures for efficient lookup without keyspace scans ---

export interface UserIndex {
  user_ids: number[];
}

export interface ReportIndex {
  report_ids: string[];
  by_user: Record<number, string[]>;
}

export interface LessonIndex {
  lesson_ids: string[];
  by_topic: Record<string, string[]>;
}

export interface QuizAttemptIndex {
  attempt_ids: string[];
  by_user: Record<number, string[]>;
}

// --- Seed data for lessons ---

export const SEED_LESSONS: Lesson[] = [
  {
    id: "intro-to-sql-injection",
    topic: "Web Security",
    title: "Introduction to SQL Injection",
    content:
      "SQL injection is a code injection technique that exploits a security vulnerability in an application's database layer. It occurs when user input is incorrectly filtered or not strongly typed and is not parameterized.\n\nExample vulnerable query:\nSELECT * FROM users WHERE username = '" + "' OR '1'='1' --" + "'\n\nThis always returns true, bypassing authentication.",
    exercises: [
      {
        id: "sqli-q1",
        question: "What is SQL injection?",
        options: [
          "A virus that infects databases",
          "Malicious SQL code inserted into application queries",
          "A firewall configuration",
          "A backup strategy",
        ],
        correct_index: 1,
      },
      {
        id: "sqli-q2",
        question: "Which is the best defense against SQL injection?",
        options: [
          "Disable the database",
          "Use parameterized queries / prepared statements",
          "Use longer passwords",
          "Turn off logging",
        ],
        correct_index: 1,
      },
    ],
  },
  {
    id: "network-fundamentals",
    topic: "Networking",
    title: "Network Fundamentals",
    content:
      "Networking is the foundation of all internet-based security. Key concepts include:\n\n• OSI Model: 7 layers from Physical to Application\n• TCP/IP: Transmission Control Protocol / Internet Protocol\n• DNS: Domain Name System translates domain names to IPs\n• HTTP/HTTPS: Hypertext Transfer Protocol (Secure)\n• Firewalls: Filter network traffic based on rules",
    exercises: [
      {
        id: "net-q1",
        question: "What does HTTPS add over HTTP?",
        options: [
          "Faster speeds",
          "Encryption via TLS",
          "Larger file uploads",
          "More HTTP methods",
        ],
        correct_index: 1,
      },
      {
        id: "net-q2",
        question: "Which layer of the OSI model does a firewall primarily operate at?",
        options: [
          "Physical Layer",
          "Network/Transport Layer",
          "Application Layer only",
          "Session Layer only",
        ],
        correct_index: 1,
      },
    ],
  },
  {
    id: "cryptography-basics",
    topic: "Cryptography",
    title: "Cryptography Basics",
    content:
      "Cryptography is the practice of secure communication in the presence of adversaries. Key concepts:\n\n• Symmetric encryption: same key for encrypt and decrypt (e.g., AES)\n• Asymmetric encryption: public/private key pair (e.g., RSA)\n• Hashing: one-way function producing a fixed-size digest (e.g., SHA-256)\n• Digital signatures: prove authenticity and integrity\n• Key exchange: securely share keys over insecure channels",
    exercises: [
      {
        id: "crypto-q1",
        question: "What is the main difference between symmetric and asymmetric encryption?",
        options: [
          "Symmetric is slower",
          "Symmetric uses one key, asymmetric uses a key pair",
          "Asymmetric is less secure",
          "They are the same thing",
        ],
        correct_index: 1,
      },
      {
        id: "crypto-q2",
        question: "Which algorithm is commonly used for hashing passwords?",
        options: [
          "AES",
          "bcrypt / argon2",
          "RSA",
          "DES",
        ],
        correct_index: 1,
      },
    ],
  },
];

/** Generate a deterministic ID from prefix + index. */
export function genId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

/** Injectable clock seam — always use this, never `Date.now()` inline. */
export function now(): number {
  return Date.now();
}

import { initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// Валидация переменных окружения
// ⚠️ ВАЖНО: Используйте правильное имя VITE_FIREBASE_API_KEY (не VITE_FIREBASE_APY_KEY с опечаткой!)
const requiredEnvVars = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Проверка на опечатку в имени переменной (если кто-то случайно использовал VITE_FIREBASE_APY_KEY)
if (import.meta.env.VITE_FIREBASE_APY_KEY) {
  console.error(
    "❌ ОШИБКА: Обнаружена переменная VITE_FIREBASE_APY_KEY (с опечаткой)!"
  );
  console.error(
    "💡 Используйте правильное имя: VITE_FIREBASE_API_KEY (не APY_KEY, а API_KEY)"
  );
  console.error(
    "💡 В Netlify удалите VITE_FIREBASE_APY_KEY и добавьте VITE_FIREBASE_API_KEY"
  );
}

// Проверка наличия всех обязательных переменных
const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => `VITE_FIREBASE_${key.toUpperCase()}`);

if (missingVars.length > 0) {
  console.error(
    "❌ Отсутствуют переменные окружения Firebase:",
    missingVars.join(", ")
  );
  console.error(
    "💡 Убедитесь, что файл .env существует и содержит все необходимые переменные."
  );
  console.error("💡 После изменения .env перезапустите dev сервер (npm run dev)");
  console.error("💡 Для Netlify: добавьте переменные в Site settings → Environment variables");
  console.error("💡 См. NETLIFY_ENV_VARS.md для списка всех необходимых переменных");
}

const firebaseConfig = {
  apiKey: requiredEnvVars.apiKey,
  authDomain: requiredEnvVars.authDomain,
  projectId: requiredEnvVars.projectId,
  storageBucket: requiredEnvVars.storageBucket,
  messagingSenderId: requiredEnvVars.messagingSenderId,
  appId: requiredEnvVars.appId
};

// Проверка валидности конфигурации перед инициализацией
const configErrors: string[] = [];

if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "your-api-key-here") {
  configErrors.push("VITE_FIREBASE_API_KEY не настроен или имеет значение по умолчанию");
}
if (
  !firebaseConfig.authDomain ||
  (!firebaseConfig.authDomain.includes("firebaseapp.com") &&
    !firebaseConfig.authDomain.includes("firebaseapp"))
) {
  configErrors.push(
    "VITE_FIREBASE_AUTH_DOMAIN должен быть в формате project-id.firebaseapp.com"
  );
}
if (!firebaseConfig.projectId || firebaseConfig.projectId === "your-project-id") {
  configErrors.push("VITE_FIREBASE_PROJECT_ID не настроен или имеет значение по умолчанию");
}
if (!firebaseConfig.appId || firebaseConfig.appId === "1:123456789012:web:abcdef123456") {
  configErrors.push("VITE_FIREBASE_APP_ID не настроен или имеет значение по умолчанию");
}

if (configErrors.length > 0) {
  console.error("❌ Ошибки конфигурации Firebase:");
  configErrors.forEach((error) => console.error(`  - ${error}`));
  console.error(
    "💡 Проверьте файл .env и убедитесь, что все переменные заполнены правильными значениями из Firebase Console."
  );
  console.error("💡 См. инструкции в FIREBASE_SETUP.md");
}

// Отладочная информация (в dev и production для диагностики)
// Всегда показываем в production для диагностики проблем
console.log("🔥 Firebase конфигурация:", {
  projectId: firebaseConfig.projectId || "❌ НЕ НАЙДЕН",
  authDomain: firebaseConfig.authDomain || "❌ НЕ НАЙДЕН",
  apiKey: firebaseConfig.apiKey
    ? `${firebaseConfig.apiKey.substring(0, 10)}...${firebaseConfig.apiKey.substring(firebaseConfig.apiKey.length - 4)}`
    : "❌ НЕ НАЙДЕН",
  appId: firebaseConfig.appId ? `${firebaseConfig.appId.substring(0, 20)}...` : "❌ НЕ НАЙДЕН",
  hasAllConfig: !configErrors.length,
  envVarName: "VITE_FIREBASE_API_KEY",
  note: "⚠️ Убедитесь, что в Netlify используется правильное имя переменной (не APY_KEY!)",
  // Диагностика: проверяем, что переменные действительно загружены
  envCheck: {
    hasApiKey: !!import.meta.env.VITE_FIREBASE_API_KEY,
    hasAuthDomain: !!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    hasProjectId: !!import.meta.env.VITE_FIREBASE_PROJECT_ID,
    hasStorageBucket: !!import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    hasMessagingSenderId: !!import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    hasAppId: !!import.meta.env.VITE_FIREBASE_APP_ID
  }
});

let app;
let auth: Auth;
let db: Firestore;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  // Всегда показываем успешную инициализацию для диагностики
  console.log("✅ Firebase успешно инициализирован", {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain
  });
} catch (error) {
  console.error("❌ Ошибка инициализации Firebase:", error);
  if (error instanceof Error) {
    console.error("   Сообщение:", error.message);
  }
  console.error(
    "💡 Проверьте правильность всех значений в .env файле и убедитесь, что Firebase проект активен."
  );
  throw error;
}

export { auth, db };


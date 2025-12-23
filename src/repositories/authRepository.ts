import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
  type Unsubscribe
} from "firebase/auth";
import { auth } from "../services/firebase";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthRepository {
  signup: (data: AuthCredentials) => Promise<User>;
  login: (data: AuthCredentials) => Promise<User>;
  logout: () => Promise<void>;
  subscribe: (cb: (user: User | null) => void) => Unsubscribe;
}

// Функция для преобразования Firebase ошибок в понятные сообщения
const getFirebaseErrorMessage = (error: unknown): string => {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: string }).code;
    const message = (error as { message?: string }).message || "";
    
    // Логируем полную ошибку для отладки
    console.error("Firebase Auth ошибка:", { code, message, error });
    
    switch (code) {
      case "auth/invalid-api-key":
        return "Неверный API ключ Firebase. Проверьте настройки в .env файле или Netlify Environment Variables.";
      case "auth/unauthorized-domain":
        return "Домен не авторизован. Добавьте домен в Firebase Console → Authentication → Settings → Authorized domains. Для localhost добавьте 'localhost'.";
      case "auth/operation-not-allowed":
        return "Email/Password провайдер не включен. Включите его в Firebase Console → Authentication → Sign-in method → Email/Password → Enable.";
      case "auth/weak-password":
        return "Пароль слишком слабый. Используйте минимум 6 символов.";
      case "auth/email-already-in-use":
        return "Этот email уже зарегистрирован. Используйте другой email или войдите.";
      case "auth/user-not-found":
        return "Пользователь с таким email не найден. Проверьте email или зарегистрируйтесь.";
      case "auth/wrong-password":
        return "Неверный пароль. Проверьте правильность ввода.";
      case "auth/invalid-email":
        return "Неверный формат email. Введите корректный email адрес.";
      case "auth/too-many-requests":
        return "Слишком много попыток. Попробуйте позже или сбросьте пароль.";
      case "auth/network-request-failed":
        return "Ошибка сети. Проверьте подключение к интернету.";
      case "auth/invalid-credential":
        return "Неверный email или пароль. Проверьте правильность ввода.";
      case "auth/user-disabled":
        return "Аккаунт заблокирован. Обратитесь в поддержку.";
      default:
        // Пытаемся извлечь более детальную информацию из сообщения
        if (message) {
          return `Ошибка авторизации: ${message} (код: ${code})`;
        }
        return `Ошибка авторизации: ${code}. Проверьте настройки Firebase. См. FIREBASE_TROUBLESHOOTING.md`;
    }
  }
  
  // Если это не Firebase ошибка, но есть сообщение
  if (error instanceof Error) {
    console.error("Ошибка авторизации (не Firebase):", error);
    return error.message;
  }
  
  return "Неизвестная ошибка авторизации. Проверьте консоль браузера для деталей.";
};

export const authRepository: AuthRepository = {
  async signup({ email, password }) {
    try {
      const res = await createUserWithEmailAndPassword(auth, email, password);
      return res.user;
    } catch (error) {
      throw new Error(getFirebaseErrorMessage(error));
    }
  },
  async login({ email, password }) {
    try {
      const res = await signInWithEmailAndPassword(auth, email, password);
      return res.user;
    } catch (error) {
      throw new Error(getFirebaseErrorMessage(error));
    }
  },
  async logout() {
    await signOut(auth);
  },
  subscribe(callback) {
    return onAuthStateChanged(auth, callback);
  }
};


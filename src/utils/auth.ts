/**
 * Получает токен авторизации из Firebase Auth
 */
export async function getAuthToken(): Promise<string> {
  const { getAuth } = await import("firebase/auth");
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error("Пользователь не авторизован");
  }
  
  const token = await user.getIdToken();
  return token;
}



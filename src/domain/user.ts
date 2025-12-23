import { Timestamp } from "firebase/firestore";

export interface UserData {
  uid: string;
  email: string;
  displayName?: string;
  createdAt: Timestamp;
}

export const mapUserToUserData = (user: {
  uid: string;
  email: string | null;
  displayName: string | null;
  metadata?: { creationTime?: string };
}): UserData => {
  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? undefined,
    createdAt: user.metadata?.creationTime
      ? Timestamp.fromDate(new Date(user.metadata.creationTime))
      : Timestamp.now()
  };
};

export const isUserDataComplete = (data: UserData | null): data is UserData =>
  Boolean(data && data.uid && data.email);

